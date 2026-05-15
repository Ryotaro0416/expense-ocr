import { Env, json, isAdmin, extractDriveFolderId, extractSheetId } from '../../_lib';

type ClientInput = {
  name?: string;
  contact?: string;
  receipts_folder_url?: string;
  receipts_sheet_url?: string;
  invoices_folder_url?: string;
  invoices_sheet_url?: string;
  receipts_folder_id?: string;
  receipts_sheet_id?: string;
  invoices_folder_id?: string;
  invoices_sheet_id?: string;
};

function resolveIds(b: ClientInput) {
  return {
    receipts_folder_id: b.receipts_folder_id ?? extractDriveFolderId(b.receipts_folder_url || ''),
    receipts_sheet_id: b.receipts_sheet_id ?? extractSheetId(b.receipts_sheet_url || ''),
    invoices_folder_id: b.invoices_folder_id ?? extractDriveFolderId(b.invoices_folder_url || ''),
    invoices_sheet_id: b.invoices_sheet_id ?? extractSheetId(b.invoices_sheet_url || ''),
  };
}

function validateUrls(b: ClientInput): string | null {
  if (b.receipts_folder_url && !extractDriveFolderId(b.receipts_folder_url)) return '領収書フォルダURLが不正です';
  if (b.receipts_sheet_url && !extractSheetId(b.receipts_sheet_url)) return '領収書シートURLが不正です';
  if (b.invoices_folder_url && !extractDriveFolderId(b.invoices_folder_url)) return '請求書フォルダURLが不正です';
  if (b.invoices_sheet_url && !extractSheetId(b.invoices_sheet_url)) return '請求書シートURLが不正です';
  return null;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (!isAdmin(ctx.request, ctx.env)) return json({ error: 'unauthorized' }, { status: 401 });
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, name, contact, receipts_folder_id, receipts_sheet_id, invoices_folder_id, invoices_sheet_id, active, created_at
       FROM clients ORDER BY id DESC`,
  ).all();
  return json({ clients: results });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!isAdmin(ctx.request, ctx.env)) return json({ error: 'unauthorized' }, { status: 401 });
  const body = await ctx.request.json<ClientInput>();
  const name = (body.name || '').trim();
  if (!name) return json({ error: 'クライアント名は必須です' }, { status: 400 });
  if (name.length > 60) return json({ error: 'クライアント名が長すぎます' }, { status: 400 });

  const urlErr = validateUrls(body);
  if (urlErr) return json({ error: urlErr }, { status: 400 });

  const ids = resolveIds(body);
  const hasReceipts = ids.receipts_folder_id && ids.receipts_sheet_id;
  const hasInvoices = ids.invoices_folder_id && ids.invoices_sheet_id;
  if (!hasReceipts && !hasInvoices) {
    return json({ error: '領収書または請求書のフォルダ+シートを1組以上入力してください' }, { status: 400 });
  }

  const dup = await ctx.env.DB.prepare(
    `SELECT id FROM clients WHERE
       (receipts_sheet_id IS NOT NULL AND receipts_sheet_id = ?1) OR
       (invoices_sheet_id IS NOT NULL AND invoices_sheet_id = ?2)
     LIMIT 1`,
  ).bind(ids.receipts_sheet_id, ids.invoices_sheet_id).first();
  if (dup) return json({ error: 'このシートはすでに登録済みです' }, { status: 409 });

  await ctx.env.DB.prepare(
    `INSERT INTO clients (name, receipts_folder_id, receipts_sheet_id, invoices_folder_id, invoices_sheet_id, contact)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  ).bind(
    name,
    ids.receipts_folder_id,
    ids.receipts_sheet_id,
    ids.invoices_folder_id,
    ids.invoices_sheet_id,
    (body.contact || '').trim() || null,
  ).run();

  return json({ ok: true });
};

export const onRequestPatch: PagesFunction<Env> = async (ctx) => {
  if (!isAdmin(ctx.request, ctx.env)) return json({ error: 'unauthorized' }, { status: 401 });
  const body = await ctx.request.json<ClientInput & { id?: number; active?: 0 | 1 }>();
  if (!body.id) return json({ error: 'id required' }, { status: 400 });

  // active toggle only
  if (body.active === 0 || body.active === 1) {
    if (!body.name && !body.receipts_folder_url && !body.invoices_folder_url && !body.contact) {
      await ctx.env.DB.prepare(`UPDATE clients SET active = ?1 WHERE id = ?2`).bind(body.active, body.id).run();
      return json({ ok: true });
    }
  }

  const name = (body.name || '').trim();
  if (!name) return json({ error: 'クライアント名は必須です' }, { status: 400 });
  const urlErr = validateUrls(body);
  if (urlErr) return json({ error: urlErr }, { status: 400 });

  const ids = resolveIds(body);
  const hasReceipts = ids.receipts_folder_id && ids.receipts_sheet_id;
  const hasInvoices = ids.invoices_folder_id && ids.invoices_sheet_id;
  if (!hasReceipts && !hasInvoices) {
    return json({ error: '領収書または請求書のフォルダ+シートを1組以上入力してください' }, { status: 400 });
  }

  const dup = await ctx.env.DB.prepare(
    `SELECT id FROM clients WHERE id != ?1 AND (
       (receipts_sheet_id IS NOT NULL AND receipts_sheet_id = ?2) OR
       (invoices_sheet_id IS NOT NULL AND invoices_sheet_id = ?3)
     ) LIMIT 1`,
  ).bind(body.id, ids.receipts_sheet_id, ids.invoices_sheet_id).first();
  if (dup) return json({ error: '同じシートが他のクライアントで登録されています' }, { status: 409 });

  const active = body.active === 0 || body.active === 1 ? body.active : 1;
  await ctx.env.DB.prepare(
    `UPDATE clients SET
       name = ?1, contact = ?2,
       receipts_folder_id = ?3, receipts_sheet_id = ?4,
       invoices_folder_id = ?5, invoices_sheet_id = ?6,
       active = ?7
     WHERE id = ?8`,
  ).bind(
    name,
    (body.contact || '').trim() || null,
    ids.receipts_folder_id,
    ids.receipts_sheet_id,
    ids.invoices_folder_id,
    ids.invoices_sheet_id,
    active,
    body.id,
  ).run();

  return json({ ok: true });
};

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  if (!isAdmin(ctx.request, ctx.env)) return json({ error: 'unauthorized' }, { status: 401 });
  const body = await ctx.request.json<{ id: number }>();
  if (!body.id) return json({ error: 'id required' }, { status: 400 });
  await ctx.env.DB.prepare(`DELETE FROM clients WHERE id = ?1`).bind(body.id).run();
  return json({ ok: true });
};
