import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import type { SkirmishDatasetSample } from './skirmish_dataset_export';
import {
    buildCandidateFeatures,
    selectCandidateCodes,
    sparseFeaturesToEntries,
    type SkirmishFeatureExtractor,
    type SkirmishFeatureCandidate,
    type SkirmishFeatureSample
} from './skirmish_bc_train';

export interface SkirmishFeatureExportOptions {
    inputFile: string;
    outFile: string;
    featureDim: number;
    featureExtractor: SkirmishFeatureExtractor;
    maxCandidates: number | null;
    limitSamples: number | null;
    json: boolean;
}

export interface SkirmishFeatureExportSummary {
    inputFile: string;
    outFile: string;
    featureDim: number;
    featureExtractor: SkirmishFeatureExtractor;
    maxCandidates: number | null;
    inputSamples: number;
    exportedSamples: number;
    skippedSamples: number;
    averageCandidates: number;
    averageFeaturesPerCandidate: number;
    byScenario: Record<string, {
        samples: number;
        candidates: number;
    }>;
}

const DEFAULT_FEATURE_DIR = path.resolve(process.cwd(), 'training_runs', 'features');
const DEFAULT_FEATURE_EXTRACTOR: SkirmishFeatureExtractor = 'hashed-action-v2';
const DIRECT_RUN_PATH = process.argv[1] ? path.resolve(process.argv[1]) : '';
const THIS_FILE_PATH = fileURLToPath(import.meta.url);

function nowFileStamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function defaultOutFile(): string {
    return path.join(DEFAULT_FEATURE_DIR, `skirmish-features-${nowFileStamp()}.jsonl`);
}

function printHelp() {
    console.log(`用法: npm run export:skirmish:features -- --input <file> [选项]

选项:
  --input <file>          dataset JSONL 输入文件
  --out <file>            compact feature JSONL 输出文件，默认 training_runs/features/skirmish-features-时间戳.jsonl
  --feature-dim <n>       哈希特征维度，默认 16384；训练时必须使用同一值
  --feature-extractor <name> 特征版本，默认 hashed-action-v2；可选 hashed-action-v1、hashed-action-v2、hashed-action-v3、hashed-action-v4、hashed-action-v5
  --max-candidates <n>    每步最多导出多少个候选动作，默认全量；会强制保留标签动作
  --limit-samples <n>     最多导出多少条样本，用于 smoke test
  --json                  摘要输出 JSON
  --help                  显示帮助
`);
}

function parseInteger(value: string | undefined, label: string): number {
    if (!value) throw new Error(`${label} 缺少数值参数`);
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) throw new Error(`${label} 必须是整数`);
    return parsed;
}

function parsePositiveInteger(value: string | undefined, label: string): number {
    const parsed = parseInteger(value, label);
    if (parsed <= 0) throw new Error(`${label} 必须是正整数`);
    return parsed;
}

