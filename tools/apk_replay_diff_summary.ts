import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface CliOptions {
    inputs: string[];
    rootDir: string;
    outPath: string | null;
}

interface FailureClassification {
    code: string;
    label: string;
    count: number;
    items?: {
        fileName?: string;
        recordIndex?: number | null;
        eventType?: string | null;
        actionCode?: string | null;
    }[];
}

interface ValidationReportItem {
    fileName?: string;
    skipped?: boolean;
    error?: string | null;
    validation?: {
        success?: boolean | null;
        firstErrorRecordIndex?: number | null;
        firstErrorRecordEvent?: string | null;
        actionCode?: string | null;
        failureClassification?: {
            code?: string;
            label?: string;
            detail?: string;
        } | null;
    };
}

interface ValidationReport {
    options?: {
        forceExecuteReplayActions?: boolean;
        uniqueOffset?: number | null;
        uniqueLimit?: number | null;
        offset?: number;
        limit?: number | null;
    };
    totals?: {
        files?: number;
        uniqueFiles?: number;
        parsed?: number;
        passed?: number;
        failed?: number;
        duplicates?: number;
        parseErrors?: number;
    };
    failureClassifications?: FailureClassification[];
    items?: ValidationReportItem[];
}

interface LoadedReport {
    path: string;
    report: ValidationReport;
}

interface ClassificationSummary {
    code: string;
    label: string;
    count: number;
    examples: {
        reportPath: string;
        fileName: string;
        recordIndex: number | null;
        eventType: string | null;
        actionCode: string | null;
    }[];
}

function parseArgs(argv: readonly string[]): CliOptions {
    const options: CliOptions = {
        inputs: [],
        rootDir: path.resolve('captures'),
        outPath: null
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--root') {
            options.rootDir = path.resolve(argv[++index]);
        } else if (arg === '--out') {
            options.outPath = path.resolve(argv[++index]);
        } else if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        } else if (arg.startsWith('-')) {
            throw new Error(`未知参数: ${arg}`);
        } else {
            options.inputs.push(path.resolve(arg));
        }
    }

    return options;
}

function printHelp() {
    console.log(`用法:
  npm run apk:replay-diff-summary -- <report.json> [more.json] --out captures/mitm_replay/diff_summary.md
  npm run apk:replay-diff-summary -- --root captures --out captures/mitm_replay/diff_summary.md

说明:
  不传 report.json 时，会递归扫描 --root 下的校验 JSON。
  工具只汇总既有报告，不重新执行回放。`);
}

async function walkFiles(root: string): Promise<string[]> {
    const files: string[] = [];
    async function visit(current: string) {
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                await visit(fullPath);
            } else if (entry.isFile()) {
                files.push(fullPath);
            }
        }
    }
    await visit(root);
    return files.sort((left, right) => left.localeCompare(right));
}

async function resolveInputs(options: CliOptions): Promise<string[]> {
    if (options.inputs.length > 0) return options.inputs;
    return (await walkFiles(options.rootDir))
        .filter(file => /\.json$/i.test(file))
        .filter(file => path.basename(file).includes('validation_report') || path.basename(file).startsWith('strict_unique_'));
}

async function loadReports(paths: readonly string[]): Promise<LoadedReport[]> {
    const reports: LoadedReport[] = [];
    for (const reportPath of paths) {
        try {
            const parsed = JSON.parse(await readFile(reportPath, 'utf8')) as ValidationReport;
            if (!parsed.totals || !Array.isArray(parsed.items)) continue;
            reports.push({ path: reportPath, report: parsed });
        } catch {
            continue;
        }
    }
    return reports;
}

