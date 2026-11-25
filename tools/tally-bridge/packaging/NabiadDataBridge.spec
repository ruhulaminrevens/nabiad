# PyInstaller spec: one folder build (onedir) so config.json, logs and bridge_state.json live next to the exe.
# Build from tools/tally-bridge:  pyinstaller packaging/NabiadDataBridge.spec --noconfirm
import os
here = os.path.abspath(os.path.join(SPECPATH, ".."))
icon = os.path.join(SPECPATH, "icon.ico")

a = Analysis(
    [os.path.join(here, "nabiad_bridge_app.pyw")],
    pathex=[here],
    datas=[(os.path.join(here, "config.example.json"), ".")],
    hiddenimports=["bridge", "nightly_sync", "ui_kit"],
    excludes=["tkinter", "unittest", "PySide6.QtWebEngineCore", "PySide6.QtWebEngineWidgets", "PySide6.Qt3DCore", "PySide6.QtQml",
              "PySide6.QtQuick", "PySide6.QtMultimedia", "PySide6.QtCharts", "PySide6.QtDataVisualization", "PySide6.QtPdf"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="NabiadDataBridge", console=False,  # windowed: no black console window
          icon=icon if os.path.exists(icon) else None, version=None)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="NabiadDataBridge")
