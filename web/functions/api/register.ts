import { Env, json, extractDriveFolderId, extractSheetId, safeEq } from '../_lib';

interface Body {
  passcode?: string;
  name?: string;
  contact?: string;
  receipts_folder_url?: string;
  receipts_sheet_url?: string;
  invoices_folder_url?: string;
  invoices_sheet_url?: string;
  invoices_tab?: string;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let body: Body;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: 'invalid json' }, { status: 400 });
  }

  if (!safeEq(body.passcode, ctx.env.REGISTER_PASSCODE)) {
    return json({ error: 'パスコードが違います' }, { status: 401 });
  }

  const name = (body.name || '').trim();
  if (!name) return json({ error: 'クライアント名は必須です' }, { status: 400 });
  if (name.length > 60) return json({ error: 'クライアント名が長すぎます' }, { status: 400 });

  const receiptsFolder = extractDriveFolderId(body.receipts_folder_url || '');
  const receiptsSheet = extractSheetId(body.receipts_sheet_url || '');
  const invoicesFolder = extractDriveFolderId(body.invoices_folder_url || '');
  const invoicesSheet = extractSheetId(body.invoices_sheet_url || '');
  const invoicesTab = (body.invoices_tab || '').trim() || null;

  const hasReceipts = receiptsFolder && receiptsSheet;
  const hasInvoices = invoicesFolder && invoicesSheet;
  if (!hasReceipts && !hasInvoices) {
    return json({ error: '領収書または請求書のフォルダURL+シートURLを1組以上入力してください' }, { status: 400 });
  }
  if (body.receipts_folder_url && !receiptsFolder) return json({ error: '領収書フォルダURLが不正です' }, { status: 400 });
  if (body.receipts_sheet_url && !receiptsSheet) return json({ error: '領収書シートURLが不正です' }, { status: 400 });
  if (body.invoices_folder_url && !invoicesFolder) return json({ error: '請求書フォルダURLが不正です' }, { status: 400 });
  if (body.invoices_sheet_url && !invoicesSheet) return json({ error: '請求書シートURLが不正です' }, { status: 400 });
  if (invoicesTab && invoicesTab.length > 60) return json({ error: '請求書タブ名が長すぎます' }, { status: 400 });

  const dup = await ctx.env.DB.prepare(
    `SELECT id FROM clients WHERE
       (receipts_sheet_id IS NOT NULL AND receipts_sheet_id = ?1) OR
       (invoices_sheet_id IS NOT NULL AND invoices_sheet_id = ?2
         AND COALESCE(invoices_tab, '') = COALESCE(?3, ''))
     LIMIT 1`,
  ).bind(receiptsSheet, invoicesSheet, invoicesTab).first();
  if (dup) return json({ error: 'このシート(同じタブ名)はすでに登録済みです' }, { status: 409 });

  await ctx.env.DB.prepare(
    `INSERT INTO clients (name, receipts_folder_id, receipts_sheet_id, invoices_folder_id, invoices_sheet_id, invoices_tab, contact)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  ).bind(
    name,
    receiptsFolder,
    receiptsSheet,
    invoicesFolder,
    invoicesSheet,
    invoicesTab,
    (body.contact || '').trim() || null,
  ).run();

  return json({ ok: true });
};
