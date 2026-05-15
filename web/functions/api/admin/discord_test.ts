import { Env, json, isAdmin } from '../../_lib';

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!isAdmin(ctx.request, ctx.env)) return json({ error: 'unauthorized' }, { status: 401 });
  const body = await ctx.request.json<{ webhook_url?: string }>();
  let url = (body.webhook_url || '').trim();
  if (!url) {
    const row = await ctx.env.DB.prepare(`SELECT value FROM settings WHERE key='discord_webhook_url'`).first<any>();
    url = (row?.value || '').trim();
  }
  if (!url) return json({ error: 'webhook URL が未設定' }, { status: 400 });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: '経費OCR',
      content: '✅ テスト通知です — 管理画面の Discord 設定が正しく動作しています',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return json({ error: `Discord ${res.status}: ${text}` }, { status: 502 });
  }
  return json({ ok: true });
};
