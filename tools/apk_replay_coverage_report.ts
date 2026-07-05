import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CliOptions {
    rootDir: string;
    outPath: string | null;
    targetUnique: number;
    requireForce: boolean;
    check: boolean;
}

export interface ReplayFile {
    path: string;
    sha256: string;
    size: number;
}

interface ValidationReportItem {
    inputPath?: string;
    fileName?: string;
    sha256?: string;
    skipped?: boolean;
    validation?: {
        success?: boolean;
    };
}

interface ValidationReport {
    options?: {
        forceExecuteReplayActions?: boolean;
    };
    totals?: {
        parsed?: number;
        passed?: number;
        failed?: number;
        duplicates?: number;
        parseErrors?: number;
    };
    items?: ValidationReportItem[];
}

function parseArgs(argv: readonly string[]): CliOptions {
    const options: CliOptions = {
        rootDir: path.resolve('captures'),
        outPath: null,
        targetUnique: 120,
        requireForce: false,
        check: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--root') {
            options.rootDir = path.resolve(argv[++index]);
        } else if (arg === '--out') {
            options.outPath = path.resolve(argv[++index]);
        } else if (arg === '--target') {
            options.targetUnique = Number(argv[++index]);
        } else if (arg === '--require-force') {
            options.requireForce = true;
        } else if (arg === '--check') {
            options.check = true;
        } else if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    if (!Number.isInteger(options.targetUnique) || options.targetUnique <= 0) {
        throw new Error('--target 必须是正整数');
    }

    return options;
}

function printHelp() {
    console.log(`用法:
  node --import tsx tools/apk_replay_coverage_report.ts --root captures --out captures/mitm_replay/coverage.md

选项:
  --root <dir>     扫描目录，默认 captures
  --out <file>     写出 Markdown 报告；不传则输出到 stdout
  --target <n>     目标唯一回放数量，默认 120
  --require-force  仅统计开启 APK 强制执行的全通过报告
  --check          唯一回放数不足目标或存在未覆盖唯一回放时，以非 0 退出
`);
}

async function walkFiles(root: string): Promise<string[]> {
    const result: string[] = [];

    async function visit(current: string) {
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                await visit(fullPath);
            } else if (entry.isFile()) {
                result.push(fullPath);
            }
        }
    }

    await visit(root);
    return result.sort((left, right) => left.localeCompare(right));
}

async function collectReplayFiles(rootDir: string): Promise<ReplayFile[]> {
    const files = (await walkFiles(rootDir))
        .filter(file => /^game_get_.*\.bin$/i.test(path.basename(file)));
    const result: ReplayFile[] = [];
    for (const file of files) {
        const data = await readFile(file);
        result.push({
            path: file,
            sha256: createHash('sha256').update(data).digest('hex'),
            size: data.byteLength
        });
    }
    return result;
}

async function collectValidationReports(rootDir: string): Promise<{
    reportPath: string;
    parsed: number;
    passed: number;
    failed: number;
    parseErrors: number;
    forceExecuteReplayActions: boolean;
    passedSha: string[];
}[]> {
    const files = (await walkFiles(rootDir))
        .filter(file => /\.json$/i.test(path.basename(file)));
    const reports = [];
    for (const file of files) {
        try {
            const report = JSON.parse(await readFile(file, 'utf8')) as ValidationReport;
            if (!Array.isArray(report.items) || !report.totals) {
                continue;
            }
            const totals = report.totals ?? {};
            if (typeof totals.passed !== 'number' || typeof totals.failed !== 'number') {
                continue;
            }
            const passedSha = (report.items ?? [])
                .filter(item => !item.skipped && item.sha256 && item.validation?.success !== false)
                .map(item => item.sha256!.toLowerCase());
            reports.push({
                reportPath: file,
                parsed: totals.parsed ?? 0,
                passed: totals.passed ?? 0,
                failed: totals.failed ?? 0,
                parseErrors: totals.parseErrors ?? 0,
                forceExecuteReplayActions: report.options?.forceExecuteReplayActions === true,
                passedSha
            });
        } catch {
            continue;
        }
    }
    return reports;
}

function groupBySha(files: ReplayFile[]): Map<string, ReplayFile[]> {
    const groups = new Map<string, ReplayFile[]>();
    for (const file of files) {
        const list = groups.get(file.sha256) ?? [];
        list.push(file);
        groups.set(file.sha256, list);
    }
    return groups;
}

