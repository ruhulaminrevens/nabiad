"""UI building blocks for NABIAD DATA BRIDGE: design tokens, theme, English/Bangla strings, Toast, inline Alert,
Accordion, status Pill and the product tour (coach marks). No sync logic here."""
from PySide6.QtCore import QEasingCurve, QPoint, QPropertyAnimation, QRect, QRectF, Qt, QTimer, Signal
from PySide6.QtGui import QColor, QFont, QPainter, QPainterPath, QPen
from PySide6.QtWidgets import (QFrame, QGraphicsDropShadowEffect, QGraphicsOpacityEffect, QHBoxLayout, QLabel, QPushButton,
                               QSizePolicy, QVBoxLayout, QWidget)

# ------------------------------------------------------------------ design tokens
SP = dict(xs=4, sm=8, md=12, lg=16, xl=24)            # spacing scale (px)
FS = dict(caption=11, body=13, label=12, h2=15, h1=22, kpi=22)  # type scale (px)
RADIUS = dict(sm=8, md=12, lg=16)

DARK = dict(bg="#0F172A", side="#111827", card="#1B2740", line="#2E3D5C", ink="#EAF1FF", muted="#9FB0C9", input="#14203A",
            indigo="#4F46E5", violet="#8B5CF6", sky="#0EA5E9", green="#10B981", amber="#F59E0B", red="#EF4444", log="#0A1224",
            hero1="#1E1B4B", hero2="#1E3A8A", hero3="#0C4A6E", scrim="#000000")
LIGHT = dict(bg="#F8FAFC", side="#E8EDF6", card="#FFFFFF", line="#D5DDEB", ink="#16233B", muted="#556781", input="#FFFFFF",
             indigo="#4F46E5", violet="#8B5CF6", sky="#0284C7", green="#047857", amber="#B45309", red="#DC2626", log="#EEF2F9",
             hero1="#E0E7FF", hero2="#DBEAFE", hero3="#CFFAFE", scrim="#0F172A")

FONT_STACK = "'Segoe UI Variable','Segoe UI','Nirmala UI','Inter',sans-serif"


def qss(p):
    return f"""
* {{ font-family:{FONT_STACK}; font-size:{FS['body']}px; color:{p['ink']}; }}
QMainWindow, #page, QStackedWidget {{ background:{p['bg']}; }}
#sidebar {{ background:{p['side']}; border-right:1px solid {p['line']}; }}
#brandname {{ font-size:14px; font-weight:700; letter-spacing:1px; }}
#brandsub {{ color:{p['muted']}; font-size:10px; letter-spacing:2px; }}
QPushButton#nav {{ text-align:left; padding:10px 14px; border:0; border-radius:{RADIUS['sm']}px; background:transparent; color:{p['muted']}; margin:0; }}
QPushButton#nav:hover {{ background:{p['card']}; color:{p['ink']}; }}
QPushButton#nav:checked {{ background:{p['indigo']}; color:white; font-weight:600; }}
#card, QFrame#panel {{ background:{p['card']}; border:1px solid {p['line']}; border-radius:{RADIUS['md']}px; }}
#hero {{ border-radius:{RADIUS['lg']}px; border:1px solid {p['line']};
        background:qlineargradient(x1:0,y1:0,x2:1,y2:1,stop:0 {p['hero1']},stop:0.55 {p['hero2']},stop:1 {p['hero3']}); }}
#title {{ font-size:{FS['h1']}px; font-weight:700; }}
#sub, #muted {{ color:{p['muted']}; }}
#caption {{ color:{p['muted']}; font-size:{FS['caption']}px; }}
#cardtitle {{ color:{p['muted']}; font-size:{FS['label']}px; letter-spacing:.3px; }}
#cardvalue {{ font-size:{FS['kpi']}px; font-weight:700; }}
#h2 {{ font-size:{FS['h2']}px; font-weight:600; }}
QPushButton {{ background:{p['card']}; border:1px solid {p['line']}; border-radius:{RADIUS['sm']}px; padding:8px 14px; margin:0 2px; }}
QPushButton:hover {{ border-color:{p['sky']}; }}
QPushButton:pressed {{ background:{p['input']}; }}
QPushButton:disabled {{ color:{p['muted']}; background:{p['bg']}; }}
QPushButton#primary {{ background:qlineargradient(x1:0,y1:0,x2:1,y2:0,stop:0 {p['indigo']},stop:1 {p['violet']}); border:0; color:white; font-weight:600; }}
QPushButton#primary:hover {{ background:qlineargradient(x1:0,y1:0,x2:1,y2:0,stop:0 {p['violet']},stop:1 {p['sky']}); }}
QPushButton#primary:disabled {{ background:{p['line']}; color:{p['muted']}; }}
QPushButton#danger {{ border-color:{p['red']}; color:{p['red']}; }}
QPushButton#danger:disabled {{ border-color:{p['line']}; color:{p['muted']}; }}
QPushButton#ghost {{ background:transparent; border:0; color:{p['muted']}; }}
QPushButton#ghost:hover {{ color:{p['ink']}; }}
QPushButton:focus, QLineEdit:focus, QComboBox:focus {{ border:2px solid {p['sky']}; }}
QLineEdit, QComboBox, QPlainTextEdit {{ background:{p['input']}; border:1px solid {p['line']}; border-radius:{RADIUS['sm']}px; padding:7px 9px; selection-background-color:{p['indigo']}; }}
QComboBox QAbstractItemView {{ background:{p['card']}; selection-background-color:{p['indigo']}; border:1px solid {p['line']}; }}
QPlainTextEdit#log {{ background:{p['log']}; font-family:Consolas,'Cascadia Mono',monospace; font-size:12px; }}
QTableWidget {{ background:{p['card']}; border:1px solid {p['line']}; border-radius:10px; gridline-color:{p['line']}; alternate-background-color:{p['input']}; }}
QHeaderView::section {{ background:{p['input']}; color:{p['muted']}; border:0; border-bottom:1px solid {p['line']}; padding:8px; font-weight:600; }}
QTableWidget::item {{ padding:4px 8px; }} QTableWidget::item:selected {{ background:{p['indigo']}; color:white; }}
QProgressBar {{ background:{p['line']}; border:0; border-radius:5px; height:10px; text-align:center; color:transparent; }}
QProgressBar::chunk {{ background:qlineargradient(x1:0,y1:0,x2:1,y2:0,stop:0 {p['indigo']},stop:0.5 {p['violet']},stop:1 {p['sky']}); border-radius:5px; }}
QCheckBox::indicator, QTableWidget::indicator {{ width:16px; height:16px; border-radius:4px; border:1px solid {p['line']}; background:{p['input']}; }}
QCheckBox::indicator:checked, QTableWidget::indicator:checked {{ background:{p['indigo']}; border-color:{p['indigo']}; }}
QScrollBar:vertical {{ background:transparent; width:10px; }} QScrollBar::handle:vertical {{ background:{p['line']}; border-radius:5px; min-height:30px; }}
QScrollBar::add-line, QScrollBar::sub-line {{ height:0; }}
QToolTip {{ background:{p['card']}; color:{p['ink']}; border:1px solid {p['line']}; padding:6px; }}
QFrame#acc {{ background:{p['card']}; border:1px solid {p['line']}; border-radius:{RADIUS['md']}px; }}
QPushButton#acchead {{ text-align:left; background:transparent; border:0; padding:12px 14px; font-weight:600; font-size:{FS['h2']}px; margin:0; }}
QPushButton#acchead:hover {{ color:{p['sky']}; }}
"""


