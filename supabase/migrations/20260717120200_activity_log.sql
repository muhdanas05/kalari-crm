-- ============================================================================
-- 0003 · ActivityLog + the generic audit trigger.
--
-- Sits after profiles because activity_log.user_id carries an FK to it. Every
-- table created AFTER this one attaches the audit trigger inside its own
-- migration; profiles is the one exception and is wired at the bottom of this
-- file, since it necessarily predates the trigger function.
--
-- CLAUDE.md §4 / PRD §6.1: "Every write to Customer / Case / Invoice / Payment
-- writes to ActivityLog with before and after values."
-- ============================================================================

create table public.activity_log (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),

  -- Who. `user_id` is NULLABLE because service_role JWTs carry no `sub`, so
  -- auth.uid() is NULL for cron/webhook writes. The discriminator is what keeps
  -- the trail honest: without it, "the cron did it" and "we lost the actor" are
  -- indistinguishable, and the log quietly becomes untrustworthy.
  actor_kind   public.actor_kind not null,
  user_id      uuid references public.profiles(id) on delete restrict,

  entity       text not null,
  entity_id    uuid,
  action       public.audit_action not null,

  before       jsonb,
  after        jsonb,
  changed_keys text[],

  -- Groups every row written by one logical operation (e.g. issue_invoice
  -- writing an invoice + 11 lines). pg_current_xact_id() supersedes the older
  -- txid_current(); it returns xid8.
  txid         xid8 not null default pg_current_xact_id(),
  request_id   text,

  constraint activity_actor_ck
    check ((actor_kind = 'user') = (user_id is not null)),
  -- An audit row that records neither a before nor an after state is noise.
  constraint activity_state_ck
    check (before is not null or after is not null)
);

create index activity_log_entity_idx
  on public.activity_log (entity, entity_id, occurred_at desc);

create index activity_log_user_idx
  on public.activity_log (user_id, occurred_at desc);

create index activity_log_txid_idx
  on public.activity_log (txid);

comment on table public.activity_log is
  'Append-only audit trail. Written ONLY by private.tg_activity_log(). No role '
  'holds insert/update/delete — see the revokes below.';

-- ── The trigger ─────────────────────────────────────────────────────────────
-- TG_ARGV[0] is a comma-separated redact list. Redacted keys are stripped from
-- BOTH before and after. Without this the audit log becomes an unencrypted,
-- un-access-logged copy of every PII field — defeating the whole PII design.
-- (passport_no never reaches this trigger at all: it lives in
-- private.customer_pii, not on public.customers.)

create or replace function private.tg_activity_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := auth.uid();
  v_redact text[] := string_to_array(coalesce(TG_ARGV[0], ''), ',');
  v_before jsonb;
  v_after  jsonb;
  v_kind   public.actor_kind;
begin
  v_before := case when TG_OP = 'INSERT' then null else to_jsonb(OLD) - v_redact end;
  v_after  := case when TG_OP = 'DELETE' then null else to_jsonb(NEW) - v_redact end;

  -- A no-op UPDATE (same values written back) is noise, not history.
  if TG_OP = 'UPDATE' and v_before is not distinct from v_after then
    return null;
  end if;

  -- auth.uid() reads request.jwt.claims, which PostgREST sets as a
  -- TRANSACTION-LOCAL GUC. The trigger runs in that same transaction, so it
  -- resolves normally for a user-session write.
  --
  -- Verified definition on this project (PG 17.6):
  --   coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
  --            (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'sub'))::uuid
  if v_actor is not null then
    v_kind := 'user';
  else
    v_kind := coalesce(
      nullif(current_setting('app.actor_kind', true), '')::public.actor_kind,
      'service'
    );
  end if;

  insert into public.activity_log
    (actor_kind, user_id, entity, entity_id, action, before, after, changed_keys, request_id)
  values (
    v_kind,
    v_actor,
    TG_TABLE_NAME,
    coalesce(to_jsonb(NEW) ->> 'id', to_jsonb(OLD) ->> 'id')::uuid,
    lower(TG_OP)::public.audit_action,
    v_before,
    v_after,
    (
      select array_agg(e.key order by e.key)
      from jsonb_each(coalesce(v_after, v_before)) e
      where coalesce(v_before, '{}'::jsonb) -> e.key
              is distinct from coalesce(v_after, '{}'::jsonb) -> e.key
    ),
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-request-id'
  );

  return null; -- AFTER row trigger: return value is ignored.
end $$;

comment on function private.tg_activity_log() is
  'Generic before/after audit trigger. Attach as: '
  'create trigger audit after insert or update or delete on public.<t> '
  'for each row execute function private.tg_activity_log(''col1,col2'');';

-- ── Lockdown ────────────────────────────────────────────────────────────────
-- VERIFIED: without these, anon and authenticated hold arwdDxtm on this table
-- and could forge or TRUNCATE the audit trail.
alter table public.activity_log enable row level security;

revoke all on public.activity_log from public, anon, authenticated;

grant select on public.activity_log to authenticated;

-- Deliberately no insert/update/delete grant to ANY role. The definer trigger
-- is the only writer, and it is not subject to these grants.
--
-- The admin SELECT policy needs public.is_admin(), which does not exist yet
-- (it reads profiles and is created in 0004). Until then RLS is on with no
-- policy = deny-all, which is the safe direction. Policy lands in 0004.

-- ── Attach the audit trigger to profiles ────────────────────────────────────
-- profiles (0002) predates this function, so its trigger is wired here rather
-- than in its own migration. Every LATER table wires its own.
create trigger audit
  after insert or update or delete on public.profiles
  for each row execute function private.tg_activity_log();
