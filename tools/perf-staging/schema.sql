create or replace function my_role() returns text language sql stable as $$ select 'admin'::text $$;
create table tally_vouchers (company text not null, guid text not null, vdate date not null, vtype text, vno text, narration text, amount numeric, entries jsonb not null default '[]', counter_company text, alter_id bigint, cancelled boolean not null default false, deleted boolean not null default false, synced_at timestamptz not null default now(), primary key (company, guid));
create index tally_vouchers_company_date on tally_vouchers (company, vdate);
create index tally_vouchers_counter on tally_vouchers (counter_company) where counter_company is not null;
create table tally_ledgers (company text, name text, parent text, synced_at timestamptz default now(), primary key (company, name));
create table tally_snapshot (key text primary key, data jsonb not null, refreshed_at timestamptz not null default now());

create or replace function tally_overview_compute(p_company text, p_from date, p_to date, p_vtype text) returns jsonb language plpgsql stable as $$
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
create or replace function tally_filters_compute() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'companies', coalesce((select jsonb_agg(to_jsonb(c) order by c.n desc) from (select company, count(*) as n from tally_vouchers where not deleted group by company) c), '[]'::jsonb),
    'types', coalesce((select jsonb_agg(to_jsonb(t) order by t.n desc) from (select coalesce(vtype, '') as vtype, count(*) as n from tally_vouchers where not deleted group by vtype) t), '[]'::jsonb));
$$;
create or replace function tally_snapshot_refresh() returns void language plpgsql as $$
begin
  insert into tally_snapshot(key, data, refreshed_at) values ('overview_all', tally_overview_compute(null, null, null, null) || jsonb_build_object('collisions', (
      select jsonb_build_object('identities', count(*), 'identical', count(*) filter (where a.entries = b.entries and a.amount = b.amount and a.vdate = b.vdate and a.vno is not distinct from b.vno))
      from tally_vouchers a join tally_vouchers b on a.guid = b.guid and a.company < b.company where not a.deleted and not b.deleted)), now())
    on conflict (key) do update set data = excluded.data, refreshed_at = excluded.refreshed_at;
  insert into tally_snapshot(key, data, refreshed_at) values ('filters', tally_filters_compute(), now())
    on conflict (key) do update set data = excluded.data, refreshed_at = excluded.refreshed_at;
end $$;
create or replace function tally_voucher_search(p_q text default null, p_company text default null, p_vtype text default null, p_from date default null, p_to date default null, p_include_cancelled boolean default true, p_limit int default 50, p_offset int default 0) returns jsonb language plpgsql stable as $$
declare q text := nullif(btrim(coalesce(p_q, '')), ''); pat text; lim int := least(greatest(coalesce(p_limit, 50), 1), 200); off int := greatest(coalesce(p_offset, 0), 0);
begin
  if q is not null then pat := '%' || left(q, 100) || '%'; end if;
  return (
    with f as (
      select v.company, v.guid, v.vdate, v.vtype, v.vno, v.narration, v.amount, v.entries, v.counter_company, v.cancelled
      from tally_vouchers v
      where not v.deleted and (p_company is null or v.company = p_company) and (p_vtype is null or v.vtype = p_vtype)
        and (p_from is null or v.vdate >= p_from) and (p_to is null or v.vdate <= p_to) and (p_include_cancelled or not v.cancelled)
        and (pat is null or v.vno ilike pat or v.narration ilike pat or v.entries::text ilike pat)),
    page as (select * from f order by vdate desc, company, guid limit lim offset off)
    select jsonb_build_object('total', (select count(*) from f), 'limit', lim, 'offset', off,
      'rows', coalesce((select jsonb_agg(to_jsonb(page) order by page.vdate desc, page.company, page.guid) from page), '[]'::jsonb)));
