# V19 接续任务 A 节：训练流程集成验收（微型训练，只验机制，不记为棋力波次）。
#
# 覆盖复核点名的四件事（对应 V19_NEXT_TASKS_20260929.md A.1–A.5）：
#   A1 谱系身份：**三段连续链** θ0 →T1→ θ1 →T2→ θ2 →T3→ θ3，每段的 init 必须等于该波采样时
#      的行为 SHA；另外单独记录一条 value-only 预热旁支（它**不应**被算成连续边）。
#   A2 价值预热：预热前后策略逐位相同、value 不同；**新 rollout 记录的是预热后的 value**。
#   A3 KL 早停：第一次 KL 超限后不再做这次更新，且本批后续 epoch 全部跳过（batches=0）。
#   A4 恢复一致性：采样中断后续跑，逐局 actionDigest 与不中断对照完全一致。
#
# 用法（仓库根目录）：
#   pwsh -NoProfile -ExecutionPolicy Bypass -File v19/scripts/t19a_training_flow_acceptance.ps1
param(
    [string]$RunId = 'run_20260929_v19_02',
    [string]$Map = '(2) Duel.aem'
)
$ErrorActionPreference = 'Stop'
$py = 'C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo
$env:PYTHONIOENCODING = 'utf-8'
$env:NODE_OPTIONS = '--openssl-legacy-provider'

$root = "v19/out/$RunId/acceptance"
if (Test-Path $root) { Remove-Item -Recurse -Force $root }
New-Item -ItemType Directory -Force -Path $root | Out-Null

$theta0 = 'v19/out/run_20260928_v19_01/experiments/migrated/P1_to_v19schema.json'

function Invoke-Collector {
    param([string]$Wave, [string]$Key, [string]$Model, [string]$OutDir, [string]$Extra = '',
          [string]$MapsOverride = '')
    $useMaps = if ($MapsOverride -ne '') { $MapsOverride } else { $Map }
    $argv = @(
        '--openssl-legacy-provider', 'v12/tools/run-tool.mjs', 'v19/rollout/collector.ts',
        '--wave', $Wave, '--run-id', $RunId, '--model-key', $Key, '--model', $Model,
        '--maps', $useMaps, '--seeds-per-map', '1', '--sample', 'true',
        '--chunk-size', '64', '--out-dir', $OutDir
    )
    if ($Extra -ne '') { $argv += $Extra.Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries) }
    & node @argv 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "[t19a] collector failed for $Key (exit=$LASTEXITCODE)" }
}

function Invoke-Ppo {
    param([string]$WaveDir, [string]$Key, [string]$Init, [string]$OutDir, [string]$Tag,
          [int]$Epochs, [string]$Lr, [string]$WaveId, [string]$Kind)
    & $py v19/training/ppo.py --wave-dir $WaveDir --key $Key --init-checkpoint $Init `
        --out-dir $OutDir --tag $Tag --epochs $Epochs --lr $Lr --run-id $RunId `
        --wave-id $WaveId --lineage-kind $Kind 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "[t19a] ppo failed for $Tag (exit=$LASTEXITCODE)" }
}

Write-Output '[t19a] 1/9 用 θ0 采 T1'
Invoke-Collector -Wave 910 -Key t1 -Model $theta0 -OutDir "$root/t1"
Write-Output '[t19a] 2/9 PPO(T1, init θ0) → θ1   [连续边 #1]'
Invoke-Ppo -WaveDir "$root/t1" -Key t1 -Init $theta0 -OutDir "$root/ppo1" -Tag theta1 `
    -Epochs 2 -Lr '2e-5' -WaveId 'tiny-1' -Kind 'continuous'
$theta1 = "$root/ppo1/theta1.json"

Write-Output '[t19a] 3/9 用 θ1 采 T2（必须由 θ1 采样，不能用 θ0）'
Invoke-Collector -Wave 911 -Key t2 -Model $theta1 -OutDir "$root/t2"
Write-Output '[t19a] 4/9 PPO(T2, init θ1) → θ2   [连续边 #2]'
Invoke-Ppo -WaveDir "$root/t2" -Key t2 -Init $theta1 -OutDir "$root/ppo2" -Tag theta2 `
    -Epochs 2 -Lr '2e-5' -WaveId 'tiny-2' -Kind 'continuous'
$theta2 = "$root/ppo2/theta2.json"

Write-Output '[t19a] 5/9 用 θ2 采 T3；PPO(T3, init θ2) → θ3   [连续边 #3]'
Invoke-Collector -Wave 912 -Key t3 -Model $theta2 -OutDir "$root/t3"
Invoke-Ppo -WaveDir "$root/t3" -Key t3 -Init $theta2 -OutDir "$root/ppo3" -Tag theta3 `
    -Epochs 2 -Lr '2e-5' -WaveId 'tiny-3' -Kind 'continuous'

Write-Output '[t19a] 6/9 价值预热旁支：在 T1 上预热 θ0 → θ0′，并用 θ0′ 采 Tw'
& $py v19/training/value_warmup.py --wave-dir "$root/t1" --key t1 --init-checkpoint $theta0 `
    --out-dir "$root/vw" --tag vw_t1 --epochs 6 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw '[t19a] value_warmup failed' }
$theta0p = "$root/vw/vw_t1.json"
Invoke-Collector -Wave 913 -Key tw -Model $theta0p -OutDir "$root/tw"

Write-Output '[t19a] 7/9 KL 早停对照（大 LR 强制超限；从 θ0 分出的诊断对照，不属于连续链）'
Invoke-Ppo -WaveDir "$root/t1" -Key t1 -Init $theta0 -OutDir "$root/ppo_kl" -Tag theta_kl `
    -Epochs 4 -Lr '1.0' -WaveId 'tiny-kl' -Kind 'diagnostic_branch'

# 显式旁支：在 T1（由 θ0 采样）上用**预热模型 θ0′** 初始化做 PPO。
# 此时 init(θ0′) ∉ behavior(θ0)，谱系必须如实标成 chainVerified=false —— 这就是「不能静默改起点」。
Write-Output '[t19a] 7b/9 显式旁支对照：PPO(T1, init θ0′)，谱系必须标为未接续'
Invoke-Ppo -WaveDir "$root/t1" -Key t1 -Init $theta0p -OutDir "$root/ppo_branch" -Tag theta_branch `
    -Epochs 1 -Lr '2e-5' -WaveId 'tiny-branch' -Kind 'value_warmup_branch'

Write-Output '[t19a] 8/9 中断—恢复一致性（A4）'
$resumeMaps = '(2) Duel.aem|(2) Mourningstar.aem'
Invoke-Collector -Wave 914 -Key ref -Model $theta1 -OutDir "$root/resume_ref" -MapsOverride $resumeMaps
Invoke-Collector -Wave 914 -Key res -Model $theta1 -OutDir "$root/resume_test" -MapsOverride $resumeMaps -Extra '--max-wall-minutes 1.2'
$partial = 0
if (Test-Path "$root/resume_test/res.games.jsonl") { $partial = (Get-Content "$root/resume_test/res.games.jsonl" | Measure-Object -Line).Lines }
Write-Output "[t19a] 中断时已完成 $partial 局，现在 resume 续跑"
Invoke-Collector -Wave 914 -Key res -Model $theta1 -OutDir "$root/resume_test" -MapsOverride $resumeMaps

Write-Output '[t19a] 9/9 汇总判定'
& $py v19/scripts/t19a_acceptance_verdict.py --root $root --run-id $RunId --out "$root/verdict.json"
$code = $LASTEXITCODE
exit $code
