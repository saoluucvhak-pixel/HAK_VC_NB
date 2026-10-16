; Bộ cài DGVC — Đơn giá vận chuyển dăm (HAK Group)
; MỘT bộ cài dùng cho MỌI nhà máy (HAK, HAKQN, ĐH, CNHAK …): đơn vị của máy chọn ở lần mở đầu tiên.
; Cài cho người dùng hiện tại (không cần quyền quản trị). Gỡ cài KHÔNG xóa thư mục dữ liệu (Documents\DGVC_DATA).
; Dựng: makensis installer/dgvc.nsi   (sau khi có dist/win-unpacked từ electron-builder --win dir)
Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"

!define APPNAME "Đơn giá vận chuyển dăm"
!define APPKEY  "DGVC"
!define VERSION "1.2.5"
!define SRC     "..\dist\win-unpacked"

Name "${APPNAME}"
OutFile "..\dist\DGVC-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\DGVC"
InstallDirRegKey HKCU "Software\${APPKEY}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "HAK Group · DGVC ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1066 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=1066 "CompanyName" "HAK Group"
VIAddVersionKey /LANG=1066 "FileDescription" "Bộ cài ${APPNAME}"
VIAddVersionKey /LANG=1066 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1066 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1066 "LegalCopyright" "HAK Group"

!define MUI_ICON "..\build\icon.ico"
!define MUI_UNICON "..\build\icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Cài đặt ${APPNAME}"
!define MUI_WELCOMEPAGE_TEXT "Phần mềm tính đơn giá vận chuyển dăm, bảng xác nhận khối lượng, diễn giải hóa đơn — thay cho Excel + Power Query.$\r$\n$\r$\nBộ cài dùng chung cho mọi nhà máy của HAK Group. Lần đầu mở phần mềm sẽ chọn đơn vị của máy này và thư mục dữ liệu (mặc định Documents\DGVC_DATA).$\r$\n$\r$\nChạy không cần Internet."
!define MUI_FINISHPAGE_RUN "$INSTDIR\DGVC.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Mở phần mềm ngay"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Vietnamese"

Function .onInit
  ; phần mềm đang chạy → nhắc đóng trước (tránh ghi đè file đang dùng)
  FindWindow $0 "" "${APPNAME}"
  StrCmp $0 0 +3
    MessageBox MB_OK|MB_ICONEXCLAMATION "Phần mềm đang mở. Hãy đóng phần mềm rồi chạy lại bộ cài."
    Abort
FunctionEnd

Section "Cài đặt" SecMain
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\resources"
  File /r "${SRC}\*.*"
  File "/oname=dgvc.ico" "..\build\icon.ico"
  WriteUninstaller "$INSTDIR\Go-cai-dat.exe"
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\DGVC.exe" "" "$INSTDIR\dgvc.ico" 0
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Gỡ cài đặt.lnk" "$INSTDIR\Go-cai-dat.exe" "" "$INSTDIR\dgvc.ico" 0
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\DGVC.exe" "" "$INSTDIR\dgvc.ico" 0
  WriteRegStr HKCU "Software\${APPKEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\${APPKEY}" "Version" "${VERSION}"
  !define UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPKEY}"
  WriteRegStr HKCU "${UNINST}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINST}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST}" "Publisher" "HAK Group"
  WriteRegStr HKCU "${UNINST}" "DisplayIcon" "$INSTDIR\dgvc.ico"
  WriteRegStr HKCU "${UNINST}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST}" "UninstallString" '"$INSTDIR\Go-cai-dat.exe"'
  WriteRegDWORD HKCU "${UNINST}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "${UNINST}" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPKEY}"
  DeleteRegKey HKCU "Software\${APPKEY}"
  MessageBox MB_OK|MB_ICONINFORMATION "Đã gỡ phần mềm.$\r$\n$\r$\nThư mục DỮ LIỆU (mặc định Documents\DGVC_DATA) và các bản sao lưu vẫn được giữ nguyên — cài lại rồi chọn $\"Dùng thư mục dữ liệu có sẵn$\" để dùng tiếp."
SectionEnd
