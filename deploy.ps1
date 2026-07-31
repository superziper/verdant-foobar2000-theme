<#
    deploy.ps1 -- copies src\ into the foobar2000 profile scripts folder, so the
    one-line bootstrap can include() main.js from a path foobar always allows
    (fb.ProfilePath). Only needed for the edit->reload dev loop; a normal install
    is just pasting src\main.js into the panel.

    Usage:
        .\deploy.ps1                                  # one-shot copy
        .\deploy.ps1 -Watch                           # re-copy whenever a src file changes
        .\deploy.ps1 -FoobarProfile 'D:\fb2k\profile' # portable install

    The profile folder is auto-detected for a standard install; pass
    -FoobarProfile for a portable one (the folder containing foobar2000.cfg).

    After deploying, reload the panel in foobar (right-click > Reload, or open
    its config and press Ctrl+S) to pick up the changes.
#>
param(
    [switch]$Watch,
    [string]$FoobarProfile
)

$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'src'

if (-not $FoobarProfile) {
    $candidates = @(
        (Join-Path $env:APPDATA 'foobar2000-v2'),
        (Join-Path $env:APPDATA 'foobar2000')
    )
    $FoobarProfile = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $FoobarProfile) {
    throw "foobar2000 profile not found. Pass -FoobarProfile <path to the folder containing foobar2000.cfg>."
}

$dest = Join-Path $FoobarProfile 'scripts\foobar-spotify'

function Sync-Scripts {
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Copy-Item -Path (Join-Path $src '*') -Destination $dest -Recurse -Force
    Write-Host ("[{0}] deployed  src\  ->  {1}" -f (Get-Date -Format 'HH:mm:ss'), $dest)
}

if (-not (Test-Path $src)) { throw "src folder not found: $src" }

Sync-Scripts

if ($Watch) {
    Write-Host 'Watching src\ for changes -- edit + save, then reload the panel. Ctrl+C to stop.'
    function Latest { (Get-ChildItem -Recurse $src -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime }
    $last = Latest
    while ($true) {
        Start-Sleep -Seconds 1
        $cur = Latest
        if ($cur -gt $last) { $last = $cur; Sync-Scripts }
    }
}
