# Shared backend migration: cross-device sync for EAC3

**Status:** Approved for spec; Phase 1 implementation not yet started.
**Author:** Claude Code session, 2026-08-26.

## Problem

`Invoice.dc.html` and `Dashboard.dc.html` persist all business data to
browser `localStorage`. That storage is private to one browser on one
device. A shipment created or edited on a phone is invisible on a PC
(and vice versa) — not because of a bug, but because the two devices
have never shared a data store. Every "sync" fix built earlier in this
project (e.g. the Dashboard→Invoice field sync) only reconciled the two
pages *within a single device's local storage*; it did nothing for
cross-device visibility.

## Goals

- Shipments, invoices, money collections, pickup orders, packing
  materials/team issues, staff/HR records, and customer requests/CRM
  are visible and editable from any device, live (on page load/reload).
- Conflicting edits from two devices are caught, not silently lost.
- No separate "invoice record" vs "shipment record" — one row per
  shipment/invoice, read and written by both pages.

## Non-goals (explicitly out of scope)

- Revenue forecasting, Finance (P&L / balance sheet / overhead
  allocation), and Cash ledgers (Fazal / Office / Seif) stay on
  `localStorage`. Per the user, these are excluded from this project.
- Realtime push (Supabase Realtime subscriptions). V1 sync is
  "fetch fresh on page load, write immediately on save." A page left
  open won't see another device's edit until reloaded. This can be
  added later as an additive enhancement once the core migration is
  validated in daily use.
- Importing/reconciling each device's existing local data. Supabase
  starts empty; old local records stay in each browser's storage,
  untouched, but stop being the live source of truth once a device
  starts using the shared backend.

## Current state (verified)

- A real, live Supabase project ("EAC3", `wyeuvlcfdgwvzynlktyh`) is
  already connected. `supabase/migrations/202608250001_initial_schema.sql`
  defines `profiles`, `config_values`, `customers`, `batches`,
  `shipments`, `collections`, `orders`, `audit_events`, with RLS
  policies and an `is_admin()` helper. This migration is **applied** —
  `profiles` has all 7 staff accounts, `config_values` has 19 seeded
  rows. `shipments`/`collections`/`orders`/`batches`/`customers` all
  have **0 rows** — nothing has ever been written there.
- `supabase/client.js` (`window.eacSupabase`) and `supabase/data.js`
  (`window.eacData`, with `readShipments`/`readCollections`/
  `readOrders`/`createRecord`/`updateRecord`/`cancelRecord`, the last
  two using an optimistic-concurrency `version` column) are loaded by
  `Dashboard.dc.html` but **never called** — dead scaffolding.
  `Invoice.dc.html` doesn't load Supabase at all.
- Dashboard auth already works end-to-end (Supabase email/password,
  `profiles.role` gating `admin`/`collector` views). This migration
  doesn't need to touch auth, only wire real data calls through it.
- The existing `shipments` schema captures the Dashboard's shipment
  summary (sender/receiver, weight, cost, one composed
  `payment_method` string, `payment_status` enum) but has **no**
  columns for what `Invoice.dc.html` needs: line items, comments,
  discount, shipping method, bank receipt, luggage photo, signatures,
  or itemized multi-line payments with dates.
- Invoice numbers are currently generated from a **per-device local
  counter** (`localStorage[INVOICE_SEQ_KEY]` in `Invoice.dc.html`).
  Two devices will independently compute the same "next" invoice
  number. This must move server-side before invoice creation is
  multi-device-safe (see "Invoice numbering" below) — this is the one
  correctness issue in this migration that isn't just "read/write
  Supabase instead of localStorage."

## Architecture

Extend `window.eacData` (in `supabase/data.js`) into the single data
layer both pages use. No new abstraction — the module already exists,
already has the right shape (`read*`, `createRecord`, `updateRecord`
with `version` conflict checks, `cancelRecord` for soft-delete). Work
per migrated domain:

