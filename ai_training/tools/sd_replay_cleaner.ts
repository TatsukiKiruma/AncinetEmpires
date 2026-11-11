import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSdTrainingPlanConfig } from './sd_training_state_generator';
import { validateBatch } from './apk_game_get_validate';

interface SdReplayCleanerOptions {
    planFile: string;
    rootDir: string | null;
    outDir: string | null;
    forcedSummaryFile: string | null;
    strictSummaryFile: string | null;
    validateLive: boolean;
    json: boolean;
}

interface CleanReplayRecord {
    kind: 'sd_clean_replay';
    version: 1;
    category: 'full' | 'partial';
    inputPath: string;
    copiedPath: string;
    fileName: string;
    sha256: string;
    actionCount: number | null;
    executedRecordCount: number | null;
    finalTurn: number | null;
    finalWinner: number | null;
    currentStep: number | null;
    roomStatus: string | null;
}

interface RejectedReplayRecord {
    kind: 'sd_rejected_replay';
    version: 1;
    inputPath: string;
    fileName: string;
    sha256: string;
    reason: string;
    detail: string;
}

interface SdReplayCleanSummary {
    generatedAt: string;
    rootDir: string;
    outDir: string;
    forcedPassed: number;
    strictPassed: number;
    fullClean: number;
    partialClean: number;
    rejected: number;
    validationSource: {
        forced: string;
        strict: string;
    };
    files: {
        fullJsonl: string;
        partialJsonl: string;
        rejectedJson: string;
        summaryMd: string;
    };
}

const DEFAULT_PLAN_FILE = path.resolve(process.cwd(), 'training_configs', 'sd_training_plan_20260705.json');
const DEFAULT_FORCED_SUMMARY_NAME = 'forced_unique_resume_after_exact_summary.json';
const DEFAULT_STRICT_SUMMARY_NAME = 'strict_diff_summary_after_metadata_all112.json';
const DIRECT_RUN_PATH = process.argv[1] ? path.resolve(process.argv[1]) : '';
const THIS_FILE_PATH = fileURLToPath(import.meta.url);

function printHelp() {
    console.log(`用法: npm run sd:replay-clean -- [选项]

选项:
  --plan <file>    SD 训练计划 JSON，默认 training_configs/sd_training_plan_20260705.json
  --root <dir>     game_get 捕获根目录；默认使用计划 replayCleaning.rootDir
  --out <dir>      清洗输出目录；默认使用计划 replayCleaning.outDir
  --forced-summary <file>  forced 校验汇总 JSON；默认 captures/mitm_replay/${DEFAULT_FORCED_SUMMARY_NAME}
  --strict-summary <file>  strict 校验汇总 JSON；默认 captures/mitm_replay/${DEFAULT_STRICT_SUMMARY_NAME}
  --validate-live  不复用已有报告，实时重新跑 forced/strict 校验
  --json           输出 JSON 摘要
  --help           显示帮助
`);
}

function parseArgs(argv: readonly string[]): SdReplayCleanerOptions {
    const options: SdReplayCleanerOptions = {
        planFile: DEFAULT_PLAN_FILE,
        rootDir: null,
        outDir: null,
        forcedSummaryFile: null,
        strictSummaryFile: null,
        validateLive: false,
        json: false
    };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--help') {
            printHelp();
            process.exit(0);
        } else if (arg === '--plan') {
            const value = argv[++index];
            if (!value) throw new Error('--plan 缺少文件参数');
            options.planFile = path.resolve(value);
        } else if (arg === '--root') {
            const value = argv[++index];
            if (!value) throw new Error('--root 缺少目录参数');
            options.rootDir = path.resolve(value);
        } else if (arg === '--out') {
            const value = argv[++index];
            if (!value) throw new Error('--out 缺少目录参数');
            options.outDir = path.resolve(value);
        } else if (arg === '--forced-summary') {
            const value = argv[++index];
            if (!value) throw new Error('--forced-summary 缺少文件参数');
            options.forcedSummaryFile = path.resolve(value);
        } else if (arg === '--strict-summary') {
            const value = argv[++index];
            if (!value) throw new Error('--strict-summary 缺少文件参数');
            options.strictSummaryFile = path.resolve(value);
        } else if (arg === '--validate-live') {
            options.validateLive = true;
        } else if (arg === '--json') {
            options.json = true;
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }
    return options;
}