# ------------------------------------------------------------------ English / Bangla strings
LANG = "en"


def set_lang(code):
    global LANG
    LANG = "bn" if code == "bn" else "en"


def t(key, *a):
    en, bn = STR[key]
    s = bn if LANG == "bn" else en
    return s.format(*a) if a else s


STR = {
    # navigation
    "nav.overview": ("Overview", "ওভারভিউ"), "nav.companies": ("Company Manager", "কোম্পানি ম্যানেজার"),
    "nav.connections": ("Connections", "সংযোগ"), "nav.sync": ("Sync Center", "সিঙ্ক সেন্টার"),
    "nav.scheduler": ("Scheduler", "শিডিউলার"), "nav.analytics": ("Sync Analytics", "সিঙ্ক বিশ্লেষণ"),
    "nav.logs": ("Activity & Logs", "কার্যকলাপ ও লগ"), "nav.settings": ("Settings", "সেটিংস"), "nav.help": ("Help & Guide", "সহায়তা ও গাইড"),
    "side.foot": ("Read-only Tally\nWindows Desktop", "Tally শুধু পড়া হয়\nWindows Desktop"),
    # page titles
    "ov.title": ("Synchronization Overview", "সিঙ্ক ওভারভিউ"), "ov.sub": ("TallyPrime → Supabase · control center", "TallyPrime → Supabase · কন্ট্রোল সেন্টার"),
    "co.title": ("Company Manager", "কোম্পানি ম্যানেজার"), "co.sub": ("Choose which Tally companies are copied, and from which date", "কোন Tally কোম্পানি, কোন তারিখ থেকে কপি হবে তা ঠিক করুন"),
    "cn.title": ("Connections", "সংযোগ"), "cn.sub": ("Tally endpoint and database login (tested separately)", "Tally ঠিকানা ও database login (আলাদাভাবে পরীক্ষা)"),
    "sy.title": ("Sync Center", "সিঙ্ক সেন্টার"), "sy.sub": ("Read-only extraction from Tally, upload to Supabase", "Tally থেকে শুধু পড়া, Supabase-এ আপলোড"),
    "sc.title": ("Scheduler", "শিডিউলার"), "sc.sub": ("Automatic nightly sync with Windows Task Scheduler", "Windows Task Scheduler দিয়ে রাতের স্বয়ংক্রিয় সিঙ্ক"),
    "an.title": ("Sync Analytics", "সিঙ্ক বিশ্লেষণ"), "an.sub": ("Real figures from the sync history in the database", "database-এর সিঙ্ক ইতিহাস থেকে প্রকৃত সংখ্যা"),
    "lg.title": ("Activity & Logs", "কার্যকলাপ ও লগ"), "lg.sub": ("Live events from this window and the nightly job", "এই window ও রাতের job-এর live ঘটনা"),
    "st.title": ("Settings", "সেটিংস"), "st.sub": ("Appearance, language, tray and configuration backup", "চেহারা, ভাষা, tray ও কনফিগারেশন ব্যাকআপ"),
    "hp.title": ("Help & Guide", "সহায়তা ও গাইড"), "hp.sub": ("Setup steps, nightly requirements and troubleshooting", "সেটআপ, রাতের শর্ত ও সমস্যা সমাধান"),
    # cards
    "card.tally": ("Tally connection", "Tally সংযোগ"), "card.db": ("Cloud database", "ক্লাউড database"),
    "card.cos": ("Selected companies", "নির্বাচিত কোম্পানি"), "card.sched": ("Nightly schedule", "রাতের শিডিউল"),
    "card.cos.note": ("configured for sync", "সিঙ্কের জন্য ঠিক করা"),
    "s.nottested": ("Not tested", "পরীক্ষা হয়নি"), "s.login": ("Login required", "Login দরকার"), "s.portopen": ("Port open", "Port খোলা"),
    "s.noanswer": ("Not answering", "সাড়া নেই"), "s.checking": ("Checking…", "যাচাই হচ্ছে…"), "s.signedin": ("Signed in", "Login হয়েছে"),
    "s.loginfail": ("Login failed", "Login ব্যর্থ"), "s.unreach": ("Not reachable", "পাওয়া যাচ্ছে না"),
    "s.notinst": ("Not installed", "বসানো নেই"), "s.inst": ("Installed", "বসানো আছে"), "s.notchecked": ("Not checked", "দেখা হয়নি"),
    "s.idle": ("Idle", "অপেক্ষায়"), "s.nonrec": ("no run recorded", "কোনো run নেই"), "s.notver": ("Not verified", "যাচাই হয়নি"), "s.synced": ("Synced", "সিঙ্ক হয়েছে"),
    "pipe.src": ("read-only source", "শুধু-পড়া উৎস"), "pipe.eng": ("sync engine", "সিঙ্ক ইঞ্জিন"), "pipe.db": ("cloud database", "ক্লাউড database"),
    # buttons
    "b.test_conn": ("Test connections", "সংযোগ পরীক্ষা"), "b.full": ("Run full history load", "পুরো ইতিহাস লোড"), "b.logs": ("View activity logs", "লগ দেখুন"),
    "b.sync_now": ("Sync now", "এখনই সিঙ্ক"), "b.tour": ("Take the tour", "ট্যুর দেখুন"),
    "b.select_all": ("Select all", "সব নির্বাচন"), "b.select_none": ("Select none", "কোনোটিই নয়"), "b.detect": ("Detect companies in Tally", "Tally থেকে কোম্পানি খুঁজুন"),
    "b.add": ("Add", "যোগ করুন"), "b.remove": ("Remove selected row (settings only)", "নির্বাচিত সারি সরান (শুধু সেটিংস)"),
    "b.test_read": ("Test reading selected (last 3 days)", "নির্বাচিত পড়ার পরীক্ষা (শেষ ৩ দিন)"), "b.save": ("Save settings", "সেটিংস সেভ"),
    "b.check_tally": ("Check Tally", "Tally পরীক্ষা"), "b.login_save": ("Test login and save", "Login পরীক্ষা ও সেভ"),
    "b.test_read_sc": ("Test reading (3 days, uploads nothing)", "পড়ার পরীক্ষা (৩ দিন, কিছু আপলোড হয় না)"),
    "b.incr": ("Run incremental sync now", "এখনই ইনক্রিমেন্টাল সিঙ্ক"), "b.stop": ("Stop after current batch", "বর্তমান batch-এর পর থামান"),
    "b.install": ("Install schedule", "শিডিউল বসান"), "b.status": ("Check status", "অবস্থা দেখুন"), "b.run_now": ("Run now (test)", "এখন চালান (পরীক্ষা)"),
    "b.remove_sched": ("Remove", "সরান"), "b.refresh": ("Refresh from database", "database থেকে রিফ্রেশ"),
    "b.load_log": ("Load nightly_log.txt", "nightly_log.txt লোড"), "b.copy": ("Copy", "কপি"), "b.csv": ("Export CSV", "CSV এক্সপোর্ট"),
    "b.backup": ("Back up configuration…", "কনফিগারেশন ব্যাকআপ…"), "b.restore": ("Restore configuration…", "কনফিগারেশন রিস্টোর…"),
    "b.next": ("Next", "পরেরটি"), "b.back": ("Back", "আগেরটি"), "b.skip": ("Skip tour", "ট্যুর বাদ দিন"), "b.done": ("Done", "শেষ"),
    "b.dismiss": ("Dismiss", "বন্ধ করুন"),
    # updates
    "up.title": ("Updates", "আপডেট"), "up.installed": ("Installed version", "ইনস্টল করা ভার্সন"), "up.latest": ("Latest version", "সর্বশেষ ভার্সন"),
    "up.check": ("Check for updates", "আপডেট খুঁজুন"), "up.now": ("Update now", "এখনই আপডেট"), "up.rollback": ("Restore previous version", "আগের ভার্সনে ফিরুন"),
    "up.auto": ("Check for updates automatically", "স্বয়ংক্রিয়ভাবে আপডেট খুঁজুন"), "up.checking": ("Checking…", "খোঁজা হচ্ছে…"),
    "up.unknown": ("not checked yet", "এখনও খোঁজা হয়নি"), "up.uptodate": ("Up to date", "সর্বশেষ ভার্সন"), "up.available": ("Update available", "আপডেট আছে"),
    "up.failed": ("Check failed", "খোঁজা ব্যর্থ"),
    "up.msg_uptodate": ("You are on the latest version (v{0}).", "আপনি সর্বশেষ ভার্সনে আছেন (v{0})।"),
    "up.msg_available": ("Update available: v{0}.", "নতুন আপডেট আছে: v{0}।"),
    "up.msg_fail": ("Could not check for updates: {0}", "আপডেট খোঁজা যায়নি: {0}"),
    "up.ov": ("Update available: v{0}. It takes a minute, keeps your settings and login, and the old version is backed up.", "নতুন আপডেট: v{0}। এক মিনিট লাগে, সেটিংস ও login থাকে, পুরোনো ভার্সনের ব্যাকআপ রাখা হয়।"),
    "up.confirm": ("Update from v{0} to v{1}?\n\nThe window restarts. Tally and the database are not touched. Your settings, saved login and logs stay.\nThe old files are backed up so you can go back.",
                   "v{0} থেকে v{1}-এ আপডেট করবেন?\n\nwindow আবার খুলবে। Tally ও database ছোঁয়া হবে না। আপনার সেটিংস, সেভ করা login ও লগ থাকবে।\nপুরোনো ফাইলের ব্যাকআপ থাকবে, চাইলে ফিরে যেতে পারবেন।"),
    "up.confirm_exe": ("Update from v{0} to v{1}?\n\nThe new installer is downloaded, checked and run. The window closes and opens again. Your settings, saved login and logs stay.",
                       "v{0} থেকে v{1}-এ আপডেট করবেন?\n\nনতুন installer ডাউনলোড, যাচাই ও চালানো হবে। window বন্ধ হয়ে আবার খুলবে। আপনার সেটিংস, সেভ করা login ও লগ থাকবে।"),
    "up.busy_job": ("A sync is running. Update after it finishes.", "সিঙ্ক চলছে। শেষ হলে আপডেট করুন।"),
    "up.busy_night": ("The nightly job is running. Try again after it ends.", "রাতের job চলছে। শেষ হলে আবার চেষ্টা করুন।"),
    "up.progress": ("Downloading {0}/{1}: {2}", "ডাউনলোড {0}/{1}: {2}"), "up.progress_exe": ("Downloading the installer… {0}%", "installer ডাউনলোড হচ্ছে… {0}%"),
    "up.done": ("Updated to v{0}. Restarting…", "v{0}-এ আপডেট হয়েছে। আবার চালু হচ্ছে…"),
    "up.failed_apply": ("Update not installed: {0}", "আপডেট বসেনি: {0}"),
    "up.after": ("Updated to v{0}. The old files are kept in update_backup.", "v{0}-এ আপডেট হয়েছে। পুরোনো ফাইল update_backup-এ আছে।"),
    "up.rb_confirm": ("Go back to v{0} using the last backup? The window restarts.", "শেষ ব্যাকআপ থেকে v{0}-এ ফিরবেন? window আবার খুলবে।"),
    "up.rb_none": ("There is no backup to restore.", "ফেরার মতো কোনো ব্যাকআপ নেই।"),
    "up.rb_done": ("Back on v{0}. Restarting…", "v{0}-এ ফেরা হয়েছে। আবার চালু হচ্ছে…"),
    "up.src_note": ("Source: the NABIAD GitHub repository (main). Every file is checked (SHA-256, Python syntax, version) before it replaces the old one. Nothing in Tally or the database is touched.",
                    "উৎস: NABIAD GitHub রিপোজিটরি (main)। পুরোনো ফাইল বদলের আগে প্রতিটি ফাইল যাচাই হয় (SHA-256, Python syntax, ভার্সন)। Tally বা database ছোঁয়া হয় না।"),
    "up.exe_note": ("Packaged app: an update runs the installer from the GitHub release after its checksum is verified. Your settings and login stay.", "প্যাকেজ করা app: GitHub release-এর installer checksum মিলিয়ে চালানো হয়। সেটিংস ও login থাকে।"),
    "al.sched_old": ("The installed nightly schedule was created by an older version. Click Install schedule once to refresh it (no console window, wake PC, run late).",
                     "বসানো রাতের শিডিউলটি পুরোনো ভার্সনে তৈরি। নতুন করে বসাতে একবার Install schedule চাপুন (console window ছাড়া, PC জাগানো, দেরিতে চালানো)।"),
    # fields
    "f.tally": ("Tally address", "Tally ঠিকানা"), "f.sburl": ("Supabase URL", "Supabase URL"), "f.sbkey": ("Supabase public (anon) key", "Supabase public (anon) key"),
    "f.email": ("Bridge login email", "Bridge login ইমেইল"), "f.pw": ("Bridge login password", "Bridge login পাসওয়ার্ড"),
    "f.pw_saved": ("saved (leave empty to keep)", "সেভ করা আছে (বদলাতে না চাইলে ফাঁকা রাখুন)"),
    "f.search_co": ("Search companies…", "কোম্পানি খুঁজুন…"), "f.add_co": ("Add a company by exact name", "হুবহু নাম লিখে কোম্পানি যোগ করুন"),
    "f.start": ("Start at", "শুরু"), "f.stop": ("Stop by", "শেষ"), "f.search_log": ("Search the log…", "লগে খুঁজুন…"),
    "col.company": ("Company (exact Tally name)", "কোম্পানি (Tally-র হুবহু নাম)"), "col.start": ("History starts", "ইতিহাস শুরু"),
    "col.last": ("Last successful sync", "শেষ সফল সিঙ্ক"), "col.status": ("Status", "অবস্থা"), "col.vouchers": ("Vouchers (last run)", "Voucher (শেষ run)"),
    "col.name": ("Company", "কোম্পানি"), "col.stage": ("Stage", "ধাপ"), "col.detail": ("Detail", "বিবরণ"),
    "set.theme": ("Theme", "থিম"), "set.lang": ("Language", "ভাষা"), "set.tray": ("Keep running in the system tray when the window is closed", "window বন্ধ করলে system tray-তে চালু থাকুক"),
    "set.startup": ("Start this app when I sign in to Windows", "Windows-এ sign in করলে এই অ্যাপ চালু হোক"),
    "set.toasts": ("Show desktop notifications", "ডেস্কটপ নোটিফিকেশন দেখান"),
    "sec.ctrl": ("Sync control", "সিঙ্ক নিয়ন্ত্রণ"), "sec.curop": ("Current operation", "বর্তমান কাজ"), "sec.costatus": ("Company sync status", "কোম্পানি-ভিত্তিক সিঙ্ক অবস্থা"),
    "sec.pipeline": ("Data pipeline", "ডেটা পাইপলাইন"),
    # inline alerts / notes
    "al.pw_note": ("The password is stored encrypted for this Windows user only (Windows DPAPI). It is never written to config.json, logs or exports. Only the public key is saved in config.json.",
                   "পাসওয়ার্ড শুধু এই Windows user-এর জন্য encrypt হয়ে থাকে (Windows DPAPI)। config.json, লগ বা এক্সপোর্টে কখনো যায় না। config.json-এ শুধু public key থাকে।"),
    "al.co_note": ("Double-click a date to edit it (YYYY-MM-DD). Removing a row only changes config.json; no Tally or database data is touched.",
                   "তারিখ edit করতে double-click করুন (YYYY-MM-DD)। সারি সরালে শুধু config.json বদলায়; Tally বা database-এর data ছোঁয়া হয় না।"),
    "al.sched_note": ("Requirements: the PC is on or asleep (a shut-down PC cannot wake itself), you are signed in to Windows, TallyPrime is open with all companies loaded. The scheduled job runs without this window. A company that is not loaded is skipped and reported, never replaced by another one.",
                      "শর্ত: PC চালু বা sleep-এ থাকতে হবে (shutdown থাকলে নিজে জাগতে পারে না), Windows-এ sign in করা, TallyPrime খোলা ও সব কোম্পানি load করা। শিডিউল করা job এই window ছাড়াই চলে। load না থাকা কোম্পানি বাদ যায় ও জানানো হয়, অন্য কোম্পানি দিয়ে কখনো বদলানো হয় না।"),
    "al.sync_note": ("The bar shows a percentage only when the amount of work is known; otherwise it keeps moving. Stop finishes the current batch; run again and it continues from the saved point. One job at a time.",
                     "কাজের পরিমাণ জানা থাকলেই শতাংশ দেখায়; নইলে বার চলতেই থাকে। Stop দিলে বর্তমান batch শেষ হয়; আবার চালালে সেভ করা জায়গা থেকে চলে। একবারে একটাই job।"),
    "al.no_login": ("Save the database login on the Connections page first.", "আগে Connections পেজে database login সেভ করুন।"),
    "al.config_missing": ("config.json was not found or is unreadable. Fill the Connections page and press Save settings.", "config.json পাওয়া যায়নি বা পড়া যাচ্ছে না। Connections পূরণ করে Save settings চাপুন।"),
    "al.unsaved": ("You changed companies or dates. Press Save settings to keep the changes.", "কোম্পানি বা তারিখ বদলেছে। রাখতে Save settings চাপুন।"),
    "al.busy": ("Another sync (the scheduled task or another window) is running right now.", "অন্য একটি সিঙ্ক (শিডিউল বা অন্য window) এখন চলছে।"),
    "al.demo": ("Status values are shown only after a real check. Nothing here is estimated.", "অবস্থা শুধু আসল পরীক্ষার পরই দেখানো হয়। এখানে কিছুই আন্দাজে নয়।"),
    # toasts
    "t.saved": ("Settings saved ({0} companies).", "সেটিংস সেভ হয়েছে ({0}টি কোম্পানি)।"), "t.login_ok": ("Database login verified and saved.", "Database login যাচাই হয়ে সেভ হয়েছে।"),
    "t.login_fail": ("Login failed: {0}", "Login ব্যর্থ: {0}"), "t.tally_ok": ("Tally answers on {0}.", "Tally সাড়া দিচ্ছে ({0})।"),
    "t.tally_bad": ("Tally is not answering. Open TallyPrime and load the companies.", "Tally সাড়া দিচ্ছে না। TallyPrime খুলে কোম্পানি load করুন।"),
    "t.detected": ("{0} companies found in Tally.", "Tally-তে {0}টি কোম্পানি পাওয়া গেছে।"), "t.read_ok": ("{0}: read OK ({1})", "{0}: পড়া সফল ({1})"),
    "t.read_bad": ("{0}: {1}", "{0}: {1}"), "t.job_started": ("{0} started.", "{0} শুরু হয়েছে।"), "t.job_done": ("Sync finished.", "সিঙ্ক শেষ হয়েছে।"),
    "t.job_prob": ("Sync finished with problems. Check Activity & Logs.", "সিঙ্ক শেষ হয়েছে কিছু সমস্যাসহ। কার্যকলাপ ও লগ দেখুন।"),
    "t.stop_req": ("Stop requested. Progress is kept.", "থামানোর অনুরোধ হয়েছে। অগ্রগতি সংরক্ষিত।"),
    "t.sched_ok": ("Nightly schedule installed.", "রাতের শিডিউল বসানো হয়েছে।"), "t.sched_bad": ("Schedule failed: {0}", "শিডিউল বসেনি: {0}"),
    "t.sched_rm": ("Schedule removed.", "শিডিউল সরানো হয়েছে।"), "t.exported": ("Exported to {0}", "{0}-এ এক্সপোর্ট হয়েছে"),
    "t.copied": ("Copied.", "কপি হয়েছে।"), "t.no_co": ("Tick at least one company.", "অন্তত একটি কোম্পানি টিক দিন।"),
    "t.bad_date": ("'{0}' is not a valid date (use YYYY-MM-DD).", "'{0}' সঠিক তারিখ নয় (YYYY-MM-DD লিখুন)।"),
    "t.restored": ("Configuration restored. Save the login again on a new PC or Windows user.", "কনফিগারেশন রিস্টোর হয়েছে। নতুন PC বা Windows user হলে login আবার সেভ করুন।"),
    "t.backed": ("Configuration backed up (no password inside).", "কনফিগারেশন ব্যাকআপ হয়েছে (পাসওয়ার্ড নেই)।"),
    "t.err": ("Something went wrong: {0}", "কিছু একটা ভুল হয়েছে: {0}"),
    # tour
    "tour.1.t": ("Welcome to NABIAD DATA BRIDGE", "NABIAD DATA BRIDGE-এ স্বাগতম"),
    "tour.1.b": ("This app copies your TallyPrime vouchers and ledgers into the cloud, read-only. Nothing is ever written to Tally. This 1-minute tour shows where things are.",
                 "এই অ্যাপ আপনার TallyPrime-এর voucher ও ledger ক্লাউডে কপি করে, শুধু পড়ার মাধ্যমে। Tally-তে কখনো কিছু লেখা হয় না। এই ১ মিনিটের ট্যুরে সবকিছু কোথায় দেখানো হবে।"),
    "tour.2.t": ("Navigation", "নেভিগেশন"), "tour.2.b": ("Use the sidebar to move between pages. Shortcuts: Ctrl+1 … Ctrl+9, and F1 for help.", "পেজ বদলাতে sidebar ব্যবহার করুন। শর্টকাট: Ctrl+1 … Ctrl+9, সাহায্যের জন্য F1।"),
    "tour.3.t": ("Live status", "লাইভ অবস্থা"), "tour.3.b": ("These cards turn green only after a real check. Press Test connections to verify Tally and the database.", "এই কার্ডগুলো আসল পরীক্ষার পরই সবুজ হয়। Tally ও database যাচাই করতে Test connections চাপুন।"),
    "tour.4.t": ("Connections", "সংযোগ"), "tour.4.b": ("Enter the database login once. The password is stored encrypted for this Windows user only.", "database login একবার দিন। পাসওয়ার্ড শুধু এই Windows user-এর জন্য encrypt হয়ে থাকে।"),
    "tour.5.t": ("Companies", "কোম্পানি"), "tour.5.b": ("Tick the companies to copy and set each start date. Detect finds the companies loaded in Tally.", "কোন কোম্পানি কপি হবে টিক দিন ও শুরুর তারিখ ঠিক করুন। Detect Tally-তে load করা কোম্পানি খুঁজে দেয়।"),
    "tour.6.t": ("Sync Center", "সিঙ্ক সেন্টার"), "tour.6.b": ("Test reading uploads nothing. Full history load can take hours and can be stopped and continued without duplicates.", "Test reading কিছু আপলোড করে না। পুরো ইতিহাস লোডে কয়েক ঘণ্টা লাগতে পারে; থামিয়ে আবার চালালে duplicate ছাড়াই চলতে থাকে।"),
    "tour.7.t": ("Nightly schedule", "রাতের শিডিউল"), "tour.7.b": ("Install the schedule once. It runs without this window. Keep the PC on or asleep and TallyPrime open with all companies loaded.", "শিডিউল একবার বসান। এটি এই window ছাড়াই চলে। PC চালু বা sleep-এ রাখুন, TallyPrime খোলা ও সব কোম্পানি load করা রাখুন।"),
    "tour.8.t": ("You are ready", "আপনি প্রস্তুত"), "tour.8.b": ("Open Help & Guide any time (F1) for troubleshooting. You can replay this tour from Settings.", "সমস্যা হলে যেকোনো সময় Help & Guide (F1) খুলুন। ট্যুর Settings থেকে আবার দেখা যাবে।"),
    "tour.step": ("Step {0} of {1}", "ধাপ {0} / {1}"),
}

