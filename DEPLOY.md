# Deploying to Railway

Roughly 10 minutes. At the end you have a URL you can send to Kalari.

---

## 1. Create the project

1. Go to **[railway.app](https://railway.app)** → sign in with GitHub.
2. **New Project → Deploy from GitHub repo**.
3. Pick the Kalari CRM repo (push this repo to GitHub first).
   Railway needs access to your private repos — if the repo isn't listed, click
   *Configure GitHub App* and grant it.

Railway starts building immediately. **It will fail the first time.** That's
expected: it has no environment variables yet. Add them next.

---

## 2. Add the environment variables

Project → your service → **Variables** → **Raw Editor**, and paste this. Fill
each value from your local `.env` — it is gitignored, so it is not in the repo
and Railway cannot see it.

```
NEXT_PUBLIC_SUPABASE_URL=https://uedhlrkmpediekclodkb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from .env>
SUPABASE_SERVICE_ROLE_KEY=<from .env>
PII_ENCRYPTION_KEY=<from .env>
PII_HASH_PEPPER=<from .env>
INVOICE_OVERDUE_DAYS=7
TZ=Asia/Kolkata
NODE_ENV=production
```

Two notes:

- **`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD`
  are NOT needed here.** They are CLI tooling credentials for your laptop. The
  access token especially — it controls your whole Supabase account, not just
  this project. Don't paste it into a deploy platform that doesn't need it.
- **`PII_ENCRYPTION_KEY` must be the same value as local.** It decrypts
  passports. A different key means every stored passport becomes unreadable, with
  no way back. Before you paste it anywhere, make sure it is escrowed somewhere
  other than your laptop (a password manager). It exists in no backup and no
  database dump. The Kalari keys were generated fresh on 2026-07-23.

---

## 3. Generate the public URL

Service → **Settings → Networking → Generate Domain**.

You'll get something like `kalari-crm-production.up.railway.app`. Copy it,
then add one more variable:

```
NEXT_PUBLIC_SITE_URL=https://<your-domain>.up.railway.app
```

This is what customer portal links are built from. If it's wrong or missing, the
portal links you hand to customers point nowhere. Redeploy after adding it.

---

## 4. Point Supabase at the domain

Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://<your-domain>.up.railway.app`
- **Redirect URLs**: add `https://<your-domain>.up.railway.app/**`

Without this, sign-in can bounce to `localhost:3000` in some flows.

---

## 5. Check it

Open the domain. You should land on `/login` with the Kalari Travels mark.

Then walk: Dashboard → Pipeline → My Call List → Admin → Service Catalogue.
The catalogue page must show the red **"every rate is an unconfirmed
placeholder"** panel — that's the guard against issuing a real invoice from
stand-in figures.

---

## 6. Users

The Kalari Supabase project starts with **no users**. Create accounts from your
laptop (this needs `.env`, so it does not run on Railway):

```bash
npm run create-user -- owner@kalaritravels.in 'a-real-password' 'Kalari Admin' admin
npm run create-user -- staff1@kalaritravels.in 'a-real-password' 'Staff Name' employee
```

There is deliberately **no signup page** — the admin creates users
(ARCHITECTURE.md §3.20). To reset a forgotten password, use the Supabase
dashboard → Authentication → Users → ⋯ → *Send password recovery*.

---

## 7. Before you send Kalari the link

- [ ] Get the **real rate card in writing** and replace the placeholder
      catalogue (seed migration + fixture + pinned totals together).
- [ ] GSTIN + per-service GST treatment from their accountant.
- [ ] Bank account / IFSC / UPI for the payment instructions
      (`email.payment_instructions` in automation settings).
- [ ] 30-minute stage-path review with their operations person.
- [ ] Escrow `PII_ENCRYPTION_KEY` + `PII_HASH_PEPPER`.
- [ ] Reset the Supabase DB password (the one recorded at handover did not
      match) and update `.env`.

---

## Cost

Railway Hobby is $5/month and this app sits inside it (Railway + Supabase free
tier + an email provider later).

---

## Notes

**Region.** The Supabase project is in `ap-southeast-1` (Singapore) — the
closest Supabase region pairing for an India-based team on Railway. Railway
defaults to US West; **set the Railway region to Singapore** (Settings →
Region) so app and database sit together. This matters more than any code
optimisation.

**Custom domain.** Settings → Networking → Custom Domain, then add the CNAME
Railway shows you. Worth doing before Kalari sees it — a `crm.kalaritravels.in`
subdomain reads very differently from `…up.railway.app`, and you need the
domain for email (SPF/DKIM/DMARC) anyway.

**Deploys.** Every push to `main` redeploys automatically. Roll back from the
Deployments tab.
