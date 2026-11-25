-- Tally Dashboard Phase 1–3 (Overview, Sync Health, Reconciliation) — admin-only, read-only functions. No table, index or data change.
-- NOT yet applied to production: needs the owner's explicit "yes". Re-runnable (create or replace). Needs schema_tally_bridge.sql.
-- Every function raises 42501 unless my_role() = 'admin'. Cancelled/deleted handling is stated per function.

-- 1) Overview: scope (company/period/type) figures + lifetime company facts + GUID-collision facts.
create or replace function public.tally_overview(p_company text default null, p_from date default null, p_to date default null, p_vtype text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() is distinct from 'admin' then raise exception 'admin only' using errcode = '42501'; end if;
  return (
    with s as materialized (
      select company, guid, vdate, vtype, cancelled from tally_vouchers
      where not deleted and (p_company is null or company = p_company) and (p_from is null or vdate >= p_from)
        and (p_to is null or vdate <= p_to) and (p_vtype is null or vtype = p_vtype)),
    life as (
      select company, count(*) filter (where not deleted) as life_rows, count(*) filter (where cancelled and not deleted) as cancelled,
             count(*) filter (where deleted) as deleted, min(vdate) filter (where not deleted) as first_date, max(vdate) filter (where not deleted) as last_date
      from tally_vouchers group by company),
    led as (select company, count(*) as ledgers from tally_ledgers group by company),
    sc as (select company, count(*) as rows, count(*) filter (where cancelled) as scope_cancelled from s group by company),
    per as (
      select l.company, coalesce(sc.rows, 0) as rows, coalesce(sc.scope_cancelled, 0) as scope_cancelled, l.life_rows, coalesce(led.ledgers, 0) as ledgers,
             l.cancelled, l.deleted, l.first_date, l.last_date
      from life l left join sc using (company) left join led using (company)
      where p_company is null or l.company = p_company),
    col as (
      select count(*) as identities, count(*) filter (where a.entries = b.entries and a.amount = b.amount and a.vdate = b.vdate and a.vno is not distinct from b.vno) as identical
      from tally_vouchers a join tally_vouchers b on a.guid = b.guid and a.company < b.company where not a.deleted and not b.deleted)
    select jsonb_build_object(
      'generated_at', now(),
      'scope', jsonb_build_object('rows', (select count(*) from s), 'unique_guids', (select count(distinct guid) from s),
                                  'cancelled', (select count(*) from s where cancelled), 'companies', (select count(*) from per where rows > 0)),
      'by_company', coalesce((select jsonb_agg(to_jsonb(per) order by per.rows desc, per.company) from per), '[]'::jsonb),
      'by_month', coalesce((select jsonb_agg(to_jsonb(x) order by x.m) from (
          select to_char(vdate, 'YYYY-MM') as m, count(*) as n from s group by 1 order by 1 desc limit 36) x), '[]'::jsonb),
      'by_type', coalesce((select jsonb_agg(to_jsonb(x) order by x.n desc) from (
          select coalesce(vtype, '') as vtype, count(*) as n from s group by 1) x), '[]'::jsonb),
      'daily', coalesce((select jsonb_agg(to_jsonb(x) order by x.d) from (
          select vdate as d, count(*) as n from s where vdate >= (select max(vdate) from s) - 29 group by 1) x), '[]'::jsonb),
      'collisions', (select to_jsonb(col) from col))
  );
end $$;

-- 2) Sync health: current open issue (latest run failed) kept apart from history (failed in window, later recovered).
create or replace function public.tally_sync_health(p_days int default 7)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d int := least(greatest(coalesce(p_days, 7), 1), 90);
begin
  if my_role() is distinct from 'admin' then raise exception 'admin only' using errcode = '42501'; end if;
  return (
    with r as (
      select company,
             max(finished_at) filter (where ok) as last_ok_at, max(started_at) as last_run_at,
             (array_agg(ok order by started_at desc))[1] as last_run_ok,
             (array_agg(left(error, 300) order by started_at desc))[1] as last_error,
             count(*) filter (where ok is false and started_at > now() - make_interval(days => d)) as failed_window,
             max(started_at) filter (where ok is false) as last_failed_at,
             count(*) filter (where started_at > now() - make_interval(days => d)) as runs_window
      from tally_sync_runs group by company),
    per as (select r.*, (r.last_run_ok is false) as open_issue, (r.last_run_ok is not false and r.failed_window > 0) as recovered from r)
    select jsonb_build_object('days', d, 'generated_at', now(),
      'open_issues', (select count(*) from per where open_issue),
      'failed_window', (select coalesce(sum(failed_window), 0) from per),
      'recovered', (select count(*) from per where recovered),
      'companies', coalesce((select jsonb_agg(to_jsonb(per) order by per.open_issue desc, per.company) from per), '[]'::jsonb))
  );
end $$;

