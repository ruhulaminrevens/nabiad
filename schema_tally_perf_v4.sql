-- Tally Dashboard performance v4 (NABIAD, 2026-11-26). Additive and re-runnable. Apply only with the owner's "yes" and while the Bridge is idle.
-- Why (measured on production 25-26 Nov, admin role, which has statement_timeout = 8 s):
--   tally_recon_cash (default period) 12.0-15.5 s -> timeout   | tally_balance_check (all) 11.1 s -> timeout
--   tally_recon_coverage 8.0 s (at the limit)                   | tally_recon_changes 3.2 s (scans 318k rows to find 2) | tally_recon_shared 1.4-3.0 s
-- What:
--   1. tally_recon_cash rewritten set-based (unnest + hash joins instead of a row-by-row correlated scan). Same output: all exception rows were
--      compared with the old logic for 5 company/period cases (42..2,643 rows), identical. Adds a deterministic tie-break so pages are stable.
--   2. Partial index for cancelled/deleted vouchers (2 rows today) used by tally_recon_changes.
--   3. Debit=credit, coverage (7-day gaps) and the shared-GUID pair list are precomputed every 30 min by pg_cron (job tally_recon_refresh, at :05 and :35),
--      stored in tally_snapshot / tally_shared_pairs, and served from there with their computed time. tally_balance_check gains p_live for a live check
--      of ONE company (about 0.6 s for the largest company).
-- Rollback (run as postgres):
--   select cron.unschedule('tally_recon_refresh');
--   drop function if exists public.tally_balance_check(text, boolean); drop index if exists public.tally_vouchers_cancel_del;
--   then execute every row of public.fn_backup_20261126 (select def from public.fn_backup_20261126) to restore the previous bodies,
--   re-grant: grant execute on function public.tally_balance_check(text) to authenticated;
--   drop function public.tally_recon_refresh(), public.tally_balance_compute(text), public.tally_coverage_compute(integer), public.tally_shared_pairs_live();
--   drop table public.tally_shared_pairs; delete from public.tally_snapshot where key in ('balance','coverage_7','shared');

-- 0) backup of the bodies this migration replaces
create table if not exists public.fn_backup_20261126 (name text primary key, def text not null, saved_at timestamptz default now());
alter table public.fn_backup_20261126 enable row level security;
revoke all on public.fn_backup_20261126 from public, anon, authenticated;
insert into public.fn_backup_20261126(name, def)
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', pg_get_functiondef(p.oid) from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.proname in ('tally_recon_cash', 'tally_balance_check', 'tally_recon_coverage', 'tally_recon_shared')
on conflict (name) do nothing;

-- 1) cancelled / deleted lookup
create index if not exists tally_vouchers_cancel_del on public.tally_vouchers (vdate desc) where (cancelled or deleted);

