<#
    deploy.ps1 -- copies src\ into the foobar2000 profile scripts folder
    so the JavaScript Panel bootstrap can include main.js from a path
    foobar always allows (fb.ProfilePath).

    Usage:
        .\deploy.ps1            # one-shot copy
        .\deploy.ps1 -Watch     # copy now, then re-copy whenever a src file changes

    After deploying, reload the panel in foobar (right-click > Reload,
    or open its config and press Ctrl+S) to pick up the changes.
#>
param(
    [switch]$Watch,
    [string]$FoobarProfile = 'D:\portable programs\foobar2000\profile'
)

$ErrorActionPreference = 'Stop'
$src  = Join-Path $PSScriptRoot 'src'
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
