# Compounding — a growth tracker

A daily-pulse + weekly-optionality tracker with a computed compounding score
and an opt-in accountability-partner view. React + TypeScript + Vite +
Tailwind on the frontend, Supabase (Postgres + Auth + RLS) as the only
backend, deployed as a static site to GitHub Pages.

## What's inside

- `src/` — the frontend app (routes in `src/App.tsx`, pages in `src/pages/`)
- `supabase/schema.sql` — the entire database: tables, scoring views,
  triggers, RLS policies, and the security-definer partner-sharing functions
- `.github/workflows/deploy.yml` — CI: build and publish to `gh-pages` on
  every push to `main`

All scoring math (`G_day`, `O_week`, `WCS`) lives in Postgres views
(`daily_scores`, `weekly_ledger`, `weekly_scores`), so the frontend only ever
reads pre-computed numbers — it never recalculates scoring logic in
JavaScript.

## 1. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the entire contents of `supabase/schema.sql`,
   and run it. This creates every table, view, policy, trigger, and
   function in one pass.
3. Open **Project Settings → API** and copy the **Project URL** and the
   **anon / public** key. Do **not** copy the service role key — it's never
   needed here and must never be committed or shipped to the browser. RLS is
   what makes the anon key safe to expose client-side.
4. In **Authentication → Providers**, email/password should already be on
   by default, with "Confirm email" enabled — that's what this app expects.

## 2. Run locally

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL + anon key
npm run dev
```

## 3. Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Under repo **Settings → Secrets and variables → Actions**, add two
   repository secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Under repo **Settings → Pages**, set the source to the `gh-pages` branch
   (it's created automatically the first time the workflow runs).
4. Push to `main` — the workflow in `.github/workflows/deploy.yml` builds
   the app and publishes `dist/` to `gh-pages`.
5. Your app will be live at `https://<you>.github.io/<repo>/`. The build
   automatically sets Vite's `base` to `/<repo>/` from the repository name;
   override this with a `VITE_BASE_PATH` repo **variable** if you use a
   custom domain or different path.

The app uses `HashRouter`, so client-side routes (`/#/dashboard`, etc.) work
correctly on Pages without any server-side rewrite rules.

### Verify RLS before relying on it

Create two test accounts and confirm:
- each only ever sees their own daily logs and ledger entries (query the
  tables directly with each account's session — the other account's rows
  should never appear)
- the partner summary functions raise an authorization error until a
  partnership between the two accounts has `status = 'accepted'`
- with `share_level = 'summary_only'` (the default), `get_partner_daily`
  refuses to return anything, even to an accepted partner

## Design decisions made where the brief left room

- **Invite flow**: the brief asked for "enter/generate an invite code,
  accept/decline pending invites" without fully specifying the handshake.
  Implemented as: A generates a short code (`create_partner_invite`), shares
  it out of band, B redeems it (`redeem_partner_invite`), which attaches B's
  user id to the pending row. The invite then shows as pending in **both**
  accounts' `/partner` pages, and either party can accept or decline before
  it's active. No raw data is exchanged until `status = 'accepted'`.
- **Partner display names**: showing a partner's name before a partnership
  is accepted needs to bypass the normal profiles RLS (which is strictly
  self-only). Added a narrow `get_partnership_display_name` function that
  only returns a name to the other party of a specific partnership row —
  nothing else about that profile is exposed.
- **Streak calculation**: computed client-side from `daily_logs` (any row
  counts, including floor-mode days), walking backward from today (or
  yesterday, if today isn't logged yet) until a gap is found. For the
  partner panel, an equivalent `get_partner_profile_summary` function
  computes the same thing server-side so it can be shared without exposing
  daily-level data.
- **Account deletion**: the anon key can't drop a Supabase Auth user
  (that requires the service role key, which this frontend-only,
  no-custom-server architecture deliberately never holds). "Delete my data"
  on `/settings` removes all of a user's logs, ledger entries, sprint
  targets, and partnerships, then signs them out. To fully remove the login
  itself, delete the user from the Supabase dashboard, or wire up a small
  Edge Function with the service role key later if that's needed.
- **Weekly attribution for `WCS`**: a daily log's week is derived from its
  `log_date` (ISO week, Monday start) in the `weekly_scores` view, so it
  always lines up with whichever `week_start` the ledger entries use.
- **Visual design**: dark, low-glare theme (this is explicitly a
  nighttime-on-phone tool) — moss green as the single accent, warm off-white
  text on a near-black ground, serif display type for headings, monospace
  for scores. Bottom tab bar on mobile, top nav on wider screens.

## Stretch features

All shipped except dark mode (the app is intentionally dark-only — see
below) and true push notifications (not possible without a backend in this
architecture; see the reminder note below).

- **Partner nudges** — `partner_messages` table + a lightweight thread on
  `/partner`, visible only to the two people in an *accepted* partnership
  (RLS-enforced, same pattern as everything else).
- **CSV export** — `/settings` has buttons to download daily logs and
  ledger entries as CSV, generated client-side from your own rows.
- **Editable scoring weights** — off by default. Toggle "Custom" under
  Advanced in `/settings` to rebalance the G_day weights (Execution /
  Anchors / Shipped) and the WCS weights (G_day average / O_week); each
  group must still sum to 1.0. Implemented entirely in the `daily_scores`
  and `weekly_scores` views via a `scoring_settings` table, so the standard
  weights apply everywhere until a user explicitly opts in.
- **Evening reminder** — a best-effort local reminder using the
  `Notification` API, controlled from `/settings`. Read the caveat there:
  this is not true push. A static site with no backend has no way to wake
  a closed browser and send a notification — that requires a service
  worker plus a push server (e.g. web-push with VAPID keys) sitting behind
  some hosting that isn't GitHub Pages' static files. The reminder here
  only fires while at least one tab of the app is open, which is a
  reasonable approximation for a tool people mostly use once in the
  evening anyway, but it's worth knowing the limitation before relying on
  it. If push-when-closed becomes a real requirement, revisit the whole
  backend architecture rather than bolting it onto this one.
- **Dark mode** — not added as a toggle. The app was designed dark-only
  from the start (see the design-decisions note above) since it's
  explicitly a nighttime, low-glare tool; a light theme would need its own
  full pass on contrast and isn't a quick flag to flip. Happy to build it
  as a real second theme if it turns out to be wanted, rather than a
  half-considered toggle.

## Tech notes

- Frontend never talks to Postgres directly except through
  `@supabase/supabase-js`, which respects RLS on every call.
- The three views (`daily_scores`, `weekly_ledger`, `weekly_scores`) are all
  created `with (security_invoker = true)`. Postgres views normally run
  with the *owner's* privileges, and in Supabase the owner bypasses RLS —
  without `security_invoker`, these views would silently leak every user's
  rows to every other user. `security_invoker` makes them run as the
  querying role instead, so the RLS policies on `daily_logs` /
  `ledger_entries` are what actually decide what comes back. This needs
  Postgres 15+, which is Supabase's current default — worth double-checking
  if you're on an older project.
- All displayed scores are integers (rounded in SQL); nothing in the UI
  ever shows a decimal.