HELP = [  # (title EN, title BN, body EN, body BN)
    ("First-time setup (5 steps)", "প্রথমবার সেটআপ (৫ ধাপ)",
     "1. Open TallyPrime and load every company.\n2. Connections: enter the Supabase URL/key, then the bridge login → Test login and save.\n3. Company Manager: Detect companies, set start dates → Test reading → Save settings.\n4. Sync Center: Run full history load (first time only).\n5. Scheduler: Install schedule (00:30–06:00).",
     "১. TallyPrime খুলে সব কোম্পানি load করুন।\n২. Connections: Supabase URL/key দিন, তারপর bridge login → Test login and save।\n৩. Company Manager: Detect companies চাপুন, শুরুর তারিখ ঠিক করুন → Test reading → Save settings।\n৪. Sync Center: Run full history load (শুধু প্রথমবার)।\n৫. Scheduler: Install schedule (০০:৩০–০৬:০০)।"),
    ("Nightly sync: what must be true", "রাতের সিঙ্ক: কী কী ঠিক থাকতে হবে",
     "The PC must be on or asleep (not shut down). You must be signed in to Windows. TallyPrime must be open with all companies loaded (Tally does not reload companies by itself after a restart). If a company is not loaded it is skipped and reported; another company is never read in its place.",
     "PC চালু বা sleep-এ থাকতে হবে (shutdown নয়)। Windows-এ sign in করা থাকতে হবে। TallyPrime খোলা ও সব কোম্পানি load করা থাকতে হবে (restart-এর পর Tally নিজে কোম্পানি load করে না)। কোনো কোম্পানি load না থাকলে সেটি বাদ যায় ও জানানো হয়; তার বদলে অন্য কোম্পানি কখনো পড়া হয় না।"),
    ("Tally is not answering", "Tally সাড়া দিচ্ছে না",
     "Open TallyPrime. Press F1 → Settings → Connectivity and make sure the Tally server is enabled on port 9000. Then press Check Tally on the Connections page.",
     "TallyPrime খুলুন। F1 → Settings → Connectivity-তে Tally server চালু ও port 9000 আছে কিনা দেখুন। তারপর Connections পেজে Check Tally চাপুন।"),
    ("A company shows 'Not loaded'", "কোম্পানি 'Not loaded' দেখাচ্ছে",
     "Load that company in TallyPrime (Select Company). The name must match exactly as Tally shows it. Use Detect companies to copy the exact names.",
     "TallyPrime-এ ওই কোম্পানি load করুন (Select Company)। নাম Tally-তে যেমন দেখায় হুবহু তেমন হতে হবে। Detect companies দিয়ে হুবহু নাম আনুন।"),
    ("Login failed", "Login ব্যর্থ",
     "Check the email and password of the bridge user. The Supabase URL and public key must be filled. If the PC has no internet the login cannot be tested.",
     "bridge user-এর ইমেইল ও পাসওয়ার্ড দেখুন। Supabase URL ও public key ফাঁকা রাখা যাবে না। PC-তে ইন্টারনেট না থাকলে login পরীক্ষা হয় না।"),
    ("Full load interrupted: is it safe?", "পুরো লোড মাঝপথে থামলে নিরাপদ কি?",
     "Yes. Progress is saved after every batch and each voucher is stored once (matched by its Tally ID), so running again continues without duplicates or gaps.",
     "হ্যাঁ। প্রতিটি batch-এর পর অগ্রগতি সেভ হয় এবং প্রতিটি voucher একবারই থাকে (Tally ID দিয়ে মেলানো), তাই আবার চালালে duplicate বা ফাঁক ছাড়াই চলতে থাকে।"),
    ("Is anything written to Tally?", "Tally-তে কিছু লেখা হয় কি?",
     "No. The app only sends standard read requests (Day Book, ledger list). It never creates, changes or deletes anything in Tally. Records Tally no longer returns are only marked as deleted in the cloud copy, never removed.",
     "না। অ্যাপ শুধু standard পড়ার request পাঠায় (Day Book, ledger list)। Tally-তে কিছু তৈরি, বদল বা মোছা হয় না। Tally আর যে record ফেরত দেয় না, ক্লাউডের কপিতে সেটি শুধু 'deleted' চিহ্নিত হয়, মুছে ফেলা হয় না।"),
    ("Files and logs", "ফাইল ও লগ",
     "config.json (settings, no password) · bridge_secret.json (encrypted login, this Windows user only) · bridge_state.json (progress) · nightly_log.txt (job log) · app_error_log.txt (app errors).",
     "config.json (সেটিংস, পাসওয়ার্ড নেই) · bridge_secret.json (encrypt করা login, শুধু এই Windows user) · bridge_state.json (অগ্রগতি) · nightly_log.txt (job লগ) · app_error_log.txt (অ্যাপের ত্রুটি)।"),
]


