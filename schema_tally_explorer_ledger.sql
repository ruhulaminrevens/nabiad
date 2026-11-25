-- Tally Dashboard — Ledger Explorer (admin-only, read-only). Two functions; no table, no index, no data change.
-- NOT yet applied to production: needs the owner's explicit "yes".
-- Needs schema_tally_bridge.sql. Re-runnable (create or replace).
-- Limits: the mirror has no opening balances, so figures are movement within the chosen period (debit, credit, net), not closing balances.
-- Cancelled and deleted vouchers are excluded. Sales/Purchase ledger lines are only complete after Bridge 1.2.1 has re-synced.

-- 1) Ledgers with activity in the period: debit, credit, number of lines. Search matches ledger name or group (parent).
create or replace function public.tally_ledger_list(
  p_company text default null, p_q text default null, p_from date default null, p_to date default null,
  p_limit int default 50, p_offset int default 0
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
    with a as (
      select v.company, e->>'ledger' as ledger,
             sum(case when (e->>'amount')::numeric < 0 then -(e->>'amount')::numeric else 0 end) as dr,
             sum(case when (e->>'amount')::numeric > 0 then (e->>'amount')::numeric else 0 end) as cr,
             count(*) as n
      from tally_vouchers v cross join lateral jsonb_array_elements(v.entries) e
      where not v.deleted and not v.cancelled
        and (p_company is null or v.company = p_company)
        and (p_from is null or v.vdate >= p_from) and (p_to is null or v.vdate <= p_to)
      group by 1, 2),
    f as (
      select a.company, a.ledger, l.parent, a.dr, a.cr, a.n
      from a left join tally_ledgers l on l.company = a.company and l.name = a.ledger
      where a.ledger is not null and (pat is null or a.ledger ilike pat or l.parent ilike pat)),
    page as (select * from f order by dr + cr desc, company, ledger limit lim offset off)
    select jsonb_build_object('total', (select count(*) from f), 'limit', lim, 'offset', off,
      'rows', coalesce((select jsonb_agg(to_jsonb(page) order by page.dr + page.cr desc, page.company, page.ledger) from page), '[]'::jsonb))
  );
end $$;
revoke execute on function public.tally_ledger_list(text, text, date, date, int, int) from public, anon;
grant execute on function public.tally_ledger_list(text, text, date, date, int, int) to authenticated;

-- 2) Statement of one ledger in one company: its lines by date (max 3,000 returned; totals cover all lines).
create or replace function public.tally_ledger_statement(
  p_company text, p_ledger text, p_from date default null, p_to date default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() is distinct from 'admin' then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_company is null or p_ledger is null then
    raise exception 'company and ledger are required' using errcode = '22023';
  end if;
  return (
    with m as (
      select v.vdate, v.vtype, v.vno, v.narration, v.guid, (e->>'amount')::numeric as amt,
             (select string_agg(distinct x->>'ledger', ' · ') from jsonb_array_elements(v.entries) x where x->>'ledger' is distinct from p_ledger) as other
      from tally_vouchers v cross join lateral jsonb_array_elements(v.entries) e
      where v.company = p_company and not v.deleted and not v.cancelled
        and (p_from is null or v.vdate >= p_from) and (p_to is null or v.vdate <= p_to)
        and e->>'ledger' = p_ledger),
    tot as (select count(*) as n, coalesce(sum(case when amt < 0 then -amt else 0 end), 0) as dr, coalesce(sum(case when amt > 0 then amt else 0 end), 0) as cr from m),
    pg as (select * from m order by vdate, vno, guid limit 3000)
    select jsonb_build_object(
      'parent', (select parent from tally_ledgers where company = p_company and name = p_ledger),
      'n', (select n from tot), 'dr', (select dr from tot), 'cr', (select cr from tot),
      'truncated', (select n from tot) > 3000,
      'rows', coalesce((select jsonb_agg(to_jsonb(pg) - 'guid' order by pg.vdate, pg.vno, pg.guid) from pg), '[]'::jsonb))
  );
end $$;
revoke execute on function public.tally_ledger_statement(text, text, date, date) from public, anon;
grant execute on function public.tally_ledger_statement(text, text, date, date) to authenticated;
