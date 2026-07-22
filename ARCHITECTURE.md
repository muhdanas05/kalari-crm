# Kalari CRM — Architecture & Features

No tech stack. This is what the system **is** and what it **does** — the domain,
the entities, the rules that must hold, and the seams. Build it with whatever
you like; these constraints survive any stack.

Behaviour rules and open questions: `CLAUDE.md`. Inherited from the Shafeek
CRM build; the domain below is Kalari Tours and Travels' (travel agency:
ticketing, holidays, Haj & Umrah, visas, passports, hotels).

---

## 1. The loop

Everything is one sentence:

> **Every enquiry becomes a tracked case with a stage and an owner. Every case
> gets an invoice with a known balance. Everyone who needs chasing lands on
> somebody's call list.**

Customer contact happens exactly two ways:

1. **Automated email** — for anything that can be written.
2. **A human phone call, from a system-generated queue** — for anything that
   needs a voice, or when email fails.

Nothing depends on a telecom regulator, a carrier, or a platform's approval.

---

## 2. Domain model

```
                 ┌──────────┐
                 │   User   │  admin (1) | employee (~8)
                 └────┬─────┘
                      │ assigned_to
                      ▼
┌───────────┐    ┌──────────┐    ┌──────────┐
│ Attribution│──▶│ Customer │───▶│   Case   │───▶ Stage (in a Pipeline)
│ (on lead)  │    └────┬─────┘    └────┬─────┘
└───────────┘         │               │
                      │               │ service
                      │               ▼
                      │          ┌─────────┐    ┌──────────────┐
                      │          │ Service │───▶│ LineItemRule │
                      │          └────┬────┘    └──────────────┘
                      │               │
                      │               ├──▶ StageApplicability
                      │               └──▶ DocChecklist
                      ▼
              ┌──────────────┐
              │ InvoiceDraft │  mutable scratch
              └──────┬───────┘
                     │ issue
                     ▼
              ┌──────────────┐    ┌──────────────┐
              │   Invoice    │───▶│ InvoiceLine  │   IMMUTABLE
              └──────┬───────┘    └──────────────┘
                     │
                     ▼
              ┌──────────────┐
              │   Payment    │   IMMUTABLE (void, never edit)
              └──────────────┘

  Everything above emits ──▶ Event ──▶ Dispatcher ──▶ EmailQueue ──▶ Adapter
                                   └──▶ CallTask ──▶ CallLog

  Every write to Customer/Case/Invoice/Payment ──▶ ActivityLog (before + after)
```

### Entities

| Entity | Purpose |
|---|---|
| **User** | Admin (the owner) or Employee. `active` = the revocation switch. `in_assignment_pool` is separate — you can take someone off rotation without deactivating them. |
| **Customer** | The person. Phone is mandatory, email optional. Carries attribution and a portal token. Owns `passport_no` conceptually, but **it is stored apart** (see §4). |
| **Case** | One piece of work for one customer, on one pipeline, at one stage, with one owner. Carries `pax_adults` + `pax_children` and `visa_issue_date` (visa/passport renewals). |
| **Service** | A point in a 4-dimension space: `family × category × location × type`. **Not** eleven templates. |
| **LineItemRule** | One catalogue line for one service: label, rate, qty rule, order. |
| **StageApplicability** | Which stages a service's cases actually have. **The most-missed requirement — see §3.** |
| **DocChecklist** | Which documents each stage of each service requires. Drives the "docs missing" event. |
| **InvoiceDraft** | Mutable scratch. No number, no invariants, no money semantics. |
| **Invoice** | An **issued document**. Immutable from birth. Numbered, sequential, never reused. |
| **InvoiceLine** | Frozen with its invoice. Snapshots both what was charged and what the catalogue said. |
| **Payment** | Immutable. A mistake is voided, never edited. |
| **Event** | The integration seam. Everything that happens writes one. |
| **CallTask / CallLog** | The chase queue and its outcomes. |
| **ActivityLog** | Append-only before/after trail. |

---

## 3. The rules that must hold

If you break these, the product is wrong — regardless of how it's built.

### Money

1. **Money is an integer count of the smallest unit.** Never a float. Never a
   decimal type that rounds on assignment. Currency is INR, stored as integer
   paise, always.
2. **Rates are never invented.** If a rate isn't in the catalogue, the system
   **refuses** rather than guessing. A wrong rate is a wrong invoice is real cash.
