# 最近一局收据落盘后停止本任务进程树，保留全部 SQLite 断点。
param([int]$CompletedBefore = 92)
$ErrorActionPreference = 'Stop'
$stage = 'C:\code\AncinetEmpires\ai_training\continuation_review_20261030\stage8'
$data = 'D:\AncientEmpiresData\continuation_stage8_20261110_v1'
$gen = Join-Path $data 'gen1'
while ((Get-ChildItem -LiteralPath $gen -Filter '*.receipt.json').Count -le $CompletedBefore) {
    if (-not (Get-Process -Id 33244 -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Seconds 10
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archive = Join-Path $stage "revisions\reboot-pause-$stamp"
New-Item -ItemType Directory -Force $archive | Out-Null
Copy-Item -LiteralPath (Join-Path $stage 'RUN_STATUS.json') -Destination (Join-Path $archive 'RUN_STATUS.before.json')
Copy-Item -LiteralPath (Join-Path $stage 'PROGRESS.json') -Destination (Join-Path $archive 'PROGRESS.json')
$all = Get-CimInstance Win32_Process
$controller = $all | Where-Object { $_.ProcessId -eq 33244 }
if ($controller) {
    if ($controller.CommandLine -notlike '*stage8*run.ts*') { throw '控制器 PID 身份不符' }
    $ids = [System.Collections.Generic.HashSet[int]]::new()
    [void]$ids.Add(33244)
    do {
        $added = $false
        foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $added = $true } }
    } while ($added)
    $owned = @($all | Where-Object { $ids.Contains([int]$_.ProcessId) } | Select-Object ProcessId,ParentProcessId,Name,CommandLine)
    $owned | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 (Join-Path $archive 'PROCESSES.before.json')
    taskkill /PID 33244 /T /F
    if (Get-Process -Id 33244 -ErrorAction SilentlyContinue) { throw '控制器停止失败' }
    $remaining = @($owned | Where-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue })
    if ($remaining.Count -ne 0) { throw '仍有本任务子进程未退出' }
}
$lock = Join-Path $data 'controller.lock'
if (Test-Path -LiteralPath $lock) {
    if ((Get-Content -LiteralPath $lock -Raw).Trim() -ne '33244') { throw '控制器锁身份变化' }
    Move-Item -LiteralPath $lock -Destination (Join-Path $data "controller.paused-$stamp.lock")
}
$env:AE_PAUSE_ARCHIVE = $archive
@'
const fs=require('node:fs'),path=require('node:path');const {DatabaseSync}=require('node:sqlite');
const stage='C:/code/AncinetEmpires/ai_training/continuation_review_20261030/stage8';
const dir='D:/AncientEmpiresData/continuation_stage8_20261110_v1/gen1';const checks=[];
for(const name of fs.readdirSync(dir).filter(n=>/^s8-.*\.sqlite$/.test(n))){
 const db=new DatabaseSync(path.join(dir,name),{readOnly:true});
 try{const integrity=db.prepare('PRAGMA quick_check').get().quick_check;if(integrity!=='ok')throw Error(name+': '+integrity);
 const raw=db.prepare('SELECT identity,value FROM progress WHERE id=1').get();const p=JSON.parse(raw.value);
 checks.push({file:name,identity:raw.identity,step:p.step,turn:p.state.turn,complete:p.complete,natural:p.natural});
 }finally{db.close();}
}
const receipt={paused:true,reason:'用户要求重启电脑，最近一局结束后暂停',at:new Date().toISOString(),controllerExited:true,taskChildrenExited:true,checks,
 completed:checks.filter(x=>x.complete).length,natural:checks.filter(x=>x.natural).length,incomplete:checks.filter(x=>!x.complete).length,deletedGames:0};
fs.writeFileSync(path.join(process.env.AE_PAUSE_ARCHIVE,'PAUSE_RECEIPT.json'),JSON.stringify(receipt,null,2));
fs.writeFileSync(path.join(stage,'PAUSE_RECEIPT.json'),JSON.stringify(receipt,null,2));
fs.writeFileSync(path.join(stage,'RUN_STATUS.json'),JSON.stringify({phase:'paused',reason:receipt.reason,at:receipt.at,generation:1,completed:receipt.completed,incomplete:receipt.incomplete,stopRetained:true,sealedAccess:0},null,2));
console.log(JSON.stringify({paused:true,completed:receipt.completed,natural:receipt.natural,incomplete:receipt.incomplete,databases:checks.length}));
'@ | node -
if ($LASTEXITCODE -ne 0) { throw '暂停后完整性审计失败' }
