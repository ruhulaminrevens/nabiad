"""Draws the app icon (same N logo as the window) into packaging/icon.ico. Needs PySide6. Run from tools/tally-bridge."""
import os, sys
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
from PySide6.QtGui import QGuiApplication
app = QGuiApplication([])
import importlib.machinery, importlib.util
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, here)
loader = importlib.machinery.SourceFileLoader("appmod", os.path.join(here, "nabiad_bridge_app.pyw"))
spec = importlib.util.spec_from_loader("appmod", loader); mod = importlib.util.module_from_spec(spec); loader.exec_module(mod)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icon.ico")
ok = mod.logo_pixmap(256).toImage().save(out)
print("icon written" if ok else "icon NOT written", out)
sys.exit(0 if ok else 1)
