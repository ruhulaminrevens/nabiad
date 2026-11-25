\set ON_ERROR_STOP on
-- :from_n .. :to_n  (global sequence numbers). Deterministic pseudo-random from md5/hashing so a rerun is reproducible.
create temp table cm(i int, company text, cum numeric);
insert into cm select i, company, sum(w) over (order by i) / 100 from (values (1,'CO-A',35.4),(2,'CO-B',29.9),(3,'CO-C',20.4),(4,'CO-D',8.9),(5,'CO-E',3.3),(6,'CO-F',1.6),(7,'CO-G',0.2),(8,'CO-H',0.2),(9,'CO-I',0.1)) t(i,company,w);
create temp table tm(vtype text, cum numeric);
insert into tm select vtype, sum(w) over (order by ord) / 100 from (values (1,'Payment',28.2),(2,'Sales',22.9),(3,'Receipt',17.9),(4,'Journal',17.2),(5,'Purchase',7.4),(6,'Mixture (BoM)',2.2),(7,'Finish Goods',1.6),(8,'Credit Note',1.1),(9,'EX-Mixture',0.9),(10,'Stock Journal',0.3),(11,'Debit Note',0.1),(12,'Sales Order',0.1)) t(ord,vtype,w);
insert into tally_vouchers (company, guid, vdate, vtype, vno, narration, amount, entries, counter_company, alter_id, cancelled, deleted, synced_at)
select c.company, md5('g' || n)::text || '-' || to_hex(n), date '2023-05-31' + ((abs(hashint8(n*7))) % 1274)::int,
  (select vtype from tm where cum >= r2 order by cum limit 1), (1 + abs(hashint8(n*13)) % 99999)::text,
  case when abs(hashint8(n*17)) % 100 < 55 then 'Being payment of invoice ' || (abs(hashint8(n*19)) % 100000) || ' ref ' || substr(md5(n::text),1,6) end,
  amt,
  case when k = 0 then '[]'::jsonb
       when k = 2 then jsonb_build_array(jsonb_build_object('ledger','Ledger '||c.i||'-'||(1+abs(hashint8(n*23))%800),'amount',-amt), jsonb_build_object('ledger','Ledger '||c.i||'-'||(1+abs(hashint8(n*29))%800),'amount',amt))
       else jsonb_build_array(jsonb_build_object('ledger','Ledger '||c.i||'-'||(1+abs(hashint8(n*23))%800),'amount',-amt), jsonb_build_object('ledger','Ledger '||c.i||'-'||(1+abs(hashint8(n*29))%800),'amount',round(amt/2,2)), jsonb_build_object('ledger','Ledger '||c.i||'-'||(1+abs(hashint8(n*31))%800),'amount',amt-round(amt/2,2))) end,
  null, n, abs(hashint8(n*37)) % 1000 < 7, false, now()
from (select n, (abs(hashint8(n*3)) % 1000000) / 1000000.0 r1, (abs(hashint8(n*5)) % 1000000) / 1000000.0 r2,
        round((abs(hashint8(n*11)) % 5000000) / 100.0 + 10, 2) amt,
        case when abs(hashint8(n*41)) % 100 < 5 then 0 when abs(hashint8(n*41)) % 100 < 97 then 2 else 3 end k
      from generate_series(:from_n::bigint, :to_n::bigint) n) s
join lateral (select * from cm where cum >= s.r1 order by cum limit 1) c on true
on conflict do nothing;
