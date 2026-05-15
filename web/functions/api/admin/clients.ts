import { Env, json, getRole, extractDriveFolderId, extractSheetId } from '../../_lib';

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
  private?: 0 | 1 | boolean;
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
  const role = getRole(ctx.request, ctx.env);
  if (!role) return json({ error: 'unauthorized' }, { status: 401 });
  const whereClause = role === 'owner' ? '' : 'WHERE private = 0';
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, name, contact, receipts_folder_id, receipts_sheet_id, invoices_folder_id, invoices_sheet_id, active, private, created_at
       FROM clients ${whereClause} ORDER BY id DESC`,
  ).all();
  return json({ clients: results, role });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const role = getRole(ctx.request, ctx.env);
  if (!role) return json({ error: 'unauthorized' }, { status: 401 });
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

  // private flag only the owner can set
  const isPrivate = role === 'owner' && (body.private === 1 || body.private === true) ? 1 : 0;

  await ctx.env.DB.prepare(
    `INSERT INTO clients (name, receipts_folder_id, receipts_sheet_id, invoices_folder_id, invoices_sheet_id, contact, private)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  ).bind(
    name,
    ids.receipts_folder_id,
    ids.receipts_sheet_id,
    ids.invoices_folder_id,
    ids.invoices_sheet_id,
    (body.contact || '').trim() || null,
    isPrivate,
  ).run();

  return json({ ok: true });
};

async function isPrivateRow(env: Env, id: number): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT private FROM clients WHERE id = ?1`).bind(id).first<any>();
  return !!row && row.private === 1;
}

export const onRequestPatch: PagesFunction<Env> = async (ctx) => {
  const role = getRole(ctx.request, ctx.env);
  if (!role) return json({ error: 'unauthorized' }, { status: 401 });
  const body = await ctx.request.json<ClientInput & { id?: number; active?: 0 | 1 }>();
  if (!body.id) return json({ error: 'id required' }, { status: 400 });

  // private row can only be edited by owner
  if (role !== 'owner' && await isPrivateRow(ctx.env, body.id)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  // active toggle only
  if ((body.active === 0 || body.active === 1) &&
      !body.name && !body.receipts_folder_url && !body.invoices_folder_url && !body.contact && body.private === undefined) {
    await ctx.env.DB.prepare(`UPDATE clients SET active = ?1 WHERE id = ?2`).bind(body.active, body.id).run();
    return json({ ok: true });
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
  // private flag only adjustable by owner
  let privateUpdate = '';
  let bindings: any[] = [name, (body.contact || '').trim() || null,
    ids.receipts_folder_id, ids.receipts_sheet_id, ids.invoices_folder_id, ids.invoices_sheet_id,
    active, body.id];
  if (role === 'owner' && body.private !== undefined) {
    privateUpdate = ', private = ?9';
    bindings = [...bindings.slice(0, 7), bindings[7], body.private === 1 || body.private === true ? 1 : 0];
    // re-order properly
    bindings = [name, (body.contact || '').trim() || null,
      ids.receipts_folder_id, ids.receipts_sheet_id, ids.invoices_folder_id, ids.invoices_sheet_id,
      active, body.id, body.private === 1 || body.private === true ? 1 : 0];
  }

  if (privateUpdate) {
    await ctx.env.DB.prepare(
      `UPDATE clients SET
         name = ?1, contact = ?2,
         receipts_folder_id = ?3, receipts_sheet_id = ?4,
         invoices_folder_id = ?5, invoices_sheet_id = ?6,
         active = ?7, private = ?9
       WHERE id = ?8`,
    ).bind(...bindings).run();
  } else {
    await ctx.env.DB.prepare(
      `UPDATE clients SET
         name = ?1, contact = ?2,
         receipts_folder_id = ?3, receipts_sheet_id = ?4,
         invoices_folder_id = ?5, invoices_sheet_id = ?6,
         active = ?7
       WHERE id = ?8`,
    ).bind(...bindings).run();
  }
  return json({ ok: true });
};

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const role = getRole(ctx.request, ctx.env);
  if (!role) return json({ error: 'unauthorized' }, { status: 401 });
  const body = await ctx.request.json<{ id: number }>();
  if (!body.id) return json({ error: 'id required' }, { status: 400 });
  if (role !== 'owner' && await isPrivateRow(ctx.env, body.id)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }
  await ctx.env.DB.prepare(`DELETE FROM clients WHERE id = ?1`).bind(body.id).run();
  return json({ ok: true });
};
