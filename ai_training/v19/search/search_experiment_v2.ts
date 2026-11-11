/**
 * V19 搜索复验 v2 驱动。
 *
 * 每个窗口独立原子落盘；恢复时严格核对清单、模型、源码和预算身份。
 * 搜索与验证随机流都由清单 entry.seed 派生，分片顺序不会改变结果。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import type { GameState } from '../../src/game/types';
import {
    ENGINE_SOURCE_FILES_V16,
    H0_SOURCE_FILES_V16,
    POLICY_SOURCE_FILES_V16,
} from '../../v16/tools/eval_v16_identity';
import {
    V19_SEARCH_STREAM_OFFSET,
    V19_VALIDATION_STREAM_OFFSET,
    hashState,
    searchWindow,
    type SearchBudget,
    type WindowSearchResult,
} from './rollout_search';
import { evaluateSearchGate, loadResultEnvelopes } from './search_gate';

export interface ManifestEntry {
    windowId: string;
    familyId: string;
    mapIndex: number;
    mapName: string;
    seed: number;
    ownSeat: number;
    group: 'dev' | 'sealed';
    engineStepIndex: number;
    rootStateHash: string;
    rootStateJson: string;
    [key: string]: unknown;
}

export interface Manifest {
    schema?: string;
    policy?: { id?: string; path?: string; sha256?: string };
    counts?: {
        total?: number;
        dev?: number;
        sealed?: number;
        perMapDev?: number[];
        perMapSealed?: number[];
    };
    entries: ManifestEntry[];
    [key: string]: unknown;
}

interface BudgetFreezeFile {
    schema?: string;
    frozen?: boolean;
    group?: string;
    frozenAt?: string;
    budgetSha256?: string;
    budget?: SearchBudget;
    [key: string]: unknown;
}

interface Args {
    manifestPath: string;
    outDir: string;
    group: 'dev' | 'sealed';
    limit: number | null;
    startIndex: number;
    budgetFile: string;
    resume: boolean;
}

interface ExperimentIdentity {
    manifestPath: string;
    manifestSha256: string;
    modelPath: string;
    modelSha256: string;
    budgetPath: string;
    budgetFileSha256: string;
    budgetSha256: string;
    sourceFiles: Array<{ path: string; sha256: string }>;
    sourceSha256: string;
    group: 'dev' | 'sealed';
}

interface WindowEnvelope {
    schema: 'v19_search_window_result_2';
    status: 'success' | 'error';
    generatedAt: string;
    identity: ExperimentIdentity;
    entry: Omit<ManifestEntry, 'rootStateJson'> & { rootStateJson?: never };
    streams: { searchSeed: number; validationSeed: number };
    result: WindowSearchResult | null;
    error: string | null;
}

function parseArgs(argv: string[]): Args {
    const read = (name: string): string | null => {
        const index = argv.indexOf(name);
        return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
    };
    const required = (name: string): string => {
        const value = read(name);
        if (!value) throw new Error(`缺少 ${name}`);
        return value;
    };
    const group = required('--group');
    if (group !== 'dev' && group !== 'sealed') throw new Error('--group 只能是 dev 或 sealed');
    const limitRaw = read('--limit');
    const startRaw = read('--start-index') ?? '0';
    const limit = limitRaw === null ? null : Number(limitRaw);
    const startIndex = Number(startRaw);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) throw new Error('--limit 必须是正整数');
    if (!Number.isInteger(startIndex) || startIndex < 0) throw new Error('--start-index 必须是非负整数');
    return {
        manifestPath: path.resolve(required('--manifest')),
        outDir: path.resolve(required('--out-dir')),
        group,
        limit,
        startIndex,
        budgetFile: path.resolve(required('--budget-file')),
        resume: argv.includes('--resume'),
    };
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
            .join(',')}}`;
    }
    return JSON.stringify(value ?? null);
}

function sha256Text(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
}

/** 预算对象身份与文件排版无关，供冻结文件生成器复用。 */
export function searchBudgetSha256(budget: SearchBudget): string {
    return sha256Text(canonicalJson(budget));
}

