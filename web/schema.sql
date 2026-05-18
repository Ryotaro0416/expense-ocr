CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  receipts_folder_id TEXT,
  receipts_sheet_id TEXT,
  invoices_folder_id TEXT,
  invoices_sheet_id TEXT,
  invoices_tab TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  contact TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_receipts_sheet ON clients(receipts_sheet_id) WHERE receipts_sheet_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_invoices_sheet_tab
  ON clients(invoices_sheet_id, COALESCE(invoices_tab, ''))
  WHERE invoices_sheet_id IS NOT NULL;
