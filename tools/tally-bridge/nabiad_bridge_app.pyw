"""NABIAD DATA BRIDGE: desktop control center for the read-only TallyPrime -> Supabase mirror.
Needs PySide6 (setup.bat installs it). The sync engine (bridge.py / nightly_sync.py) is unchanged; this window only calls it.
Nothing is ever written to Tally."""
import csv, datetime as dt, json, os, re, shutil, subprocess, sys, time, traceback

from PySide6.QtCore import QLockFile, QStandardPaths, Qt, QThread, QTimer, Signal
from PySide6.QtGui import QAction, QColor, QFont, QIcon, QKeySequence, QLinearGradient, QPainter, QPixmap, QBrush, QShortcut
from PySide6.QtWidgets import (QAbstractItemView, QApplication, QCheckBox, QComboBox, QFileDialog, QFrame, QGridLayout, QHBoxLayout,
                               QHeaderView, QLabel, QLineEdit, QMainWindow, QMenu, QMessageBox, QPlainTextEdit, QProgressBar, QPushButton,
                               QScrollArea, QStackedWidget, QSystemTrayIcon, QTableWidget, QTableWidgetItem, QVBoxLayout, QWidget,
                               QGraphicsDropShadowEffect)

HERE = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, "frozen", False) else __file__))
sys.path.insert(0, HERE)
import nightly_sync as ns  # noqa: E402
import ui_kit as K  # noqa: E402
from ui_kit import t  # noqa: E402

APP_VERSION = "1.0.0"
UI_SETTINGS = os.path.join(HERE, "ui_settings.json")
ERR_LOG = os.path.join(HERE, "app_error_log.txt")
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def logo_pixmap(size=64):
    pm = QPixmap(size, size); pm.fill(Qt.transparent)
    p = QPainter(pm); p.setRenderHint(QPainter.Antialiasing)
    g = QLinearGradient(0, 0, size, size)
    g.setColorAt(0, QColor("#4F46E5")); g.setColorAt(0.55, QColor("#8B5CF6")); g.setColorAt(1, QColor("#0EA5E9"))
    p.setBrush(QBrush(g)); p.setPen(Qt.NoPen); p.drawRoundedRect(0, 0, size, size, size * 0.24, size * 0.24)
    p.setPen(QColor("white")); f = QFont("Segoe UI", int(size * 0.5)); f.setBold(True); p.setFont(f)
    p.drawText(pm.rect(), Qt.AlignCenter, "N"); p.end()
    return pm


def now_s():
    return time.strftime("%H:%M:%S")


