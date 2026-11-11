import fs from 'node:fs';
import path from 'node:path';
import { read, fileSha, save } from './io';

export interface RecordedGame { game: any; directory: string; resultSha256: string; runFile: string; runSha256: string; runtimeSha256: string }
export function collectRecordedGames(directories: string[], configSha256: string, panel: any, modelSha256: string): Map<string, RecordedGame> {
    const found = new Map<string, RecordedGame>(), expected = new Map<string, any>(panel.matches.map((m: any) => [m.id, m]));
    for (const directory of directories) {
        if (!fs.existsSync(directory)) continue;
        const runFile = path.join(directory, 'RUN.json'), run = read(runFile);
        if (run.configSha256 !== configSha256 || run.model.binSha256 !== modelSha256 || run.split !== 'dev') throw Error('接续来源的配置、模型或分区不符：' + directory);
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory()) {
            const folder = path.join(directory, entry.name), resultFile = path.join(folder, 'result.json');
            if (!fs.existsSync(resultFile)) {
                if (expected.has(entry.name)) throw Error('已启动但未发布结果的局不能擅自重跑：' + folder);
                continue;
            }
            const game = read(resultFile), match = expected.get(game.id), slot = panel.slots[game.slot];
            if (!match || game.id !== entry.name || game.seed !== match.seed || game.seat !== match.seat || game.opponent !== match.opponent || game.slot !== match.slot || game.initialSha256 !== slot.sha256) throw Error('已保存结果的冻结配对身份不符：' + resultFile);
            if (found.has(game.id)) throw Error('同配置同局出现重复结果，禁止择优替换：' + game.id);
            found.set(game.id, { game, directory: folder, resultSha256: fileSha(resultFile), runFile, runSha256: fileSha(runFile), runtimeSha256: run.runtimeSha256 ?? 'pre-repair-v2' });
        }
    }
    return found;
}

/** 自然、截断、失败都占用原局号；只调度完全没有记录的冻结局。 */
export function remainingMatches(matches: any[], recorded: Map<string, RecordedGame>) {
    if (new Set(matches.map(m => m.id)).size !== matches.length) throw Error('待评列表包含重复局号');
    return matches.filter(m => !recorded.has(m.id));
}

export function preservationFiles(recorded: Map<string, RecordedGame>) {
    const files: Record<string, string> = {};
    for (const row of recorded.values()) {
        files[row.runFile] = row.runSha256;
        for (const entry of fs.readdirSync(row.directory, { withFileTypes: true })) if (entry.isFile()) {
            const file = path.join(row.directory, entry.name); files[file] = fileSha(file);
        }
    }
    return files;
}
export function verifyPreservation(files: Record<string, string>) {
    for (const [file, digest] of Object.entries(files)) if (fileSha(file) !== digest) throw Error('已有对局或失败证据发生变化：' + file);
}

export async function publishAggregate(output: string, matches: any[], recorded: Map<string, RecordedGame>, metadata: object) {
    const games = matches.map(match => {
        const row = recorded.get(match.id); if (!row) throw Error('尚有未评局，不能发布完整汇总：' + match.id);
        if (fileSha(path.join(row.directory, 'result.json')) !== row.resultSha256 || fileSha(row.runFile) !== row.runSha256) throw Error('汇总时来源摘要变化');
        return { ...row.game, artifactDirectory: row.directory, sourceResultSha256: row.resultSha256, sourceRunSha256: row.runSha256, sourceRuntimeSha256: row.runtimeSha256 };
    });
    await save(path.join(output, 'SUMMARY.json'), { ...metadata, attempted: games.length, total: matches.length, complete: true, allNatural: games.every(g => g.natural), games,
        composite: true, noRecordedMatchesRerun: true, runtimeVersions: [...new Set(games.map(g => g.sourceRuntimeSha256))], finished: new Date().toISOString() }, true);
    return { ...metadata, games };
}
