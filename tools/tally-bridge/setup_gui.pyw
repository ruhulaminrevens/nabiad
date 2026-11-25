"""Nabiad Bridge setup window. Double-click setup.bat (or this file). Works on a fresh Windows PC with Python installed.

Steps: 1 find the companies loaded in Tally, 2 save the database login (encrypted for this Windows user only),
3 test reading each company (nothing is uploaded), 4 save settings, 5 first full history load, 6 nightly schedule.
Everything read from Tally is read-only; this window never writes to Tally."""
import os, queue, subprocess, sys, threading
import tkinter as tk
from tkinter import messagebox, ttk

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nightly_sync as ns  # noqa: E402

PAD = {"padx": 8, "pady": 3}


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Nabiad Bridge setup (Tally to Supabase)")
        self.geometry("860x900")
        self.q = queue.Queue()
        self.rows = {}  # company -> (BooleanVar, StringVar start date)
        self._build()
        self._prefill()
        self.after(150, self._pump)

    # ------------------------------------------------------------ layout
    def _build(self):
        outer = ttk.Frame(self)
        outer.pack(fill="both", expand=True)
        top = ttk.Frame(outer)
        top.pack(fill="x")

        f = ttk.LabelFrame(top, text="1. Tally")
        f.pack(fill="x", **PAD)
        self.url = tk.StringVar(value="http://localhost:9000")
        ttk.Label(f, text="Tally address").grid(row=0, column=0, sticky="w", **PAD)
        ttk.Entry(f, textvariable=self.url, width=28).grid(row=0, column=1, sticky="w", **PAD)
        ttk.Button(f, text="Check Tally", command=lambda: self._bg(self.check_tally)).grid(row=0, column=2, **PAD)
        ttk.Button(f, text="Find companies loaded in Tally", command=lambda: self._bg(self.find_companies)).grid(row=0, column=3, **PAD)
        ttk.Label(f, text="Open TallyPrime first and load every company you want. Tick the ones to copy; "
                          "the date is where each company's history starts.", wraplength=800).grid(row=1, column=0, columnspan=4, sticky="w", **PAD)
        self.list_frame = ttk.Frame(f)
        self.list_frame.grid(row=2, column=0, columnspan=4, sticky="we", **PAD)
        add = ttk.Frame(f)
        add.grid(row=3, column=0, columnspan=4, sticky="w", **PAD)
        self.manual = tk.StringVar()
        ttk.Label(add, text="Add a company by exact name:").pack(side="left")
        ttk.Entry(add, textvariable=self.manual, width=34).pack(side="left", padx=6)
        ttk.Button(add, text="Add", command=self.add_manual).pack(side="left")

        f = ttk.LabelFrame(top, text="2. Database login (saved encrypted for this Windows user only)")
        f.pack(fill="x", **PAD)
        self.sb_url, self.sb_key = tk.StringVar(), tk.StringVar()
        self.email, self.pw = tk.StringVar(), tk.StringVar()
        for r, (lbl, var, show) in enumerate([("Supabase URL", self.sb_url, ""), ("Supabase public (anon) key", self.sb_key, ""),
                                              ("Bridge login email", self.email, ""), ("Bridge login password", self.pw, "*")]):
            ttk.Label(f, text=lbl).grid(row=r, column=0, sticky="w", **PAD)
            ttk.Entry(f, textvariable=var, width=70, show=show).grid(row=r, column=1, sticky="w", **PAD)
        ttk.Button(f, text="Test login and save", command=lambda: self._bg(self.save_login)).grid(row=4, column=1, sticky="w", **PAD)
        self.login_state = ttk.Label(f, text="")
        self.login_state.grid(row=4, column=1, sticky="e", **PAD)

        f = ttk.LabelFrame(top, text="3. Test (reads the last 3 days of each ticked company, uploads nothing)")
        f.pack(fill="x", **PAD)
        ttk.Button(f, text="Test reading by company name", command=lambda: self._bg(self.test_read)).pack(side="left", **PAD)
        ttk.Button(f, text="4. Save settings (config.json)", command=self.save_settings).pack(side="left", **PAD)

        f = ttk.LabelFrame(top, text="5. First full history load (new PC or new company)")
        f.pack(fill="x", **PAD)
        ttk.Label(f, text="Copies the whole history (from each start date). Takes hours; it opens its own window, "
                          "you can stop and start it again, it continues.", wraplength=620).pack(side="left", **PAD)
        ttk.Button(f, text="Start full load", command=self.start_backfill).pack(side="right", **PAD)

        f = ttk.LabelFrame(top, text="6. Nightly automatic copy (Windows Task Scheduler)")
        f.pack(fill="x", **PAD)
        self.t_start, self.t_end = tk.StringVar(value="00:30"), tk.StringVar(value="06:00")
        ttk.Label(f, text="Start").grid(row=0, column=0, **PAD)
        ttk.Entry(f, textvariable=self.t_start, width=7).grid(row=0, column=1, **PAD)
        ttk.Label(f, text="Stop by").grid(row=0, column=2, **PAD)
        ttk.Entry(f, textvariable=self.t_end, width=7).grid(row=0, column=3, **PAD)
        ttk.Button(f, text="Install schedule", command=lambda: self._bg(self.install)).grid(row=0, column=4, **PAD)
        ttk.Button(f, text="Check status", command=lambda: self._bg(self.status)).grid(row=0, column=5, **PAD)
        ttk.Button(f, text="Run now (test)", command=lambda: self._bg(self.run_now)).grid(row=0, column=6, **PAD)
        ttk.Button(f, text="Remove", command=lambda: self._bg(self.remove)).grid(row=0, column=7, **PAD)
        ttk.Label(f, text="The PC must be on or asleep (not shut down) at night, and TallyPrime must be open with the companies loaded.",
                  wraplength=800).grid(row=1, column=0, columnspan=8, sticky="w", **PAD)

        self.out = tk.Text(outer, height=14, wrap="word", state="disabled", bg="#111", fg="#ddd")
        self.out.pack(fill="both", expand=True, **PAD)

    # ------------------------------------------------------------ plumbing
    def say(self, msg):
        self.q.put(str(msg))

    def _pump(self):
        try:
            while True:
                msg = self.q.get_nowait()
                self.out.config(state="normal")
                self.out.insert("end", msg + "\n")
                self.out.see("end")
                self.out.config(state="disabled")
        except queue.Empty:
            pass
        self.after(150, self._pump)

    def _bg(self, fn):
        def run():
            try:
                fn()
            except SystemExit as e:
                self.say(f"STOP: {e}")
            except Exception as e:  # noqa
                self.say(f"ERROR: {type(e).__name__}: {e}")
        threading.Thread(target=run, daemon=True).start()

    def _prefill(self):
        try:
            cfg = ns.load_cfg()
        except Exception:
            cfg = {}
        self.url.set(cfg.get("tally_url", self.url.get()))
        self.sb_url.set(cfg.get("supabase_url", ""))
        self.sb_key.set(cfg.get("supabase_anon_key", ""))
        for c in cfg.get("companies", []):
            self._add_row(c, True, (cfg.get("company_start_dates") or {}).get(c, cfg.get("start_date", "2023-01-01")))
        try:
            if ns.have_secret():
                import json
                self.email.set(json.load(open(ns.SECRET, encoding="utf-8")).get("email", ""))
                self.login_state.config(text="login saved")
        except Exception:
            pass
        self.say("Ready. Work down the numbered steps. Nothing is written to Tally.")

    def _add_row(self, name, ticked=True, start="2023-01-01"):
        if name in self.rows:
            return
        v, s = tk.BooleanVar(value=ticked), tk.StringVar(value=start)
        r = len(self.rows)
        ttk.Checkbutton(self.list_frame, text=name, variable=v).grid(row=r, column=0, sticky="w")
        ttk.Entry(self.list_frame, textvariable=s, width=12).grid(row=r, column=1, padx=10)
        ttk.Label(self.list_frame, text="history starts (YYYY-MM-DD)").grid(row=r, column=2, sticky="w")
        self.rows[name] = (v, s)

    def ticked(self):
        return [c for c, (v, _s) in self.rows.items() if v.get()]

    def cfg_now(self):
        return {"tally_url": self.url.get().strip(), "supabase_url": self.sb_url.get().strip().rstrip("/"),
                "supabase_anon_key": self.sb_key.get().strip(), "intercompany_ledgers": {}, "pause_seconds": 0.4,
                "use_selected_company": [], "companies": self.ticked()}

    # ------------------------------------------------------------ actions
    def check_tally(self):
        ok = ns.port_open(self.url.get().strip())
        self.say("Tally answers on that address." if ok else
                 "Tally is NOT answering. Open TallyPrime, load the companies, and make sure F1 Help > Settings > Connectivity "
                 "has the Tally server enabled on port 9000.")

    def find_companies(self):
        import nightly_sync
        names = nightly_sync.list_companies(self.url.get().strip())
        if not names:
            self.say("Tally answered but listed no companies. Load companies in Tally, or add them by name below.")
            return
        self.say(f"Tally has {len(names)} companies loaded: " + ", ".join(names))
        self.after(0, lambda: [self._add_row(n, True) for n in names])

    def add_manual(self):
        n = self.manual.get().strip()
        if n:
            self._add_row(n, True)
            self.manual.set("")

    def save_login(self):
        cfg = self.cfg_now()
        if not (cfg["supabase_url"] and cfg["supabase_anon_key"] and self.email.get() and self.pw.get()):
            self.say("Fill the Supabase URL, key, email and password first.")
            return
        ok = ns.test_login(cfg, self.email.get().strip(), self.pw.get())
        if not ok:
            self.say("Login worked but the database did not answer as expected.")
            return
        ns.save_secret(self.email.get().strip(), self.pw.get())
        self.pw.set("")
        self.login_state.config(text="login saved")
        self.say("Login OK and saved (encrypted for this Windows user; the password is not in config.json).")

    def test_read(self):
        cfg = self.cfg_now()
        if not cfg["companies"]:
            self.say("Tick at least one company first.")
            return
        for c in cfg["companies"]:
            try:
                ok, msg = ns.test_company(cfg, c)
            except Exception as e:  # noqa
                ok, msg = False, f"{type(e).__name__}: {e}"
            self.say(f"{'OK  ' if ok else 'FAIL'} {c}: {msg}")

    def save_settings(self):
        cfg = self.cfg_now()
        if not cfg["companies"] or not cfg["supabase_url"] or not cfg["supabase_anon_key"]:
            messagebox.showwarning("Missing", "Tick companies and fill the Supabase URL and key first.")
            return
        starts = {c: s.get().strip() for c, (_v, s) in self.rows.items()}
        ns.write_config(cfg["companies"], starts, cfg["tally_url"], cfg["supabase_url"], cfg["supabase_anon_key"])
        self.say(f"Saved config.json with {len(cfg['companies'])} companies.")

    def start_backfill(self):
        if not ns.have_secret():
            messagebox.showwarning("Login", "Save the login in step 2 first.")
            return
        self.save_settings()
        flags = 0x00000010 if os.name == "nt" else 0  # CREATE_NEW_CONSOLE
        subprocess.Popen([sys.executable.replace("pythonw.exe", "python.exe"), os.path.join(HERE, "nightly_sync.py"), "--backfill"],
                         cwd=HERE, creationflags=flags)
        self.say("Full load started in its own window. You can close this setup window.")

    def install(self):
        ok, msg = ns.install_schedule(self.t_start.get().strip(), self.t_end.get().strip())
        self.say(("OK: " if ok else "FAILED: ") + msg)

    def status(self):
        s = ns.query_schedule()
        self.say(s if s else "No schedule installed.")
        if os.path.exists(ns.STATUS):
            self.say("Last run summary: " + open(ns.STATUS, encoding="utf-8").read().replace("\n", " ")[:600])

    def run_now(self):
        ok, msg = ns.run_schedule_now()
        self.say("Started the scheduled job now. Watch nightly_log.txt." if ok else f"Could not start it: {msg}")

    def remove(self):
        self.say("Schedule removed." if ns.remove_schedule() else "Nothing to remove.")


if __name__ == "__main__":
    App().mainloop()
