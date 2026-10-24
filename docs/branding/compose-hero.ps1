param([switch]$Force)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$basePath = Join-Path $PSScriptRoot 'hero-base.png'
$outputPath = Join-Path $PSScriptRoot 'hero.png'
$fontPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\app\assets\fonts\Saira.ttf'))
if ((Test-Path -LiteralPath $outputPath) -and -not $Force) { throw 'hero.png exists; review it before explicitly using -Force.' }
$source = [Drawing.Image]::FromFile($basePath)
$canvas = $null; $graphics = $null; $fonts = $null
$titleFont = $null; $taglineFont = $null; $labelFont = $null
$ink = $null; $muted = $null; $yellow = $null
try {
    # Minimal centered crop; keep native pixels rather than upscaling the image.
    $units = [Math]::Min([Math]::Floor($source.Width / 16), [Math]::Floor($source.Height / 9))
    if ($units -lt 60) { throw 'Generated base is too small for the repository hero.' }
    $width = [int]($units * 16); $height = [int]($units * 9)
    $cropX = [int][Math]::Floor(($source.Width - $width) / 2)
    $cropY = [int][Math]::Floor(($source.Height - $height) / 2)
    $canvas = [Drawing.Bitmap]::new($width, $height, [Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [Drawing.Graphics]::FromImage($canvas)
    $graphics.DrawImage($source, [Drawing.Rectangle]::new(0, 0, $width, $height), $cropX, $cropY, $width, $height, [Drawing.GraphicsUnit]::Pixel)
    $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $fonts = [Drawing.Text.PrivateFontCollection]::new()
    $fonts.AddFontFile($fontPath)
    $family = $fonts.Families[0]
    $titleSize = [single]($width * 0.081)
    $titleFont = [Drawing.Font]::new($family, $titleSize, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
    $taglineFont = [Drawing.Font]::new($family, [single]($width * 0.020), [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
    $labelFont = [Drawing.Font]::new($family, [single]($width * 0.011), [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
    $ink = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#202322'))
    $muted = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#4B514D'))
    $yellow = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#F5CA00'))
    $left = [single]($width * 0.065); $top = [single]($height * 0.095)
    $graphics.FillRectangle($yellow, [single]($left - $width * 0.016), [single]($top + $titleSize * 0.26), [single]($width * 0.004), [single]($titleSize * 0.65))
    $graphics.DrawString('Dictpin', $titleFont, $ink, $left, $top)
    $graphics.DrawString('Speak. Refine. Flow.', $taglineFont, $muted, [single]($left + 4), [single]($top + $titleSize * 1.20))
    $graphics.DrawString('CONCEPT ART / NOT A SOFTWARE SCREENSHOT', $labelFont, $muted, [single]($left + 4), [single]($height * 0.92))
    $canvas.Save($outputPath, [Drawing.Imaging.ImageFormat]::Png)
    [pscustomobject]@{ file = 'hero.png'; width = $width; height = $height; cropX = $cropX; cropY = $cropY; font = 'Saira'; wordmark = 'Dictpin'; tagline = 'Speak. Refine. Flow.' } | ConvertTo-Json
} finally {
    foreach ($resource in @($titleFont, $taglineFont, $labelFont, $ink, $muted, $yellow, $fonts, $graphics, $canvas, $source)) {
        if ($null -ne $resource) { $resource.Dispose() }
    }
}