# ------------------------------------------------------------------ widgets
def rgba(hex_, a):
    h = hex_.lstrip("#"); return f"rgba({int(h[0:2], 16)},{int(h[2:4], 16)},{int(h[4:6], 16)},{a})"


KIND_COLOR = dict(success="green", info="sky", warn="amber", error="red")
KIND_ICON = dict(success="✓", info="i", warn="!", error="✕")


class Pill(QLabel):
    """Status pill: coloured dot + text. Colour is never the only signal (the text says the state)."""
    def __init__(self, text="", kind="info", p=DARK):
        super().__init__()
        self.set(text, kind, p)

    def set(self, text, kind, p):
        c = p[KIND_COLOR.get(kind, "sky")]
        self.setText(f"●  {text}")
        self.setStyleSheet(f"color:{c}; background:{rgba(c, .13)}; border:1px solid {rgba(c, .4)}; border-radius:11px; padding:3px 10px; font-size:{FS['label']}px; font-weight:600;")


class Alert(QFrame):
    """Inline alert: stays in the page, with an icon, text and optional dismiss."""
    def __init__(self, kind="info", text="", p=DARK, dismissible=False):
        super().__init__()
        self.setObjectName("alert")
        self.lay = QHBoxLayout(self); self.lay.setContentsMargins(12, 10, 12, 10); self.lay.setSpacing(10)
        self.ic = QLabel(); self.ic.setFixedWidth(22); self.ic.setAlignment(Qt.AlignCenter)
        self.tx = QLabel(); self.tx.setWordWrap(True); self.tx.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self.lay.addWidget(self.ic, 0, Qt.AlignTop); self.lay.addWidget(self.tx, 1)
        self.x = None
        if dismissible:
            self.x = QPushButton("✕"); self.x.setObjectName("ghost"); self.x.setFixedSize(26, 26); self.x.clicked.connect(self.hide)
            self.x.setAccessibleName("Dismiss"); self.lay.addWidget(self.x, 0, Qt.AlignTop)
        self.set(kind, text, p)

    def set(self, kind, text, p=None):
        p = p or getattr(self, "_p", DARK); self._p = p; self._kind = kind
        c = p[KIND_COLOR[kind]]
        self.setStyleSheet(f"QFrame#alert {{ background:{rgba(c, .10)}; border:1px solid {rgba(c, .4)}; border-left:4px solid {c}; border-radius:10px; }}")
        self.ic.setText(KIND_ICON[kind]); self.ic.setStyleSheet(f"color:{c}; font-weight:800; font-size:14px; border:0; background:transparent;")
        self.tx.setText(text); self.tx.setStyleSheet(f"color:{p['ink']}; border:0; background:transparent;")
        self.setVisible(bool(text))

    def retheme(self, p):
        self.set(self._kind, self.tx.text(), p)


