"""Overview page of NABIAD DATA BRIDGE: builds the widgets (build) and paints what overview_model worked out (render).
The window (nabiad_bridge_app.pyw) owns the data and the timers; nothing here talks to Tally or the database."""
import datetime as dt

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (QBoxLayout, QFrame, QHBoxLayout, QHeaderView, QLabel, QProgressBar, QPushButton, QScrollArea, QTableWidget,
                               QTableWidgetItem, QVBoxLayout, QWidget)

import overview_model as M
import ui_kit as K
from ui_kit import t

WIDE_FROM = 1240      # window width from which cards sit side by side
LIVE_W = 310
STATE_KEY = dict(synced="s.synced", running="st.syncing", stale="st.stale", failed="st.failed", never="st.never")
STATE_COLOR = dict(synced="green", running="sky", stale="amber", failed="red", never="amber")


# ------------------------------------------------------------------ small helpers
def _clear(lay):
    while lay.count():
        it = lay.takeAt(0)
        w = it.widget()
        if w is not None:
            w.setParent(None); w.deleteLater()
        elif it.layout() is not None:
            _clear(it.layout())


def when(d, now):
    if d is None:
        return "-"
    d = d.astimezone(); hm = d.strftime("%H:%M")
    if d.date() == now.date():
        return t("when.today", hm)
    if (now.date() - d.date()).days == 1:
        return t("when.yday", hm)
    return d.strftime("%d %b ") + hm


def dur(mins):
    h, m = divmod(int(mins), 60)
    return t("dur.hm", h, m) if h else t("dur.m", m)


