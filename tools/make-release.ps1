<#
    make-release.ps1 -- assemble the release zip.

    Version comes from the theme itself (window.DefineScript in theme\verdant\main.js), so
    there is one place to bump and no way for the zip name and the panel to disagree.

    Usage:
        .\tools\make-release.ps1
        .\tools\make-release.ps1 -OutDir 'D:\somewhere'
#>
param(
    [string]$OutDir
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) { $OutDir = Join-Path $repo 'dist' }

# ---- version ----------------------------------------------------------------
$mainJs = Get-Content (Join-Path $repo 'theme\verdant\main.js') -Raw
if ($mainJs -notmatch "version\s*:\s*'([^']+)'") { throw "couldn't read version from theme\verdant\main.js" }
$version = $Matches[1]
Write-Host "Verdant v$version"

# ---- required inputs --------------------------------------------------------
$need = @{
    'theme'      = Join-Path $repo 'theme\verdant'
    'components' = Join-Path $repo 'components'
    'layout cfg' = Join-Path $repo 'dist-config\foo_ui_columns.dll.cfg'
    'core cfg'   = Join-Path $repo 'dist-config\config.sqlite'
    'fcl'        = Join-Path $repo 'dist-config\verdant-layout.fcl'
    'installer'  = Join-Path $repo 'tools\install.ps1'
}
foreach ($k in $need.Keys) { if (-not (Test-Path $need[$k])) { throw "missing $k : $($need[$k])" } }

# ---- stage ------------------------------------------------------------------
$stage = Join-Path $env:TEMP ("verdant-release-" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Force -Path $stage | Out-Null

# profile\ : a COMPLETE drop-in. Extracting this over a fresh portable install is the whole
# installation -- theme, components, layout and the core setting that selects Columns UI.
# That is the convention in this ecosystem (Georgia-ReBORN ships the same shape) and it is
# what makes the four-step install possible.
#
# It does mean extracting over an ALREADY-CONFIGURED profile replaces that profile's Columns UI
# layout and core settings. A zip cannot make that judgement, so the docs lead with "fresh
# portable install" and point anyone with an existing setup at install.bat, which checks first.
$null = robocopy $need['theme'] (Join-Path $stage 'profile\verdant') /E /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -ge 8) { throw 'staging theme failed' }
$null = robocopy $need['components'] (Join-Path $stage 'profile\user-components-x64') /E /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -ge 8) { throw 'staging components failed' }
$global:LASTEXITCODE = 0   # robocopy returns 1 for "files copied"; don't let it look like failure

New-Item -ItemType Directory -Force -Path (Join-Path $stage 'profile\configuration') | Out-Null
foreach ($f in 'foo_ui_columns.dll.cfg','foo_uie_jsplitter.dll.cfg','foo_ui_wizard.dll.cfg') {
    $src = Join-Path $repo "dist-config\$f"
    if (Test-Path $src) { Copy-Item $src (Join-Path $stage 'profile\configuration') -Force }
}
Copy-Item $need['core cfg'] (Join-Path $stage 'profile\config.sqlite') -Force

# extras\ : the layout on its own, for people who already run Columns UI and want only the
# panel layout replaced -- via install.bat, or by importing it themselves.
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'extras') | Out-Null
Copy-Item $need['fcl'] (Join-Path $stage 'extras\verdant-layout.fcl') -Force

Copy-Item (Join-Path $repo 'tools\install.ps1') $stage -Force
Copy-Item (Join-Path $repo 'tools\install.bat') $stage -Force

# Licences travel with the binaries: the bundle redistributes three third-party components,
# and LGPL-3.0 (Columns UI) requires the licence text to be conveyed with them. Their own
# licence files already sit inside components\ and so ride along with the copy above.
Copy-Item (Join-Path $repo 'LICENSE') $stage -Force
Copy-Item (Join-Path $repo 'THIRD-PARTY-NOTICES.md') $stage -Force

# ---- install notes ----------------------------------------------------------
@"
Verdant v$version -- a modern Spotify-style theme for foobar2000
by superziper

INSTALL
  1. Install foobar2000 as portable from https://www.foobar2000.org/download
  2. Extract the "profile" folder from this zip into foobar2000's root folder
     (the folder containing foobar2000.exe).
  3. Start foobar2000 and enjoy.

  No fonts to install: Verdant uses Segoe UI and Segoe MDL2 Assets, which ship
  with Windows 10 and 11.

  For a STANDARD (non-portable) install, extract the CONTENTS of the "profile"
  folder into %APPDATA%\foobar2000 instead, then start foobar2000.

ALREADY HAVE A FOOBAR2000 YOU HAVE SET UP?
  Do NOT extract over it -- profile\ contains a layout and core settings, and
  copying them in would replace your own. Run install.bat instead:

      1. Close foobar2000.
      2. Double-click install.bat.
      3. Start foobar2000.

  install.bat checks everything before it writes: it adds only the components you
  are missing, and if you already use Columns UI it replaces ONLY the panel layout,
  leaving your colours, fonts, playlist columns and other settings alone. It backs
  up whatever it touches and writes an uninstall script beside the backup, in
      <profile>\verdant-backup\<date>\uninstall.ps1

  extras\verdant-layout.fcl is the layout on its own, if you would rather import it
  yourself: Preferences > Display > Columns UI > Import, ticking Main Layout and
  Toolbar Layout.

REQUIREMENTS
  foobar2000 v2 (64-bit), Windows 10 or 11.
  Fonts: none to install -- it uses Segoe UI / Segoe MDL2 Assets, both built in.
  Components: Columns UI, JSplitter, UI Wizard -- all bundled, installed only if missing.

FIRST RUN
  Verdant reads foobar's Media Library. On a new foobar that library is empty, so
  Home, All Songs and the artist views will be blank until you add a music folder
  under Preferences > Media Library. That is expected, not a broken install.

TUNING
  Right-click the panel > Properties:
    Display: UI scale (0 = auto)   0 follows your display; set 1.0 for compact, higher for 4K
    Scrolling: wheel step (px)     how far one wheel notch scrolls
  Reload the panel (right-click > Reload) after changing either.

UNINSTALL
  Run uninstall.ps1 from the backup folder printed at the end of the install,
  then delete <profile>\verdant\.

NOTES
  Verdant restyles your local library. It does not connect to Spotify's service.
  Not affiliated with or endorsed by Spotify; "Spotify" is a trademark of Spotify AB.
"@ | Set-Content -Path (Join-Path $stage 'README-INSTALL.txt') -Encoding utf8

# ---- zip --------------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$zip = Join-Path $OutDir "Verdant-v$version.zip"
if (Test-Path $zip) { [System.IO.File]::Delete($zip) }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
[System.IO.Directory]::Delete($stage, $true)

$mb = [math]::Round((Get-Item $zip).Length/1MB, 1)
Write-Host ""
Write-Host ("  {0}  ({1} MB)" -f $zip, $mb) -ForegroundColor Green
