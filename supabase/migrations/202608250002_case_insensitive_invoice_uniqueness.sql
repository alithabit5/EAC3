create unique index if not exists shipments_invoice_no_lower_idx
  on public.shipments (lower(invoice_no));