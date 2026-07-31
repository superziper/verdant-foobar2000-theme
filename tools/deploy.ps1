<#
    deploy.ps1 -- dev sync: copies theme\verdant\ into the foobar2000 profile.

    The shipped installer copies the exact same folder to the exact same place, so what
    you iterate on here is what users get -- there is no build step and no second code path.

    Usage:
        .\tools\deploy.ps1              # one-shot copy
        .\tools\deploy.ps1 -Watch       # copy now, then re-copy whenever a source file changes

    First time only, point the panel at the deployed copy:
        right-click the JSplitter panel > Configure > Script source: File
        > verdant\main.js   (paths are relative to the profile folder)

    After that, iterate with: edit -> deploy -> right-click panel > Reload.
    console.log output goes to foobar's console (View > Console).
#>
param(
    [switch]$Watch,
    [string]$FoobarProfile = 'D:\portable programs\foobar2000\profile'
)

$ErrorActionPreference = 'Stop'
$src  = Join-Path (Split-Path -Parent $PSScriptRoot) 'theme\verdant'
$dest = Join-Path $FoobarProfile 'verdant'

if (-not (Test-Path $src))           { throw "theme source not found: $src" }
if (-not (Test-Path $FoobarProfile)) { throw "foobar profile not found: $FoobarProfile" }

function Sync-Theme {
    # /MIR so a module deleted here also disappears from the profile -- a stale .js left behind
    # would still be include()d and would silently shadow the current code.
    $null = robocopy $src $dest /MIR /NFL /NDL /NJH /NJS /NP
    # robocopy is not a normal exit-code citizen: 0 = nothing to do, 1 = files copied,
    # anything >= 8 is a real failure. Clear it so a successful copy doesn't look like one.
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }
    $global:LASTEXITCODE = 0
    $n = (Get-ChildItem -Recurse -File $src).Count
    Write-Host ("[{0}] deployed {1} files -> {2}" -f (Get-Date -Format 'HH:mm:ss'), $n, $dest)
}

Sync-Theme

if ($Watch) {
    Write-Host 'Watching theme\verdant for changes -- edit + save, then reload the panel. Ctrl+C to stop.'
    function Latest { (Get-ChildItem -Recurse $src -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime }
    $last = Latest
    while ($true) {
        Start-Sleep -Seconds 1
        $cur = Latest
        if ($cur -gt $last) { $last = $cur; Sync-Theme }
    }
}