class Toast(QFrame):
    closed = Signal(object)

    def __init__(self, parent, kind, text, p, ms):
        super().__init__(parent)
        c = p[KIND_COLOR[kind]]
        self.setObjectName("toast"); self.setFixedWidth(360)
        self.setStyleSheet(f"QFrame#toast {{ background:{p['card']}; border:1px solid {p['line']}; border-left:4px solid {c}; border-radius:10px; }}")
        l = QHBoxLayout(self); l.setContentsMargins(12, 10, 8, 10); l.setSpacing(10)
        ic = QLabel(KIND_ICON[kind]); ic.setStyleSheet(f"color:{c}; font-weight:800; font-size:15px; border:0; background:transparent;"); ic.setFixedWidth(18)
        tx = QLabel(text); tx.setWordWrap(True); tx.setStyleSheet(f"color:{p['ink']}; border:0; background:transparent;")
        x = QPushButton("✕"); x.setObjectName("ghost"); x.setFixedSize(24, 24); x.clicked.connect(self.dismiss); x.setAccessibleName("Dismiss")
        l.addWidget(ic, 0, Qt.AlignTop); l.addWidget(tx, 1); l.addWidget(x, 0, Qt.AlignTop)
        sh = QGraphicsDropShadowEffect(self); sh.setBlurRadius(24); sh.setOffset(0, 6); sh.setColor(QColor(0, 0, 0, 120)); self.setGraphicsEffect(sh)
        self.adjustSize()
        self.timer = QTimer(self); self.timer.setSingleShot(True); self.timer.timeout.connect(self.dismiss); self.timer.start(ms)
        self.setAccessibleName(text); self._gone = False

    def dismiss(self):
        if self._gone:
            return
        self._gone = True
        self.closed.emit(self); self.hide(); self.deleteLater()


