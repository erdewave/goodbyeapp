$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class GoodbyeAppIconReader {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern uint ExtractIconEx(string file, int index, out IntPtr large, out IntPtr small, uint count);
    [DllImport("user32.dll")]
    public static extern bool DestroyIcon(IntPtr icon);
}
'@
$payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())) | ConvertFrom-Json
$result = @{}
foreach ($item in $payload) {
    $large = [IntPtr]::Zero
    $small = [IntPtr]::Zero
    $bitmap = $null
    $icon = $null
    $stream = $null
    try {
        if (!(Test-Path -LiteralPath $item.file -PathType Leaf)) { continue }
        $count = [GoodbyeAppIconReader]::ExtractIconEx($item.file, [int]$item.index, [ref]$large, [ref]$small, 1)
        if ($count -eq 0) { continue }
        $handle = if ($large -ne [IntPtr]::Zero) { $large } else { $small }
        if ($handle -eq [IntPtr]::Zero) { continue }
        $icon = [Drawing.Icon]::FromHandle($handle)
        $bitmap = $icon.ToBitmap()
        $stream = New-Object IO.MemoryStream
        $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
        $result[$item.id] = 'data:image/png;base64,' + [Convert]::ToBase64String($stream.ToArray())
    } catch { } finally {
        if ($stream) { $stream.Dispose() }
        if ($bitmap) { $bitmap.Dispose() }
        if ($icon) { $icon.Dispose() }
        if ($large -ne [IntPtr]::Zero) { [void][GoodbyeAppIconReader]::DestroyIcon($large) }
        if ($small -ne [IntPtr]::Zero) { [void][GoodbyeAppIconReader]::DestroyIcon($small) }
    }
}
ConvertTo-Json -InputObject $result -Compress
