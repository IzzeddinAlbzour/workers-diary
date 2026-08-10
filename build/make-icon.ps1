Add-Type -AssemblyName System.Drawing
$size = 1024
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'

# rounded-square background, app blue
$bg = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 220; $w = $size
$bg.AddArc(0,0,$r,$r,180,90); $bg.AddArc($w-$r,0,$r,$r,270,90)
$bg.AddArc($w-$r,$w-$r,$r,$r,0,90); $bg.AddArc(0,$w-$r,$r,$r,90,90)
$bg.CloseFigure()
$brushBg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(11,35,68))
$g.FillPath($brushBg, $bg)

# hard hat: yellow dome + brim
$yellow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(247,181,0))
$yellowD = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(214,150,0))
# dome (top half of ellipse)
$g.FillPie($yellow, 212, 260, 600, 560, 180, 180)
# center ridge
$g.FillRectangle($yellowD, 472, 250, 80, 180)
$g.FillPie($yellowD, 472, 210, 80, 80, 180, 180)
# brim
$g.FillEllipse($yellow, 132, 490, 760, 130)
# face line under brim - clipboard strip (white lines = diary)
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 255,255,255))
$g.FillRectangle($white, 322, 700, 380, 34)
$g.FillRectangle($white, 322, 776, 300, 34)

$g.Dispose()
$bmp.Save("$PSScriptRoot\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "icon.png written"
