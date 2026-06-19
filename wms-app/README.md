# Breezy Bay WMS

A warehouse management system: track items, stock levels by location, receive
purchase orders into inventory, and fulfill outgoing orders. Multiple people
can use it at once from different devices — all data lives in a shared
[Supabase](https://supabase.com) project (Postgres + auth + realtime).

It ships three ways from one codebase:

- **Browser app** — works in any modern browser.
- **Installable PWA** — "Install app" in Chrome/Edge on desktop, or "Add to
  Home Screen" on Android/iPhone, gives it an app icon and its own window,
  with offline app-shell caching.
- **Desktop program** — an Electron wrapper produces a real installer
  (Windows `.exe`, macOS `.dmg`, Linux `.AppImage`).

## 1. Set up Supabase (one-time)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run `supabase/migrations/0001_init.sql` from this
   repo. It creates all tables, the low-stock view, and row-level security
   policies (any signed-in user has full access — this app is single-tenant
   per Supabase project).
3. In Supabase project settings → API, copy the **Project URL** and **anon
   public key**.
4. In `wms-app/`, copy `.env.example` to `.env` and paste those two values in.
5. Create your first user: either sign up from the app's login screen, or
   add one under Supabase → Authentication → Users.

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

## Project structure

- `src/pages/` — Dashboard, Items, Categories, Inventory, Locations,
  Receiving (purchase orders), Orders (sales orders), Suppliers, Customers.
- `src/lib/supabase.ts` — Supabase client.
- `src/context/AuthContext.tsx` — auth/session state.
- `supabase/migrations/0001_init.sql` — full schema + RLS policies.
- `electron/main.cjs` — desktop window shell.

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
