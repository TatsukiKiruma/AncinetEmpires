import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseApkAemMap, type ApkAemMap } from '../src/game/apk_map';
import {
    APK_REPLAY_EVENT_TYPES,
    parseDecryptedApkReplayActions,
    validateApkReplay,
    type ApkReplayActionRecord,
    type ApkReplayEventType,
    type ApkReplayValidationResult
} from '../src/game/apk_replay';
import { createApkSkirmishGameState } from '../src/game/apk_skirmish';
import type { ApkSkirmishMode } from '../src/game/types';
import { decryptApkResourceBytes } from './apk_resource_crypto';

interface CliOptions {
    actPath: string | null;
    mapPath: string | null;
    mapName: string | undefined;
    mode: ApkSkirmishMode;
    json: boolean;
    check: boolean;
    maxRecords: number | undefined;
    allowAmbiguousRecruit: boolean;
}

interface ReplayReadResult {
    actions: ApkReplayActionRecord[];
    encrypted: boolean;
    remainingBytes: number;
}

interface MapReadResult {
    map: ApkAemMap;
    encrypted: boolean;
}

interface ApkReplayReport {
    actPath: string;
    mapPath: string | null;
    mode: ApkSkirmishMode;
    actEncrypted: boolean;
    mapEncrypted: boolean | null;
    actionCount: number;
    remainingBytes: number;
    eventCounts: Record<ApkReplayEventType, number>;
    validation: ApkReplayValidationResult | null;
}

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        actPath: null,
        mapPath: null,
        mapName: undefined,
        mode: 'SD',
        json: false,
        check: false,
        maxRecords: undefined,
        allowAmbiguousRecruit: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--act') {
            options.actPath = argv[++index];
        } else if (arg === '--map') {
            options.mapPath = argv[++index];
        } else if (arg === '--map-name') {
            options.mapName = argv[++index];
        } else if (arg === '--mode') {
            const mode = argv[++index] as ApkSkirmishMode;
            if (mode !== 'SD' && mode !== 'SO') {
                throw new Error(`未知模式: ${mode}`);
            }
            options.mode = mode;
        } else if (arg === '--json') {
            options.json = true;
        } else if (arg === '--check') {
            options.check = true;
        } else if (arg === '--max-records') {
            const value = Number(argv[++index]);
            if (!Number.isInteger(value) || value <= 0) {
                throw new Error('--max-records 需要正整数');
            }
            options.maxRecords = value;
        } else if (arg === '--allow-ambiguous-recruit') {
            options.allowAmbiguousRecruit = true;
        } else if (arg === '--help' || arg === '-h') {
            printUsage();
            process.exit(0);
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    if (!options.actPath) {
        throw new Error('缺少 --act <file>');
    }

    return options;
}

function printUsage() {
    console.log(`用法:
  npm run apk:replay-report -- --act <file.act> [--map <file.aem>] [--mode SD|SO] [--check]

参数:
  --act <file>                  APK 导出的 .act 回放文件，默认按加密文件读取
  --map <file>                  对应 APK .aem 地图；传入后执行项目引擎校验
  --map-name <name>             官方地图名，用于写入元数据，例如 "(2) Duel.aem"
  --mode SD|SO                  skirmish 规则模式，默认 SD
  --max-records <n>             只校验前 n 条 APK 动作记录
  --allow-ambiguous-recruit     招募部署坐标缺失时选择第一个合法部署动作
  --json                        输出 JSON
  --check                       校验失败时返回非零退出码`);
}

function parseReplayBytes(bytes: Uint8Array): ReplayReadResult {
    try {
        const parsed = parseDecryptedApkReplayActions(bytes);
        return {
            actions: parsed.actions,
            encrypted: false,
            remainingBytes: parsed.remainingBytes
        };
    } catch (rawError) {
        try {
            const decrypted = decryptApkResourceBytes(bytes);
            const parsed = parseDecryptedApkReplayActions(decrypted);
            return {
                actions: parsed.actions,
                encrypted: true,
                remainingBytes: parsed.remainingBytes
            };
        } catch (decryptError) {
            const rawMessage = rawError instanceof Error ? rawError.message : String(rawError);
            const decryptMessage = decryptError instanceof Error ? decryptError.message : String(decryptError);
            throw new Error(`无法解析 APK 回放文件。明文尝试: ${rawMessage}；解密尝试: ${decryptMessage}`);
        }
    }
}

function parseMapBytes(bytes: Uint8Array): MapReadResult {
    try {
        return { map: parseApkAemMap(bytes), encrypted: false };
    } catch (rawError) {
        try {
            return { map: parseApkAemMap(decryptApkResourceBytes(bytes)), encrypted: true };
        } catch (decryptError) {
            const rawMessage = rawError instanceof Error ? rawError.message : String(rawError);
            const decryptMessage = decryptError instanceof Error ? decryptError.message : String(decryptError);
            throw new Error(`无法解析 APK 地图文件。明文尝试: ${rawMessage}；解密尝试: ${decryptMessage}`);
        }
    }
}

