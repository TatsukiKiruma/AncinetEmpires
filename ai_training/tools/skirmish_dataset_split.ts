import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import type { SkirmishDatasetSample } from './skirmish_dataset_export';

export interface SkirmishDatasetSplitOptions {
    inputFile: string;
    trainOutFile: string;
    valOutFile: string;
    valRatio: number;
    seed: number;
    json: boolean;
}

export interface SkirmishDatasetSplitSummary {
    inputFile: string;
    trainOutFile: string;
    valOutFile: string;
    valRatio: number;
    seed: number;
    inputSamples: number;
    trainSamples: number;
    valSamples: number;
    trainEpisodes: number;
    valEpisodes: number;
    byScenario: Record<string, {
        trainSamples: number;
        valSamples: number;
        trainEpisodes: number;
        valEpisodes: number;
    }>;
}

const DIRECT_RUN_PATH = process.argv[1] ? path.resolve(process.argv[1]) : '';
const THIS_FILE_PATH = fileURLToPath(import.meta.url);

function defaultSplitPath(inputFile: string, suffix: 'train' | 'val'): string {
    const parsed = path.parse(inputFile);
    return path.join(parsed.dir, `${parsed.name}-${suffix}${parsed.ext || '.jsonl'}`);
}

function printHelp() {
    console.log(`用法: npm run split:skirmish:dataset -- --input <file> [选项]

选项:
  --input <file>      dataset JSONL 输入文件
  --train-out <file>  训练集输出文件，默认在输入文件名后加 -train
  --val-out <file>    验证集输出文件，默认在输入文件名后加 -val
  --val-ratio <n>     验证集比例，默认 0.2
  --seed <n>          切分种子，默认 1
  --json              摘要输出 JSON
  --help              显示帮助
`);
}

function parseInteger(value: string | undefined, label: string): number {
    if (!value) throw new Error(`${label} 缺少数值参数`);
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) throw new Error(`${label} 必须是整数`);
    return parsed;
}

function parseRatio(value: string | undefined): number {
    if (!value) throw new Error('--val-ratio 缺少数值参数');
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        throw new Error('--val-ratio 必须在 0 到 1 之间');
    }
    return parsed;
}

export function parseDatasetSplitArgs(argv: readonly string[]): SkirmishDatasetSplitOptions {
    let inputFile = '';
    let trainOutFile = '';
    let valOutFile = '';
    const options = {
        valRatio: 0.2,
        seed: 1,
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
            inputFile = path.resolve(value);
        } else if (arg === '--train-out') {
            const value = argv[++i];
            if (!value) throw new Error('--train-out 缺少文件参数');
            trainOutFile = path.resolve(value);
        } else if (arg === '--val-out') {
            const value = argv[++i];
            if (!value) throw new Error('--val-out 缺少文件参数');
            valOutFile = path.resolve(value);
        } else if (arg === '--val-ratio') {
            options.valRatio = parseRatio(argv[++i]);
        } else if (arg === '--seed') {
            options.seed = parseInteger(argv[++i], '--seed');
        } else if (arg === '--json') {
            options.json = true;
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    if (!inputFile) throw new Error('请用 --input 指定 dataset JSONL 文件');

    return {
        inputFile,
        trainOutFile: trainOutFile || defaultSplitPath(inputFile, 'train'),
        valOutFile: valOutFile || defaultSplitPath(inputFile, 'val'),
        valRatio: options.valRatio,
        seed: options.seed,
        json: options.json
    };
}

function hashRatio(key: string): number {
    const hash = createHash('sha256').update(key).digest();
    return hash.readUInt32BE(0) / 0x100000000;
}

function getEpisodeKey(sample: SkirmishDatasetSample): string {
    return `${sample.scenario.id}|${sample.seed}`;
}

function unescapeJsonString(value: string): string {
    return JSON.parse(`"${value}"`) as string;
}

function getRouteInfo(line: string): { scenarioId: string; seed: number } {
    const scenarioMatch = line.match(/"scenario":\{"id":"((?:\\.|[^"\\])*)"/);
    const seedMatch = line.match(/"seed":(-?\d+)/);
    if (scenarioMatch && seedMatch) {
        return {
            scenarioId: unescapeJsonString(scenarioMatch[1]),
            seed: Number(seedMatch[1])
        };
    }

    const sample = JSON.parse(line) as SkirmishDatasetSample;
    return {
        scenarioId: sample.scenario.id,
        seed: sample.seed
    };
}

function ensureScenario(summary: SkirmishDatasetSplitSummary, scenarioId: string) {
    summary.byScenario[scenarioId] ??= {
        trainSamples: 0,
        valSamples: 0,
        trainEpisodes: 0,
        valEpisodes: 0
    };
    return summary.byScenario[scenarioId];
}

async function writeLine(stream: NodeJS.WritableStream, line: string) {
    if (!stream.write(line)) {
        await once(stream, 'drain');
    }
}

