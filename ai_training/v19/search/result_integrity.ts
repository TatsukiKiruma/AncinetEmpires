/** 搜索正式结果汇总前的身份与清单完整性验收。 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SearchBudget } from './rollout_search';
import { searchBudgetSha256, sourceIdentity } from './search_experiment_v2';

type Group = 'dev' | 'sealed';

export interface IntegrityManifestEntry {
    windowId: string;
    familyId: string;
    mapIndex: number;
    seed: number;
    ownSeat: number;
    group: Group;
    rootStateHash: string;
    [key: string]: unknown;
}

export interface IntegrityManifest {
    policy?: { path?: string; sha256?: string };
    entries: IntegrityManifestEntry[];
    [key: string]: unknown;
}

export interface IntegrityIdentity {
    manifestSha256?: string;
    modelSha256?: string;
    budgetFileSha256?: string;
    budgetSha256?: string;
    sourceSha256?: string;
    sourceFiles?: Array<{ path: string; sha256: string }>;
    group?: Group;
}

export interface IntegrityEnvelope {
    schema?: string;
    status?: string;
    error?: string | null;
    identity?: IntegrityIdentity;
    entry?: Partial<IntegrityManifestEntry>;
    result?: {
        validation?: { fromRoot?: boolean; rootStateHash?: string } | null;
        [key: string]: unknown;
    } | null;
}

export type ManifestInput = string | {
    data: IntegrityManifest;
    /** 对象输入必须携带冻结文件的原始 SHA，不能从重排后的对象猜测文件身份。 */
    sha256: string;
    /** 用于解析 policy.path；默认当前工作目录。 */
    baseDir?: string;
};

export interface ValidateExperimentResultsOptions {
    manifest: ManifestInput;
    budgetPath: string;
    dev: IntegrityEnvelope[];
    sealed: IntegrityEnvelope[];
    expectedTotal?: number;
    expectedPerGroup?: number;
}

export interface IntegrityIssue {
    code: string;
    message: string;
    windowId?: string;
}

export interface RootDuplicateDisclosure {
    rootStateHash: string;
    windowIds: string[];
    groups: Group[];
}

export interface SemanticRootOverlap {
    semanticRootSha256: string;
    devWindowIds: string[];
    sealedWindowIds: string[];
}

export interface ExperimentIntegrityReport {
    schema: 'v19_search_result_integrity_1';
    valid: boolean;
    counts: {
        manifest: number;
        manifestDev: number;
        manifestSealed: number;
        result: number;
        resultDev: number;
        resultSealed: number;
        uniqueResultWindowIds: number;
    };
    expectedIdentity: {
        manifestSha256: string;
        modelSha256: string;
        budgetFileSha256: string;
        budgetSha256: string;
        sourceSha256: string;
    };
    missingWindowIds: string[];
    extraWindowIds: string[];
    duplicateResultWindowIds: string[];
    rootDuplicates: RootDuplicateDisclosure[];
    semanticRootOverlaps: SemanticRootOverlap[];
    issues: IntegrityIssue[];
    notes: string[];
}

function sha256Buffer(value: string | Buffer): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function loadManifest(input: ManifestInput): { data: IntegrityManifest; sha256: string; baseDir: string } {
    if (typeof input !== 'string') {
        return { data: input.data, sha256: input.sha256, baseDir: input.baseDir ?? process.cwd() };
    }
    const manifestPath = path.resolve(input);
    const raw = fs.readFileSync(manifestPath);
    return {
        data: JSON.parse(raw.toString('utf8')) as IntegrityManifest,
        sha256: sha256Buffer(raw),
        baseDir: path.dirname(manifestPath),
    };
}

function resolveDeclaredFile(declared: string, manifestBaseDir: string): string {
    const rootRelative = path.resolve(process.cwd(), declared);
    if (fs.existsSync(rootRelative)) return rootRelative;
    const manifestRelative = path.resolve(manifestBaseDir, declared);
    if (fs.existsSync(manifestRelative)) return manifestRelative;
    throw new Error(`身份文件不存在：${declared}`);
}

