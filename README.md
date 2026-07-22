# Kalari CRM

A custom CRM for **Kalari Tours and Travels** (kalaritravels.in), Kannur, Kerala
— air ticketing, holiday packages, Haj & Umrah, visa and passport services, and
hotel reservations. Every enquiry becomes a tracked case with a stage and an
owner; every case gets an invoice with a known balance; everyone who needs
chasing lands on somebody's call list.

Built by [7Gence](mailto:anas@7gence.com). Spec: `ARCHITECTURE.md` (technical —
its 29 rules are the acceptance criteria).

## Why there's no WhatsApp

Customer contact happens exactly two ways: an **automated email** for anything
that can be written, and a **human phone call from a system-generated queue**
for anything that needs a voice — or when email fails.

WhatsApp Business API needs Meta verification and per-template approval; SMS in
India needs TRAI DLT sender-ID registration. Both add cost, delay and a
third-party veto to a system Kalari is meant to fully own. Nothing here depends
on a telecom regulator, a carrier, or a platform's approval.

## Running it

```bash
npm install
cp .env.example .env      # fill in — see the comments in that file
npm run dev
```

Requires a Supabase project. The schema lives in `supabase/migrations/`:

```bash
supabase link --project-ref <ref>
supabase db push          # apply migrations
npm run db:types          # regenerate TypeScript types from the live schema
npm test                  # the golden totals tests — see below
```

## The tests that matter

`npm test` runs the suite. The important ones are in
`src/lib/pricing/__tests__/totals.test.ts`, which pins all eleven services
**to the paisa**:

| Service | Total *(placeholder)* |
|---|---|
| Air Ticketing · Domestic | ₹500.00 *(per person)* |
| Air Ticketing · International | ₹1,000.00 *(per person)* |
| Holiday Package · Domestic | ₹3,000.00 *(1 person)* |
| Holiday Package · International | ₹7,000.00 *(1 person)* |
| Haj Package | ₹5,000.00 *(per person)* |
| Umrah Package | ₹3,000.00 *(per person)* |
| Visa Service · New | ₹3,000.00 *(per person)* |
| Visa Service · Renewal | ₹2,500.00 *(per person)* |
| Passport Service · New | ₹1,500.00 *(per person)* |
| Passport Service · Renewal | ₹1,000.00 *(per person)* |
| Hotel Reservation | ₹500.00 |

⚠️ **Every figure is an unconfirmed placeholder** — deliberately round numbers,
because Kalari has not yet confirmed a real rate card. The pins still matter:
they catch the engine or the catalogue drifting silently. If one fails, don't
update the number to make it pass — find out which side is wrong.

## How it's put together

**The database is the rulebook.** Not a store the app validates on top of — the
rules live in SQL, so a request that skips the UI is refused identically:

- Money is an **integer count of paise**, never a float. `₹1,284.77` is `128477`.
- **There is no `invoices.status` column.** Status derives from
  (total, payments, today) in a view, so the dashboard reconciles *by definition*
  rather than by a nightly job.
- **Stages are hidden per service, not skipped.** Eleven services, six real
  paths — a hotel booking has no consulate steps, a ticket has no itinerary
  phase. A trigger refuses an off-path move.
- **Issued invoices are immutable.** Corrections are void-and-reissue or a credit
  note. Numbers are gap-free per Indian financial year (`INV-2026-27-00001`) and
  never reused; a rolled-back issue burns nothing.
- **Employees see only their own customers and cases**, and never company revenue.
  Enforced by RLS, not by hiding a nav link.
- **Passports are encrypted at rest**, decrypted in Node, and every read writes an
  access-log row — structurally, because the function that returns the ciphertext
  is the function that logs.

**Automations never send.** They write an `Event`; a dispatcher decides what that
means. The rule engine runs in SQL and *cannot* send — only write events and call
tasks. That's why the channel could change without touching business logic.

**The design test:** the CRM is fully usable with email switched off. It currently
*is* off (until SPF/DKIM/DMARC are verified on kalaritravels.in), and everything
degrades to the call queue. That's not a broken state.

## Layout

```
src/app/(auth)/login      bare — no shell
src/app/(app)/            the authenticated app
src/app/portal/[token]    customer status portal — no login, mobile-first
src/lib/db/               server queries (server-only)
src/lib/pricing/          the 4-dimension resolver + golden tests
supabase/migrations/      the schema, with the original author's reasoning
```

See `CLAUDE.md` for conventions, locked decisions, and what's still blocked on
Kalari.