3. **There is no GST engine.** GST is a per-line basis-points field defaulting
   to zero (pending the accountant's per-service treatment). Every canonical
   total is exactly the sum of its lines.
4. **Pricing resolves from four parameters**, not eleven hardcoded templates.
5. **Every line is editable before issue.** Government fees move; hardcoding is a
   trap. An edited rate is legal — so snapshot *both* the charged rate and the
   catalogue rate, and show the difference on the issued document.
6. **The client's arithmetic is checked against the server's at issue.** A
   mismatch refuses loudly rather than surfacing on a PDF a customer already has.

### The ledger

7. **Issued invoices are immutable.** Corrections are void-and-reissue or a
   credit note. Both logged.
8. **Drafts live apart from issued invoices**, so the immutability rule is
   unconditional and every financial constraint applies to every row with no
   exception.
9. **Invoice numbers are sequential, gap-free, and never reused.** A rolled-back
   issue must not burn a number. A voided invoice keeps its number forever.
10. **Invoice status is never stored.** It is a function of (total, payments,
    today). The guarantee that it's "never hand-set" is that there is nothing to
    set. `outstanding = total − payments − credits`, computed live, so the
    dashboard reconciles *by definition* rather than by a nightly job.
11. **Rate changes never alter already-issued invoices.**
12. **Payments cannot overpay**, including under concurrency — two simultaneous
    partial payments must not both pass the check.
13. **An invoice with payments against it cannot be voided** — that path is a
    credit note.

### Cases

14. **Stages are declared per-service and HIDDEN, not skipped.** No single
    linear Processing pipeline is right for all six families:

    | Family | Path |
    |---|---|
    | Ticketing | PNR Held → Ticket Issued → Complete |
    | Holiday | Itinerary Final → Bookings Confirmed → Travel Docs Shared → Travelling → Complete |
    | Haj & Umrah | Docs Collected → Visa Processing → Group & Departure Allocated → Departed → Complete |
    | Visa | Docs Collected → Submitted → Visa Received → Complete |
    | Passport | Docs Collected → PSK Appointment → Submitted → Dispatched → Complete |
    | Hotel | Booking Confirmed → Voucher Sent → Complete |

    Eleven services, **six different paths**. A card can never enter a stage
    outside its service's path — enforce that below the UI, not in a component.
    ⚠ Paths are defaults pending Kalari's operations review.

15. **Time-in-stage resets on every move** and is not client-writable — it drives
    the stuck-case alerts, so nobody may forge it.
16. **`visa_issue_date` is captured at Visa Received.** Without it the renewal
    engine — the repeat-business feature — never fires for visa customers.
17. **Sales "Won" auto-creates the downstream case.**

### Access

18. **Two roles only.** Admin sees everything. Employees see **only their own**
    customers and cases — never company revenue, never each other's work.
19. **Employees cannot delete and cannot void.**
20. **No self-signup.** The admin creates users.
21. **Authorisation lives below the UI.** Any request path that skips the UI must
    still be refused.
22. **Never leave the system without an active admin.**
23. **Soft-delete only.** A hard delete erases the row the audit trail describes.
    *(This contradicts the PRD's "Admin: All CRUD" — needs sign-off.)*

### Data

24. **Every write to Customer/Case/Invoice/Payment records who, what, before,
    after.** A write with no human attached must say so honestly rather than
    recording a blank actor.
25. **Passport numbers and documents are encrypted at rest and every read is
    logged.** The key must live somewhere that a compromise of the database does
    not reach. Access logging must be structurally impossible to skip.
26. **Portal tokens are credentials** — store a hash, show the token once.
27. **Customers de-duplicate on phone**, across formats. `+91 95673 24364`,
    `095673 24364` and `0091 95673 24364` are one person. An existing customer
    gets a new case, not a second record.
28. **Attribution is captured on the first lead and is write-once.** Offline
    conversion import needs the click ID that was present on the original click.
    Cost now: a few fields. Cost later: unrecoverable.
29. Everything is Asia/Kolkata. No naive timestamps.

---

## 4. The seams

Three boundaries. Everything else is negotiable; these are not.

### The Event seam

**Automations never send.** They write an `Event`. A dispatcher reads events,
resolves recipient + template, renders, queues, and hands to an adapter.

```
  something happens ──▶ Event ──▶ Dispatcher ──▶ Queue ──▶ Adapter ──▶ provider
                                       └──────────────────▶ CallTask
```

This is why the channel could go WhatsApp → SMS → email without a rewrite. Keep
it that way. **No provider SDK in business logic, ever.**

Adapter contract: `send(to, subject, body, attachments) → { msg_id, status }`

### The design test

**The CRM must be fully usable with email switched off entirely.** Everything
degrades to the call queue. If a feature breaks when the adapter is disabled,
it's coupled wrong.

### The PII boundary

Passport data sits behind a function that **cannot return the value without
writing an access-log row**. Not a convention — a structural guarantee. The
decryption key lives outside the database.

---

## 5. Features

### 5.1 Lead intake
- Public endpoint the marketing site posts to: name, phone, email, service
  interest, message, source — **plus attribution**. Token-authed, rate-limited.
- On receipt: create Customer → create Case at *New Enquiry* → auto-assign →
  emit `lead.created`.
- De-duplicate on phone; existing customer gets a new case.
- Manual in-app entry uses the **same code path**.
- Phone mandatory, email optional — but push hard for email on the form.

### 5.2 Auto-assignment
- On case creation, assign to the active employee in the pool with the fewest
  non-terminal cases. Ties broken round-robin.
- Admin can reassign (logged) and can remove someone from the pool without
  deactivating them.

### 5.3 Pipelines
- **Sales**: New Enquiry → Contacted → Quoted → Won / Lost
- **Processing**: the 17-stage superset, filtered per service (§3.14)
- **Renewal**: Due Soon → Contacted → In Process → Renewed (visa/passport)
- Board **and** list view. The board is unusable on a phone at 200 cases, and
  employees live on phones — **the list is not a fallback, it's the primary view
  for most of the team.**
- Each card shows its own stage path, its owner, its money, and a stuck flag.
- Employees see only their own cards; admin sees all, filterable.

### 5.4 Invoicing
- Pick service (4 params) + pax → lines auto-populate with correct qty and rate.
- Every line editable: rate, qty, add free-text line, delete line.
- GST column, defaults zero, configurable per line.
- Amount-in-words line *(currently dropped in favour of a free-text note —
  inherited default, needs Kalari's confirmation)*.
- One-click PDF: header, No / Description / Qty / Rate / GST / Net Amount,
  Total, Grand Total.
- Admin-only catalogue rate editor. Changes never touch issued invoices.
- Email the PDF from the invoice screen in one click.

### 5.5 Payments
- Record against an invoice: amount, date, method (**cash / transfer / cheque** —
  no card, online payments are out of scope), reference.
- Partial and multiple payments per invoice.
- Status derives. Outstanding shows on customer, case, and dashboard.
- Overdue = unpaid past N days from issue (N configurable, default 7).
- CSV export for the accountant.

### 5.6 Email layer
- Adapter-based, provider-swappable by config.
- Sending domain with **SPF, DKIM and DMARC** — a PRO-services firm emailing
  invoices from an unauthenticated shared IP lands in spam. This is a real setup
  task, not a checkbox.
- Bounce/complaint webhooks → suppression list. Never send to a suppressed
  address.
- **Hard bounce, or no email on file → flag the customer and raise a CallTask.**
  This is the bridge: email failure becomes a human call, not a silent drop.
- Retry with backoff; terminal failure → CallTask.
- Open tracking, surfaced per template, so Kalari can see whether email actually
  works for their customers.
- **Transactional mail is exempt from consent. Promotional mail is not** —
  re-engagement, referral and review asks need a logged consent record and an
  unsubscribe link. Consent cannot be inferred from an existing customer
  relationship. Retain proof.
- Admin-only template editor. Every email logged to the customer profile.
- **Sandbox mode** routing all sends to a log table. Non-negotiable.
- Admin kill switch.

### 5.7 Call queue — the replacement for WhatsApp/SMS
The system decides **who needs calling and why**; a human calls and logs it.

| Trigger | Reason | Priority |
|---|---|---|
| Invoice overdue, 2 reminders unopened | Payment chase | High |
| Documents outstanding 3 days | Doc collection | High |
| Email bounced / no email on file | Unreachable | High |
| Quote unanswered 3 days | Quote follow-up | Medium |
| Case stuck >7 days | Case unblock | Medium |
| Renewal due (22 months) | Renewal | Medium |
| Case complete + 30/60 days | Re-engagement | Low |

- **"My Call List"** is the employee's home screen: today's calls, priority then
  due date, with name, number, reason, and one line of context.
- **Tap to call** — the number is a `tel:` link.
- Log an outcome: reached-resolved · promised payment (captures date) · needs
  callback (captures date) · no answer · busy · switched off · wrong number ·
  refused.
- No-answer/busy/switched-off requeue +1 day; after 3 attempts escalate to admin
  and stop.
- **Promise tracking**: a promised payment creates a dated task that auto-closes
  if the payment arrives first.
- Wrong number flags the customer and raises an admin task.
- Full history on the customer profile — accountability without telephony or
  WhatsApp integration.
- Admin call dashboard: calls per employee per day, outcome distribution, average
  attempts to reach, ageing tasks. *If someone marks everything "no answer" in
  four seconds, this surfaces it.*
- Duration is a manual, optional field. **No call recording, no telephony** —
  that drags back the regulatory problem this design exists to avoid.

### 5.8 Customer status portal
- Magic link per customer. No password. Long random token, revocable, expires 90
  days after completion.
- Shows: current stage, what happens next, documents outstanding, invoice total /
  paid / outstanding, contact button.
- Read-only. Mobile-first — it is always opened on a phone.
- Linked in every customer email. **Cuts the inbound "where is my booking /
  visa" calls, which is the actual daily cost to the team.**

### 5.9 Dashboards
- **Admin**: new leads · active cases by pipeline · revenue collected · total
  outstanding · cases per employee · stuck cases · overdue invoices · renewals
  due in 90 days · calls today · overdue call tasks · email delivery + open rate
  · leads by source.
- **Employee**: my call list · my active cases · my stuck cases · my unpaid
  invoices. **No company revenue.**

### 5.10 Automations
Scheduled worker. Each rule writes an Event; delivery is not its concern.

| Trigger | Email | CallTask |
|---|---|---|
| Lead created | welcome + portal link | — |
| Stage changed | ✅ | — |
| Docs missing at stage entry | ✅ | after 3 days |
| Quote unanswered 3 days | ✅ | ✅ |
| Invoice unpaid past N | every 3 days, max 5 | after 2 unopened |
| Invoice overdue | ✅ | ✅ high |
| Case complete | thank you | — |
| Complete + 30/60 days | promo (needs consent) | ✅ low |
| Visa issue date + 22 months (renewal window) | ✅ | ✅ |
| Stage unchanged 7 days | admin | ✅ |
| Daily 08:00 / weekly digest | admin | — |

- Every automation individually toggleable.
- Reminders suppress mid-sequence once paid.

### 5.11 Integration placeholders
Three admin-only tabs — **the tabs are in scope, the integrations are not.**
Each shows what it will do, a `Coming Soon` chip, and a **Request** button that
actually writes a record and notifies 7Gence. After clicking: `Requested — we'll
be in touch`. Each carries the line *"Not included in the current build.
Available as a separate module"* — say it in the product, not just the contract.
Feature-flagged so shipping one is a flag flip, not a nav rework.

---

## 6. Screens

| Screen | Who | Notes |
|---|---|---|
| Login | all | Email + password. No signup. |
| Dashboard | both | Role-scoped; employees never see revenue |
| Pipeline board | both | Desktop; per-card stage paths |
| Pipeline list | both | **Primary on mobile** |
| Case / customer profile | both | Money block, stage progress, timeline, docs, call history |
| Customers list | both | Findable by name or phone in <5s |
| Invoice generator | both | 4-param selector, editable lines |
| Invoice (issued) | both | Immutable; void/credit note are admin-only |
| Invoice PDF | — | Header + lines + totals; GSTIN pending |
| My Call List | employee | The employee home screen |
| Log Call | employee | Bottom sheet; didn't-reach = one tap |
| Service catalogue | admin | Rate editor, change history, "future invoices only" |
| Integrations | admin | Placeholder tabs |
| Status portal | customer | Magic link, read-only, mobile |

---

## 7. Out of scope — the old docs are lying

WhatsApp (any form) · SMS · Meta/Google/Instagram **integrations** (the tabs
stay) · online payments · call recording · telephony · GoHighLevel · WAGHL · n8n
· native apps · multi-tenant · i18n · accounting API sync (CSV instead).

---

## 8. Success criteria

1. Any customer findable in under 5 seconds by name or phone.
2. One-click invoice for any of the 11 services, matching the catalogue **to
   the paisa** (placeholder rates until Kalari confirms the real card).
3. Zero unassigned cases.
4. Dashboard outstanding always reconciles to invoices minus payments.
5. No case sits in a stage >7 days without someone being told.
6. No customer owing money goes 7 days without an email or a logged call attempt.

---

## 9. Before go-live

**Get the real rate card and the GST treatment first** — every seeded rate is a
placeholder and no real invoice may be issued until Kalari confirms figures in
writing. Then: what percentage of Kalari's customers have a usable email
address? Under 50% and email is decorative — **the call queue is the actual
product** (the build already assumes this: email ships off).

The full blocked list is in `CLAUDE.md` under "BLOCKED ON KALARI".
