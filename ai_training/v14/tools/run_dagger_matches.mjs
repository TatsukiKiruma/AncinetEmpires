/**
 * V14/T14-08：D0/D1/D2 与基线 C1 的开发对战驱动。
 *
 * 每组在同一开发协议（2p Duel，4 seeds，全座位）下运行，输出可直接被
 * eval_v14_aggregate.ts 聚合的 games JSONL。
 *
 * 用法：
 *   node v14/tools/run_dagger_matches.mjs --run-id v14_20260924_t14 [--seeds 1,2,3,4]
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
const scenarioId = argOf('--scenario', 'SDPLAN:sd-normal:(2) Duel.aem');
const short = argOf('--short', 'duel2p');
const maxSteps = argOf('--max-steps', '20000');
const wallMs = argOf('--wall-ms', '60000');

const groups = ['D0', 'D1', 'D2'];
const outDir = ensureDir(path.join('v14', 'out', runId, 'T14-08', 'matches'));
const runs = [];
for (const group of groups) {
    const candidate = path.join('v14', 'out', runId, 'T14-08', `run_${group}`, `${group}_last.json`);
    if (!fs.existsSync(path.join(REPO_ROOT, candidate))) {
        console.error(`[T14-08] 缺少 ${candidate}；跳过 ${group}`);
        continue;
    }
    const out = path.join(outDir, `${short}_${group}.games.jsonl`);
    console.log(`\n[T14-08] === ${group} ===`);
    const proc = spawnSync('node', [
        '--openssl-legacy-provider', 'v12/tools/run-tool.mjs', 'v14/tools/eval_v14_match.ts',
        '--run-id', runId,
        '--scenario', scenarioId,
        '--seeds', seeds,
        '--candidate-seat', 'all',
        '--seat-count', '2',
        '--max-steps', maxSteps,
        '--wall-ms', wallMs,
        '--candidate', candidate,
        '--out', out,
    ], { cwd: REPO_ROOT, stdio: 'inherit' });
    runs.push({ group, candidate, gamesJsonl: rel(out), exitCode: proc.status });
}
fs.writeFileSync(path.join(outDir, 'dagger_matches_manifest.json'), `${JSON.stringify({
    schema: 'v14_dagger_matches_manifest_1',
    task: 'T14-08',
    runId,
    generatedAt: new Date().toISOString(),
    seeds,
    scenarioId,
    maxSteps,
    wallTimeoutMs: wallMs,
    runs,
}, null, 2)}\n`);
console.log(`\n[T14-08] 纠错对照对战完成：${runs.length} 组`);
