/**
 * V16/T16-04 阶段 3/4：给对照核心集打 S1 教师标签并合并回数据集（owner：T16-04）。
 *
 * 为什么要分两步：S1 一次查询 p50 约 1–2 秒，6,400 个核心状态必须能**多进程分片**跑。
 * 因此 `--mode label` 只输出标签文件（可 shard），`--mode apply` 再把标签合并进数据集。
 *
 * 标签合同（任务书 §6.3 / §8.2）：
 * - `searchActionCode`：教师选择的动作；
 * - `evaluatedActionCodes` + `searchScores` + `searchMask`：**只有真正被搜索到的候选**才有分数，
 *   未被搜索的候选是 `null`，并由 `searchMask` 标 false —— 绝不填 0 冒充「劣势」；
 * - `searchScoreScale`：分数是叶评估原始量纲（不是概率、不是胜率），soft/排序损失必须先按固定
 *   规则归一再用温度，终局 ±1e9 单独转成终局优先标签（不在 softmax 里和材料分混用）；
 * - `teacherVersion` / `teacherTier` / `teacherSeed`（确定性常量）/ `teacherBudget` /
 *   `reachedBoundary` / `labelConfidence`：资格信息逐行留痕。
 *
 * 用法：
 *   # 分片打标签
 *   node ... v16/tools/label_core_s1_v16.ts --mode label --core <core_set.json> \
 *     --rollouts a.jsonl,b.jsonl --tier S1a --shard 0/8 --out <labels.0of8.jsonl>
 *   # 合并
 *   node ... v16/tools/label_core_s1_v16.ts --mode apply --dataset <train.jsonl> \
 *     --labels l0.jsonl,l1.jsonl --out <train.labelled.jsonl>
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { CANDIDATE_ORDERING_ID_V16, compareActionCodeCanonicalV16 } from '../../src/game/ai/action_ordering';
import { S1_TERMINAL_LOSS, S1_TERMINAL_WIN, S1_TEACHER_VERSION, S1_TIERS, searchS1Action } from './teacher_s1_v16';
import type { GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return fallback;
}

const MODE = arg('--mode', 'label') as 'label' | 'apply';
const TIER = arg('--tier', 'S1a') as string;
const WALL_MS = Number(arg('--wall-ms', '30000'));
const SHARD = arg('--shard', null);
const LABEL_CONFIDENCE_OK = 'S1_QUALIFIED';
const LABEL_CONFIDENCE_WEAK = 'S1_WALL_CAP_WEAK';

/* ============================ mode=label ============================ */
if (MODE === 'label') {
    const corePath = path.resolve(arg('--core', '') as string);
    const rolloutFiles = (arg('--rollouts', '') as string).split(',').map((s) => s.trim()).filter(Boolean);
    const outPath = path.resolve(arg('--out', '') as string);
    if (!fs.existsSync(corePath)) throw new Error(`[T16-04] core manifest 不存在：${corePath}`);
    if (rolloutFiles.length === 0) throw new Error('[T16-04] 需要 --rollouts（用于取状态 JSON）。');
    const tier = S1_TIERS[TIER];
    if (!tier) throw new Error(`[T16-04] 未知 --tier '${TIER}'。`);

    const core = JSON.parse(fs.readFileSync(corePath, 'utf8')) as {
        coreSet: { train: Array<{ policyInputKey: string; sampleId: string }>; val: Array<{ policyInputKey: string; sampleId: string }> };
    };
    let entries = [...core.coreSet.train, ...core.coreSet.val];
    if (SHARD !== null) {
        const [iRaw, nRaw] = SHARD.split('/');
        const i = Number(iRaw);
        const n = Number(nRaw);
        if (!Number.isInteger(i) || !Number.isInteger(n) || i < 0 || i >= n) {
            throw new Error(`[T16-04] --shard 需要 i/n 且 0<=i<n，实际 '${SHARD}'。`);
        }
        entries = entries.filter((_, index) => index % n === i);
    }

    // 状态查找表：sampleId → stateJson（只保留核心集需要的，控制内存）。
    const wanted = new Map(entries.map((e) => [e.sampleId, e.policyInputKey]));
    const stateBySample = new Map<string, string>();
    for (const file of rolloutFiles) {
        const abs = path.resolve(file);
        if (!fs.existsSync(abs)) throw new Error(`[T16-04] rollout 文件不存在：${abs}`);
        for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
            if (!line.trim()) continue;
            const row = JSON.parse(line) as { rootId: string; stepIndex: number; stateJson: string };
            const sampleId = `${row.rootId}|step${row.stepIndex}`;
            if (wanted.has(sampleId) && !stateBySample.has(sampleId)) stateBySample.set(sampleId, row.stateJson);
        }
    }
    const missing = entries.filter((e) => !stateBySample.has(e.sampleId));
    if (missing.length > 0) {
        throw new Error(
            `[T16-04] 核心集有 ${missing.length} 个状态在 rollout 文件里找不到（例如 ${missing[0].sampleId}）。`
            + '禁止用空状态顶替：请把对应的 rollout 分片一并传入。',
        );
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const out = fs.createWriteStream(outPath, { flags: 'w' });
    let wallCapHits = 0;
    const startedAt = Date.now();
    let processed = 0;

    for (const entry of entries) {
        const state = JSON.parse(stateBySample.get(entry.sampleId) as string) as GameState;
        const playerId = state.currentPlayer;
        const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
        const legal = engine.getLegalActions(playerId).filter((a) => a.type !== 'surrender');
        const ordered = legal.map((a) => ({ action: a, code: encodeAction(a) }))
            .sort((a, b) => compareActionCodeCanonicalV16(a.code, b.code));
        const decision = searchS1Action({
            state, playerId, s1: { tier, rng: () => 0.5, wallMsPerDecision: WALL_MS },
        });
        if (decision.wallCapHit) wallCapHits += 1;

        const evaluated: string[] = [];
        const scores: Array<number | null> = ordered.map(() => null);
        const mask: boolean[] = ordered.map(() => false);
        for (const candidate of decision.candidates) {
            if (candidate.value === null) continue;
            const index = ordered.findIndex((o) => o.code === candidate.actionCode);
            if (index < 0) continue;
            evaluated.push(candidate.actionCode);
            scores[index] = candidate.value;
            mask[index] = true;
        }
        // 终局优先标签：±1e9 的终局值不与材料分混在同一个 softmax 里。
        const terminalIndex = ordered.findIndex((o) => {
            const candidate = decision.candidates.find((c) => c.actionCode === o.code);
            return candidate !== undefined
                && (candidate.value === S1_TERMINAL_WIN || candidate.value === S1_TERMINAL_LOSS);
        });
        const traceHash = crypto.createHash('sha256').update(JSON.stringify({
            actionCode: decision.actionCode,
            candidates: decision.candidates.map((c) => [c.actionCode, c.value, c.reachedBoundary, c.branchesCompleted]),
        }), 'utf8').digest('hex');

        out.write(`${JSON.stringify({
            schema: 'v16_core_s1_label_1',
            sampleId: entry.sampleId,
            policyInputKey: entry.policyInputKey,
            candidateOrderingId: CANDIDATE_ORDERING_ID_V16,
            orderedActionCodes: ordered.map((o) => o.code),
            searchActionCode: decision.actionCode,
            searchReason: decision.reason,
            evaluatedActionCodes: evaluated,
            searchScores: scores,
            searchMask: mask,
            searchScoreScale: 'leaf-value-raw',
            terminalPriorityActionCode: terminalIndex >= 0 ? ordered[terminalIndex].code : null,
            teacherVersion: S1_TEACHER_VERSION,
            teacherTier: decision.tierId,
            teacherSeed: 'deterministic-rng-0.5',
            teacherBudget: {
                transitionBudget: tier.transitionBudget,
                rootWidth: tier.rootWidth,
                opponentReplyWidth: tier.opponentReplyWidth,
                phaseActionCap: tier.phaseActionCap,
                targetRounds: tier.targetRounds,
                wallMsPerDecision: WALL_MS,
                prefilterWidth: decision.prefilterWidth,
            },
            teacherTraceHash: traceHash,
            reachedBoundary: decision.candidates.find((c) => c.actionCode === decision.actionCode)?.reachedBoundary ?? null,
            boundaryReachedRatio: decision.boundaryReachedRatio,
            engineTransitions: decision.engineTransitions,
            elapsedMs: decision.elapsedMs,
            wallCapHit: decision.wallCapHit,
            labelConfidence: decision.wallCapHit ? LABEL_CONFIDENCE_WEAK : LABEL_CONFIDENCE_OK,
        })}\n`);
        processed += 1;
        if (processed % 100 === 0) {
            console.log(`[T16-04] 已标注 ${processed}/${entries.length}，用时 ${((Date.now() - startedAt) / 1000).toFixed(0)}s，wall=${wallCapHits}`);
        }
    }
    await new Promise<void>((resolve) => out.end(resolve));
    console.log(JSON.stringify({
        mode: 'label', out: outPath.replace(/\\/g, '/'), labels: processed,
        wallCapHits, wallCapHitRate: processed === 0 ? null : wallCapHits / processed,
        tier: TIER, teacherVersion: S1_TEACHER_VERSION,
        seconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    }, null, 2));
} else {
    /* ============================ mode=apply ============================ */
    const datasetPath = path.resolve(arg('--dataset', '') as string);
    const labelFiles = (arg('--labels', '') as string).split(',').map((s) => s.trim()).filter(Boolean);
    const outPath = path.resolve(arg('--out', '') as string);
    if (!fs.existsSync(datasetPath)) throw new Error(`[T16-04] 数据集不存在：${datasetPath}`);
    const labels = new Map<string, Record<string, unknown>>();
    let weak = 0;
    for (const file of labelFiles) {
        const abs = path.resolve(file);
        if (!fs.existsSync(abs)) throw new Error(`[T16-04] 标签文件不存在：${abs}`);
        for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
            if (!line.trim()) continue;
            const row = JSON.parse(line) as { policyInputKey: string; wallCapHit: boolean } & Record<string, unknown>;
            labels.set(row.policyInputKey, row);
            if (row.wallCapHit) weak += 1;
        }
    }
    const lines = fs.readFileSync(datasetPath, 'utf8').split(/\r?\n/).filter((l) => l.trim().length > 0);
    const outLines: string[] = [];
    let applied = 0;
    for (const line of lines) {
        const row = JSON.parse(line) as Record<string, unknown>;
        const label = labels.get(String(row.policyInputKey));
        if (label === undefined) { outLines.push(line); continue; }
        applied += 1;
        // 弱标签（触发 wall cap）不进 policy 损失，只作为观察。
        const usable = label.wallCapHit !== true;
        const merged = {
            ...row,
            searchActionCode: label.searchActionCode,
            searchReason: label.searchReason,
            evaluatedActionCodes: label.evaluatedActionCodes,
            searchScores: label.searchScores,
            searchMask: label.searchMask,
            searchScoreScale: label.searchScoreScale,
            terminalPriorityActionCode: label.terminalPriorityActionCode,
            teacherVersion: label.teacherVersion,
            teacherTier: label.teacherTier,
            teacherSeed: label.teacherSeed,
            teacherBudget: label.teacherBudget,
            teacherTraceHash: label.teacherTraceHash,
            reachedBoundary: label.reachedBoundary,
            labelConfidence: label.labelConfidence,
            coreSetMember: true,
            policyLossMask: row.policyLossMask,
            softLossUsable: usable,
        };
        outLines.push(JSON.stringify(merged));
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${outLines.join('\n')}\n`, 'utf8');
    console.log(JSON.stringify({
        mode: 'apply', out: outPath.replace(/\\/g, '/'),
        datasetRows: outLines.length, labelsApplied: applied, labelsAvailable: labels.size,
        weakLabelsNotUsed: weak,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex'),
    }, null, 2));
}