/** 流身份只依赖清单 seed，绝不依赖本次分片内序号。 */
export function deriveStreamSeeds(entrySeed: number): { searchSeed: number; validationSeed: number } {
    return {
        searchSeed: entrySeed + V19_SEARCH_STREAM_OFFSET,
        validationSeed: entrySeed + V19_VALIDATION_STREAM_OFFSET,
    };
}

function sha256File(file: string): string {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function relativePath(file: string): string {
    return path.relative(process.cwd(), file).replaceAll('\\', '/');
}

function assertBudget(budget: SearchBudget): void {
    const required = [
        'maxOwnDepth', 'maxBranchPerLevel', 'policyTopK', 'maxBranchesPerWindow',
        'wallMsPerWindow', 'maxStepsPerContinuation',
    ] as const;
    for (const key of required) {
        const value = Number(budget[key]);
        if (!Number.isFinite(value) || value <= 0) throw new Error(`预算字段 ${key} 必须为正数`);
    }
    for (const key of ['searchWallMs', 'validationWallMsPerArm'] as const) {
        const value = (budget as SearchBudget & Record<string, unknown>)[key];
        if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) <= 0)) {
            throw new Error(`预算字段 ${key} 必须为正数`);
        }
    }
}

function loadBudget(file: string, group: 'dev' | 'sealed'): { budget: SearchBudget; fileSha: string; budgetSha: string } {
    if (!fs.existsSync(file)) throw new Error(`预算文件不存在：${file}`);
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as BudgetFreezeFile | SearchBudget;
    const wrapped = parsed as BudgetFreezeFile;
    const budget = (wrapped.budget ?? parsed) as SearchBudget;
    assertBudget(budget);
    const budgetSha = searchBudgetSha256(budget);
    if (group === 'sealed') {
        if (wrapped.schema !== 'v19_search_budget_freeze_1' || wrapped.frozen !== true || wrapped.group !== 'sealed') {
            throw new Error('封存组要求 v19_search_budget_freeze_1 格式且 frozen=true、group=sealed 的预算冻结文件');
        }
        if (wrapped.budgetSha256 !== budgetSha) {
            throw new Error(`预算冻结哈希不符：声明 ${wrapped.budgetSha256 ?? '缺失'}，实际 ${budgetSha}`);
        }
    } else if (wrapped.budgetSha256 && wrapped.budgetSha256 !== budgetSha) {
        throw new Error(`预算文件哈希不符：声明 ${wrapped.budgetSha256}，实际 ${budgetSha}`);
    }
    return { budget, fileSha: sha256Text(raw), budgetSha };
}

function resolveModelPath(manifest: Manifest, manifestPath: string): string {
    const declared = manifest.policy?.path;
    if (!declared) throw new Error('清单缺少 policy.path，无法锁定模型身份');
    const fromRoot = path.resolve(process.cwd(), declared);
    if (fs.existsSync(fromRoot)) return fromRoot;
    const fromManifest = path.resolve(path.dirname(manifestPath), declared);
    if (fs.existsSync(fromManifest)) return fromManifest;
    throw new Error(`模型文件不存在：${declared}`);
}

