# usage: conc.sh <db> <clients> <seconds> <with_writer 0|1> <label>
DB=$1; C=$2; T=$3; W=$4; L=$5; D=/tmp/stage/conc_$L; rm -rf $D; mkdir -p $D
P="-h 127.0.0.1 -p 5544 -U postgres"
if [ "$W" = "1" ]; then (cd $D && /usr/lib/postgresql/16/bin/pgbench $P -n -c 1 -j 1 -T $T -f /tmp/stage/writer.sql -l --log-prefix=w $DB > w.out 2>&1) & fi
(cd $D && /usr/lib/postgresql/16/bin/pgbench $P -n -c $C -j 2 -T $T -f /tmp/stage/reads.sql -l --log-prefix=r $DB > r.out 2>&1)
wait
python3 - <<PY
import glob, statistics, json
def lat(prefix):
    v=[]
    for f in [f for f in glob.glob("$D/"+prefix+".*") if not f.endswith(".out")]:
        for line in open(f):
            p=line.split()
            if len(p)>=3: v.append(int(p[2])/1000)
    return sorted(v)
def q(a,x): return round(a[min(len(a)-1,int(x*len(a)))],1) if a else None
r=lat("r"); w=lat("w")
print(f"$L: clients=$C writer=$W  reads: n={len(r)} tps={round(len(r)/$T,1)} p50={q(r,.5)}ms p95={q(r,.95)}ms p99={q(r,.99)}ms max={round(max(r),1) if r else None}ms" + (f" | writer batches n={len(w)} p50={q(w,.5)}ms p95={q(w,.95)}ms" if w else ""))
PY
