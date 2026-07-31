<#
    Verdant -- installer for foobar2000
    A modern Spotify-style theme. https://github.com/superziper/foobar2000-spotify-theme

    Usage
        double-click install.bat
      or
        powershell -ExecutionPolicy Bypass -File .\install.ps1
        .\install.ps1 -FoobarRoot 'D:\foobar2000'      # if auto-detection picks the wrong one

    What it does
        - finds your foobar2000 (portable or standard)
        - backs up anything it replaces, and writes an uninstall script beside the backup
        - copies the theme into <profile>\verdant\
        - installs any of the three required components you don't already have
        - applies the layout, by whichever of two routes suits your setup

    What it will NOT do
        Overwrite anything that already exists except its own theme folder. Your library,
        playlists, output device, DSPs and component settings are left alone. If you already
        run Columns UI, even your colours, fonts and playlist columns survive -- only the
        panel layout is replaced.
#>
[CmdletBinding()]
param(
    [string]$FoobarRoot,
    [switch]$SkipComponents
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Say    ($m) { Write-Host $m }
function Step   ($m) { Write-Host "`n$m" -ForegroundColor Cyan }
function Ok     ($m) { Write-Host "  $m" -ForegroundColor Green }
function Note   ($m) { Write-Host "  $m" -ForegroundColor DarkGray }
function Warn   ($m) { Write-Host "  $m" -ForegroundColor Yellow }

# ---------------------------------------------------------------------------
# 0. locate the payload. Works both from the release zip (install.ps1 beside
#    profile\ and extras\) and from a repo checkout (tools\install.ps1).
# ---------------------------------------------------------------------------
#    Note the split in the release layout: profile\ holds only things that are safe to merge
#    into someone's profile (the theme, missing components), because a user may extract the
#    zip by hand and a zip extraction cannot make decisions. Everything conditional --
#    the prepared configs, the core settings, the layout file -- lives under extras\ and is
#    applied only by this script, only when it has established it won't destroy anything.
$repoRoot = Split-Path -Parent $ScriptDir
$layouts = @(
    [pscustomobject]@{ Theme=(Join-Path $ScriptDir 'profile\verdant');    Comp=(Join-Path $ScriptDir 'profile\user-components-x64'); Cfg=(Join-Path $ScriptDir 'extras\configuration'); Fcl=(Join-Path $ScriptDir 'extras\verdant-layout.fcl'); Sqlite=(Join-Path $ScriptDir 'extras\config.sqlite') }
    [pscustomobject]@{ Theme=(Join-Path $repoRoot  'theme\verdant');      Comp=(Join-Path $repoRoot  'components');                 Cfg=(Join-Path $repoRoot  'dist-config');          Fcl=(Join-Path $repoRoot  'dist-config\verdant-layout.fcl'); Sqlite=(Join-Path $repoRoot 'dist-config\config.sqlite') }
)
$P = $layouts | Where-Object { Test-Path $_.Theme } | Select-Object -First 1
if (-not $P) { throw "can't find the theme payload next to this script -- is the zip fully extracted?" }

Say ""
Say "  Verdant -- a modern Spotify-style theme for foobar2000"
Say "  by superziper"
Say ""

# ---------------------------------------------------------------------------
# 1. find foobar2000
# ---------------------------------------------------------------------------
Step '[1/6] Looking for foobar2000'

function Get-FoobarTarget {
    param([string]$Explicit)

    if ($Explicit) {
        $exe = Join-Path $Explicit 'foobar2000.exe'
        if (-not (Test-Path $exe)) { throw "no foobar2000.exe in $Explicit" }
        $isPortable = Test-Path (Join-Path $Explicit 'portable_mode_enabled')
        $prof = if ($isPortable) { Join-Path $Explicit 'profile' } else { Join-Path $env:APPDATA 'foobar2000' }
        return [pscustomobject]@{ Root=$Explicit; Exe=$exe; Profile=$prof; Portable=$isPortable }
    }

    # extracted inside a portable install?
    foreach ($d in @($ScriptDir, $repoRoot, (Split-Path -Parent $repoRoot))) {
        if ($d -and (Test-Path (Join-Path $d 'portable_mode_enabled'))) {
            return [pscustomobject]@{ Root=$d; Exe=(Join-Path $d 'foobar2000.exe'); Profile=(Join-Path $d 'profile'); Portable=$true }
        }
    }

    # standard install: registry, then the usual folders
    $roots = @()
    foreach ($key in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\foobar2000',
                     'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\foobar2000',
                     'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\foobar2000') {
        try {
            $loc = (Get-ItemProperty -Path $key -ErrorAction Stop).InstallLocation
            if ($loc) { $roots += $loc }
        } catch { }
    }
    $roots += @((Join-Path $env:ProgramFiles 'foobar2000'), (Join-Path ${env:ProgramFiles(x86)} 'foobar2000'))
    foreach ($r in $roots) {
        if ($r -and (Test-Path (Join-Path $r 'foobar2000.exe'))) {
            $portable = Test-Path (Join-Path $r 'portable_mode_enabled')
            $prof = if ($portable) { Join-Path $r 'profile' } else { Join-Path $env:APPDATA 'foobar2000' }
            return [pscustomobject]@{ Root=$r; Exe=(Join-Path $r 'foobar2000.exe'); Profile=$prof; Portable=$portable }
        }
    }
    return $null
}

$fb = Get-FoobarTarget -Explicit $FoobarRoot
if (-not $fb) {
    Warn 'could not find foobar2000 automatically.'
    Say  ''
    Say  '  Re-run pointing at your foobar folder, e.g.'
    Say  "     .\install.ps1 -FoobarRoot 'D:\foobar2000'"
    Say  '  (the folder containing foobar2000.exe)'
    exit 1
}
Ok ("found: {0}" -f $fb.Root)
Note ("install type : {0}" -f $(if ($fb.Portable) { 'portable' } else { 'standard' }))
Note ("profile      : {0}" -f $fb.Profile)

if (-not (Test-Path $fb.Profile)) { New-Item -ItemType Directory -Force -Path $fb.Profile | Out-Null }

# ---------------------------------------------------------------------------
# 2. refuse to run while foobar is open -- it rewrites its configuration on exit
#    and would overwrite whatever we just installed
# ---------------------------------------------------------------------------
Step '[2/6] Checking foobar2000 is closed'
$running = (Test-Path (Join-Path $fb.Profile 'running')) -or
           [bool](Get-Process -Name 'foobar2000' -ErrorAction SilentlyContinue)
if ($running) {
    Warn 'foobar2000 is running.'
    Say  ''
    Say  '  Close it and run this again. foobar rewrites its configuration when it exits,'
    Say  '  which would undo the install.'
    exit 1
}
Ok 'closed'

# ---------------------------------------------------------------------------
# 3. back up anything about to be replaced
# ---------------------------------------------------------------------------
Step '[3/6] Backing up'
$stamp     = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$backupDir = Join-Path $fb.Profile "verdant-backup\$stamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$restored = New-Object System.Collections.ArrayList   # files we overwrote  (restore on uninstall)
$added    = New-Object System.Collections.ArrayList   # paths we created    (delete on uninstall)

function Save-Existing($path) {
    if (Test-Path $path) {
        $leaf = Split-Path -Leaf $path
        Copy-Item $path -Destination (Join-Path $backupDir $leaf) -Recurse -Force
        [void]$restored.Add($path)
        return $true
    }
    return $false
}

# ---------------------------------------------------------------------------
# 4. the theme itself -- always ours, always replaced
# ---------------------------------------------------------------------------
Step '[4/6] Installing the theme'
$themeDest = Join-Path $fb.Profile 'verdant'
if (Test-Path $themeDest) { Note 'replacing an existing verdant\ folder'; [void]$restored.Add($themeDest); Copy-Item $themeDest -Destination (Join-Path $backupDir 'verdant') -Recurse -Force }
else { [void]$added.Add($themeDest) }
$null = robocopy $P.Theme $themeDest /MIR /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -ge 8) { throw "failed to copy the theme (robocopy $LASTEXITCODE)" }
$global:LASTEXITCODE = 0
Ok ("theme -> {0}" -f $themeDest)