export function sourceIdentity(): Pick<ExperimentIdentity, 'sourceFiles' | 'sourceSha256'> {
    const searchSources = [
        'v19/search/rollout_search.ts',
        'v19/search/search_window.ts',
        'v19/search/rollout_simulation.ts',
        'v19/search/selection.ts',
        'v19/search/search_gate.ts',
        'v19/search/local_skill_gate.ts',
        'v19/search/result_integrity.ts',
        'v19/search/search_experiment_v2.ts',
    ];
    const additionalSources = [
        'src/game/ai/action_ordering.ts',
        'src/game/units.ts',
        'v13/tools/eval_v3_core.ts',
        'v12/tools/run-tool.mjs',
    ];
    const candidates = [...new Set([
        ...searchSources,
        ...ENGINE_SOURCE_FILES_V16,
        ...POLICY_SOURCE_FILES_V16,
        ...H0_SOURCE_FILES_V16,
        ...additionalSources,
    ].map((file) => file.replaceAll('\\', '/')))].sort();
    const missing = candidates.filter((file) => !fs.existsSync(path.resolve(process.cwd(), file)));
    if (missing.length > 0) throw new Error(`搜索源码身份缺少文件：${missing.join(', ')}`);
    const sourceFiles = candidates.map((repoRelativePath) => ({
        path: repoRelativePath,
        sha256: sha256File(path.resolve(process.cwd(), repoRelativePath)),
    }));
    return { sourceFiles, sourceSha256: sha256Text(canonicalJson(sourceFiles)) };
}

/**
 * 校验全新40家族清单的冻结结构。
 *
 * 根状态允许在不同家族间同形；独立性由后续披露与局部门槛判断，这里不拒绝重复根哈希。
 */
export function validateFreshManifest(manifest: Manifest): void {
    if (manifest.schema !== 'v19_fresh_window_manifest_1') {
        throw new Error(`清单 schema 必须是 v19_fresh_window_manifest_1，实际 ${manifest.schema ?? '缺失'}`);
    }
    if (!Array.isArray(manifest.entries)) throw new Error('清单缺少 entries 数组');
    if (manifest.entries.length !== 40) throw new Error(`清单必须正好包含40个窗口，实际 ${manifest.entries.length}`);

    const policySha = manifest.policy?.sha256;
    if (!policySha || !/^[0-9a-f]{64}$/i.test(policySha)) throw new Error('清单 policy.sha256 必须是64位十六进制SHA-256');

    const uniqueFields: Array<[keyof Pick<ManifestEntry, 'windowId' | 'familyId' | 'seed'>, Set<string>]> = [
        ['windowId', new Set<string>()],
        ['familyId', new Set<string>()],
        ['seed', new Set<string>()],
    ];
    const perMap = Array.from({ length: 5 }, () => ({ dev: 0, sealed: 0 }));
    for (const [index, entry] of manifest.entries.entries()) {
        const label = `entries[${index}]`;
        if (!entry || typeof entry !== 'object') throw new Error(`${label} 必须是对象`);
        if (!Number.isInteger(entry.mapIndex) || entry.mapIndex < 0 || entry.mapIndex > 4) {
            throw new Error(`${label}.mapIndex 必须是0..4整数`);
        }
        if (entry.group !== 'dev' && entry.group !== 'sealed') throw new Error(`${label}.group 必须是 dev 或 sealed`);
        if (entry.ownSeat !== 0 && entry.ownSeat !== 1) throw new Error(`${label}.ownSeat 必须是0或1`);
        if (!Number.isSafeInteger(entry.seed)) throw new Error(`${label}.seed 必须是安全整数`);
        if (typeof entry.windowId !== 'string' || entry.windowId.length === 0) throw new Error(`${label}.windowId 不能为空`);
        if (typeof entry.familyId !== 'string' || entry.familyId.length === 0) throw new Error(`${label}.familyId 不能为空`);
        if (typeof entry.rootStateHash !== 'string' || entry.rootStateHash.length === 0) {
            throw new Error(`${label}.rootStateHash 不能为空`);
        }
        if (typeof entry.rootStateJson !== 'string' || entry.rootStateJson.length === 0) {
            throw new Error(`${label}.rootStateJson 不能为空`);
        }
        const entryPolicySha = typeof entry.policySha256 === 'string' ? entry.policySha256 : null;
        if (entryPolicySha !== policySha) throw new Error(`${label}.policySha256 与清单 policy.sha256 不一致`);

        for (const [key, values] of uniqueFields) {
            const value = String(entry[key]);
            if (values.has(value)) throw new Error(`清单含重复 ${key}：${value}`);
            values.add(value);
        }

        let root: GameState;
        try {
            root = JSON.parse(entry.rootStateJson) as GameState;
        } catch {
            throw new Error(`${label}.rootStateJson 不是合法JSON`);
        }
        if (!root || typeof root !== 'object') throw new Error(`${label}.rootStateJson 必须解析为对象`);
        if (root.currentPlayer !== entry.ownSeat) {
            throw new Error(`${label} 根状态 currentPlayer=${String(root.currentPlayer)} 与 ownSeat=${entry.ownSeat} 不一致`);
        }
        const actualRootHash = hashState(root);
        if (actualRootHash !== entry.rootStateHash) {
            throw new Error(`${label}.rootStateHash 不符：声明 ${entry.rootStateHash}，实际 ${actualRootHash}`);
        }
        perMap[entry.mapIndex][entry.group] += 1;
    }

    const dev = manifest.entries.filter((entry) => entry.group === 'dev').length;
    const sealed = manifest.entries.filter((entry) => entry.group === 'sealed').length;
    if (dev !== 20 || sealed !== 20) throw new Error(`清单分组必须是 dev=20、sealed=20，实际 dev=${dev}、sealed=${sealed}`);
    for (let mapIndex = 0; mapIndex < perMap.length; mapIndex += 1) {
        const count = perMap[mapIndex];
        if (count.dev !== 4 || count.sealed !== 4) {
            throw new Error(`地图${mapIndex}必须各有4个dev和4个sealed，实际dev=${count.dev}、sealed=${count.sealed}`);
        }
    }

    const counts = manifest.counts;
    if (!counts || counts.total !== 40 || counts.dev !== 20 || counts.sealed !== 20
        || !Array.isArray(counts.perMapDev) || counts.perMapDev.length !== 5 || counts.perMapDev.some((value) => value !== 4)
        || !Array.isArray(counts.perMapSealed) || counts.perMapSealed.length !== 5 || counts.perMapSealed.some((value) => value !== 4)) {
        throw new Error('清单 counts 必须声明 total=40、dev=20、sealed=20，且每图每组均为4');
    }
}

