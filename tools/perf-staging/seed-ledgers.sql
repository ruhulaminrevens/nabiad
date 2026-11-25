-- synthetic vouchers: :target total rows. Shapes taken only from aggregate statistics (company/type mix, entries per voucher, row size). No production rows used.
\set ON_ERROR_STOP on
create temp table cm(i int, company text, w numeric);
insert into cm values (1,'CO-A',35.4),(2,'CO-B',29.9),(3,'CO-C',20.4),(4,'CO-D',8.9),(5,'CO-E',3.3),(6,'CO-F',1.6),(7,'CO-G',0.2),(8,'CO-H',0.2),(9,'CO-I',0.1);
create temp table tm(vtype text, w numeric);
insert into tm values ('Payment',28.2),('Sales',22.9),('Receipt',17.9),('Journal',17.2),('Purchase',7.4),('Mixture (BoM)',2.2),('Finish Goods',1.6),('Credit Note',1.1),('EX-Mixture',0.9),('Stock Journal',0.3),('Debit Note',0.1),('Sales Order',0.1);
-- ledger pools per company: 800 names, parents from 12 groups (scale ~ company size is irrelevant to the pool; production has 7.4k ledgers over 9 companies)
insert into tally_ledgers select c.company, 'Ledger ' || c.i || '-' || g, 'Group ' || (g % 12), now() from cm c, generate_series(1, 800) g on conflict do nothing;
