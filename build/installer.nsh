!macro customInstall
  CreateDirectory "$INSTDIR\data"
  ExecWait 'icacls "$INSTDIR\data" /grant "*S-1-5-32-545:(OI)(CI)F" /T'
!macroend
