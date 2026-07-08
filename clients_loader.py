"""Client list loader, run summary reporter, settings + notification helpers."""
import os
import yaml
import requests


def _backend():
    url = os.environ.get('BACKEND_URL', '').rstrip('/')
    token = os.environ.get('BACKEND_TOKEN', '')
    return (url, token) if url and token else (None, None)


def load_clients():
    backend_url, backend_token = _backend()
    if backend_url:
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
    backend_url, backend_token = _backend()
    if not backend_url:
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


def load_settings() -> dict:
    """Fetch settings from backend; fall back to env-driven defaults."""
    backend_url, backend_token = _backend()
    if backend_url:
        try:
            r = requests.get(
                f'{backend_url}/api/settings',
                headers={'authorization': f'Bearer {backend_token}'},
                timeout=10,
            )
            r.raise_for_status()
            return r.json().get('settings', {})
        except Exception as e:
            print(f"[load_settings] failed: {e}")
    return {
        'discord_webhook_url': os.environ.get('DISCORD_WEBHOOK_URL', ''),
        'notify_on_success': '1',
        'notify_on_failure': '1',
    }


def notify_discord(title: str, summary):
    """Send Discord notification respecting settings flags.

    summary: list of (name, processed, fails_list)
    """
    settings = load_settings()
    url = (settings.get('discord_webhook_url') or os.environ.get('DISCORD_WEBHOOK_URL') or '').strip()
    if not url:
        return

    total_new = sum(n for _, n, _ in summary)
    total_fail = sum(len(fails) for _, _, fails in summary)
    if total_new == 0 and total_fail == 0:
        return
    has_failure = total_fail > 0
    notify_success = settings.get('notify_on_success', '1') == '1'
    notify_failure = settings.get('notify_on_failure', '1') == '1'
    if has_failure and not notify_failure:
        return
    if not has_failure and not notify_success:
        return

    icon = '⚠️' if has_failure else '✅'
    lines = [f"{icon} **{title}**: 計{total_new}件処理 / 失敗{total_fail}件"]
    for name, n, fails in summary:
        if n or fails:
            lines.append(f"- {name}: {n}件 (失敗{len(fails)})")
            for x in fails[:3]:
                lines.append(f"    · {x}")
    msg = '\n'.join(lines)
    try:
        requests.post(url, json={
            'content': msg,
            'username': '🧾 経費部隊',
            'avatar_url': 'https://raw.githubusercontent.com/Ryotaro0416/fleet-icons/main/expense.png',
        }, timeout=10)
    except Exception as e:
        print(f"Discord notify failed: {e}")
