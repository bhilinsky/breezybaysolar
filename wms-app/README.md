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
2. Open the SQL editor and run `supabase/migrations/0001_init.sql`, then
   `supabase/migrations/0002_storefront.sql`, from this repo. Together they
   create all tables, the low-stock view, and row-level security policies
   (any signed-in user has full access — this app is single-tenant per
   Supabase project).
3. In Supabase project settings → API, copy the **Project URL** and **anon
   public key**.
4. In `wms-app/`, copy `.env.example` to `.env` and paste those two values in.
5. Create your first user: either sign up from the app's login screen, or
   add one under Supabase → Authentication → Users.
6. On first sign-in you'll be walked through a one-time setup screen asking
   what kind of business this is (retailer/storefront, service, manufacturer,
   distributor, or web store) — this only tailors a couple of labels in the
   nav, it doesn't hide anything.

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

- `src/pages/` — Dashboard, Items, Categories, Inventory, Locations,
  Storefront (display-case view), Containers (racks/trays), Scan to move,
  Receiving (purchase orders), Orders (sales orders), Suppliers, Customers,
  Onboarding (first-run business-type picker).
- `src/lib/supabase.ts` — Supabase client.
- `src/context/AuthContext.tsx` — auth/session state.
- `src/hooks/useBusinessProfile.ts` — the one-row business profile set
  during onboarding.
- `supabase/migrations/0001_init.sql` — base schema + RLS policies.
- `supabase/migrations/0002_storefront.sql` — business profile, location
  types, item barcodes, containers/racks, and the movement log.
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
