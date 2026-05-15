import { Env, json, safeEq } from '../../_lib';

function checkAdmin(req: Request, env: Env): boolean {
  const headerKey = req.headers.get('x-admin-key') || '';
  const url = new URL(req.url);
  const queryKey = url.searchParams.get('key') || '';
  return safeEq(headerKey || queryKey, env.ADMIN_KEY);
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (!checkAdmin(ctx.request, ctx.env)) return json({ error: 'unauthorized' }, { status: 401 });
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, name, contact, receipts_folder_id, receipts_sheet_id, invoices_folder_id, invoices_sheet_id, active, created_at
       FROM clients ORDER BY id DESC`,
  ).all();
  return json({ clients: results });
};

export const onRequestPatch: PagesFunction<Env> = async (ctx) => {
  if (!checkAdmin(ctx.request, ctx.env)) return json({ error: 'unauthorized' }, { status: 401 });
  const body = await ctx.request.json<{ id: number; active?: 0 | 1 }>();
  if (!body.id || (body.active !== 0 && body.active !== 1)) {
    return json({ error: 'bad request' }, { status: 400 });
  }
  await ctx.env.DB.prepare(`UPDATE clients SET active = ?1 WHERE id = ?2`).bind(body.active, body.id).run();
  return json({ ok: true });
};

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  if (!checkAdmin(ctx.request, ctx.env)) return json({ error: 'unauthorized' }, { status: 401 });
  const body = await ctx.request.json<{ id: number }>();
  if (!body.id) return json({ error: 'bad request' }, { status: 400 });
  await ctx.env.DB.prepare(`DELETE FROM clients WHERE id = ?1`).bind(body.id).run();
  return json({ ok: true });
};
