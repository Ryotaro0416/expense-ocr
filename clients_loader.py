"""Load client list from Cloudflare Pages backend if configured, else clients.yml."""
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
