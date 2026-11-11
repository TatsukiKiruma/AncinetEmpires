Set-Location -LiteralPath 'C:\code\AncinetEmpires'
& 'C:\Program Files\nodejs\node.exe' --openssl-legacy-provider --import tsx 'ai_training/hard_gap_pc32_288_resume_20261029_v1/drive.ts' 1> 'D:\AncientEmpiresData\collection_20261029_pc32_resume288_v1\driver.stdout.log' 2> 'D:\AncientEmpiresData\collection_20261029_pc32_resume288_v1\driver.stderr.log'
$pc288ExitCode = $LASTEXITCODE
@{exitCode=$pc288ExitCode; exited=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath 'D:\AncientEmpiresData\collection_20261029_pc32_resume288_v1\LAUNCHER_EXIT.json'
exit $pc288ExitCode
