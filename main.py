import os
import json
import time
import base64
import datetime
import requests
from google.oauth2 import service_account
from googleapiclient.discovery import build
from clients_loader import load_clients, report_run

PROCESSED_TAB = '_processed'
GEMINI_MODEL = 'gemini-2.5-flash'
SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/spreadsheets',
]
JST = datetime.timezone(datetime.timedelta(hours=9))


def main():
    creds = service_account.Credentials.from_service_account_info(
        json.loads(os.environ['GCP_SA_KEY']), scopes=SCOPES,
    )
    drive = build('drive', 'v3', credentials=creds)
    sheets = build('sheets', 'v4', credentials=creds)
    api_key = os.environ['GEMINI_API_KEY']

    clients = load_clients()

    summary = []
    for c in clients:
        cfg = c.get('receipts')
        if not cfg:
            continue
        try:
            n, fails = run_for_client(drive, sheets, api_key, cfg['folder_id'], cfg['sheet_id'])
            summary.append((c['name'], n, fails))
            print(f"[{c['name']}] receipts: {n} new, {len(fails)} failed")
            for x in fails:
                print(f"  - {x}")
            report_run('receipts', c['name'], n, len(fails))
        except Exception as e:
            summary.append((c['name'], 0, [f"FATAL: {e}"]))
            print(f"[{c['name']}] FATAL: {e}")
            report_run('receipts', c['name'], 0, 0, fatal_error=str(e))

    notify(summary)


def run_for_client(drive, sheets, api_key, folder_id, sheet_id):
    main_tab = ensure_tabs(sheets, sheet_id)
    seen = load_seen(sheets, sheet_id)
    files = list_images(drive, folder_id)

    new_rows = []
    seen_rows = []
    failures = []
    for f in files:
        if f['id'] in seen:
            continue
        try:
            data = extract(drive, f, api_key)
            now = datetime.datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
            link = f"https://drive.google.com/file/d/{f['id']}/view"
            new_rows.append([
                data.get('date') or '',
                data.get('amount') if data.get('amount') is not None else '',
                data.get('store') or '',
                link,
                now,
            ])
            seen_rows.append([f['id'], now])
        except Exception as e:
            failures.append(f"{f['name']}: {e}")

    if new_rows:
        append(sheets, sheet_id, f"'{main_tab}'!A:E", new_rows)
        append(sheets, sheet_id, f"'{PROCESSED_TAB}'!A:B", seen_rows)

    return len(new_rows), failures


def list_images(drive, root_id):
    out = []
    stack = [root_id]
    while stack:
        fid = stack.pop()
        page_token = None
        while True:
            res = drive.files().list(
                q=f"'{fid}' in parents and trashed = false",
                fields='nextPageToken, files(id, name, mimeType)',
                pageToken=page_token,
                pageSize=200,
            ).execute()
            for f in res.get('files', []):
                if f['mimeType'] == 'application/vnd.google-apps.folder':
                    stack.append(f['id'])
                elif f['mimeType'] in ('image/jpeg', 'image/png', 'application/pdf'):
                    out.append(f)
            page_token = res.get('nextPageToken')
            if not page_token:
                break
    return out


def extract(drive, f, api_key):
    blob = drive.files().get_media(fileId=f['id']).execute()
    payload = {
        'contents': [{
            'parts': [
                {'inlineData': {'mimeType': f['mimeType'], 'data': base64.b64encode(blob).decode()}},
                {'text': 'この領収書/レシートから以下を抽出してJSON出力。\n- date: 日付(YYYY-MM-DD)。「決済日」「Settlement date」「ご利用日」「お支払い日」など決済が成立した日を最優先。なければ発行日や発生日。注文番号や注文日付と混同しないこと。\n- amount: 税込合計金額(整数のみ、カンマや円記号は除く)\n- store: 店名・事業者名\n読み取れない項目はnull。'},
            ],
        }],
        'generationConfig': {
            'responseMimeType': 'application/json',
            'responseSchema': {
                'type': 'object',
                'properties': {
                    'date': {'type': 'string'},
                    'amount': {'type': 'integer'},
                    'store': {'type': 'string'},
                },
            },
        },
    }
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}'
    last_err = None
    for attempt in range(4):
        r = requests.post(url, json=payload, timeout=60)
        if r.status_code < 500 and r.status_code != 429:
            break
        last_err = f'{r.status_code} {r.text[:200]}'
        time.sleep(2 ** attempt)
    else:
        raise RuntimeError(f'Gemini retried 4x, last: {last_err}')
    r.raise_for_status()
    text = r.json()['candidates'][0]['content']['parts'][0]['text']
    return json.loads(text)


def ensure_tabs(sheets, sheet_id):
    meta = sheets.spreadsheets().get(spreadsheetId=sheet_id).execute()
    titles = [s['properties']['title'] for s in meta['sheets']]
    main_tab = next((t for t in titles if t != PROCESSED_TAB), None)
    if main_tab is None:
        raise RuntimeError('No main tab found in spreadsheet')
    if PROCESSED_TAB not in titles:
        sheets.spreadsheets().batchUpdate(spreadsheetId=sheet_id, body={
            'requests': [{'addSheet': {'properties': {'title': PROCESSED_TAB}}}],
        }).execute()
        append(sheets, sheet_id, f"'{PROCESSED_TAB}'!A1", [['fileId', 'processedAt']])
    return main_tab


def load_seen(sheets, sheet_id):
    try:
        res = sheets.spreadsheets().values().get(
            spreadsheetId=sheet_id, range=f"'{PROCESSED_TAB}'!A2:A",
        ).execute()
    except Exception:
        return set()
    return {r[0] for r in res.get('values', []) if r}


def append(sheets, sheet_id, range_, values):
    sheets.spreadsheets().values().append(
        spreadsheetId=sheet_id,
        range=range_,
        valueInputOption='USER_ENTERED',
        body={'values': values},
    ).execute()


def notify(summary):
    url = os.environ.get('DISCORD_WEBHOOK_URL')
    if not url:
        return
    total_new = sum(n for _, n, _ in summary)
    total_fail = sum(len(fails) for _, _, fails in summary)
    if total_new == 0 and total_fail == 0:
        return
    lines = [f"経費OCR: 計{total_new}件処理 / 失敗{total_fail}件"]
    for name, n, fails in summary:
        if n or fails:
            lines.append(f"- {name}: {n}件 (失敗{len(fails)})")
            for x in fails[:3]:
                lines.append(f"    · {x}")
    msg = '\n'.join(lines)
    try:
        requests.post(url, json={'content': msg}, timeout=10)
    except Exception as e:
        print(f"Discord notify failed: {e}")


if __name__ == '__main__':
    main()
