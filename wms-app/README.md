# WMS

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
   `0005_accounting.sql`, then `0006_general_ledger.sql` from this repo.
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
   decide which screens show up in the nav, not just labels.
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
  Accounts, Journal Entries, Reports (trial balance/P&L/balance sheet),
  Items, Categories, Inventory, Locations, Storefront (display-case view),
  Containers (racks/trays), Scan to move, Receiving (purchase orders),
  Orders (sales orders), Invoices, Suppliers, Bills, Customers, Broadcasts
  (customer outreach), Onboarding (first-run business-type picker).
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
- `supabase/functions/send-broadcast/` — Edge Function that actually sends
  a broadcast via Resend.
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
- **Reports** — Trial Balance, Profit & Loss, and Balance Sheet, computed
  live from the ledger.

This is real bookkeeping, not a toy — but it's still a small, focused
subset of what a dedicated accounting product does (no multi-currency, no
period close/locking, no tax forms). If you need those, that's what the
QuickBooks integration on the roadmap is for.

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
