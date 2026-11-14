# 建置後不開視窗，把各個畫面畫成 PNG 並量每格耗時。用法：.\run-shots.ps1 輸出資料夾
param([Parameter(Mandatory = $true)][string]$Dir)
$env:DOTNET_ROOT = 'D:\mid\.tools\dotnet6'
$env:DOTNET_MULTILEVEL_LOOKUP = '0'
$env:DOTNET_CLI_HOME = 'D:\mid\.tools\dotnethome'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
Set-Location $PSScriptRoot
& D:\mid\.tools\dotnet6\dotnet.exe build -c Release -v q --nologo | Select-String -Pattern 'error|warn|建置成功' | Select-Object -First 30
if ($LASTEXITCODE -ne 0) { exit 1 }
if (Test-Path $Dir) { Remove-Item $Dir -Recurse -Force -Confirm:$false }
$p = Start-Process -FilePath .\bin\Release\net6.0-windows\HW05-1142922.exe -ArgumentList '--shots', "`"$Dir`"" -Wait -PassThru
"exit=$($p.ExitCode)"
Get-Content (Join-Path $Dir 'timing.txt')
