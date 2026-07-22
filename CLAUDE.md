# KALARI CRM — project notes

Operational notes and locked decisions. Keep additions terse and factual.

> **This repo is a replication of Shafeek CRM** (a UAE visa-services CRM) for
> **Kalari Tours and Travels** (kalaritravels.in), Kannur, Kerala, India —
> tagline "Your Journey, Handled Right". The design system, the app shell, the
> money/ledger discipline and the event seam are inherited; the domain
> (services, stage paths, currency, timezone, brand) is Kalari's.

**Contracts, in precedence order:**

1. `ARCHITECTURE.md` — the technical contract. Its numbered rules are the
   acceptance criteria. When in doubt, it wins.
2. This file — how the code is actually built.

---

## THE BACKEND IS THE RULEBOOK

Supabase project `uedhlrkmpediekclodkb`. The schema lives in
`supabase/migrations/` (26 files) — **read the comments, they explain the
reasoning.** The migrations were edited in place BEFORE the first apply on this
fresh project (legitimate: never-applied database). **From the first deploy
onwards: forward-only. Never edit an applied migration.**

### What the database enforces (do NOT re-implement in TypeScript)

| Rule | Where it lives |
|---|---|
| Per-service stage path | `private.tg_case_stage_guard()` — raises `23514` on an off-path move |
| Time-in-stage not client-writable | no UPDATE grant on `cases.stage_entered_at`; the trigger sets it |
| Invoice status | `invoices_v` derives it. **There is no `invoices.status` column** |
| Stuck cases, days-in-stage, outstanding | `cases_board_v` |
| Client/server total mismatch | `issue_invoice()` recomputes and refuses (`23514`) |
| Gap-free invoice numbers | `private.next_invoice_seq()`, allocated **last** so a rollback burns nothing |
| Overpayment, under concurrency | `record_payment()` |
| Employee scoping | RLS + `security_invoker=true` on both views |
| Passport access logging | `read_customer_passport(id, purpose)` returns **ciphertext**; the log row is written by the RPC |
| Call requeue / escalate / promise | `log_call()`, one transaction |

### Conventions the schema uses (match them)

- RLS helpers are `language sql` + `security definer`; every call site wraps
  them as `(select public.is_admin())` so the planner hoists to an InitPlan.
- `revoke all` first, then explicit column-level grants.
- `set search_path = ''` on every definer function; fully-qualify everything.
- Money columns are `bigint` and end in `_paise`. Never `numeric`, never a float.
- Phones normalise through `public.normalise_phone_in()` (Indian +91 formats).

---

## MONEY

**Integer paise. 1 INR = 100 paise. ₹1,284.77 is `128477`.** Never a float.

- `src/lib/money.ts` mirrors `issue_invoice()`'s arithmetic **exactly**. GST is
  in **basis points** (`gst_bp`, 500 = 5%), and `round()` is half-away-from-zero
  to match Postgres. Display uses `en-IN` lakh grouping (₹1,28,477.00); compact
  form uses ₹L / ₹Cr tiers.
- The invoice PDF prints **"Rs."** — jsPDF's core Helvetica has no ₹ glyph.
- Invoice series follows the **Indian financial year**: `INV-2026-27-00001`.
  Mirrored in `public.current_invoice_series()` and inside `issue_invoice()`
  (derived from the issue date, so back-dated invoices land in their own FY).
  ⚠ Series convention still needs the accountant's sign-off.
- `src/lib/pricing/engine.ts` resolves **4 dimensions**
  (family × category × location × type) → one service. Eleven services, six
  stage paths. It **throws** rather than guessing a rate.
- `src/lib/pricing/__tests__/totals.test.ts` pins all eleven seeded totals to
  the paisa. **If it fails, do not update the number to make it pass.**

## ⚠️ EVERY RATE IS AN UNCONFIRMED PLACEHOLDER

