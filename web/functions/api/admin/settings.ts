import { Env, json, isAdmin } from '../../_lib';

const KEYS = ['discord_webhook_url', 'notify_on_success', 'notify_on_failure'] as const;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (!isAdmin(ctx.request, ctx.env)) return json({ error: 'unauthorized' }, { status: 401 });
  const { results } = await ctx.env.DB.prepare(`SELECT key, value FROM settings`).all();
  const settings: Record<string, string> = {};
  for (const r of results as any[]) settings[r.key] = r.value || '';
  for (const k of KEYS) if (!(k in settings)) settings[k] = '';
  return json({ settings });
};

export const onRequestPatch: PagesFunction<Env> = async (ctx) => {
  if (!isAdmin(ctx.request, ctx.env)) return json({ error: 'unauthorized' }, { status: 401 });
  const body = await ctx.request.json<Record<string, string>>();

  const updates: { key: string; value: string }[] = [];
  for (const k of KEYS) {
    if (k in body) {
      let v = String(body[k] ?? '');
      if (k === 'discord_webhook_url') {
        v = v.trim();
        if (v && !/^https:\/\/(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\//.test(v)) {
          return json({ error: 'Discord webhook URL の形式が不正です' }, { status: 400 });
        }
      } else {
        v = v === '1' || v === 'true' || v === true ? '1' : '0';
      }
      updates.push({ key: k, value: v });
    }
  }
  for (const u of updates) {
    await ctx.env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    ).bind(u.key, u.value).run();
  }
  return json({ ok: true });
};
