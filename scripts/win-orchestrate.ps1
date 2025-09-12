# ArkDesk/scripts/win-orchestrate.ps1
[CmdletBinding()]
param(
  [string]$ArkPyTarget    = 'build',
  [string]$ArknetXTarget  = 'all',
  [switch]$CopyDlls,
  [switch]$SkipNode,
  [switch]$CI,
  [string]$MsysBash,
  [string]$Workspace,
  [string]$ArkPyPath,
  [string]$ArknetXPath,
  [string]$ArknetXBinRel  = 'build\bin\windows',  # set to 'auto' to probe via `make -s print-bin`
  [string]$PythonExe
)

$ErrorActionPreference = 'Stop'
try { $PSNativeCommandUseErrorActionPreference = $true } catch {}

function Resolve-RequiredPath([string]$p) {
  (Resolve-Path -LiteralPath $p -ErrorAction Stop).ProviderPath
}
function To-MsysPath([string]$winPath) {
  $abs = [System.IO.Path]::GetFullPath($winPath)
  "/$($abs.Substring(0,1).ToLower())$($abs.Substring(2).Replace('\','/'))"
}
function Ensure-Dir([string]$p) {
  if (-not (Test-Path -LiteralPath $p)) { New-Item -ItemType Directory -Force -Path $p | Out-Null }
  return (Convert-Path -LiteralPath $p)
}

