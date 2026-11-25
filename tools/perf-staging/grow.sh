# usage: grow.sh from to  -> load rows, add shared-guid pairs (1.5% of CO-B rows mirrored into CO-F with changed amount), analyze
P="psql -h 127.0.0.1 -p 5544 -U postgres -q"
$P -v from_n=$1 -v to_n=$2 -f /tmp/stage/load.sql
$P -c "insert into tally_vouchers (company,guid,vdate,vtype,vno,narration,amount,entries,alter_id) select 'CO-F', guid, vdate, vtype, vno, narration, amount+1, entries, alter_id from tally_vouchers where company='CO-B' and abs(hashtext(guid)) % 1000 < 15 and alter_id between $1 and $2 on conflict do nothing"
$P -c "analyze tally_vouchers"