function createValidateOptions(rootDir: string, forceExecuteReplayActions: boolean) {
    return {
        inputs: [],
        rootDir,
        outPath: null,
        json: true,
        mode: 'SD',
        maxRecords: 100000,
        offset: 0,
        limit: null,
        uniqueOffset: null,
        uniqueLimit: null,
        dedupe: true,
        allowAmbiguousRecruit: true,
        strictTerrain: false,
        forceExecuteReplayActions
    };
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function readJsonFile(filePath: string): Promise<any> {
    return JSON.parse(await readFile(filePath, 'utf8'));
}

function resolveReportPath(summaryFile: string, reportPath: string): string {
    return path.isAbsolute(reportPath)
        ? reportPath
        : path.resolve(path.dirname(summaryFile), reportPath);
}

async function loadReportItemsFromSummary(summaryFile: string): Promise<{ source: string; items: any[] }> {
    const summary = await readJsonFile(summaryFile);
    if (!Array.isArray(summary.reports)) {
        throw new Error(`校验汇总缺少 reports 数组: ${summaryFile}`);
    }
    const items: any[] = [];
    for (const reportPath of summary.reports) {
        if (typeof reportPath !== 'string') {
            throw new Error(`校验汇总包含非字符串 report 路径: ${summaryFile}`);
        }
        const resolvedReportPath = resolveReportPath(summaryFile, reportPath);
        const report = await readJsonFile(resolvedReportPath);
        if (!Array.isArray(report.items)) {
            throw new Error(`校验报告缺少 items 数组: ${resolvedReportPath}`);
        }
        items.push(...report.items);
    }
    return {
        source: `summary:${summaryFile}`,
        items
    };
}

async function loadValidationItems(
    rootDir: string,
    summaryFile: string,
    forceExecuteReplayActions: boolean,
    validateLive: boolean
): Promise<{ source: string; items: any[] }> {
    if (!validateLive && await fileExists(summaryFile)) {
        return loadReportItemsFromSummary(summaryFile);
    }
    const report = await validateBatch(createValidateOptions(rootDir, forceExecuteReplayActions) as any) as any;
    return {
        source: `validate-live:${rootDir}`,
        items: report.items
    };
}

function getOrdinal(fileName: string): number | null {
    const match = fileName.match(/_(\d{3})\.bin$/i);
    return match ? Number(match[1]) : null;
}

function isBlacklisted(item: any, blacklistFileNames: Set<string>, blacklistOrdinals: Set<number>): boolean {
    if (blacklistFileNames.has(item.fileName)) return true;
    const ordinal = getOrdinal(item.fileName);
    return ordinal !== null && blacklistOrdinals.has(ordinal);
}

function forceItemReason(item: any): { reason: string; detail: string } | null {
    if (item.skipped) return { reason: 'duplicate', detail: `重复于 ${item.duplicateOf ?? '-'}` };
    if (item.error) return { reason: 'parse-error', detail: item.error };
    if (!item.validation?.success) return { reason: 'forced-failed', detail: item.validation?.firstError ?? 'forced 回放失败' };
    return null;
}

function strictItemReason(item: any | undefined): { reason: string; detail: string } | null {
    if (!item) return { reason: 'strict-missing', detail: '没有对应 strict 校验项' };
    if (item.skipped) return { reason: 'strict-duplicate', detail: `strict 重复于 ${item.duplicateOf ?? '-'}` };
    if (item.error) return { reason: 'strict-parse-error', detail: item.error };
    if (!item.validation?.success) return {
        reason: 'strict-not-trainable',
        detail: item.validation?.failureClassification
            ? `${item.validation.failureClassification.code}: ${item.validation.failureClassification.detail}`
            : item.validation?.firstError ?? 'strict 校验失败'
    };
    return null;
}

async function copyCleanReplay(item: any, outDir: string, category: 'full' | 'partial'): Promise<string> {
    const targetDir = path.join(outDir, category === 'full' ? 'replay_full_clean_files' : 'replay_partial_clean_files');
    await mkdir(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, item.fileName);
    await copyFile(item.inputPath, targetPath);
    return targetPath;
}

function toCleanRecord(item: any, copiedPath: string, category: 'full' | 'partial'): CleanReplayRecord {
    return {
        kind: 'sd_clean_replay',
        version: 1,
        category,
        inputPath: item.inputPath,
        copiedPath,
        fileName: item.fileName,
        sha256: item.sha256,
        actionCount: item.actions?.count ?? null,
        executedRecordCount: item.validation?.executedRecordCount ?? null,
        finalTurn: item.validation?.finalTurn ?? null,
        finalWinner: item.validation?.finalWinner ?? null,
        currentStep: item.diagnostics?.currentStep ?? null,
        roomStatus: item.diagnostics?.status ?? null
    };
}

function toRejectedRecord(item: any, reason: string, detail: string): RejectedReplayRecord {
    return {
        kind: 'sd_rejected_replay',
        version: 1,
        inputPath: item.inputPath,
        fileName: item.fileName,
        sha256: item.sha256,
        reason,
        detail
    };
}

function formatSummary(summary: SdReplayCleanSummary, rejected: readonly RejectedReplayRecord[]): string {
    const reasonCounts = new Map<string, number>();
    for (const item of rejected) reasonCounts.set(item.reason, (reasonCounts.get(item.reason) ?? 0) + 1);
    const lines = [
        '# SD 回放清洗报告',
        '',
        `- 根目录：\`${summary.rootDir}\``,
        `- 输出目录：\`${summary.outDir}\``,
        `- forced 通过：${summary.forcedPassed}`,
        `- strict 通过：${summary.strictPassed}`,
        `- full clean：${summary.fullClean}`,
        `- partial clean：${summary.partialClean}`,
        `- rejected：${summary.rejected}`,
        `- forced 来源：\`${summary.validationSource.forced}\``,
        `- strict 来源：\`${summary.validationSource.strict}\``,
        '',
        '| 拒绝原因 | 数量 |',
        '| --- | ---: |'
    ];
    for (const [reason, count] of [...reasonCounts.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        lines.push(`| ${reason} | ${count} |`);
    }
    lines.push('', '## 黑名单确认', '', '以下序号必须出现在 rejected 中：`065`、`078`、`097`。');
    return `${lines.join('\n')}\n`;
}

async function writeJsonl(filePath: string, records: readonly unknown[]) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, records.map(record => JSON.stringify(record)).join('\n') + (records.length > 0 ? '\n' : ''), 'utf8');
}

