\set r random(1,10)
\set d random(0,1200)
\if :r <= 4
select data from tally_snapshot where key='overview_all';
\elif :r <= 8
select tally_voucher_search(null,'CO-B',null,(date '2023-06-01' + :d)::date,(date '2023-06-01' + :d + 30)::date,true,50,0);
\elif :r = 9
select tally_ledger_list('CO-B',null,'2026-01-01','2026-12-31',50,0);
\else
select tally_ledger_statement('CO-B','Ledger 2-' || (1 + (:d % 800)),'2026-01-01','2026-12-31');
\endif
