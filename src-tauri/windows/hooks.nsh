; Replaces the old Electron build (0.3.2 and earlier): it lives in its own folder and would stay installed next to this one.
; Runs before any file or shortcut is written, because the old uninstaller also removes the GoodbyeAPP shortcuts.
; App data (%APPDATA%\GoodbyeAPP: history, registry backups) is kept; this build reads the same folder.
; _?= keeps the uninstaller in place so ExecWait waits for it; its own exe is left behind, hence the RMDir.
!macro NSIS_HOOK_PREINSTALL
  Push $0
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\dd944b88-9241-508c-bfcf-c85fb1ee9466" "UninstallString"
  StrCmp $0 "" goodbyeapp_no_electron
    ExecWait '$0 /S _?=$LOCALAPPDATA\Programs\goodbyeapp'
    RMDir /r "$LOCALAPPDATA\Programs\goodbyeapp"
  goodbyeapp_no_electron:
  Pop $0
!macroend
