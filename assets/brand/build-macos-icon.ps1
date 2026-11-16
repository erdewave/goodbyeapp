$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$destination = Join-Path $PSScriptRoot '../../src-tauri/icons/macos'
[IO.Directory]::CreateDirectory($destination) | Out-Null
$source = [Drawing.Image]::FromFile((Join-Path $PSScriptRoot 'goodbyeapp-icon.png'))
$frames = @()
try {
    # The artwork occupies 80% of the canvas, matching the neighboring Dock icons.
    foreach ($size in @(16, 32, 64, 128, 256, 512, 1024)) {
        $bitmap = [Drawing.Bitmap]::new($size, $size)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        $stream = [IO.MemoryStream]::new()
        try {
            $graphics.Clear([Drawing.Color]::Transparent)
            $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $inset = [int][Math]::Round($size * 0.1)
            $graphics.DrawImage($source, $inset, $inset, $size - 2 * $inset, $size - 2 * $inset)
            $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
            $frames += ,$stream.ToArray()
            $name = switch ($size) { 32 { '32x32.png' } 128 { '128x128.png' } 256 { '128x128@2x.png' } }
            if ($name) { [IO.File]::WriteAllBytes((Join-Path $destination $name), $stream.ToArray()) }
        } finally { $stream.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
    }
    $types = @('icp4', 'icp5', 'icp6', 'ic07', 'ic08', 'ic09', 'ic10')
    $output = [IO.MemoryStream]::new()
    try {
        function Write-BigEndian([int]$value) {
            $bytes = [BitConverter]::GetBytes($value)
            if ([BitConverter]::IsLittleEndian) { [Array]::Reverse($bytes) }
            $output.Write($bytes, 0, 4)
        }
        $output.Write([Text.Encoding]::ASCII.GetBytes('icns'), 0, 4)
        Write-BigEndian (8 + ($frames | ForEach-Object { $_.Length + 8 } | Measure-Object -Sum).Sum)
        for ($i = 0; $i -lt $types.Count; $i++) {
            $output.Write([Text.Encoding]::ASCII.GetBytes($types[$i]), 0, 4)
            Write-BigEndian ($frames[$i].Length + 8)
            $output.Write($frames[$i], 0, $frames[$i].Length)
        }
        [IO.File]::WriteAllBytes((Join-Path $destination 'icon.icns'), $output.ToArray())
    } finally { $output.Dispose() }
} finally { $source.Dispose() }
