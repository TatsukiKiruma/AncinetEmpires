Set-Location -LiteralPath 'C:\code\AncinetEmpires'
& 'C:\Program Files\nodejs\node.exe' --openssl-legacy-provider --import tsx 'ai_training/hard_gap_pc32_320_20261029_v1/drive.ts' 1> 'C:\code\AncinetEmpires\ai_training\hard_gap_pc32_320_20261029_v1\driver.stdout.log' 2> 'C:\code\AncinetEmpires\ai_training\hard_gap_pc32_320_20261029_v1\driver.stderr.log'
$pc320ExitCode = $LASTEXITCODE
@{exitCode=$pc320ExitCode; exited=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath 'C:\code\AncinetEmpires\ai_training\hard_gap_pc32_320_20261029_v1\LAUNCHER_EXIT.json'
exit $pc320ExitCode