export async function cleanSdReplays(options: SdReplayCleanerOptions): Promise<SdReplayCleanSummary> {
    const config = await loadSdTrainingPlanConfig(options.planFile);
    const rootDir = path.resolve(options.rootDir ?? config.replayCleaning.rootDir);
    const outDir = path.resolve(options.outDir ?? config.replayCleaning.outDir);
    const defaultSummaryDir = path.join(rootDir, 'mitm_replay');
    const forcedSummaryFile = options.forcedSummaryFile ?? path.join(defaultSummaryDir, DEFAULT_FORCED_SUMMARY_NAME);
    const strictSummaryFile = options.strictSummaryFile ?? path.join(defaultSummaryDir, DEFAULT_STRICT_SUMMARY_NAME);
    const blacklistFileNames = new Set(config.replayCleaning.blacklistFileNames);
    const blacklistOrdinals = new Set(config.replayCleaning.blacklistOrdinals);

    const forcedReport = await loadValidationItems(rootDir, forcedSummaryFile, true, options.validateLive);
    const strictReport = await loadValidationItems(rootDir, strictSummaryFile, false, options.validateLive);
    const strictBySha = new Map<string, any>();
    for (const item of strictReport.items) {
        if (item.sha256 && !strictBySha.has(item.sha256)) strictBySha.set(item.sha256, item);
    }

    const full: CleanReplayRecord[] = [];
    const partial: CleanReplayRecord[] = [];
    const rejected: RejectedReplayRecord[] = [];

    for (const item of forcedReport.items) {
        if (isBlacklisted(item, blacklistFileNames, blacklistOrdinals)) {
            rejected.push(toRejectedRecord(item, 'blacklisted', '用户确认 065/078/097 不参与训练'));
            continue;
        }

        const forcedReason = forceItemReason(item);
        if (forcedReason) {
            rejected.push(toRejectedRecord(item, forcedReason.reason, forcedReason.detail));
            continue;
        }

        const strictReason = strictItemReason(strictBySha.get(item.sha256));
        if (strictReason) {
            rejected.push(toRejectedRecord(item, strictReason.reason, strictReason.detail));
            continue;
        }

        const category: 'full' | 'partial' = item.validation?.finalWinner === null ? 'partial' : 'full';
        const copiedPath = await copyCleanReplay(item, outDir, category);
        const record = toCleanRecord(item, copiedPath, category);
        if (category === 'full') full.push(record);
        else partial.push(record);
    }

    const fullJsonl = path.join(outDir, 'replay_full_clean.jsonl');
    const partialJsonl = path.join(outDir, 'replay_partial_clean.jsonl');
    const rejectedJson = path.join(outDir, 'replay_rejected.json');
    const summaryMd = path.join(outDir, 'replay_clean_summary.md');

    await writeJsonl(fullJsonl, full);
    await writeJsonl(partialJsonl, partial);
    await mkdir(path.dirname(rejectedJson), { recursive: true });
    await writeFile(rejectedJson, `${JSON.stringify(rejected, null, 2)}\n`, 'utf8');

    const summary: SdReplayCleanSummary = {
        generatedAt: new Date().toISOString(),
        rootDir,
        outDir,
        forcedPassed: forcedReport.items.filter((item: any) => !item.skipped && !item.error && item.validation?.success).length,
        strictPassed: strictReport.items.filter((item: any) => !item.skipped && !item.error && item.validation?.success).length,
        fullClean: full.length,
        partialClean: partial.length,
        rejected: rejected.length,
        validationSource: {
            forced: forcedReport.source,
            strict: strictReport.source
        },
        files: {
            fullJsonl,
            partialJsonl,
            rejectedJson,
            summaryMd
        }
    };
    await writeFile(summaryMd, formatSummary(summary, rejected), 'utf8');
    return summary;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const summary = await cleanSdReplays(options);
    if (options.json) {
        console.log(JSON.stringify({ summary }, null, 2));
        return;
    }
    console.log(`已生成 SD 回放清洗目录：${summary.outDir}`);
    console.log(`full=${summary.fullClean}, partial=${summary.partialClean}, rejected=${summary.rejected}`);
}

const isDirectRun = DIRECT_RUN_PATH === THIS_FILE_PATH;
if (isDirectRun) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
