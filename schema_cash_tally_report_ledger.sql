-- Apply after schema_cash_tally.sql.
begin;

alter table public.cash_tally_vouchers
  add column if not exists report_ledger text
  check (report_ledger is null or length(btrim(report_ledger)) between 1 and 300);

comment on column public.cash_tally_vouchers.report_ledger is
  'Verified party or ledger display name for Daily Cash Register summaries. The original Tally ledger is preserved.';

commit;