-- 2) Tally vs Cash Book, set-based
create or replace function public.tally_recon_cash(p_company text default 'Nabiad-Cash & Bank', p_from date default null, p_to date default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare lim int := least(greatest(coalesce(p_limit, 50), 1), 200); off int := greatest(coalesce(p_offset, 0), 0);
  lo date; hi date;
begin
  if my_role() is distinct from 'admin' then raise exception 'admin only' using errcode = '42501'; end if;
  select coalesce(p_from, min(date)), coalesce(p_to, max(date)) into lo, hi from cash_tally_vouchers;
  return (
    with m as materialized (
      select v.guid, v.vdate as d, lower(v.vtype) as t, v.amount, v.vno,
             (select array_agg(distinct lower(btrim(e->>'ledger'))) from jsonb_array_elements(v.entries) e) as leds
      from tally_vouchers v where v.company = p_company and v.vtype in ('Receipt', 'Payment') and not v.deleted and not v.cancelled
        and v.vdate between lo and hi),
    ml as materialized (select m.guid, m.d, m.t, m.amount, x.led from m cross join lateral unnest(m.leds) x(led) where x.led is not null),
    a as materialized (
      select date as d, type as t, amount, ref, ledger, lower(btrim(ledger)) as led from cash_tally_vouchers
      where date between lo and hi),
    ag as materialized (select d, t, amount, led, min(ledger) as ledger, count(*) as n_app from a group by 1, 2, 3, 4),
    mlc as (select d, t, amount, led, count(*) as n from ml group by 1, 2, 3, 4),
    agm as materialized (select ag.*, coalesce(mlc.n, 0) as n_mirror from ag left join mlc using (d, t, amount, led)),
    hit as materialized (select distinct ml.guid from ml join (select distinct d, t, amount, led from a) ak using (d, t, amount, led)),
    mo as materialized (select m.d, m.t, m.amount, m.vno, (select string_agg(x, ' · ') from unnest(m.leds) x) as ledger from m
           where not exists (select 1 from hit where hit.guid = m.guid)),
    ex as materialized (
      select 'app_only' as kind, d, t, amount, ledger, null::text as vno, n_app as app_n, 0::bigint as mirror_n from agm where n_mirror = 0
      union all select 'count_diff', d, t, amount, ledger, null, n_app, n_mirror from agm where n_mirror > 0 and n_mirror <> n_app
      union all select 'mirror_only', d, t, amount, ledger, vno, 0, 1 from mo),
    pg as (select * from ex order by d desc, kind, amount desc, ledger, vno limit lim offset off)
    select jsonb_build_object(
      'company', p_company, 'from', lo, 'to', hi,
      'app_rows', (select count(*) from a), 'mirror_vouchers', (select count(*) from m),
      'matched_rows', (select coalesce(sum(n_app), 0) from agm where n_mirror = n_app),
      'app_only', (select coalesce(sum(n_app), 0) from agm where n_mirror = 0),
      'count_diff_groups', (select count(*) from agm where n_mirror > 0 and n_mirror <> n_app),
      'mirror_only', (select count(*) from mo),
      'same_voucher_no', (select count(*) from (select d, t, nullif(regexp_replace(coalesce(vno, ''), '\D', '', 'g'), '') as k from m) mm
                            join (select d, t, nullif(regexp_replace(ref, '\D', '', 'g'), '') as k from a) aa on aa.d = mm.d and aa.t = mm.t and aa.k = mm.k),
      'exceptions', (select count(*) from ex), 'limit', lim, 'offset', off,
      'rows', coalesce((select jsonb_agg(to_jsonb(pg) order by pg.d desc, pg.kind, pg.amount desc, pg.ledger, pg.vno) from pg), '[]'::jsonb))
  );
end
 $$;

-- 3) Debit = credit
create or replace function public.tally_balance_compute(p_company text)
returns jsonb language sql stable security definer set search_path = public as $$
  with t as materialized (
    select company, coalesce(vtype, '') as vtype, vdate, vno, amount,
           (select coalesce(sum((e->>'amount')::numeric), 0) from jsonb_array_elements(entries) e) as s
    from tally_vouchers where not deleted and not cancelled and jsonb_array_length(entries) > 0 and (p_company is null or company = p_company)),
  bc as (select company, vtype, count(*) as total, count(*) filter (where abs(s) < 0.01) as balanced, count(*) filter (where abs(s) >= 0.01) as unbalanced from t group by 1, 2)
  select jsonb_build_object('generated_at', now(), 'company', p_company,
    'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.unbalanced desc, x.vtype) from (
        select vtype, sum(total)::bigint as total, sum(balanced)::bigint as balanced, sum(unbalanced)::bigint as unbalanced from bc group by vtype) x), '[]'::jsonb),
    'by_company', coalesce((select jsonb_agg(to_jsonb(bc) order by bc.company, bc.vtype) from bc), '[]'::jsonb),
    'no_entries', coalesce((select jsonb_agg(to_jsonb(x) order by x.company) from (
        select company, count(*) as n from tally_vouchers where not deleted and not cancelled and jsonb_array_length(entries) = 0
          and (p_company is null or company = p_company) group by company) x), '[]'::jsonb),
    'unbalanced_sample', coalesce((select jsonb_agg(to_jsonb(x) order by abs(x.diff) desc) from (
        select company, vdate, vtype, vno, amount, round(s, 2) as diff from t where abs(s) >= 0.01 order by abs(s) desc limit 200) x), '[]'::jsonb));
