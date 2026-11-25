-- Tally Dashboard — Voucher Explorer (admin-only, read-only). Two functions; no table, no index, no data change.
-- NOT yet applied to production: needs the owner's explicit "yes" (take make_backup('manual') first as usual).
-- Needs schema_tally_bridge.sql. Re-runnable (create or replace).

-- 1) Search with filters and server-side pagination. Returns {total, rows[], limit, offset}.
--    p_q matches voucher no, narration and ledger names inside the entries (case-insensitive, % and _ are literal).
create or replace function public.tally_voucher_search(
  p_q text default null, p_company text default null, p_vtype text default null,
  p_from date default null, p_to date default null,
  p_include_cancelled boolean default true, p_limit int default 50, p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  q text := nullif(btrim(coalesce(p_q, '')), '');
  pat text;
  lim int := least(greatest(coalesce(p_limit, 50), 1), 200);
  off int := greatest(coalesce(p_offset, 0), 0);
begin
  if my_role() is distinct from 'admin' then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if q is not null then pat := '%' || replace(replace(replace(left(q, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%'; end if;
  return (
    with f as (
      select v.company, v.guid, v.vdate, v.vtype, v.vno, v.narration, v.amount, v.entries, v.counter_company, v.cancelled
      from tally_vouchers v
      where not v.deleted
        and (p_company is null or v.company = p_company)
        and (p_vtype is null or v.vtype = p_vtype)
        and (p_from is null or v.vdate >= p_from)
        and (p_to is null or v.vdate <= p_to)
        and (p_include_cancelled or not v.cancelled)
        and (pat is null or v.vno ilike pat or v.narration ilike pat or v.entries::text ilike pat)),
    page as (select * from f order by vdate desc, company, guid limit lim offset off)
    select jsonb_build_object(
      'total', (select count(*) from f),
      'limit', lim, 'offset', off,
      'rows', coalesce((select jsonb_agg(to_jsonb(page) order by page.vdate desc, page.company, page.guid) from page), '[]'::jsonb))
  );
end $$;
revoke execute on function public.tally_voucher_search(text, text, text, date, date, boolean, int, int) from public, anon;
grant execute on function public.tally_voucher_search(text, text, text, date, date, boolean, int, int) to authenticated;

-- 2) Filter lists: companies and voucher types (with counts, deleted vouchers excluded).
create or replace function public.tally_voucher_filters() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() is distinct from 'admin' then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'companies', coalesce((select jsonb_agg(to_jsonb(c) order by c.n desc) from (
        select company, count(*) as n from tally_vouchers where not deleted group by company) c), '[]'::jsonb),
    'types', coalesce((select jsonb_agg(to_jsonb(t) order by t.n desc) from (
        select coalesce(vtype, '') as vtype, count(*) as n from tally_vouchers where not deleted group by vtype) t), '[]'::jsonb));
end $$;
revoke execute on function public.tally_voucher_filters() from public, anon;
grant execute on function public.tally_voucher_filters() to authenticated;
