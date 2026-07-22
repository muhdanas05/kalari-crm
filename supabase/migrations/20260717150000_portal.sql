-- ============================================================================
-- 0019 · The customer status portal.
--
-- §5.8: a magic link per customer, no password, read-only, mobile-first.
-- Its purpose is blunt and worth stating: "stop customers calling your office to
-- ask where their visa is."
--
-- THE PROBLEM: `anon` holds zero grants on this database — every table returns
-- 42501. That is a good posture and this migration does not weaken it.
--
-- WHY NOT grant anon a portal_read(token) RPC: the anon key is public and ships
-- to every browser. An anon-callable RPC can be hammered directly at Supabase's
-- REST endpoint, at any rate, with no limiter we control and no logs we own. It
-- would also be the first hole in a currently-perfect posture, and holes get
-- widened by the next person in a hurry.
--
-- INSTEAD: SECURITY DEFINER, granted ONLY to service_role, reached through a
-- Route Handler we own (src/app/portal/[token]/page.tsx → lib/portal/read.ts).
-- We keep the rate limit, the logging and the 404 semantics on our side.
-- ============================================================================

-- ── Issue a token ───────────────────────────────────────────────────────────
--
-- §3.26: portal tokens are credentials — store a hash, show the token once.
-- Generated IN the database so the raw value never travels further than the one
-- response that shows it.
create or replace function public.issue_portal_token(p_customer_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not (select public.is_active_user()) then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not (select public.can_access_customer(p_customer_id)) then
    raise exception 'not authorised for this customer' using errcode = '42501';
  end if;

  -- 32 bytes of CSPRNG. Unbrute-forceable; the rate limit is cost control, not
  -- the security boundary.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  update public.customers
     set portal_token_hash = extensions.digest(v_token, 'sha256'),
         portal_issued_at  = now(),
         portal_revoked_at = null
   where id = p_customer_id;

  if not found then
    raise exception 'customer % not found', p_customer_id using errcode = 'P0002';
  end if;

  -- Returned ONCE. There is no way to read it back: the column holds a hash.
  return v_token;
end $$;

create or replace function public.revoke_portal_token(p_customer_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select public.is_active_user()) then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not (select public.can_access_customer(p_customer_id)) then
    raise exception 'not authorised for this customer' using errcode = '42501';
  end if;

  update public.customers
     set portal_revoked_at = now()
   where id = p_customer_id;
end $$;

-- ── Read the portal ─────────────────────────────────────────────────────────
create or replace function public.portal_read(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer public.customers%rowtype;
  v_case     record;
  v_docs     jsonb;
  v_money    jsonb;
begin
  -- Hash INSIDE the function: the scheme has one home, and because Postgres
  -- parameterises $1 the raw token never lands in pg_stat_statements.
  select * into v_customer
    from public.customers c
   where c.portal_token_hash = extensions.digest(p_token, 'sha256')
     and c.portal_revoked_at is null
     and c.archived_at is null;

  if not found then
    -- Flatten the timing difference between "no such token" and "revoked".
    perform pg_sleep(0.15);
    return null;
  end if;

  -- The customer's most recent live case.
  select c.id, c.visa_issue_date, s.name as stage_name, s.sort_order as stage_sort,
         sv.name as service_name, p.name as pipeline_name, c.status,
         c.stage_entered_at
    into v_case
    from public.cases c
    join public.stages s     on s.id = c.stage_id
    join public.pipelines p  on p.id = c.pipeline_id
    left join public.services sv on sv.id = c.service_id
   where c.customer_id = v_customer.id and c.archived_at is null
   order by c.opened_at desc
   limit 1;

  -- §5.8's 90-day expiry after completion. A link that lives forever is a
  -- credential nobody remembers issuing.
  if v_case.status = 'closed'
     and v_case.stage_entered_at < now() - interval '90 days' then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('label', cd.label) order by cd.label), '[]'::jsonb)
    into v_docs
    from public.case_documents cd
   where cd.case_id = v_case.id and cd.state = 'outstanding';

  select jsonb_build_object(
           'total_paise',       coalesce(sum(i.total_paise), 0),
           'paid_paise',        coalesce(sum(i.paid_paise), 0),
           'outstanding_paise', coalesce(sum(i.outstanding_paise), 0)
         )
    into v_money
    from public.invoices_v i
   where i.customer_id = v_customer.id and i.lifecycle = 'issued';

  -- Deliberately narrow. No passport, no phone, no attribution, no internal
  -- notes, no employee names — this payload leaves the building.
  return jsonb_build_object(
    'customer', jsonb_build_object('name', v_customer.name),
    'case', case when v_case.id is null then null else jsonb_build_object(
      'stage',        v_case.stage_name,
      'service',      v_case.service_name,
      'pipeline',     v_case.pipeline_name,
      'stage_path',   (
        select coalesce(jsonb_agg(jsonb_build_object('name', st.name) order by sa.sort_order), '[]'::jsonb)
          from public.stage_applicability sa
          join public.stages st on st.id = sa.stage_id
         where sa.service_id = (select service_id from public.cases where id = v_case.id)
      ),
      'complete',     (v_case.status = 'closed')
    ) end,
    'documents_outstanding', v_docs,
    'money', v_money
  );
end $$;

comment on function public.portal_read is
  'Reached ONLY via service_role from a Route Handler we own — never granted to '
  'anon. The anon key is public, so an anon-callable version would be hammerable '
  'with no limiter we control. Returns null (-> 404) on miss; never reveals '
  'whether a token existed.';

-- ── Rate limiting, in Postgres ──────────────────────────────────────────────
--
-- NOT in-memory: Netlify functions are stateless and horizontally scaled, so a
-- process-local limiter is decorative — it resets on every cold start and is
-- per-instance. This is cost control and defence in depth; a 32-byte token is
-- not brute-forceable regardless.
create table public.portal_attempts (
  ip       text not null,
  minute   timestamptz not null,
  hits     integer not null default 1,
  primary key (ip, minute)
);

create or replace function public.portal_rate_ok(p_ip text, p_limit integer default 30)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into public.portal_attempts (ip, minute, hits)
  values (p_ip, date_trunc('minute', now()), 1)
  on conflict (ip, minute) do update set hits = public.portal_attempts.hits + 1
  returning hits into v_hits;

  -- Cheap opportunistic GC; no cron needed for a table this small.
  delete from public.portal_attempts where minute < now() - interval '1 hour';

  return v_hits <= p_limit;
end $$;

alter table public.portal_attempts enable row level security;
revoke all on public.portal_attempts from public, anon, authenticated;

revoke all on function public.portal_read(text) from public, anon, authenticated;
revoke all on function public.portal_rate_ok(text, integer) from public, anon, authenticated;
grant execute on function public.portal_read(text) to service_role;
grant execute on function public.portal_rate_ok(text, integer) to service_role;

grant execute on function public.issue_portal_token(uuid) to authenticated;
grant execute on function public.revoke_portal_token(uuid) to authenticated;
