<#
    make-assets.ps1 -- draw the three Discord Rich Presence art assets.

    These are the images Discord serves when our payload names an asset KEY rather than a
    URL, so they are the fallbacks: the large one stands in for a cover no catalogue could
    match, and the two small ones are the corner badge.

    They are generated rather than hand-drawn so the palette stays tied to the theme's --
    the greens here are Verdant's COL.green / COL.greenC from theme\verdant\core\tokens.js.

    Upload the results at:
      discord.com/developers/applications -> your app -> Rich Presence -> Art Assets
    with these exact keys:  foobar2000   playing   paused

    Usage
        .\scripts\make-assets.ps1
        .\scripts\make-assets.ps1 -Size 1024
#>
[CmdletBinding()]
param(
    [int]$Size = 512,
    [string]$OutDir
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $OutDir) { $OutDir = Join-Path (Split-Path -Parent $scriptDir) 'assets' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Verdant's tokens: COL.green, COL.greenC, COL.base, COL.elev, COL.black
$green  = [System.Drawing.Color]::FromArgb(255, 30, 215, 96)
$greenC = [System.Drawing.Color]::FromArgb(255, 29, 185, 84)
$base   = [System.Drawing.Color]::FromArgb(255, 18, 18, 18)
$elev   = [System.Drawing.Color]::FromArgb(255, 24, 24, 24)
$black  = [System.Drawing.Color]::FromArgb(255, 0, 0, 0)

function New-Canvas($size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    return @($bmp, $g)
}

function Save-Png($bmp, $g, $name) {
    $path = Join-Path $OutDir "$name.png"
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    $kb = [math]::Round((Get-Item $path).Length / 1KB, 1)
    Write-Host ("  {0,-14} {1}x{1}  {2} KB" -f ("$name.png"), $Size, $kb) -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# foobar2000 -- the large fallback. A record, because the one thing it has to
# say is "this is music and we could not find the cover".
# ---------------------------------------------------------------------------
$r = New-Canvas $Size
$bmp = $r[0]; $g = $r[1]
$c = $Size / 2.0

# Background: a soft vertical lift off the theme's base colour.
$rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $elev, $base, 90.0)
$g.FillRectangle($bg, $rect)
$bg.Dispose()

function Circle($g, $brush, $cx, $cy, $radius) {
    $g.FillEllipse($brush, ($cx - $radius), ($cy - $radius), ($radius * 2), ($radius * 2))
}
function Ring($g, $pen, $cx, $cy, $radius) {
    $g.DrawEllipse($pen, ($cx - $radius), ($cy - $radius), ($radius * 2), ($radius * 2))
}

$discR = $Size * 0.34
$vinyl = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 20, 20, 20))
Circle $g $vinyl $c $c $discR
$vinyl.Dispose()

# Grooves, fading outwards.
for ($i = 0; $i -lt 7; $i++) {
    $alpha = 46 - ($i * 5)
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb($alpha, 255, 255, 255), ($Size * 0.004))
    Ring $g $pen $c $c ($discR * (0.94 - ($i * 0.085)))
    $pen.Dispose()
}

# Label in Verdant green, with the spindle hole punched back to the background.
$labelBrush = New-Object System.Drawing.SolidBrush($greenC)
Circle $g $labelBrush $c $c ($discR * 0.34)
$labelBrush.Dispose()
$holeBrush = New-Object System.Drawing.SolidBrush($base)
Circle $g $holeBrush $c $c ($discR * 0.055)
$holeBrush.Dispose()

# A single highlight arc, so the disc reads as a disc and not a flat target.
$hi = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(28, 255, 255, 255), ($Size * 0.016))
$g.DrawArc($hi, ($c - $discR * 0.78), ($c - $discR * 0.78), ($discR * 1.56), ($discR * 1.56), 205, 70)
$hi.Dispose()

Save-Png $bmp $g 'foobar2000'

# ---------------------------------------------------------------------------
# playing / paused -- the small corner badge. Discord renders these at roughly
# 20px, so they are drawn as one solid green disc with a black symbol: no
# detail, maximum contrast, legible when tiny.
# ---------------------------------------------------------------------------
function New-Badge($name, [scriptblock]$symbol) {
    $r = New-Canvas $Size
    $bmp = $r[0]; $g = $r[1]
    $c = $Size / 2.0

    $disc = New-Object System.Drawing.SolidBrush($green)
    $g.FillEllipse($disc, 0, 0, ($Size - 1), ($Size - 1))
    $disc.Dispose()

    & $symbol $g $c
    Save-Png $bmp $g $name
}

New-Badge 'playing' {
    param($g, $c)
    # Play triangle, nudged right so it sits optically centred rather than
    # mathematically centred -- a centred triangle always looks left-heavy.
    $s = $Size * 0.20
    $x = $c + ($s * 0.10)
    $pts = @(
        (New-Object System.Drawing.PointF(($x - $s * 0.45), ($c - $s))),
        (New-Object System.Drawing.PointF(($x - $s * 0.45), ($c + $s))),
        (New-Object System.Drawing.PointF(($x + $s * 0.95), $c))
    )
    $brush = New-Object System.Drawing.SolidBrush($black)
    $g.FillPolygon($brush, $pts)
    $brush.Dispose()
}

New-Badge 'paused' {
    param($g, $c)
    # Two bars drawn as thick round-capped lines, matching the rounded pause
    # glyph in the theme's own icon set.
    $h = $Size * 0.155
    $gap = $Size * 0.105
    $pen = New-Object System.Drawing.Pen($black, ($Size * 0.125))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($pen, ($c - $gap), ($c - $h), ($c - $gap), ($c + $h))
    $g.DrawLine($pen, ($c + $gap), ($c - $h), ($c + $gap), ($c + $h))
    $pen.Dispose()
}

Write-Host ""
Write-Host "assets written to: $OutDir" -ForegroundColor Cyan
Write-Host "upload them under Rich Presence -> Art Assets with these exact keys:"
Write-Host "  foobar2000   playing   paused"
