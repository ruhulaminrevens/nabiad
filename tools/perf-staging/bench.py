import psycopg2, time, sys, json, statistics, os
label=sys.argv[1]; runs=int(sys.argv[2]) if len(sys.argv)>2 else 3
conn=psycopg2.connect(host="127.0.0.1",port=5544,user="postgres",dbname="postgres"); conn.autocommit=True; cur=conn.cursor()
cur.execute("select count(*) from tally_vouchers"); n=cur.fetchone()[0]
Q=[
 ("overview_default_LIVE (full-history compute)", "select tally_overview_compute(null,null,null,null)"),
 ("overview_company_month (live)", "select tally_overview_compute('CO-B','2026-10-01','2026-10-31',null)"),
 ("filters_compute (company/type counts)", "select tally_filters_compute()"),
 ("snapshot_refresh (overview+collisions+filters)", "select tally_snapshot_refresh()"),
 ("snapshot_read (what the app calls)", "select data from tally_snapshot where key='overview_all'"),
 ("voucher_search month, no text", "select tally_voucher_search(null,'CO-B',null,'2026-10-01','2026-10-31',true,50,0)"),
 ("voucher_search company+type+year", "select tally_voucher_search(null,'CO-A','Sales','2026-01-01','2026-12-31',true,50,0)"),
 ("voucher_search TEXT all history (ilike entries)", "select tally_voucher_search('Ledger 2-77',null,null,null,null,true,50,0)"),
 ("ledger_list company, one year", "select tally_ledger_list('CO-B',null,'2026-01-01','2026-12-31',50,0)"),
 ("ledger_list ALL companies, all history", "select tally_ledger_list(null,null,null,null,50,0)"),
 ("ledger_statement one ledger, all history", "select tally_ledger_statement('CO-B','Ledger 2-77',null,null)"),
 ("recon_shared first page (shared GUID join)", "select tally_recon_shared(50,0,false)"),
]
res=[]
for name,sql in Q:
    ts=[]
    for _ in range(runs):
        t=time.perf_counter()
        try: cur.execute(sql); cur.fetchall()
        except Exception as e: ts.append(None); print("ERR",name,str(e)[:100]); conn.rollback(); break
        ts.append((time.perf_counter()-t)*1000)
    ok=[x for x in ts if x is not None]
    res.append({"query":name,"ms_median":round(statistics.median(ok)) if ok else None,"ms_max":round(max(ok)) if ok else None})
cur.execute("select pg_total_relation_size('tally_vouchers'), pg_table_size('tally_vouchers'), pg_indexes_size('tally_vouchers')"); tot,tb,ix=cur.fetchone()
out={"label":label,"rows":n,"table_mb":round(tb/1e6),"index_mb":round(ix/1e6),"results":res}
json.dump(out,open(f"/tmp/stage/bench_{label}.json","w"),indent=1)
print(f"== {label}: {n:,} rows, table {tb/1e6:.0f} MB, indexes {ix/1e6:.0f} MB")
for r in res: print(f"{r['query']:55s} median {r['ms_median']} ms  max {r['ms_max']} ms")