def ago(hours):
    if hours is None:
        return "-"
    mins = int(hours * 60)
    if mins < 1:
        return t("ago.now")
    if mins < 60:
        return t("ago.m", mins)
    if mins < 48 * 60:
        return t("ago.h", mins // 60)
    return t("ago.d", mins // 1440)


def names(lst, k=3):
    return ", ".join(lst[:k]) + (f" +{len(lst) - k}" if len(lst) > k else "")


class Node(QFrame):
    """One stop of the data pipeline: name, live status text (value) and a caption (note). Same API as card()."""
    def __init__(self, title, sub):
        super().__init__()
        self.setObjectName("panel")
        l = QVBoxLayout(self); l.setContentsMargins(14, 10, 14, 10); l.setSpacing(2)
        self.title = QLabel(title); self.title.setObjectName("h2")
        self.value = QLabel("-"); self.value.setStyleSheet("font-weight:600;")
        self.note = QLabel(sub); self.note.setObjectName("muted"); self.note.setWordWrap(True)
        for w in (self.title, self.value, self.note):
            l.addWidget(w)

    def paint(self, kind, p):
        c = p[K.KIND_COLOR[kind]] if kind else p["line"]
        self.setStyleSheet(f"QFrame#panel {{ border-color:{c}; }}")


def _panel(title, right=None):
    f = QFrame(); f.setObjectName("card")
    lay = QVBoxLayout(f); lay.setContentsMargins(16, 14, 16, 14); lay.setSpacing(8)
    head = QHBoxLayout(); a = QLabel(title); a.setObjectName("h2"); head.addWidget(a); head.addStretch()
    if right is not None:
        head.addWidget(right)
    lay.addLayout(head)
    return f, lay


def _row(icon, color, text, tip="", muted=False):
    r = QHBoxLayout(); r.setSpacing(8)
    i = QLabel(icon); i.setFixedWidth(18); i.setAlignment(Qt.AlignTop | Qt.AlignHCenter); i.setStyleSheet(f"color:{color}; font-weight:800; border:0;")
    x = QLabel(text); x.setWordWrap(True)
    if muted:
        x.setObjectName("muted")
    if tip:
        x.setToolTip(tip)
    r.addWidget(i); r.addWidget(x, 1)
    return r


# ------------------------------------------------------------------ build
def build(win, card, button):
    sc = QScrollArea(); sc.setWidgetResizable(True); sc.setFrameShape(QFrame.NoFrame)
    w = QWidget(); w.setObjectName("page")
    v = QVBoxLayout(w); v.setContentsMargins(28, 22, 28, 20); v.setSpacing(K.SP["md"])

    # header: title, one status pill, refresh, ONE primary action
    row = QHBoxLayout(); row.setSpacing(K.SP["md"])
    box = QVBoxLayout(); box.setSpacing(2)
    a = QLabel(t("ov.title")); a.setObjectName("title"); b = QLabel(t("ov.sub")); b.setObjectName("sub")
    box.addWidget(a); box.addWidget(b); row.addLayout(box, 1)
    win.pill_op = K.Pill(t("pill.checking"), "info", win.p); row.addWidget(win.pill_op, 0, Qt.AlignVCenter)
    win.b_ov_refresh = button(t("b.refresh_ov"), "", win.ov_refresh_now, "F5"); row.addWidget(win.b_ov_refresh, 0, Qt.AlignVCenter)
    win.b_sync_ov = button(t("b.sync_now"), "primary", lambda: win.start_job(["--until", win._until_for_now()], t("b.incr")), "Ctrl+R")
    row.addWidget(win.b_sync_ov, 0, Qt.AlignVCenter)
    v.addLayout(row)

    # one sentence that answers "is everything fine?"
    win.al_head = win.alert("info", "", False); v.addWidget(win.al_head)

    # four numbers
    k = QHBoxLayout(); k.setSpacing(K.SP["md"])
    win.c_co = card(t("kpi.cos"), "0", ""); win.c_v = card(t("kpi.v"), "-", ""); win.c_issues = card(t("kpi.issues"), "-", ""); win.c_sch = card(t("kpi.next"), "-", "")
    for c in (win.c_co, win.c_v, win.c_issues, win.c_sch):
        k.addWidget(c)
    v.addLayout(k)

    # live pipeline
    win.b_testconn = button(t("b.test_conn"), "", win.test_connections)
    pipe, pl = _panel(t("sec.pipe"), win.b_testconn)
    nodes = QHBoxLayout(); nodes.setSpacing(10)
    win.c_tally = Node(t("pipe.tally"), t("pipe.src")); win.c_eng = Node(t("pipe.engine"), t("pipe.eng")); win.c_db = Node(t("pipe.supa"), t("pipe.db"))
    win.lnk1, win.lnk2 = QLabel("⟶"), QLabel("⟶")
    for lk in (win.lnk1, win.lnk2):
        lk.setAlignment(Qt.AlignCenter); lk.setFixedWidth(34)
    nodes.addWidget(win.c_tally, 1); nodes.addWidget(win.lnk1); nodes.addWidget(win.c_eng, 1); nodes.addWidget(win.lnk2); nodes.addWidget(win.c_db, 1)
    pl.addLayout(nodes)
    v.addWidget(pipe)

    # company status | live sync
    win.ov_mid = QBoxLayout(QBoxLayout.LeftToRight); win.ov_mid.setSpacing(K.SP["md"])
    left, ll = _panel(t("sec.costatus"))
    win.ov_tbl = QTableWidget(0, 5)
    win._style_table(win.ov_tbl, [t("col.name"), t("col.lastshort"), t("col.vshort"), t("col.age"), t("col.status")])
    win.ov_tbl.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
    win.ov_tbl.setVerticalScrollBarPolicy(Qt.ScrollBarAlwaysOff); win.ov_tbl.setFocusPolicy(Qt.NoFocus)
    ll.addWidget(win.ov_tbl)
    win.ov_live, rl = _panel(t("sec.live"))
    win.lv_state = QLabel(t("eng.idle")); win.lv_state.setObjectName("cardvalue")
    win.lv_bar = QProgressBar(); win.lv_bar.setRange(0, 1)
    win.lv_now = QLabel(""); win.lv_now.setWordWrap(True)
    win.lv_stats = QLabel(""); win.lv_stats.setObjectName("muted"); win.lv_stats.setWordWrap(True)
    win.lv_l0 = QLabel(t("live.last")); win.lv_l0.setObjectName("muted")
    win.lv_l1 = QLabel(""); win.lv_l1.setWordWrap(True); win.lv_l2 = QLabel(""); win.lv_l2.setObjectName("muted"); win.lv_l2.setWordWrap(True)
    win.b_stop_ov = button(t("b.stop"), "danger", win.stop_any)
    for x in (win.lv_state, win.lv_bar, win.lv_now, win.lv_stats, win.lv_l0, win.lv_l1, win.lv_l2):
        rl.addWidget(x)
    rl.addStretch(); rl.addWidget(win.b_stop_ov)
    win.ov_mid.addWidget(left, 1); win.ov_mid.addWidget(win.ov_live)
    v.addLayout(win.ov_mid)

    # data integrity | trend
    win.ov_pair1 = QBoxLayout(QBoxLayout.LeftToRight); win.ov_pair1.setSpacing(K.SP["md"])
    ic, il = _panel(t("sec.integrity")); win.ic_box = QVBoxLayout(); win.ic_box.setSpacing(6); il.addLayout(win.ic_box); il.addStretch()
    tr, tl = _panel(t("sec.trend")); win.tr_bars = K.Bars(win.p); tl.addWidget(win.tr_bars)
    win.tr_note = QLabel(t("tr.legend")); win.tr_note.setObjectName("caption"); win.tr_note.setWordWrap(True); tl.addWidget(win.tr_note)
    win.ov_pair1.addWidget(ic, 1); win.ov_pair1.addWidget(tr, 1)
    v.addLayout(win.ov_pair1)

    # recent activity | action center
    win.ov_pair2 = QBoxLayout(QBoxLayout.LeftToRight); win.ov_pair2.setSpacing(K.SP["md"])
    ra, rlay = _panel(t("sec.recent")); win.ra_box = QVBoxLayout(); win.ra_box.setSpacing(6); rlay.addLayout(win.ra_box); rlay.addStretch()
    ac, al = _panel(t("sec.actions"))
    ur = QHBoxLayout(); ur.setSpacing(K.SP["md"])          # the update notice lives here (Settings → Updates paints it)
    win.al_update = win.alert("info", "", False); ur.addWidget(win.al_update, 1)
    win.b_up_ov = button(t("up.now"), "primary", win.update_now); win.b_up_ov.hide(); ur.addWidget(win.b_up_ov, 0, Qt.AlignVCenter)
    al.addLayout(ur)
    win.ac_box = QVBoxLayout(); win.ac_box.setSpacing(8); al.addLayout(win.ac_box); al.addStretch()
    win.ov_pair2.addWidget(ra, 1); win.ov_pair2.addWidget(ac, 1)
    v.addLayout(win.ov_pair2)

    win.ov_foot = QLabel(""); win.ov_foot.setObjectName("caption"); v.addWidget(win.ov_foot)
    v.addStretch()
    sc.setWidget(w)
    win._ov_sig = {}
    relayout(win, win.width() or 1280)
    return sc


def relayout(win, width):
    """Wide window: cards side by side. Narrow window: stacked, so nothing is squeezed."""
    narrow = width < WIDE_FROM
    d = QBoxLayout.TopToBottom if narrow else QBoxLayout.LeftToRight
    for lay in (win.ov_mid, win.ov_pair1, win.ov_pair2):
        lay.setDirection(d)
    if narrow:
        win.ov_live.setMinimumWidth(0); win.ov_live.setMaximumWidth(16777215)
    else:
        win.ov_live.setFixedWidth(LIVE_W)


# ------------------------------------------------------------------ render
def render(win, d, now):
    """Paint the page from overview_model.summarize() output. Only parts whose content changed are rebuilt."""
    p, n = win.p, win.n
    sig = win._ov_sig
    head, counts, total = d["head"], d["counts"], d["total"]
    prog = d["progress"] if d["running"] else None

    # ---- headline + pill + primary action
    tail = ""
    if d["last_sync"]:
        tail += t("ov.t.last", when(d["last_sync"], now))
    sched = getattr(win, "sched_info", None)
    if d["next"]:
        tail += t("ov.t.next", d["next"].strftime("%H:%M"), dur(M.minutes_between(now, d["next"])))
    elif sched is not None and not sched.get("installed"):
        tail += t("ov.t.nonext")
    if head["id"] == "running":
        text = t("ov.h.running", head["done"], head["total"]) + (" " + t("live.now", head["current"]) if head.get("current") else "")
        pill = (t("live.syncing"), "info")
    elif head["id"] == "healthy":
        text, pill = t("ov.h.healthy", head["total"]) + tail, (t("pill.healthy"), "success")
    elif head["id"] == "issues":
        text, pill = t("ov.h.issues", head["n"]) + tail, (t("pill.attn"), head["kind"])
    elif head["id"] == "setup":
        text, pill = t("ov.h.setup"), (t("pill.attn"), "warn")
    elif head["id"] == "dbdown":
        text, pill = t("ov.h.dbdown"), (t("pill.attn"), "error")
    else:
        text, pill = t("ov.h.nodata"), (t("pill.checking"), "info")
    win.al_head.set(head["kind"], text, p)
    win.pill_op.set(pill[0], pill[1], p)
    win.b_sync_ov.setEnabled(not d["running"])
    win.b_sync_ov.setToolTip(t("al.busy") if d["running"] else "Ctrl+R")

    # ---- four numbers
    ok_all = counts["synced"] == total and total > 0
    win.set_state(win.c_co, f"{counts['synced']} / {total}", "success" if ok_all else ("error" if counts["failed"] else "warn"))
    bad = total - counts["synced"] - counts["running"]
    win.c_co.note.setText(t("kpi.cos.ok") if ok_all else (t("kpi.cos.bad", bad) if bad > 0 else (t("kpi.cos.run", counts["running"]) if counts["running"] else "")))
    s = d["session"]
    win.c_v.value.setText(n(s["vouchers"]) if s else "0")
    win.c_v.note.setText(t("kpi.v.note", when(s["end"], now), d["pending"]) if s else t("kpi.v.none"))
    ni = len(d["issues"])
    win.set_state(win.c_issues, str(ni), "success" if ni == 0 else ("error" if any(i["kind"] == "error" for i in d["issues"]) else "warn"))
    win.c_issues.note.setText(t("kpi.issues.none") if ni == 0 else t("kpi.issues.some"))
    if d["next"]:
        win.set_state(win.c_sch, d["next"].strftime("%H:%M"), "info"); win.c_sch.note.setText(t("kpi.next.note", dur(M.minutes_between(now, d["next"]))))
    else:
        win.set_state(win.c_sch, t("kpi.next.none"), "warn" if sched is not None else "info"); win.c_sch.note.setText("")

    # ---- pipeline (status text of Tally / database comes from the checks; here: colours, links, engine)
    tok, dok = win.tally_ok, win.db_ok
    if not getattr(win, "tally_checking", False):
        win.set_state(win.c_tally, t("s.portopen") if tok else (t("s.noanswer") if tok is False else t("s.nottested")), "success" if tok else ("error" if tok is False else "info"))
    if not getattr(win, "db_checking", False):
        have = win.login_saved
        win.set_state(win.c_db, t("s.signedin") if dok else (t("s.unreach") if dok is False else (t("s.login") if not have else t("s.notchecked"))),
                      "success" if dok else ("error" if dok is False else ("warn" if not have else "info")))
    if d["running"]:
        win.set_state(win.c_eng, t("eng.running", prog["done"], prog["total"]) if prog["total"] else t("live.syncing"), "info")
        win.c_eng.note.setText(prog.get("current") or t("pipe.eng"))
    else:
        win.set_state(win.c_eng, t("eng.idle"), "success" if ok_all else "info"); win.c_eng.note.setText(t("pipe.eng"))
    win.c_tally.paint("success" if tok else ("error" if tok is False else None), p)
    win.c_db.paint("success" if dok else ("error" if dok is False else None), p)
    win.c_eng.paint("info" if d["running"] else None, p)
    act = p["sky"]
    for lk, ok in ((win.lnk1, tok), (win.lnk2, dok)):
        col = act if d["running"] and ok is not False else (p["green"] if ok else (p["red"] if ok is False else p["muted"]))
        lk.setStyleSheet(f"font-size:24px; color:{col}; border:0;")
    win.b_testconn.setEnabled(not d["running"])

    # ---- company table (updated in place)
    rows = d["rows"]
    tb = win.ov_tbl
    tb.setRowCount(len(rows))
    for i, r in enumerate(rows):
        vals = [r["company"], when(r["last_ok"], now) if r["last_ok"] else t("s.nonrec"), n(r["vouchers"]) if r["vouchers"] is not None else "-",
                ago(r["age_h"]) if r["age_h"] is not None else "-", t(STATE_KEY[r["state"]])]
        for j, x in enumerate(vals):
            it = tb.item(i, j)
            if it is None:
                it = QTableWidgetItem(); tb.setItem(i, j, it)
            it.setText(x); it.setToolTip(r["error"] if (j == 4 and r["error"]) else "")
        tb.item(i, 4).setForeground(QColor(p[STATE_COLOR[r["state"]]]))
    tb.setFixedHeight(34 + 36 * max(1, len(rows)) + 4)

    # ---- live sync card
    run = d["running"]
    win.lv_bar.setVisible(run); win.lv_now.setVisible(run); win.lv_stats.setVisible(run); win.b_stop_ov.setVisible(run)
    win.lv_l0.setVisible(not run); win.lv_l1.setVisible(not run); win.lv_l2.setVisible(not run)
    if run:
        win.set_state_label(win.lv_state, t("live.syncing"), "info")
        if prog["total"]:
            win.lv_bar.setRange(0, prog["total"]); win.lv_bar.setValue(prog["done"])
        else:
            win.lv_bar.setRange(0, 0)
        win.lv_now.setText(t("live.now", prog["current"]) if prog.get("current") else t("live.wait"))
        el = M.minutes_between(prog["started"], now.replace(tzinfo=None)) if prog.get("started") else 0
        eta = M.eta_minutes(prog, now)
        win.lv_stats.setText(t("live.stats", n(prog["vouchers"]), el, t("live.eta", eta) if eta is not None else ""))
    else:
        win.set_state_label(win.lv_state, t("eng.idle"), "success" if ok_all else "info")
        if s:
            win.lv_l1.setText(t("live.l1", when(s["end"], now), dur(s["minutes"])))
            win.lv_l2.setText(t("live.l2", s["ok"], s["runs"], n(s["vouchers"])))
        else:
            win.lv_l1.setText(t("live.none")); win.lv_l2.setText("")

    # ---- data integrity
    csig = tuple((c["id"], c["ok"], c["arg"]) for c in d["checks"])
    if sig.get("ic") != (csig, K.LANG, id(p)):
        sig["ic"] = (csig, K.LANG, id(p)); _clear(win.ic_box)
        for c in d["checks"]:
            if c["ok"] is None:
                win.ic_box.addLayout(_row("·", p["muted"], t("s.notchecked"), muted=True))
            elif c["ok"]:
                win.ic_box.addLayout(_row("✓", p["green"], t("ic." + c["id"])))
            else:
                win.ic_box.addLayout(_row("✕" if c["id"] in ("nofail", "data") else "!", p["red"] if c["id"] in ("nofail", "data") else p["amber"], t("ic." + c["id"] + ".bad", c["arg"])))

    # ---- trend
    days = [dict(label=str(x["day"].day), ok=x["ok"], failed=x["failed"], tip=t("tr.tip", x["day"].strftime("%d %b"), x["ok"], x["failed"], n(x["vouchers"]))) for x in d["trend"]]
    win.tr_bars.set_data(days, p)

    # ---- recent activity
    rec = M.recent_activity(win.runs, 7)
    rsig = tuple((r[0].isoformat(), r[1], r[2]) for r in rec)
    if sig.get("ra") != (rsig, K.LANG, id(p), win.numfmt):
        sig["ra"] = (rsig, K.LANG, id(p), win.numfmt); _clear(win.ra_box)
        if not rec:
            win.ra_box.addLayout(_row("·", p["muted"], t("ra.none"), muted=True))
        for f, ok, co, vc, err in rec:
            tm = when(f, now)
            if ok:
                win.ra_box.addLayout(_row("✓", p["green"], f"{tm}  ·  " + t("ra.ok", co, n(vc) if vc is not None else "-")))
            elif ok is False:
                win.ra_box.addLayout(_row("✕", p["red"], f"{tm}  ·  " + t("ra.fail", co), tip=err[:300]))
            else:
                win.ra_box.addLayout(_row("▶", p["sky"], f"{tm}  ·  {co} · {t('st.syncing')}"))

    # ---- action center
    asig = (tuple((i["id"], i.get("arg"), tuple(i.get("names", ()))) for i in d["issues"]), bool(win.upd), K.LANG, id(p))
    if sig.get("ac") != asig:
        sig["ac"] = asig; _clear(win.ac_box)
        go = win.go
        spec = {"config": (lambda i: t("ac.config"), None, None), "login": (lambda i: t("ac.login"), "ac.b.login", lambda: go(2)),
                "db": (lambda i: t("ac.db", i.get("arg") or "?"), "ac.b.check", win.ov_refresh_now), "tally": (lambda i: t("ac.tally"), "ac.b.check", win.check_tally_quiet),
                "sched_none": (lambda i: t("ac.sched_none"), "ac.b.sched", lambda: go(4)), "sched_old": (lambda i: t("al.sched_old"), "ac.b.sched", lambda: go(4)),
                "failed": (lambda i: t("ac.failed", names(i["names"])), "ac.b.sync", lambda: go(3)), "never": (lambda i: t("ac.never", names(i["names"])), "ac.b.sync", lambda: go(3)),
                "stale": (lambda i: t("ac.stale", names(i["names"])), "ac.b.sync", lambda: go(3)), "nocompany": (lambda i: t("ac.nocompany"), "ac.b.co", lambda: go(1))}
        for i in d["issues"]:
            txt, bkey, cb = spec[i["id"]]
            line = QHBoxLayout(); line.setSpacing(K.SP["md"])
            line.addWidget(K.Alert(i["kind"], txt(i), p, False), 1)
            if bkey:
                b = QPushButton(t(bkey)); b.setCursor(Qt.PointingHandCursor); b.clicked.connect(lambda _=False, cb=cb: cb())
                line.addWidget(b, 0, Qt.AlignVCenter)
            win.ac_box.addLayout(line)
        if not d["issues"] and not win.upd:
            win.ac_box.addWidget(K.Alert("success", t("ac.none"), p, False))

    # ---- footer
    parts = []
    ref = getattr(win, "ov_refreshed", None)
    stale = False
    if ref is not None:
        interval = int(win.ui.get("refresh_sec", 60))
        stale = (now - ref).total_seconds() > (900 if interval <= 0 else max(150, 2.5 * interval))
        hm = ref.strftime("%d %b %H:%M" if ref.date() != now.date() else "%H:%M:%S")
        parts.append(t("ft.cached", hm) if getattr(win, "ov_cached", False) else (t("ft.stale", hm) if stale else t("ft.refreshed", hm)))
    parts.append(t("ft.db.ok") if dok else (t("ft.db.bad") if dok is False else t("ft.db.unk")))
    parts.append(t("ft.ver", win.app_version))
    win.ov_foot.setText("   ·   ".join(parts))
    warn = getattr(win, "ov_cached", False) or stale or dok is False
    win.ov_foot.setStyleSheet(f"color:{p['amber'] if warn else p['muted']}; font-size:{K.FS['caption']}px;")

