; Inno Setup 6 script. Per-user install (no admin rights): the app writes config.json, logs and progress next to the exe,
; and the saved login is encrypted for this Windows user only (DPAPI), so a per-user folder is the right place.
; Build:  iscc /DAppVersion=1.0.0 packaging\NabiadDataBridge.iss   (after pyinstaller has produced dist\NabiadDataBridge)
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
[Setup]
AppId={{6B1F2D1A-9E64-4C61-8C35-5B6A0E1C7A11}
AppName=NABIAD DATA BRIDGE
AppVersion={#AppVersion}
AppPublisher=NABIAD
DefaultDirName={localappdata}\Programs\NABIAD DATA BRIDGE
DefaultGroupName=NABIAD DATA BRIDGE
PrivilegesRequired=lowest
OutputDir=..\installer-out
OutputBaseFilename=NabiadDataBridge-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\NabiadDataBridge.exe
ArchitecturesInstallIn64BitMode=x64compatible
[Files]
Source: "..\dist\NabiadDataBridge\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion createallsubdirs
[Icons]
Name: "{autoprograms}\NABIAD DATA BRIDGE"; Filename: "{app}\NabiadDataBridge.exe"
Name: "{autodesktop}\NABIAD DATA BRIDGE"; Filename: "{app}\NabiadDataBridge.exe"; Tasks: desktopicon
[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked
[Run]
Filename: "{app}\NabiadDataBridge.exe"; Description: "Start NABIAD DATA BRIDGE"; Flags: nowait postinstall skipifsilent
[UninstallRun]
; remove the nightly task so it does not point to a deleted program
Filename: "schtasks.exe"; Parameters: "/Delete /TN NabiadBridgeNightly /F"; Flags: runhidden; RunOnceId: "RemoveNightlyTask"
; config.json, bridge_state.json, logs and the encrypted login are left in place on purpose (delete the folder to remove them).
