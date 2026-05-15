import { Env, json, isBackend } from '../_lib';

interface RunBody {
  kind: 'receipts' | 'invoices';
  client_name: string;
  processed: number;
  failed: number;
  fatal_error?: string | null;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!isBackend(ctx.request, ctx.env)) return json({ error: 'unauthorized' }, { status: 401 });
  const body = await ctx.request.json<RunBody>();
  if (!body.kind || !body.client_name) return json({ error: 'bad request' }, { status: 400 });
  await ctx.env.DB.prepare(
    `INSERT INTO runs (kind, client_name, processed, failed, fatal_error) VALUES (?1, ?2, ?3, ?4, ?5)`,
  ).bind(
    body.kind,
    body.client_name,
    body.processed || 0,
    body.failed || 0,
    body.fatal_error || null,
  ).run();
  return json({ ok: true });
};
