import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { DIR, read, restore, save } from './common';
import { gzipRows, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { encodeAction } from '../../src/game/env';
import { GameEngine } from '../../src/game/engine';
import { encodeDualObservation } from '../../src/ai_runtime/dual_v2/encoder';
import { packTensorBatch } from '../dual_stream_v2_phase1_20261020/tensor_bridge';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';
import { activeOutcomeTarget } from './value_target';
import { tacticalActionPriors } from '../../src/ai_runtime/dual_v2/tactical_prior';

const generation = Number(process.env.LEAGUE_GENERATION), epoch = Number(process.argv[3] ?? 0), league = read('league-state.json');
const minimumGeneration = Number(process.env.LEAGUE_EXPERT_MIN_GENERATION ?? 2);
const expertGenerations = league.replayBufferManifest.filter((e: any) => e.generation >= minimumGeneration && e.generation <= generation);
const exclusions = new Set(gunzipSync(fs.readFileSync(path.join(DIR, 'evaluation-exclusions.txt.gz'))).toString().trim().split('\n'));
const groups = new Map<string, any[]>(), hash = createHash('sha256');
let emitted = 0, buffered = 0, skippedOrdinary = 0, skippedExcluded = 0;
let rng = (20261021 + epoch * 65537) >>> 0;
const random = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296; };
const targetActions: Record<string, number> = {};
const write = async (bytes: Buffer) => { if (!process.stdout.write(bytes)) await once(process.stdout, 'drain'); };
async function flush(key: string) {
    const pool = groups.get(key)!, entries = [];
    // 跨局轮转后再做有界确定性洗牌，恢复时不依赖进程墙钟。
    while (pool.length && entries.length < 16) entries.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    buffered -= entries.length;
    const { bytes, metadata } = packTensorBatch(entries.map(e => e.observation), entries.map(e => e.label));
    const meta = Buffer.from(JSON.stringify({ ...metadata, sources: entries.map(e => e.source) })), header = Buffer.alloc(8);
    header.writeUInt32LE(meta.length); header.writeUInt32LE(bytes.length, 4); hash.update(meta); hash.update(bytes);
    await write(header); await write(meta); await write(bytes);
}
async function* acrossGames() {
    const slots = expertGenerations.flatMap((entry: any) => read(entry.manifest).slots.map((slot: any) => ({ entry, slot, priority: createHash('sha256').update(`${epoch}:${slot.id}`).digest('hex') }))).sort((a: any, b: any) => a.priority.localeCompare(b.priority));
    const active: any[] = [];
    const add = () => {
        const item = slots.shift(); if (!item) return;
        const prefix = `generations/gen_${String(item.entry.generation).padStart(2, '0')}/games/${item.slot.id}`;
        if (!read(prefix + '/strict-replay.json').passed) throw Error('未经strict不得训练');
        active.push({ result: read(prefix + '/result.json'), initial: read(item.slot.initialPath), iterator: gzipRows(fs.readFileSync(path.join(DIR, prefix, 'samples.jsonl.gz')))[Symbol.asyncIterator]() });
    };
    for (let i = 0; i < 8; i++) add();
    while (active.length) for (const item of [...active]) {
        const next = await item.iterator.next();
        if (next.done) { active.splice(active.indexOf(item), 1); add(); }
        else yield { ...item, row: next.value };
    }
}
for await (const { initial, result, row } of acrossGames()) {
            if (row.correction !== true) { skippedOrdinary++; continue; }
            const state = restore(row.state, initial.map, row.patches, row.mapIndex);
            if (stateHash(state) !== row.beforeHash) throw Error('专家样本原态SHA失配');
            // 旧代经验后来可能被评测消费；滑动窗口也必须按本代完整排重集合重新准入。
            if (exclusions.has(row.beforeHash) || exclusions.has(ruleStateHash(state))) { skippedExcluded++; continue; }
            const engine = new GameEngine(state), legal = engine.getLegalActions(state.currentPlayer), targetSource = legal.findIndex(a => encodeAction(a) === row.targetCode);
            if (targetSource < 0) throw Error('专家样本标签失去合法性');
            const observation = encodeDualObservation(state, legal), target = observation.actions.sourceIndices.indexOf(targetSource);
            if (target < 0) throw Error('专家标签未进入因子动作空间');
            const preferredSource = legal.findIndex(a => encodeAction(a) === row.purePreferredCode);
            const purePreferredIndex = observation.actions.sourceIndices.indexOf(preferredSource);
            if (purePreferredIndex < 0 || purePreferredIndex === target) throw Error('纠错首选缺失或并未实际改写');
            const tactical = tacticalActionPriors(state, legal);
            const prior = Array.from(observation.actions.sourceIndices, i => tactical[i].prior);
            const targetType = legal[targetSource].type;
            const semanticWeight = targetType === 'wait' || targetType === 'end_turn' ? 0 : targetType === 'move' || targetType === 'post_attack_move' ? .5 : 1.5;
            targetActions[targetType] = (targetActions[targetType] ?? 0) + 1;
            const key = `${state.map.width}x${state.map.height}/${Math.ceil(observation.entityIndexMap.entities.length / 16) * 16}`;
            if (!groups.has(key)) groups.set(key, []);
            const outcome = activeOutcomeTarget(state, observation.playerOrder, result.winner);
            groups.get(key)!.push({ observation, label: { target, policyMask: true, valueTarget: outcome.target, valueMask: false, weight: 1 }, source: { id: row.id, parent: row.parentId, quality: 1, configuredPlayers: row.configuredPlayers, correction: true, prior, purePreferredIndex, targetType, semanticWeight, rootValue: row.rootValue, alliances: row.alliances, selfAlliance: row.selfAlliance } });
            emitted++; buffered++;
            if (groups.get(key)!.length >= 64) await flush(key);
            while (buffered >= 128) await flush([...groups].sort((a, b) => b[1].length - a[1].length)[0][0]);
}
for (const [key, entries] of groups) while (entries.length) await flush(key);
save(`generations/gen_${String(generation).padStart(2, '0')}/expert-stream-epoch${epoch}.json`, { emitted, skippedOrdinary, skippedExcluded, targetActions, correctionOnly: true, expertGenerations: expertGenerations.map((e: any) => e.generation), acrossGames: 8, sha256: hash.digest('hex'), denseFeatureFiles: 0 });