end $$;
create or replace function tally_ledger_list(p_company text default null, p_q text default null, p_from date default null, p_to date default null, p_limit int default 50, p_offset int default 0) returns jsonb language plpgsql stable as $$
declare q text := nullif(btrim(coalesce(p_q, '')), ''); pat text; lim int := least(greatest(coalesce(p_limit, 50), 1), 200); off int := greatest(coalesce(p_offset, 0), 0);
begin
  if q is not null then pat := '%' || left(q, 100) || '%'; end if;
  return (
    with a as (
      select v.company, e->>'ledger' as ledger,
             sum(case when (e->>'amount')::numeric < 0 then -(e->>'amount')::numeric else 0 end) as dr,
             sum(case when (e->>'amount')::numeric > 0 then (e->>'amount')::numeric else 0 end) as cr, count(*) as n
      from tally_vouchers v cross join lateral jsonb_array_elements(v.entries) e
      where not v.deleted and not v.cancelled and (p_company is null or v.company = p_company)
        and (p_from is null or v.vdate >= p_from) and (p_to is null or v.vdate <= p_to) group by 1, 2),
    f as (select a.company, a.ledger, l.parent, a.dr, a.cr, a.n from a left join tally_ledgers l on l.company = a.company and l.name = a.ledger
          where a.ledger is not null and (pat is null or a.ledger ilike pat or l.parent ilike pat)),
    page as (select * from f order by dr + cr desc, company, ledger limit lim offset off)
    select jsonb_build_object('total', (select count(*) from f), 'limit', lim, 'offset', off,
      'rows', coalesce((select jsonb_agg(to_jsonb(page) order by page.dr + page.cr desc, page.company, page.ledger) from page), '[]'::jsonb)));
end $$;
create or replace function tally_ledger_statement(p_company text, p_ledger text, p_from date default null, p_to date default null) returns jsonb language plpgsql stable as $$
begin
  return (
    with m as (
      select v.vdate, v.vtype, v.vno, v.narration, v.guid, (e->>'amount')::numeric as amt,
             (select string_agg(distinct x->>'ledger', ' · ') from jsonb_array_elements(v.entries) x where x->>'ledger' is distinct from p_ledger) as other
      from tally_vouchers v cross join lateral jsonb_array_elements(v.entries) e
      where v.company = p_company and not v.deleted and not v.cancelled and (p_from is null or v.vdate >= p_from) and (p_to is null or v.vdate <= p_to) and e->>'ledger' = p_ledger),
    tot as (select count(*) as n, coalesce(sum(case when amt < 0 then -amt else 0 end), 0) as dr, coalesce(sum(case when amt > 0 then amt else 0 end), 0) as cr from m),
    pg as (select * from m order by vdate, vno, guid limit 3000)
    select jsonb_build_object('parent', (select parent from tally_ledgers where company = p_company and name = p_ledger),
      'n', (select n from tot), 'dr', (select dr from tot), 'cr', (select cr from tot), 'truncated', (select n from tot) > 3000,
      'rows', coalesce((select jsonb_agg(to_jsonb(pg) - 'guid' order by pg.vdate, pg.vno, pg.guid) from pg), '[]'::jsonb)));
end $$;
create or replace function tally_recon_shared(p_limit int default 50, p_offset int default 0, p_only_differing boolean default false) returns jsonb language plpgsql stable as $$
declare lim int := least(greatest(coalesce(p_limit, 50), 1), 200); off int := greatest(coalesce(p_offset, 0), 0);
begin
  return (
    with j as materialized (
      select a.guid, a.company as a_company, b.company as b_company, a.vdate as a_date, b.vdate as b_date, a.vtype as a_type, b.vtype as b_type,
             a.vno as a_vno, b.vno as b_vno, a.amount as a_amount, b.amount as b_amount, jsonb_array_length(a.entries) as a_lines, jsonb_array_length(b.entries) as b_lines,
             (a.entries = b.entries and a.amount = b.amount and a.vdate = b.vdate and a.vno is not distinct from b.vno) as same_content
      from tally_vouchers a join tally_vouchers b on a.guid = b.guid and a.company < b.company where not a.deleted and not b.deleted),
    f as (select * from j where not p_only_differing or not same_content),
    pg as (select * from f order by a_date desc, guid limit lim offset off)
    select jsonb_build_object('total', (select count(*) from j), 'identical', (select count(*) from j where same_content), 'differing', (select count(*) from j where not same_content),
      'listed', (select count(*) from f), 'limit', lim, 'offset', off,
      'by_pair', coalesce((select jsonb_agg(to_jsonb(x)) from (select a_company, b_company, count(*) as n, min(a_date) as first_date, max(a_date) as last_date from j group by 1, 2) x), '[]'::jsonb),
      'by_type', coalesce((select jsonb_agg(to_jsonb(x) order by x.n desc) from (select a_type as vtype, count(*) as n, count(*) filter (where a_amount = b_amount) as same_amount from j group by 1) x), '[]'::jsonb),
      'rows', coalesce((select jsonb_agg(to_jsonb(pg) order by pg.a_date desc, pg.guid) from pg), '[]'::jsonb)));
end $$;
