-- simulated Bridge batch: 500 vouchers upserted per transaction over a fixed key space of 20,000 vouchers (recent month, one company) -> after the first pass every batch is an UPDATE of existing rows; table size stays constant
\set base random(0,19500)
insert into tally_vouchers (company,guid,vdate,vtype,vno,narration,amount,entries,alter_id,synced_at)
select 'CO-B', md5('w'||(:base + g))||'-w', date '2026-11-01' + (g % 25), 'Receipt', (g)::text, 'bridge batch', g, '[{"ledger":"Ledger 2-5","amount":-1},{"ledger":"Ledger 2-9","amount":1}]'::jsonb, 9000000000+g, now()
from generate_series(1,500) g
on conflict (company,guid) do update set amount=excluded.amount, entries=excluded.entries, alter_id=excluded.alter_id, synced_at=excluded.synced_at;
