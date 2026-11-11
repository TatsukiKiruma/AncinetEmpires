/**
 * 全新 40 家族根窗口采样器。
 *
 * 每张图 s=0..7；s=0..3 属于开发组，s=4..7 属于封存组，座位为 s%2。
 * 每个四家族小组依次预登记攻击组合、指挥官风险、经济、收官/普通目标（地图 1、3
 * 显式选择普通，其余选择收官）。采样只跑正常 θ1 对 H0 对局；单遍回调只保留各公开
 * 类别的首个状态，绝不读取搜索胜负挑根。
 *
 * 采样：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v19/search/fresh_window_sampler.ts \
 *     --out-dir v19/out/fresh_search_20261003/search --maps 0,1 --s 0,1 --resume
 * 汇总（所有目标家族完成后单独运行，且拒绝覆盖已有 manifest）：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v19/search/fresh_window_sampler.ts \
 *     --out-dir v19/out/fresh_search_20261003/search --finalize
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { playOne, UNPACK_DIR, SD_PLAN_FILE } from '../../v14/tools/eval_v14_match';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { GameEngine } from '../../src/game/engine';
import { V16_MAPS, scenarioIdOfMapV16 } from '../../v16/tools/eval_v16_protocol';
import type { GameState } from '../../src/game/types';
import {
    categoryPriority,
    identifyWindowFeatures,
    targetCategoryForFamily,
    type WindowCategory,
    type WindowFeatures,
} from './window_features';

export const DEFAULT_BASE_SEED = 2610200000;
export const THETA1_PATH = 'v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.json';
export const THETA1_SHA256 = '0089afe67e14462819bcc80601180e690327c40400b1aa9bd0bad03f19a30b47';
export const SELECTION_RULE = 'first-public-category-by-preregistered-family-map-slot-v2';
const SAMPLER_SOURCE_PATHS = [
    'v19/search/fresh_window_sampler.ts',
    'v19/search/window_features.ts',
] as const;
const DEFAULT_OUT_DIR = 'v19/out/fresh_search_20261003/search';
const MAX_STEPS = 12000;
const WALL_TIMEOUT_MS = 900000;

interface Args {
    outDir: string;
    baseSeed: number;
    maps: number[];
    familySlots: number[];
    resume: boolean;
    finalize: boolean;
}

interface CapturedCandidate {
    decisionIndex: number;
    engineStepIndex: number;
    state: GameState;
    stateJson: string;
    features: WindowFeatures;
}

export interface FreshWindowManifestEntry {
    schema: 'v19_fresh_window_family_1';
    windowId: string;
    familyId: string;
    mapIndex: number;
    mapName: string;
    scenarioId: string;
    seed: number;
    ownSeat: number;
    group: 'dev' | 'sealed';
    candidateDecisions: number;
    chosenDecisionIndex: number;
    engineStepIndex: number;
    phaseTurn: number;
    legalActionCount: number;
    rootStateHash: string;
    rootStateSha256: string;
    rootStateJson: string;
    gameSteps: number;
    gameOutcomeKind: string;
    samplingTruncated: boolean;
    selectionRule: string;
    targetCategory: WindowCategory;
    selectedCategory: WindowCategory;
    fallbackUsed: boolean;
    fallbackRank: number;
    fallbackReason: string | null;
    categoryPriority: readonly WindowCategory[];
    matchedCategories: WindowCategory[];
    features: WindowFeatures;
    wallMs: number;
    policySha256: string;
    samplingSourceSha256: string;
}

type FamilyRecord = FreshWindowManifestEntry;

function parseCsvIntegers(raw: string | null, fallback: readonly number[], label: string): number[] {
    if (raw === null) return [...fallback];
    const values = raw.split(',').map((part) => Number(part.trim()));
    if (values.length === 0 || values.some((value) => !Number.isInteger(value))) {
        throw new Error(`${label} 必须是逗号分隔的整数`);
    }
    return [...new Set(values)];
}

export function parseArgs(argv: string[]): Args {
    const read = (name: string): string | null => {
        const index = argv.indexOf(name);
        if (index < 0) return null;
        if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
            throw new Error(`${name} 缺少参数值`);
        }
        return argv[index + 1];
    };
    const baseSeed = Number(read('--base-seed') ?? DEFAULT_BASE_SEED);
    if (!Number.isSafeInteger(baseSeed) || baseSeed < 0) throw new Error('--base-seed 必须是非负安全整数');
    const maps = parseCsvIntegers(read('--maps'), V16_MAPS.map((_, index) => index), '--maps');
    const familySlots = parseCsvIntegers(read('--s'), Array.from({ length: 8 }, (_, index) => index), '--s');
    if (maps.some((value) => value < 0 || value >= V16_MAPS.length)) throw new Error('--maps 超出 0..4');
    if (familySlots.some((value) => value < 0 || value > 7)) throw new Error('--s 超出 0..7');
    return {
        outDir: read('--out-dir') ?? DEFAULT_OUT_DIR,
        baseSeed,
        maps,
        familySlots,
        resume: argv.includes('--resume'),
        finalize: argv.includes('--finalize'),
    };
}

function sha256(text: string | Buffer): string {
    return crypto.createHash('sha256').update(text).digest('hex');
}

/** 与旧 manifest 的 rootStateHash 保持相同 FNV-1a 深规范化口径。 */
function stateHash16(text: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

function deepCanonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(deepCanonical).join(',')}]`;
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
        return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${deepCanonical(item)}`).join(',')}}`;
    }
    return JSON.stringify(value ?? null);
}

function verifyTheta1(): string {
    const bytes = fs.readFileSync(THETA1_PATH);
    const actual = sha256(bytes);
    if (actual !== THETA1_SHA256) {
        throw new Error(`θ1 SHA256 不匹配：期望 ${THETA1_SHA256}，实际 ${actual}`);
    }
    return bytes.toString('utf8');
}

/** 采样选择实现的组合摘要；任一模块变化都会令续跑与汇总拒绝混用旧家族。 */
function samplingSourceSha256(): string {
    const joined = SAMPLER_SOURCE_PATHS.map((file) => {
        const bytes = fs.readFileSync(file);
        return `${file}\0${bytes.length}\0${sha256(bytes)}`;
    }).join('\n');
    return sha256(joined);
}

function familyIdOf(mapIndex: number, s: number): string {
    return `fresh-${mapIndex}-${s}-seat${s % 2}`;
}

function familyPath(outDir: string, familyId: string): string {
    return path.join(outDir, 'families', `${familyId}.json`);
}

/**
 * 同目录完整临时文件 + 原子硬链接发布。`linkSync` 在目标已存在时必定失败，既避免
 * 中断留下半个 JSON，也避免两个并行进程互相覆盖同一家族。
 */
function writeJsonAtomic(target: string, value: unknown): void {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) throw new Error(`拒绝覆盖已有文件：${target}`);
    const temporary = `${target}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    try {
        fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
        fs.linkSync(temporary, target);
        fs.unlinkSync(temporary);
    } catch (error) {
        try { fs.rmSync(temporary, { force: true }); } catch { /* 临时文件清理由原错误兜底。 */ }
        throw error;
    }
}

