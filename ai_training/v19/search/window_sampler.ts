/**
 * S1 窗口抽取器：冻结 40 个训练家族窗口（五图各 8），并按家族拆成
 * 20 个开发窗口 + 20 个封存验证窗口（各图各 4）。
 *
 * 纪律（对应任务书 S1）：
 * - 家族 = (地图, 新命名空间 seed)。**同一原局及其派生窗口不跨两组**，
 *   因此拆分按 s 的奇偶/区间在**家族级**完成，而不是在窗口级随机分。
 * - seed 使用独立命名空间 `V19_S1_SEARCH_ROOT_BASE_SEED`（2610100000），
 *   与 DEV20/RECHECK40/CONFIRM20/训练/课程/标注命名空间均不重叠。
 * - 窗口选择规则预先登记：取该局候选决策序列的固定分位（60%），
 *   要求该处非终局且合法动作 ≥ 2；不合法则按固定方向顺延。
 *   规则在跑任何搜索之前写死，不因结果回调。
 * - 只写本次 run 的输出目录；不触碰 v14–v18 与既有 v19 run 产物。
 *
 * 用法（仓库根目录）：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v19/search/window_sampler.ts [--maps 0] [--s 0,1]
 */

import fs from 'node:fs';
import path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { playOne, UNPACK_DIR, SD_PLAN_FILE } from '../../v14/tools/eval_v14_match';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { V16_MAPS, scenarioIdOfMapV16 } from '../../v16/tools/eval_v16_protocol';
import { V19_S1_SEARCH_ROOT_BASE_SEED, hashState } from './rollout_search';
import type { GameState } from '../../src/game/types';

const OUT_ROOT = 'v19/out/s0s1_20260930';
const OUT_DIR = `${OUT_ROOT}/search`;
const MANIFEST_PATH = `${OUT_DIR}/window_manifest.json`;
/** 逐家族增量落盘文件：单家族完成即追加一行，进程中断不丢已完成的家族。 */
const PARTIAL_PATH = `${OUT_DIR}/window_manifest.partial.jsonl`;

/** 本次搜索试验使用的学生模型：当前探索最好候选 θ1（DEV 6/20，未晋升）。 */
const THETA1_PATH = 'v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.json';
const THETA1_SHA = '0089afe67e14462819bcc80601180e690327c40400b1aa9bd0bad03f19a30b47';

/** 每图家族数：s = 0..7；s<4 进开发组，s>=4 进封存组（家族级拆分）。 */
const FAMILIES_PER_MAP = 8;
const DEV_S_MAX = 3;

export interface WindowManifestEntry {
    windowId: string;
    familyId: string;
    mapIndex: number;
    mapName: string;
    scenarioId: string;
    seed: number;
    ownSeat: number;
    group: 'dev' | 'sealed';
    /** 该原局的候选决策总数（分母）。 */
    candidateDecisions: number;
    /** 被选中的候选决策序号（从 0 起）。 */
    chosenDecisionIndex: number;
    engineStepIndex: number;
    phaseTurn: number;
    legalActionCount: number;
    rootStateHash: string;
    rootStateJson: string;
    gameSteps: number;
    gameOutcomeKind: string;
    selectionRule: string;
    wallMs: number;
}

interface Args {
    maps: number[] | null;
    seeds: number[] | null;
    policy: string;
    resume: boolean;
}

function parseArgs(argv: string[]): Args {
    const read = (name: string): string | null => {
        const index = argv.indexOf(name);
        return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
    };
    const mapsArg = read('--maps');
    const seedsArg = read('--s');
    return {
        maps: mapsArg ? mapsArg.split(',').map((v) => Number(v.trim())) : null,
        seeds: seedsArg ? seedsArg.split(',').map((v) => Number(v.trim())) : null,
        policy: read('--policy') ?? 'theta1',
        resume: !argv.includes('--no-resume'),
    };
}

/** 预登记的窗口选择规则：取候选决策序列的 60% 分位，必要时顺延。 */
export const SELECTION_RULE = 'candidate-decision-ordinal-60pct-forward-v1';

/** 单家族完成即追加一行；中断后可用 --resume 跳过已完成家族。 */
function appendPartial(record: unknown): void {
    try {
        fs.appendFileSync(PARTIAL_PATH, `${JSON.stringify(record)}\n`, 'utf8');
    } catch {
        // 增量落盘失败不影响本次运行；最终清单仍会在末尾统一写出。
    }
}

