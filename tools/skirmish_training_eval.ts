import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    formatSkirmishRunSummary,
    summarizeSkirmishEpisodes,
    type SkirmishEpisodeRecord
} from './skirmish_training_runner';

interface EvalOptions {
    inputFiles: string[];
    json: boolean;
}

const DIRECT_RUN_PATH = process.argv[1] ? path.resolve(process.argv[1]) : '';
const THIS_FILE_PATH = fileURLToPath(import.meta.url);

function printHelp() {
    console.log(`用法: npm run eval:skirmish:baseline -- --input <file> [选项]

选项:
  --input <file>    runner 输出的 episode JSONL 文件；可重复
  --json            摘要输出 JSON
  --help            显示帮助
`);
}

export function parseEvalArgs(argv: readonly string[]): EvalOptions {
    const options: EvalOptions = {
        inputFiles: [],
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
            options.inputFiles.push(path.resolve(value));
        } else if (arg === '--json') {
            options.json = true;
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    if (options.inputFiles.length === 0) {
        throw new Error('请用 --input 指定至少一个 episode JSONL 文件');
    }

    return options;
}

export function parseEpisodeJsonl(content: string, fileLabel = '<memory>'): SkirmishEpisodeRecord[] {
    return content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map((line, index) => {
            const parsed = JSON.parse(line) as SkirmishEpisodeRecord;
            if (parsed.kind !== 'skirmish_episode') {
                throw new Error(`${fileLabel}:${index + 1} 不是 skirmish_episode 记录`);
            }
            return parsed;
        });
}

async function readEpisodes(inputFiles: readonly string[]): Promise<SkirmishEpisodeRecord[]> {
    const groups = await Promise.all(inputFiles.map(async inputFile => (
        parseEpisodeJsonl(await readFile(inputFile, 'utf8'), inputFile)
    )));
    return groups.flat();
}

async function main() {
    const options = parseEvalArgs(process.argv.slice(2));
    const episodes = await readEpisodes(options.inputFiles);
    const summary = summarizeSkirmishEpisodes(episodes);

    if (options.json) {
        console.log(JSON.stringify({ inputFiles: options.inputFiles, summary }, null, 2));
    } else {
        console.log(formatSkirmishRunSummary(summary, options.inputFiles.join(', ')));
    }
}

if (path.resolve(DIRECT_RUN_PATH) === path.resolve(THIS_FILE_PATH)) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
