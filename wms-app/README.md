# BreezyWorks

A warehouse management system: track items, stock levels by location, receive
purchase orders into inventory, and fulfill outgoing orders. It also doubles
as a storefront system — display cases and showroom floor are just another
location type, racks/trays move between them as a unit, and every move gets
logged by scanning a barcode/QR tag (camera or a USB/Bluetooth scanner).
Multiple people can use it at once from different devices — all data lives
in a shared [Supabase](https://supabase.com) backend (Postgres + auth +
realtime), which can be Supabase's cloud service or a self-hosted instance
on your own closed network (see setup options below).

It ships three ways from one codebase:

- **Browser app** — works in any modern browser.
- **Installable PWA** — "Install app" in Chrome/Edge on desktop, or "Add to
  Home Screen" on Android/iPhone, gives it an app icon and its own window,
  with offline app-shell caching.
- **Desktop program** — an Electron wrapper produces a real installer
  (Windows `.exe`, macOS `.dmg`, Linux `.AppImage`).

## 1. Set up Supabase (one-time)

The app needs *a* Supabase backend (Postgres + auth + realtime), but not
necessarily the cloud one — pick whichever fits your network:

### Option A — Supabase Cloud (needs internet)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run, in order, `supabase/migrations/0001_init.sql`,
   `0002_storefront.sql`, `0003_warehouse_needs.sql`, `0004_broadcasts.sql`,
   `0005_accounting.sql`, `0006_general_ledger.sql`, `0007_salesforce.sql`,
   `0008_crm.sql`, `0009_quickbooks_desktop.sql`, `0010_partner_api.sql`,
   `0011_amazon.sql`, `0012_company_profile.sql`, `0013_crm_tasks.sql`,
   `0014_payroll.sql`, then `0015_bank_import.sql` from this repo.
   Together they create all tables, the low-stock view, and row-level
   security policies (any signed-in user has full access — this app is
   single-tenant per Supabase project).
3. In Supabase project settings → API, copy the **Project URL** and **anon
   public key**.
4. In `wms-app/`, copy `.env.example` to `.env` and paste those two values in.
5. Create your first user: either sign up from the app's login screen, or
   add one under Supabase → Authentication → Users.
6. On first sign-in you'll be walked through a one-time setup screen asking
   what kind of business this is (retailer/storefront, service, contractor,
   manufacturer, distributor, or web store), whether it needs
   warehouse/storage-location tracking at all, and — if so — whether to map
   individual bin locations (aisle/shelf/bin) within each one. These answers
   decide which screens show up in the nav, not just labels. It also asks
   (all optional) which CRM and shipping tools you already use and roughly
   how many employees/1099 contractors you have — this just points you at
   relevant integrations later (e.g. a hint to connect Salesforce if you
   said you use it) and doesn't block setup or gate any feature.
7. (Optional) To actually send customer broadcasts — see "Customer
   broadcasts" below — deploy the Edge Function and set its secrets:
   ```bash
   supabase functions deploy send-broadcast
   supabase secrets set RESEND_API_KEY=re_your_key \
     RESEND_FROM="Your Business <updates@yourdomain.com>"
   ```
   Get a `RESEND_API_KEY` from [resend.com](https://resend.com) (or swap the
   fetch call in `supabase/functions/send-broadcast/index.ts` for whichever
   transactional email provider you'd rather use — Postmark, SendGrid, etc.
   all work the same way). Until this is deployed, broadcasts save as drafts
   but sending will fail with a clear error in the UI.
