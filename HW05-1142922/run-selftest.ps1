# 建置後跑不開視窗的自我檢查，把報告印出來。用法：.\run-selftest.ps1 [每關場數]
param([int]$Games = 300)
$env:DOTNET_ROOT = 'D:\mid\.tools\dotnet6'
$env:DOTNET_MULTILEVEL_LOOKUP = '0'
$env:DOTNET_CLI_HOME = 'D:\mid\.tools\dotnethome'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
Set-Location $PSScriptRoot
& D:\mid\.tools\dotnet6\dotnet.exe build -c Release -v q --nologo | Select-String -Pattern 'error|warn|建置成功' | Select-Object -First 30
if ($LASTEXITCODE -ne 0) { exit 1 }
$report = Join-Path $env:TEMP 'hw05-selftest.txt'
$p = Start-Process -FilePath .\bin\Release\net6.0-windows\HW05-1142922.exe -ArgumentList '--selftest', "`"$report`"", $Games -Wait -PassThru
"exit=$($p.ExitCode)"
Get-Content $report -Encoding utf8 | Where-Object { $_ -notmatch '^pass' }