-- 3) Sync runs list with filters and pagination.
create or replace function public.tally_sync_runs_list(p_company text default null, p_ok boolean default null, p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare lim int := least(greatest(coalesce(p_limit, 50), 1), 200); off int := greatest(coalesce(p_offset, 0), 0);
begin
  if my_role() is distinct from 'admin' then raise exception 'admin only' using errcode = '42501'; end if;
  return (
    with f as (select id, company, kind, from_date, to_date, started_at, finished_at, ok, ledgers, vouchers, left(error, 300) as error, bridge_version
               from tally_sync_runs where (p_company is null or company = p_company) and (p_ok is null or ok is not distinct from p_ok)),
         pg as (select * from f order by started_at desc, id desc limit lim offset off)
    select jsonb_build_object('total', (select count(*) from f), 'limit', lim, 'offset', off,
      'rows', coalesce((select jsonb_agg(to_jsonb(pg) order by pg.started_at desc, pg.id desc) from pg), '[]'::jsonb))
  );
end $$;

-- 4) Reconciliation: same GUID in two companies. Nothing is merged or hidden; content is compared.
create or replace function public.tally_recon_shared(p_limit int default 50, p_offset int default 0, p_only_differing boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare lim int := least(greatest(coalesce(p_limit, 50), 1), 200); off int := greatest(coalesce(p_offset, 0), 0);
begin
  if my_role() is distinct from 'admin' then raise exception 'admin only' using errcode = '42501'; end if;
  return (
    with j as materialized (
      select a.guid, a.company as a_company, b.company as b_company, a.vdate as a_date, b.vdate as b_date, a.vtype as a_type, b.vtype as b_type,
             a.vno as a_vno, b.vno as b_vno, a.amount as a_amount, b.amount as b_amount,
             jsonb_array_length(a.entries) as a_lines, jsonb_array_length(b.entries) as b_lines,
             (a.entries = b.entries and a.amount = b.amount and a.vdate = b.vdate and a.vno is not distinct from b.vno) as same_content
      from tally_vouchers a join tally_vouchers b on a.guid = b.guid and a.company < b.company where not a.deleted and not b.deleted),
    f as (select * from j where not p_only_differing or not same_content),
    pg as (select * from f order by a_date desc, guid limit lim offset off)
    select jsonb_build_object('total', (select count(*) from j), 'identical', (select count(*) from j where same_content),
      'differing', (select count(*) from j where not same_content), 'listed', (select count(*) from f), 'limit', lim, 'offset', off,
      'by_pair', coalesce((select jsonb_agg(to_jsonb(x)) from (select a_company, b_company, count(*) as n, min(a_date) as first_date, max(a_date) as last_date from j group by 1, 2) x), '[]'::jsonb),
      'by_type', coalesce((select jsonb_agg(to_jsonb(x) order by x.n desc) from (select a_type as vtype, count(*) as n, count(*) filter (where a_amount = b_amount) as same_amount from j group by 1) x), '[]'::jsonb),
      'rows', coalesce((select jsonb_agg(to_jsonb(pg) order by pg.a_date desc, pg.guid) from pg), '[]'::jsonb))
  );
end $$;

-- 5) Reconciliation: Tally mirror (Receipt/Payment of one company) vs the app's imported Tally cash vouchers (cash_tally_vouchers).
--    Voucher numbers are NOT used as identity (the two sources number differently); the match key is date + type + amount + ledger name.
--    Returns a summary and a page of exceptions: app_only, mirror_only, count_diff (same key, different number of vouchers).
create or replace function public.tally_recon_cash(p_company text default 'Nabiad-Cash & Bank', p_from date default null, p_to date default null, p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare lim int := least(greatest(coalesce(p_limit, 50), 1), 200); off int := greatest(coalesce(p_offset, 0), 0);
  lo date; hi date;
begin
  if my_role() is distinct from 'admin' then raise exception 'admin only' using errcode = '42501'; end if;
  -- default period = the period the app's imported Tally cash vouchers cover (comparing outside it would flag everything as mirror_only)
  select coalesce(p_from, min(date)), coalesce(p_to, max(date)) into lo, hi from cash_tally_vouchers;
  return (
    with m as materialized (
      select v.guid, v.vdate as d, lower(v.vtype) as t, v.amount, v.vno,
             (select array_agg(distinct lower(btrim(e->>'ledger'))) from jsonb_array_elements(v.entries) e) as leds
      from tally_vouchers v where v.company = p_company and v.vtype in ('Receipt', 'Payment') and not v.deleted and not v.cancelled
        and v.vdate between lo and hi),
    a as materialized (
      select date as d, type as t, amount, ref, ledger, lower(btrim(ledger)) as led from cash_tally_vouchers
      where date between lo and hi),
    ag as (select d, t, amount, led, min(ledger) as ledger, count(*) as n_app from a group by 1, 2, 3, 4),
    agm as (select ag.*, (select count(*) from m where m.d = ag.d and m.t = ag.t and m.amount = ag.amount and ag.led = any(m.leds)) as n_mirror from ag),
    mo as (select m.d, m.t, m.amount, m.vno, (select string_agg(x, ' · ') from unnest(m.leds) x) as ledger from m
           where not exists (select 1 from a where a.d = m.d and a.t = m.t and a.amount = m.amount and a.led = any(m.leds))),
    ex as (
      select 'app_only' as kind, d, t, amount, ledger, null::text as vno, n_app as app_n, 0::bigint as mirror_n from agm where n_mirror = 0
      union all select 'count_diff', d, t, amount, ledger, null, n_app, n_mirror from agm where n_mirror > 0 and n_mirror <> n_app
      union all select 'mirror_only', d, t, amount, ledger, vno, 0, 1 from mo),
    pg as (select * from ex order by d desc, kind, amount desc limit lim offset off)
    select jsonb_build_object(
      'company', p_company, 'from', lo, 'to', hi,
      'app_rows', (select count(*) from a), 'mirror_vouchers', (select count(*) from m),
      'matched_rows', (select coalesce(sum(n_app), 0) from agm where n_mirror = n_app),
      'app_only', (select coalesce(sum(n_app), 0) from agm where n_mirror = 0),
      'count_diff_groups', (select count(*) from agm where n_mirror > 0 and n_mirror <> n_app),
      'mirror_only', (select count(*) from mo),
      'same_voucher_no', (select count(*) from m join a on a.d = m.d and a.t = m.t and nullif(regexp_replace(a.ref, '\D', '', 'g'), '') = nullif(regexp_replace(coalesce(m.vno, ''), '\D', '', 'g'), '')),
      'exceptions', (select count(*) from ex), 'limit', lim, 'offset', off,
      'rows', coalesce((select jsonb_agg(to_jsonb(pg) order by pg.d desc, pg.kind, pg.amount desc) from pg), '[]'::jsonb))
  );
end $$;

-- 6) Reconciliation: cancelled and deleted vouchers (source changes are tracked, never silently removed).
create or replace function public.tally_recon_changes(p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() is distinct from 'admin' then raise exception 'admin only' using errcode = '42501'; end if;
  return (
    select jsonb_build_object('total', (select count(*) from tally_vouchers where cancelled or deleted),
      'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.vdate desc) from (
        select company, vdate, vtype, vno, amount, cancelled, deleted, synced_at from tally_vouchers where cancelled or deleted
        order by vdate desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) x), '[]'::jsonb)));
  end $$;