function expectedIdentity(manifest: IntegrityManifest, manifestSha256: string, manifestBaseDir: string, budgetPath: string) {
    if (!manifest.policy?.path) throw new Error('manifest 缺少 policy.path');
    const modelPath = resolveDeclaredFile(manifest.policy.path, manifestBaseDir);
    const modelSha256 = sha256Buffer(fs.readFileSync(modelPath));
    if (manifest.policy.sha256 && manifest.policy.sha256 !== modelSha256) {
        throw new Error(`manifest policy.sha256 与模型文件不符：${manifest.policy.sha256} != ${modelSha256}`);
    }
    const resolvedBudget = path.resolve(budgetPath);
    const budgetRaw = fs.readFileSync(resolvedBudget);
    const parsed = JSON.parse(budgetRaw.toString('utf8')) as { budget?: SearchBudget } | SearchBudget;
    const budget = (parsed as { budget?: SearchBudget }).budget ?? parsed as SearchBudget;
    const budgetSha256 = searchBudgetSha256(budget);
    const declaredBudgetSha = (parsed as { budgetSha256?: string }).budgetSha256;
    if (declaredBudgetSha && declaredBudgetSha !== budgetSha256) {
        throw new Error(`预算文件声明 SHA 与预算对象不符：${declaredBudgetSha} != ${budgetSha256}`);
    }
    const sources = sourceIdentity();
    return {
        manifestSha256,
        modelSha256,
        budgetFileSha256: sha256Buffer(budgetRaw),
        budgetSha256,
        sourceSha256: sources.sourceSha256,
        sourceFiles: sources.sourceFiles,
    };
}

function pushIssue(issues: IntegrityIssue[], code: string, message: string, windowId?: string): void {
    issues.push({ code, message, ...(windowId ? { windowId } : {}) });
}

function discloseRootDuplicates(entries: IntegrityManifestEntry[]): RootDuplicateDisclosure[] {
    const byRoot = new Map<string, IntegrityManifestEntry[]>();
    for (const entry of entries) {
        const rows = byRoot.get(entry.rootStateHash) ?? [];
        rows.push(entry);
        byRoot.set(entry.rootStateHash, rows);
    }
    return [...byRoot.entries()]
        .filter(([, rows]) => rows.length > 1)
        .map(([rootStateHash, rows]) => ({
            rootStateHash,
            windowIds: rows.map((row) => row.windowId).sort(),
            groups: [...new Set(rows.map((row) => row.group))].sort() as Group[],
        }))
        .sort((left, right) => left.rootStateHash.localeCompare(right.rootStateHash));
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

/** 只删除采样家族标签；其余状态字段均参与语义根身份。 */
function semanticRootSha256(rootStateJson: unknown): string {
    if (typeof rootStateJson !== 'string') throw new Error('manifest entry 缺少 rootStateJson');
    const state = JSON.parse(rootStateJson) as Record<string, unknown>;
    const metadata = state.metadata;
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
        delete (metadata as Record<string, unknown>).sdTrainingSeed;
    }
    return sha256Buffer(canonicalJson(state));
}

function discloseSemanticRootOverlaps(
    entries: IntegrityManifestEntry[],
    issues: IntegrityIssue[],
): SemanticRootOverlap[] {
    const bySemanticRoot = new Map<string, { dev: string[]; sealed: string[] }>();
    for (const entry of entries) {
        try {
            const digest = semanticRootSha256(entry.rootStateJson);
            const bucket = bySemanticRoot.get(digest) ?? { dev: [], sealed: [] };
            bucket[entry.group].push(entry.windowId);
            bySemanticRoot.set(digest, bucket);
        } catch (error) {
            pushIssue(issues, 'MANIFEST_ROOT_STATE',
                `无法计算语义根身份：${error instanceof Error ? error.message : String(error)}`, entry.windowId);
        }
    }
    return [...bySemanticRoot.entries()]
        .filter(([, bucket]) => bucket.dev.length > 0 && bucket.sealed.length > 0)
        .map(([semanticRootSha256, bucket]) => ({
            semanticRootSha256,
            devWindowIds: bucket.dev.sort(),
            sealedWindowIds: bucket.sealed.sort(),
        }))
        .sort((left, right) => left.semanticRootSha256.localeCompare(right.semanticRootSha256));
}

