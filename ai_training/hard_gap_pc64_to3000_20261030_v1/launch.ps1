Set-Location -LiteralPath 'C:\code\AncinetEmpires'
& 'C:\Program Files\nodejs\node.exe' --openssl-legacy-provider --import tsx 'ai_training/hard_gap_pc64_to3000_20261030_v1/handoff.ts' 1> 'D:\AncientEmpiresData\collection_20261030_pc64_to3000_v1\handoff.stdout.log' 2> 'D:\AncientEmpiresData\collection_20261030_pc64_to3000_v1\handoff.stderr.log'
$pc64To3000ExitCode = $LASTEXITCODE
@{exitCode=$pc64To3000ExitCode; exited=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath 'D:\AncientEmpiresData\collection_20261030_pc64_to3000_v1\LAUNCHER_EXIT.json'
exit $pc64To3000ExitCode
