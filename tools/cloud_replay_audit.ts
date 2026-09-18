import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GameEngine } from '../src/game/engine';
import { expandApkReplayRecordToProjectActions, createRecordExpansionOptions } from '../src/game/apk_replay';
import { parseRemoteReplay } from './apk_game_get_validate';

export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v)).digest('hex');
export interface CloudJob { id: string; file: string; sha256: string; output: string; }
export async function auditCloudReplay(job: CloudJob) {
    const raw = await readFile(job.file);
    if (createHash('sha256').update(raw).digest('hex') !== job.sha256) throw new Error('源文件哈希不匹配');
    const parsed = await parseRemoteReplay(job.file, {
        inputs: [], rootDir: '', outPath: null, json: false, mode: 'SD', maxRecords: 100000,
        offset: 0, limit: null, uniqueOffset: null, uniqueLimit: null, dedupe: true,
        allowAmbiguousRecruit: true, strictTerrain: false, forceExecuteReplayActions: false,
    });
    const { metadata: _metadata, ...initial } = parsed.initialState;
    const group = digest({ initial, seed: parsed.config.seed });
    const replayHash = digest(parsed.actions);
    const engine = new GameEngine(parsed.initialState, { disableAutoAdvanceWhenNoMeaningfulAction: true, applyInitialTurnStart: true });
    const count = Math.min(256, parsed.actions.length);
    const chosen = new Set(Array.from({ length: count }, (_, i) => Math.floor((i + 0.5) * parsed.actions.length / count)));
    const snapshots: string[] = [];
    let records = 0, actions = 0, error: string | null = null;
    try {
        for (let i = 0; i < parsed.actions.length; i++) {
            const expanded = expandApkReplayRecordToProjectActions(parsed.actions[i], engine.getState(),
                createRecordExpansionOptions(parsed.actions, i, { allowAmbiguousRecruitDeployFirstMatch: true }));
            for (const action of expanded) {
                // 保存动作执行前的状态；标签使用原始动作，不替换为教师动作。
                if (chosen.has(i) && action.type !== 'surrender') snapshots.push(JSON.stringify({ recordIndex: i, actionIndex: actions, action, state: engine.getState() }));
                const result = engine.step(action);
                if (result.info.includes('非法动作')) throw new Error(result.info);
                actions++;
            }
            records++;
        }
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
    const final = engine.getState();
    const strictPassed = error === null && records === parsed.actions.length && records > 0;
    const humanPlayers = parsed.config.playerTypes.flatMap((type, id) => type === 1 ? [id] : []);
    const humanWinners = humanPlayers.filter(id => (initial.rules?.alliances?.[id] ?? id) === final.winner);
    const terrainUnsupported = (parsed.initialState.metadata?.apkUnmappedTileCount ?? 0) as number;
    const category = !strictPassed || terrainUnsupported > 0 ? 'rejected' : final.winner === null ? 'partial' : humanWinners.length ? 'full' : 'no-human-winner';
    const statesFile = path.join(job.output, 'states', `${job.id}.jsonl`);
    if (strictPassed) await writeFile(statesFile, snapshots.join('\n') + (snapshots.length ? '\n' : ''));
    return { ...job, group, replayHash, recordCount: parsed.actions.length, executedRecords: records, expandedActions: actions,
        strictPassed, category, error, failureRecord: error ? records : null, finalWinner: final.winner, finalTurn: final.turn,
        humanPlayers, humanWinners, playerTypes: parsed.config.playerTypes, terrainUnsupported,
        roomStatus: parsed.config.status, statesFile: strictPassed ? statesFile : null, sampledStates: snapshots.length };
}
export type CloudAudit = Awaited<ReturnType<typeof auditCloudReplay>>;
