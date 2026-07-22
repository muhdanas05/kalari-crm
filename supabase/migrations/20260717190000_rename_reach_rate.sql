-- ============================================================================
-- 0026 · Rename call_report.reach_rate → reach_pct.
--
-- guard-money-columns.mjs flagged `reach_rate numeric` as FLOAT_MONEY. That is a
-- correct catch of a real naming problem, not a false positive to suppress: the
-- guard's rule is "numeric is fine for a percentage, just don't NAME it like
-- money", and `*rate*` reads as money. reach_rate is a 0–100 percentage.
--
-- Renaming keeps the guard strict — the alternative (teaching it to ignore
-- "rate") would blind it to a genuinely float-typed `vat_rate` or `fx_rate`
-- later. A percentage that isn't called a rate is the cheaper fix.
--
-- Return-column rename ⇒ drop + recreate.
-- ============================================================================

drop function if exists public.call_report(integer);

create or replace function public.call_report(p_days integer default 7)
returns table (
  user_id            uuid,
  user_name          text,
  calls              bigint,
  reached            bigint,
  promised           bigint,
  no_answer          bigint,
  wrong_number       bigint,
  reach_pct          numeric,   -- 0–100. NOT money.
  avg_seconds        numeric,
  open_tasks         bigint,
  overdue_tasks      bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with window_logs as (
    select l.* from public.call_logs l
     where l.occurred_at >= now() - make_interval(days => p_days)
  )
  select
    p.id,
    p.name,
    count(w.id)                                                    as calls,
    count(*) filter (where w.outcome = 'reached_resolved')         as reached,
    count(*) filter (where w.outcome = 'promised_payment')         as promised,
    count(*) filter (where w.outcome in ('no_answer','busy','switched_off')) as no_answer,
    count(*) filter (where w.outcome = 'wrong_number')             as wrong_number,
    case when count(w.id) = 0 then 0
         else round(
           100.0 * count(*) filter (
             where w.outcome in ('reached_resolved','promised_payment')
           ) / count(w.id), 0)
    end                                                            as reach_pct,
    round(avg(w.duration_seconds), 0)                              as avg_seconds,
    (select count(*) from public.call_tasks t
      where t.assigned_user_id = p.id and t.status = 'open')       as open_tasks,
    (select count(*) from public.call_tasks t
      where t.assigned_user_id = p.id and t.status = 'open'
        and t.due_on < public.today_kolkata())                       as overdue_tasks
  from public.profiles p
  left join window_logs w on w.user_id = p.id
  where p.active and p.archived_at is null
  group by p.id, p.name
  order by calls desc, p.name;
$$;

comment on function public.call_report is
  'Follow-ups per employee. Reports the outcome MIX, not a leaderboard of raw '
  'volume — volume with a zero reach rate is the thing worth seeing (§5.7). '
  'reach_pct is a 0–100 percentage, not money.';

revoke all on function public.call_report(integer) from public, anon;
grant execute on function public.call_report(integer) to authenticated;
