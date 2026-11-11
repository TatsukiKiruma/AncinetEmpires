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

const generation = Number(process.env.LEAGUE_GENERATION), epoch = Number(process.argv[3] ?? 0), league = read('league-state.json');
const exclusions = new Set(gunzipSync(fs.readFileSync(path.join(DIR, 'evaluation-exclusions.txt.gz'))).toString().trim().split('\n'));
const groups = new Map<string, any[]>(), hash = createHash('sha256');
let emitted = 0, buffered = 0;
const write = async (bytes: Buffer) => { if (!process.stdout.write(bytes)) await once(process.stdout, 'drain'); };
async function flush(key: string) {
    const entries = groups.get(key)!.splice(0, 16); buffered -= entries.length;
    const { bytes, metadata } = packTensorBatch(entries.map(e => e.observation), entries.map(e => e.label));
    const meta = Buffer.from(JSON.stringify({ ...metadata, sources: entries.map(e => e.source) })), header = Buffer.alloc(8);
    header.writeUInt32LE(meta.length); header.writeUInt32LE(bytes.length, 4); hash.update(meta); hash.update(bytes);
    await write(header); await write(meta); await write(bytes);
}
for (const entry of league.replayBufferManifest.filter((e: any) => e.generation <= generation)) {
    const plan = read(entry.manifest);
    for (const slot of plan.slots) {
        const initial = read(slot.initialPath), prefix = `generations/gen_${String(entry.generation).padStart(2, '0')}/games/${slot.id}`;
        const result = read(prefix + '/result.json');
        if (!read(prefix + '/strict-replay.json').passed) throw Error('未经strict不得训练');
        for await (const row of gzipRows(fs.readFileSync(path.join(DIR, prefix, 'samples.jsonl.gz')))) {
            const state = restore(row.state, initial.map, row.patches, row.mapIndex);
            if (stateHash(state) !== row.beforeHash) throw Error('专家样本原态SHA失配');
            // 旧代经验后来可能被评测消费；滑动窗口也必须按本代完整排重集合重新准入。
            if (exclusions.has(row.beforeHash) || exclusions.has(ruleStateHash(state))) continue;
            const engine = new GameEngine(state), legal = engine.getLegalActions(state.currentPlayer), targetSource = legal.findIndex(a => encodeAction(a) === row.targetCode);
            if (targetSource < 0) throw Error('专家样本标签失去合法性');
            const observation = encodeDualObservation(state, legal), target = observation.actions.sourceIndices.indexOf(targetSource);
            if (target < 0) throw Error('专家标签未进入因子动作空间');
            const key = `${state.map.width}x${state.map.height}/${Math.ceil(observation.entityIndexMap.entities.length / 16) * 16}`;
            if (!groups.has(key)) groups.set(key, []);
            const outcome = activeOutcomeTarget(state, observation.playerOrder, result.winner);
            groups.get(key)!.push({ observation, label: { target, policyMask: true, valueTarget: outcome.target, valueMask: outcome.valueMask, weight: 1 }, source: { id: row.id, parent: row.parentId, quality: row.quality, configuredPlayers: row.configuredPlayers, terminalMask: row.terminalMask, correction: row.correction, rootMask: row.rootMask, rootValue: row.rootValue, alliances: row.alliances, selfAlliance: row.selfAlliance } });
            emitted++; buffered++;
            if (groups.get(key)!.length >= 16) await flush(key);
            while (buffered >= 128) await flush([...groups].sort((a, b) => b[1].length - a[1].length)[0][0]);
        }
    }
}
for (const [key, entries] of groups) while (entries.length) await flush(key);
save(`generations/gen_${String(generation).padStart(2, '0')}/expert-stream-epoch${epoch}.json`, { emitted, sha256: hash.digest('hex'), denseFeatureFiles: 0 });