function sameIdentity(left: ExperimentIdentity, right: ExperimentIdentity): boolean {
    return left.manifestSha256 === right.manifestSha256
        && left.modelSha256 === right.modelSha256
        && left.budgetSha256 === right.budgetSha256
        && left.budgetFileSha256 === right.budgetFileSha256
        && left.sourceSha256 === right.sourceSha256
        && left.group === right.group;
}

function atomicWriteJson(target: string, value: unknown): void {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(temporary, target);
}

function safeWindowName(windowId: string): string {
    const safe = windowId.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!safe || safe === '.' || safe === '..') throw new Error(`非法 windowId：${windowId}`);
    return `${safe}.json`;
}

function entryWithoutRoot(entry: ManifestEntry): WindowEnvelope['entry'] {
    const { rootStateJson: _rootStateJson, ...metadata } = entry;
    return metadata;
}

function assertIndependentValidation(result: WindowSearchResult, entry: ManifestEntry, validationSeed: number): void {
    const validation = result.validation as WindowSearchResult['validation'] & {
        fromRoot?: boolean;
        rootStateHash?: string;
    };
    if (!validation) throw new Error('搜索结果缺少独立验证');
    if (validation.fromRoot !== true) throw new Error('验证不是从共同根状态独立执行');
    if (validation.rootStateHash !== entry.rootStateHash) {
        throw new Error(`验证根状态哈希不符：${validation.rootStateHash ?? '缺失'} != ${entry.rootStateHash}`);
    }
    if (validation.streamSeed !== validationSeed) {
        throw new Error(`验证流种子不符：${validation.streamSeed ?? '缺失'} != ${validationSeed}`);
    }
    if (result.selected && !validation.selected) throw new Error('已有 selected，但缺少选中臂独立验证结果');
}

