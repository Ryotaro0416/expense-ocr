"""One-off: remove PDF rows from the main sheet and _processed tab so they get re-OCR'd.
Keeps the JPG row (row 2) which was correct.
Run locally with the SA key:
  GCP_SA_KEY="$(cat ~/Downloads/keihi-494805-d829819fd764.json)" python reset_pdf_rows.py
"""
import os
import json
from google.oauth2 import service_account
from googleapiclient.discovery import build

SHEET_ID = '1jfUMczdfXwecHFC7xa_BBzgsdZo7veC3kN_gFthAdRg'
PROCESSED_TAB = '_processed'

creds = service_account.Credentials.from_service_account_info(
    json.loads(os.environ['GCP_SA_KEY']),
    scopes=['https://www.googleapis.com/auth/spreadsheets'],
)
sheets = build('sheets', 'v4', credentials=creds)

meta = sheets.spreadsheets().get(spreadsheetId=SHEET_ID).execute()
sheet_id_by_title = {s['properties']['title']: s['properties']['sheetId'] for s in meta['sheets']}
main_title = next(t for t in sheet_id_by_title if t != PROCESSED_TAB)

requests = [
    # Main: delete rows 3..20 (1-indexed), preserve row 1 header + row 2 JPG
    {'deleteDimension': {'range': {
        'sheetId': sheet_id_by_title[main_title],
        'dimension': 'ROWS',
        'startIndex': 2,
        'endIndex': 20,
    }}},
    # _processed: same — delete rows 3..20
    {'deleteDimension': {'range': {
        'sheetId': sheet_id_by_title[PROCESSED_TAB],
        'dimension': 'ROWS',
        'startIndex': 2,
        'endIndex': 20,
    }}},
]
sheets.spreadsheets().batchUpdate(spreadsheetId=SHEET_ID, body={'requests': requests}).execute()
print('Deleted PDF rows from both tabs.')