function readFamilyRecord(file: string): FamilyRecord {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as FamilyRecord;
}

function isSamplingTruncated(outcomeKind: string): boolean {
    return ['STEP_LIMIT', 'PLY_LIMIT', 'WALL_TIMEOUT', 'CANCELLED'].includes(outcomeKind);
}

function validateResumeRecord(
    record: FamilyRecord,
    mapIndex: number,
    s: number,
    seed: number,
    sourceSha256: string,
): void {
    const expectedFamily = familyIdOf(mapIndex, s);
    if (
        record.schema !== 'v19_fresh_window_family_1'
        || record.familyId !== expectedFamily
        || record.mapIndex !== mapIndex
        || record.seed !== seed
        || record.policySha256 !== THETA1_SHA256
        || record.selectionRule !== SELECTION_RULE
        || record.samplingSourceSha256 !== sourceSha256
    ) {
        throw new Error(`续跑文件身份不匹配：${expectedFamily}`);
    }
}

async function sample(args: Args, predictorJson: string, sourceSha256: string): Promise<void> {
    fs.mkdirSync(path.join(args.outDir, 'families'), { recursive: true });
    const predictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(predictorJson));
    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);

    for (const mapIndex of args.maps) {
        const mapName = V16_MAPS[mapIndex];
        const scenarioId = scenarioIdOfMapV16(mapName);
        for (const s of args.familySlots) {
            const familyId = familyIdOf(mapIndex, s);
            const seed = args.baseSeed + 10 * mapIndex + s;
            const output = familyPath(args.outDir, familyId);
            if (fs.existsSync(output)) {
                if (!args.resume) throw new Error(`家族文件已存在；如需跳过已完成家族请加 --resume：${output}`);
                validateResumeRecord(readFamilyRecord(output), mapIndex, s, seed, sourceSha256);
                console.log(`[FRESH] RESUME ${familyId}`);
                continue;
            }

            const targetCategory = targetCategoryForFamily(s, mapIndex);
            const priority = categoryPriority(targetCategory);
            const firstByCategory = new Map<WindowCategory, CapturedCandidate>();
            let candidateDecisions = 0;
            const startedAt = Date.now();
            const game = await playOne({
                runId: 'v19_fresh_window_sampler',
                scenarioId,
                seed,
                candidateSeat: s % 2,
                viewedSeatHint: s % 2,
                maxSteps: MAX_STEPS,
                maxPlies: null,
                wallTimeoutMs: WALL_TIMEOUT_MS,
                predictor,
                checkpointSha256: THETA1_SHA256,
                requestedPolicyId: 'fresh_window_sampler_theta1',
                envFactory,
                emitIdentity: false,
                mirrorViewRecompute: false,
                captureStateOnStep: true,
                onStep: (trace) => {
                    if (!trace.byCandidate || trace.stateBeforeJson === null || trace.actionCode === '') return;
                    const decisionIndex = candidateDecisions;
                    candidateDecisions += 1;
                    const state = JSON.parse(trace.stateBeforeJson) as GameState;
                    const legal = new GameEngine(state).getLegalActions(state.currentPlayer)
                        .filter((action) => action.type !== 'surrender');
                    const features = identifyWindowFeatures(state, legal);
                    if (!features.eligible || features.categories.length === 0) return;
                    const candidate: CapturedCandidate = {
                        decisionIndex,
                        engineStepIndex: trace.stepIndex,
                        state,
                        stateJson: trace.stateBeforeJson,
                        features,
                    };
                    for (const category of features.categories) {
                        if (!firstByCategory.has(category)) firstByCategory.set(category, candidate);
                    }
                },
            });

            if (game.outcomeKind === 'POLICY_ERROR' || game.outcomeKind === 'ENGINE_ERROR') {
                throw new Error(`${familyId} 原局异常，未写家族文件：${game.outcomeKind} ${game.error ?? ''}`.trim());
            }

            const selectedCategory = priority.find((category) => firstByCategory.has(category));
            if (selectedCategory === undefined) {
                throw new Error(
                    `${familyId} 正常对局中没有合法动作数>=2的预定义类别状态；` +
                    `原局=${game.outcomeKind}。未写家族文件，可修订公开类别后重跑。`,
                );
            }
            const selected = firstByCategory.get(selectedCategory) as CapturedCandidate;
            const canonicalState = deepCanonical(selected.state);
            const fallbackRank = priority.indexOf(selectedCategory);
            const entry: FreshWindowManifestEntry = {
                schema: 'v19_fresh_window_family_1',
                windowId: `${familyId}-w0`,
                familyId,
                mapIndex,
                mapName,
                scenarioId,
                seed,
                ownSeat: s % 2,
                group: s <= 3 ? 'dev' : 'sealed',
                candidateDecisions,
                chosenDecisionIndex: selected.decisionIndex,
                engineStepIndex: selected.engineStepIndex,
                phaseTurn: selected.state.turn,
                legalActionCount: selected.features.legalActionCount,
                rootStateHash: stateHash16(canonicalState),
                rootStateSha256: sha256(canonicalState),
                rootStateJson: selected.stateJson,
                gameSteps: game.steps,
                gameOutcomeKind: game.outcomeKind,
                samplingTruncated: isSamplingTruncated(game.outcomeKind),
                selectionRule: SELECTION_RULE,
                targetCategory,
                selectedCategory,
                fallbackUsed: fallbackRank > 0,
                fallbackRank,
                fallbackReason: fallbackRank > 0
                    ? `目标类别 ${targetCategory} 未出现；按固定优先级选择 ${selectedCategory}`
                    : null,
                categoryPriority: priority,
                matchedCategories: selected.features.categories,
                features: selected.features,
                wallMs: Date.now() - startedAt,
                policySha256: THETA1_SHA256,
                samplingSourceSha256: sourceSha256,
            };
            writeJsonAtomic(output, entry);
            console.log(
                `[FRESH] OK ${familyId} target=${targetCategory} selected=${selectedCategory} `
                + `fallback=${entry.fallbackUsed} step=${entry.engineStepIndex} 原局=${entry.gameOutcomeKind}`,
            );
        }
    }
}