# ---------------------------------------------------------------------------
# 5. components -- only the ones that are missing, never a downgrade
# ---------------------------------------------------------------------------
Step '[5/6] Components'
$compDest = Join-Path $fb.Profile 'user-components-x64'
if ($SkipComponents) {
    Note 'skipped (-SkipComponents)'
} elseif (-not (Test-Path $P.Comp)) {
    Note 'no bundled components in this package'
} else {
    New-Item -ItemType Directory -Force -Path $compDest | Out-Null
    foreach ($c in Get-ChildItem $P.Comp -Directory) {
        $target = Join-Path $compDest $c.Name
        if (Test-Path $target) {
            Note ("{0} -- already installed, left alone" -f $c.Name)
        } else {
            $null = robocopy $c.FullName $target /E /NFL /NDL /NJH /NJS /NP
            if ($LASTEXITCODE -ge 8) { throw "failed to install $($c.Name)" }
            $global:LASTEXITCODE = 0
            [void]$added.Add($target)
            Ok ("{0} -- installed" -f $c.Name)
        }
    }
}

# ---------------------------------------------------------------------------
# 6. the layout. Two routes, chosen by what the target already has.
# ---------------------------------------------------------------------------
Step '[6/6] Applying the layout'
$cfgDir      = Join-Path $fb.Profile 'configuration'
$cuiCfg      = Join-Path $cfgDir 'foo_ui_columns.dll.cfg'
$sqlite      = Join-Path $fb.Profile 'config.sqlite'
$hasCui      = Test-Path $cuiCfg
$hasSqlite   = Test-Path $sqlite
$manualSteps = New-Object System.Collections.ArrayList
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null