$$;
revoke execute on function public.tally_balance_compute(text) from public, anon, authenticated;

drop function if exists public.tally_balance_check(text);
create or replace function public.tally_balance_check(p_company text default null, p_live boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s record; d jsonb;
begin
  if my_role() is distinct from 'admin' then raise exception 'admin only' using errcode = '42501'; end if;
  if p_live then
    if p_company is null then raise exception 'choose one company for a live check' using errcode = '22023'; end if;
    return public.tally_balance_compute(p_company) || jsonb_build_object('from_snapshot', false);
  end if;
  select data, refreshed_at into s from tally_snapshot where key = 'balance';
  if not found then return public.tally_balance_compute(p_company) || jsonb_build_object('from_snapshot', false); end if;
  d := s.data;
  if p_company is not null then
    d := jsonb_build_object('company', p_company,
      'rows', coalesce((select jsonb_agg(x order by (x->>'unbalanced')::bigint desc, x->>'vtype') from (
          select jsonb_build_object('vtype', e->>'vtype', 'total', (e->>'total')::bigint, 'balanced', (e->>'balanced')::bigint, 'unbalanced', (e->>'unbalanced')::bigint) as x
          from jsonb_array_elements(d->'by_company') e where e->>'company' = p_company) y), '[]'::jsonb),
      'by_company', coalesce((select jsonb_agg(e) from jsonb_array_elements(d->'by_company') e where e->>'company' = p_company), '[]'::jsonb),
      'no_entries', coalesce((select jsonb_agg(e) from jsonb_array_elements(d->'no_entries') e where e->>'company' = p_company), '[]'::jsonb),
      'unbalanced_sample', coalesce((select jsonb_agg(e) from jsonb_array_elements(d->'unbalanced_sample') e where e->>'company' = p_company), '[]'::jsonb));
  end if;
  return d || jsonb_build_object('generated_at', s.refreshed_at, 'from_snapshot', true, 'stale', s.refreshed_at < now() - interval '45 minutes');
end $$;

-- 4) Coverage / gaps
create or replace function public.tally_coverage_compute(p_gap_days integer)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g int := least(greatest(coalesce(p_gap_days, 7), 2), 90);
begin
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
revoke execute on function public.tally_coverage_compute(integer) from public, anon, authenticated;

create or replace function public.tally_recon_coverage(p_gap_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s record;
begin
  if my_role() is distinct from 'admin' then raise exception 'admin only' using errcode = '42501'; end if;
  if coalesce(p_gap_days, 7) = 7 then
    select data, refreshed_at into s from tally_snapshot where key = 'coverage_7';
    if found then return s.data || jsonb_build_object('generated_at', s.refreshed_at, 'from_snapshot', true, 'stale', s.refreshed_at < now() - interval '45 minutes'); end if;
  end if;
  return public.tally_coverage_compute(p_gap_days) || jsonb_build_object('generated_at', now(), 'from_snapshot', false);
end $$;

-- 5) Shared GUIDs
create table if not exists public.tally_shared_pairs (
  guid text not null, a_company text not null, b_company text not null, a_date date, b_date date, a_type text, b_type text, a_vno text, b_vno text,
  a_amount numeric, b_amount numeric, a_lines int, b_lines int, same_content boolean, primary key (guid, a_company, b_company));
alter table public.tally_shared_pairs enable row level security;
revoke all on public.tally_shared_pairs from public, anon, authenticated;

create or replace function public.tally_shared_pairs_live()
returns setof public.tally_shared_pairs language sql stable security definer set search_path = public as $$
  select a.guid, a.company, b.company, a.vdate, b.vdate, a.vtype, b.vtype, a.vno, b.vno, a.amount, b.amount,
         jsonb_array_length(a.entries), jsonb_array_length(b.entries),
         (a.entries = b.entries and a.amount = b.amount and a.vdate = b.vdate and a.vno is not distinct from b.vno)
  from tally_vouchers a join tally_vouchers b on a.guid = b.guid and a.company < b.company where not a.deleted and not b.deleted;
