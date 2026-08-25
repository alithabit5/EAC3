# Handoff: East Africa Cargo — Shipping Ops Dashboard

## Overview
An internal operations dashboard for a company shipping luggage/cargo from Oman to Tanzania, Zanzibar, Uganda, and Mombasa. It logs three kinds of activity — **Shipments** (Air Normal, Air Express, Sea Freight), **Money Collection** (cash/bank collection runs by field team members), and **Order** (pickup/visit requests for the field team) — and gives office staff an **Overview** with stats. All three activity types use a **batch** system so staff can group entries by shipping run / collection day and archive completed batches while rolling unfinished items forward.

**This is currently a fully working front-end-only prototype.** All data lives in the browser's `localStorage` (key `eac_dashboard_data_v1`) — there is no server, no database, no auth, and no multi-user sync. The task for this handoff is to give it a real backend so multiple staff (office in Oman, field team in Tanzania, etc.) can share one live dataset.

## About the Design Files
The bundled file (`Dashboard.dc.html`) is a **fully-functional HTML/React design reference** — it was built as a "Design Component" in a prototyping tool (inline styles, a custom templating syntax `{{ }}` / `<sc-for>` / `<sc-if>`, a `DCLogic` class-component base). **Do not ship this file as-is or try to run its custom tags in production.** The task is to **recreate this design and its exact behavior in your target stack** (React/Vue/Next.js/etc., whichever the codebase uses or whichever you judge best if starting fresh), replacing the localStorage persistence with real API calls to a backend + database, and adding authentication so different users see the same shared data.

## Fidelity
**High-fidelity.** Colors, spacing, copy, and every interaction described below are final — recreate pixel-for-pixel using your codebase's component/styling conventions. All inline styles in the HTML file are literal, exact values (hex/oklch colors, px sizes) — copy them.

## Recommended backend
Given the small team size and budget-consciousness discussed with the client, a **Supabase** (Postgres + Auth + Storage, generous free tier) or **Firebase** (Firestore + Auth + Storage) backend is recommended. Either fits the data model below directly. Storage (Supabase Storage / Firebase Storage) should replace the current base64-in-localStorage document attachments (see Assets section).

---

## Screens / Views

The app is a single page with a sticky header (logo + 4 tabs) and one active tab body at a time (`activeTab` state: `overview | shipments | collections | orders`).

### Header
- White background, `1px solid #E6E3DE` bottom border, sticky top.
- Left: 52×52px logo image (rounded 8px) + "East Africa Cargo" (20px, 700 weight, `#8C1D2E`) + subtitle "Oman → Tanzania, Zanzibar, Uganda & Mombasa · Shipping Dashboard" (12.5px, `#7A7A7C`).
- Right: 4 pill-style tab buttons in a `#F2F0EC` rounded-10px track. Active tab: `#8C1D2E` background, white text. Inactive: transparent background, `#6B6B6D` text. Labels: Overview, Shipments, Money Collection, Order.

### 1. Overview tab
- Grid of stat cards (white, `1px solid #E6E3DE`, 12px radius, `18px 20px` padding), `auto-fit minmax(190px,1fr)`:
  - Total Shipments (count)
  - Air Cargo (count + "N express" subtext)
  - Sea Freight (count)
  - Total Weight (kg, summed)
  - Shipment Revenue (OMR summed cost) + "OMR X pending" subtext (amber `#C08A2E`) — pending = any shipment whose `paymentStatus !== 'Paid'` (i.e. Partial or Not Paid)
  - Money Collected (OMR, sum of `amountCollected` for status=Collected entries) + pending subtext
  - Open Batches — shows current Sea/AirExpress/AirNormal batch labels e.g. "S2 · AE1 · AN3"
- Two-column row: "Shipments by Final Destination" (horizontal bar list, bars colored `#8C1D2E`) and "Shipments by Type" (bar list, bar color varies by type hue) + below it "Collections by Team Member" (list rows: name, total collected, collection count).
- Two-column row: "Recent Shipments" (last 5 by date, sender→receiver, destination · batch · date, status chip) and "Recent Collections" (last 5, collector·customer, location·date, amount + status chip).

