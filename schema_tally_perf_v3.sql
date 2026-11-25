-- Tally Dashboard performance v3 (NABIAD v6.176). Additive and re-runnable. NOT applied: needs the owner's explicit "yes".
-- Why: opening the Tally Dashboard ran the full-history overview (~7 s) and filter counts (~6 s) on every visit. This keeps a snapshot of the
-- default (unfiltered) overview + filter lists, refreshed every 10 minutes by pg_cron, and serves it when it is younger than 20 minutes.
-- Filtered requests are still computed live and no longer include the shared-GUID figures (the app asks tally_recon_shared for those separately; the snapshot carries them).
-- Rollback: select cron.unschedule('tally_snapshot_refresh'); drop function public.tally_snapshot_refresh(); drop function public.tally_overview_compute(text,date,date,text);
--           drop table public.tally_snapshot; then re-run schema_tally_dashboard_v2.sql and schema_tally_explorer.sql to restore the previous function bodies.

create table if not exists public.tally_snapshot (key text primary key, data jsonb not null, refreshed_at timestamptz not null default now());
alter table public.tally_snapshot enable row level security;
revoke all on public.tally_snapshot from public, anon, authenticated;   -- no policies: only the SECURITY DEFINER functions below read it

-- live computation (no guard; not callable by app users)
create or replace function public.tally_overview_compute(p_company text, p_from date, p_to date, p_vtype text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
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
      where p_company is null or l.company = p_company)
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
          select vdate as d, count(*) as n from s where vdate >= (select max(vdate) from s) - 29 group by 1) x), '[]'::jsonb))
  );
end $$;
revoke execute on function public.tally_overview_compute(text,date,date,text) from public, anon, authenticated;

create or replace function public.tally_filters_compute()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'companies', coalesce((select jsonb_agg(to_jsonb(c) order by c.n desc) from (select company, count(*) as n from tally_vouchers where not deleted group by company) c), '[]'::jsonb),
    'types', coalesce((select jsonb_agg(to_jsonb(t) order by t.n desc) from (select coalesce(vtype, '') as vtype, count(*) as n from tally_vouchers where not deleted group by vtype) t), '[]'::jsonb));
$$;
revoke execute on function public.tally_filters_compute() from public, anon, authenticated;

create or replace function public.tally_snapshot_refresh()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into tally_snapshot(key, data, refreshed_at) values ('overview_all', public.tally_overview_compute(null, null, null, null) || jsonb_build_object('collisions', (
      select jsonb_build_object('identities', count(*), 'identical', count(*) filter (where a.entries = b.entries and a.amount = b.amount and a.vdate = b.vdate and a.vno is not distinct from b.vno))
      from tally_vouchers a join tally_vouchers b on a.guid = b.guid and a.company < b.company where not a.deleted and not b.deleted)), now())
    on conflict (key) do update set data = excluded.data, refreshed_at = excluded.refreshed_at;
  insert into tally_snapshot(key, data, refreshed_at) values ('filters', public.tally_filters_compute(), now())
    on conflict (key) do update set data = excluded.data, refreshed_at = excluded.refreshed_at;
end $$;
revoke execute on function public.tally_snapshot_refresh() from public, anon, authenticated;

create or replace function public.tally_overview(p_company text default null, p_from date default null, p_to date default null, p_vtype text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s record;
begin
  if my_role() is distinct from 'admin' then raise exception 'admin only' using errcode = '42501'; end if;
  if p_company is null and p_from is null and p_to is null and p_vtype is null then
    select data, refreshed_at into s from tally_snapshot where key = 'overview_all';
    if found and s.refreshed_at > now() - interval '20 minutes' then
      return s.data || jsonb_build_object('generated_at', s.refreshed_at, 'from_snapshot', true);
    end if;
  end if;
  return public.tally_overview_compute(p_company, p_from, p_to, p_vtype);
end $$;

create or replace function public.tally_voucher_filters()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s record;
begin
  if my_role() is distinct from 'admin' then raise exception 'admin only' using errcode = '42501'; end if;
  select data, refreshed_at into s from tally_snapshot where key = 'filters';
  if found and s.refreshed_at > now() - interval '20 minutes' then return s.data; end if;
  return public.tally_filters_compute();
end $$;

do $$ declare f text; begin
  foreach f in array array['tally_overview(text,date,date,text)', 'tally_voucher_filters()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop; end $$;

select public.tally_snapshot_refresh();
do $$ begin
  if exists (select 1 from cron.job where jobname = 'tally_snapshot_refresh') then perform cron.unschedule('tally_snapshot_refresh'); end if;
  perform cron.schedule('tally_snapshot_refresh', '*/10 * * * *', 'select public.tally_snapshot_refresh()');
end $$;
