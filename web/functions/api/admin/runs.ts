import { Env, json, isAdmin } from '../../_lib';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (!isAdmin(ctx.request, ctx.env)) return json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(ctx.request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, started_at, kind, client_name, processed, failed, fatal_error
       FROM runs ORDER BY id DESC LIMIT ?1`,
  ).bind(limit).all();
  return json({ runs: results });
};