$script:BashPath = $null
$script:PrintedBash = $false
function Get-MsysBash() {
  if ($script:BashPath) { return $script:BashPath }
  if ($MsysBash) { $script:BashPath = Resolve-RequiredPath $MsysBash; return $script:BashPath }
  $candidates = @(
    $env:MSYS2_BASH,
    'C:\msys64\ucrt64.exe',
    'C:\msys64\mingw64.exe',
    'C:\msys64\clang64.exe',
    'C:\msys64\usr\bin\bash.exe',
    "${env:ProgramFiles}\msys64\usr\bin\bash.exe",
    "${env:ProgramFiles(x86)}\msys64\usr\bin\bash.exe"
  )
  $fallback = @(Get-Command bash.exe -ErrorAction SilentlyContinue -All | Select-Object -ExpandProperty Source)
  $candidates = @($candidates + $fallback) | Where-Object { $_ } | Select-Object -Unique
  foreach ($p in $candidates) { if (Test-Path $p) { $script:BashPath = (Resolve-RequiredPath $p); break } }
  if (-not $script:BashPath) { throw "MSYS2 bash.exe not found. Set -MsysBash or `$env:MSYS2_BASH`." }
  $script:BashPath
}
function Invoke-MsysMake([string]$workdir, [string[]]$targets) {
  $bash = Get-MsysBash
  if (-not $script:PrintedBash) { Write-Host "[msys] bash=$bash"; $script:PrintedBash = $true }
  $wd   = To-MsysPath $workdir
  $t    = ($targets -join ' ')
  $args = @('-lc', "set -e; cd '$wd'; make $t")
  & $bash @args
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Direct exec failed (exit $LASTEXITCODE), retrying with Start-Process..."
    $p = Start-Process -FilePath $bash -ArgumentList $args -NoNewWindow -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "MSYS2 make failed in $workdir (exit $($p.ExitCode))" }
  }
}
function Get-MsysRoot() {
  $bash = Get-MsysBash
  Split-Path -Parent (Split-Path -Parent $bash)
}
function Get-MingwBinDir() {
  $root = Get-MsysRoot
  foreach ($d in @('ucrt64\bin','mingw64\bin','clang64\bin','mingw32\bin')) {
    $p = Join-Path $root $d; if (Test-Path $p) { return $p }
  }
  return $null
}
function Ensure-MsysPackages([string[]]$pkgs) {
  $bash = Get-MsysBash
  $list = ($pkgs -join ' ')
  & $bash -lc "set -e; pacman -Sy --noconfirm; pacman -S --needed --noconfirm $list"
}
function Ensure-WindowsRuntimeDlls([string]$dest) {
  $mingw = Get-MingwBinDir; if (-not $mingw) { return }
  $need = @('libstdc++-6.dll','libgcc_s_seh-1.dll','libwinpthread-1.dll')
  foreach ($n in $need) {
    $src = Join-Path $mingw $n
    if (Test-Path $src -and -not (Test-Path (Join-Path $dest $n))) {
      Copy-Item $src $dest -Force
    }
  }
}
function Copy-DllsViaNtldd([string]$exePath, [string]$dest) {
  $bash = Get-MsysBash
  $exeU = To-MsysPath $exePath
  $cmd  = @"
set -e
command -v ntldd >/dev/null
ntldd -R "$exeU" | awk '/=>/ && $3 ~ /^[\/A-Za-z]/ {print $3}'
"@
  $lines = & $bash -lc $cmd 2>$null
  foreach ($p in $lines) {
    $pp = $p
    if ($pp -like '/*') { $pp = $pp -replace '^/([a-zA-Z])/', '$1:/' -replace '/', '\' }
    if (Test-Path $pp) { Copy-Item $pp $dest -Force }
  }
}
function Try-Resolve-ArknetXBin([string]$arkRoot, [string]$rel) {
  if ($rel -and $rel -ne 'auto') { return (Join-Path $arkRoot $rel) }
  $bash = Get-MsysBash
  $wd   = To-MsysPath $arkRoot
  $out  = & $bash -lc "set -e; cd '$wd'; make -s print-bin 2>/dev/null || true"
  if ($LASTEXITCODE -eq 0 -and $out) {
    $cand = $out.Trim()
    if ($cand -like '/*') { $cand = $cand -replace '^/([a-zA-Z])/', '$1:/' -replace '/', '\' }
    if (Test-Path $cand) { return (Resolve-RequiredPath $cand) }
    $joined = Join-Path $arkRoot $out
    if (Test-Path $joined) { return (Resolve-RequiredPath $joined) }
  }
  return (Join-Path $arkRoot 'build\bin\windows')
}

# Python: locate and build wheel(s) if ArkPy didn't deposit any
function Get-Python() {
  if ($PythonExe) { return (Resolve-RequiredPath $PythonExe) }
  $candidates = @(
    (Join-Path $ArkPyPath '.venv\Scripts\python.exe'),
    "$env:VIRTUAL_ENV\Scripts\python.exe",
    (Get-Command py.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
    (Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
  ) | Where-Object { $_ } | Select-Object -Unique
  foreach ($p in $candidates) { if ($p -and (Test-Path $p)) { return (Resolve-RequiredPath $p) } }
  throw "Python not found. Provide -PythonExe or create ArkPy\.venv."
}
function Build-ArkPyWheelhouse() {
  $py    = Get-Python
  $dst   = Ensure-Dir (Join-Path $ArkPyPath 'wheelhouse')
  Push-Location $ArkPyPath
  try {
    & $py -m pip install -U pip wheel build
    try {
      & $py -m build --wheel --outdir $dst
    } catch {
      & $py -m pip wheel . -w $dst
    }
    $lock = Join-Path $ArkPyPath '.venv-lock\requirements.txt'
    if (Test-Path $lock) {
      & $py -m pip wheel -r $lock -w $dst
    }
  } finally { Pop-Location }
}

# sibling layout
$ScriptDir = Resolve-RequiredPath $PSScriptRoot
$ArkDesk   = Resolve-RequiredPath (Join-Path $ScriptDir '..')
if (-not $Workspace)    { $Workspace    = Split-Path $ArkDesk -Parent }
if (-not $ArkPyPath)    { $ArkPyPath    = Join-Path $Workspace 'ArkPy' }
if (-not $ArknetXPath)  { $ArknetXPath  = Join-Path $Workspace 'ArknetX' }
$ArkPyPath   = Resolve-RequiredPath $ArkPyPath
$ArknetXPath = Resolve-RequiredPath $ArknetXPath

Write-Host "== Orchestrate Build ==" -ForegroundColor Cyan
"{0,-10} {1}" -f "ArkDesk:", $ArkDesk     | Write-Host
"{0,-10} {1}" -f "ArkPy:",   $ArkPyPath   | Write-Host
"{0,-10} {1}" -f "ArknetX:", $ArknetXPath | Write-Host

# 0) Tooling
if ($CopyDlls) {
  Ensure-MsysPackages @('ntldd')
}

# 1) ArkPy
Write-Host "`n[ArkPy] make $ArkPyTarget" -ForegroundColor Yellow
Invoke-MsysMake -workdir $ArkPyPath -targets @($ArkPyTarget)

# 1a) ensure ArkPy wheelhouse populated (fallback Python build if empty)
$wheelsSrc = Join-Path $ArkPyPath 'wheelhouse'
$wheelsDst = Ensure-Dir (Join-Path $ArkDesk 'resources\wheels')
$lockSrc   = Join-Path $ArkPyPath '.venv-lock\requirements.txt'
$bootDst   = Ensure-Dir (Join-Path $ArkDesk 'resources\bootstrap')

$existing = @()
if (Test-Path $wheelsSrc) {
  $existing = Get-ChildItem -LiteralPath $wheelsSrc -File -ErrorAction SilentlyContinue |
              Where-Object { $_.Extension -eq '.whl' }
}
if (-not $existing -or $existing.Count -eq 0) {
  Write-Host "[ArkPy] wheelhouse empty → building via Python" -ForegroundColor Yellow
  Build-ArkPyWheelhouse
  $existing = Get-ChildItem -LiteralPath $wheelsSrc -File -ErrorAction SilentlyContinue |
              Where-Object { $_.Extension -eq '.whl' }
}

if ($existing) {
  $existing | Copy-Item -Destination $wheelsDst -Force
  Write-Host "[bundle] staged wheels -> $wheelsDst"
} else {
  Write-Warning "[bundle] still no wheels in: $wheelsSrc"
}
if (Test-Path $lockSrc) {
  Copy-Item $lockSrc (Join-Path $bootDst 'requirements.lock.txt') -Force
  Write-Host "[bundle] staged lock -> $bootDst\requirements.lock.txt"
}

# 2) ArknetX
$arkTargets = @($ArknetXTarget)
if ($CopyDlls) { $arkTargets += 'copy-win-dlls' }
Write-Host "`n[ArknetX] make $($arkTargets -join ' ')" -ForegroundColor Yellow
Invoke-MsysMake -workdir $ArknetXPath -targets $arkTargets

# 3) stage outputs → ArkDesk/resources/bin/<os> and mirror to src-tauri/bin
$binSrc  = Try-Resolve-ArknetXBin -arkRoot $ArknetXPath -rel $ArknetXBinRel
$resRoot = Ensure-Dir (Join-Path $ArkDesk 'resources\bin')
$winRes  = Ensure-Dir (Join-Path $resRoot 'windows')
$null    = Ensure-Dir (Join-Path $resRoot 'macos')
$null    = Ensure-Dir (Join-Path $resRoot 'linux')
$devBin  = Ensure-Dir (Join-Path $ArkDesk 'src-tauri\bin')

if (Test-Path $binSrc) {
  $files = Get-ChildItem -LiteralPath $binSrc -File -ErrorAction SilentlyContinue |
           Where-Object { $_.Extension -match '^\.(exe|dll)$' }
  if ($files) {
    $files | Copy-Item -Destination $winRes -Force
    $files | Copy-Item -Destination $devBin -Force
    Write-Host "[bundle] staged -> $winRes (mirrored -> $devBin)"
  } else {
    Write-Warning "[bundle] no .exe/.dll under: $binSrc"
  }

  Ensure-WindowsRuntimeDlls -dest $winRes
  if ($CopyDlls) {
    Get-ChildItem $winRes -Filter *.exe -File | ForEach-Object {
      Copy-DllsViaNtldd -exePath $_.FullName -dest $winRes
    }
  }
} else {
  Write-Warning "[bundle] bin source not found: $binSrc"
}

# 4) Node/Tauri — anti-recursion
$inPrebuild = ($env:npm_lifecycle_event -eq 'prebuild' -or $env:npm_config_lifecycle_event -eq 'prebuild')
if (-not $SkipNode) {
  Push-Location $ArkDesk
  try {
    if (Test-Path package-lock.json) {
      if ($CI) { npm ci --no-audit --no-fund } else { npm ci }
    } else {
      if ($CI) { npm install --no-audit --no-fund } else { npm install }
    }
    if (-not $inPrebuild) { npm run build } else { Write-Host "[node] prebuild → install only" }
  } finally { Pop-Location }
}

Write-Host "`nOK." -ForegroundColor Green