if ($hasCui) {
    # --- route B: they already use Columns UI. Replace ONLY the layout, via the
    #     component's own import, so their colours/fonts/columns/filters survive.
    Note 'existing Columns UI configuration found -- importing the layout only'
    if (-not (Test-Path $P.Fcl)) { throw "layout file missing: $($P.Fcl)" }
    Save-Existing $cuiCfg | Out-Null
    & $fb.Exe '/columnsui:import-quiet' $P.Fcl
    Start-Sleep -Seconds 2
    Ok 'layout imported (foobar2000 is starting up with it)'
    Note 'your colours, fonts, playlist columns and other settings were not touched'
} else {
    # --- route A: no Columns UI layout to preserve. Drop the prepared config in.
    foreach ($f in 'foo_ui_columns.dll.cfg','foo_uie_jsplitter.dll.cfg','foo_ui_wizard.dll.cfg') {
        $srcCfg = Join-Path $P.Cfg $f
        $dstCfg = Join-Path $cfgDir $f
        if (-not (Test-Path $srcCfg)) { continue }
        if (Test-Path $dstCfg) { Note ("{0} -- already present, left alone" -f $f) }
        else { Copy-Item $srcCfg $dstCfg -Force; [void]$added.Add($dstCfg); Ok ("{0} -- installed" -f $f) }
    }

    if ($hasSqlite) {
        # foobar has been run here before: its core settings are live and are NOT ours to
        # replace. Selecting Columns UI is then the one thing the user has to do.
        Warn 'foobar2000 has been run on this profile before, so its core settings were left as they are.'
        [void]$manualSteps.Add('Preferences > Display > set the user interface to "Columns UI", then restart foobar2000')
    } elseif (Test-Path $P.Sqlite) {
        Copy-Item $P.Sqlite $sqlite -Force
        [void]$added.Add($sqlite)
        Ok 'core settings installed (user interface set to Columns UI)'
    } else {
        [void]$manualSteps.Add('Preferences > Display > set the user interface to "Columns UI", then restart foobar2000')
    }
}

# ---------------------------------------------------------------------------
# uninstall script
# ---------------------------------------------------------------------------
$un = @()
$un += "# Undo the Verdant install of $stamp. Close foobar2000 first."
$un += '$ErrorActionPreference = ''Stop'''
$un += 'if (Get-Process -Name foobar2000 -ErrorAction SilentlyContinue) { Write-Host "close foobar2000 first"; exit 1 }'
$un += '$backup = Split-Path -Parent $MyInvocation.MyCommand.Path'
foreach ($a in $added)    { $un += ('if (Test-Path "{0}") {{ Remove-Item -Recurse -Force "{0}"; Write-Host "removed {0}" }}' -f $a) }
foreach ($r in $restored) { $un += ('Copy-Item (Join-Path $backup "{0}") -Destination "{1}" -Recurse -Force; Write-Host "restored {1}"' -f (Split-Path -Leaf $r), $r) }
$un += 'Write-Host "Verdant uninstalled."'
$un -join "`r`n" | Set-Content -Path (Join-Path $backupDir 'uninstall.ps1') -Encoding utf8

# ---------------------------------------------------------------------------
# done
# ---------------------------------------------------------------------------
Say ''
Say '  ------------------------------------------------------------'
Ok  'Verdant installed.'
Say ''
if ($manualSteps.Count) {
    Warn 'One step left for you:'
    foreach ($m in $manualSteps) { Say ("     - {0}" -f $m) }
    Say ''
}
Say  '  Start foobar2000 to see it.'
Note ('backup + uninstall.ps1: {0}' -f $backupDir)
Say  ''
Note 'Verdant reads your Media Library: if Home and All Songs look empty, add a'
Note 'music folder under Preferences > Media Library.'
Say  ''