### 2. Shipments tab
**Batch panel** (3 cards in a row, `auto-fit minmax(280px,1fr)`): Sea Freight Batch, Air Express Batch, Air Normal Batch. Each shows:
- Label (e.g. "S2") in `#8C1D2E`, 17px bold, plus a status chip ("Open"/"Closed", green oklch chip).
- "New Batch" button (outlined, `#8C1D2E`) — closes the current batch for that category (sets `status: 'Closed', endDate: today`) and opens the next sequential one (`S3`, `AE2`, etc.)
- Period label: `startDate → endDate|Ongoing`.
- **Sea Freight card only** additionally has: Date Loaded (date input), Container No. (text), BL No. (text) — tied to the active Sea batch record, editable inline.

**Add New Shipment** form (white card, `22px 24px` padding), grid `auto-fit minmax(200px,1fr)` gap 14px, fields in order:
Date, Invoice/Receipt No. (manual text), Sender Name (autocomplete via shared customer directory — see below), Sender Phone, Receiver Name (autocomplete), Receiver Phone, Location (select: Mabela / Amrat / Al Hail + "+ Add New Location" inline add flow), Main Destination (select: ZNZ / Dar / Pemba — fixed 3, no add-new), Final Destination (select: Singida / Kigoma / Uganda / Mombasa / Mwanza / Geita / Mbeya + add-new), Shipment Type (select: "Air - Normal Cargo" / "Air - Express Cargo" / "Sea Freight" — **this determines which of the 3 batch series the shipment is filed under**), Weight (kg, number), Collected By / Team (select from team roster: Fazal/Mussa/Abdul/Seif + add-new, shared with Money Collection & Order), Item/Luggage Description (text, spans 2 columns), Shipping Cost (OMR, number), Payment Method (select: "Paid by Bank" / "Paid by Cash" / "Free-released"), Payment Status (select: **Paid / Partial / Not Paid** — see Payment semantics below), Shipment Status (select: Booked / In Transit / Arrived / Delivered), Attach Document (file input, optional — one file per shipment, any type).
- Submit button reads "Add Shipment" normally, "Update Shipment" + a "Cancel" button appears when editing an existing row (see Edit/Delete below).
- Submit disabled until Sender Name, Receiver Name, Final Destination, and Type are filled.

**All Shipments table** (white card): header row has live count, filters (search sender/receiver, batch select — flattened list across all 3 categories, destination select, type select, status select, payment select: All/Paid/Pending — "Pending" bucket = Partial + Not Paid combined), Export to Excel button (CSV download, respects current filters).
- Below filters: two clickable pill chips "N Paid · OMR X" / "N Pending · OMR Y" (click toggles the payment filter to that bucket; active state = filled `#8C1D2E`-family background).
- Columns: Batch, Invoice No., Date, Sender (name+phone stacked), Receiver (name+phone stacked), Location, Main Dest., Final Dest., Type (colored chip), Team, Weight, Cost, Payment (status chip + payment-method subtext), Status (chip), Document (download link if attached), Actions (Edit / Delete — Edit repopulates the form above in "editing" mode; Delete asks `window.confirm` then removes the row).
- Empty state: "No shipments match these filters."

### 3. Money Collection tab
**Batch banner**: "Active Batch: MC{n} (Open/Closed)" + "Create New Batch" button (manual, same close-current/open-next pattern, prefix `MC`).
**Batch document row**: file input + filename link + Remove — **one document per batch** (not per row), tied to the currently active MC batch.
**Live totals bar** (3 stat blocks, updates instantly as amounts are typed): Total Collected, Total Due, Variance (Collected vs. Due) — computed from the *currently filtered* rows.

**Add Money Collection** form: Date, Team (select from shared roster + add-new), Customer Name (autocomplete), Customer Phone, Location (Zone A–E select + add-new — same zone list as Order), Amount Due (OMR), Status (Pending/Collected), Notes (optional). Submit/Update/Cancel behave like Shipments.

