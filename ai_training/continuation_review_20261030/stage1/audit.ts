/** 静态原件及独立前态标签准入；分片进程互不改写文件。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../../src/game/engine';
import { getSkirmishApkTerrainMappingInfo } from '../../../src/game/apk_terrain';
import { nativeTokens, projectTokens } from '../../hard_gap_pc64_to3000_20261030_v1/audit';
import { HERE, INDEX, OLD_SPLIT, read, save, sha, stable, verifyFiles, initialState, semantic, stateKey, decisions, directory, lines } from './io';

const shard = Number(process.argv[2] ?? 0), shards = Number(process.argv[3] ?? 1), corpus = process.argv[4] ?? 'new';
const old = read(OLD_SPLIT), inputs = corpus === 'new' ? read(INDEX) : [...old.train.map((p: any) => ({ ...p, originalSplit: 'train' })), ...old.dev.map((p: any) => ({ ...p, originalSplit: 'dev' }))];
fs.mkdirSync(path.join(HERE, 'audit'), { recursive: true });
for (let i = shard; i < inputs.length; i += shards) {
    const p = inputs[i], file = path.join(HERE, 'audit', p.parentId + '.json');
    if (fs.existsSync(file)) continue;
    const started = performance.now(), errors: string[] = [], skillCounts: Record<string, number> = {}, phases: Record<string, number> = {}, positions: number[][] = [];
    let count = 0, verified = 0, intraMacroTransitions = 0, previousMacro = -1;
    const prefix: any[] = [], trajectory = crypto.createHash('sha256');
    let initial: any, initialHash: string | null = null, terrain: any, firstStates: string[] = [];
    try {
        verifyFiles(p);
        const state = initialState(p); initial = semantic(state); initialHash = stateKey(state);
        terrain = [...new Set(state.map.tiles.flatMap(row => row.map(t => t.apkTerrainId)))].map(id => getSkirmishApkTerrainMappingInfo(id));
        const result = read(path.join(directory(p), 'result.json'));
        if (!(result.natural ?? result.naturalEnd) || result.truncationReason || result.error || (result.stop && result.stop !== 'natural')) throw Error('缺可靠自然结果');
        if (p.winner !== undefined && p.winner !== (result.winner ?? result.winnerAlliance ?? result.winnerMask)) throw Error('胜者身份不符');
        p.winner = result.winner ?? result.winnerAlliance ?? result.winnerMask;
        const tokens = (list: any[]) => { for (const token of list) { trajectory.update(stable(token) + '\n'); if (prefix.length < 32) prefix.push(token); } };
        if (p.source?.includes('replica')) {
            for await (const r of lines(path.join(directory(p), 'decisions.jsonl.gz'))) { skillCounts[r.action.type] = (skillCounts[r.action.type] ?? 0) + 1; tokens(projectTokens(r.before, r.action)); count++; }
        } else {
            const raw = gunzipSync(fs.readFileSync(path.join(directory(p), 'actions.jsonl.gz'))).toString().trim().split(/\r?\n/).map(s => JSON.parse(s));
            for (const r of raw) { skillCounts[r.fields.j] = (skillCounts[r.fields.j] ?? 0) + 1; tokens(nativeTokens(r.fields)); count++; }
        }
        if (count !== p.actions) throw Error('原始记录计数不符');
        // 旧分区冻结不变；仅读取32个原始宏用于前缀关联，不重走旧全量训练。
        const chosen = corpus === 'old' ? new Set(Array.from({ length: Math.min(32, p.actions) }, (_, n) => n)) : undefined;
        for await (const r of decisions(p, chosen)) {
            const engine = new GameEngine(r.state, { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true });
            if (!engine.hasLegalAction(r.state.currentPlayer, r.action)) throw Error(`当前合法动作拒绝 ${r.macro}/${r.sub}/${r.action.type}`);
            if (r.state.winner !== null || r.action.type === 'surrender') throw Error('终局后动作或投降标签');
            if (r.macro === previousMacro) intraMacroTransitions++; previousMacro = r.macro;
            phases[r.phase] = (phases[r.phase] ?? 0) + 1;
            positions.push([r.macro, r.sub, r.phase === 'opening' ? 0 : r.phase === 'middle' ? 1 : 2]); verified++;
            if (firstStates.length < 16 && r.sub === 0) firstStates.push(stateKey(r.state));
        }
    } catch (e) { errors.push(String(e)); }
    const near = initial ? { ...initial, turn: Math.round(initial.turn / 5), units: initial.units.map((u: any) => ({ ...u, hp: Math.round(u.hp / 10) * 10, exp: Math.round(u.exp / 25) * 25 })) } : null;
    const receipt = { parentId: p.parentId, corpus, originalSplit: p.originalSplit, source: p.source ?? 'apk-hard-original-phone', directory: directory(p), map: p.map, players: p.players ?? 2, category: p.category ?? 'old_normal', profile: p.profile ?? 'official', seed: p.seed, winner: p.winner, rawActions: count, initialHash, initial, nearKey: near ? sha(stable(near)) : null, sourceInitialSemantic: p.initialSemanticSha256, sourceSemanticTrajectory: p.semanticTrajectorySha256, trajectoryTokensHash: trajectory.digest('hex'), prefix8: prefix.length >= 8 ? sha(stable(prefix.slice(0, 8))) : null, prefix16: prefix.length >= 16 ? sha(stable(prefix.slice(0, 16))) : null, firstStates, skillCounts, phases, positions, verifiedAtomicPositions: verified, admitted: !errors.length, errors, terrain, intraMacroTransitions, historicalWholeGameReplay: false, scope: corpus === 'old' ? '旧原件身份及32宏独立前态关联，原分区不变' : '全记录文件身份与独立前态合法标签；不检验相邻历史转移', seconds: (performance.now() - started) / 1000 };
    save(file, receipt);
    console.log(JSON.stringify({ corpus, i, parentId: p.parentId, admitted: receipt.admitted, verified, seconds: receipt.seconds, errors }));
}
