"""Fake Tally HTTP server for tests. Mimics the shape of standard XML exports; not a copy of any real company."""
import re, threading
from http.server import BaseHTTPRequestHandler, HTTPServer

LEDGERS = """<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="Cash" RESERVEDNAME=""><PARENT>Cash-in-Hand</PARENT></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="Test Party &amp; Co"><PARENT>Sundry Debtors</PARENT></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="Test Factory Ltd."><PARENT>Sundry Creditors</PARENT></LEDGER></TALLYMESSAGE>
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>"""

def voucher(guid, date, vtype, no, narr, entries, cancelled="No"):
    ents = "".join(f"<ALLLEDGERENTRIES.LIST><LEDGERNAME>{n}</LEDGERNAME><AMOUNT>{a}</AMOUNT></ALLLEDGERENTRIES.LIST>" for n, a in entries)
    return (f'<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER REMOTEID="{guid}" VCHTYPE="{vtype}" ACTION="Create">'
            f"<DATE>{date}</DATE><GUID>{guid}</GUID><VOUCHERTYPENAME>{vtype}</VOUCHERTYPENAME><VOUCHERNUMBER>{no}</VOUCHERNUMBER>"
            f"<NARRATION>{narr}</NARRATION><ALTERID>{no}</ALTERID><ISCANCELLED>{cancelled}</ISCANCELLED>{ents}</VOUCHER></TALLYMESSAGE>")

VOUCHERS = [
    voucher("g-1", "20261102", "Receipt", 1, "Collection &#4;ctrl", [("Cash", "-1500.00"), ("Test Party &amp; Co", "1500.00")]),
    voucher("g-2", "20261104", "Journal", 2, "to factory", [("Test Factory Ltd.", "-9000.00"), ("Cash", "9000.00")]),
    voucher("g-3", "20261110", "Payment", 3, "cancelled one", [("Test Party &amp; Co", "-200.00"), ("Cash", "200.00")], "Yes"),
]

class Handler(BaseHTTPRequestHandler):
    log = []
    ignore_dates = False
    drop = set()          # GUIDs Tally "no longer has" (deleted vouchers)
    crash_after = None  # int: close the connection once this many requests were served
    loaded = None       # set of company names Tally has open; None = every company is loaded

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("utf-8")
        Handler.log.append(body)
        if Handler.crash_after is not None and len(Handler.log) > Handler.crash_after:
            self.connection.close(); return
        rid = re.search(r"<ID>(.*?)</ID>", body).group(1)
        cm = re.search(r"<SVCURRENTCOMPANY>(.*?)</SVCURRENTCOMPANY>", body)
        cname = cm.group(1).replace("&amp;", "&") if cm else None
        if rid == "List of Companies":
            names = sorted(Handler.loaded or [])
            out = "<ENVELOPE><BODY><DATA><COLLECTION>" + "".join(
                f'<COMPANY NAME="{n.replace("&", "&amp;")}"><NAME>{n.replace("&", "&amp;")}</NAME></COMPANY>' for n in names) + "</COLLECTION></DATA></BODY></ENVELOPE>"
        elif Handler.loaded is not None and cname is not None and cname not in Handler.loaded:
            out = "<RESPONSE><LINEERROR>Could not set 'SVCurrentCompany' to '%s'</LINEERROR></RESPONSE>" % cname
        elif rid == "List of Accounts":
            out = LEDGERS
        elif rid == "Day Book":
            import datetime as _dt
            m = re.search(r"<SVCURRENTDATE>(.*?)</SVCURRENTDATE>", body)
            day = _dt.datetime.strptime(m.group(1), "%d-%b-%Y").strftime("%Y%m%d") if m else "20261110"
            if Handler.ignore_dates:
                day = "20261110"   # simulate a Tally that ignores the requested date
            hit = [v for v in VOUCHERS if re.search(r"<DATE>(\d+)", v).group(1) == day
                   and re.search(r"<GUID>(.*?)</GUID>", v).group(1) not in Handler.drop]  # real Tally follows SVCURRENTDATE
            out = "<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>" + "".join(hit) + "</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>"
        else:
            out = "<ENVELOPE>unknown report</ENVELOPE>"
        data = out.encode("utf-8")
        self.send_response(200); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

    def log_message(self, *a): pass

def start():
    Handler.log = []; Handler.crash_after = None; Handler.ignore_dates = False; Handler.drop = set(); Handler.loaded = None
    srv = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, Handler
