/**
 * V18/T18-04：从学生训练轨迹里挑出**平衡局面**的状态键。
 *
 * 为什么需要它：S3/S4 已证明改进信号只存在于「局面未定」的区域
 * （阶段 0-2/3-7、双方存活单位数之差 ≤1、双方都还有指挥官）。
 * T18-04 的第一波就要**优先覆盖这些高代价区域**，而不是把更多同样的均匀样本堆上去。
 *
 * 输出：每行一个 `stateHash|subjectPlayerId`，供 Python 侧按同一口径过滤已编码数据，
 * 保证「选状态」与「选编码行」用的是同一个判据。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v18/tools/extract_balanced_keys_v18.ts \
 *     --run-id run_20260927_v18_01 [--max-unit-diff 1]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAllianceId } from '../../src/game/rule_config';
import type { GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return fallback;
}

const RUN_ID = arg('--run-id', 'run_20260927_v18_01') as string;
const RUN_ROOT = path.resolve(`v18/out/${RUN_ID}`);
const V17_RUN = path.resolve('v17/out/v17_20260926_r2');
const MAX_UNIT_DIFF = Number(arg('--max-unit-diff', '1'));
const PHASE_ALLOW = (arg('--phase-allow', '0-2,3-7') as string).split(',').map((s) => s.trim());

const files = [0, 1, 2, 3, 4].map(
    (m) => path.join(V17_RUN, 'data', 'new_train', 'rollouts', `train_student_P1s2026.m${m}.jsonl`),
);

const keys: string[] = [];
const stats = {
    schema: 'v18_balanced_keys_1',
    runId: RUN_ID,
    maxUnitDiff: MAX_UNIT_DIFF,
    phaseAllow: PHASE_ALLOW,
    rowsRead: 0,
    balancedRows: 0,
    distinctKeys: 0,
    byPhase: {} as Record<string, number>,
    byMap: {} as Record<string, number>,
    byOutcome: {} as Record<string, number>,
    files: files.map((f) => path.basename(f)),
};
const seen = new Set<string>();

for (const file of files) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        let row: Record<string, unknown>;
        try {
            row = JSON.parse(t) as Record<string, unknown>;
        } catch {
            continue;
        }
        if (!row.stateJson) continue;
        stats.rowsRead += 1;
        const phase = String(row.phaseBucket);
        if (!PHASE_ALLOW.includes(phase)) continue;
        const state = JSON.parse(String(row.stateJson)) as GameState;
        const subjectPlayerId = Number(row.subjectPlayerId);
        const subjectAlliance = getAllianceId(state, subjectPlayerId);
        const alive = state.units.filter((u) => u.hp > 0);
        const own = alive.filter((u) => getAllianceId(state, u.ownerId) === subjectAlliance).length;
        const enemy = alive.filter((u) => getAllianceId(state, u.ownerId) !== subjectAlliance).length;
        if (Math.abs(own - enemy) > MAX_UNIT_DIFF) continue;
        const hasCommander = (allianceId: number): boolean => alive.some(
            (u) => getAllianceId(state, u.ownerId) === allianceId && u.unitClass === 'commander',
        );
        const enemyAlliances = [...new Set(state.players
            .map((p) => getAllianceId(state, p.id))
            .filter((a) => a !== subjectAlliance))];
        if (!hasCommander(subjectAlliance) || !enemyAlliances.some((a) => hasCommander(a))) continue;

        const key = `${String(row.stateHash)}|${subjectPlayerId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        keys.push(key);
        stats.balancedRows += 1;
        stats.byPhase[phase] = (stats.byPhase[phase] ?? 0) + 1;
        const mapName = String(row.mapName);
        stats.byMap[mapName] = (stats.byMap[mapName] ?? 0) + 1;
        const outcome = row.valueTarget === 1 ? 'win' : row.valueTarget === -1 ? 'loss' : 'other';
        stats.byOutcome[outcome] = (stats.byOutcome[outcome] ?? 0) + 1;
    }
}
stats.distinctKeys = keys.length;

const outDir = path.join(RUN_ROOT, 'data');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 't18_04_balanced_keys.txt');
fs.writeFileSync(outPath, `${keys.join('\n')}\n`, 'utf8');
fs.writeFileSync(path.join(outDir, 't18_04_balanced_keys.summary.json'), `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
    out: path.relative(process.cwd(), outPath).replace(/\\/g, '/'),
    rowsRead: stats.rowsRead,
    balancedKeys: stats.distinctKeys,
    byPhase: stats.byPhase,
    byOutcome: stats.byOutcome,
    byMap: stats.byMap,
}, null, 2));