class ToastHost:
    """Stacks toasts bottom-right of a parent widget. Max 4 visible; identical repeats collapse."""
    def __init__(self, parent):
        self.parent, self.items, self.p = parent, [], DARK

    def show(self, text, kind="info", ms=None):
        ms = ms or {"error": 8000, "warn": 6000}.get(kind, 3500)
        if any(getattr(t, "_text", None) == (kind, text) for t in self.items):
            return
        tt = Toast(self.parent, kind, text, self.p, ms); tt._text = (kind, text)
        tt.closed.connect(lambda x: (self.items.remove(x) if x in self.items else None, self.layout()))
        self.items.append(tt)
        while len(self.items) > 4:
            self.items[0].dismiss()
        tt.show(); tt.raise_(); self.layout()

    def layout(self):
        y = self.parent.height() - 16
        for tt in reversed(self.items):
            tt.adjustSize(); y -= tt.height()
            tt.move(self.parent.width() - tt.width() - 16, y); y -= 10
            tt.raise_()


class Accordion(QFrame):
    """Collapsible section (disclosure). Header is a real button: keyboard focusable, aria-like expanded state in the name."""
    def __init__(self, title, body, p=DARK, open_=False):
        super().__init__()
        self.setObjectName("acc")
        v = QVBoxLayout(self); v.setContentsMargins(0, 0, 0, 0); v.setSpacing(0)
        self.title = title
        self.head = QPushButton(); self.head.setObjectName("acchead"); self.head.setCursor(Qt.PointingHandCursor); self.head.clicked.connect(self.toggle)
        self.body = QLabel(body); self.body.setWordWrap(True); self.body.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self.body.setContentsMargins(16, 0, 16, 14); self.body.setStyleSheet("border:0; background:transparent; line-height:150%;")
        self.wrap = QWidget(); wl = QVBoxLayout(self.wrap); wl.setContentsMargins(0, 0, 0, 0); wl.addWidget(self.body)
        self.wrap.setMaximumHeight(0)
        v.addWidget(self.head); v.addWidget(self.wrap)
        self.anim = QPropertyAnimation(self.wrap, b"maximumHeight", self); self.anim.setDuration(180); self.anim.setEasingCurve(QEasingCurve.OutCubic)
        self.open = False
        self._refresh()
        if open_:
            self.toggle(animate=False)

    def _refresh(self):
        self.head.setText(("▾  " if self.open else "▸  ") + self.title)
        self.head.setAccessibleName(self.title + (" expanded" if self.open else " collapsed"))

    def toggle(self, animate=True):
        self.open = not self.open
        end = 0
        if self.open:
            w = max(300, (self.width() if self.width() > 120 else 700) - 32)
            end = self.body.heightForWidth(w) + 24
        self.anim.stop()
        self._fin = getattr(self, "_fin", None)
        if self._fin is not None:
            try:
                self.anim.finished.disconnect(self._fin)
            except (RuntimeError, TypeError):
                pass
            self._fin = None
        if animate:
            self.anim.setStartValue(self.wrap.maximumHeight()); self.anim.setEndValue(end)
            if self.open:  # let the text grow freely after opening (window resize, language change)
                self._fin = lambda: self.wrap.setMaximumHeight(16777215)
                self.anim.finished.connect(self._fin)
            self.anim.start()
        else:
            self.wrap.setMaximumHeight(16777215 if self.open else 0)
        self._refresh()