export async function splitSkirmishDataset(options: SkirmishDatasetSplitOptions): Promise<SkirmishDatasetSplitSummary> {
    await mkdir(path.dirname(options.trainOutFile), { recursive: true });
    await mkdir(path.dirname(options.valOutFile), { recursive: true });

    const train = createWriteStream(options.trainOutFile, { encoding: 'utf8' });
    const val = createWriteStream(options.valOutFile, { encoding: 'utf8' });
    const trainEpisodeKeys = new Set<string>();
    const valEpisodeKeys = new Set<string>();
    const trainScenarioEpisodeKeys = new Map<string, Set<string>>();
    const valScenarioEpisodeKeys = new Map<string, Set<string>>();
    const routeByEpisode = new Map<string, 'train' | 'val'>();
    const summary: SkirmishDatasetSplitSummary = {
        inputFile: options.inputFile,
        trainOutFile: options.trainOutFile,
        valOutFile: options.valOutFile,
        valRatio: options.valRatio,
        seed: options.seed,
        inputSamples: 0,
        trainSamples: 0,
        valSamples: 0,
        trainEpisodes: 0,
        valEpisodes: 0,
        byScenario: {}
    };

    try {
        const lines = createInterface({
            input: createReadStream(options.inputFile, { encoding: 'utf8' }),
            crlfDelay: Infinity
        });

        for await (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const routeInfo = getRouteInfo(trimmed);
            const episodeKey = `${routeInfo.scenarioId}|${routeInfo.seed}`;
            const route = routeByEpisode.get(episodeKey) ?? (
                hashRatio(`${options.seed}:${episodeKey}`) < options.valRatio ? 'val' : 'train'
            );
            routeByEpisode.set(episodeKey, route);
            summary.inputSamples += 1;

            const scenario = ensureScenario(summary, routeInfo.scenarioId);
            if (route === 'val') {
                await writeLine(val, `${trimmed}\n`);
                summary.valSamples += 1;
                scenario.valSamples += 1;
                valEpisodeKeys.add(episodeKey);
                valScenarioEpisodeKeys.set(
                    routeInfo.scenarioId,
                    (valScenarioEpisodeKeys.get(routeInfo.scenarioId) ?? new Set<string>()).add(episodeKey)
                );
            } else {
                await writeLine(train, `${trimmed}\n`);
                summary.trainSamples += 1;
                scenario.trainSamples += 1;
                trainEpisodeKeys.add(episodeKey);
                trainScenarioEpisodeKeys.set(
                    routeInfo.scenarioId,
                    (trainScenarioEpisodeKeys.get(routeInfo.scenarioId) ?? new Set<string>()).add(episodeKey)
                );
            }
        }
    } finally {
        train.end();
        val.end();
        await Promise.all([
            once(train, 'finish'),
            once(val, 'finish')
        ]);
    }

    summary.trainEpisodes = trainEpisodeKeys.size;
    summary.valEpisodes = valEpisodeKeys.size;
    for (const [scenarioId, scenario] of Object.entries(summary.byScenario)) {
        scenario.trainEpisodes = trainScenarioEpisodeKeys.get(scenarioId)?.size ?? 0;
        scenario.valEpisodes = valScenarioEpisodeKeys.get(scenarioId)?.size ?? 0;
    }

    return summary;
}

export function formatSkirmishDatasetSplitSummary(summary: SkirmishDatasetSplitSummary): string {
    const lines = [
        '# Skirmish dataset 切分摘要',
        '',
        `- 输入文件：\`${summary.inputFile}\``,
        `- 训练集：\`${summary.trainOutFile}\``,
        `- 验证集：\`${summary.valOutFile}\``,
        `- 验证比例：${summary.valRatio}`,
        `- 输入样本：${summary.inputSamples}`,
        `- 训练样本：${summary.trainSamples}`,
        `- 验证样本：${summary.valSamples}`,
        `- 训练 episode：${summary.trainEpisodes}`,
        `- 验证 episode：${summary.valEpisodes}`,
        '',
        '| 场景 | 训练样本 | 验证样本 | 训练局 | 验证局 |',
        '| --- | ---: | ---: | ---: | ---: |'
    ];

    for (const [scenarioId, item] of Object.entries(summary.byScenario).sort(([left], [right]) => left.localeCompare(right))) {
        lines.push(`| \`${scenarioId}\` | ${item.trainSamples} | ${item.valSamples} | ${item.trainEpisodes} | ${item.valEpisodes} |`);
    }

    return `${lines.join('\n')}\n`;
}

async function main() {
    const options = parseDatasetSplitArgs(process.argv.slice(2));
    const summary = await splitSkirmishDataset(options);

    if (options.json) {
        console.log(JSON.stringify({ summary }, null, 2));
    } else {
        console.log(formatSkirmishDatasetSplitSummary(summary));
    }
}

if (path.resolve(DIRECT_RUN_PATH) === path.resolve(THIS_FILE_PATH)) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
