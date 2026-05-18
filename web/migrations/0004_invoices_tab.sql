ALTER TABLE clients ADD COLUMN invoices_tab TEXT;
DROP INDEX IF EXISTS idx_clients_invoices_sheet;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_invoices_sheet_tab
  ON clients(invoices_sheet_id, COALESCE(invoices_tab, ''))
  WHERE invoices_sheet_id IS NOT NULL;