Kalari has not confirmed a single rate. The seeded catalogue is deliberately
round stand-ins (₹500 / ₹1,000 / ₹2,000 …) so a real-looking figure can never
be mistaken for a confirmed one. `gst_bp` is 0 on every line — India GST
treatment differs per service (tour operator 5% no-ITC, air-agent commission
basis, hotel slabs) and is an accountant's answer. Surfaced loudly on
`/admin/catalogue`. **No real invoice may be issued until Kalari confirms rates
in writing** — issued invoices are immutable.

When real rates arrive: update the seed migration (new forward-only migration),
the fixture (`catalogue.fixture.ts` — regenerate from the live tables), and the
pinned totals **together, never one alone**.

---

## THE DOMAIN — six families, eleven services

| Family | Dimensions used | Services |
|---|---|---|
| `ticketing` | location (domestic/international) | 2 |
| `holiday` | location | 2 |
| `haj_umrah` | category (haj/umrah; standard/premium reserved) | 2 |
| `visa` | type (new/renew) | 2 |
| `passport` | type (new/renew) | 2 |
| `hotel` | none | 1 |

Three pipelines: `sales` (unchanged), `processing` (superset of 17 stages,
per-service paths via `stage_applicability`), `renewal` (visa/passport repeat
business). Stage paths per family are seeded in
`20260717130100_seed_pipelines.sql` and are **defaults pending a 30-minute
review with Kalari's operations person**:

- ticketing: PNR Held → Ticket Issued → Complete
- holiday: Itinerary Final → Bookings Confirmed → Travel Docs Shared → Travelling → Complete
- haj_umrah: Docs Collected → Visa Processing → Group Allocated → Departed → Complete
- visa: Docs Collected → Submitted → Visa Received → Complete
- passport: Docs Collected → PSK Appointment → Submitted → Dispatched → Complete
- hotel: Booking Confirmed → Voucher Sent → Complete

Customer-facing plain-English copy for these stages lives in
`nextStepCopy()` in `src/app/portal/[token]/page.tsx`.

---

## THE EVENT SEAM (ARCHITECTURE §4)

**Automations never send. They write an `Event`.**

```
something happens → events → dispatcher → email_queue → adapter → provider
                                        └→ call_tasks
```

`run_automation_rules()` runs in SQL and *physically cannot send*. Rule
evaluation in SQL; dispatch, render and send in TypeScript.
`events.dedupe_key` is `unique` + `on conflict do nothing` — every rule is
idempotent, safe to run every 15 minutes forever.

**The design test: the CRM must be fully usable with email switched off.**
`automation_settings['email.enabled']` is **false** until SPF/DKIM/DMARC are
verified on kalaritravels.in. Everything degrades to the call queue.

**No provider SDK outside `src/lib/email/adapters/`. Ever.**

---

## CLIENT / SERVER BOUNDARY

`src/lib/db/*` and `src/lib/supabase/{server,admin}.ts` are `import
"server-only"`. Pure display helpers live apart (`lib/calls/display.ts`,
`lib/invoices/display.ts`, `lib/pricing/rules.ts`, `lib/pipelines/stage-path.ts`).

Four Supabase clients, four jobs — server.ts (default, RLS applies), client.ts
(auth only), admin.ts (service-role, only where no user exists), middleware.ts
(session refresh; `getUser()`, never `getSession()`).

`profiles.role` gates **what renders**. RLS decides **what's possible**.

---

## LOCKED DECISIONS (inherited — reconfirm with Kalari where noted)