class Tour(QWidget):
    """Product tour: dims the window, cuts a spotlight around the target and shows a coach-mark card."""
    finished = Signal(bool)

    def __init__(self, host, steps, p):
        super().__init__(host)
        self.host_w, self.steps, self.p, self.i = host, steps, p, 0
        self.setAttribute(Qt.WA_StyledBackground, False)
        self.setFocusPolicy(Qt.StrongFocus)
        self.card = QFrame(self); self.card.setObjectName("coach"); self.card.setFixedWidth(340)
        cl = QVBoxLayout(self.card); cl.setContentsMargins(16, 14, 16, 12); cl.setSpacing(8)
        self.k_step = QLabel(); self.k_step.setObjectName("caption")
        self.k_title = QLabel(); self.k_title.setObjectName("h2"); self.k_title.setWordWrap(True)
        self.k_body = QLabel(); self.k_body.setWordWrap(True)
        row = QHBoxLayout(); row.setSpacing(8)
        self.b_skip = QPushButton(); self.b_skip.setObjectName("ghost"); self.b_skip.clicked.connect(lambda: self.end(False))
        self.b_back = QPushButton(); self.b_back.clicked.connect(self.back)
        self.b_next = QPushButton(); self.b_next.setObjectName("primary"); self.b_next.clicked.connect(self.next)
        row.addWidget(self.b_skip); row.addStretch(); row.addWidget(self.b_back); row.addWidget(self.b_next)
        for w in (self.k_step, self.k_title, self.k_body):
            cl.addWidget(w)
        cl.addLayout(row)
        self.hole = QRect()
        self.hide()

    def start(self):
        self.setGeometry(self.host_w.rect()); self.raise_(); self.show(); self.setFocus(); self.i = 0; self.show_step()

    def retheme(self, p):
        self.p = p

    def show_step(self):
        from_t = lambda k: t(k)
        s = self.steps[self.i]
        if s.get("before"):
            s["before"]()
        QTimer.singleShot(60, self._place)
        n = len(self.steps)
        self.k_step.setText(t("tour.step", self.i + 1, n)); self.k_title.setText(t(s["key"] + ".t")); self.k_body.setText(t(s["key"] + ".b"))
        self.b_skip.setText(t("b.skip")); self.b_back.setText(t("b.back")); self.b_back.setVisible(self.i > 0)
        self.b_next.setText(t("b.done") if self.i == n - 1 else t("b.next"))
        c = self.p
        self.card.setStyleSheet(f"QFrame#coach {{ background:{c['card']}; border:1px solid {c['sky']}; border-radius:12px; }}")
        self.card.adjustSize()

    def _place(self):
        s = self.steps[self.i]
        w = s["target"]() if s.get("target") else None
        self.setGeometry(self.host_w.rect())
        if w is not None and w.isVisible():
            tl = w.mapTo(self.host_w, QPoint(0, 0))
            self.hole = QRect(tl, w.size()).adjusted(-6, -6, 6, 6)
        else:
            self.hole = QRect()
        self.card.adjustSize()
        W, H, cw, ch = self.width(), self.height(), self.card.width(), self.card.height()
        if self.hole.isNull():
            x, y = (W - cw) // 2, (H - ch) // 2
        else:
            x = min(max(16, self.hole.center().x() - cw // 2), W - cw - 16)
            y = self.hole.bottom() + 14
            if y + ch > H - 16:
                y = self.hole.top() - ch - 14
            if y < 16:  # no room above or below: put it beside the target
                x = self.hole.right() + 14 if self.hole.right() + 14 + cw < W else max(16, self.hole.left() - cw - 14)
                y = min(max(16, self.hole.top()), H - ch - 16)
        self.card.move(x, y); self.card.raise_(); self.update()

    def paintEvent(self, _):
        pt = QPainter(self); pt.setRenderHint(QPainter.Antialiasing)
        path = QPainterPath(); path.addRect(QRectF(self.rect()))
        if not self.hole.isNull():
            hp = QPainterPath(); hp.addRoundedRect(QRectF(self.hole), 12, 12); path = path.subtracted(hp)
        col = QColor(self.p["scrim"]); col.setAlpha(165)
        pt.fillPath(path, col)
        if not self.hole.isNull():
            pt.setPen(QPen(QColor(self.p["sky"]), 2)); pt.setBrush(Qt.NoBrush); pt.drawRoundedRect(QRectF(self.hole), 12, 12)

    def next(self):
        if self.i >= len(self.steps) - 1:
            self.end(True)
        else:
            self.i += 1; self.show_step()

    def back(self):
        if self.i > 0:
            self.i -= 1; self.show_step()

    def end(self, completed):
        self.hide(); self.finished.emit(completed)

    def keyPressEvent(self, e):
        if e.key() in (Qt.Key_Right, Qt.Key_Return, Qt.Key_Enter, Qt.Key_Space):
            self.next()
        elif e.key() == Qt.Key_Left:
            self.back()
        elif e.key() == Qt.Key_Escape:
            self.end(False)

    def resizeEvent(self, e):
        if self.isVisible():
            self._place()
