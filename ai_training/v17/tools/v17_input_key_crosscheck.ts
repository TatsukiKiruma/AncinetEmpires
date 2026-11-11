/**
 * V17/T17-01：网络输入身份的**跨实现交叉验证**。
 *
 * 中文：T17-01 的数据集与 T17-03 的 B100 教师必须对「同一个状态是不是同一个网络输入」
 * 给出同一个答案，否则 B0/B1 的 join 会静默失配。本工具对同一批真实采集状态同时跑两条
 * 路径并逐条断言相等：
 *
 *   A. 数据集构建路径（`build_v17_dataset.ts`）：合法集按 actionCode 规范排序后编码候选。
 *   B. 教师路径（`v17/teachers/b100_input_key.ts#b100PolicyInputKeySafe`）：引擎原生顺序、
 *      不做规范排序。
 *
 * 两条路径都调用同一个 `policyInputKeyHexV17`，因此本验证真正检查的是
 * 「候选集合相同 + 顺序无关性 + 编码参数一致」，而不是复述同一个断言。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/v17_input_key_crosscheck.ts --rollouts a.jsonl,b.jsonl --limit 25 --out v17/out/v17_20260926_r2/identity/new_input_key_crosscheck.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial,
    ENCODER_SCHEMA_ID_V15,
} from '../../src/game/ai/spatial_tensor_encoder';
import { encodeAction } from '../../src/game/env';
import { GameEngine } from '../../src/game/engine';
import { compareActionCodeCanonicalV16 } from '../../src/game/ai/action_ordering';
import { policyInputKeyHexV17, V17_INPUT_IDENTITY_ID } from './v17_input_identity';
import { b100PolicyInputKeySafe } from '../teachers/b100_input_key';
import type { Action, GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return fallback;
}

const FILES = (arg('--rollouts', '') as string).split(',').map((s) => s.trim()).filter(Boolean);
const LIMIT = Number(arg('--limit', '25'));
const OUT = arg('--out', 'v17/out/v17_20260926_r2/identity/new_input_key_crosscheck.json') as string;

async function* readLines(file: string): AsyncGenerator<string> {
    const rl = readline.createInterface({
        input: fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 22 }),
        crlfDelay: Infinity,
    });
    for await (const line of rl) if (line.trim()) yield line;
}

interface CaseResult {
    sampleId: string;
    mapName: string;
    subjectPlayerId: number;
    stepIndex: number;
    candidates: number;
    keyDatasetPath: string;
    keyTeacherPath: string;
    equal: boolean;
}

const cases: CaseResult[] = [];
let scanned = 0;
const startedAt = Date.now();

for (const file of FILES) {
    if (cases.length >= LIMIT) break;
    const abs = path.resolve(file);
    if (!fs.existsSync(abs)) throw new Error(`[T17-01] rollout 文件不存在：${abs}`);
    for await (const line of readLines(abs)) {
        if (cases.length >= LIMIT) break;
        scanned += 1;
        const row = JSON.parse(line) as {
            gameId: string; stateJson: string; subjectPlayerId: number; mapName: string; stepIndex: number;
        };
        const state = JSON.parse(row.stateJson) as GameState;
        const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
        if (engine.isTerminal()) continue;
        // 引擎原生顺序的合法集（去 surrender）—— 教师路径的输入。
        const allowed: Action[] = engine.getLegalActions(row.subjectPlayerId).filter((a) => a.type !== 'surrender');
        if (allowed.length === 0) continue;

        // ---- 路径 A：数据集构建路径（先规范排序） ----
        const decorated = allowed.map((action) => ({ action, code: encodeAction(action) }));
        decorated.sort((a, b) => compareActionCodeCanonicalV16(a.code, b.code));
        const spatial = encodeGameStateSpatial(state, row.subjectPlayerId, 'v2', { channels: 26 });
        const candidatesA = decorated.map((d) => {
            const f = encodeCandidateActionSpatial(state, row.subjectPlayerId, d.action, 'v2', 'v15_current');
            return {
                actorCoord: f.actorCoord ?? null,
                landingCoord: f.landingCoord ?? null,
                targetCoord: f.targetCoord ?? null,
                semantics: Array.from(f.semantics),
            };
        });
        const keyA = policyInputKeyHexV17(spatial.spatialTensor, spatial.globalFeatures, candidatesA);

        // ---- 路径 B：教师路径（原生顺序，独立函数） ----
        const teacher = b100PolicyInputKeySafe(state, row.subjectPlayerId, allowed);

        cases.push({
            sampleId: row.gameId,
            mapName: row.mapName,
            subjectPlayerId: row.subjectPlayerId,
            stepIndex: row.stepIndex,
            candidates: allowed.length,
            keyDatasetPath: keyA,
            keyTeacherPath: teacher.key,
            equal: teacher.key === keyA,
        });
    }
}

const mismatches = cases.filter((c) => !c.equal);
const result = {
    schema: 'v17_input_key_crosscheck_1',
    task: 'T17-01',
    identityId: V17_INPUT_IDENTITY_ID,
    encoderSchemaId: ENCODER_SCHEMA_ID_V15,
    generatedAt: new Date().toISOString(),
    rolloutFiles: FILES.map((f) => f.replace(/\\/g, '/')),
    requestedCases: LIMIT,
    scannedRows: scanned,
    comparedCases: cases.length,
    mismatches: mismatches.length,
    wallSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    pathA: 'build_v17_dataset.ts（合法集按 actionCode 规范排序 → encodeCandidateActionSpatial v2/v15_current）',
    pathB: 'v17/teachers/b100_input_key.ts#b100PolicyInputKeySafe（引擎原生顺序）',
    cases,
    note: '两条路径共用 policyInputKeyHexV17，本验证检查候选集合/顺序无关性/编码参数一致；'
        + '若 mismatch>0，T17-01 数据与 B100 教师标签无法 join，必须先修再训练。',
};
const outPath = path.resolve(OUT);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(`[T17-01] 输入身份交叉验证：比较 ${cases.length} 个状态，mismatch=${mismatches.length} → ${outPath}`);
if (cases.length === 0) {
    console.error('[T17-01] 没有可比较的状态。');
    process.exit(1);
}
if (mismatches.length > 0) {
    console.error(JSON.stringify(mismatches.slice(0, 3), null, 2));
    process.exit(1);
}