function countEvents(actions: readonly ApkReplayActionRecord[]): Record<ApkReplayEventType, number> {
    const counts = Object.fromEntries(
        APK_REPLAY_EVENT_TYPES.map(eventType => [eventType, 0])
    ) as Record<ApkReplayEventType, number>;
    for (const action of actions) {
        counts[action.eventType] += 1;
    }
    return counts;
}

async function buildReport(options: CliOptions): Promise<ApkReplayReport> {
    const actPath = path.resolve(options.actPath!);
    const replay = parseReplayBytes(await readFile(actPath));
    let validation: ApkReplayValidationResult | null = null;
    let mapEncrypted: boolean | null = null;
    let resolvedMapPath: string | null = null;

    if (options.mapPath) {
        resolvedMapPath = path.resolve(options.mapPath);
        const mapRead = parseMapBytes(await readFile(resolvedMapPath));
        mapEncrypted = mapRead.encrypted;
        const initialState = createApkSkirmishGameState(mapRead.map, {
            mode: options.mode,
            mapName: options.mapName
        });
        validation = validateApkReplay(initialState, replay.actions, {
            maxRecords: options.maxRecords,
            expansionOptions: {
                allowAmbiguousRecruitDeployFirstMatch: options.allowAmbiguousRecruit
            }
        });
    }

    return {
        actPath,
        mapPath: resolvedMapPath,
        mode: options.mode,
        actEncrypted: replay.encrypted,
        mapEncrypted,
        actionCount: replay.actions.length,
        remainingBytes: replay.remainingBytes,
        eventCounts: countEvents(replay.actions),
        validation
    };
}

function formatEventCounts(counts: Record<ApkReplayEventType, number>): string {
    return APK_REPLAY_EVENT_TYPES
        .filter(eventType => counts[eventType] > 0)
        .map(eventType => `${eventType}=${counts[eventType]}`)
        .join(', ') || '-';
}

function renderMarkdown(report: ApkReplayReport): string {
    const lines: string[] = [
        '# APK 回放校验报告',
        '',
        `- ACT 文件：\`${report.actPath}\``,
        `- ACT 是否加密：${report.actEncrypted ? '是' : '否'}`,
        `- 动作记录数：${report.actionCount}`,
        `- 剩余未读字节：${report.remainingBytes}`,
        `- 事件分布：${formatEventCounts(report.eventCounts)}`,
        `- 地图文件：${report.mapPath ? `\`${report.mapPath}\`` : '未提供，仅解析回放'}`,
        `- 地图是否加密：${report.mapEncrypted === null ? '-' : report.mapEncrypted ? '是' : '否'}`,
        `- 规则模式：${report.mode}`
    ];

    if (!report.validation) {
        return lines.join('\n');
    }

    const validation = report.validation;
    lines.push(
        '',
        '## 校验结果',
        '',
        `- 结果：${validation.success ? '通过' : '失败'}`,
        `- 已执行 APK 记录数：${validation.executedRecordCount}/${validation.recordCount}`,
        `- 展开项目动作数：${validation.expandedActionCount}`,
        `- 首个错误：${validation.firstError ?? '-'}`,
        `- 最终回合/玩家：第 ${validation.finalState.turn} 回合，P${validation.finalState.currentPlayer}`,
        `- 最终胜者：${validation.finalState.winner ?? '-'}`
    );

    const previewSteps = validation.steps.slice(0, 20);
    if (previewSteps.length > 0) {
        lines.push(
            '',
            '## 前 20 个展开动作',
            '',
            '| 记录 | 子动作 | 事件 | 动作 | 玩家 | 回合 | 结果 |',
            '| ---: | ---: | --- | --- | ---: | ---: | --- |'
        );
        for (const step of previewSteps) {
            lines.push([
                `| ${step.recordIndex}`,
                step.subActionIndex,
                step.eventType,
                `\`${step.actionCode ?? '-'}\``,
                `P${step.currentPlayerBefore}`,
                step.turnBefore,
                (step.error ?? step.info).replace(/\|/g, '/'),
                '|'
            ].join(' | '));
        }
    }

    return lines.join('\n');
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.check && !options.mapPath) {
        throw new Error('--check 需要同时提供 --map 才能执行规则校验');
    }

    const report = await buildReport(options);
    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(renderMarkdown(report));
    }

    if (options.check && report.validation && !report.validation.success) {
        process.exitCode = 1;
    }
}

const isDirectRun = process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}

export {
    buildReport,
    parseArgs,
    parseMapBytes,
    parseReplayBytes,
    renderMarkdown
};
