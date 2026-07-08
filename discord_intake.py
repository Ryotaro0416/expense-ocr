#!/usr/bin/env python3
"""Discord「経費管理」チャンネルの領収書画像を読み取り、経費シートへ追記して返信する。

RECEIPT_CHANNEL_ID を巡回 → 画像添付の新着メッセージ → Gemini OCR → シート追記
→ Webフックで「✅ 読み取り: 日付 店名 ¥金額（科目）」と返信。
処理済みは経費シートの _discord_seen タブにメッセージIDを記録し、二度読みしない。
"""
import os
import json
import time
import base64
import datetime

import requests
from google.oauth2 import service_account
from googleapiclient.discovery import build

from clients_loader import load_clients
from categories import prompt_block as category_prompt, normalize as normalize_category, CATEGORY_NAMES

GEMINI_MODEL = 'gemini-2.5-flash'
JST = datetime.timezone(datetime.timedelta(hours=9))
PROCESSED_TAB = '_processed'
SEEN_TAB = '_discord_seen'
DISCORD_API = 'https://discord.com/api/v10'
AVATAR = 'https://raw.githubusercontent.com/Ryotaro0416/fleet-icons/main/expense.png'
IMG_EXT = ('.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif')


def sheets_service():
    creds = service_account.Credentials.from_service_account_info(
        json.loads(os.environ['GCP_SA_KEY']),
        scopes=['https://www.googleapis.com/auth/spreadsheets'])
    return build('sheets', 'v4', credentials=creds, cache_discovery=False)


def _titles(svc, sid):
    meta = svc.spreadsheets().get(spreadsheetId=sid).execute()
    return [s['properties']['title'] for s in meta['sheets']]


def main_tab(svc, sid):
    return next((t for t in _titles(svc, sid) if t not in (PROCESSED_TAB, SEEN_TAB)), None)


def ensure_seen_tab(svc, sid):
    if SEEN_TAB not in _titles(svc, sid):
        svc.spreadsheets().batchUpdate(spreadsheetId=sid, body={
            'requests': [{'addSheet': {'properties': {'title': SEEN_TAB}}}]}).execute()


def load_seen(svc, sid):
    try:
        vals = svc.spreadsheets().values().get(
            spreadsheetId=sid, range=f"'{SEEN_TAB}'!A:A").execute().get('values', [])
        return {r[0] for r in vals if r}
    except Exception:
        return set()


def append(svc, sid, rng, values):
    svc.spreadsheets().values().append(
        spreadsheetId=sid, range=rng, valueInputOption='USER_ENTERED',
        body={'values': values}).execute()


def gemini_ocr(blob, mime, api_key):
    payload = {
        'contents': [{'parts': [
            {'inlineData': {'mimeType': mime, 'data': base64.b64encode(blob).decode()}},
            {'text': (
                'この領収書/レシートから以下を抽出してJSON出力。\n'
                '- date: 日付(YYYY-MM-DD)。「決済日」「ご利用日」「お支払い日」など決済が成立した日を最優先。\n'
                '- amount: 税込合計金額(整数のみ、カンマや円記号は除く)\n'
                '- store: 店名・事業者名\n'
                '- category: 勘定科目 (下記から選ぶ)\n'
                '読み取れない項目はnull。\n\n' + category_prompt())},
        ]}],
        'generationConfig': {
            'responseMimeType': 'application/json',
            'responseSchema': {'type': 'object', 'properties': {
                'date': {'type': 'string'}, 'amount': {'type': 'integer'},
                'store': {'type': 'string'},
                'category': {'type': 'string', 'enum': CATEGORY_NAMES}}}},
    }
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}'
    last = None
    for attempt in range(4):
        r = requests.post(url, json=payload, timeout=60)
        if r.status_code < 500 and r.status_code != 429:
            break
        last = f'{r.status_code} {r.text[:150]}'
        time.sleep(2 ** attempt)
    r.raise_for_status()
    return json.loads(r.json()['candidates'][0]['content']['parts'][0]['text'])


def fetch_messages(channel_id, token, limit=50):
    r = requests.get(
        f'{DISCORD_API}/channels/{channel_id}/messages?limit={limit}',
        headers={'Authorization': f'Bot {token}', 'User-Agent': 'expense-intake/1.0'}, timeout=30)
    r.raise_for_status()
    return r.json()


def reply(webhook, text):
    if not webhook:
        return
    try:
        requests.post(webhook, json={'content': text, 'username': '🧾 経費部隊', 'avatar_url': AVATAR}, timeout=15)
    except Exception as e:
        print(f'reply failed: {e}')


def is_image(att):
    if (att.get('content_type') or '').lower().startswith('image/'):
        return True
    return (att.get('filename') or '').lower().endswith(IMG_EXT)


def main():
    token = os.environ['DISCORD_BOT_TOKEN']
    channel_id = os.environ['RECEIPT_CHANNEL_ID']
    webhook = os.environ.get('RECEIPT_REPLY_WEBHOOK', '')
    api_key = os.environ['GEMINI_API_KEY']

    client = next((c for c in load_clients() if c.get('receipts')), None)
    if not client:
        print('no receipts client'); return
    sid = client['receipts']['sheet_id']

    svc = sheets_service()
    ensure_seen_tab(svc, sid)
    tab = main_tab(svc, sid)
    seen = load_seen(svc, sid)

    msgs = list(reversed(fetch_messages(channel_id, token)))  # 古い順
    processed = 0
    for m in msgs:
        mid = m['id']
        if mid in seen:
            continue
        imgs = [a for a in m.get('attachments', []) if is_image(a)]
        if not imgs:
            continue
        for a in imgs:
            try:
                blob = requests.get(a['url'], timeout=60).content
                data = gemini_ocr(blob, a.get('content_type') or 'image/jpeg', api_key)
                now = datetime.datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
                cat = normalize_category(data.get('category'))
                append(svc, sid, f"'{tab}'!A:F", [[
                    data.get('date') or '',
                    data.get('amount') if data.get('amount') is not None else '',
                    data.get('store') or '', a['url'], now, cat,
                ]])
                amt = data.get('amount')
                amt_s = f"¥{int(amt):,}" if isinstance(amt, (int, float)) else '¥?'
                reply(webhook, f"✅ 読み取り: {data.get('date') or '?'} {data.get('store') or '?'} {amt_s}（{cat}）")
                processed += 1
            except Exception as e:
                reply(webhook, f"⚠️ 読み取り失敗: {a.get('filename', 'image')} — {str(e)[:120]}")
                print(f'fail {mid}: {e}')
        append(svc, sid, f"'{SEEN_TAB}'!A:B", [[mid, datetime.datetime.now(JST).isoformat()]])
        seen.add(mid)
    print(f'processed {processed} image(s) / scanned {len(msgs)} messages')


if __name__ == '__main__':
    main()
