# ArkDesk/scripts/win-orchestrate.ps1
[CmdletBinding()]
param(
  [string]$ArkPyTarget   = 'build',
  [string]$ArknetXTarget = 'all',
  [switch]$CopyDlls,
  [switch]$SkipNode,
  [switch]$CI,
  [string]$MsysBash,
  [string]$Workspace,
  [string]$ArkPyPath,
  [string]$ArknetXPath
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
    'C:\msys64\usr\bin\bash.exe',
    "${env:ProgramFiles}\msys64\usr\bin\bash.exe",
    "${env:ProgramFiles(x86)}\msys64\usr\bin\bash.exe"
  )
  $candidates += @(Get-Command bash.exe -ErrorAction SilentlyContinue -All | Select-Object -ExpandProperty Source)
  $candidates = $candidates | Where-Object { $_ } | Select-Object -Unique
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

# sibling layout
$ScriptDir = Resolve-RequiredPath $PSScriptRoot
$ArkDesk   = Resolve-RequiredPath (Join-Path $ScriptDir '..')
if (-not $Workspace) { $Workspace = Split-Path $ArkDesk -Parent }
if (-not $ArkPyPath)   { $ArkPyPath   = Join-Path $Workspace 'ArkPy' }
if (-not $ArknetXPath) { $ArknetXPath = Join-Path $Workspace 'ArknetX' }
$ArkPyPath   = Resolve-RequiredPath $ArkPyPath
$ArknetXPath = Resolve-RequiredPath $ArknetXPath

Write-Host "== Orchestrate Build ==" -ForegroundColor Cyan
"{0,-10} {1}" -f "ArkDesk:", $ArkDesk     | Write-Host
"{0,-10} {1}" -f "ArkPy:",   $ArkPyPath   | Write-Host
"{0,-10} {1}" -f "ArknetX:", $ArknetXPath | Write-Host

# 1) ArkPy
Write-Host "`n[ArkPy] make $ArkPyTarget" -ForegroundColor Yellow
Invoke-MsysMake -workdir $ArkPyPath -targets @($ArkPyTarget)

# 2) ArknetX
$arkTargets = @($ArknetXTarget)
if ($CopyDlls) { $arkTargets += 'copy-win-dlls' }  # requires ntldd (see note below)
Write-Host "`n[ArknetX] make $($arkTargets -join ' ')" -ForegroundColor Yellow
Invoke-MsysMake -workdir $ArknetXPath -targets $arkTargets

# 3) Stage outputs → ../resources/bin/<os> and mirror to src-tauri/bin (dev)
$binSrc  = Join-Path $ArknetXPath 'build\bin\windows'
$resourcesBinRoot = Ensure-Dir (Join-Path (Split-Path $ArkDesk -Parent) 'resources\bin')
$winRes  = Ensure-Dir (Join-Path $resourcesBinRoot 'windows')
$macRes  = Ensure-Dir (Join-Path $resourcesBinRoot 'macos')
$linRes  = Ensure-Dir (Join-Path $resourcesBinRoot 'linux')
$devBin  = Ensure-Dir (Join-Path $ArkDesk 'src-tauri\bin')

if (Test-Path $binSrc) {
  $files = Get-ChildItem $binSrc -Include *.exe,*.dll -File -ErrorAction SilentlyContinue
  if ($files) {
    $files | Copy-Item -Destination $winRes -Force
    $files | Copy-Item -Destination $devBin -Force
    Write-Host "[bundle] copied → $winRes (and mirrored to $devBin)"
  } else {
    Write-Warning "[bundle] no *.exe/*.dll under: $binSrc"
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