/**
 * 验收正式40窗口结果。函数只返回报告，不修改输入，也不自行读取结果目录。
 * 调用方必须在 valid=true 后才可继续自然门槛或局部门槛汇总。
 */
export function validateExperimentResults(options: ValidateExperimentResultsOptions): ExperimentIntegrityReport {
    const expectedTotal = options.expectedTotal ?? 40;
    const expectedPerGroup = options.expectedPerGroup ?? 20;
    const loaded = loadManifest(options.manifest);
    const manifest = loaded.data;
    const issues: IntegrityIssue[] = [];
    if (!Array.isArray(manifest.entries)) throw new Error('manifest 缺少 entries 数组');
    const expected = expectedIdentity(manifest, loaded.sha256, loaded.baseDir, options.budgetPath);
    const semanticRootOverlaps = discloseSemanticRootOverlaps(manifest.entries, issues);
    const manifestById = new Map<string, IntegrityManifestEntry>();
    for (const entry of manifest.entries) {
        if (manifestById.has(entry.windowId)) {
            pushIssue(issues, 'MANIFEST_DUPLICATE_WINDOW_ID', `manifest 重复 windowId：${entry.windowId}`, entry.windowId);
        } else {
            manifestById.set(entry.windowId, entry);
        }
    }
    const manifestDev = manifest.entries.filter((entry) => entry.group === 'dev');
    const manifestSealed = manifest.entries.filter((entry) => entry.group === 'sealed');
    if (manifest.entries.length !== expectedTotal) {
        pushIssue(issues, 'MANIFEST_COUNT', `manifest 应有 ${expectedTotal} 项，实际 ${manifest.entries.length}`);
    }
    if (manifestDev.length !== expectedPerGroup || manifestSealed.length !== expectedPerGroup) {
        pushIssue(issues, 'MANIFEST_GROUP_COUNT',
            `manifest dev/sealed 应各 ${expectedPerGroup}，实际 ${manifestDev.length}/${manifestSealed.length}`);
    }

    const supplied: Array<{ envelope: IntegrityEnvelope; expectedGroup: Group }> = [
        ...options.dev.map((envelope) => ({ envelope, expectedGroup: 'dev' as const })),
        ...options.sealed.map((envelope) => ({ envelope, expectedGroup: 'sealed' as const })),
    ];
    const resultIds = supplied.map(({ envelope }, index) => String(envelope.entry?.windowId ?? `__missing_${index}`));
    const duplicateResultWindowIds = [...new Set(resultIds.filter((id, index) => resultIds.indexOf(id) !== index))].sort();
    for (const id of duplicateResultWindowIds) {
        pushIssue(issues, 'RESULT_DUPLICATE_WINDOW_ID', `结果重复 windowId：${id}`, id);
    }
    const resultIdSet = new Set(resultIds.filter((id) => !id.startsWith('__missing_')));
    const manifestIdSet = new Set(manifest.entries.map((entry) => entry.windowId));
    const missingWindowIds = [...manifestIdSet].filter((id) => !resultIdSet.has(id)).sort();
    const extraWindowIds = [...resultIdSet].filter((id) => !manifestIdSet.has(id)).sort();
    for (const id of missingWindowIds) pushIssue(issues, 'MISSING_RESULT', `缺少 manifest 结果：${id}`, id);
    for (const id of extraWindowIds) pushIssue(issues, 'EXTRA_RESULT', `结果不属于 manifest：${id}`, id);

    const expectedSourceFiles = JSON.stringify(expected.sourceFiles);
    for (const [index, { envelope, expectedGroup }] of supplied.entries()) {
        const id = envelope.entry?.windowId ? String(envelope.entry.windowId) : undefined;
        if (!id) pushIssue(issues, 'RESULT_MISSING_WINDOW_ID', `第 ${index} 条结果缺少 windowId`);
        if (envelope.schema !== 'v19_search_window_result_2') {
            pushIssue(issues, 'RESULT_SCHEMA', `结果 schema 错误：${String(envelope.schema)}`, id);
        }
        if (envelope.status !== 'success' || envelope.error || !envelope.result) {
            pushIssue(issues, 'RESULT_NOT_SUCCESS', '正式结果不是无错误 success 记录', id);
        }
        if (envelope.entry?.group !== expectedGroup || envelope.identity?.group !== expectedGroup) {
            pushIssue(issues, 'RESULT_GROUP', `结果必须属于 ${expectedGroup} 数组及身份组`, id);
        }
        const manifestEntry = id ? manifestById.get(id) : undefined;
        if (manifestEntry) {
            const fields: Array<keyof IntegrityManifestEntry> = [
                'familyId', 'mapIndex', 'seed', 'ownSeat', 'group', 'rootStateHash',
            ];
            for (const field of fields) {
                if (envelope.entry?.[field] !== manifestEntry[field]) {
                    pushIssue(issues, 'RESULT_MEMBER_MISMATCH', `结果字段 ${String(field)} 与 manifest 不符`, id);
                }
            }
            if (envelope.result?.validation?.fromRoot !== true
                || envelope.result.validation.rootStateHash !== manifestEntry.rootStateHash) {
                pushIssue(issues, 'RESULT_VALIDATION_ROOT', '验证不是从 manifest 共同根状态执行', id);
            }
        }
        const identityChecks: Array<[keyof IntegrityIdentity, string]> = [
            ['manifestSha256', expected.manifestSha256],
            ['modelSha256', expected.modelSha256],
            ['budgetFileSha256', expected.budgetFileSha256],
            ['budgetSha256', expected.budgetSha256],
            ['sourceSha256', expected.sourceSha256],
        ];
        for (const [field, value] of identityChecks) {
            if (envelope.identity?.[field] !== value) {
                pushIssue(issues, 'RESULT_IDENTITY', `身份字段 ${String(field)} 不一致`, id);
            }
        }
        if (JSON.stringify(envelope.identity?.sourceFiles) !== expectedSourceFiles) {
            pushIssue(issues, 'RESULT_SOURCE_FILES', '源码文件身份表不一致', id);
        }
    }

    return {
        schema: 'v19_search_result_integrity_1',
        valid: issues.length === 0,
        counts: {
            manifest: manifest.entries.length,
            manifestDev: manifestDev.length,
            manifestSealed: manifestSealed.length,
            result: supplied.length,
            resultDev: options.dev.length,
            resultSealed: options.sealed.length,
            uniqueResultWindowIds: resultIdSet.size,
        },
        expectedIdentity: {
            manifestSha256: expected.manifestSha256,
            modelSha256: expected.modelSha256,
            budgetFileSha256: expected.budgetFileSha256,
            budgetSha256: expected.budgetSha256,
            sourceSha256: expected.sourceSha256,
        },
        missingWindowIds,
        extraWindowIds,
        duplicateResultWindowIds,
        rootDuplicates: discloseRootDuplicates(manifest.entries),
        semanticRootOverlaps,
        issues,
        notes: [
            'manifest 根状态重复只披露，不作为完整性错误；局部技能门槛另行执行开发/封存根隔离。',
            'semanticRootOverlaps 仅删除 metadata.sdTrainingSeed 后计算，用于发现跨家族的同一经济局面。',
            '只有 valid=true 的40个正式结果才可进入后续汇总。',
        ],
    };
}

