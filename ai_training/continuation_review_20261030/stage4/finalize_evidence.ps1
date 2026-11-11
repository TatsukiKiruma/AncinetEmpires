param([Parameter(Mandatory = $true)][int]$ControllerHostPid)
$ErrorActionPreference = 'Stop'
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
# 等隐藏宿主及其同步控制器真正退出后再哈希日志，避免最后一行输出改变证据摘要。
$stage4Host = Get-Process -Id $ControllerHostPid -ErrorAction SilentlyContinue
if ($null -ne $stage4Host) { $stage4Host.WaitForExit() }
Set-Location -LiteralPath 'C:\code\AncinetEmpires'
@'
import fs from 'node:fs';
import path from 'node:path';
import { evidence } from './ai_training/continuation_review_20261030/stage4/analysis.ts';
import { HERE, read, save } from './ai_training/continuation_review_20261030/stage4/io.ts';
const completed = fs.existsSync(path.join(HERE, 'RUN_CLOSED.json'));
const started = read(path.join(HERE, 'RUN_STARTED_V2.json'));
let stillRunning = false;
try { process.kill(started.pid, 0); stillRunning = true; } catch {}
if (stillRunning) throw Error('控制器尚未退出，拒绝提前封存最终日志摘要');
await save(path.join(HERE, 'EVIDENCE_FINALIZED.json'), { completed, controllerPid: started.pid, controllerExited: true, finalized: new Date().toISOString(), note: '控制器退出、stdout和stderr全部关闭后重新核对最终文件摘要；没有修改模型、配置或对局结果' }, true);
await evidence();
'@ | & node --import tsx --input-type=module
if ($LASTEXITCODE -ne 0) { throw '最终证据摘要核验失败' }
