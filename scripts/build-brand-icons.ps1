# Rebuild browser and installed-app icons from the supplied Ssupertea logo.
# Run from the project root as PowerShell commands:
# & ([scriptblock]::Create((Get-Content scripts/build-brand-icons.ps1 -Raw)))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
$logoPath = Join-Path $projectRoot 'assets\brand\ssupertea-logo.jpg'
$iconDirectory = Join-Path $projectRoot 'assets\icons'
$sourceLogo = [System.Drawing.Bitmap]::FromFile($logoPath)

# Use the original stacked SS / UP / ER mark; the small surrounding words
# would be unreadable at tab-icon sizes. The source image stays unchanged.
$markBounds = [System.Drawing.RectangleF]::new(198, 202, 300, 575)

function New-BrandBitmap([int]$size, [double]$padding = 0.06) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $height = $size * (1 - 2 * $padding)
        $width = $height * $markBounds.Width / $markBounds.Height
        $destination = [System.Drawing.RectangleF]::new(
            ($size - $width) / 2, ($size - $height) / 2, $width, $height
        )
        $graphics.DrawImage($sourceLogo, $destination, $markBounds, [System.Drawing.GraphicsUnit]::Pixel)
    } finally {
        $graphics.Dispose()
    }
    return ,$bitmap
}

try {
    $pngIcons = @(
        @{ Path = (Join-Path $projectRoot 'favicon.png'); Size = 96; Padding = 0.06 },
        @{ Path = (Join-Path $iconDirectory 'icon-192.png'); Size = 192; Padding = 0.06 },
        @{ Path = (Join-Path $iconDirectory 'icon-512.png'); Size = 512; Padding = 0.06 },
        @{ Path = (Join-Path $iconDirectory 'apple-touch-icon.png'); Size = 180; Padding = 0.06 },
        # Keep the complete mark inside the maskable icon's central safe circle.
        @{ Path = (Join-Path $iconDirectory 'maskable-icon-512.png'); Size = 512; Padding = 0.15 }
    )
    foreach ($icon in $pngIcons) {
        $bitmap = New-BrandBitmap $icon.Size $icon.Padding
        try { $bitmap.Save($icon.Path, [System.Drawing.Imaging.ImageFormat]::Png) }
        finally { $bitmap.Dispose() }
    }

    # ICO contains native 16, 32 and 48 pixel images for desktop browser tabs.
    $frames = foreach ($size in @(16, 32, 48)) {
        $bitmap = New-BrandBitmap $size
        $buffer = [System.IO.MemoryStream]::new()
        try {
            $bitmap.Save($buffer, [System.Drawing.Imaging.ImageFormat]::Png)
            @{ Size = $size; Bytes = $buffer.ToArray() }
        } finally {
            $bitmap.Dispose()
            $buffer.Dispose()
        }
    }
    $iconStream = [System.IO.File]::Create((Join-Path $projectRoot 'favicon.ico'))
    $writer = [System.IO.BinaryWriter]::new($iconStream)
    try {
        $writer.Write([uint16]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]$frames.Count)
        $offset = 6 + 16 * $frames.Count
        foreach ($frame in $frames) {
            $writer.Write([byte]$frame.Size)
            $writer.Write([byte]$frame.Size)
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            $writer.Write([uint16]1)
            $writer.Write([uint16]32)
            $writer.Write([uint32]$frame.Bytes.Length)
            $writer.Write([uint32]$offset)
            $offset += $frame.Bytes.Length
        }
        foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Bytes) }
    } finally {
        $writer.Dispose()
        $iconStream.Dispose()
    }

    # Preserve the legacy SVG URL with the same cropped mark and white canvas.
    $logoData = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($logoPath))
    $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="white"/><svg x="138.46" y="30.72" width="235.08" height="450.56" viewBox="198 202 300 575"><image width="679" height="960" href="data:image/jpeg;base64,' + $logoData + '"/></svg></svg>'
    [System.IO.File]::WriteAllText((Join-Path $iconDirectory 'brand-icon.svg'), $svg)
} finally {
    $sourceLogo.Dispose()
}

Write-Output 'Built Ssupertea favicons and app icons from the original logo.'
