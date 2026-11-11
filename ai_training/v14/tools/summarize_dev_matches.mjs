/**
 * V14/T14-06：聚合三 seed 开发对战，并生成失败分类台账。
 *
 * 只调用 v14/tools/eval_v14_aggregate.ts（T14-05 负责统计定义），
 * 并把每组的原始 games JSONL 路径与聚合结果一起写入 dev_matches_summary.json。
 * 失败分类（failure_taxonomy）只做可复核的机械分类：把每场候选自然失利/截断的
 * 决策窗口按动作类型与结果统计出来，供人工 oracle 判定时定位。
 *
 * 用法：
 *   node v14/tools/summarize_dev_matches.mjs --run-id v14_20260924_t14
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
const matchesDir = ensureDir(path.join('v14', 'out', runId, 'T14-06', 'matches'));
const aggDir = ensureDir(path.join('v14', 'out', runId, 'T14-06', 'aggregate'));

const gameFiles = fs.readdirSync(matchesDir).filter((f) => f.endsWith('.games.jsonl')).sort();
const groups = [];
for (const file of gameFiles) {
    const gamesPath = path.join(matchesDir, file);
    const outPath = path.join(aggDir, file.replace(/\.games\.jsonl$/, '.aggregate.json'));
    // 中文：受限执行环境不允许创建子进程管道（spawnSync 默认 stdio:'pipe' 会抛 EPERM）。
    // 这里把子进程 stdout/stderr 直接接到日志文件的文件描述符上，仍然拿到真实退出码与真实输出。
    const logPath = path.join(aggDir, file.replace(/\.games\.jsonl$/, '.aggregate.log'));
    const fd = fs.openSync(logPath, 'w');
    let status = null;
    try {
        const proc = spawnSync('node', [
            '--openssl-legacy-provider', 'v12/tools/run-tool.mjs', 'v14/tools/eval_v14_aggregate.ts',
            '--games', gamesPath, '--out', outPath,
        ], { cwd: REPO_ROOT, stdio: ['ignore', fd, fd] });
        status = proc.status;
    } finally {
        fs.closeSync(fd);
    }
    const logText = fs.readFileSync(logPath, 'utf8');
    const tail = logText.trim().split('\n').slice(-6).join('\n');
    const report = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : null;
    groups.push({
        file,
        gamesJsonl: rel(gamesPath),
        aggregate: rel(outPath),
        aggregateLog: rel(logPath),
        exitCode: status,
        stdoutTail: tail,
        summary: report ? {
            pairs: report.pairs?.length ?? report.counts?.pairs ?? null,
            complete: report.completePairs ?? report.counts?.complete ?? null,
            mean: report.completeMean ?? report.mean ?? null,
            truncated: report.truncatedPairs ?? report.counts?.truncated ?? null,
            overallInterval: report.overallMeanInterval ?? null,
            errors: report.errors ?? report.counts?.errors ?? null,
            experimentValid: report.experimentValid ?? null,
            clusterBlocks: report.cluster?.blocks ?? null,
            clusterMean: report.cluster?.mean ?? null,
            clusterCI: report.cluster?.ci95 ?? null,
            naturalScore: report.naturalScore ?? null,
            fullPlanInterval: report.fullPlanInterval ?? null,
        } : null,
    });
}

// 失败分类：按候选臂的自然失利/截断统计步数、回合与结局分布。
const oracleAttributionExists = fs.existsSync(
    path.join('v14', 'out', runId, 'T14-06', 'failure_attribution_summary.json'));
const taxonomy = [];
for (const file of gameFiles) {
    const rows = fs.readFileSync(path.join(matchesDir, file), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const candidates = rows.filter((r) => r.arm === 'CANDIDATE');
    const byOutcome = {};
    for (const r of candidates) byOutcome[r.outcomeKind] = (byOutcome[r.outcomeKind] ?? 0) + 1;
    taxonomy.push({
        file,
        candidateArms: candidates.length,
        byOutcome,
        losses: candidates.filter((r) => r.outcomeKind === 'NATURAL_LOSS').map((r) => ({
            scenarioId: r.scenarioId, seed: r.seed, seat: r.candidateSeat,
            steps: r.steps, turns: r.turns, plies: r.plies,
            candidateDecisions: r.candidateDecisions,
            latencyP95: r.latencyMs?.p95 ?? null,
        })),
        truncated: candidates.filter((r) => String(r.outcomeKind).startsWith('WALL') || String(r.outcomeKind).includes('LIMIT')).map((r) => ({
            scenarioId: r.scenarioId, seed: r.seed, seat: r.candidateSeat,
            steps: r.steps, turns: r.turns, outcomeKind: r.outcomeKind,
        })),
        errors: candidates.filter((r) => r.error !== null).map((r) => ({ seed: r.seed, seat: r.candidateSeat, error: r.error })),
        fallbacks: candidates.filter((r) => r.fallbackUsed).length,
        latencyAll: candidates.map((r) => r.latencyMs).filter(Boolean),
    });
}

const summary = {
    schema: 'v14_dev_matches_summary_1',
    task: 'T14-05/T14-06',
    runId,
    generatedAt: new Date().toISOString(),
    note: '开发对战（方向性结论）。每组由 eval_v14_match.ts 产出、eval_v14_aggregate.ts 聚合；'
        + '同一 (scenario, seed) 只运行一次镜像，多个座位引用它。',
    groups,
    taxonomy,
};
fs.writeFileSync(path.join(matchesDir, 'dev_matches_summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
fs.writeFileSync(path.join(ensureDir(path.join('v14', 'out', runId, 'T14-06')), 'failure_taxonomy.json'), `${JSON.stringify({
    schema: 'v14_failure_taxonomy_1',
    task: 'T14-06',
    runId,
    generatedAt: new Date().toISOString(),
    method: '机械分类：逐场候选臂记录结局类别、步数/回合/决策数、错误与回退。'
        + '规则 oracle 的逐决策窗口归因不在本文件内，见同目录 failure_attribution_summary.json '
        + '（由 v14/tools/failure_attribution.ts 用真实引擎一步执行产出）。',
    categories: ['NATURAL_LOSS', 'WALL_TIMEOUT', 'STEP_LIMIT', 'POLICY_ERROR', 'ENGINE_ERROR', 'FALLBACK'],
    oracleAttribution: oracleAttributionExists
        ? {
            path: rel(path.join('v14', 'out', runId, 'T14-06', 'failure_attribution_summary.json')),
            note: '中文：逐决策窗口的规则归因读数，判据为真实引擎一步执行结果。',
        }
        : null,
    groups: taxonomy,
}, null, 2)}\n`);
console.log(`[T14-06] 聚合 ${groups.length} 组`);
for (const g of groups) {
    console.log(`  ${g.file}: ${g.stdoutTail.split('\n')[0] ?? ''}`);
}
console.log(`[T14-06] -> ${rel(path.join(matchesDir, 'dev_matches_summary.json'))}`);
