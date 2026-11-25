-- Tally Dashboard (admin-only) — one read-only summary function for the app's "Tally Dashboard" page.
-- NOT applied yet. Apply only after the owner's explicit "yes" and `select make_backup('manual');`.
-- Needs the Tally bridge tables (schema_tally_bridge.sql). Creates no table and changes no data.
-- The query body was run read-only against production on 2026-11-25 (9 companies, 318,527 rows) before this file was written.
create or replace function public.tally_dashboard_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() is distinct from 'admin' then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return (
    with v as (
      select company,
             count(*) filter (where not deleted) as vouchers,
             count(*) filter (where deleted) as deleted,
             count(*) filter (where cancelled and not deleted) as cancelled,
             min(vdate) filter (where not deleted) as first_date,
             max(vdate) filter (where not deleted) as last_date
      from tally_vouchers group by company),
    l as (select company, count(*) as ledgers from tally_ledgers group by company),
    r as (
      select company,
             max(finished_at) filter (where ok) as last_ok_at,
             max(started_at) as last_run_at,
             (array_agg(ok order by started_at desc))[1] as last_run_ok,
             (array_agg(error order by started_at desc))[1] as last_run_error
      from tally_sync_runs group by company),
    names as (select company from v union select company from l union select company from r),
    per as (
      select n.company, coalesce(v.vouchers, 0) as vouchers, coalesce(v.deleted, 0) as deleted, coalesce(v.cancelled, 0) as cancelled,
             coalesce(l.ledgers, 0) as ledgers, v.first_date, v.last_date, r.last_ok_at, r.last_run_at, r.last_run_ok,
             case when r.last_run_ok is false then left(r.last_run_error, 300) end as last_error
      from names n left join v using (company) left join l using (company) left join r using (company)),
    tot as (select count(*) as total_rows, count(distinct guid) as unique_guids from tally_vouchers where not deleted)
    select jsonb_build_object(
      'generated_at', now(),
      'companies', coalesce((select jsonb_agg(to_jsonb(per) order by per.vouchers desc, per.company) from per), '[]'::jsonb),
      'total_rows', (select total_rows from tot),
      'unique_guids', (select unique_guids from tot),
      'failed_7d', (select count(*) from tally_sync_runs where ok is false and started_at > now() - interval '7 days'),
      'recent_runs', coalesce((select jsonb_agg(to_jsonb(x) order by x.started_at desc) from (
          select id, company, kind, from_date, to_date, started_at, finished_at, ok, ledgers, vouchers, left(error, 300) as error, bridge_version
          from tally_sync_runs order by started_at desc limit 40) x), '[]'::jsonb));
  );
end $$;
revoke execute on function public.tally_dashboard_summary() from public, anon;
grant execute on function public.tally_dashboard_summary() to authenticated;