**All Collections table**: filters = search, date picker, batch select, status select, Export to Excel.
- Summary line: "N reconciled · M remaining".
- Columns: **Received** (checkbox — ticking sets status→Collected, unticking→Pending; this is the field team's daily reconciliation control), Batch, Date, Team, Customer, Phone, Location, **Amount Due**, **Amount Collected** (inline editable number input per row — this is the actual cash/bank amount the team reports, can be less than, equal to, or more than the Amount Due), **Variance** (auto: "+X over" in blue / "-X short" in red / "Exact" in green, blank until a collected amount is entered), Status (chip), Notes, Actions (Edit/Delete).

### 4. Order tab
**Batch banner**: "Active Batch: O{n} (status chip)" + two buttons: "Create New Batch" (manual, no side effects) and "Move Pending to Tomorrow" (closes current O-batch, opens next one dated tomorrow, and re-dates + re-batches every still-Pending order onto the new batch — this is the field team's end-of-day rollover action).
**Batch document row**: same pattern as Collections — one file per active Order batch.

**Add Order** form: Date, Team (select+add-new), Customer Name (autocomplete), Customer Phone, Location/Zone (select Zone A–E + add-new), Status (Pending/Completed), Notes. Submit/Update/Cancel as above.

**All Orders table**: filters = search, date, batch select, status select, Export to Excel.
- Summary line: "N collected · M remaining".
- Columns: **Collected** (checkbox, same pattern as Money Collection's Received checkbox — ticking = Completed), Batch, Date, Team, Customer, Phone, Zone, Status (chip), Notes, Actions (Edit/Delete).

---

## Interactions & Behavior

### Batches (core concept — 5 independent numbered series)
| Series | Prefix | Where |
|---|---|---|
| Sea Freight shipments | `S` | Shipments tab |
| Air Express shipments | `AE` | Shipments tab |
| Air Normal shipments | `AN` | Shipments tab |
| Money Collection | `MC` | Money Collection tab |
| Order | `O` | Order tab |

Each series is independent: `{id, number, label, status: 'Open'|'Closed', startDate, endDate}` (Sea batches additionally carry `dateLoaded, containerNo, blNo, documentName, documentData`; MC/O batches carry `documentName, documentData`). "New Batch" / "Create New Batch" always closes the current active batch (`status:'Closed', endDate: today`) and opens number+1 as the new active one. New records (shipment/collection/order) are stamped with the currently-active batch's id+label for their category at creation time and **keep that stamp even if the active batch later changes** (batch id/label is not reassigned on edit unless the record's own type/category changes — actually current behavior preserves the original batch on edit).

### Payment status semantics (Shipments only)
Three raw states: `Paid`, `Partial`, `Not Paid`. But filtering/reporting groups them into two buckets: **Paid** = only `Paid`; **Pending** = `Partial` + `Not Paid` combined. This affects: the Payment filter dropdown (2 bucket options, not 3), the two summary chips, and the Overview "pending revenue" stat.

### Reconciliation checkboxes (Collection "Received" / Order "Collected")
A simple toggle: checked ⇄ unchecked flips the record's `status` between its "done" value (`Collected`/`Completed`) and `Pending`. New collections/orders always start `Pending` (the morning list). Ticking one off during the day marks it done; the manager reconciles at day's end by ticking off what the team reports as done, leaving the rest `Pending` to roll into tomorrow.

### Amount Collected / Variance (Money Collection only)
`amount` = Amount Due (set at creation). `amountCollected` = actual cash/bank amount reported (editable inline per row, independent of Amount Due — can be blank until reconciled). Variance = `amountCollected - amount`, shown once a value is entered: positive = "over" (customer paid more / extra request same day), negative = "short" (customer paid less), zero = "Exact".

### Add-new inline flows (Team, Destination, Location, Zone)
Selects for Team Member, Final Destination, Location, and Zone all include a trailing `+ Add New …` option. Picking it reveals an inline text input + Add/Cancel buttons; confirming appends the new value to that list (deduped case-insensitively) and selects it in the form. These 4 lists (`teamMembers`, `destinations`, `locations`, `zones`) are shared globally across all tabs/forms that use them.

### Shared customer directory (autocomplete)
Every time a shipment (sender AND receiver), collection, or order is added/edited, the name+phone are upserted into a shared `customers: [{name, phone}]` list (deduped by name, case-insensitive; phone updates if changed). All "Name" fields across the 3 forms (`senderName`, `receiverName`, collection `customerName`, order `customerName`) use an HTML `<datalist>` bound to this list for autocomplete, and selecting/typing an exact existing name auto-fills that customer's phone number (only if the phone field is currently empty).

### Edit / Delete (all 3 record types)
Every table row has Edit + Delete. Edit loads that record's full data back into the form above (which flips to "editing" mode: button label becomes "Update X", a Cancel button appears). Delete prompts `window.confirm(...)` before removing.

### Filtering
Each table's filters combine with AND logic: text search (case-insensitive substring on name fields), exact-match selects (destination/type/status/batch/zone), and date filter (exact date match on the record's date field). "All Shipments (N)" / "All Collections (N)" / "All Orders (N)" counts reflect the currently filtered set.

### Export to Excel
Each table's "Export to Excel" button generates a CSV (UTF-8 with BOM for Excel compatibility) of the **currently filtered** rows and triggers a browser download — client-side only, no server round-trip. Column sets are documented per-table above.

### Document attachments
- Shipments: one optional file per shipment record, uploaded via a plain `<input type="file">`, currently read via `FileReader.readAsDataURL` and stored as a base64 data-URL string directly on the record (`documentName`, `documentData`). Shown as a download link in the table.
- Money Collection & Order: one file per **batch** (not per transaction) — same upload mechanism, stored on the active batch record, shown next to the batch banner.
- **This must change in the real backend**: base64-in-database does not scale. Replace with real object storage (Supabase Storage / Firebase Storage / S3) — upload the file, store only the resulting URL/path on the record.

---

## State Management (client-side prototype — replace with API-backed state)

Top-level state (single component in the prototype; break into whatever your framework's convention is):
```
activeTab: 'overview' | 'shipments' | 'collections' | 'orders'
shipments: Shipment[]
collections: Collection[]
orders: Order[]
newShipment / newCollection / newOrder: draft form objects (reset to defaults after submit)
shipFilters / colFilters / orderFilters: per-tab filter state
editingShipmentId / editingCollectionId / editingOrderId: string|null
customers: {name, phone}[]
destinations, locations, zones, teamMembers: string[] (shared config lists)
shipmentBatches: { Sea: Batch[], AirExpress: Batch[], AirNormal: Batch[] }
activeShipmentBatchId: { Sea, AirExpress, AirNormal }
collectionBatches: Batch[], activeCollectionBatchId
orderBatches: Batch[], activeOrderBatchId
```

### Data model
```ts
type Shipment = {
  id: string; batchId: string; batchLabel: string;
  date: string; invoiceNo: string;
  senderName: string; senderPhone: string;
  receiverName: string; receiverPhone: string;
  location: string; mainDestination: 'ZNZ'|'Dar'|'Pemba'; destination: string;
  type: 'Air - Normal Cargo' | 'Air - Express Cargo' | 'Sea Freight';
  weight: number; description: string; cost: number;
  paymentStatus: 'Paid' | 'Partial' | 'Not Paid'; paymentMethod: string;
  status: 'Booked' | 'In Transit' | 'Arrived' | 'Delivered';
  teamMember: string;
  documentName: string; documentData: string; // -> replace with storage URL
};

type Collection = {
  id: string; batchId: string; batchLabel: string;
  date: string; collectorName: string; customerName: string; customerPhone: string;
  location: string; // Zone A-E
  amount: number; amountCollected: number | '';
  status: 'Pending' | 'Collected'; notes: string;
};

type Order = {
  id: string; batchId: string; batchLabel: string;
  date: string; teamMember: string; customerName: string; customerPhone: string;
  zone: string; status: 'Pending' | 'Completed'; notes: string;
};

type Batch = {
  id: string; number: number; label: string; // e.g. "S3", "MC2", "O5"
  status: 'Open' | 'Closed'; startDate: string; endDate: string | null;
  // Sea-category shipment batches only:
  dateLoaded?: string; containerNo?: string; blNo?: string;
  // Collection/Order/Sea batches:
  documentName?: string; documentData?: string; // -> replace with storage URL
};
```

### Persistence (to replace)
Currently: every state change writes the whole `{shipments, collections, orders, shipmentBatches, activeShipmentBatchId, collectionBatches, activeCollectionBatchId, orderBatches, activeOrderBatchId, destinations, locations, zones, teamMembers, customers}` blob to `localStorage['eac_dashboard_data_v1']`, and reads it back on mount. **Replace with:** normal CRUD API calls per entity (shipments, collections, orders, batches, customers, config-lists table) against your database, with the config lists (destinations/locations/zones/teamMembers) likely as simple lookup tables editable by anyone, and standard auth so multiple users hit the same backend.

---

## Design Tokens
- **Primary (brand maroon)**: `#8C1D2E`
- **Ink (body text)**: `#2B2A29`
- **Muted labels**: `#8A8A8C`, `#6B6B6D`, `#9A9A9C`
- **Borders**: `#E6E3DE` (card), `#F5F3EF` / `#F0EEE9` (row dividers), `#DCD9D3` (inputs)
- **Backgrounds**: page `#F7F6F4`, cards `#FFFFFF`, pill-track `#F2F0EC`
- **Semantic chip colors** (all `oklch(L C H)`, background `oklch(0.94 0.05 H)` / text `oklch(0.4 0.13 H)`):
  - Hue 150 = success/green (Delivered, Paid, Collected, Completed)
  - Hue 80 = warning/amber (Pending, In Transit-adjacent)
  - Hue 200 = Arrived
  - Hue 235 = In Transit / Air Normal type chip / info-blue variance ("over")
  - Hue 260 = neutral (Booked)
  - Hue 25 = Not Paid / variance "short"
  - Hue 15 = Air Express type chip
  - Hue 190 = Sea Freight type chip
- **Typography**: system stack `-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif` throughout, no external font load. Headings 15–20px/700, body 13–13.5px, labels 11.5–12.5px/600 uppercase-tracked for stat card labels.
- **Radii**: cards 12px, buttons/inputs 7–8px, chips 20px (pill).
- **Spacing**: card padding 16–24px, grid gaps 14–16px.

## Assets
- `assets/logo.jpg` — East Africa Cargo logo (provided by the client), 280×242 JPEG. Used at 52×52px, `border-radius:8px`, `object-fit:contain`.
- All status/type "icons" are plain colored text chips — no icon library or custom SVGs are used anywhere in this design.

## Files
- `Dashboard.dc.html` — the complete design reference (template + logic class). This is the single source of truth for layout, copy, and behavior described above.
- `assets/logo.jpg` — logo asset referenced by the design.

---

# Production Hardening Requirements

The prototype defines the workflow correctly. The items below are what must be added when it goes live with real money and 15–20 concurrent users. They are not visible in the design files — they are backend and policy requirements, and several of them cost real money if skipped.

Scale itself is not a concern: 15–20 users and a few years of records is a small load for any standard database. Nothing below is about performance.

## 1. Roles and permissions (required)

The prototype has no accounts — anyone can do anything. Live, there are two distinct roles:

| Capability | Collector (Fazal, Mussa, Abdul) | Admin (Admin, Seif, Ali, Suleiman) |
| --- | --- | --- |
| Add/edit own collections, receipts, expenses | Yes | Yes |
| See other collectors' entries | No (own only) | Yes (all) |
| Confirm a team member's daily cash | No | Yes |
| Reopen a confirmed day | No | Yes |
| Edit an entry belonging to a confirmed day | No | Yes, logged |
| Delete/cancel any record | No | Yes, logged |
| Create/close/delete batches | No | Yes |
| Manage team roster, zones, locations, destinations | No | Yes |

The "Confirming as" dropdown in the reconciliation panel is a prototype stand-in for the logged-in admin's identity. In production it must be the authenticated user, not a free choice.

## 2. Locking confirmed days (required)

Once an admin confirms a team member's day, that day's collections, receipts, and expenses must become read-only for the collector. This is the single most important control in the system — without it, a discrepancy found at counting time can be edited away afterwards and the trail is gone.

Rules:
- Confirmation stores: collector, date, net amount confirmed, confirming admin, timestamp.
- After confirmation, collector edits to that date are rejected.
- An admin may reopen a day. Reopening must be recorded (who, when, why) and must not erase the original confirmation record — store it as a new event, not an overwrite.
- If figures change after a reopen, the day requires re-confirmation.

## 3. Audit trail and soft deletes (required)

The prototype deletes records permanently and invisibly. For cash handling this is unacceptable.

- No hard deletes on shipments, collections, receipts, expenses, or invoices. Mark them cancelled with who cancelled and when, and exclude them from totals. Keep them queryable.
- Log every create, edit, cancel, and confirmation with user, timestamp, and before/after values on money and status fields.
- Admin-visible history per record. This is what settles disputes about where cash went.

## 4. Concurrent editing

Two users can open the same invoice or collection and save over each other — the second save silently wins. With a shared database this becomes common (a collector updating a payment while the office edits the same invoice).

Implement optimistic concurrency: each record carries a version or `updated_at`; a save with a stale version is rejected with "this record was changed by <user> — reload and reapply." Do not merge silently.

## 5. Offline behaviour — decide before building

Collectors work in the field and will lose signal. This decision has the largest effect on build cost, so settle it before work starts. Three options:

1. **Online only.** Cheapest. The app refuses to save without a connection; staff must be in coverage. Acceptable if collection rounds are in town.
2. **Local draft queue.** Moderate. Entries typed offline are held on the device and uploaded when signal returns, with a visible "N entries not yet uploaded" indicator. Records only count once uploaded. Good middle ground.
3. **Full offline sync.** Most expensive and most complex, because two devices editing offline create conflicts that need resolution rules.

Recommendation: option 2. It covers the real field problem without conflict-resolution complexity.

## 6. Photo and document storage

Luggage photos will be the largest running cost. The retention policy already in the prototype must be implemented, not dropped:

- Air shipments: photos deleted 2 months after shipment date.
- Sea shipments: photos deleted 6 months after shipment date.
- Bank receipt images and shipment documents are **not** covered by this rule — they are financial records. Agree a separate retention period (recommend 7 years or per Oman requirements) and keep them.
- Store files in object storage (Supabase/Firebase Storage or S3), never base64 in the database as the prototype does.
- Compress photos on upload (long edge ~1600px). Phone cameras produce 3–8 MB files; uncompressed at volume this becomes the dominant bill.
- Deletion should run as a scheduled job, and should be logged.

## 7. Receipt and invoice numbering

Receipt numbers are entered by hand, so duplicates and typos are inevitable across three collectors using separate physical books.

- Warn (do not silently block) on a duplicate receipt number: "Receipt 1007 was already entered by Mussa on 14 Aug — continue?"
- Consider a per-collector prefix (F-1007, M-1007) matching each person's physical book.
- Invoice numbers generated by the system should come from the database, not the client, so two devices cannot mint the same number.

## 8. Money handling details

- Store all amounts as integers in the smallest unit (baisa, 1 OMR = 1000 baisa) or as fixed-precision decimals. Never floating point — rounding drift will eventually make totals disagree with hand counts by small amounts, which destroys trust in the reports.
- Fix a currency and a rounding rule and apply them everywhere, including exports.
- The reconciliation figure is defined as: collections + receipt/invoice payments collected − expenses, per collector per day. Cash only. Bank payments must be excluded from the cash figure and reported separately, or the cash count will never match.
- Expenses need a receipt/justification field before they can reduce a collector's cash due, otherwise expenses become an unaudited hole.

## 9. Timezone and day boundary

Oman and Tanzania are one hour apart, and "the day" is what the reconciliation is built on. Define one business timezone for the whole system (recommend Oman/Muscat), stamp records in UTC, and display in the business timezone. Otherwise entries near midnight land on the wrong day and confirmed totals won't match.

## 10. Backups and data export

- Automatic daily backups with a tested restore procedure. Untested backups are not backups.
- Keep the Excel export available for every list — it is the client's fallback if the system is ever unavailable.

## 11. Operational notes

- Staff will use phones. All screens need to work at 360px width; the current tables scroll horizontally, which is acceptable but should be checked on real devices.
- Errors must be visible. A failed save must never look like a successful one — this is how cash entries get lost.
- One nominated admin should be able to correct a collector's mistake without a developer. Anything requiring a developer to fix will instead be worked around, and the workaround will be worse.

## Suggested build order

1. Auth, roles, database schema, one shared dataset.
2. Shipments and Invoice, with system-generated invoice numbers.
3. Money Collection, receipts, expenses.
4. Daily reconciliation with confirmation and locking.
5. Audit trail and soft deletes (build alongside 2–4, not after).
6. Reports and exports.
7. Offline draft queue, if option 2 is chosen.
8. Photo retention job and storage compression.

Items 1–5 are the minimum for live use with real cash. Reports can follow.