-- 7) Reconciliation: coverage — days with vouchers, and gaps longer than 7 days between consecutive voucher dates, per company.
create or replace function public.tally_recon_coverage(p_gap_days int default 7)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g int := least(greatest(coalesce(p_gap_days, 7), 2), 90);
begin
  if my_role() is distinct from 'admin' then raise exception 'admin only' using errcode = '42501'; end if;
  return (
    with dd as (select distinct company, vdate from tally_vouchers where not deleted),
    lg as (select company, vdate, lag(vdate) over (partition by company order by vdate) as prev from dd),
    gaps as (select company, prev + 1 as gap_from, vdate - 1 as gap_to, vdate - prev - 1 as days from lg where prev is not null and vdate - prev - 1 >= g),
    per as (select company, min(vdate) as first_date, max(vdate) as last_date, count(*) as days_with, max(vdate) - min(vdate) + 1 as span_days from dd group by company)
    select jsonb_build_object('gap_days', g,
      'companies', coalesce((select jsonb_agg(to_jsonb(x) order by x.company) from (
        select per.*, (select count(*) from gaps where gaps.company = per.company) as gaps from per) x), '[]'::jsonb),
      'gaps', coalesce((select jsonb_agg(to_jsonb(x) order by x.days desc) from (select * from gaps order by days desc limit 60) x), '[]'::jsonb))
  );
end $$;

-- 8) Voucher balance check: debit = credit per voucher (cancelled and deleted excluded). Stock vouchers have no ledger lines and are skipped.
create or replace function public.tally_balance_check(p_company text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() is distinct from 'admin' then raise exception 'admin only' using errcode = '42501'; end if;
  return (
    with t as (select company, vtype, (select coalesce(sum((e->>'amount')::numeric), 0) from jsonb_array_elements(entries) e) as s
               from tally_vouchers where not deleted and not cancelled and jsonb_array_length(entries) > 0 and (p_company is null or company = p_company))
    select jsonb_build_object('generated_at', now(), 'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.unbalanced desc, x.vtype) from (
      select coalesce(vtype, '') as vtype, count(*) as total, count(*) filter (where abs(s) < 0.01) as balanced, count(*) filter (where abs(s) >= 0.01) as unbalanced
      from t group by 1) x), '[]'::jsonb))
  );
end $$;

do $$ declare f text; begin
  foreach f in array array['tally_overview(text,date,date,text)', 'tally_sync_health(int)', 'tally_sync_runs_list(text,boolean,int,int)', 'tally_recon_shared(int,int,boolean)',
    'tally_recon_cash(text,date,date,int,int)', 'tally_recon_changes(int)', 'tally_recon_coverage(int)', 'tally_balance_check(text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop; end $$;