- `componentDidMount` (or Invoice.dc.html's equivalent) calls
  `eacData.read<Domain>()` instead of `localStorage.getItem` +
  `JSON.parse`.
- Every save/edit path calls `eacData.createRecord` / `updateRecord` /
  `cancelRecord` instead of `setState` + the existing `persist()` /
  `saveToHistory()` local-storage writers.
- `persist()` in `Dashboard.dc.html` stops writing the migrated slices
  to `localStorage` (they're now server-authoritative); it keeps
  writing the excluded domains (Revenue/Finance/Cash) exactly as
  today.
- Row Level Security (already enabled on every table) becomes the real
  authorization boundary instead of "whatever the client happens to
  send."

## Data model

### Phase 1: `shipments` (extended) + new `payments` table

Extend `public.shipments` with the invoice-only fields:

```sql
alter table public.shipments
  add column items jsonb not null default '[]'::jsonb,
  add column comments text not null default '',
  add column discount numeric(12, 3) not null default 0 check (discount >= 0),
  add column shipping_method text not null default '',
  add column final_destination text not null default '',
  add column air_rate numeric(12, 3),
  add column released_unpaid boolean not null default false,
  add column bank_receipt_path text,
  add column luggage_photo_path text,
  add column luggage_photo_expires_at timestamptz,
  add column office_signature text,
  add column customer_signature text,
  add column team_member_name text not null default '';
```

Notes:
- `items` as JSONB (not a child table): item rows are only ever edited
  as a unit, as part of saving the invoice — no independent
  per-item update path exists today. JSONB keeps this simple.
- `bank_receipt_path` / `luggage_photo_path` reference **Supabase
  Storage** objects, not base64 blobs. Today `Invoice.dc.html` stores
  full base64 data URIs directly in `localStorage`
  (`bankReceiptData`, `luggagePhotoData`) — that doesn't belong in a
  Postgres row. The schema already anticipated this pattern
  (`batches.document_path`, `shipments.document_path` both exist
  alongside a `_name` column). Two new storage buckets: `bank-receipts`,
  `luggage-photos`, both non-public, access via signed URLs.
  Office/customer signatures are small (canvas-drawn) — kept as data
  URIs in a text column is fine at that size.
- `office_signature` / `customer_signature`: base64 PNG data URI from
  the existing signature-pad canvases. Small enough (~few KB) that a
  text column is reasonable; revisit only if it becomes a problem.
- `mainDestination`/`destination` (shipment) vs `destination`/
  `finalDestination` (invoice form) currently name the same two
  concepts in opposite order (documented the hard way, during the
  Dashboard→Invoice sync fix). The Supabase column names follow the
  **shipment** convention (`destination` = main destination,
  `final_destination` = the finer-grained one) since that's the
  existing table; `eacData` is the one place that needs to know both
  pages' field names map onto these two columns.

New child table for itemized payments:

```sql
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  method text not null default '',
  amount numeric(12, 3) not null check (amount >= 0),
  date date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index payments_shipment_id_idx on public.payments(shipment_id);

alter table public.payments enable row level security;
create policy "authenticated users read payments" on public.payments
  for select to authenticated using (true);
create policy "authenticated users add payments" on public.payments
  for insert to authenticated with check (created_by = auth.uid());
create policy "authenticated users delete own payments" on public.payments
  for delete to authenticated using (created_by = auth.uid() or public.is_admin());
```

A payment line becomes its own row — add/remove a payment without
touching the parent shipment row or its `version`. `shipments.
payment_status` / `payment_method` (existing composed-string columns)
stay as **derived, denormalized summary fields**, recomputed by the
client from the current `payments` rows on every write (same
computation `Invoice.dc.html` already does locally today) — kept
because the Dashboard table/CSV export reads them directly and
recomputing via a join everywhere they're used isn't worth it yet.
`cost` and `weight` are the same pattern one level up: derived from
`items` on every write rather than being the source of truth
themselves, exactly as `Invoice.dc.html`'s `saveToHistory()` already
computes them from item rows today — the migration changes *where*
that computed value is written (Supabase instead of localStorage), not
the computation itself.

### Invoice numbering (must move server-side)

Replace the local `readSeq()`/`commitInvoiceNo()` counter with a
Postgres sequence:

```sql
create sequence public.invoice_seq start 1;
```

`Invoice.dc.html` calls a small RPC (`select
nextval('public.invoice_seq')`) to reserve a number when starting a
new invoice, instead of reading/writing a local counter. The existing
`unique(invoice_no)` constraint on `shipments` is the backstop if two
clients ever race anyway.

### Phase 2: Collections + Orders

Existing `collections` and `orders` tables already match the
Dashboard's field shapes closely (`collections.amount_due` ↔
Dashboard's `amount`; everything else is a near-direct rename). Wire
`eacData.readCollections`/`readOrders` in, add `createRecord`/
`updateRecord`/`cancelRecord` call sites in the Dashboard's collection
and order forms. No schema changes anticipated; confirm exact field
parity when this phase starts.

### Phase 3: Packing (new schema, to be finalized at implementation time)

Directional shape, from the current local fields:
- `packing_materials` (name, unit) — a catalog.
- `packing_purchases` (date, material, quantity, cost, warehouse).
- `packing_issues` (date, team_member, material, quantity, purpose,
  price, invoice_no, amount, photo_path, warehouse).
- `packing_transfers` (date, material, quantity, from_warehouse,
  to_warehouse).
- `packing_returns` (date, team_member, material, quantity,
  warehouse).
- `air_rates` (destination or type → rate).
- `packing_warehouses`, `packing_team` may fold into `config_values`
  (kinds already support arbitrary `kind` values) rather than new
  tables — decide when this phase starts.

### Phase 4: Staff / HR (new schema, extra RLS care — contains PII)

- `staff_records` (name, role, phone, address, salary, bank_name,
  account_no, contract_start/end, passport_no/expiry, visa_no/expiry,
  emergency contact, annual_leave_days). Salary and bank details are
  sensitive — RLS should restrict non-admins to *their own* record
  only (needs a way to link a staff record to an `auth.users` id,
  which doesn't exist yet in the local data — decide at
  implementation time whether staff log in individually or this stays
  admin-only-visible).
- `leave_entries` (staff_name or staff_id, type, from, to, days,
  status, notes).
- `company_docs` (type, holder, number, authority, issue/expiry dates,
  renewal cost, notes, file_path) — also referenced from
  `Administrator.dc.html`; confirm that page's needs are covered when
  this phase starts.

### Phase 5: Customer Requests / CRM (new schema)

- `customer_requests` (date, customer_name, customer_phone,
  service_type, zone, details, status).
- `churn_follow_up` — currently a lighter-weight tracking structure;
  shape TBD at implementation time.

## Sync strategy (all phases)

Fetch-on-load, write-on-save, no realtime:

1. Page mounts → `eacData.read<Domain>()` replaces the
   `localStorage.getItem` + `JSON.parse` currently in
   `componentDidMount`.
2. User edits and saves → `eacData.createRecord`/`updateRecord`
   replaces the local `setState` + `persist()` / `saveToHistory()`
   write.
3. `updateRecord`'s existing `version` check surfaces "This record was
   changed by another user. Reload and reapply your changes." on a
   real conflict — surface that error to the user rather than
   swallowing it (today's local code has no concept of this failing).
4. No background polling or subscriptions in V1. A page left open
   during someone else's edit shows stale data until reloaded — an
   accepted limitation, revisit only if it proves to matter in daily
   use.

## Testing strategy

- This sandbox has no Supabase auth credentials, so end-to-end UI
  testing (login → edit → save) isn't possible here the way it was
  for the earlier localStorage-only fixes. Two testing modes for
  implementation:
  - Direct `eacData` calls / SQL against the real "EAC3" project (via
    the connected Supabase MCP tools) to verify schema, RLS policies,
    and the data-layer functions work correctly, independent of the
    gated UI.
  - Headless-browser tests of the parts that don't require auth (page
    structure, form validation, client-side computations) — same
    approach used for the QR code and layout fixes earlier.
- Before considering Phase 1 done: create a shipment/invoice as one
  simulated "device" (via direct `eacData`/SQL calls), confirm it's
  readable via a second simulated fetch, confirm a version-conflict
  update is rejected with the expected error, confirm RLS blocks a
  `collector`-role read of another collector's cancelled record.

## Risks / open questions

- **Staff RLS model**: staff records currently have no link to an
  `auth.users` row (staff don't necessarily log in individually
  today). Restricting "own record only" needs that link designed
  before Phase 4 starts.
- **File uploads**: moving from base64-in-localStorage to Supabase
  Storage is a real (if mechanical) change to the upload/download
  code paths in `Invoice.dc.html` (bank receipt, luggage photo) —
  scope this explicitly in the Phase 1 implementation plan, don't
  treat it as a footnote.
- **`config_values` wiring**: destinations/locations/zones/team
  members already have a ready table; low risk, but touches dropdown
  logic used across almost every form in both pages — worth its own
  careful pass within Phase 1 rather than assuming it's trivial.
- **Team Member picker (Invoice.dc.html)**: once Invoice.dc.html gains
  real Supabase auth (needed for RLS `created_by`/`updated_by` to mean
  anything), the localStorage-based "Team Member" dropdown added
  earlier this session could be retired in favor of the authenticated
  user's own profile name — a cleanup opportunity, not a requirement,
  for Phase 1.