export function parseFeatureExportArgs(argv: readonly string[]): SkirmishFeatureExportOptions {
    const options: SkirmishFeatureExportOptions = {
        inputFile: '',
        outFile: defaultOutFile(),
        featureDim: 16384,
        featureExtractor: DEFAULT_FEATURE_EXTRACTOR,
        maxCandidates: null,
        limitSamples: null,
        json: false
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--help') {
            printHelp();
            process.exit(0);
        } else if (arg === '--input') {
            const value = argv[++i];
            if (!value) throw new Error('--input 缺少文件参数');
            options.inputFile = path.resolve(value);
        } else if (arg === '--out') {
            const value = argv[++i];
            if (!value) throw new Error('--out 缺少文件参数');
            options.outFile = path.resolve(value);
        } else if (arg === '--feature-dim') {
            options.featureDim = parsePositiveInteger(argv[++i], '--feature-dim');
        } else if (arg === '--feature-extractor') {
            options.featureExtractor = parseFeatureExtractor(argv[++i]);
        } else if (arg === '--max-candidates') {
            options.maxCandidates = parsePositiveInteger(argv[++i], '--max-candidates');
        } else if (arg === '--limit-samples') {
            options.limitSamples = parsePositiveInteger(argv[++i], '--limit-samples');
        } else if (arg === '--json') {
            options.json = true;
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    if (!options.inputFile) throw new Error('请用 --input 指定 dataset JSONL 文件');
    return options;
}

function parseFeatureExtractor(value: string | undefined): SkirmishFeatureExtractor {
    if (value === 'hashed-action-v1' || value === 'hashed-action-v2' || value === 'hashed-action-v3' || value === 'hashed-action-v4' || value === 'hashed-action-v5') return value;
    throw new Error('--feature-extractor 只能是 hashed-action-v1、hashed-action-v2、hashed-action-v3、hashed-action-v4 或 hashed-action-v5');
}

function ensureScenario(summary: SkirmishFeatureExportSummary, scenarioId: string) {
    summary.byScenario[scenarioId] ??= { samples: 0, candidates: 0 };
    return summary.byScenario[scenarioId];
}

async function writeLine(stream: NodeJS.WritableStream, line: string) {
    if (!stream.write(line)) {
        await once(stream, 'drain');
    }
}

export function convertDatasetSampleToFeatureSample(
    sample: SkirmishDatasetSample,
    options: Pick<SkirmishFeatureExportOptions, 'featureDim' | 'featureExtractor' | 'maxCandidates'>
): SkirmishFeatureSample | null {
    const candidates: SkirmishFeatureCandidate[] = [];
    for (const actionCode of selectCandidateCodes(sample, options.maxCandidates)) {
        const features = buildCandidateFeatures(sample, actionCode, options.featureDim, options.featureExtractor);
        if (!features) continue;
        candidates.push({
            actionCode,
            features: sparseFeaturesToEntries(features)
        });
    }

    if (!candidates.some(candidate => candidate.actionCode === sample.label.actionCode)) {
        return null;
    }

    return {
        kind: 'skirmish_feature_sample',
        version: 1,
        featureExtractor: options.featureExtractor,
        featureDim: options.featureDim,
        source: sample.source,
        scenario: sample.scenario,
        seed: sample.seed,
        step: sample.step,
        turn: sample.turn,
        playerId: sample.playerId,
        policy: sample.policy,
        label: {
            fixedActionIndex: sample.label.fixedActionIndex,
            actionCode: sample.label.actionCode
        },
        candidates
    };
}

export async function exportSkirmishFeatures(options: SkirmishFeatureExportOptions): Promise<SkirmishFeatureExportSummary> {
    await mkdir(path.dirname(options.outFile), { recursive: true });
    const output = createWriteStream(options.outFile, { encoding: 'utf8' });
    const summary: SkirmishFeatureExportSummary = {
        inputFile: options.inputFile,
        outFile: options.outFile,
        featureDim: options.featureDim,
        featureExtractor: options.featureExtractor,
        maxCandidates: options.maxCandidates,
        inputSamples: 0,
        exportedSamples: 0,
        skippedSamples: 0,
        averageCandidates: 0,
        averageFeaturesPerCandidate: 0,
        byScenario: {}
    };
    let totalCandidates = 0;
    let totalFeatureEntries = 0;

    try {
        const lines = createInterface({
            input: createReadStream(options.inputFile, { encoding: 'utf8' }),
            crlfDelay: Infinity
        });

        for await (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (options.limitSamples !== null && summary.exportedSamples >= options.limitSamples) break;

            summary.inputSamples += 1;
            const sample = JSON.parse(trimmed) as SkirmishDatasetSample;
            if (sample.kind !== 'skirmish_dataset_sample') {
                summary.skippedSamples += 1;
                continue;
            }

            const featureSample = convertDatasetSampleToFeatureSample(sample, options);
            if (!featureSample) {
                summary.skippedSamples += 1;
                continue;
            }

            await writeLine(output, `${JSON.stringify(featureSample)}\n`);
            summary.exportedSamples += 1;
            totalCandidates += featureSample.candidates.length;
            totalFeatureEntries += featureSample.candidates.reduce((sum, candidate) => sum + candidate.features.length, 0);
            const scenario = ensureScenario(summary, featureSample.scenario.id);
            scenario.samples += 1;
            scenario.candidates += featureSample.candidates.length;
        }
    } finally {
        output.end();
        await once(output, 'finish');
    }

    summary.averageCandidates = summary.exportedSamples > 0 ? totalCandidates / summary.exportedSamples : 0;
    summary.averageFeaturesPerCandidate = totalCandidates > 0 ? totalFeatureEntries / totalCandidates : 0;
    return summary;
}

export function formatSkirmishFeatureExportSummary(summary: SkirmishFeatureExportSummary): string {
    const lines = [
        '# Skirmish feature 导出摘要',
        '',
        `- 输入文件：\`${summary.inputFile}\``,
        `- 输出文件：\`${summary.outFile}\``,
        `- 特征维度：${summary.featureDim}`,
        `- 特征版本：${summary.featureExtractor}`,
        `- 候选动作上限：${summary.maxCandidates ?? '全量'}`,
        `- 输入样本：${summary.inputSamples}`,
        `- 导出样本：${summary.exportedSamples}`,
        `- 跳过样本：${summary.skippedSamples}`,
        `- 平均候选动作：${summary.averageCandidates.toFixed(2)}`,
        `- 每候选平均特征数：${summary.averageFeaturesPerCandidate.toFixed(2)}`,
        '',
        '| 场景 | 样本 | 候选动作 |',
        '| --- | ---: | ---: |'
    ];

    for (const [scenarioId, item] of Object.entries(summary.byScenario).sort(([left], [right]) => left.localeCompare(right))) {
        lines.push(`| \`${scenarioId}\` | ${item.samples} | ${item.candidates} |`);
    }

    return `${lines.join('\n')}\n`;
}

async function main() {
    const options = parseFeatureExportArgs(process.argv.slice(2));
    const summary = await exportSkirmishFeatures(options);

    if (options.json) {
        console.log(JSON.stringify({ summary }, null, 2));
    } else {
        console.log(formatSkirmishFeatureExportSummary(summary));
    }
}

if (path.resolve(DIRECT_RUN_PATH) === path.resolve(THIS_FILE_PATH)) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