- **Two roles.** Admin sees everything; employees see only their own customers
  and cases, and **never company revenue**. (Reconfirm against Kalari's staff.)
- **No self-signup.** The admin creates users (`npm run create-user`).
- **Soft-delete only.** Employees cannot delete or void.
- **The call list is the employee's home screen** (`/calls`); admins → `/dashboard`.
- **Log Call: didn't-reach is one tap.**
- **No call recording, no telephony, no SMS/WhatsApp integration.** (India:
  TRAI DLT registration is the SMS blocker; WhatsApp numbers appear as plain
  wa.me links in copy only.)
- **Portal tokens are credentials** — hash stored, raw token shown **once**.
- **Amount-in-words is NOT generated** — free-text note defaulting to the
  formatted total. (Inherited default; reconfirm with Kalari.)
- **Everything is Asia/Kolkata.** `today_kolkata()` in SQL, `lib/dates.ts` in
  TS. **Never `process.env.TZ`.**

---

## DESIGN

Paper/ink light theme, one interactive accent + one brand gold — both sampled
from kalaritravels.in/logo.svg:

- `accent` **#0F365D** (navy — buttons, active nav, links; ~11:1 on white),
  `accent-deep` #031D3C, plus soft/pale/mist tints.
- `gold` **#C7890A** (brand only — fails AA under white text; `gold-deep`
  #8F6207 is the text-safe one).
- Change brand values in `tailwind.config.ts` + `globals.css` and nowhere else
  (globals.css also carries the navy rgba shadows in `.cta-accent-gradient`,
  `.metric-active-ring`, `.soft-elev-hover`).
- Logo: `public/kalari-logo.svg` (source: kalaritravels.in/logo.svg), rendered
  by `components/brand/Wordmark.tsx`; `icon.png` + `favicon.ico` rasterised
  from it.
- Semantic colours carry meaning: `ok` paid/complete, `warn` due/attention,
  `alert` overdue/stuck. Never reuse them decoratively.
- Manrope + JetBrains Mono. Lucide icons. **No emojis, ever.**
- Only animate `transform` and `opacity`; `prefers-reduced-motion` escapes.

---

## STACK

Next.js 15 App Router · React 19 · TypeScript · Tailwind 3 · Supabase
(auth + RLS) · Vitest · Railway. **No Zustand, no React Query** — server state
is RSC + `revalidatePath`; URL state is `nuqs`; ephemeral UI is `useState`.

```
src/app/(auth)/       login — bare, no shell
src/app/(app)/        the authenticated app — shell lives here
src/app/portal/       customer status portal — no session, no shell
src/lib/db/           server queries (server-only)
src/lib/pricing/      the resolver + golden tests
supabase/migrations/  the schema. Read the comments.
```

---

## BLOCKED ON KALARI — do not invent answers

- **The real rate card** for all 11 services, in writing — and whether
  ticket fares / hotel room rates are invoiced as pass-through lines or the
  invoice carries only Kalari's service fee (changes line design materially).
- **GST**: GSTIN, composition vs regular, per-service treatment. All lines are
  0% until then; the PDF prints `GSTIN: <pending>`.
- **Invoice series convention** (FY-consecutive assumed: `INV-2026-27-…`).
- **Bank account + IFSC + UPI ID** for the portal pay-here box and the email
  payment instructions (currently `<PENDING>` placeholders).
- **Stage-path review** (30 minutes with operations; defaults above).
- **Children's pricing** on Haj/Umrah and holidays (`per_person` counts them
  fully today; may force per_adult/per_child qty rules).
- **Package tiers** — `standard`/`premium` category values are reserved,
  unseeded.
- **Email domain/DNS** (SPF/DKIM/DMARC on kalaritravels.in) before
  `email.enabled` flips on. Email stays off until then by design.
- **What % of customers have usable email?** Under 50% and the call queue is
  the product (it already is the default).
- **Staff list** — who gets admin, who gets employee accounts.

## SECURITY

- `.env` holds the service_role key, the Supabase access token and
  `PII_ENCRYPTION_KEY`/`PII_HASH_PEPPER`. Gitignored (`.env` pattern verified).
- **PII keys were generated fresh for Kalari on 2026-07-23** — never shared
  with any other deployment. **They must be escrowed and must NOT be rotated**
  while ciphertext encrypted under them exists (`key_version` exists for
  versioned rotation). Losing them makes every stored passport unrecoverable.
- `anon` holds **zero grants**. The portal reaches `portal_read()` via
  service_role from a route we own.
- The DB password in `.env` did not match the project at handover; migrations
  were applied via the Management API (`/v1/projects/{ref}/database/query`)
  and the history recorded in `supabase_migrations.schema_migrations`, so
  `supabase db push` sees an in-sync state. Reset the DB password in the
  Supabase dashboard and update `.env` before using psql/db-url tooling.