function finalize(args: Args, sourceSha256: string): void {
    const manifestPath = path.join(args.outDir, 'window_manifest.json');
    if (fs.existsSync(manifestPath)) throw new Error(`拒绝覆盖已有（可能已冻结）manifest：${manifestPath}`);
    const entries: FreshWindowManifestEntry[] = [];
    const missing: string[] = [];
    for (const mapIndex of args.maps) {
        for (const s of args.familySlots) {
            const familyId = familyIdOf(mapIndex, s);
            const file = familyPath(args.outDir, familyId);
            if (!fs.existsSync(file)) {
                missing.push(familyId);
                continue;
            }
            const record = readFamilyRecord(file);
            validateResumeRecord(record, mapIndex, s, args.baseSeed + 10 * mapIndex + s, sourceSha256);
            entries.push(record);
        }
    }
    if (missing.length > 0) throw new Error(`不能汇总：缺少 ${missing.length} 个家族文件：${missing.join(', ')}`);

    const groupCounts = {
        dev: entries.filter((entry) => entry.group === 'dev').length,
        sealed: entries.filter((entry) => entry.group === 'sealed').length,
    };
    const selectedCategoryCounts = Object.fromEntries(
        (['attack_combo', 'commander_risk', 'economy', 'endgame', 'ordinary'] as WindowCategory[])
            .map((category) => [category, entries.filter((entry) => entry.selectedCategory === category).length]),
    );
    const targetCategoryCounts = Object.fromEntries(
        (['attack_combo', 'commander_risk', 'economy', 'endgame', 'ordinary'] as WindowCategory[])
            .map((category) => [category, entries.filter((entry) => entry.targetCategory === category).length]),
    );
    const perMapDev = V16_MAPS.map((_, mapIndex) => entries
        .filter((entry) => entry.mapIndex === mapIndex && entry.group === 'dev').length);
    const perMapSealed = V16_MAPS.map((_, mapIndex) => entries
        .filter((entry) => entry.mapIndex === mapIndex && entry.group === 'sealed').length);
    const byGroupAndSelectedCategory = Object.fromEntries(
        (['dev', 'sealed'] as const).map((group) => [
            group,
            Object.fromEntries(
                (['attack_combo', 'commander_risk', 'economy', 'endgame', 'ordinary'] as WindowCategory[])
                    .map((category) => [
                        category,
                        entries.filter((entry) => entry.group === group && entry.selectedCategory === category).length,
                    ]),
            ),
        ]),
    );
    const byGroupAndTargetCategory = Object.fromEntries(
        (['dev', 'sealed'] as const).map((group) => [
            group,
            Object.fromEntries(
                (['attack_combo', 'commander_risk', 'economy', 'endgame', 'ordinary'] as WindowCategory[])
                    .map((category) => [
                        category,
                        entries.filter((entry) => entry.group === group && entry.targetCategory === category).length,
                    ]),
            ),
        ]),
    );
    const manifest = {
        schema: 'v19_fresh_window_manifest_1',
        generatedAt: new Date().toISOString(),
        note:
            '全新搜索窗口清单。根状态来自 θ1 对 H0 的正常可达对局；每原局最多一个窗口；' +
            '只按预登记类别及固定 fallback 选根，不读取搜索或终局胜负。',
        namespace: {
            baseSeed: args.baseSeed,
            formula: 'seed = baseSeed + 10*mapIndex + s；s=0..3 dev，s=4..7 sealed；seat=s%2',
            maps: V16_MAPS,
            selectedMaps: args.maps,
            selectedFamilySlots: args.familySlots,
        },
        policy: { id: 'theta1', path: THETA1_PATH, sha256: THETA1_SHA256 },
        samplingSource: { paths: SAMPLER_SOURCE_PATHS, sha256: sourceSha256 },
        samplingCaps: { maxSteps: MAX_STEPS, maxPlies: null, wallTimeoutMs: WALL_TIMEOUT_MS },
        selectionRule: SELECTION_RULE,
        categoryDefinitions: {
            attack_combo: '至少两个不同攻击者可攻击同一目标',
            commander_risk: '可直接攻击指挥官，或半血及以下己方指挥官可亲自攻击',
            economy: '存在 recruit_to_castle、recruit_and_deploy 或 capture 合法动作',
            endgame: 'turn >= 20 且合法动作数至少 2',
            ordinary: '合法动作数至少 2，且不命中攻击组合、指挥官风险、经济或收官',
        },
        counts: {
            total: entries.length,
            dev: groupCounts.dev,
            sealed: groupCounts.sealed,
            skipped: 0,
            fallback: entries.filter((entry) => entry.fallbackUsed).length,
            samplingTruncated: entries.filter((entry) => entry.samplingTruncated).length,
            perMapDev,
            perMapSealed,
            targetCategory: targetCategoryCounts,
            selectedCategory: selectedCategoryCounts,
            byGroupAndTargetCategory,
            byGroupAndSelectedCategory,
        },
        entries,
        skipped: [],
    };
    writeJsonAtomic(manifestPath, manifest);
    console.log(`[FRESH] manifest 已写出：${manifestPath}，窗口=${entries.length}，跳过=0`);
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const predictorJson = verifyTheta1();
    const sourceSha256 = samplingSourceSha256();
    if (args.finalize) finalize(args, sourceSha256);
    else await sample(args, predictorJson, sourceSha256);
}

main().catch((error) => {
    console.error('[FRESH] 窗口采样失败：', error);
    process.exitCode = 1;
});