$$;
revoke execute on function public.tally_shared_pairs_live() from public, anon, authenticated;

create or replace function public.tally_recon_shared(p_limit integer default 50, p_offset integer default 0, p_only_differing boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare lim int := least(greatest(coalesce(p_limit, 50), 1), 200); off int := greatest(coalesce(p_offset, 0), 0); s record; snap boolean;
begin
  if my_role() is distinct from 'admin' then raise exception 'admin only' using errcode = '42501'; end if;
  select refreshed_at into s from tally_snapshot where key = 'shared'; snap := found;
  return (
    with j as materialized (
      select guid, a_company, b_company, a_date, b_date, a_type, b_type, a_vno, b_vno, a_amount, b_amount, a_lines, b_lines, same_content from tally_shared_pairs where snap
      union all
      select guid, a_company, b_company, a_date, b_date, a_type, b_type, a_vno, b_vno, a_amount, b_amount, a_lines, b_lines, same_content from public.tally_shared_pairs_live() where not snap),
    f as (select * from j where not p_only_differing or not same_content),
    pg as (select * from f order by a_date desc, guid limit lim offset off)
    select jsonb_build_object('total', (select count(*) from j), 'identical', (select count(*) from j where same_content),
      'differing', (select count(*) from j where not same_content), 'listed', (select count(*) from f), 'limit', lim, 'offset', off,
      'by_pair', coalesce((select jsonb_agg(to_jsonb(x)) from (select a_company, b_company, count(*) as n, min(a_date) as first_date, max(a_date) as last_date from j group by 1, 2) x), '[]'::jsonb),
      'by_type', coalesce((select jsonb_agg(to_jsonb(x) order by x.n desc) from (select a_type as vtype, count(*) as n, count(*) filter (where a_amount = b_amount) as same_amount from j group by 1) x), '[]'::jsonb),
      'rows', coalesce((select jsonb_agg(to_jsonb(pg) order by pg.a_date desc, pg.guid) from pg), '[]'::jsonb),
      'generated_at', case when snap then s.refreshed_at else now() end, 'from_snapshot', snap,
      'stale', snap and s.refreshed_at < now() - interval '45 minutes')
  );
end $$;

-- 6) refresh (cron, every 30 min at :05 and :35 so it never overlaps the :00/:10 overview refresh)
create or replace function public.tally_recon_refresh()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into tally_snapshot(key, data, refreshed_at) values ('balance', public.tally_balance_compute(null), now())
    on conflict (key) do update set data = excluded.data, refreshed_at = excluded.refreshed_at;
  insert into tally_snapshot(key, data, refreshed_at) values ('coverage_7', public.tally_coverage_compute(7), now())
    on conflict (key) do update set data = excluded.data, refreshed_at = excluded.refreshed_at;
  delete from tally_shared_pairs;
  insert into tally_shared_pairs select * from public.tally_shared_pairs_live();
  insert into tally_snapshot(key, data, refreshed_at) values ('shared', jsonb_build_object('pairs', (select count(*) from tally_shared_pairs)), now())
    on conflict (key) do update set data = excluded.data, refreshed_at = excluded.refreshed_at;
end $$;
revoke execute on function public.tally_recon_refresh() from public, anon, authenticated;

do $$ declare f text; begin
  foreach f in array array['tally_recon_cash(text,date,date,integer,integer)', 'tally_balance_check(text,boolean)', 'tally_recon_coverage(integer)', 'tally_recon_shared(integer,integer,boolean)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop; end $$;

select public.tally_recon_refresh();
do $$ begin
  if exists (select 1 from cron.job where jobname = 'tally_recon_refresh') then perform cron.unschedule('tally_recon_refresh'); end if;
  perform cron.schedule('tally_recon_refresh', '5,35 * * * *', 'select public.tally_recon_refresh()');
end $$;