function relative(filePath: string): string {
    return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

function addClassification(
    grouped: Map<string, ClassificationSummary>,
    reportPath: string,
    code: string,
    label: string,
    count: number,
    examples: ClassificationSummary['examples']
) {
    const current = grouped.get(code) ?? {
        code,
        label,
        count: 0,
        examples: []
    };
    current.count += count;
    current.examples.push(...examples.map(example => ({ ...example, reportPath })));
    grouped.set(code, current);
}

function summarizeClassifications(reports: readonly LoadedReport[]): ClassificationSummary[] {
    const grouped = new Map<string, ClassificationSummary>();
    for (const loaded of reports) {
        const classifications = loaded.report.failureClassifications ?? [];
        if (classifications.length > 0) {
            for (const classification of classifications) {
                addClassification(
                    grouped,
                    loaded.path,
                    classification.code,
                    classification.label,
                    classification.count,
                    (classification.items ?? []).map(item => ({
                        reportPath: loaded.path,
                        fileName: item.fileName ?? '-',
                        recordIndex: item.recordIndex ?? null,
                        eventType: item.eventType ?? null,
                        actionCode: item.actionCode ?? null
                    }))
                );
            }
            continue;
        }

        for (const item of loaded.report.items ?? []) {
            const classification = item.validation?.failureClassification;
            if (!classification?.code) continue;
            addClassification(
                grouped,
                loaded.path,
                classification.code,
                classification.label ?? classification.code,
                1,
                [{
                    reportPath: loaded.path,
                    fileName: item.fileName ?? '-',
                    recordIndex: item.validation?.firstErrorRecordIndex ?? null,
                    eventType: item.validation?.firstErrorRecordEvent ?? null,
                    actionCode: item.validation?.actionCode ?? null
                }]
            );
        }
    }

    return [...grouped.values()]
        .map(summary => ({
            ...summary,
            examples: summary.examples.slice(0, 8)
        }))
        .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));
}

function renderMarkdown(reports: readonly LoadedReport[], classifications: readonly ClassificationSummary[]): string {
    const totals = reports.reduce((acc, loaded) => {
        const reportTotals = loaded.report.totals ?? {};
        acc.parsed += reportTotals.parsed ?? 0;
        acc.passed += reportTotals.passed ?? 0;
        acc.failed += reportTotals.failed ?? 0;
        acc.parseErrors += reportTotals.parseErrors ?? 0;
        acc.duplicates += reportTotals.duplicates ?? 0;
        return acc;
    }, { parsed: 0, passed: 0, failed: 0, parseErrors: 0, duplicates: 0 });

    const lines: string[] = [];
    lines.push('# APK 回放差异分类汇总');
    lines.push('');
    lines.push(`- 报告数：${reports.length}`);
    lines.push(`- parsed：${totals.parsed}`);
    lines.push(`- passed：${totals.passed}`);
    lines.push(`- failed：${totals.failed}`);
    lines.push(`- parseErrors：${totals.parseErrors}`);
    lines.push(`- duplicates：${totals.duplicates}`);
    lines.push('');
    lines.push('## 分类');
    lines.push('');
    if (classifications.length === 0) {
        lines.push('- 无失败分类。');
    } else {
        lines.push('| 分类 | 数量 | 示例 |');
        lines.push('| --- | ---: | --- |');
        for (const classification of classifications) {
            const examples = classification.examples
                .map(example => `${example.fileName}#${example.recordIndex ?? '-'} ${example.eventType ?? '-'} ${example.actionCode ?? '-'} (${relative(example.reportPath)})`)
                .join('<br>');
            lines.push(`| ${classification.label} (\`${classification.code}\`) | ${classification.count} | ${examples || '-'} |`);
        }
    }

    lines.push('');
    lines.push('## 报告');
    lines.push('');
    lines.push('| 报告 | force | uniqueOffset | uniqueLimit | parsed | passed | failed | parseErrors |');
    lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const loaded of reports) {
        const options = loaded.report.options ?? {};
        const reportTotals = loaded.report.totals ?? {};
        lines.push([
            relative(loaded.path),
            options.forceExecuteReplayActions ? 'true' : 'false',
            options.uniqueOffset ?? '-',
            options.uniqueLimit ?? '-',
            reportTotals.parsed ?? 0,
            reportTotals.passed ?? 0,
            reportTotals.failed ?? 0,
            reportTotals.parseErrors ?? 0
        ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }

    return `${lines.join('\n')}\n`;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const inputs = await resolveInputs(options);
    const reports = await loadReports(inputs);
    const classifications = summarizeClassifications(reports);
    const markdown = renderMarkdown(reports, classifications);
    const json = JSON.stringify({ reports: reports.map(report => report.path), classifications }, null, 2);

    if (options.outPath) {
        await writeFile(options.outPath, markdown, 'utf8');
        await writeFile(options.outPath.replace(/\.md$/i, '.json'), json, 'utf8');
        console.log(`已保存差异分类汇总：${options.outPath}`);
        console.log(`已保存差异分类 JSON：${options.outPath.replace(/\.md$/i, '.json')}`);
    } else {
        console.log(markdown);
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
