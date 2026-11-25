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
import overview_model as OM  # noqa: E402
import overview_ui as OV  # noqa: E402
import ui_kit as K  # noqa: E402
import updater as U  # noqa: E402
from ui_kit import t  # noqa: E402

APP_VERSION = "1.2.0"
FROZEN = bool(getattr(sys, "frozen", False))
UPDATE_EVERY_S = 12 * 3600  # automatic check at most twice a day
UI_SETTINGS = os.path.join(HERE, "ui_settings.json")
OV_CACHE = os.path.join(HERE, "overview_cache.json")
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
        self.app_version = APP_VERSION; self.numfmt = self.ui.get("numfmt", "in"); self.sched_info = None; self.ov_progress = None
        self.ov_refreshed = None; self.ov_cached = False; self.db_err = ""; self.tally_checking = False; self.db_checking = False
        self.login_saved = ns.have_secret(); self._ov_min = None; self._lock_probe = 0.0
        self._load_ov_cache()
        self.tally_ok = None; self.db_ok = None; self.cfg = {}; self.dirty = False; self._really_quit = False
        self.co_rows = {}; self.vouchers_seen = 0; self.failed = 0
        self.toasts = K.ToastHost(self)
        self.tour = None
        self.upd = None; self.upd_msg = None; self.upd_busy = False; self._up_prog = None; self.upd_latest = None
        self._restore_geometry()
        self._build()
        self.apply_theme(self.ui.get("theme", "dark"))
        self._load_config()
        self._tray()
        self._shortcuts()
        QTimer.singleShot(300, self.refresh_all)
        QTimer.singleShot(900, self.maybe_tour)
        QTimer.singleShot(6000, self.auto_check_updates)
        self.timer = QTimer(self); self.timer.timeout.connect(self.refresh_light); self.apply_refresh_interval()
        self.live = QTimer(self); self.live.timeout.connect(self.ov_tick); self.live.start(3000)

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
        if i == 0:
            self.render_overview()
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

    # ---- Overview (control center; see overview_ui.py / overview_model.py)
    def _p_overview(self):
        self.alerts = []
        return OV.build(self, card, button)

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
            self.render_overview()

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
            row.addWidget(self.b_install); row.addWidget(button(t("b.status"), "", lambda: self.sched_status(True)))
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
            self.s_num = QComboBox(); self.s_num.addItems([t("set.numfmt.in"), t("set.numfmt.intl")])
            self.s_num.setCurrentIndex(0 if self.numfmt == "in" else 1)
            self.s_ref = QComboBox(); self._ref_opts = [0, 30, 60, 300]
            self.s_ref.addItems([t("set.refresh.0"), t("set.refresh.30"), t("set.refresh.60"), t("set.refresh.300")])
            cur = int(self.ui.get("refresh_sec", 60)); self.s_ref.setCurrentIndex(self._ref_opts.index(cur) if cur in self._ref_opts else 2)
            g.addWidget(QLabel(t("set.numfmt")), 2, 0); g.addWidget(self.s_num, 2, 1)
            g.addWidget(QLabel(t("set.refresh")), 3, 0); g.addWidget(self.s_ref, 3, 1)
            g.addWidget(self.s_tray, 4, 0, 1, 2); g.addWidget(self.s_notif, 5, 0, 1, 2); g.addWidget(self.s_startup, 6, 0, 1, 2); g.setColumnStretch(2, 1)
            v.addWidget(f)
            v.addWidget(self._updates_card())
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
            self.s_num.currentIndexChanged.connect(self.set_numfmt); self.s_ref.currentIndexChanged.connect(self.set_refresh_choice)
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
    def set_numfmt(self, idx):
        self.numfmt = "in" if idx == 0 else "intl"; self.ui["numfmt"] = self.numfmt; self._save_ui()
        self.render_overview(); self.render_runs()

    def set_refresh_choice(self, idx):
        self.ui["refresh_sec"] = self._ref_opts[idx]; self._save_ui(); self.apply_refresh_interval(); self.render_overview()

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
        self.render_overview()
        if hasattr(self, "up_pill"):
            self.render_update()

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
        QShortcut(QKeySequence("F5"), self, activated=lambda: self.stack.currentIndex() == 0 and self.ov_refresh_now())
        QShortcut(QKeySequence("Ctrl+R"), self, activated=lambda: self.start_job(["--until", self._until_for_now()], t("b.incr")))

    def show_normal(self):
        self.showNormal(); self.activateWindow()

    def quit_app(self):
        self._really_quit = True; self.close()

    def resizeEvent(self, e):
        super().resizeEvent(e)
        self.toasts.layout()
        if hasattr(self, "ov_mid"):
            OV.relayout(self, self.width())
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
        self.tally_checking = True; self.set_state(self.c_tally, t("s.checking"), "warn")
        def cb(ok, err):
            self.tally_checking = False
            self.tally_ok = bool(ok) and not err
            self.c_tally.note.setText(url); self.render_overview()
            if self.tally_ok:
                self.al_conn.set("success", t("t.tally_ok", url)); self.toast(t("t.tally_ok", url), "success")
            else:
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
        self.db_checking = True; self.set_state(self.c_db, t("s.checking"), "warn")
        def work():
            use = pw
            if not use:
                _e, use = ns.load_secret()
            ok = ns.test_login(cfg, email, use)
            if ok and pw:
                ns.save_secret(email, pw)
            return ok
        def cb(ok, err):
            self.db_checking = False; self.login_saved = ns.have_secret()
            if ok:
                self.db_ok = True; self.db_err = ""; self.c_db.note.setText(now_s()); self.render_overview()
                self.f_pw.clear(); self.f_pw.setPlaceholderText(t("f.pw_saved"))
                self.al_conn.set("success", t("t.login_ok")); self.toast(t("t.login_ok"), "success"); self.log("Database login verified.", "SUCCESS"); self.refresh_runs()
            else:
                self.db_ok = False; self.db_err = err or ""; self.c_db.note.setText(""); self.render_overview()
                self.al_conn.set("error", t("t.login_fail", err or "?")); self.toast(t("t.login_fail", err or "?"), "error"); self.log(f"Login failed: {err}", "ERROR")
        self.run_bg(work, cb)

    def test_connections(self):
        self.check_tally()
        if ns.have_secret():
            self.refresh_runs(verify=True)
        else:
            self.login_saved = False; self.render_overview(); self.toast(t("al.no_login"), "warn")

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
        self.s_state.setText(label); self.s_bar.setRange(0, 0)
        self.b_stop.setEnabled(True)
        for b in (self.b_inc, self.b_full, self.b_test):
            b.setEnabled(False)
        self.log(f"{label} started.", "SYNC"); self.toast(t("t.job_started", label), "info")
        self.job.start(); QTimer.singleShot(1200, self.ov_tick)

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
            self.s_counts.setText(f"{self.n(self.vouchers_seen)} vouchers read this session · {self.failed} failed")
        m = re.match(r"(.+?): (NOT LOADED|failed|data check failed)(.*)", body)
        if m and m.group(1) in self.co_rows:
            if m.group(2) != "NOT LOADED":
                self.failed += 1
            self.set_co_row(m.group(1), "Not loaded in Tally" if m.group(2) == "NOT LOADED" else "Failed", body)
            self.s_counts.setText(f"{self.n(self.vouchers_seen)} vouchers read this session · {self.failed} failed")

    def on_job_end(self, rc):
        for b in (self.b_inc, self.b_full, self.b_test):
            b.setEnabled(True)
        self.b_stop.setEnabled(False)
        self.s_bar.setRange(0, 100)
        done = rc == 0
        self.s_bar.setValue(100 if done else 0)
        txt = {0: "Finished", 1: "Finished with problems", 4: "Not started (another sync running)", 5: "Login missing"}.get(rc, f"Ended (code {rc})")
        self.s_state.setText(txt)
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
            self.log("Schedule: " + msg, "SUCCESS" if ok else "ERROR"); self._sched_prefix = ("INSTALLED: " if ok else "FAILED: ") + msg + "\n\n"; self.sched_status()
        self.run_bg(ns.install_schedule, cb, s, e)

    @staticmethod
    def _sched_result(res):
        """Plain words for the 'Last Result' line of schtasks (0 = OK, 267011 = never run, 267009 = running)."""
        code = next((l.split(":", 1)[1].strip() for l in (res or "").splitlines() if l.startswith("Last Result")), "")
        if code in ("0", ""):
            return t("sched.ok") if code == "0" else "-"
        if code == "267011":
            return t("sched.never")
        if code == "267009":
            return t("sched.running")
        return t("sched.fail", code)

    def sched_status(self, manual=False):
        """Ask Windows Task Scheduler about the nightly task. A click on 'Check status' answers with a toast and the alert."""
        def cb(res, err):
            prefix = getattr(self, "_sched_prefix", ""); self._sched_prefix = ""
            parts = [prefix.rstrip()] if prefix else []
            if res:
                get = lambda k: next((l.split(":", 1)[1].strip() for l in res.splitlines() if l.startswith(k)), "-")
                nxt, last = get("Next Run Time"), get("Last Run Time")
                parts.append(t("sched.says") + ":\n" + res)
                self.sched_info = dict(installed=True, start=ns.schedule_start() or (self.t_start.text().strip() if hasattr(self, "t_start") else "00:30"),
                                       outdated=ns.schedule_needs_refresh(), next=nxt, last=last)
                msg = t("t.sched_state", nxt, f"{last} ({self._sched_result(res)})")
                if manual:
                    self.al_sched.set("success", msg); self.toast(msg, "success")
            else:
                parts.append(t("sched.none_out"))
                self.sched_info = dict(installed=False)
                if manual:
                    self.al_sched.set("warn", t("t.sched_none")); self.toast(t("t.sched_none"), "warn")
            if os.path.exists(ns.STATUS):
                parts.append(t("sched.last_run") + ":\n" + open(ns.STATUS, encoding="utf-8").read())
            self.sched_out.setPlainText("\n\n".join(parts)); self.sched_out.verticalScrollBar().setValue(0)
            if res and ns.schedule_needs_refresh():
                self.al_sched.set("warn", t("al.sched_old"))
            self.render_overview()
        self.run_bg(ns.query_schedule, cb)

    def run_sched_now(self):
        def cb(res, err):
            ok, msg = res if res else (False, err)
            self.log("Scheduled job started." if ok else f"Could not start the scheduled job: {msg}", "SYNC" if ok else "ERROR")
            self.toast(t("t.job_started", "Scheduled job") if ok else t("t.err", msg), "info" if ok else "error")
        self.run_bg(ns.run_schedule_now, cb)

    def remove_sched(self):
        def cb(res, err):
            self._sched_prefix = "Schedule removed." if res else "Nothing to remove."; self.toast(t("t.sched_rm"), "info"); self.sched_status()
        self.run_bg(ns.remove_schedule, cb)

    # ---------------------------------------------------------------- updates
    def _updates_card(self):
        u = QFrame(); u.setObjectName("card"); ug = QGridLayout(u); ug.setContentsMargins(20, 18, 20, 18); ug.setVerticalSpacing(10); ug.setHorizontalSpacing(14)
        hd = QLabel(t("up.title")); hd.setObjectName("h2"); ug.addWidget(hd, 0, 0, 1, 3)
        ug.addWidget(QLabel(t("up.installed")), 1, 0); self.up_cur = QLabel(f"v{APP_VERSION}"); ug.addWidget(self.up_cur, 1, 1)
        ug.addWidget(QLabel(t("up.latest")), 2, 0); self.up_latest = QLabel(t("up.unknown")); ug.addWidget(self.up_latest, 2, 1)
        self.up_pill = K.Pill(t("up.unknown"), "info", self.p); ug.addWidget(self.up_pill, 1, 2, 2, 1, Qt.AlignRight | Qt.AlignVCenter)
        self.up_notes = QLabel(""); self.up_notes.setObjectName("muted"); self.up_notes.setWordWrap(True); ug.addWidget(self.up_notes, 3, 0, 1, 3)
        self.up_bar = QProgressBar(); self.up_bar.setRange(0, 100); self.up_bar.hide(); ug.addWidget(self.up_bar, 4, 0, 1, 3)
        self.up_status = QLabel(""); self.up_status.setObjectName("muted"); self.up_status.setWordWrap(True); ug.addWidget(self.up_status, 5, 0, 1, 3)
        row = QHBoxLayout(); row.setSpacing(K.SP["md"])
        self.b_up_check = button(t("up.check"), "", lambda: self.check_updates(True))
        self.b_up_now = button(t("up.now"), "primary", self.update_now)
        self.b_up_rb = button(t("up.rollback"), "", self.rollback_update)
        for b in (self.b_up_check, self.b_up_now, self.b_up_rb):
            row.addWidget(b)
        row.addStretch(); ug.addLayout(row, 6, 0, 1, 3)
        self.s_autoupd = QCheckBox(t("up.auto")); self.s_autoupd.setChecked(self.ui.get("auto_update", True))
        self.s_autoupd.toggled.connect(lambda b: (self.ui.update(auto_update=b), self._save_ui()))
        ug.addWidget(self.s_autoupd, 7, 0, 1, 3)
        note = QLabel(t("up.exe_note") if FROZEN else t("up.src_note")); note.setObjectName("caption"); note.setWordWrap(True); ug.addWidget(note, 8, 0, 1, 3)
        ug.setColumnStretch(1, 1)
        self.render_update()
        return u

    def render_update(self):
        """Paint the Settings card and the Overview banner from self.upd / self.upd_msg."""
        try:
            kind, text = self.upd_msg or ("info", "")
            if self.upd_busy:
                self.up_pill.set(t("up.checking"), "info", self.p)
            elif self.upd:
                self.up_pill.set(t("up.available"), "warn", self.p)
            elif kind == "error":
                self.up_pill.set(t("up.failed"), "error", self.p)
            elif self.upd_msg:
                self.up_pill.set(t("up.uptodate"), "success", self.p)
            else:
                self.up_pill.set(t("up.unknown"), "info", self.p)
            self.up_latest.setText(f"v{self.upd['version']}" if self.upd else (f"v{self.upd_latest}" if getattr(self, "upd_latest", None) else t("up.unknown")))
            notes = ""
            if self.upd:
                notes = (self.upd.get("notes_bn") if K.LANG == "bn" else self.upd.get("notes_en")) or self.upd.get("notes_en") or ""
            self.up_notes.setText(notes); self.up_notes.setVisible(bool(notes))
            if not self._up_prog:
                self.up_status.setText(text if kind == "error" else "")
            self.up_status.setVisible(bool(self.up_status.text()))
            busy = self.upd_busy or bool(self._up_prog)
            self.b_up_check.setEnabled(not busy); self.b_up_now.setEnabled(bool(self.upd) and not busy)
            self.b_up_rb.setVisible(not FROZEN); self.b_up_rb.setEnabled(not busy and U.has_backup(HERE))
            if not FROZEN and U.has_backup(HERE):
                self.b_up_rb.setToolTip(f"v{U.last_backup_version(HERE) or '?'}")
            self.al_update.set("info", t("up.ov", self.upd["version"]) if self.upd else "", self.p)
            self.b_up_ov.setVisible(bool(self.upd)); self.b_up_ov.setEnabled(not busy)
            self.render_overview()
        except RuntimeError:  # widgets of the previous language were already deleted
            pass

    def auto_check_updates(self):
        if os.environ.get("NABIAD_BRIDGE_NO_NET") or not self.ui.get("auto_update", True):
            return
        if time.time() - float(self.ui.get("last_update_check", 0)) < UPDATE_EVERY_S:
            return
        self.check_updates(False)

    def check_updates(self, manual=True):
        if self.upd_busy or self._up_prog:
            return
        self.upd_busy = True; self.upd_msg = None; self.up_status.setText(""); self.render_update()
        def cb(res, err):
            self.upd_busy = False
            if not err:
                self.ui["last_update_check"] = time.time(); self._save_ui()
            if err:
                self.upd = None; self.upd_msg = ("error", t("up.msg_fail", err))
                if manual:
                    self.toast(self.upd_msg[1], "error")
            elif res["status"] == "available":
                first = not self.upd or self.upd.get("version") != res["version"]
                self.upd = res; self.upd_latest = res["version"]; self.upd_msg = ("warn", t("up.msg_available", res["version"]))
                self.log(f"Update available: v{res['version']} (installed v{APP_VERSION}).", "INFO")
                if manual or first:
                    self.toast(self.upd_msg[1], "info")
                if not manual:
                    self.notify(self.upd_msg[1])
            else:
                self.upd = None; self.upd_latest = res["version"]; self.upd_msg = ("success", t("up.msg_uptodate", APP_VERSION))
                if manual:
                    self.toast(self.upd_msg[1], "success")
            self.render_update()
        self.run_bg(self._guard(lambda: U.check(APP_VERSION, FROZEN)), cb)

    @staticmethod
    def _guard(fn):
        """Show an UpdateError as its plain message (Task turns SystemExit into the error text)."""
        def run(*a):
            try:
                return fn(*a)
            except U.UpdateError as e:
                raise SystemExit(str(e))
        return run

    def _update_blocker(self):
        if self.job and self.job.isRunning():
            return t("up.busy_job")
        if not ns.lock_is_free():
            return t("up.busy_night")
        return None

    def update_now(self):
        if not self.upd or self._up_prog:
            return
        why = self._update_blocker()
        if why:
            self.toast(why, "warn"); return
        info = self.upd
        q = t("up.confirm_exe" if FROZEN else "up.confirm", APP_VERSION, info["version"])
        if QMessageBox.question(self, "NABIAD DATA BRIDGE", q) != QMessageBox.Yes:
            return
        self._up_prog = (0, 0, ""); self.up_bar.setValue(0); self.up_bar.setVisible(True); self.up_status.setText(""); self.render_update()
        def progress(i, n, name):
            self._up_prog = (i, n, name)
        def work():
            if FROZEN:
                tmp = os.path.join(HERE, U.TMP_DIR)
                path = U.download_installer(info, tmp, progress=lambda got, total: progress(got, total, ""))
                return {"installer": path, "version": info["version"]}
            return U.apply_source_update(info["manifest"], HERE, progress=progress)
        tick = QTimer(self)
        def paint():
            i, n, name = self._up_prog or (0, 0, "")
            if FROZEN:
                pct = int(i * 100 / n) if n else 0; self.up_bar.setValue(pct); self.up_status.setText(t("up.progress_exe", pct))
            else:
                self.up_bar.setValue(int((i - 1) * 100 / n) if n else 0); self.up_status.setText(t("up.progress", i, n, name) if n else "")
            self.up_status.setVisible(True)
        tick.timeout.connect(paint); tick.start(150)
        def cb(res, err):
            tick.stop(); self._up_prog = None; self.up_bar.setVisible(False)
            if err:
                self.upd_msg = ("error", t("up.failed_apply", err)); self.up_status.setText(self.upd_msg[1])
                self.toast(self.upd_msg[1], "error"); self.log("Update failed: " + err, "ERROR"); self.render_update(); return
            self.log(f"Updated to v{res['version']}.", "SUCCESS"); self.toast(t("up.done", res["version"]), "success")
            self.up_status.setText(t("up.done", res["version"])); self.up_status.setVisible(True)
            self._relaunch(res.get("installer"))
        self.run_bg(self._guard(work), cb)

    def _relaunch(self, installer=None):
        """Start the new version, then close this window. The new process waits for this one to let go of the lock."""
        try:
            if installer:
                U.run_installer(installer)
            else:
                U.restart_app(HERE, FROZEN)
        except OSError as e:
            self.toast(t("t.err", str(e)), "error"); return
        QTimer.singleShot(900, self.quit_app)

    def rollback_update(self):
        if self._up_prog or self.upd_busy:
            return
        ver = U.last_backup_version(HERE)
        if not ver:
            self.toast(t("up.rb_none"), "warn"); return
        why = self._update_blocker()
        if why:
            self.toast(why, "warn"); return
        if QMessageBox.question(self, "NABIAD DATA BRIDGE", t("up.rb_confirm", ver)) != QMessageBox.Yes:
            return
        try:
            res = U.rollback(HERE)
        except U.UpdateError as e:
            self.toast(t("up.failed_apply", str(e)), "error"); return
        self.log(f"Restored v{res['version']} from the backup.", "SUCCESS"); self.toast(t("up.rb_done", res["version"]), "success")
        self._relaunch()

    # ---------------------------------------------------------------- data refresh
    def refresh_all(self):
        self.check_tally_quiet(); self.sched_status()
        if ns.have_secret():
            self.refresh_runs(verify=True)

    def check_tally_quiet(self):
        url = self.f_tally.text().strip()
        def cb(ok, err):
            self.tally_ok = bool(ok) and not err
            self.c_tally.note.setText(url); self.render_overview()
        self.run_bg(ns.port_open, cb, url)

    def refresh_light(self):
        """Timer (Settings → Overview auto-refresh): Tally port and the sync history, but never while a job is running."""
        if self.job and self.job.isRunning():
            return
        if self.ov_progress:
            return
        self.check_tally_quiet()
        if ns.have_secret():
            self.refresh_runs()

    def apply_refresh_interval(self):
        secs = int(self.ui.get("refresh_sec", 60))
        if secs > 0:
            self.timer.start(secs * 1000)
        else:
            self.timer.stop()

    def ov_refresh_now(self, *_):
        self.check_tally_quiet(); self.sched_status()
        self.login_saved = ns.have_secret()
        if self.login_saved:
            self.refresh_runs(verify=True)
        else:
            self.render_overview()

    def refresh_runs(self, verify=False):
        self.login_saved = ns.have_secret()
        if not self.login_saved or not self.cfg.get("supabase_url"):
            self.render_overview(); return
        def cb(rows, err):
            if err:
                self.db_ok = False; self.db_err = err; self.render_overview(); return
            self.runs = rows or []; self.db_ok = True; self.db_err = ""
            self.ov_refreshed = dt.datetime.now().astimezone(); self.ov_cached = False
            self._save_ov_cache()
            self.render_runs(); self.render_overview()
        self.run_bg(ns.fetch_runs, cb, self.cfg)

    # ---- Overview data: cached first, background refresh, local progress from the nightly log
    def n(self, x):
        return OM.fmt_num(x, self.numfmt)

    def set_state_label(self, lab, text, kind):
        lab.setText(text); lab.setStyleSheet(f"color:{self.p[K.KIND_COLOR[kind]]};")

    def _load_ov_cache(self):
        """Show the last saved history at once; the database answer replaces it a moment later."""
        try:
            c = json.load(open(OV_CACHE, encoding="utf-8"))
            self.runs = list(c.get("runs") or []); self.ov_refreshed = OM.parse_iso(c.get("saved")); self.ov_cached = bool(self.runs)
        except (OSError, ValueError, TypeError):
            pass

    def _save_ov_cache(self):
        try:
            json.dump({"saved": dt.datetime.now().astimezone().isoformat(timespec="seconds"), "runs": self.runs[:300]}, open(OV_CACHE, "w", encoding="utf-8"))
        except OSError:
            pass

    def ov_tail_progress(self):
        """None when no sync is running; else what the last run in nightly_log.txt has done so far (manual, scheduled or from this window)."""
        try:   # probing the lock is cheap but not free: only when a run is likely (log touched lately, one was running) or once a minute
            recent = time.time() - os.path.getmtime(ns.LOG) < 900
        except OSError:
            recent = False
        if not (self.ov_progress or recent or time.time() - self._lock_probe > 60):
            return None
        self._lock_probe = time.time()
        try:
            busy = not ns.lock_is_free()
        except Exception:
            busy = False
        if not busy:
            return None
        prog = None
        try:
            with open(ns.LOG, "rb") as f:
                f.seek(0, 2); size = f.tell(); f.seek(max(0, size - 262144))
                prog = OM.log_progress(f.read().decode("utf-8", "replace"))
        except OSError:
            pass
        if not prog or not prog["running"]:
            prog = dict(running=True, total=len(self.ticked()), done=0, problems=0, current="", vouchers=0, started=None, ended=None)
        return prog

    def ov_tick(self):
        """Every 3 s (local files only, no network): follow a running sync; repaint the relative times once a minute."""
        prog = self.ov_tail_progress()
        was = bool(self.ov_progress)
        self.ov_progress = prog
        if was and not prog:                      # a run just ended (also one started by Task Scheduler): fetch the new history
            self.refresh_runs(); self.sched_status()
        minute = dt.datetime.now().minute
        if prog or was or minute != self._ov_min:
            self._ov_min = minute
            if self.stack.currentIndex() == 0 or was:
                self.render_overview()

    def render_overview(self):
        if not hasattr(self, "ov_tbl"):
            return
        now = dt.datetime.now().astimezone()
        d = OM.summarize(self.runs, self.ticked(), now, progress=self.ov_progress, tally_ok=self.tally_ok, db_ok=self.db_ok, db_error=self.db_err,
                         login_saved=self.login_saved, cfg_error=getattr(self, "cfg_error", False), sched=self.sched_info)
        OV.render(self, d, now)

    def stop_any(self):
        """Stop after the current batch: the app's own job, or a scheduled/manual run (the engine looks for the stop flag)."""
        if self.job and self.job.isRunning():
            self.stop_job(); return
        try:
            open(ns.STOP_FLAG, "w").close()
        except OSError as e:
            self.toast(t("t.err", e), "error"); return
        self.log("Stop requested for the running job.", "WARNING"); self.toast(t("live.stopreq"), "warn")

    def set_company_status(self, c, text):
        self.company_state[c] = text
        for r in range(self.tbl.rowCount()):
            if self.tbl.item(r, 1).text() == c:
                self.tbl.item(r, 4).setText(text)

    def render_runs(self):
        last, lastv = {}, {}
        for r in self.runs:
            if r.get("ok") and r["company"] not in last:
                last[r["company"]] = r.get("finished_at") or r.get("started_at"); lastv[r["company"]] = r.get("vouchers")
        def fmt(s):
            try:
                return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone().strftime("%d %b %Y %H:%M")
            except Exception:
                return "-"
        for r in range(self.tbl.rowCount()):
            c = self.tbl.item(r, 1).text(); self.tbl.item(r, 3).setText(fmt(last[c]) if c in last else "-")
            if c not in self.company_state:  # no test read in this session: show what the database says
                self.tbl.item(r, 4).setText(t("s.synced") if c in last else t("s.notver"))
        # runs are newest first: a failure is "fixed later" when a newer run of the same company succeeded
        fixed, seen_ok = set(), set()
        for i, r in enumerate(self.runs):
            if r.get("ok"):
                seen_ok.add(r["company"])
            elif r.get("ok") is False and r["company"] in seen_ok:
                fixed.add(i)
        okn = sum(1 for r in self.runs if r.get("ok")); bad = sum(1 for r in self.runs if r.get("ok") is False)
        self.a_runs.value.setText(str(len(self.runs))); self.a_ok.value.setText(str(okn)); self.a_fail.value.setText(str(bad - len(fixed)))
        self.a_fail.note.setText(t("an.fail_note", len(fixed)) if fixed else "")
        self.a_v.value.setText(self.n(sum(r.get('vouchers') or 0 for r in self.runs)))
        self.an_tbl.setRowCount(len(self.runs))
        for i, r in enumerate(self.runs):
            vals = [r["company"], fmt(r["started_at"]), r.get("kind", ""), str(r.get("vouchers") if r.get("vouchers") is not None else "-"),
                    "OK" if r.get("ok") else ((t("an.fixed") if i in fixed else "FAILED") if r.get("ok") is False else "-"), (r.get("error") or "")[:200]]
            for j, x in enumerate(vals):
                self.an_tbl.setItem(i, j, QTableWidgetItem(x))
            if r.get("ok") is False:
                self.an_tbl.item(i, 4).setForeground(QColor(self.p["amber" if i in fixed else "red"]))

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
        locked = lock.tryLock(100)
        if not locked and "--after-update" in sys.argv:  # started by the old window of an update: wait until it has closed
            end = time.time() + 25
            while not locked and time.time() < end:
                time.sleep(0.4); locked = lock.tryLock(100)
        if not locked:
            QMessageBox.information(None, "NABIAD DATA BRIDGE", "NABIAD DATA BRIDGE is already open (check the system tray).")
            sys.exit(0)
    def hook(et, ev, tb):
        text = "".join(traceback.format_exception(et, ev, tb)); log_error("Unhandled:\n" + text)
        w = QApplication.activeWindow()
        if isinstance(w, Window):
            w.toast(t("t.err", f"{et.__name__}: {ev}"), "error")
    sys.excepthook = hook
    w = Window(); w.show()
    if "--after-update" in sys.argv:
        QTimer.singleShot(1500, lambda: w.toast(t("up.after", APP_VERSION), "success"))
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