function validateExisting(envelope: WindowEnvelope, identity: ExperimentIdentity, entry?: ManifestEntry): void {
    if (envelope.schema !== 'v19_search_window_result_2') throw new Error('结果 schema 不匹配');
    if (!sameIdentity(envelope.identity, identity)) throw new Error('结果的清单/模型/源码/预算身份与本次运行不一致');
    if (entry) {
        if (envelope.entry.windowId !== entry.windowId || envelope.entry.rootStateHash !== entry.rootStateHash
            || envelope.entry.seed !== entry.seed || envelope.entry.familyId !== entry.familyId) {
            throw new Error(`窗口 ${entry.windowId} 的清单条目身份不匹配`);
        }
    }
}

function readEnvelope(file: string): WindowEnvelope {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as WindowEnvelope;
}

function summaryName(args: Args): string {
    if (args.startIndex === 0 && args.limit === null) return `summary_${args.group}.json`;
    const limit = args.limit === null ? 'all' : String(args.limit).padStart(3, '0');
    return `summary_${args.group}_start${String(args.startIndex).padStart(3, '0')}_limit${limit}.json`;
}

export async function runSearchExperiment(argv = process.argv.slice(2)): Promise<void> {
    const args = parseArgs(argv);
    const manifestRaw = fs.readFileSync(args.manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw) as Manifest;
    validateFreshManifest(manifest);
    const duplicateIds = manifest.entries
        .map((entry) => entry.windowId)
        .filter((id, index, all) => all.indexOf(id) !== index);
    if (duplicateIds.length > 0) throw new Error(`清单含重复 windowId：${[...new Set(duplicateIds)].join(', ')}`);
    const outputNames = manifest.entries.map((entry) => safeWindowName(entry.windowId));
    const duplicateOutputNames = outputNames.filter((name, index, all) => all.indexOf(name) !== index);
    if (duplicateOutputNames.length > 0) {
        throw new Error(`清单 windowId 规范化后文件名冲突：${[...new Set(duplicateOutputNames)].join(', ')}`);
    }

    const budgetInfo = loadBudget(args.budgetFile, args.group);
    const modelPath = resolveModelPath(manifest, args.manifestPath);
    const modelSha = sha256File(modelPath);
    if (manifest.policy?.sha256 && manifest.policy.sha256 !== modelSha) {
        throw new Error(`模型 SHA 与清单不符：清单 ${manifest.policy.sha256}，实际 ${modelSha}`);
    }
    const sources = sourceIdentity();
    const identity: ExperimentIdentity = {
        manifestPath: relativePath(args.manifestPath),
        manifestSha256: sha256Text(manifestRaw),
        modelPath: relativePath(modelPath),
        modelSha256: modelSha,
        budgetPath: relativePath(args.budgetFile),
        budgetFileSha256: budgetInfo.fileSha,
        budgetSha256: budgetInfo.budgetSha,
        ...sources,
        group: args.group,
    };

    const groupEntries = manifest.entries.filter((entry) => entry.group === args.group);
    const selectedEntries = groupEntries.slice(
        args.startIndex,
        args.limit === null ? undefined : args.startIndex + args.limit,
    );
    const windowDir = path.join(args.outDir, 'windows', args.group);
    fs.mkdirSync(windowDir, { recursive: true });

    // 恢复前检查目录内所有可复用文件，防止汇总时静默混入另一配置。
    const existingFiles = fs.readdirSync(windowDir).filter((name) => name.endsWith('.json'));
    if (existingFiles.length > 0 && !args.resume) {
        throw new Error(`结果目录已有 ${existingFiles.length} 个窗口文件；若身份一致请显式使用 --resume`);
    }
    if (args.resume) {
        const entriesById = new Map(groupEntries.map((entry) => [entry.windowId, entry]));
        for (const name of existingFiles) {
            const envelope = readEnvelope(path.join(windowDir, name));
            const manifestEntry = entriesById.get(String(envelope.entry?.windowId));
            if (!manifestEntry) throw new Error(`已有结果 ${name} 不属于本次清单的 ${args.group} 组`);
            validateExisting(envelope, identity, manifestEntry);
        }
    }

    const pending = selectedEntries.filter((entry) => {
        const file = path.join(windowDir, safeWindowName(entry.windowId));
        if (!fs.existsSync(file)) return true;
        const existing = readEnvelope(file);
        validateExisting(existing, identity, entry);
        return existing.status !== 'success';
    });
    const predictor = pending.length > 0
        ? new SpatialResNetPredictor(loadSpatialResNetFromJson(fs.readFileSync(modelPath, 'utf8')))
        : null;

    let finished = 0;
    for (const entry of selectedEntries) {
        const target = path.join(windowDir, safeWindowName(entry.windowId));
        if (fs.existsSync(target)) {
            const existing = readEnvelope(target);
            if (existing.status === 'success') {
                finished += 1;
                console.log(`[搜索复验] ${finished}/${selectedEntries.length} ${entry.windowId} 已验证，跳过`);
                continue;
            }
        }
        const { searchSeed, validationSeed } = deriveStreamSeeds(entry.seed);
        let envelope: WindowEnvelope;
        try {
            if (!predictor) throw new Error('内部错误：待运行窗口没有模型实例');
            const result = searchWindow({
                windowId: entry.windowId,
                familyId: entry.familyId,
                mapName: entry.mapName,
                seed: entry.seed,
                ownSeat: entry.ownSeat,
                group: entry.group,
                engineStepIndex: entry.engineStepIndex,
                rootState: JSON.parse(entry.rootStateJson) as GameState,
                budget: budgetInfo.budget,
                opponentStreamSeed: searchSeed,
                validationStreamSeed: validationSeed,
                validationMaxSteps: budgetInfo.budget.maxStepsPerContinuation,
                policyId: manifest.policy?.id ?? 'manifest-policy',
            }, predictor);
            assertIndependentValidation(result, entry, validationSeed);
            envelope = {
                schema: 'v19_search_window_result_2',
                status: 'success',
                generatedAt: new Date().toISOString(),
                identity,
                entry: entryWithoutRoot(entry),
                streams: { searchSeed, validationSeed },
                result,
                error: null,
            };
        } catch (error) {
            envelope = {
                schema: 'v19_search_window_result_2',
                status: 'error',
                generatedAt: new Date().toISOString(),
                identity,
                entry: entryWithoutRoot(entry),
                streams: { searchSeed, validationSeed },
                result: null,
                error: error instanceof Error ? error.stack ?? error.message : String(error),
            };
        }
        atomicWriteJson(target, envelope);
        finished += 1;
        console.log(`[搜索复验] ${finished}/${selectedEntries.length} ${entry.windowId} ${envelope.status === 'success' ? '完成' : '失败'}`);
    }

    const allRows = loadResultEnvelopes(windowDir);
    const success = allRows.filter((row) => row.status === 'success').length;
    const errors = allRows.filter((row) => row.status === 'error').length;
    const gate = args.group === 'sealed' ? evaluateSearchGate(allRows, 20) : null;
    const summary = {
        schema: 'v19_search_experiment_summary_2',
        generatedAt: new Date().toISOString(),
        identity,
        requested: {
            group: args.group,
            startIndex: args.startIndex,
            limit: args.limit,
            selectedWindows: selectedEntries.length,
        },
        totalsInGroupDirectory: { files: allRows.length, success, errors },
        gate,
        windowsDirectory: relativePath(windowDir),
    };
    const summaryPath = path.join(args.outDir, summaryName(args));
    atomicWriteJson(summaryPath, summary);
    console.log(`[搜索复验] 汇总：${summaryPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runSearchExperiment().catch((error) => {
        console.error(`[搜索复验] 失败：${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    });
}

