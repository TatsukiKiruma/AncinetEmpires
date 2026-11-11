/**
 * V14/T14-06：三 seed 开发对战驱动脚本。
 *
 * 按 T14-05 的开发强度默认值执行：至少 1 张 2p + 1 张 3p 地图、各 4 个开发 seeds、全座位、
 * 三个模型 seed 都测。每个 (scenario, seed) 只运行一次镜像（由 runner 负责），
 * 候选臂替换单个座位。
 *
 * 用法：
 *   node v14/tools/run_dev_matches.mjs --run-id v14_20260924_t14 [--seeds 1,2,3,4] [--maps 2p,3p]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, ensureDir, rel } from './identity_lib.mjs';

const args = process.argv.slice(2);
function argOf(name, fallback) {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const runId = argOf('--run-id', 'v14_20260924_t14');
const seeds = argOf('--seeds', '1,2,3,4');
const maxSteps = argOf('--max-steps', '20000');
// 中文：3p 的 wall cap 在本轮被提高（默认 300000ms）。
// 依据：上一轮用 60s wall cap 时，3p Frozen fields 的 12 对里只有 1 对自然完成
// （完成率 8.3%），几乎所有对局都停在 engineTransitions=7598 附近的同一步，
// 说明预算在长局上先于规则终局耗尽；截断不能当胜负，于是 3p 强度结论无法产生。
// 提高 wall cap 只影响「允许跑多久」，不改变候选或对手的策略，也不改变 step cap。
const wallMs = argOf('--wall-ms', '300000');
const which = argOf('--maps', '2p,3p');
const modelsArg = argOf('--model-seeds', '42,1337,2026');

const SCENARIOS = {
    '2p': { id: 'SDPLAN:sd-normal:(2) Duel.aem', short: 'duel2p', seats: 2 },
    '3p': { id: 'SDPLAN:sd-normal:(3) Frozen fields.aem', short: 'frozen3p', seats: 3 },
};

const MODELS = [
    { seed: 42, file: 'v14/out/' + runId + '/T14-06/c1_s42/c1_s42_best.json' },
    { seed: 1337, file: 'v14/out/' + runId + '/T14-06/c1_s1337/c1_s1337_best.json' },
    { seed: 2026, file: 'v14/out/' + runId + '/T14-06/c1_s2026/c1_s2026_best.json' },
].filter((m) => modelsArg.split(',').map((s) => Number(s.trim())).includes(m.seed));

const outDir = ensureDir(path.join('v14', 'out', runId, 'T14-06', 'matches'));
const runs = [];
const keys = which.split(',').map((s) => s.trim()).filter((k) => SCENARIOS[k]);
// 中文：本仓库的受限执行环境不允许创建子进程管道（Node 的 spawnSync 默认
// stdio:'pipe' 会抛 EPERM，这是环境限制而不是命令失败）。因此默认把每条对局命令
// 的输出重定向到当次 run 目录下的日志文件，用文件描述符作为 stdio —— 不创建管道，
// 但仍拿到真实退出码。需要保留继承式输出时传 --stdio inherit。
const stdioMode = argOf('--stdio', 'file');
const logDir = ensureDir(path.join('v14', 'out', runId, 'T14-06', 'match_logs'));

for (const key of keys) {
    const scenario = SCENARIOS[key];
    for (const model of MODELS) {
        const abs = path.join(REPO_ROOT, model.file);
        if (!fs.existsSync(abs)) {
            console.error(`[T14-06] 缺少候选检查点 ${model.file}；跳过该 seed。`);
            continue;
        }
        const out = path.join(outDir, `${scenario.short}_c1s${model.seed}.games.jsonl`);
        const cmd = [
            '--openssl-legacy-provider', 'v12/tools/run-tool.mjs', 'v14/tools/eval_v14_match.ts',
            '--run-id', runId,
            '--scenario', scenario.id,
            '--seeds', seeds,
            '--candidate-seat', 'all',
            '--seat-count', String(scenario.seats),
            '--max-steps', maxSteps,
            '--wall-ms', wallMs,
            '--candidate', model.file,
            '--out', out,
        ];
        const started = Date.now();
        console.log(`\n[T14-06] === ${scenario.short} modelSeed=${model.seed} wallMs=${wallMs} ===`);
        let status = null;
        if (stdioMode === 'inherit') {
            const proc = spawnSync('node', cmd, { cwd: REPO_ROOT, stdio: 'inherit' });
            status = proc.status;
        } else {
            const logPath = path.join(logDir, `${scenario.short}_c1s${model.seed}.log`);
            const fd = fs.openSync(logPath, 'w');
            try {
                const proc = spawnSync('node', cmd, { cwd: REPO_ROOT, stdio: ['ignore', fd, fd] });
                status = proc.status;
            } finally {
                fs.closeSync(fd);
            }
            console.log(`[T14-06] 输出日志：${rel(logPath)}`);
        }
        runs.push({
            scenarioKey: key,
            scenarioId: scenario.id,
            modelSeed: model.seed,
            candidate: model.file,
            gamesJsonl: rel(out),
            exitCode: status,
            elapsedMs: Date.now() - started,
            wallTimeoutMs: Number(wallMs),
        });
        if (status !== 0) {
            console.error(`[T14-06] ${scenario.short} modelSeed=${model.seed} 退出码 ${status}`);
        }
    }
}

fs.writeFileSync(path.join(outDir, 'dev_matches_manifest.json'), `${JSON.stringify({
    schema: 'v14_dev_matches_manifest_1',
    task: 'T14-06',
    runId,
    generatedAt: new Date().toISOString(),
    seeds,
    maxSteps,
    wallTimeoutMs: wallMs,
    protocolRef: 'v14/tools/eval_v14_protocol.ts（镜像缓存键含全部配置）',
    runs,
}, null, 2)}\n`);
console.log(`\n[T14-06] 开发对战完成：${runs.length} 组运行 -> ${rel(outDir)}`);
