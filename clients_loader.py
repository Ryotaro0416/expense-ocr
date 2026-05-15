"""Client list loader + run summary reporter."""
import os
import yaml
import requests


def load_clients():
    backend_url = os.environ.get('BACKEND_URL', '').rstrip('/')
    backend_token = os.environ.get('BACKEND_TOKEN', '')
    if backend_url and backend_token:
        r = requests.get(
            f'{backend_url}/api/clients',
            headers={'authorization': f'Bearer {backend_token}'},
            timeout=15,
        )
        r.raise_for_status()
        return r.json()['clients']
    with open('clients.yml') as f:
        return yaml.safe_load(f)['clients']


def report_run(kind: str, client_name: str, processed: int, failed: int, fatal_error: str | None = None):
    backend_url = os.environ.get('BACKEND_URL', '').rstrip('/')
    backend_token = os.environ.get('BACKEND_TOKEN', '')
    if not (backend_url and backend_token):
        return
    try:
        requests.post(
            f'{backend_url}/api/runs',
            headers={'authorization': f'Bearer {backend_token}'},
            json={
                'kind': kind,
                'client_name': client_name,
                'processed': processed,
                'failed': failed,
                'fatal_error': fatal_error,
            },
            timeout=10,
        )
    except Exception as e:
        print(f"[report_run] failed: {e}")
