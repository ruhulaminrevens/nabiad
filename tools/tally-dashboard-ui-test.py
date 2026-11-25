# Tally Dashboard full-path UI test: real tally.js against a mocked Supabase (v4 response shapes). Usage: python3 tools/tally-dashboard-ui-test.py <repo dir> <before|after>  (needs Playwright + Chrome and the private dev fixtures in /tmp/uitest)
import asyncio, subprocess, time, re, json, sys
from playwright.async_api import async_playwright
ROOT = sys.argv[1]; TAG = sys.argv[2]; FULL = TAG == "after"
srv = subprocess.Popen(["python3","-m","http.server","8977","--directory",ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
CFG = 'window.NABIAD_CONFIG={SUPABASE_URL:"",SUPABASE_ANON_KEY:"",START_DATE:"2026-11-14"};'
ACC = open("/tmp/uitest/accs.json").read()
TALLY = re.sub(r'\bDEMO\b','false',open(ROOT+'/tally.js').read())
MOCK = r'''
window.__calls=[]; window.__aborts=[];
const co=["Niramoy Traders- Naogaon","Nabiad-Cash & Bank","Nabiad Savar Coil Factory","Nabiad Distribution Ltd.","Lalmatia Depo","Nabiad-ChawkBazar-2026","Nabiad Detergent Factory","N.Zaman Veg. Cr.","N.Zaman Ch."];
const rows=[112900,95315,64935,28450,10456,5068,680,483,418], now=Date.now(), iso=m=>new Date(now-m*6e4).toISOString();
const ok=d=>({data:d,error:null});
const vt=["Payment","Sales","Receipt","Journal","Purchase"];
const mkV=(i,a)=>({company:a.p_company||co[i%9],guid:"g"+i,vdate:a.p_to||"2026-11-25",vtype:a.p_vtype||vt[i%5],vno:String(3200+i),narration:i%3?"Payment ref "+i:null,amount:1000*(i+1),entries:[{ledger:"Cash",amount:-1000*(i+1)},{ledger:"Party "+i,amount:1000*(i+1)}],counter_company:i%4?null:co[1],cancelled:false});
const base={rpc:async(n,a)=>{ window.__calls.push([n,a]); await new Promise(r=>setTimeout(r,25));
 if(n==="tally_voucher_filters") return ok({companies:co.map((c,i)=>({company:c,n:rows[i]})),types:vt.map((t,i)=>({vtype:t,n:9e4-i*1e4}))});
 if(n==="tally_overview") return ok({generated_at:iso(4),from_snapshot:!a.p_company&&!a.p_from&&!a.p_to&&!a.p_vtype,scope:{rows:a.p_company?rows[co.indexOf(a.p_company)]:318705,unique_guids:313913,cancelled:2,companies:a.p_company?1:9},
   by_company:co.filter(c=>!a.p_company||c===a.p_company).map(c=>({company:c,rows:rows[co.indexOf(c)],scope_cancelled:0,life_rows:rows[co.indexOf(c)],ledgers:100+co.indexOf(c)*300,cancelled:c.includes("Cash")?2:0,deleted:0,first_date:"2023-01-01",last_date:"2026-11-24"})),
   by_month:Array.from({length:36},(_,i)=>({m:`${2023+Math.floor((i+11)/12)}-${String((i+11)%12+1).padStart(2,"0")}`,n:7000+(i*137)%2500})),by_type:vt.map((t,i)=>({vtype:t,n:89843-i*9000})),
   daily:Array.from({length:30},(_,i)=>({d:`2026-${i<5?"10":"11"}-${String(i<5?27+i:i-4).padStart(2,"0")}`,n:300+(i*53)%400})),collisions:{identities:4792,identical:0}});
 if(n==="tally_sync_health") return ok({days:7,open_issues:0,failed_window:1,recovered:1,companies:co.map((c,i)=>({company:c,last_ok_at:iso(30+i*7),last_run_at:iso(32+i*7),last_run_ok:true,failed_window:i===1?1:0,runs_window:6+i,open_issue:false,recovered:i===1,last_error:i===1?"Tally did not answer: <urlopen error [WinError 10061]>":null}))});
 if(n==="tally_sync_runs_list") return ok({total:55,rows:Array.from({length:Math.min(a.p_limit||50,55-(a.p_offset||0))},(_,i)=>({id:i,company:co[i%9],kind:"daybook",from_date:"2023-05-31",to_date:"2026-11-25",started_at:iso(40+i*15),finished_at:iso(38+i*15-(i%5)),ok:i!==53,vouchers:i===53?null:100+i*97,error:i===53?"Tally did not answer: <urlopen error [WinError 10061] No connection could be made because the target machine actively refused it>":null,bridge_version:"0.3.2"}))});
 if(n==="tally_recon_shared"){ const L=a.p_only_differing?4792:4792; return ok({generated_at:iso(12),from_snapshot:true,stale:false,total:4792,identical:0,differing:4792,listed:L,by_pair:[{a_company:co[1],b_company:co[5],n:4792,first_date:"2023-01-31",last_date:"2026-05-02"}],by_type:[{vtype:"Receipt",n:2100,same_amount:30},{vtype:"Payment",n:1700,same_amount:12},{vtype:"Journal",n:992,same_amount:3}],rows:Array.from({length:Math.min(a.p_limit,50)},(_,i)=>({guid:"g"+(i+a.p_offset),a_company:co[1],b_company:co[5],a_date:"2026-04-30",b_date:"2026-11-18",a_type:"Receipt",b_type:"Receipt",a_vno:String(1387+i),b_vno:String(2679+i),a_amount:50000+i,b_amount:25000+i,a_lines:2,b_lines:2,same_content:false}))}); }
 if(n==="tally_recon_cash") return ok({company:a.p_company,from:a.p_from||"2026-01-01",to:a.p_to||"2026-11-19",app_rows:9720,mirror_vouchers:9721,matched_rows:9641,app_only:77,mirror_only:76,count_diff_groups:2,same_voucher_no:54,exceptions:155,rows:Array.from({length:Math.min(a.p_limit,155-a.p_offset)},(_,i)=>({kind:["app_only","mirror_only","count_diff"][i%3],d:"2026-11-1"+(i%9),t:i%2?"receipt":"payment",amount:5000+i*10,ledger:"Ledger "+i,vno:i%3===1?String(4100+i):null,app_n:i%3===1?0:1,mirror_n:i%3===0?0:i%3===1?1:2}))});
 if(n==="tally_recon_changes") return ok({total:2,rows:[{company:co[1],vdate:"2024-11-28",vtype:"Sales",vno:"5601",amount:0,cancelled:true,deleted:false,synced_at:iso(60)},{company:co[1],vdate:"2024-11-28",vtype:"Sales",vno:"5599",amount:0,cancelled:true,deleted:false,synced_at:iso(60)}]});
 if(n==="tally_recon_coverage") return ok({generated_at:iso(12),from_snapshot:true,stale:false,gap_days:7,companies:co.map((c,i)=>({company:c,first_date:"2023-01-01",last_date:"2026-11-24",days_with:1300-i*100,span_days:1424,gaps:i%3})),gaps:[{company:co[6],gap_from:"2026-04-03",gap_to:"2026-04-29",days:27},{company:co[4],gap_from:"2025-01-02",gap_to:"2025-01-14",days:13},{company:co[7],gap_from:"2026-03-17",gap_to:"2026-03-28",days:12}]});
 if(n==="tally_balance_check"){ if(!("p_live" in (a||{}))) return {data:null,error:{code:"57014",message:"canceling statement due to statement timeout"}};
   if(a.p_live && !a.p_company) return {data:null,error:{code:"22023",message:"choose one company for a live check"}};
   const byc=co.filter(c=>!a.p_company||c===a.p_company).flatMap((c,i)=>vt.map((t,j)=>({company:c,vtype:t,total:rows[co.indexOf(c)]/5|0,balanced:rows[co.indexOf(c)]/5|0,unbalanced:0})));
   return ok({generated_at:a.p_live?new Date().toISOString():iso(18),from_snapshot:!a.p_live,stale:false,company:a.p_company,rows:vt.map((t,j)=>({vtype:t,total:60000-j*9000,balanced:60000-j*9000,unbalanced:0})),by_company:byc,no_entries:[{company:co[2],n:15415},{company:co[6],n:347}],unbalanced_sample:[]}); }
 if(n==="tally_voucher_search") return ok({total:5093,limit:a.p_limit,offset:a.p_offset,rows:Array.from({length:Math.min(a.p_limit,50)},(_,i)=>mkV(i+a.p_offset,a))});
 if(n==="tally_ledger_list") return ok({total:2682,rows:Array.from({length:Math.min(a.p_limit,50)},(_,i)=>({company:a.p_company||co[i%9],ledger:["Cash","Sales Coil","NABIAD-CASH & BANK","Purchase Coil"][i%4]+(i>3?" "+i:""),parent:["Cash-in-hand","Sales Accounts","Sundry Creditors","Purchase Accounts"][i%4],dr:1e7-i*1e5,cr:9e6-i*9e4,n:900-i*7}))});
 if(n==="tally_ledger_statement") return ok({parent:"Cash-in-hand",n:3,dr:3000,cr:1000,truncated:false,rows:[{vdate:"2026-11-01",vtype:"Receipt",vno:"1",narration:"x",amt:-2000,other:"Party A"},{vdate:"2026-11-02",vtype:"Payment",vno:"2",narration:null,amt:1000,other:"Party B"},{vdate:"2026-11-03",vtype:"Receipt",vno:"3",narration:null,amt:-1000,other:"Party C"}]});
 return {data:null,error:{code:"PGRST202",message:"could not find the function "+n}}; }};
sb={rpc:(n,a)=>{ const p=base.rpc(n,a); p.abortSignal=sig=>new Promise((res,rej)=>{ p.then(res,rej); sig.addEventListener("abort",()=>{ window.__aborts.push(n); rej(Object.assign(new Error("AbortError"),{name:"AbortError"})); }); }); return p; }};
'''
TABS = ["overview","companies","vouchers","ledgers","recon","sync"]
RT = ["shared","cash","changes","coverage","balance","pending"]
async def main():
  res = {"errors": {}, "checks": {}}
  async with async_playwright() as p:
    br = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    for tag, w, h, mob, lang, theme in (("dk", 1440, 900, False, "en", "light"), ("ph", 390, 844, True, "en", "light"), ("dkdark", 1440, 900, False, "bn", "dark")):
      if not FULL and tag == "dkdark": continue
      ctx = await br.new_context(service_workers="block", viewport={"width": w, "height": h}, is_mobile=mob, has_touch=mob); pg = await ctx.new_page(); errs = []
      await pg.add_init_script(f"try{{localStorage.setItem('nabiad_lang','{lang}');localStorage.setItem('nabiad_theme','{theme}');}}catch(e){{}}")
      pg.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)[:200]))
      pg.on("console", lambda m: errs.append("CONSOLE " + m.text[:200]) if m.type == "error" and "fonts" not in m.text and "ERR_" not in m.text else None)
      for pat, body, ct in (("**/config.js*", CFG, "application/javascript"), ("**/tally.js*", TALLY, "application/javascript"), ("**/dev/accounts.json", ACC, "application/json"), ("**/dev/dist_parties.json", "[]", "application/json")):
        await pg.route(pat, (lambda b, c: (lambda r: r.fulfill(body=b, content_type=c)))(body, ct))
      await pg.route("**/dev/history.json", lambda r: r.fulfill(body=open("/tmp/uitest/hist_big.json").read(), content_type="application/json"))
      await pg.route("**/fonts.g*", lambda r: r.abort())
      await pg.goto("http://localhost:8977/"); await pg.wait_for_selector("[data-demo]"); await pg.click("[data-demo^=admin]"); await pg.wait_for_selector("#view")
      await pg.evaluate(MOCK)
      await pg.evaluate("location.hash='#/tallydash'"); await pg.wait_for_selector("[data-td-tab]"); await pg.wait_for_timeout(900)
      for t in TABS:
        await pg.click(f"[data-td-tab={t}]"); await pg.wait_for_timeout(700)
        if t == "recon":
          for rt in RT:
            await pg.click(f"[data-rt={rt}]"); await pg.wait_for_timeout(700)
            if rt == "balance" and not FULL:
              b = await pg.query_selector("#tb-run")
              if b: await b.click(); await pg.wait_for_timeout(500)
            await pg.screenshot(path=f"/tmp/shots/{TAG}/{tag}_recon_{rt}.png", full_page=True)
        else:
          await pg.screenshot(path=f"/tmp/shots/{TAG}/{tag}_{t}.png", full_page=True)
      if FULL and tag == "dk":
        c = res["checks"]
        await pg.click("[data-td-tab=vouchers]"); await pg.wait_for_selector("#td-body .td-vr")
        await pg.click("[data-pre=lmonth]"); await pg.wait_for_timeout(300)
        c["preset last month"] = await pg.evaluate("[document.querySelector('#td-fr').value, document.querySelector('#td-to').value, __calls.at(-1)[1].p_from, __calls.at(-1)[1].p_to]")
        await pg.select_option(".td-pg [data-ps] >> nth=0", "25"); await pg.wait_for_timeout(300)
        c["page size 25 -> rpc limit, both pagers"] = await pg.evaluate("[__calls.at(-1)[1].p_limit, [...document.querySelectorAll('.td-pg [data-ps]')].map(s=>s.value)]")
        await pg.click(".td-pg [data-nx] >> nth=0"); await pg.wait_for_timeout(300)
        c["next page offset"] = await pg.evaluate("__calls.at(-1)[1].p_offset")
        await pg.click("#td-body .td-vr >> nth=0"); await pg.wait_for_timeout(200)
        c["detail row balance check"] = await pg.inner_text(".td-vx .td-vdh .st")
        await pg.fill("#td-q", "megha"); await pg.wait_for_timeout(700)
        c["debounced live search sent q"] = await pg.evaluate("__calls.filter(x=>x[0]==='tally_voucher_search').at(-1)[1].p_q")
        c["recent search chip"] = await pg.evaluate("[...document.querySelectorAll('[data-rec]')].map(b=>b.textContent)")
        await pg.evaluate("location.hash='#/dash'"); await pg.wait_for_timeout(600); await pg.evaluate("location.hash='#/tallydash'"); await pg.wait_for_selector("[data-td-tab].on"); await pg.wait_for_timeout(600)
        c["tab restored after leaving"] = await pg.evaluate("[document.querySelector('[data-td-tab].on').dataset.tdTab, location.hash, document.querySelector('#td-fr')?.value]")
        await pg.keyboard.press("Alt+5"); await pg.wait_for_timeout(600)
        c["Alt+5 -> recon, sub-tab remembered"] = await pg.evaluate("[document.querySelector('[data-td-tab].on').dataset.tdTab, document.querySelector('[data-rt].on')?.dataset.rt]")
        await pg.click("[data-rt=balance]"); await pg.wait_for_timeout(500); await pg.click("#tb-live"); await pg.wait_for_timeout(300)
        c["live check without company refused in UI"] = await pg.evaluate("__calls.filter(x=>x[0]==='tally_balance_check' && x[1].p_live).length === 0")
        await pg.select_option("#tb-co", "Lalmatia Depo"); await pg.wait_for_timeout(300); await pg.click("#tb-live"); await pg.wait_for_timeout(400)
        c["live check one company"] = await pg.evaluate("__calls.filter(x=>x[0]==='tally_balance_check' && x[1].p_live).map(x=>x[1].p_company)")
        await pg.click("[data-td-tab=overview]"); await pg.wait_for_selector(".td-cols button"); await pg.wait_for_timeout(500)
        c["overview balance line"] = (await pg.inner_text("#to-bal"))[:90]
        await pg.click(".td-cols button >> nth=3"); await pg.wait_for_timeout(600)
        c["month column drill -> vouchers period"] = await pg.evaluate("[document.querySelector('[data-td-tab].on').dataset.tdTab, document.querySelector('#td-fr').value, document.querySelector('#td-to').value]")
        await pg.click("[data-td-tab=overview]"); await pg.wait_for_selector("button.td-bar"); await pg.wait_for_timeout(400)
        await pg.click("button.td-bar >> nth=1"); await pg.wait_for_timeout(600)
        c["company bar drill -> vouchers company"] = await pg.evaluate("[document.querySelector('[data-td-tab].on').dataset.tdTab, document.querySelector('#td-co').value]")
        await pg.evaluate("TD.company='';TD.from='';TD.to=''")
        await pg.keyboard.press("Control+k"); await pg.wait_for_selector(".pal input"); await pg.fill(".pal input", "megha"); await pg.wait_for_timeout(200)
        c["Ctrl+K Tally items"] = await pg.evaluate("[...document.querySelectorAll('.pal .grp')].map(g=>g.textContent)")
        await pg.keyboard.press("Escape")
        await pg.click("[data-td-tab=sync]"); await pg.wait_for_timeout(700)
        c["sync duration + version"] = await pg.evaluate("[document.querySelector('#ts-body tr td:nth-child(5)').textContent, document.querySelector('#ts-body tr .xs')?.textContent]")
        c["sync connection layers"] = await pg.evaluate("document.querySelectorAll('.td-grid2 table tr').length")
        await pg.click("#td-dense"); c["density toggle"] = await pg.evaluate("document.querySelector('#td-out').classList.contains('td-dense')")
        c["aborts so far"] = await pg.evaluate("__aborts.length")
        c["hscroll"] = await pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")
      res["errors"][tag] = errs
      await ctx.close()
    await br.close()
  print(json.dumps(res, ensure_ascii=False, indent=1))
try: asyncio.run(main())
finally: srv.terminate()