8. (Optional) To sync Customers to Salesforce (see "Salesforce" below):
   1. In Salesforce Setup → App Manager → New Connected App, enable OAuth
      settings, and set the callback URL to
      `https://<project-ref>.supabase.co/functions/v1/salesforce-oauth-callback`
      with scopes `api` and `refresh_token, offline_access`.
   2. Copy the Connected App's **Consumer Key** and **Consumer Secret**.
   3. Deploy the functions and set their secrets:
      ```bash
      supabase functions deploy salesforce-oauth-callback --no-verify-jwt
      supabase functions deploy salesforce-sync
      supabase functions deploy salesforce-disconnect
      supabase secrets set \
        SALESFORCE_CLIENT_ID=your_consumer_key \
        SALESFORCE_CLIENT_SECRET=your_consumer_secret \
        SALESFORCE_LOGIN_URL=https://login.salesforce.com \
        SALESFORCE_REDIRECT_URI=https://<project-ref>.supabase.co/functions/v1/salesforce-oauth-callback \
        BREEZYWORKS_APP_URL=https://your-deployed-app.example.com
      ```
      (`SALESFORCE_LOGIN_URL` is `https://test.salesforce.com` for a sandbox
      org instead of production.)
   4. In `wms-app/.env`, set `VITE_SALESFORCE_CLIENT_ID` (the same Consumer
      Key — it's public by design in this OAuth flow) and
      `VITE_SALESFORCE_REDIRECT_URI` (same URL as the callback above).
   5. On the Integrations page, click "Connect to Salesforce."
9. (Optional) To sync from **QuickBooks Desktop** (see "QuickBooks Desktop"
   below — this is a different mechanism than QuickBooks Online, which has
   no equivalent here yet):
   1. Deploy the SOAP endpoint: `supabase functions deploy qbwc-soap --no-verify-jwt`
      (`--no-verify-jwt` because QuickBooks' Web Connector can't send a
      Supabase auth header — its own username/password is what's checked).
   2. On the Integrations page, set a username/password (this is what
      you'll type into Web Connector, not your QuickBooks login) and
      download the generated `.qwc` file.
   3. In QuickBooks Desktop: File → App Management → Update Web Services,
      add the `.qwc` file, enter the same password when prompted.
   4. Run it from Web Connector — it pulls QuickBooks customers into
      BreezyWorks,
      matched on QuickBooks' internal ListID so re-running updates rather
      than duplicates.
10. (Optional) To sell on **Amazon Marketplace** (see "Amazon Marketplace"
    below):
    1. Apply for an SP-API developer application in Seller Central — this
       needs an approved seller account and can take Amazon a while to
       review; there's no way to skip that part.
    2. Deploy the functions and set their secrets:
       ```bash
       supabase functions deploy amazon-oauth-callback --no-verify-jwt
       supabase functions deploy amazon-sync
       supabase functions deploy amazon-disconnect
       supabase secrets set \
         AMAZON_LWA_CLIENT_ID=your_lwa_client_id \
         AMAZON_LWA_CLIENT_SECRET=your_lwa_client_secret \
         AMAZON_REDIRECT_URI=https://<project-ref>.supabase.co/functions/v1/amazon-oauth-callback \
         AMAZON_MARKETPLACE_ID=ATVPDKIKX0DER \
         BREEZYWORKS_APP_URL=https://your-deployed-app.example.com
       ```
       (`AMAZON_MARKETPLACE_ID` defaults to the US marketplace — see
       Amazon's marketplace ID reference for other countries.)
    3. In `wms-app/.env`, set `VITE_AMAZON_APP_ID` (public by design) and
       `VITE_AMAZON_REDIRECT_URI` (same URL as the callback above).
    4. On each item you want synced, set its **Amazon seller SKU** and
       **Amazon product type** (Items page) — both are required by
       Amazon's API and there's no safe way to infer them automatically.
    5. On the Integrations page, click "Connect to Amazon," then "Sync
       stock quantities now."
11. (Optional) To let an outside system (AWS, a marketplace sync job,
    anything) read inventory/customers, deploy the **Partner Data API**:
    ```bash
    supabase functions deploy partner-api --no-verify-jwt
    ```
    Then on the Integrations page, create an API key with whichever scopes
    you need — see "Partner Data API" below for the endpoints.

### Option B — self-hosted (closed network / no cloud dependency)

Supabase is open source and self-hostable via Docker — same app, zero
external network dependency once it's running. This covers both:

- **A single computer with no network at all**: run the stack on that same
  machine, bound to `localhost` — the app talks to `http://localhost:54321`.
- **A closed LAN with a server**: run the same stack on one machine, exposed
  on its LAN IP instead of just `localhost`; other devices' `.env` point at
  that IP.

Steps (need [Docker](https://docs.docker.com/get-docker/) and the
[Supabase CLI](https://supabase.com/docs/guides/cli)):

```bash
npm install -g supabase   # or: brew install supabase/tap/supabase
cd wms-app
supabase init             # if supabase/config.toml doesn't already exist
supabase start
```

`supabase start` reads every file in `supabase/migrations/` automatically —
no manual SQL editor step needed — and prints out a local API URL and anon
key. Put those in `.env` as usual. `supabase stop` shuts it down;
`supabase db reset` re-applies migrations from scratch.

The one unavoidable network dependency: Docker has to pull the Supabase
images the *first* time. For a genuinely air-gapped machine, pull them once
somewhere with internet, `docker save` them, and load them on the target
machine — after that it runs with zero network access.

## 2. Run it in development

```bash
npm install
npm run dev          # browser app at http://localhost:5173
npm run electron:dev # same app in an Electron window
```

## 3. Build the desktop installer

```bash
npm run dist
```

Output lands in `release/`. By default `electron-builder` targets the OS
you build on:

- Run on **Windows** → produces an NSIS `.exe` installer.
- Run on **macOS** → produces a `.dmg`.
- Run on **Linux** → produces an `.AppImage`.

Cross-building Windows installers from Linux/macOS is possible with
`electron-builder`'s `--win` flag (uses Wine), but macOS `.dmg` builds only
work on a real Mac due to Apple's licensing.

## 4. Ship the browser/PWA version

```bash
npm run build
```

Deploy the `dist/` folder to any static host (Netlify, Vercel, etc.) — same
place you could deploy the existing `breezy-bay-holdings-1.html` site from.
Once deployed over HTTPS, visiting it on a phone offers "Add to Home Screen"
(iOS Safari) or "Install app" (Android Chrome).

## Customizing branding

This codebase ships with no company name or logo baked in — it's meant to be
white-labeled by whoever installs it. Two layers of branding:

- **Runtime**: the business name shown in the sidebar comes from the
  business-type onboarding screen (stored in `business_profile.business_name`)
  — no code change needed, each install sets its own.
- **Build-time**: before building your own installer/deployment, update these
  static values to your own name:
  - `package.json` — `description`, `desktopName`, and `build.appId` /
    `build.productName`.
  - `vite.config.ts` — the PWA `manifest.name` / `short_name` / `description`.
  - `index.html` — the `<title>` and meta `description`.
  - `public/` icons and `scripts/icon-source.svg` — swap in your own logo,
    then run `npm run icons` to regenerate the PNGs.

## Project structure

- `src/pages/` — Dashboard, Accounting (financial reporting), Chart of
  Accounts, Journal Entries, Reports (full report center — see below),
  Items, Categories, Inventory, Locations, Storefront (display-case view),
  Containers (racks/trays), Scan to move, Receiving (purchase orders),
  Orders (sales orders), Invoices, Suppliers, Bills, Customer Center
  (contacts + activity timeline + pipeline + follow-up tasks), Employees
  (employee/1099 contractor records), Pay Runs (payroll), Broadcasts
  (customer outreach), Integrations (Salesforce, QuickBooks Desktop, Amazon
  Marketplace, Partner Data API), Onboarding (first-run business-type
  picker + current tools/services).
- `src/lib/supabase.ts` — Supabase client.
- `src/context/AuthContext.tsx` — auth/session state.
- `src/hooks/useBusinessProfile.ts` — the one-row business profile set
  during onboarding.
- `supabase/migrations/0001_init.sql` — base schema + RLS policies.
- `supabase/migrations/0002_storefront.sql` — business profile, location
  types, item barcodes, containers/racks, and the movement log.
- `supabase/migrations/0003_warehouse_needs.sql` — explicit
  needs_warehouse/needs_bin_locations onboarding answers, and bin_code on
  locations.
- `supabase/migrations/0004_broadcasts.sql` — the broadcasts table.
- `supabase/migrations/0005_accounting.sql` — invoices and bills.
- `supabase/migrations/0006_general_ledger.sql` — chart of accounts,
  journal entries, the balance-enforcing `create_journal_entry` function,
  and the triggers that auto-post invoices/bills to the ledger.
- `supabase/migrations/0007_salesforce.sql` — the locked-down
  salesforce_connection table, the safe salesforce_status view, and
  customers.salesforce_contact_id.
- `supabase/migrations/0008_crm.sql` — crm_activities and opportunities,
  the native CRM tables behind Customer Center.
- `supabase/migrations/0009_quickbooks_desktop.sql` — the locked-down
  qbwc_config table (QBWC username/password hash), the safe
  qbwc_config_status view, qbwc_sessions (sync history), and
  customers.quickbooks_list_id.
- `supabase/migrations/0010_partner_api.sql` — the locked-down
  partner_api_keys table (SHA-256 hashed keys), the safe
  partner_api_keys_status view, and the create/verify/revoke functions.
- `supabase/migrations/0011_amazon.sql` — the locked-down amazon_connection
  table, the safe amazon_status view, and
  items.amazon_seller_sku/amazon_product_type.
- `supabase/migrations/0012_company_profile.sql` — adds the "what do you
  already use" onboarding fields to business_profile (CRM tools, shipping
  services, approximate employee count, whether there are 1099
  contractors).
- `supabase/migrations/0013_crm_tasks.sql` — crm_tasks, the follow-up/
  reminder layer in Customer Center (what needs to happen next, and by
  when — separate from crm_activities, which is what already happened).
- `supabase/migrations/0014_payroll.sql` — employees, pay_runs, and
  pay_run_lines, plus the trigger that auto-posts a balanced journal entry
  to the GL when a pay run is posted.
- `supabase/migrations/0015_bank_import.sql` — bank_transactions, for
  CSV-imported bank activity awaiting categorization against the GL.
- `supabase/functions/send-broadcast/` — Edge Function that actually sends
  a broadcast via Resend.
- `supabase/functions/salesforce-oauth-callback/`,
  `salesforce-sync/`, `salesforce-disconnect/` — the Salesforce
  integration's server-side half (see "Salesforce" below).
- `supabase/functions/qbwc-soap/` — the QuickBooks Web Connector SOAP
  endpoint (see "QuickBooks Desktop" below).
- `supabase/functions/amazon-oauth-callback/`, `amazon-sync/`,
  `amazon-disconnect/` — the Amazon Marketplace integration's server-side
  half (see "Amazon Marketplace" below).
- `supabase/functions/partner-api/` — the Partner Data API (see "Partner
  Data API" below).
- `electron/main.cjs` — desktop window shell.

### Storefront / rack scanning model

- **Locations** now have a `type` (warehouse, safe, display case, storefront
  floor, other) — the Storefront page shows only display-case/storefront-floor
  locations and what's currently sitting in them.
- **Containers** (racks/trays) are their own entity with a scannable `code`,
  hold a set of items, and move between locations as a unit — e.g. a ring
  tray going from the safe to a window case.
- **Scan to move**: scan (camera or hardware scanner) a rack's code or an
  item's SKU/barcode, pick the destination location, confirm — this updates
  `inventory_levels`/`containers.location_id` and writes a row to the new
  `movements` table, giving a full audit trail of every move.

### Customer broadcasts

Compose a subject/message on the Broadcasts page and it goes out to every
customer with an email on file — for a sale, a new service, anything worth
telling them about. No third-party marketing platform required: the send
itself happens in the `send-broadcast` Edge Function (step 7 above) so the
email provider's API key stays server-side, and every customer is BCC'd so
they never see each other's addresses. `broadcasts` keeps a record of each
send (status, recipient count, any error) for the page's history list.

### Accounting

The Accounting page is a reporting dashboard in the same style as the main
Dashboard — outstanding amounts owed to you (AR) and owed by you (AP),
what's been collected/paid out this month, and overdue invoices/bills.
**Invoices** and **Bills** are the underlying record-keeping: an invoice can
optionally link to a sales order, a bill to a purchase order, and each
moves through draft → sent/received → paid (or cancelled).

Underneath that is a real double-entry **general ledger** (`0006_general_ledger.sql`):

- **Chart of Accounts** — a starter set of accounts (Cash, AR, AP, Sales
  Revenue, Operating Expenses, etc.) with a few marked by `role` so the app
  knows which one to use when posting automatically.
- **Journal Entries** — every invoice/bill status change (sent, received,
  paid) posts its own balanced entry automatically via a Postgres trigger,
  so the books stay in sync with AR/AP without anyone remembering to do it
  by hand. You can also post manual entries (rent, payroll, owner draws) —
  entries are only ever created through a `create_journal_entry` database
  function that rejects anything that doesn't balance, with a second,
  independent trigger as a safety net against any write that bypasses it.
- **Reports** — a full Report Center (`src/pages/Reports.tsx`), grouped the
  same way the sidebar groups them:
  - *Financial statements*: Trial Balance, General Ledger (per-account
    detail with running balance), Profit & Loss, Balance Sheet.
  - *Receivables*: AR Aging Summary, AR Aging Detail, Customer Balances.
  - *Payables*: AP Aging Summary, AP Aging Detail, Vendor Balances.
  - *Sales & purchasing*: Sales by Customer, Sales by Item, Purchases by
    Supplier, Purchases by Item.

  Deliberately not included: Payroll, Manufacturing (BOM/work order), and
  Job Costing reports — those need their own modules to exist first
  (nothing to report on otherwise), so they're not built yet rather than
  built as empty pages.

This is real bookkeeping, not a toy — but it's still a small, focused
subset of what a dedicated accounting product does (no multi-currency, no
period close/locking, no tax forms). If you need those, that's what the
QuickBooks integration on the roadmap is for.

### Customer Center (native CRM)

Customers now opens into a full Customer Center rather than a flat contact
list: click a customer to see their contact info alongside an **activity
timeline** (log calls/emails/meetings/notes — `crm_activities`), a **sales
pipeline** (`opportunities`, with stage/value/expected close date, editable
inline), and their actual invoices and orders in one place. This gives
Salesforce-style contact/pipeline tracking natively, independent of whether
Salesforce is ever connected — the two are complementary, not either/or:
sync Customers to real Salesforce Contacts via the integration below *and*
track activity/pipeline here, or just use this if you don't have Salesforce
at all.

Each customer also has a **Tasks** panel (`crm_tasks`) — the follow-up
layer that activities and opportunities don't cover: what needs to happen
next, and by when. Add a task with a title, optional due date, and
optional link to one of that customer's open opportunities; check it off
when done. Open tasks past their due date are highlighted so nothing
quietly falls through.

### Company profile / onboarding

Onboarding also asks (all optional, none of it gates setup) which CRM
tools and shipping services you already use, and roughly how many
employees and 1099 contractors you have. Right now this only feeds one
thing back: if you said you use Salesforce, the Integrations page shows a
one-line hint pointing you at the Salesforce connection. The rest
(`business_profile.crm_tools`, `.shipping_services`, `.approx_employees`,
`.has_1099_contractors`) is just stored for later — a natural spot to hang
future shipping-carrier integrations or CRM-specific import tools off of.

### Payroll

Employees and Pay Runs give you basic payroll record-keeping, posting to
the GL — **not** a tax engine. Add employees (or 1099 contractors) with a
name, pay type (salary/hourly), and rate on the Employees page. Create a
pay run for a pay period, add a line per employee with **gross pay** and
**deductions** (a single manual number — whatever you've already
calculated or been told to withhold; net pay is computed automatically).
Posting a pay run books one balanced journal entry: debit Salaries & Wages
for the gross total, credit Cash for the net total actually paid out, and
credit Payroll Liabilities for any deductions, for you to remit to the
relevant tax agency or benefits provider separately.

What this deliberately does **not** do: calculate federal/state/local tax
withholding, file payroll tax forms, handle multi-state rules, or
integrate with a payroll tax service. That's a regulated product in its
own right (Gusto/ADP/Zenefits territory) — getting withholding wrong has
real legal and financial consequences, so this app tracks the numbers you
give it rather than computing them.

### Bank Transactions

Import a CSV export from your bank (most online banking sites offer this)
on the Bank Transactions page — match up which column is the date,
description, and amount (or separate debit/credit columns, if that's how
your bank exports), preview the rows it found, and import. Each imported
row starts **unreviewed**; pick a GL account for it and click **Post** to
book a balanced journal entry against your Cash account (money in debits
Cash, money out credits it), or **Ignore** rows that shouldn't post
(transfers between your own accounts, duplicates, etc.).

This is a file import, not a live bank feed — there's no automatic,
ongoing connection to your bank. A true "auto-sync" feed needs a
bank-data aggregator (Plaid is the standard one in the US), which means
signing up for your own Plaid developer account and taking on their
per-connection pricing once past the free tier — a deliberate separate
step, not bundled into this.

### Salesforce

The Integrations page connects to Salesforce via OAuth2 (the standard "web
server flow") and pushes Customers to Salesforce as Contacts — click "Sync
now" and it creates any that don't exist yet and updates the ones it's
already synced (tracked via `customers.salesforce_contact_id`). Syncing
sales orders as Opportunities is the natural next step but isn't built yet
(the sync function has a comment marking where it'd go).

The access/refresh tokens never reach the browser: `salesforce_connection`
has row-level security enabled with **no policies granting `authenticated`
any access at all**, so only server-side code using the service-role key
(the three `salesforce-*` Edge Functions) can read or write it. The
Integrations page only ever queries `salesforce_status`, a view exposing
just the harmless fields (connected, instance URL, last synced) — verified
directly: `select * from salesforce_connection` as the `authenticated` role
gets a flat `permission denied`, while the status view returns fine.

Setup requires creating a Salesforce Connected App yourself (step 8 above)
— there's no way around that part, it's how Salesforce OAuth works for any
third-party app.

### QuickBooks Desktop

QuickBooks *Desktop* (unlike QuickBooks Online) has no REST/OAuth API at
all — the only integration path is **Web Connector (QBWC)**, a small app
QuickBooks ships that periodically polls a SOAP web service described by a
`.qwc` config file. The Integrations page generates that file and lets you
set the shared username/password Web Connector authenticates with; the
actual SOAP endpoint (`supabase/functions/qbwc-soap`) implements QBWC's
fixed interface (`authenticate` → repeated `sendRequestXML`/
`receiveResponseXML` → `closeConnection`) by hand, since no SOAP toolkit
exists for Deno — this protocol has been stable for years, so that's a
reasonable trade.

Each run pulls **Customers** from QuickBooks via a `CustomerQueryRq`,
matched on QuickBooks' own `ListID` (stored as
`customers.quickbooks_list_id`) so re-running updates instead of
duplicating. Syncing Vendors, Items, Invoices, and Bills the same direction
— or pushing BreezyWorks data back into QuickBooks — is the natural next step but
isn't built yet; the SOAP handler's `sendRequestXML`/`receiveResponseXML`
branches are the place to add it.

Security follows the same shape as the Salesforce integration: the QBWC
password hash lives in `qbwc_config`, which has RLS enabled with no
policies granting `authenticated` any access — the client only ever reads
`qbwc_config_status` (a view exposing the non-secret fields) and calls
`set_qbwc_password`/`verify_qbwc_password`, two functions that hash/check
the password without ever exposing it, the latter grantable only to the
service role. Verified directly: `authenticated` gets `permission denied`
calling `verify_qbwc_password` or reading `qbwc_config` directly, and can
read `qbwc_sessions` (sync history) but not write to it.

One thing to know: QuickBooks Web Connector is a Windows-only application,
so this can't be tested end-to-end without a real Windows machine running
QuickBooks Desktop — verification here covers the SOAP endpoint's logic,
the schema, and every access-control boundary, not a live round-trip.

### Amazon Marketplace

Worth clearing up first: **AWS (Amazon Web Services)** and **Amazon's
retail marketplace** are unrelated as far as this integration goes — this
connects to Seller Central/SP-API to sell products, not to AWS cloud
infrastructure. Whether it's relevant depends on the kind of business:
retailers, distributors, manufacturers, and web stores selling physical
products are the ones who'd use it; service businesses and contractors
usually don't need it at all, and a manufacturer selling through a
distributor rather than directly may only want the Partner Data API below
instead.

The Integrations page connects via OAuth2 (Login With Amazon) and, on
"Sync stock quantities now," pushes current on-hand quantity to Amazon
listings that **already exist** — it does not create new listings. Amazon
requires a `productType` (category-specific) on every update, so only
items with both `amazon_seller_sku` and `amazon_product_type` set (Items
page) get synced; anything else is skipped and reported back rather than
guessed at.

Same security shape as Salesforce/QuickBooks: tokens live in
`amazon_connection`, locked down with RLS and no policies for
`authenticated` — verified directly that querying it as `authenticated`
returns zero rows, while `amazon_status` (the safe view) correctly shows
connection state with nothing secret in it. Getting an approved SP-API
developer application from Amazon is the one part that can't be sped up —
that's Amazon's own review process, not something in this codebase.

### Partner Data API

A plain HTTPS + API-key REST endpoint (`supabase/functions/partner-api`)
for any outside system to read current inventory and/or customers —
something running on AWS, a marketplace sync job, a spreadsheet macro,
anything with an HTTP client. It doesn't need to run on AWS to be callable
from AWS; a normal authenticated HTTPS endpoint is all any external system
actually needs.

```
GET /functions/v1/partner-api/inventory   (needs the "inventory" scope)
GET /functions/v1/partner-api/customers   (needs the "customers" scope)
Authorization: Bearer <key>
```

Create keys on the Integrations page — each one is shown in full exactly
once at creation (same convention as Stripe/GitHub-style API keys) and can
be scoped to `inventory`, `customers`, or both, and revoked independently.
Verified directly against Postgres: a freshly created key verifies with
the right scope and fails with the wrong one, a revoked key stops
verifying immediately, `last_used_at` gets stamped on each successful
call, and `authenticated` can't read key hashes directly or call the
verification function itself (only the service role can, so even a
compromised staff login can't brute-force keys through the API).

### Exporting to other accounting software

Not on QuickBooks Desktop or Salesforce? Chart of Accounts, Journal
Entries, Invoices, Bills, and Customers each have an "Export CSV" button —
a universal format virtually any accounting software (Xero, FreshBooks,
Wave, QuickBooks Online, etc.) can import directly, no integration needed.

## v1 scope / known simplifications

- Single shared dataset per Supabase project — not a multi-tenant SaaS. Each
  company/deployment uses its own Supabase project.
- Roles (`admin`/`staff`) exist on `profiles` but aren't yet used to gate
  actions — any signed-in user can do anything. Add role checks in the UI
  and tighten RLS policies if you need that distinction enforced.
- Receiving/fulfillment updates inventory with sequential requests rather
  than a single DB transaction. Fine at small-warehouse scale; if you need
  stronger atomicity under concurrent use, move that logic into a Postgres
  RPC function.
- The camera scanner (`@zxing/browser`) needs an HTTPS origin (or
  `localhost`) to get camera permission — same requirement as the PWA
  install prompt.
- The business-type picker only relabels a couple of nav items today; it
  doesn't yet gate features or wire up outside platforms (Shopify, Amazon,
  etc.) — that integration layer is a deliberately separate follow-up.
