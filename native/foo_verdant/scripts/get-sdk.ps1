<#
    get-sdk.ps1 -- fetch the foobar2000 SDK that foo_verdant builds against.

    The SDK is not Verdant's to redistribute, so it is downloaded rather than committed
    (native\sdk\ is gitignored). The version is PINNED: an SDK bump is a deliberate act,
    not something that happens because someone cloned on a different day.

    Usage
        .\scripts\get-sdk.ps1
        .\scripts\get-sdk.ps1 -Force      # re-extract even if it looks present
#>
[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# Pinned. Bumping this is a commit of its own, so a build break is attributable.
$SdkFile = 'SDK-2026-10-01.7z'
$SdkUrl  = "https://www.foobar2000.org/downloads/$SdkFile"

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$nativeRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)   # native\
$sdkDir     = Join-Path $nativeRoot 'sdk'
$dlDir      = Join-Path $sdkDir '_download'

# An extracted SDK is untrusted input, so it lives in its own tree and nothing is ever
# executed out of it -- we only compile the sources we reference by path.
$marker = Join-Path $sdkDir 'foobar2000\SDK\foobar2000.h'
if ((Test-Path $marker) -and -not $Force) {
    Write-Host "SDK already present: $sdkDir" -ForegroundColor Green
    Write-Host '  (pass -Force to re-extract)' -ForegroundColor DarkGray
    return
}

$sevenZip = "$env:ProgramFiles\7-Zip\7z.exe"
if (-not (Test-Path $sevenZip)) { throw "7-Zip not found at $sevenZip -- install it, or extract $SdkFile into $sdkDir by hand" }

New-Item -ItemType Directory -Force -Path $dlDir | Out-Null
$archive = Join-Path $dlDir $SdkFile

if (-not (Test-Path $archive)) {
    Write-Host "downloading $SdkFile ..."
    $old = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'   # the progress bar makes this ~10x slower
    try {
        Invoke-WebRequest -Uri $SdkUrl -OutFile $archive -UseBasicParsing
    } finally {
        $ProgressPreference = $old
    }
}
$mb = [math]::Round((Get-Item $archive).Length / 1MB, 1)
$sha = (Get-FileHash $archive -Algorithm SHA256).Hash
Write-Host ("  $SdkFile  $mb MB")
Write-Host ("  sha256 $sha")

Write-Host "extracting into $sdkDir ..."
& $sevenZip x $archive "-o$sdkDir" -y | Out-Null
if ($LASTEXITCODE -ne 0) { throw "7-Zip failed with exit $LASTEXITCODE" }

if (-not (Test-Path $marker)) { throw "extraction finished but $marker is missing -- did the SDK layout change?" }

Write-Host ''
Write-Host 'SDK ready:' -ForegroundColor Green
foreach ($d in 'foobar2000\SDK','foobar2000\helpers','foobar2000\shared','pfc','libPPUI') {
    $p = Join-Path $sdkDir $d
    if (Test-Path $p) {
        $n = (Get-ChildItem $p -File -Recurse -ErrorAction SilentlyContinue | Measure-Object).Count
        Write-Host ("  {0,-24} {1} files" -f $d, $n)
    } else {
        Write-Host ("  {0,-24} ABSENT" -f $d) -ForegroundColor Yellow
    }
}
