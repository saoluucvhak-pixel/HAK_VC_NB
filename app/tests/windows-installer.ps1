param(
  [Parameter(Mandatory=$true)][string]$Installer,
  [Parameter(Mandatory=$true)][string]$PreviousInstaller,
  [Parameter(Mandatory=$true)][string]$TestRoot,
  [switch]$Isolated
)
$ErrorActionPreference = 'Stop'
$Installer = (Resolve-Path -LiteralPath $Installer).Path
$PreviousInstaller = (Resolve-Path -LiteralPath $PreviousInstaller).Path
if ((Test-Path 'HKCU:\Software\DGVC') -and -not $Isolated) { throw 'Đã có bản DGVC của người dùng. Chạy nghiệm thu trên tài khoản hoặc máy Windows riêng.' }
if (Test-Path -LiteralPath $TestRoot) { throw 'Thư mục nghiệm thu phải mới để bảo toàn dữ liệu hiện có.' }
New-Item -ItemType Directory -Path $TestRoot | Out-Null
$TestRoot = (Resolve-Path -LiteralPath $TestRoot).Path
$installDir = Join-Path $TestRoot 'Cài đặt DGVC thử nghiệm'
$oldHome = $env:DGVC_TEST_HOME
$oldExe = $env:DGVC_EXECUTABLE
$oldConfirm = $env:DGVC_ACCEPTANCE_CONFIRM
$env:DGVC_ACCEPTANCE_CONFIRM = '1'

function Install-TestApp([string]$File) {
  $installArgs = @('/S')
  if ($Isolated) { $installArgs += '/ACCEPTANCE' }
  $installArgs += "/D=$installDir"
  $process = Start-Process -FilePath $File -ArgumentList $installArgs -WindowStyle Hidden -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Bộ cài trả mã $($process.ExitCode)" }
  if (-not (Test-Path -LiteralPath (Join-Path $installDir 'DGVC.exe'))) { throw 'Thiếu DGVC.exe sau khi cài' }
  $env:DGVC_EXECUTABLE = Join-Path $installDir 'DGVC.exe'
}

function Run-Test([string]$Script) {
  & node $Script
  if ($LASTEXITCODE -ne 0) { throw "Kiểm thử $Script thất bại ($LASTEXITCODE)" }
}

function Data-Hashes {
  @(Get-ChildItem -LiteralPath $env:DGVC_TEST_HOME -Recurse -File | Sort-Object FullName | ForEach-Object {
    "$($_.FullName) $((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash)"
  }) -join "`n"
}

function Uninstall-TestApp {
  $before = Data-Hashes
  $uninstaller = Join-Path $installDir 'Go-cai-dat.exe'
  $process = Start-Process -FilePath $uninstaller -ArgumentList '/S', "_?=$installDir" -WindowStyle Hidden -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Gỡ cài đặt trả mã $($process.ExitCode)" }
  if (Test-Path -LiteralPath (Join-Path $installDir 'DGVC.exe')) { throw 'Gỡ cài đặt còn DGVC.exe' }
  if ((Data-Hashes) -ne $before) { throw 'Gỡ cài đặt đã làm đổi dữ liệu hoặc bản sao lưu' }
}

try {
  $env:DGVC_TEST_HOME = Join-Path $TestRoot 'Dữ liệu nâng cấp'
  Install-TestApp $PreviousInstaller
  Run-Test (Join-Path $PSScriptRoot 'electron.smoke.js')
  Install-TestApp $Installer
  Run-Test (Join-Path $PSScriptRoot 'electron.upgrade.js')
  Uninstall-TestApp
  $env:DGVC_TEST_HOME = Join-Path $TestRoot 'Dữ liệu cài mới'
  Install-TestApp $Installer
  Run-Test (Join-Path $PSScriptRoot 'electron.smoke.js')
  Uninstall-TestApp
  'WINDOWS INSTALLER ACCEPTED — cài mới, nâng cấp từ bản cũ có dữ liệu, Excel/PDF, backup/restore, gỡ cài giữ nguyên dữ liệu'
} finally {
  $env:DGVC_TEST_HOME = $oldHome
  $env:DGVC_EXECUTABLE = $oldExe
  $env:DGVC_ACCEPTANCE_CONFIRM = $oldConfirm
}
