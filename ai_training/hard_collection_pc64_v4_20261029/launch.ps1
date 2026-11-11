Set-Location -LiteralPath 'C:\code\AncinetEmpires'
& 'C:\Program Files\nodejs\node.exe' --openssl-legacy-provider --import tsx 'ai_training/hard_collection_pc64_v4_20261029/drive.ts' 1> 'C:\code\AncinetEmpires\ai_training\hard_collection_pc64_v4_20261029\driver-001.stdout.log' 2> 'C:\code\AncinetEmpires\ai_training\hard_collection_pc64_v4_20261029\driver-001.stderr.log'
$pc64ExitCode = $LASTEXITCODE
@{exitCode=$pc64ExitCode; exited=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath 'C:\code\AncinetEmpires\ai_training\hard_collection_pc64_v4_20261029\LAUNCHER_EXIT.json'
exit $pc64ExitCode
