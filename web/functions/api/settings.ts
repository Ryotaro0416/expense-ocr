import { Env, json, isBackend } from '../_lib';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (!isBackend(ctx.request, ctx.env)) return json({ error: 'unauthorized' }, { status: 401 });
  const { results } = await ctx.env.DB.prepare(`SELECT key, value FROM settings`).all();
  const settings: Record<string, string> = {};
  for (const r of results as any[]) settings[r.key] = r.value || '';
  return json({ settings });
};