function relative(rootDir: string, filePath: string): string {
    return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

export interface CoverageSummary {
    markdown: string;
    uniqueShaCount: number;
    unverifiedUniqueCount: number;
    missingToTarget: number;
    checkPassed: boolean;
}

export function renderMarkdown(options: CliOptions, replayFiles: ReplayFile[], reports: Awaited<ReturnType<typeof collectValidationReports>>): CoverageSummary {
    const groups = groupBySha(replayFiles);
    const uniqueSha = [...groups.keys()].sort();
    const passedSha = new Set<string>();
    const passingReports = reports.filter(report =>
        report.failed === 0
        && report.parseErrors === 0
        && report.passed > 0
        && (!options.requireForce || report.forceExecuteReplayActions)
    );
    for (const report of passingReports) {
        for (const sha of report.passedSha) {
            passedSha.add(sha);
        }
    }
    const verifiedUnique = uniqueSha.filter(sha => passedSha.has(sha));
    const unverifiedUnique = uniqueSha.filter(sha => !passedSha.has(sha));
    const duplicateGroups = [...groups.entries()].filter(([, files]) => files.length > 1);
    const missingToTarget = Math.max(0, options.targetUnique - uniqueSha.length);

    const lines: string[] = [];
    lines.push('# APK 回放覆盖率审计');
    lines.push('');
    lines.push(`- 扫描目录：\`${options.rootDir}\``);
    lines.push(`- 报告过滤：${options.requireForce ? '仅 APK 强制执行报告' : '所有全通过报告'}`);
    lines.push(`- 目标唯一回放数：${options.targetUnique}`);
    lines.push(`- game_get 文件数：${replayFiles.length}`);
    lines.push(`- 唯一 SHA 数：${uniqueSha.length}`);
    lines.push(`- 重复文件数：${replayFiles.length - uniqueSha.length}`);
    lines.push(`- 已由全通过报告覆盖的唯一 SHA：${verifiedUnique.length}`);
    lines.push(`- 未被全通过报告覆盖的唯一 SHA：${unverifiedUnique.length}`);
    lines.push(`- 距目标仍缺唯一回放：${missingToTarget}`);
    lines.push('');
    lines.push('## 全通过报告');
    lines.push('');
    if (passingReports.length === 0) {
        lines.push('- 无');
    } else {
        const sortedReports = [...passingReports].sort((left, right) => left.reportPath.localeCompare(right.reportPath));
        for (const report of sortedReports) {
            lines.push(`- \`${relative(options.rootDir, report.reportPath)}\`：passed=${report.passed}, parsed=${report.parsed}, force=${report.forceExecuteReplayActions ? 'true' : 'false'}`);
        }
    }
    lines.push('');
    lines.push('## 重复 SHA');
    lines.push('');
    if (duplicateGroups.length === 0) {
        lines.push('- 无');
    } else {
        for (const [sha, files] of duplicateGroups) {
            lines.push(`- \`${sha.slice(0, 12)}\` count=${files.length}`);
            for (const file of files) {
                lines.push(`  - \`${relative(options.rootDir, file.path)}\``);
            }
        }
    }
    lines.push('');
    lines.push('## 未覆盖唯一回放');
    lines.push('');
    if (unverifiedUnique.length === 0) {
        lines.push('- 无');
    } else {
        for (const sha of unverifiedUnique) {
            const first = groups.get(sha)![0];
            lines.push(`- \`${sha.slice(0, 12)}\` \`${relative(options.rootDir, first.path)}\``);
        }
    }
    lines.push('');
    return {
        markdown: lines.join('\n'),
        uniqueShaCount: uniqueSha.length,
        unverifiedUniqueCount: unverifiedUnique.length,
        missingToTarget,
        checkPassed: missingToTarget === 0 && unverifiedUnique.length === 0
    };
}

export async function generateCoverageSummary(options: CliOptions): Promise<CoverageSummary> {
    const replayFiles = await collectReplayFiles(options.rootDir);
    const reports = await collectValidationReports(options.rootDir);
    return renderMarkdown(options, replayFiles, reports);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const summary = await generateCoverageSummary(options);
    if (options.outPath) {
        await writeFile(options.outPath, summary.markdown, 'utf8');
        console.log(`已写出覆盖率审计：${options.outPath}`);
    } else {
        console.log(summary.markdown);
    }

    if (options.check && !summary.checkPassed) {
        console.error(`覆盖率未达标：唯一回放=${summary.uniqueShaCount}/${options.targetUnique}，未覆盖=${summary.unverifiedUniqueCount}`);
        process.exitCode = 1;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
