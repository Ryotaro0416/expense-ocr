import { Env, json, safeEq } from '../_lib';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const auth = ctx.request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!safeEq(token, ctx.env.BACKEND_TOKEN)) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const { results } = await ctx.env.DB.prepare(
    `SELECT name, receipts_folder_id, receipts_sheet_id, invoices_folder_id, invoices_sheet_id
       FROM clients
      WHERE active = 1
      ORDER BY id ASC`,
  ).all();

  const clients = (results as any[]).map((r) => {
    const c: any = { name: r.name };
    if (r.receipts_folder_id && r.receipts_sheet_id) {
      c.receipts = { folder_id: r.receipts_folder_id, sheet_id: r.receipts_sheet_id };
    }
    if (r.invoices_folder_id && r.invoices_sheet_id) {
      c.invoices = { folder_id: r.invoices_folder_id, sheet_id: r.invoices_sheet_id };
    }
    return c;
  });

  return json({ clients });
};
