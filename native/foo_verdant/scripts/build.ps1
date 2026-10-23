<#
    build.ps1 -- build foo_verdant.

    Finds MSBuild through vswhere rather than hardcoding a Visual Studio path, so a VS
    install, a BuildTools install or a future version all work.

    Usage
        .\scripts\build.ps1                     # Release
        .\scripts\build.ps1 -Configuration Debug
        .\scripts\build.ps1 -Deploy             # also copy into the live foobar profile
        .\scripts\build.ps1 -Clean
#>
[CmdletBinding()]
param(
    [ValidateSet('Release','Debug')]
    [string]$Configuration = 'Release',
    [switch]$Deploy,
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$projDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$proj    = Join-Path $projDir 'foo_verdant.vcxproj'
$sdk     = Join-Path (Split-Path -Parent $projDir) 'sdk'

if (-not (Test-Path (Join-Path $sdk 'foobar2000\SDK\foobar2000.h'))) {
    throw "the foobar2000 SDK is missing -- run .\scripts\get-sdk.ps1 first"
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path $vswhere)) { throw 'vswhere.exe not found -- is Visual Studio or VS BuildTools installed?' }
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { throw 'no Visual Studio install with the C++ toolchain was found' }
$msbuild = Join-Path $vs 'MSBuild\Current\Bin\MSBuild.exe'
if (-not (Test-Path $msbuild)) { throw "MSBuild not found at $msbuild" }

$target = 'Build'
if ($Clean) { $target = 'Rebuild' }

Write-Host "building foo_verdant ($Configuration, x64)" -ForegroundColor Cyan
& $msbuild $proj "/t:$target" "/p:Configuration=$Configuration" /p:Platform=x64 /nologo /v:minimal /m
if ($LASTEXITCODE -ne 0) { throw "build failed (msbuild exit $LASTEXITCODE)" }

$dll = Join-Path $projDir "build\$Configuration\foo_verdant.dll"
if (-not (Test-Path $dll)) { throw "build reported success but $dll is missing" }
$kb = [math]::Round((Get-Item $dll).Length / 1KB, 1)
Write-Host ""
Write-Host ("  {0}  ({1} KB)" -f $dll, $kb) -ForegroundColor Green

if ($Deploy) {
    # Same destination the theme's deploy.ps1 uses, so there is one notion of "the profile".
    $profileDir = $env:VERDANT_PROFILE
    if (-not $profileDir) { throw 'set VERDANT_PROFILE to your foobar2000 profile folder, or copy the dll by hand' }
    $dest = Join-Path $profileDir 'user-components-x64\foo_verdant'

    if (Get-Process -Name 'foobar2000' -ErrorAction SilentlyContinue) {
        throw 'foobar2000 is running -- close it first, it holds the dll open'
    }
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Copy-Item $dll $dest -Force
    Write-Host ("  deployed -> {0}" -f $dest) -ForegroundColor Green
}