def log_error(text):
    try:
        with open(ERR_LOG, "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + text + "\n")
        if os.path.getsize(ERR_LOG) > 1_000_000:
            data = open(ERR_LOG, "rb").read(); open(ERR_LOG, "wb").write(data[len(data) // 2:])
    except OSError:
        pass


# ------------------------------------------------------------------ background work (the window never blocks)
class Task(QThread):
    done = Signal(object, object)

    def __init__(self, fn, *a):
        super().__init__(); self.fn, self.a = fn, a

    def run(self):
        try:
            self.done.emit(self.fn(*self.a), None)
        except SystemExit as e:
            self.done.emit(None, str(e))
        except Exception as e:  # noqa
            log_error("Task failed:\n" + traceback.format_exc())
            self.done.emit(None, f"{type(e).__name__}: {e}")


class Job(QThread):
    """Runs nightly_sync.py as a hidden child process and streams its lines. Stop is cooperative (stop flag)."""
    line = Signal(str)
    finished_rc = Signal(int)

    def __init__(self, args):
        super().__init__(); self.args, self.proc = args, None

    def run(self):
        py = sys.executable
        if py.lower().endswith("pythonw.exe"):
            py = py[:-len("pythonw.exe")] + "python.exe"
        cmd = [py, "-u", os.path.join(HERE, "nightly_sync.py")] + self.args
        if getattr(sys, "frozen", False):  # packaged build: the same exe runs the engine
            cmd = [sys.executable, "--engine"] + self.args
        try:
            self.proc = subprocess.Popen(cmd, cwd=HERE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                                         errors="replace", creationflags=CREATE_NO_WINDOW)
            for ln in self.proc.stdout:
                self.line.emit(ln.rstrip())
            self.finished_rc.emit(self.proc.wait())
        except Exception as e:  # noqa
            self.line.emit(f"{time.strftime('%Y-%m-%d %H:%M:%S')} STOP: could not start the job: {e}")
            self.finished_rc.emit(99)

    def request_stop(self):
        open(ns.STOP_FLAG, "w").close()


def level_of(text):
    s = text.lower()
    if any(k in s for k in ("stop:", "failed", "error", "mismatch", "could not")):
        return "ERROR"
    if any(k in s for k in ("not loaded", "waiting", "not answering", "warning", "skipped", "already running")):
        return "WARNING"
    if any(k in s for k in ("days read", " ok", "login ok", "saved")):
        return "SUCCESS"
    if ": start" in s or "run start" in s or "run end" in s:
        return "SYNC"
    return "INFO"


# ------------------------------------------------------------------ small helpers
def card(title, value="-", note=""):
    f = QFrame(); f.setObjectName("card")
    l = QVBoxLayout(f); l.setContentsMargins(K.SP["lg"], 14, K.SP["lg"], 14); l.setSpacing(K.SP["xs"])
    a = QLabel(title); a.setObjectName("cardtitle")
    v = QLabel(value); v.setObjectName("cardvalue")
    n = QLabel(note); n.setObjectName("muted"); n.setWordWrap(True)
    for w in (a, v, n):
        l.addWidget(w)
    sh = QGraphicsDropShadowEffect(f); sh.setBlurRadius(18); sh.setOffset(0, 4); sh.setColor(QColor(0, 0, 0, 55)); f.setGraphicsEffect(sh)
    f.title, f.value, f.note = a, v, n
    return f


def button(text, kind="", cb=None, tip=""):
    b = QPushButton(text)
    if kind:
        b.setObjectName(kind)
    if cb:
        b.clicked.connect(cb)
    if tip:
        b.setToolTip(tip)
    b.setCursor(Qt.PointingHandCursor)
    return b


def page_header(title, sub, extra=None):
    row = QHBoxLayout()
    box = QVBoxLayout(); box.setSpacing(2)
    a = QLabel(title); a.setObjectName("title"); b = QLabel(sub); b.setObjectName("sub")
    box.addWidget(a); box.addWidget(b); row.addLayout(box, 1)
    if extra is not None:
        row.addWidget(extra, 0, Qt.AlignTop)
    return row


class Window(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(f"NABIAD DATA BRIDGE {APP_VERSION}")
        self.setWindowIcon(QIcon(logo_pixmap(128)))
        self.setMinimumSize(1000, 660)
        self.ui = self._load_ui()
        K.set_lang(self.ui.get("lang", "en"))
        self.p = K.DARK
        self.job = None; self.tasks = set()
        self.runs = []; self.company_state = {}; self.log_rows = []
        self.tally_ok = None; self.db_ok = None; self.cfg = {}; self.dirty = False; self._really_quit = False
        self.co_rows = {}; self.vouchers_seen = 0; self.failed = 0
        self.toasts = K.ToastHost(self)
        self.tour = None
        self._restore_geometry()
        self._build()
        self.apply_theme(self.ui.get("theme", "dark"))
        self._load_config()
        self._tray()
        self._shortcuts()
        QTimer.singleShot(300, self.refresh_all)
        QTimer.singleShot(900, self.maybe_tour)
        self.timer = QTimer(self); self.timer.timeout.connect(self.refresh_light); self.timer.start(30000)

    # ---------------------------------------------------------------- settings / config
    def _load_ui(self):
        try:
            return json.load(open(UI_SETTINGS, encoding="utf-8"))
        except Exception:
            return {}

    def _save_ui(self):
        try:
            json.dump(self.ui, open(UI_SETTINGS, "w", encoding="utf-8"), indent=1)
        except OSError:
            pass

    def _restore_geometry(self):
        g = self.ui.get("geometry")
        if g and len(g) == 4:
            self.setGeometry(*g)
        else:
            self.resize(1280, 820)

    def _load_config(self):
        self.cfg_error = False
        try:
            self.cfg = ns.load_cfg()
        except Exception:
            self.cfg = {}; self.cfg_error = True
        self.al_cfg.set("warn", t("al.config_missing") if self.cfg_error else "")
        self.f_tally.setText(self.cfg.get("tally_url", "http://localhost:9000"))
        self.f_sburl.setText(self.cfg.get("supabase_url", ""))
        self.f_sbkey.setText(self.cfg.get("supabase_anon_key", ""))
        try:
            if ns.have_secret():
                self.f_email.setText(json.load(open(ns.SECRET, encoding="utf-8")).get("email", ""))
                self.f_pw.setPlaceholderText(t("f.pw_saved"))
        except Exception:
            pass
        self.tbl.blockSignals(True); self.tbl.setRowCount(0); self.tbl.blockSignals(False)
        starts = self.cfg.get("company_start_dates") or {}
        for c in self.cfg.get("companies", []):
            self.add_company_row(c, True, starts.get(c, self.cfg.get("start_date", "2023-01-01")))
        self.set_dirty(False); self.update_cards(); self.render_runs()

    # ---------------------------------------------------------------- layout
    def _build(self):
        root = QWidget(); self.setCentralWidget(root)
        h = QHBoxLayout(root); h.setContentsMargins(0, 0, 0, 0); h.setSpacing(0)
        self.side = QFrame(); self.side.setObjectName("sidebar"); self.side.setFixedWidth(240)
        sl = QVBoxLayout(self.side); sl.setContentsMargins(14, 18, 14, 14); sl.setSpacing(K.SP["xs"])
        brand = QHBoxLayout(); lg = QLabel(); lg.setPixmap(logo_pixmap(40)); brand.addWidget(lg)
        bt = QVBoxLayout(); bt.setSpacing(0)
        a = QLabel("NABIAD"); a.setObjectName("brandname"); b = QLabel("DATA BRIDGE"); b.setObjectName("brandsub")
        bt.addWidget(a); bt.addWidget(b); brand.addLayout(bt); brand.addStretch()
        sl.addLayout(brand); sl.addSpacing(K.SP["xl"])
        self.stack = QStackedWidget(); self.navs = []
        pages = [("◧", "nav.overview", self._p_overview), ("▤", "nav.companies", self._p_companies), ("⛓", "nav.connections", self._p_connections),
                 ("⟳", "nav.sync", self._p_sync), ("◷", "nav.scheduler", self._p_scheduler), ("▥", "nav.analytics", self._p_analytics),
                 ("≣", "nav.logs", self._p_logs), ("⚙", "nav.settings", self._p_settings), ("?", "nav.help", self._p_help)]
        for i, (ic, key, builder) in enumerate(pages):
            nb = QPushButton(f"{ic}   {t(key)}".replace("&", "&&")); nb.setObjectName("nav"); nb.setCheckable(True); nb.setCursor(Qt.PointingHandCursor)
            nb.setToolTip(f"Ctrl+{i + 1}"); nb.clicked.connect(lambda _=False, i=i: self.go(i))
            sl.addWidget(nb); self.navs.append(nb)
            self.stack.addWidget(builder())
        sl.addStretch()
        self.ver = QLabel(f"v{APP_VERSION}"); self.ver.setObjectName("caption")
        self.sidefoot = QLabel(t("side.foot")); self.sidefoot.setObjectName("muted")
        sl.addWidget(self.sidefoot); sl.addWidget(self.ver)
        h.addWidget(self.side); h.addWidget(self.stack, 1)
        self.go(0)

    def go(self, i):
        self.stack.setCurrentIndex(i)
        for k, b in enumerate(self.navs):
            b.setChecked(k == i)
        if i in (0, 5):
            self.refresh_runs()

    def _wrap(self, header, body_fn):
        w = QWidget(); w.setObjectName("page")
        v = QVBoxLayout(w); v.setContentsMargins(28, 24, 28, 20); v.setSpacing(K.SP["lg"])
        v.addLayout(header); body_fn(v)
        return w

    def _scroll(self, inner_fn):
        sc = QScrollArea(); sc.setWidgetResizable(True); sc.setFrameShape(QFrame.NoFrame)
        w = QWidget(); w.setObjectName("page"); v = QVBoxLayout(w); v.setContentsMargins(28, 24, 28, 20); v.setSpacing(K.SP["lg"])
        inner_fn(v); sc.setWidget(w)
        return sc

    def _style_table(self, tb, headers, stretch_first=True):
        tb.setColumnCount(len(headers)); tb.setHorizontalHeaderLabels(headers)
        tb.verticalHeader().setVisible(False); tb.setAlternatingRowColors(True); tb.setShowGrid(False)
        tb.setSelectionBehavior(QAbstractItemView.SelectRows); tb.setEditTriggers(QAbstractItemView.NoEditTriggers)
        hh = tb.horizontalHeader(); hh.setStretchLastSection(True); hh.setDefaultAlignment(Qt.AlignLeft | Qt.AlignVCenter)
        hh.setSectionResizeMode(0, QHeaderView.Stretch if stretch_first else QHeaderView.ResizeToContents)
        for c in range(1, len(headers) - 1):
            hh.setSectionResizeMode(c, QHeaderView.ResizeToContents)
        tb.verticalHeader().setDefaultSectionSize(36)

    def alert(self, kind="info", text="", dismissible=False):
        a = K.Alert(kind, text, self.p, dismissible)
        self.alerts.append(a)
        return a

    # ---- Overview
    def _p_overview(self):
        self.alerts = getattr(self, "alerts", []) if False else []
        def body(v):
            hero = QFrame(); hero.setObjectName("hero")
            hl = QHBoxLayout(hero); hl.setContentsMargins(22, 18, 22, 18)
            tb = QVBoxLayout(); tb.setSpacing(4)
            hk = QLabel("NABIAD DATA BRIDGE"); hk.setObjectName("brandsub")
            hh = QLabel(t("ov.title")); hh.setObjectName("title")
            hs = QLabel(t("ov.sub")); hs.setObjectName("sub")
            tb.addWidget(hk); tb.addWidget(hh); tb.addWidget(hs)
            self.pill_op = K.Pill(t("s.idle"), "info", self.p)
            tb.addWidget(self.pill_op, 0, Qt.AlignLeft)
            hl.addLayout(tb, 1)
            hl.addWidget(button(t("b.sync_now"), "primary", lambda: self.start_job(["--until", self._until_for_now()], t("b.incr")), "Ctrl+R"), 0, Qt.AlignVCenter)
            v.addWidget(hero)
            top = QHBoxLayout(); top.setSpacing(K.SP["md"])
            self.c_tally = card(t("card.tally"), t("s.nottested"), "")
            self.c_db = card(t("card.db"), t("s.login"), "")
            self.c_co = card(t("card.cos"), "0", t("card.cos.note"))
            self.c_sch = card(t("card.sched"), t("s.notchecked"), "")
            for c in (self.c_tally, self.c_db, self.c_co, self.c_sch):
                top.addWidget(c)
            v.addLayout(top)
            pipe = QFrame(); pipe.setObjectName("card")
            pl = QHBoxLayout(pipe); pl.setContentsMargins(20, 14, 20, 14)
            for k, (a1, a2) in enumerate([("TallyPrime", t("pipe.src")), ("Nabiad Bridge", t("pipe.eng")), ("Supabase", t("pipe.db"))]):
                bx = QVBoxLayout(); x1 = QLabel(a1); x1.setObjectName("h2"); x2 = QLabel(a2); x2.setObjectName("muted"); bx.addWidget(x1); bx.addWidget(x2)
                pl.addLayout(bx)
                if k < 2:
                    ar = QLabel("⟶"); ar.setStyleSheet("font-size:24px; color:#0EA5E9;"); pl.addWidget(ar, 1, Qt.AlignCenter)
            v.addWidget(pipe)
            mid = QHBoxLayout(); mid.setSpacing(K.SP["md"])
            left = QFrame(); left.setObjectName("card"); ll = QVBoxLayout(left); ll.setContentsMargins(16, 14, 16, 14)
            hd = QLabel(t("sec.costatus")); hd.setObjectName("h2"); ll.addWidget(hd)
            self.ov_tbl = QTableWidget(0, 4)
            self._style_table(self.ov_tbl, [t("col.name"), t("col.last"), t("col.vouchers"), t("col.status")])
            self.ov_tbl.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents); ll.addWidget(self.ov_tbl)
            right = QFrame(); right.setObjectName("card"); right.setFixedWidth(310); rl = QVBoxLayout(right); rl.setContentsMargins(16, 14, 16, 14); rl.setSpacing(8)
            hd2 = QLabel(t("sec.ctrl")); hd2.setObjectName("h2"); rl.addWidget(hd2)
            l1 = QLabel(t("sec.curop")); l1.setObjectName("muted"); rl.addWidget(l1)
            self.ov_op = QLabel(t("s.idle")); self.ov_op.setObjectName("cardvalue"); rl.addWidget(self.ov_op)
            self.ov_bar = QProgressBar(); self.ov_bar.setRange(0, 100); rl.addWidget(self.ov_bar)
            self.ov_bar_note = QLabel(t("al.demo")); self.ov_bar_note.setObjectName("muted"); self.ov_bar_note.setWordWrap(True); rl.addWidget(self.ov_bar_note)
            rl.addSpacing(6)
            self.b_testconn = button(t("b.test_conn"), "primary", self.test_connections); rl.addWidget(self.b_testconn)
            rl.addWidget(button(t("b.full"), "", lambda: self.go(3)))
            rl.addWidget(button(t("b.logs"), "", lambda: self.go(6)))
            rl.addStretch()
            mid.addWidget(left, 1); mid.addWidget(right); v.addLayout(mid, 1)
        return self._wrap(page_header(t("ov.title"), t("ov.sub")) if False else QHBoxLayout(), body)

    # ---- Company manager
    def _p_companies(self):
        def body(v):
            self.al_cfg = self.alert("warn", "")
            self.al_dirty = self.alert("info", "")
            v.addWidget(self.al_cfg); v.addWidget(self.al_dirty)
            bar = QHBoxLayout(); bar.setSpacing(K.SP["sm"])
            self.search = QLineEdit(); self.search.setPlaceholderText(t("f.search_co")); self.search.textChanged.connect(self.filter_companies)
            bar.addWidget(self.search, 1)
            bar.addWidget(button(t("b.select_all"), "", lambda: self.select_all(True)))
            bar.addWidget(button(t("b.select_none"), "", lambda: self.select_all(False)))
            bar.addWidget(button("⟲  " + t("b.detect"), "primary", self.detect_companies))
            v.addLayout(bar)
            self.tbl = QTableWidget(0, 5)
            self._style_table(self.tbl, ["", t("col.company"), t("col.start"), t("col.last"), t("col.status")], stretch_first=False)
            self.tbl.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
            self.tbl.setColumnWidth(0, 36); self.tbl.horizontalHeader().setSectionResizeMode(0, QHeaderView.Fixed)
            self.tbl.setEditTriggers(QAbstractItemView.DoubleClicked | QAbstractItemView.EditKeyPressed)
            self.tbl.itemChanged.connect(lambda *_: (self.update_cards(), self.set_dirty(True)))
            v.addWidget(self.tbl, 1)
            add = QHBoxLayout(); add.setSpacing(K.SP["md"])
            self.add_name = QLineEdit(); self.add_name.setPlaceholderText(t("f.add_co")); add.addWidget(self.add_name, 1)
            add.addWidget(button(t("b.add"), "", self.add_manual))
            add.addWidget(button(t("b.remove"), "danger", self.remove_row))
            add.addWidget(button(t("b.test_read"), "", self.test_read))
            self.b_save = button(t("b.save"), "primary", self.save_settings, "Ctrl+S"); add.addWidget(self.b_save)
            v.addLayout(add)
            v.addWidget(self.alert("info", t("al.co_note")))
        return self._wrap(page_header(t("co.title"), t("co.sub")), body)

    def set_dirty(self, on):
        self.dirty = on
        self.al_dirty.set("info", t("al.unsaved") if on else "")

    def add_company_row(self, name, ticked=True, start="2023-01-01"):
        for r in range(self.tbl.rowCount()):
            if self.tbl.item(r, 1).text() == name:
                return
        self.tbl.blockSignals(True)
        r = self.tbl.rowCount(); self.tbl.insertRow(r)
        chk = QTableWidgetItem(); chk.setFlags(Qt.ItemIsUserCheckable | Qt.ItemIsEnabled); chk.setCheckState(Qt.Checked if ticked else Qt.Unchecked)
        nm = QTableWidgetItem(name); nm.setFlags(Qt.ItemIsEnabled | Qt.ItemIsSelectable)
        for c, it in enumerate((chk, nm, QTableWidgetItem(start), QTableWidgetItem("-"), QTableWidgetItem(t("s.notver")))):
            if c >= 3:
                it.setFlags(Qt.ItemIsEnabled | Qt.ItemIsSelectable)
            self.tbl.setItem(r, c, it)
        self.tbl.blockSignals(False); self.update_cards()

    def ticked(self):
        return [self.tbl.item(r, 1).text() for r in range(self.tbl.rowCount()) if self.tbl.item(r, 0).checkState() == Qt.Checked]

    def starts(self):
        return {self.tbl.item(r, 1).text(): self.tbl.item(r, 2).text().strip() for r in range(self.tbl.rowCount())}

    def select_all(self, on):
        self.tbl.blockSignals(True)
        for r in range(self.tbl.rowCount()):
            if not self.tbl.isRowHidden(r):
                self.tbl.item(r, 0).setCheckState(Qt.Checked if on else Qt.Unchecked)
        self.tbl.blockSignals(False); self.update_cards(); self.set_dirty(True)

    def filter_companies(self, text):
        for r in range(self.tbl.rowCount()):
            self.tbl.setRowHidden(r, text.lower() not in self.tbl.item(r, 1).text().lower())

    def add_manual(self):
        n = self.add_name.text().strip()
        if n:
            self.add_company_row(n, True, self.cfg.get("start_date", "2023-01-01")); self.add_name.clear(); self.set_dirty(True)

    def remove_row(self):
        r = self.tbl.currentRow()
        if r >= 0:
            self.tbl.removeRow(r); self.update_cards(); self.set_dirty(True)

    def update_cards(self):
        if hasattr(self, "tbl") and hasattr(self, "c_co"):
            self.c_co.value.setText(str(len(self.ticked())))

    def _valid_dates(self):
        for c, d in self.starts().items():
            try:
                dt.date.fromisoformat(d)
            except ValueError:
                self.toast(t("t.bad_date", d), "error"); return False
        return True

    def save_settings(self):
        cos = self.ticked()
        if not cos:
            self.toast(t("t.no_co"), "warn"); return False
        if not self._valid_dates():
            return False
        if not (self.f_sburl.text().strip() and self.f_sbkey.text().strip()):
            self.toast(t("al.no_login"), "warn"); self.go(2); return False
        try:
            if os.path.exists(ns.CONFIG):
                shutil.copy2(ns.CONFIG, ns.CONFIG + ".bak")
            self.cfg = ns.write_config(cos, self.starts(), self.f_tally.text().strip(), self.f_sburl.text().strip(), self.f_sbkey.text().strip())
        except OSError as e:
            self.toast(t("t.err", e), "error"); return False
        self.set_dirty(False); self.log(f"Saved config.json with {len(cos)} companies (backup: config.json.bak).", "SUCCESS")
        self.toast(t("t.saved", len(cos)), "success")
        return True

    # ---- Connections
    def _p_connections(self):
        def body(v):
            f = QFrame(); f.setObjectName("card"); g = QGridLayout(f); g.setContentsMargins(20, 18, 20, 18); g.setHorizontalSpacing(14); g.setVerticalSpacing(12)
            self.f_tally, self.f_sburl, self.f_sbkey, self.f_email, self.f_pw = QLineEdit(), QLineEdit(), QLineEdit(), QLineEdit(), QLineEdit()
            self.f_pw.setEchoMode(QLineEdit.Password)
            for i, (key, w) in enumerate([("f.tally", self.f_tally), ("f.sburl", self.f_sburl), ("f.sbkey", self.f_sbkey), ("f.email", self.f_email), ("f.pw", self.f_pw)]):
                g.addWidget(QLabel(t(key)), i, 0); g.addWidget(w, i, 1)
            for w in (self.f_tally, self.f_sburl, self.f_sbkey, self.f_email, self.f_pw):
                w.textEdited.connect(lambda *_: self.set_dirty(True))
            btn = QHBoxLayout(); btn.setSpacing(K.SP["md"])
            btn.addWidget(button(t("b.check_tally"), "", self.check_tally))
            btn.addWidget(button(t("b.login_save"), "primary", self.save_login)); btn.addStretch()
            g.addLayout(btn, 5, 1); g.setColumnStretch(1, 1)
            v.addWidget(f)
            self.al_conn = self.alert("info", "", True); v.addWidget(self.al_conn)
            v.addWidget(self.alert("info", t("al.pw_note"))); v.addStretch()
        return self._wrap(page_header(t("cn.title"), t("cn.sub")), body)

    # ---- Sync center
    def _p_sync(self):
        def body(v):
            self.al_sync = self.alert("warn", "", True); v.addWidget(self.al_sync)
            row = QHBoxLayout(); row.setSpacing(K.SP["md"])
            self.b_test = button(t("b.test_read_sc"), "", self.test_read)
            self.b_inc = button(t("b.incr"), "primary", lambda: self.start_job(["--until", self._until_for_now()], t("b.incr")), "Ctrl+R")
            self.b_full = button(t("b.full"), "", self.confirm_full)
            self.b_stop = button(t("b.stop"), "danger", self.stop_job); self.b_stop.setEnabled(False)
            for b in (self.b_test, self.b_inc, self.b_full, self.b_stop):
                row.addWidget(b)
            row.addStretch(); v.addLayout(row)
            st = QHBoxLayout()
            self.s_state = QLabel(t("s.idle")); self.s_state.setObjectName("cardvalue")
            self.s_counts = QLabel("0 vouchers read this session · 0 failed"); self.s_counts.setObjectName("muted")
            st.addWidget(self.s_state); st.addStretch(); st.addWidget(self.s_counts); v.addLayout(st)
            self.s_bar = QProgressBar(); self.s_bar.setRange(0, 100); v.addWidget(self.s_bar)
            self.co_tbl = QTableWidget(0, 3); self._style_table(self.co_tbl, [t("col.name"), t("col.stage"), t("col.detail")]); self.co_tbl.setMaximumHeight(240)
            v.addWidget(self.co_tbl)
            self.sync_log = QPlainTextEdit(); self.sync_log.setObjectName("log"); self.sync_log.setReadOnly(True); v.addWidget(self.sync_log, 1)
            v.addWidget(self.alert("info", t("al.sync_note")))
        return self._wrap(page_header(t("sy.title"), t("sy.sub")), body)

    def _until_for_now(self):
        return (dt.datetime.now() + dt.timedelta(hours=3)).strftime("%H:%M")

    # ---- Scheduler
    def _p_scheduler(self):
        def body(v):
            f = QFrame(); f.setObjectName("card"); g = QGridLayout(f); g.setContentsMargins(20, 16, 20, 16); g.setHorizontalSpacing(14)
            self.t_start, self.t_end = QLineEdit("00:30"), QLineEdit("06:00")
            self.t_start.setMaximumWidth(90); self.t_end.setMaximumWidth(90)
            g.addWidget(QLabel(t("f.start")), 0, 0); g.addWidget(self.t_start, 0, 1); g.addWidget(QLabel(t("f.stop")), 0, 2); g.addWidget(self.t_end, 0, 3); g.setColumnStretch(4, 1)
            v.addWidget(f)
            self.al_sched = self.alert("info", "", True); v.addWidget(self.al_sched)
            row = QHBoxLayout(); row.setSpacing(K.SP["md"])
            self.b_install = button(t("b.install"), "primary", self.install)
            row.addWidget(self.b_install); row.addWidget(button(t("b.status"), "", self.sched_status))
            row.addWidget(button(t("b.run_now"), "", self.run_sched_now)); row.addWidget(button(t("b.remove_sched"), "danger", self.remove_sched))
            row.addStretch(); v.addLayout(row)
            self.sched_out = QPlainTextEdit(); self.sched_out.setObjectName("log"); self.sched_out.setReadOnly(True); self.sched_out.setMaximumHeight(220)
            v.addWidget(self.sched_out)
            v.addWidget(self.alert("warn", t("al.sched_note"))); v.addStretch()
        return self._wrap(page_header(t("sc.title"), t("sc.sub")), body)

    # ---- Analytics
    def _p_analytics(self):
        def body(v):
            top = QHBoxLayout(); top.setSpacing(K.SP["md"])
            self.a_runs = card("Runs recorded" if K.LANG == "en" else "রেকর্ড করা run", "-", "last 300" if K.LANG == "en" else "শেষ ৩০০টি")
            self.a_ok = card("Successful" if K.LANG == "en" else "সফল", "-", "")
            self.a_fail = card("Failed" if K.LANG == "en" else "ব্যর্থ", "-", "")
            self.a_v = card("Vouchers in those runs" if K.LANG == "en" else "ওই run-গুলোর voucher", "-", "")
            for c in (self.a_runs, self.a_ok, self.a_fail, self.a_v):
                top.addWidget(c)
            v.addLayout(top)
            self.an_tbl = QTableWidget(0, 6)
            self._style_table(self.an_tbl, [t("col.name"), "Started" if K.LANG == "en" else "শুরু", "Kind" if K.LANG == "en" else "ধরন", "Vouchers", t("col.status"), "Error" if K.LANG == "en" else "ত্রুটি"], stretch_first=False)
            self.an_tbl.horizontalHeader().setSectionResizeMode(5, QHeaderView.Stretch)
            v.addWidget(self.an_tbl, 1)
            v.addWidget(button(t("b.refresh"), "", self.refresh_runs), 0, Qt.AlignLeft)
        return self._wrap(page_header(t("an.title"), t("an.sub")), body)

    # ---- Logs
    def _p_logs(self):
        def body(v):
            bar = QHBoxLayout(); bar.setSpacing(K.SP["sm"])
            self.l_search = QLineEdit(); self.l_search.setPlaceholderText(t("f.search_log")); self.l_search.textChanged.connect(self.render_log)
            self.l_level = QComboBox(); self.l_level.addItems(["All levels", "ERROR", "WARNING", "SUCCESS", "SYNC", "INFO"]); self.l_level.currentTextChanged.connect(self.render_log)
            bar.addWidget(self.l_search, 1); bar.addWidget(self.l_level)
            bar.addWidget(button(t("b.load_log"), "", self.load_log_file)); bar.addWidget(button(t("b.copy"), "", self.copy_log)); bar.addWidget(button(t("b.csv"), "", self.export_log))
            v.addLayout(bar)
            self.log_view = QPlainTextEdit(); self.log_view.setObjectName("log"); self.log_view.setReadOnly(True); v.addWidget(self.log_view, 1)
        return self._wrap(page_header(t("lg.title"), t("lg.sub")), body)

    # ---- Settings
    def _p_settings(self):
        def body(v):
            f = QFrame(); f.setObjectName("card"); g = QGridLayout(f); g.setContentsMargins(20, 18, 20, 18); g.setVerticalSpacing(14); g.setHorizontalSpacing(14)
            self.s_theme = QComboBox(); self.s_theme.addItems(["Dark", "Light", "System"])
            self.s_lang = QComboBox(); self.s_lang.addItems(["English", "বাংলা"])
            self.s_tray = QCheckBox(t("set.tray")); self.s_tray.setChecked(self.ui.get("tray", True))
            self.s_notif = QCheckBox(t("set.toasts")); self.s_notif.setChecked(self.ui.get("notify", True))
            self.s_startup = QCheckBox(t("set.startup")); self.s_startup.setChecked(self._startup_enabled())
            g.addWidget(QLabel(t("set.theme")), 0, 0); g.addWidget(self.s_theme, 0, 1)
            g.addWidget(QLabel(t("set.lang")), 1, 0); g.addWidget(self.s_lang, 1, 1)
            g.addWidget(self.s_tray, 2, 0, 1, 2); g.addWidget(self.s_notif, 3, 0, 1, 2); g.addWidget(self.s_startup, 4, 0, 1, 2); g.setColumnStretch(2, 1)
            v.addWidget(f)
            row = QHBoxLayout(); row.setSpacing(K.SP["md"])
            row.addWidget(button(t("b.backup"), "", self.backup_cfg)); row.addWidget(button(t("b.restore"), "", self.restore_cfg))
            row.addWidget(button(t("b.tour"), "", self.start_tour)); row.addStretch(); v.addLayout(row)
            about = QLabel(f"NABIAD DATA BRIDGE v{APP_VERSION}\n{HERE}"); about.setObjectName("caption"); about.setTextInteractionFlags(Qt.TextSelectableByMouse); v.addWidget(about)
            v.addStretch()
            self.s_theme.setCurrentText({"dark": "Dark", "light": "Light", "system": "System"}.get(self.ui.get("theme", "dark"), "Dark"))
            self.s_lang.setCurrentIndex(1 if K.LANG == "bn" else 0)
            self.s_theme.currentTextChanged.connect(self.set_theme_choice); self.s_lang.currentIndexChanged.connect(self.set_lang_choice)
            self.s_tray.toggled.connect(lambda b: (self.ui.update(tray=b), self._save_ui())); self.s_notif.toggled.connect(lambda b: (self.ui.update(notify=b), self._save_ui()))
            self.s_startup.toggled.connect(self.set_startup)
        return self._wrap(page_header(t("st.title"), t("st.sub")), body)

    # ---- Help
    def _p_help(self):
        def body(v):
            sc = QScrollArea(); sc.setWidgetResizable(True); sc.setFrameShape(QFrame.NoFrame); sc.viewport().setAutoFillBackground(False)
            inner = QWidget(); inner.setObjectName("page"); il = QVBoxLayout(inner); il.setContentsMargins(0, 0, 8, 0); il.setSpacing(K.SP["sm"])
            self.accs = []
            for k, (te, tb_, be, bb) in enumerate(K.HELP):
                a = K.Accordion(tb_ if K.LANG == "bn" else te, bb if K.LANG == "bn" else be, self.p, open_=(k == 0))
                self.accs.append(a); il.addWidget(a)
            il.addStretch(); sc.setWidget(inner); v.addWidget(sc, 1)
            v.addWidget(button(t("b.tour"), "", self.start_tour), 0, Qt.AlignLeft)
        return self._wrap(page_header(t("hp.title"), t("hp.sub")), body)

    # ---------------------------------------------------------------- theme / language / tray / shortcuts
    def set_theme_choice(self, text):
        self.ui["theme"] = text.lower(); self._save_ui(); self.apply_theme(text.lower())

    def set_lang_choice(self, idx):
        code = "bn" if idx == 1 else "en"
        if code == K.LANG:
            return
        if self.job and self.job.isRunning():
            self.toast(t("al.busy"), "warn"); self.s_lang.blockSignals(True); self.s_lang.setCurrentIndex(0 if K.LANG == "en" else 1); self.s_lang.blockSignals(False); return
        self.ui["lang"] = code; self._save_ui(); K.set_lang(code)
        cur = self.stack.currentIndex()
        self._build(); self.apply_theme(self.ui.get("theme", "dark")); self._load_config(); self.go(cur); self.render_log(); self.refresh_all()

    def apply_theme(self, mode):
        if mode == "system":
            mode = "dark" if QApplication.styleHints().colorScheme() != Qt.ColorScheme.Light else "light"
        self.p = K.DARK if mode == "dark" else K.LIGHT
        QApplication.instance().setStyleSheet(K.qss(self.p))
        self.toasts.p = self.p
        for a in getattr(self, "alerts", []):
            try:
                a.retheme(self.p)
            except RuntimeError:
                pass
        if self.tour:
            self.tour.retheme(self.p)
        self.update_cards(); self.refresh_light()

    def _tray(self):
        self.tray = None
        if QSystemTrayIcon.isSystemTrayAvailable():
            self.tray = QSystemTrayIcon(QIcon(logo_pixmap(64)), self)
            m = QMenu(); a = QAction("NABIAD DATA BRIDGE", self); a.triggered.connect(self.show_normal); m.addAction(a)
            q = QAction("Quit", self); q.triggered.connect(self.quit_app); m.addAction(q)
            self.tray.setContextMenu(m); self.tray.activated.connect(lambda r: self.show_normal() if r == QSystemTrayIcon.Trigger else None)
            self.tray.show()

    def _shortcuts(self):
        for i in range(9):
            QShortcut(QKeySequence(f"Ctrl+{i + 1}"), self, activated=lambda i=i: self.go(i))
        QShortcut(QKeySequence("F1"), self, activated=lambda: self.go(8))
        QShortcut(QKeySequence("Ctrl+S"), self, activated=lambda: self.stack.currentIndex() == 1 and self.save_settings())
        QShortcut(QKeySequence("Ctrl+R"), self, activated=lambda: self.start_job(["--until", self._until_for_now()], t("b.incr")))

    def show_normal(self):
        self.showNormal(); self.activateWindow()

    def quit_app(self):
        self._really_quit = True; self.close()

    def resizeEvent(self, e):
        super().resizeEvent(e)
        self.toasts.layout()
        if self.tour and self.tour.isVisible():
            self.tour.setGeometry(self.centralWidget().rect())

    def closeEvent(self, e):
        g = self.geometry(); self.ui["geometry"] = [g.x(), g.y(), g.width(), g.height()]; self._save_ui()
        if self._really_quit or not (self.tray and self.ui.get("tray", True)):
            if self.job and self.job.isRunning():
                if QMessageBox.question(self, "NABIAD DATA BRIDGE", "A sync is running. Stop it after the current batch and close?") != QMessageBox.Yes:
                    e.ignore(); self._really_quit = False; return
                self.job.request_stop(); self.job.wait(60000)
            e.accept(); QApplication.quit()
        else:
            e.ignore(); self.hide()
            self.tray.showMessage("NABIAD DATA BRIDGE", "Still running in the tray.", QSystemTrayIcon.Information, 3000)

    def toast(self, text, kind="info"):
        self.toasts.show(text, kind)

    def notify(self, text):
        if self.tray and self.ui.get("notify", True) and not self.isActiveWindow():
            self.tray.showMessage("NABIAD DATA BRIDGE", text, QSystemTrayIcon.Information, 6000)

    def _startup_enabled(self):
        if os.name != "nt":
            return False
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run") as k:
                winreg.QueryValueEx(k, "NabiadDataBridge"); return True
        except OSError:
            return False

    def set_startup(self, on):
        if os.name != "nt":
            return
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE) as k:
            if on:
                cmd = f'"{sys.executable}"' if getattr(sys, "frozen", False) else f'"{sys.executable}" "{os.path.join(HERE, "nabiad_bridge_app.pyw")}"'
                winreg.SetValueEx(k, "NabiadDataBridge", 0, winreg.REG_SZ, cmd)
            else:
                try:
                    winreg.DeleteValue(k, "NabiadDataBridge")
                except OSError:
                    pass

    # ---------------------------------------------------------------- product tour
    def _tour_steps(self):
        return [
            dict(key="tour.1", before=lambda: self.go(0), target=None),
            dict(key="tour.2", before=lambda: self.go(0), target=lambda: self.side),
            dict(key="tour.3", before=lambda: self.go(0), target=lambda: self.c_tally.parentWidget() and self.c_tally),
            dict(key="tour.4", before=lambda: self.go(2), target=lambda: self.f_email.parentWidget()),
            dict(key="tour.5", before=lambda: self.go(1), target=lambda: self.tbl),
            dict(key="tour.6", before=lambda: self.go(3), target=lambda: self.b_inc),
            dict(key="tour.7", before=lambda: self.go(4), target=lambda: self.b_install),
            dict(key="tour.8", before=lambda: self.go(0), target=None),
        ]

    def start_tour(self):
        if self.tour:
            self.tour.deleteLater()
        self.tour = K.Tour(self.centralWidget(), self._tour_steps(), self.p)
        self.tour.finished.connect(self._tour_end)
        self.tour.start()

    def _tour_end(self, done):
        self.ui["tour_done"] = True; self._save_ui(); self.go(0)

    def maybe_tour(self):
        if not self.ui.get("tour_done"):
            self.start_tour()

    # ---------------------------------------------------------------- logging
    def log(self, text, level=None):
        level = level or level_of(text)
        self.log_rows.append((time.strftime("%Y-%m-%d %H:%M:%S"), level, text))
        if len(self.log_rows) > 5000:
            del self.log_rows[:1000]
        self.render_log()
        if hasattr(self, "sync_log"):
            self.sync_log.appendPlainText(f"{now_s()} [{level}] {text}")

    def render_log(self, *_):
        if not hasattr(self, "log_view"):
            return
        q, lv = self.l_search.text().lower(), self.l_level.currentText()
        out = [f"{a}  [{b:<7}] {c}" for a, b, c in self.log_rows if (lv == "All levels" or b == lv) and q in c.lower()]
        self.log_view.setPlainText("\n".join(out[-1500:]))
        self.log_view.verticalScrollBar().setValue(self.log_view.verticalScrollBar().maximum())

    def load_log_file(self):
        if not os.path.exists(ns.LOG):
            self.toast("nightly_log.txt does not exist yet.", "warn"); return
        with open(ns.LOG, encoding="utf-8", errors="replace") as f:
            lines = f.read().splitlines()[-1500:]
        self.log_rows = [(x[:19], level_of(x), x[20:]) for x in lines if len(x) > 20]
        self.render_log()

    def copy_log(self):
        QApplication.clipboard().setText(self.log_view.toPlainText()); self.toast(t("t.copied"), "success")

    def export_log(self):
        path, _ = QFileDialog.getSaveFileName(self, "Export log", "nabiad_bridge_log.csv", "CSV (*.csv)")
        if path:
            with open(path, "w", newline="", encoding="utf-8-sig") as f:
                w = csv.writer(f); w.writerow(["time", "level", "message"]); w.writerows(self.log_rows)
            self.toast(t("t.exported", path), "success")

    # ---------------------------------------------------------------- background helpers
    def run_bg(self, fn, cb, *a):
        tk = Task(fn, *a); self.tasks.add(tk)
        def fin(res, err):
            self.tasks.discard(tk)
            try:
                cb(res, err)
            except Exception:  # noqa
                log_error("Callback failed:\n" + traceback.format_exc())
        tk.done.connect(fin); tk.start()

    def cfg_now(self):
        return {"tally_url": self.f_tally.text().strip(), "supabase_url": self.f_sburl.text().strip().rstrip("/"),
                "supabase_anon_key": self.f_sbkey.text().strip(), "intercompany_ledgers": {}, "pause_seconds": 0.4,
                "use_selected_company": [], "companies": self.ticked()}

    def set_state(self, c, text, kind):
        c.value.setText(text); c.value.setStyleSheet(f"color:{self.p[K.KIND_COLOR[kind]]};")

    # ---------------------------------------------------------------- connection actions
    def check_tally(self):
        url = self.f_tally.text().strip()
        self.set_state(self.c_tally, t("s.checking"), "warn")
        def cb(ok, err):
            self.tally_ok = bool(ok) and not err
            if self.tally_ok:
                self.set_state(self.c_tally, t("s.portopen"), "success"); self.c_tally.note.setText(url)
                self.al_conn.set("success", t("t.tally_ok", url)); self.toast(t("t.tally_ok", url), "success")
            else:
                self.set_state(self.c_tally, t("s.noanswer"), "error"); self.c_tally.note.setText(url)
                self.al_conn.set("error", t("t.tally_bad")); self.toast(t("t.tally_bad"), "error")
            self.log(self.al_conn.tx.text(), "SUCCESS" if self.tally_ok else "ERROR")
        self.run_bg(ns.port_open, cb, url)

    def save_login(self):
        cfg = self.cfg_now()
        if not (cfg["supabase_url"] and cfg["supabase_anon_key"] and self.f_email.text().strip()):
            self.al_conn.set("warn", t("al.no_login")); return
        pw = self.f_pw.text()
        if not pw and not ns.have_secret():
            self.al_conn.set("warn", t("f.pw")); return
        email = self.f_email.text().strip()
        self.set_state(self.c_db, t("s.checking"), "warn")
        def work():
            use = pw
            if not use:
                _e, use = ns.load_secret()
            ok = ns.test_login(cfg, email, use)
            if ok and pw:
                ns.save_secret(email, pw)
            return ok
        def cb(ok, err):
            if ok:
                self.db_ok = True; self.set_state(self.c_db, t("s.signedin"), "success"); self.c_db.note.setText(now_s())
                self.f_pw.clear(); self.f_pw.setPlaceholderText(t("f.pw_saved"))
                self.al_conn.set("success", t("t.login_ok")); self.toast(t("t.login_ok"), "success"); self.log("Database login verified.", "SUCCESS"); self.refresh_runs()
            else:
                self.db_ok = False; self.set_state(self.c_db, t("s.loginfail"), "error")
                self.al_conn.set("error", t("t.login_fail", err or "?")); self.toast(t("t.login_fail", err or "?"), "error"); self.log(f"Login failed: {err}", "ERROR")
        self.run_bg(work, cb)

    def test_connections(self):
        self.check_tally()
        if ns.have_secret():
            self.refresh_runs(verify=True)
        else:
            self.set_state(self.c_db, t("s.login"), "warn"); self.toast(t("al.no_login"), "warn")

    def detect_companies(self):
        url = self.f_tally.text().strip()
        def cb(names, err):
            if err or not names:
                self.toast(t("t.tally_bad"), "warn"); self.log(f"Could not list companies: {err or 'none listed'}", "WARNING"); return
            for n in names:
                self.add_company_row(n, True, self.cfg.get("start_date", "2023-01-01"))
            self.set_dirty(True); self.toast(t("t.detected", len(names)), "success"); self.log("Tally has: " + ", ".join(names), "SUCCESS")
        self.run_bg(ns.list_companies, cb, url)

    def test_read(self):
        cos = self.ticked()
        if not cos:
            self.toast(t("t.no_co"), "warn"); return
        cfg = self.cfg_now(); self.go(3)
        self.s_state.setText(t("b.test_read_sc")); self.s_bar.setRange(0, 0)
        def work():
            res = []
            for c in cos:
                try:
                    res.append((c,) + ns.test_company(cfg, c))
                except Exception as e:  # noqa
                    res.append((c, False, f"{type(e).__name__}: {e}"))
            return res
        def cb(res, err):
            self.s_bar.setRange(0, 100); self.s_bar.setValue(0); self.s_state.setText(t("s.idle"))
            if err:
                self.toast(t("t.err", err), "error"); self.log(err, "ERROR"); return
            bad = 0
            for c, ok, msg in res:
                self.log(f"{c}: {msg}", "SUCCESS" if ok else "ERROR"); bad += 0 if ok else 1
                self.set_company_status(c, "Read test OK" if ok else "Read test FAILED")
            self.toast(t("t.read_ok", f"{len(res) - bad}/{len(res)}", "") if not bad else t("t.read_bad", f"{bad}", "failed - see log"), "success" if not bad else "error")
        self.run_bg(work, cb)

    # ---------------------------------------------------------------- sync jobs
    def confirm_full(self):
        box = QMessageBox(self); box.setWindowTitle(t("b.full")); box.setIcon(QMessageBox.Question)
        box.setText("This copies the whole history of every ticked company from its start date.\nIt can take hours, can be stopped and continued, and each voucher is stored once.\n\nStart now?" if K.LANG == "en"
                    else "এটি প্রতিটি টিক দেওয়া কোম্পানির শুরুর তারিখ থেকে পুরো ইতিহাস কপি করবে।\nকয়েক ঘণ্টা লাগতে পারে; থামিয়ে আবার চালানো যায়, আর প্রতিটি voucher একবারই থাকে।\n\nএখন শুরু করবেন?")
        box.setStandardButtons(QMessageBox.Yes | QMessageBox.No)
        if box.exec() == QMessageBox.Yes and self.save_settings():
            self.start_job(["--backfill"], t("b.full"))

    def start_job(self, args, label):
        if self.job and self.job.isRunning():
            self.toast(t("al.busy"), "warn"); return
        if not ns.have_secret():
            self.go(2); self.al_conn.set("warn", t("al.no_login")); self.toast(t("al.no_login"), "warn"); return
        if not ns.lock_is_free():
            self.go(3); self.al_sync.set("warn", t("al.busy")); self.toast(t("al.busy"), "warn"); return
        if not self.save_settings():
            return
        self.go(3); self.al_sync.set("warn", "")
        self.vouchers_seen, self.failed = 0, 0
        self.co_tbl.setRowCount(0); self.co_rows = {}
        for c in self.ticked():
            self.set_co_row(c, "Queued", "")
        self.job = Job(args)
        self.job.line.connect(self.on_job_line); self.job.finished_rc.connect(self.on_job_end)
        self.s_state.setText(label); self.ov_op.setText(label); self.s_bar.setRange(0, 0); self.ov_bar.setRange(0, 0)
        self.pill_op.set(label, "info", self.p); self.ov_bar_note.setText("Working… (total amount unknown)")
        self.b_stop.setEnabled(True)
        for b in (self.b_inc, self.b_full, self.b_test):
            b.setEnabled(False)
        self.log(f"{label} started.", "SYNC"); self.toast(t("t.job_started", label), "info")
        self.job.start()

    def set_co_row(self, c, stage, detail):
        if c not in self.co_rows:
            r = self.co_tbl.rowCount(); self.co_tbl.insertRow(r); self.co_rows[c] = r
            self.co_tbl.setItem(r, 0, QTableWidgetItem(c)); self.co_tbl.setItem(r, 1, QTableWidgetItem()); self.co_tbl.setItem(r, 2, QTableWidgetItem())
        r = self.co_rows[c]; self.co_tbl.item(r, 1).setText(stage)
        if detail:
            self.co_tbl.item(r, 2).setText(detail)
        self.set_company_status(c, stage)

    def on_job_line(self, text):
        self.log(text)
        body = re.sub(r"^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\s+", "", text)
        m = re.match(r"(.+?): start$", body)
        if m and m.group(1) in self.co_rows:
            self.set_co_row(m.group(1), "Syncing", "")
        m = re.match(r"(?:\d\d:\d\d:\d\d )?(.+?): (\d+) days read, (\d+) vouchers, (\d+) ledgers", body)
        if m and m.group(1) in self.co_rows:
            self.vouchers_seen += int(m.group(3))
            self.set_co_row(m.group(1), "Finished", f"{m.group(2)} days read · {m.group(3)} vouchers · {m.group(4)} ledgers")
            self.s_counts.setText(f"{self.vouchers_seen:,} vouchers read this session · {self.failed} failed")
        m = re.match(r"(.+?): (NOT LOADED|failed|data check failed)(.*)", body)
        if m and m.group(1) in self.co_rows:
            if m.group(2) != "NOT LOADED":
                self.failed += 1
            self.set_co_row(m.group(1), "Not loaded in Tally" if m.group(2) == "NOT LOADED" else "Failed", body)
            self.s_counts.setText(f"{self.vouchers_seen:,} vouchers read this session · {self.failed} failed")

    def on_job_end(self, rc):
        for b in (self.b_inc, self.b_full, self.b_test):
            b.setEnabled(True)
        self.b_stop.setEnabled(False)
        self.s_bar.setRange(0, 100); self.ov_bar.setRange(0, 100)
        done = rc == 0
        self.s_bar.setValue(100 if done else 0); self.ov_bar.setValue(100 if done else 0)
        txt = {0: "Finished", 1: "Finished with problems", 4: "Not started (another sync running)", 5: "Login missing"}.get(rc, f"Ended (code {rc})")
        self.s_state.setText(txt); self.ov_op.setText(t("s.idle")); self.ov_bar_note.setText(txt)
        self.pill_op.set(txt if not done else t("s.idle"), "success" if done else "warn", self.p)
        for c, r in self.co_rows.items():
            if self.co_tbl.item(r, 1).text() in ("Queued", "Syncing"):
                self.co_tbl.item(r, 1).setText("Stopped" if os.path.exists(ns.STOP_FLAG) else "Not reached")
        self.log(f"Job ended: {txt}.", "SUCCESS" if done else "WARNING")
        self.toast(t("t.job_done") if done else t("t.job_prob"), "success" if done else "warn"); self.notify(txt)
        try:
            os.remove(ns.STOP_FLAG)
        except OSError:
            pass
        self.refresh_runs()

    def stop_job(self):
        if self.job and self.job.isRunning():
            self.job.request_stop(); self.b_stop.setEnabled(False)
            self.s_state.setText("Stopping after the current batch…"); self.log("Stop requested. Progress is kept; run again to continue.", "WARNING"); self.toast(t("t.stop_req"), "warn")

    # ---------------------------------------------------------------- scheduler actions
    def install(self):
        s, e = self.t_start.text().strip(), self.t_end.text().strip()
        try:
            for x in (s, e):
                h_, m_ = x.split(":"); assert 0 <= int(h_) < 24 and 0 <= int(m_) < 60
        except Exception:
            self.al_sched.set("warn", "HH:MM, e.g. 00:30"); return
        if not ns.have_secret():
            self.go(2); self.al_conn.set("warn", t("al.no_login")); return
        if not self.save_settings():
            return
        def cb(res, err):
            ok, msg = res if res else (False, err)
            self.sched_out.setPlainText(("INSTALLED: " if ok else "FAILED: ") + msg)
            self.al_sched.set("success" if ok else "error", t("t.sched_ok") if ok else t("t.sched_bad", msg)); self.toast(t("t.sched_ok") if ok else t("t.sched_bad", msg), "success" if ok else "error")
            self.log("Schedule: " + msg, "SUCCESS" if ok else "ERROR"); self.sched_status()
        self.run_bg(ns.install_schedule, cb, s, e)

    def sched_status(self):
        def cb(res, err):
            if res:
                self.sched_out.appendPlainText("\nTask Scheduler says:\n" + res)
                nxt = [l.split(":", 1)[1].strip() for l in res.splitlines() if l.startswith("Next Run Time")]
                self.set_state(self.c_sch, t("s.inst"), "success"); self.c_sch.note.setText(("next: " + nxt[0]) if nxt else "")
            else:
                self.sched_out.appendPlainText("\nNo schedule is installed.")
                self.set_state(self.c_sch, t("s.notinst"), "warn"); self.c_sch.note.setText("")
            if os.path.exists(ns.STATUS):
                self.sched_out.appendPlainText("\nLast run summary:\n" + open(ns.STATUS, encoding="utf-8").read())
        self.run_bg(ns.query_schedule, cb)

    def run_sched_now(self):
        def cb(res, err):
            ok, msg = res if res else (False, err)
            self.log("Scheduled job started." if ok else f"Could not start the scheduled job: {msg}", "SYNC" if ok else "ERROR")
            self.toast(t("t.job_started", "Scheduled job") if ok else t("t.err", msg), "info" if ok else "error")
        self.run_bg(ns.run_schedule_now, cb)

    def remove_sched(self):
        def cb(res, err):
            self.sched_out.setPlainText("Schedule removed." if res else "Nothing to remove."); self.toast(t("t.sched_rm"), "info"); self.sched_status()
        self.run_bg(ns.remove_schedule, cb)

    # ---------------------------------------------------------------- data refresh
    def refresh_all(self):
        self.check_tally_quiet(); self.sched_status()
        if ns.have_secret():
            self.refresh_runs(verify=True)

    def check_tally_quiet(self):
        url = self.f_tally.text().strip()
        def cb(ok, err):
            self.tally_ok = bool(ok) and not err
            self.set_state(self.c_tally, t("s.portopen") if self.tally_ok else t("s.noanswer"), "success" if self.tally_ok else "error")
            self.c_tally.note.setText(url)
        self.run_bg(ns.port_open, cb, url)

    def refresh_light(self):
        if not (self.job and self.job.isRunning()):
            self.check_tally_quiet()

    def refresh_runs(self, verify=False):
        if not ns.have_secret() or not self.cfg.get("supabase_url"):
            return
        def cb(rows, err):
            if err:
                self.db_ok = False; self.set_state(self.c_db, t("s.unreach"), "error"); self.c_db.note.setText(err[:70]); return
            self.runs = rows or []; self.db_ok = True
            self.set_state(self.c_db, t("s.signedin"), "success"); self.c_db.note.setText(now_s())
            self.render_runs()
        self.run_bg(ns.fetch_runs, cb, self.cfg)

    def set_company_status(self, c, text):
        self.company_state[c] = text
        for r in range(self.tbl.rowCount()):
            if self.tbl.item(r, 1).text() == c:
                self.tbl.item(r, 4).setText(text)

    def render_runs(self):
        if not hasattr(self, "ov_tbl"):
            return
        last, lastv = {}, {}
        for r in self.runs:
            if r.get("ok") and r["company"] not in last:
                last[r["company"]] = r.get("finished_at") or r.get("started_at"); lastv[r["company"]] = r.get("vouchers")
        def fmt(s):
            try:
                return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone().strftime("%d %b %Y %H:%M")
            except Exception:
                return "-"
        cos = self.ticked()
        self.ov_tbl.setRowCount(len(cos))
        for i, c in enumerate(cos):
            vals = [c, fmt(last[c]) if c in last else t("s.nonrec"), str(lastv.get(c) if lastv.get(c) is not None else "-"), t("s.synced") if c in last else t("s.notver")]
            for j, x in enumerate(vals):
                self.ov_tbl.setItem(i, j, QTableWidgetItem(x))
            self.ov_tbl.item(i, 3).setForeground(QColor(self.p["green"] if c in last else self.p["amber"]))
        for r in range(self.tbl.rowCount()):
            c = self.tbl.item(r, 1).text(); self.tbl.item(r, 3).setText(fmt(last[c]) if c in last else "-")
        okn = sum(1 for r in self.runs if r.get("ok")); bad = sum(1 for r in self.runs if r.get("ok") is False)
        self.a_runs.value.setText(str(len(self.runs))); self.a_ok.value.setText(str(okn)); self.a_fail.value.setText(str(bad))
        self.a_v.value.setText(f"{sum(r.get('vouchers') or 0 for r in self.runs):,}")
        self.an_tbl.setRowCount(len(self.runs))
        for i, r in enumerate(self.runs):
            vals = [r["company"], fmt(r["started_at"]), r.get("kind", ""), str(r.get("vouchers") if r.get("vouchers") is not None else "-"),
                    "OK" if r.get("ok") else ("FAILED" if r.get("ok") is False else "-"), (r.get("error") or "")[:200]]
            for j, x in enumerate(vals):
                self.an_tbl.setItem(i, j, QTableWidgetItem(x))
            if r.get("ok") is False:
                self.an_tbl.item(i, 4).setForeground(QColor(self.p["red"]))

    # ---------------------------------------------------------------- config backup
    def backup_cfg(self):
        path, _ = QFileDialog.getSaveFileName(self, "Back up configuration", "nabiad_bridge_config_backup.json", "JSON (*.json)")
        if path:
            shutil.copy2(ns.CONFIG, path); self.toast(t("t.backed"), "success")

    def restore_cfg(self):
        path, _ = QFileDialog.getOpenFileName(self, "Restore configuration", "", "JSON (*.json)")
        if not path:
            return
        try:
            d = json.load(open(path, encoding="utf-8")); assert "companies" in d and "tally_url" in d
        except Exception:
            self.toast("That file is not a Nabiad Bridge configuration.", "error"); return
        if os.path.exists(ns.CONFIG):
            shutil.copy2(ns.CONFIG, ns.CONFIG + ".bak")
        shutil.copy2(path, ns.CONFIG); self._load_config(); self.toast(t("t.restored"), "success")


def main():
    if "--engine" in sys.argv:  # packaged build: run the nightly engine instead of the window
        sys.argv.remove("--engine")
        sys.exit(ns.main())
    if "--bridge" in sys.argv:  # packaged build: run bridge.py (one company) instead of the window
        sys.argv.remove("--bridge")
        import bridge
        sys.exit(bridge.main(sys.argv[1:]))
    if os.name == "nt":
        try:
            import ctypes
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("Nabiad.DataBridge")
        except Exception:
            pass
    app = QApplication(sys.argv)
    app.setApplicationName("NABIAD DATA BRIDGE")
    app.setQuitOnLastWindowClosed(False)
    shot = "--shot" in sys.argv
    lock = None
    if not shot:  # one window only
        lock = QLockFile(os.path.join(QStandardPaths.writableLocation(QStandardPaths.TempLocation), "nabiad_data_bridge.lock"))
        lock.setStaleLockTime(0)
        if not lock.tryLock(100):
            QMessageBox.information(None, "NABIAD DATA BRIDGE", "NABIAD DATA BRIDGE is already open (check the system tray).")
            sys.exit(0)
    def hook(et, ev, tb):
        text = "".join(traceback.format_exception(et, ev, tb)); log_error("Unhandled:\n" + text)
        w = QApplication.activeWindow()
        if isinstance(w, Window):
            w.toast(t("t.err", f"{et.__name__}: {ev}"), "error")
    sys.excepthook = hook
    w = Window(); w.show()
    if shot:
        out = sys.argv[sys.argv.index("--shot") + 1]
        w.ui["tour_done"] = True
        def snap():
            for i in range(9):
                w.go(i); app.processEvents(); w.grab().save(f"{out}_{i}.png")
            w.toast("Settings saved (9 companies).", "success"); w.toast("Tally is not answering. Open TallyPrime and load the companies.", "error"); w.toast("Sync finished.", "info")
            w.go(8); app.processEvents(); w.accs[2].toggle(animate=False); [app.processEvents() for _ in range(5)]; time.sleep(0.3); app.processEvents(); w.grab().save(f"{out}_toast_help.png")
            w.start_tour(); app.processEvents()
            for k in range(8):
                app.processEvents(); QTimer.singleShot(0, lambda: None)
                w.tour.show_step() if k else None
                app.processEvents(); time.sleep(0.15); app.processEvents(); w.grab().save(f"{out}_tour_{k}.png")
                w.tour.next() if k < 7 else None
            app.quit()
        QTimer.singleShot(1500, snap)
    code = app.exec()
    if lock:
        lock.unlock()
    sys.exit(code)


if __name__ == "__main__":
    main()
