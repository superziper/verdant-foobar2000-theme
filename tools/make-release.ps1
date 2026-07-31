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

# profile\ : additive only. Safe to extract by hand over an existing profile -- nothing
# in here can overwrite a setting the user cares about.
$null = robocopy $need['theme'] (Join-Path $stage 'profile\verdant') /E /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -ge 8) { throw 'staging theme failed' }
$null = robocopy $need['components'] (Join-Path $stage 'profile\user-components-x64') /E /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -ge 8) { throw 'staging components failed' }
$global:LASTEXITCODE = 0   # robocopy returns 1 for "files copied"; don't let it look like failure

# extras\ : conditional. Applied by install.ps1 only after it checks what is already there.
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'extras\configuration') | Out-Null
foreach ($f in 'foo_ui_columns.dll.cfg','foo_uie_jsplitter.dll.cfg','foo_ui_wizard.dll.cfg') {
    $src = Join-Path $repo "dist-config\$f"
    if (Test-Path $src) { Copy-Item $src (Join-Path $stage 'extras\configuration') -Force }
}
Copy-Item $need['core cfg'] (Join-Path $stage 'extras\config.sqlite') -Force
Copy-Item $need['fcl']      (Join-Path $stage 'extras\verdant-layout.fcl') -Force

Copy-Item (Join-Path $repo 'tools\install.ps1') $stage -Force
Copy-Item (Join-Path $repo 'tools\install.bat') $stage -Force

# ---- install notes ----------------------------------------------------------
@"
Verdant v$version -- a modern Spotify-style theme for foobar2000
by superziper

INSTALL (recommended)
  1. Close foobar2000.
  2. Double-click install.bat.
  3. Start foobar2000.

  It finds your foobar2000, installs the theme, adds only the components you are
  missing, and applies the layout. It backs up anything it replaces and writes an
  uninstall script next to the backup, in:
      <profile>\verdant-backup\<date>\uninstall.ps1

  If you already use Columns UI, only the panel LAYOUT is replaced -- your colours,
  fonts, playlist columns and other settings are left alone.

INSTALL (by hand, no scripts)
  1. Close foobar2000.
  2. Copy the contents of profile\ into your foobar2000 profile folder:
       portable install : the "profile" folder next to foobar2000.exe
       standard install : %APPDATA%\foobar2000
     This only ADDS files -- it cannot overwrite your settings.
  3. Start foobar2000, then:
       Preferences > Display > set the interface to "Columns UI" (restart if asked)
       Preferences > Display > Columns UI > Layout:
         right-click the top node > Remove root panel
         right-click the empty root > Add panel > Splitters > JSplitter
         Apply
       Right-click the panel > Configure > Script source: File > verdant\main.js

  (Everything in extras\ is for the installer. Do not copy it in by hand -- those
   files replace configuration rather than add to it.)

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