function chooseDecisionIndex(
    decisions: Array<{ decisionIndex: number; engineStepIndex: number; legalActionCount: number; terminal: boolean }>,
): number {
    if (decisions.length === 0) return -1;
    const start = Math.min(decisions.length - 1, Math.floor(decisions.length * 0.6));
    const order: number[] = [];
    for (let i = start; i < decisions.length; i += 1) order.push(i);
    for (let i = start - 1; i >= 0; i -= 1) order.push(i);
    for (const index of order) {
        const item = decisions[index];
        if (!item.terminal && item.legalActionCount >= 2) return index;
    }
    return -1;
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const predictor = new SpatialResNetPredictor(
        loadSpatialResNetFromJson(fs.readFileSync(THETA1_PATH, 'utf8')),
    );
    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);

    const entries: WindowManifestEntry[] = [];
    const skipped: Array<{ familyId: string; reason: string }> = [];
    const mapIndexes = args.maps ?? V16_MAPS.map((_, index) => index);

    // 续跑：读取已完成的家族，避免重跑（每个家族要跑两遍完整对局）。
    const done = new Set<string>();
    if (args.resume && fs.existsSync(PARTIAL_PATH)) {
        for (const line of fs.readFileSync(PARTIAL_PATH, 'utf8').split('\n')) {
            const text = line.trim();
            if (!text) continue;
            try {
                const record = JSON.parse(text) as WindowManifestEntry | { familyId: string; skipped: true };
                if ((record as { skipped?: boolean }).skipped) {
                    done.add(record.familyId);
                    continue;
                }
                entries.push(record as WindowManifestEntry);
                done.add(record.familyId);
            } catch {
                // 半截行（进程被杀）直接忽略，该家族会被重跑。
            }
        }
        console.log(`[S1] 续跑：已完成 ${done.size} 个家族，跳过它们`);
    }

    for (const mapIndex of mapIndexes) {
        const mapName = V16_MAPS[mapIndex];
        const scenarioId = scenarioIdOfMapV16(mapName);
        const seeds = args.seeds ?? Array.from({ length: FAMILIES_PER_MAP }, (_, s) => s);
        for (const s of seeds) {
            const seed = V19_S1_SEARCH_ROOT_BASE_SEED + 10 * mapIndex + s;
            const ownSeat = s % 2; // 座位均衡：偶数家族座位 0，奇数家族座位 1
            const group: 'dev' | 'sealed' = s <= DEV_S_MAX ? 'dev' : 'sealed';
            const familyId = `s1-${mapIndex}-${s}-seat${ownSeat}`;
            const windowId = `${familyId}-w0`;
            if (done.has(familyId)) continue;
            const startedAt = Date.now();

            // 第一遍：只登记候选决策的元信息，不保存状态（控制内存）。
            const decisions: Array<{ decisionIndex: number; engineStepIndex: number; legalActionCount: number; terminal: boolean }> = [];
            let candidateOrdinal = -1;
            const pass1 = await playOne({
                runId: 's1_window_sampler_20260930',
                scenarioId,
                seed,
                candidateSeat: ownSeat,
                viewedSeatHint: ownSeat,
                maxSteps: 12000,
                maxPlies: null,
                wallTimeoutMs: 900000,
                predictor,
                checkpointSha256: THETA1_SHA,
                requestedPolicyId: 's1_sampler_theta1',
                envFactory,
                emitIdentity: false,
                mirrorViewRecompute: false,
                captureStateOnStep: false,
                onStep: (t) => {
                    if (!t.byCandidate) return;
                    if (t.stateBeforeJson === null && t.actionCode === '') return; // 步后轻量记录
                    candidateOrdinal += 1;
                    decisions.push({
                        decisionIndex: candidateOrdinal,
                        engineStepIndex: t.stepIndex,
                        legalActionCount: t.legalActionCodes.length,
                        terminal: t.terminalAfter,
                    });
                },
            });

            const chosen = chooseDecisionIndex(decisions);
            if (chosen < 0) {
                skipped.push({ familyId, reason: `无可用窗口（候选决策 ${decisions.length} 个）` });
                appendPartial({ familyId, skipped: true, reason: 'no-usable-window' });
                console.log(`[S1] SKIP ${familyId} seed=${seed} 无可用窗口`);
                continue;
            }
            const target = decisions[chosen];

            // 第二遍：重放到目标步并只保存该步状态。
            let rootState: GameState | null = null;
            const pass2 = await playOne({
                runId: 's1_window_sampler_20260930',
                scenarioId,
                seed,
                candidateSeat: ownSeat,
                viewedSeatHint: ownSeat,
                maxSteps: target.engineStepIndex + 1,
                maxPlies: null,
                wallTimeoutMs: 900000,
                predictor,
                checkpointSha256: THETA1_SHA,
                requestedPolicyId: 's1_sampler_theta1',
                envFactory,
                emitIdentity: false,
                mirrorViewRecompute: false,
                captureStateOnStep: true,
                onStep: (t) => {
                    if (t.stepIndex === target.engineStepIndex && t.stateBeforeJson) {
                        rootState = JSON.parse(t.stateBeforeJson) as GameState;
                    }
                },
            });
            if (!rootState) {
                skipped.push({ familyId, reason: `第二遍未能恢复到 step ${target.engineStepIndex}` });
                appendPartial({ familyId, skipped: true, reason: 'root-not-restored' });
                console.log(`[S1] SKIP ${familyId} 未能恢复根状态`);
                continue;
            }
            const state: GameState = rootState;
            const legal = new GameEngine(state).getLegalActions(state.currentPlayer).length;
            const wallMs = Date.now() - startedAt;
            const entry: WindowManifestEntry = {
                windowId,
                familyId,
                mapIndex,
                mapName,
                scenarioId,
                seed,
                ownSeat,
                group,
                candidateDecisions: decisions.length,
                chosenDecisionIndex: chosen,
                engineStepIndex: target.engineStepIndex,
                phaseTurn: state.turn,
                legalActionCount: legal,
                rootStateHash: hashState(state),
                rootStateJson: JSON.stringify(state),
                gameSteps: pass1.steps,
                gameOutcomeKind: pass1.outcomeKind,
                selectionRule: SELECTION_RULE,
                wallMs,
            };
            entries.push(entry);
            appendPartial(entry);
            console.log(
                `[S1] OK ${familyId} seed=${seed} group=${group} step=${target.engineStepIndex} ` +
                    `turn=${state.turn} legal=${legal} 原局=${pass1.outcomeKind}(${pass1.steps}步) ${(wallMs / 1000).toFixed(1)}s`,
            );
            void pass2;
        }
    }

    const dev = entries.filter((e) => e.group === 'dev');
    const sealed = entries.filter((e) => e.group === 'sealed');
    const perMapDev = V16_MAPS.map((_, m) => dev.filter((e) => e.mapIndex === m).length);
    const perMapSealed = V16_MAPS.map((_, m) => sealed.filter((e) => e.mapIndex === m).length);

    const manifest = {
        schema: 'v19_s1_window_manifest_1',
        generatedAt: new Date().toISOString(),
        note:
            'S1 固定窗口清单。家族级拆分（同一原局及其派生窗口不跨组）；seed 命名空间独立；' +
            '选择规则在搜索前预登记，不因结果回调。窗口根状态来自 θ1 对 H0 的正常对局。',
        namespace: {
            baseSeed: V19_S1_SEARCH_ROOT_BASE_SEED,
            formula: 'seed = base + 10*mapIndex + s，s=0..7；s<=3 为开发组，s>=4 为封存组',
            maps: V16_MAPS,
        },
        policy: { id: 'theta1', path: THETA1_PATH, sha256: THETA1_SHA },
        selectionRule: SELECTION_RULE,
        counts: {
            total: entries.length,
            dev: dev.length,
            sealed: sealed.length,
            perMapDev,
            perMapSealed,
        },
        entries,
        skipped,
    };
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(
        `[S1] 清单已写出：${MANIFEST_PATH}\n` +
            `     总计 ${entries.length}（开发 ${dev.length} / 封存 ${sealed.length}）` +
            ` 每图开发 [${perMapDev.join(',')}] 封存 [${perMapSealed.join(',')}] 跳过 ${skipped.length}`,
    );
    void path;
}

main().catch((error) => {
    console.error('[S1] 窗口抽取失败：', error);
    process.exitCode = 1;
});
