import os
import json
import time
import base64
import datetime
import requests
from google.oauth2 import service_account
from googleapiclient.discovery import build

RECEIPTS_FOLDER_ID = '1CV4oTziO2tD5a3uOLOUl7J1OR6-gMv_p'
SHEET_ID = '1jfUMczdfXwecHFC7xa_BBzgsdZo7veC3kN_gFthAdRg'
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

    main_tab = ensure_tabs(sheets)
    seen = load_seen(sheets)
    files = list_images(drive, RECEIPTS_FOLDER_ID)

    new_rows = []
    seen_rows = []
    failures = []
    for f in files:
        if f['id'] in seen:
            continue
        try:
            data = extract(drive, f, os.environ['GEMINI_API_KEY'])
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
        append(sheets, f"'{main_tab}'!A:E", new_rows)
        append(sheets, f"'{PROCESSED_TAB}'!A:B", seen_rows)

    print(f"Processed {len(new_rows)} new file(s). Failures: {len(failures)}")
    for x in failures:
        print(f"  - {x}")

    notify(len(new_rows), failures)


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


def ensure_tabs(sheets):
    meta = sheets.spreadsheets().get(spreadsheetId=SHEET_ID).execute()
    titles = [s['properties']['title'] for s in meta['sheets']]
    main_tab = next((t for t in titles if t != PROCESSED_TAB), None)
    if main_tab is None:
        raise RuntimeError('No main tab found in spreadsheet')
    if PROCESSED_TAB not in titles:
        sheets.spreadsheets().batchUpdate(spreadsheetId=SHEET_ID, body={
            'requests': [{'addSheet': {'properties': {'title': PROCESSED_TAB}}}],
        }).execute()
        append(sheets, f"'{PROCESSED_TAB}'!A1", [['fileId', 'processedAt']])
    return main_tab


def load_seen(sheets):
    try:
        res = sheets.spreadsheets().values().get(
            spreadsheetId=SHEET_ID, range=f"'{PROCESSED_TAB}'!A2:A",
        ).execute()
    except Exception:
        return set()
    return {r[0] for r in res.get('values', []) if r}


def append(sheets, range_, values):
    sheets.spreadsheets().values().append(
        spreadsheetId=SHEET_ID,
        range=range_,
        valueInputOption='USER_ENTERED',
        body={'values': values},
    ).execute()


def notify(processed_count, failures):
    url = os.environ.get('DISCORD_WEBHOOK_URL')
    if not url or (processed_count == 0 and not failures):
        return
    msg = f"経費OCR: {processed_count}件処理"
    if failures:
        msg += f"\n失敗 {len(failures)}件:\n" + '\n'.join(f"- {x}" for x in failures[:5])
    try:
        requests.post(url, json={'content': msg}, timeout=10)
    except Exception as e:
        print(f"Discord notify failed: {e}")


if __name__ == '__main__':
    main()
