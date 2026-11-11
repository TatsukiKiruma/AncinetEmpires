import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getAllianceId, isCommanderUnit } from '../../src/game/rule_config';
import { encodeSample, loadExclusions, replayEntries, type SourceSample } from '../dual_stream_v2_phase3_20261020/source_loader';
import { gzipRows, stateHash, SOURCE } from '../dual_stream_v2_phase1_20261020/io';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';
import { packTensorBatch } from '../dual_stream_v2_phase1_20261020/tensor_bridge';
import { tacticalActionPriors } from '../../src/ai_runtime/dual_v2/tactical_prior';
import { valueCalibrationFeatures } from '../../src/ai_runtime/dual_v2/value_calibration';
import type { Symmetry } from '../dual_stream_v2_phase1_20261020/symmetry';
const dir = path.dirname(fileURLToPath(import.meta.url)), sourceDir = path.resolve(dir, '../dual_stream_v2_phase3_20261020');
const split = process.argv[2] ?? 'train', epoch = Number(process.argv[3] ?? 0), limit = Number(process.argv[4] ?? Infinity);
const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'split-manifest-v2-stage3.json'), 'utf8'));
const exclusions = loadExclusions(manifest);
if (split === 'train' && fs.existsSync(path.join(dir, 'evaluation-exclusions.txt.gz'))) {
    for (const hash of gunzipSync(fs.readFileSync(path.join(dir, 'evaluation-exclusions.txt.gz'))).toString().trim().split('\n')) if (hash) exclusions.add(hash);
}
const controllers = new Map<string, number[]>();
for (const entry of [...replayEntries(), ...manifest.newReplayEntries]) {
    const root = entry.root ?? path.join(SOURCE, 'replay');
    for await (const row of gzipRows(fs.readFileSync(path.join(root, entry.packet.path)))) if (row.kind === 'game') {
        controllers.set(entry.responseSha256, row.playerTypes); break;
    }
}
const buckets = new Map<string, any[]>(); let buffered = 0, emitted = 0, rng = (20261020 + epoch * 65537) >>> 0;
let bufferedBytes = 0, maximumBufferedBytes = 0;
const inputDigest = createHash('sha256'), distribution: Record<string, number> = {}, symmetries: Record<string, number> = {};
let threatenedCommanderSamples = 0, valueSamples = 0;
const random = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296; };
const write = async (b: Buffer) => { if (!process.stdout.write(b)) await once(process.stdout, 'drain'); };
async function flush(key: string) {
    const pool = buckets.get(key)!, batch: any[] = []; let size = 0;
    while (pool.length && batch.length < 16 && (!batch.length || size + pool[0].encodedBytes < 24_000_000)) {
        const entry = pool.shift()!; batch.push(entry); size += entry.encodedBytes;
    }
    buffered -= batch.length; bufferedBytes -= size;
    const { bytes, metadata } = packTensorBatch(batch.map(e => e.observation), batch.map(e => e.label));
    const meta = Buffer.from(JSON.stringify({ ...metadata, sources: batch.map(e => e.source) }));
    const header = Buffer.alloc(8); header.writeUInt32LE(meta.length); header.writeUInt32LE(bytes.length, 4);
    inputDigest.update(meta); inputDigest.update(bytes);
    await write(header); await write(meta); await write(bytes);
}
for (let lane = 0; lane < 5 && emitted < limit; lane++) {
    let mapId = '', base: any, mapIndex = -1;
    for await (const row of gzipRows(fs.readFileSync(path.join(sourceDir, `corpus/${split}-${lane}.jsonl.gz`)))) {
        if (row.kind === 'map') { mapId = row.id; base = row.map; mapIndex = -1; continue; }
        if (emitted >= limit) break;
        if (row.mapId !== mapId) throw Error('压缩快照地图引用失配');
        const map = { ...base, tiles: base.tiles.map((r: any[]) => r.slice()) };
        for (const [i, tile] of row.patches) map.tiles[Math.floor(i / map.width)][i % map.width] = tile;
        const keys = Object.keys(row.state);
        const reconstruct = (position: number) => Object.fromEntries([...keys.slice(0, position).map(k => [k, row.state[k]]), ['map', map], ...keys.slice(position).map(k => [k, row.state[k]])]);
        // 恢复JSON字段顺序后与准入前态逐字节摘要核对，不仅检查动作标签。
        if (mapIndex < 0) mapIndex = Array.from({ length: keys.length + 1 }, (_, i) => i).find(i => stateHash(reconstruct(i)) === row.label.currentBeforeHash) ?? -1;
        if (mapIndex < 0) throw Error('压缩快照无法恢复原前态摘要');
        const state: any = reconstruct(mapIndex);
        // 蒸馏阶段以稳定SHA均匀抽取基础池；校准和开发验证仍完整流过冻结池。
        if (split === 'train' && process.env.LEAGUE_BASE_RATE && Number.parseInt(createHash('sha256').update(row.label.currentBeforeHash).digest('hex').slice(0, 8), 16) / 4294967296 >= Number(process.env.LEAGUE_BASE_RATE)) continue;
        if (stateHash(state) !== row.label.currentBeforeHash) throw Error('压缩快照身份失效');
        if (exclusions.has(ruleStateHash(state)) || exclusions.has(row.label.sourceBeforeHash) || exclusions.has(row.label.currentBeforeHash)) continue;
        const engine = new GameEngine(state, { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true });
        const legal = engine.getLegalActions(state.currentPlayer), targetIndex = legal.findIndex(a => encodeAction(a) === row.label.targetCode);
        if (targetIndex < 0 || exclusions.has(row.label.sourceBeforeHash) || exclusions.has(row.label.currentBeforeHash)) throw Error('压缩快照标签或永久排重失效');
        const sample: SourceSample = { ...row.label, state, legalActions: legal, targetIndex };
        const symmetry: Symmetry = 'id';
        const encoded = encodeSample(sample, symmetry), pointers = encoded.observation.actions.pointers;
        const controllerType = sample.source === 'replay' ? controllers.get(sample.parentId)?.[state.currentPlayer] : null;
        if (sample.source === 'replay' && controllerType !== 1 && controllerType !== 2) throw Error('真人来源行动方控制者无法核实');
        const quality = sample.source === 'replay' ? controllerType === 1 ? 2 : 1 : sample.valueMask ? getAllianceId(state, state.currentPlayer) === sample.winner ? 1.5 : .75 : 1;
        const unmoved = new Set(state.units.filter((u: any) => !u.hasMoved).map((u: any) => u.id));
        const tactical = new Set(legal.flatMap(a => a.type === 'attack' ? [a.attackerId] : a.type === 'capture' || a.type === 'move' ? [a.unitId] : []));
        const wasteActors = new Set<number>();
        for (let i = 0; i < encoded.observation.actions.sourceIndices.length; i++) {
            const a = legal[encoded.observation.actions.sourceIndices[i]];
            if (a.type === 'wait' && unmoved.has(a.unitId) && tactical.has(a.unitId)) wasteActors.add(pointers[i * 5]);
        }
        let threatenedCommander = false;
        const area = map.width * map.height;
        for (const u of state.units) if (u.ownerId === state.currentPlayer && isCommanderUnit(state, u)) {
            let x = u.pos.x, y = u.pos.y;
            
            
            if (encoded.observation.spatialTensor[24 * area + y * map.width + x] > 0) threatenedCommander = true;
        }
        const observation = encoded.observation;
        const tacticalScores = tacticalActionPriors(state, legal);
        const prior = Array.from(observation.actions.sourceIndices, i => tacticalScores[i].prior);
        const valueFeatures = valueCalibrationFeatures(state, observation.playerOrder);
        const encodedBytes = observation.spatialTensor.byteLength + observation.entityTokens.byteLength + observation.relationalBias.byteLength + observation.actions.pointers.byteLength + observation.actions.sourceIndices.byteLength + 4096;
        const key = `${map.width}x${map.height}/n${Math.ceil(observation.entityIndexMap.entities.length / 16) * 16}`;
        const sourceClass = sample.source === 'replay' ? controllerType === 1 ? 'replay-human' : 'replay-ai' : 'native';
        const stratum = `${sourceClass}/${row.configuredPlayers}p/${state.turn <= 5 ? 'opening' : state.turn <= 15 ? 'middle' : 'late'}`;
        distribution[stratum] = (distribution[stratum] ?? 0) + 1;
        symmetries[symmetry] = (symmetries[symmetry] ?? 0) + 1;
        threatenedCommanderSamples += Number(threatenedCommander); valueSamples += Number(encoded.outcome.valueMask);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push({ encodedBytes, observation: encoded.observation, label: { target: encoded.target, policyMask: true, valueTarget: encoded.outcome.target, valueMask: encoded.outcome.valueMask, weight: sample.weight },
            source: { id: `${sample.parentId}:${sample.macro}:${sample.subAction}`, parent: sample.parentId, source: sample.source, controllerType, width: map.width, height: map.height, quality, prior, valueFeatures, configuredPlayers: row.configuredPlayers, turn: state.turn, alliances: encoded.observation.playerOrder.playerIds.map(id => id === null ? null : getAllianceId(state, id)), recruitOpportunity: legal.some(a => a.type.startsWith('recruit_')), attackOpportunity: legal.some(a => a.type === 'attack'), wasteActors: [...wasteActors], threatenedCommander, symmetry } });
        buffered++; emitted++; bufferedBytes += encodedBytes; maximumBufferedBytes = Math.max(maximumBufferedBytes, bufferedBytes);
        if (buckets.get(key)!.length >= 16) await flush(key);
        while (buffered >= 256 || bufferedBytes > 80_000_000) await flush([...buckets].sort((a, b) => b[1].length - a[1].length)[0][0]);
    }
}
for (const [key, batch] of buckets) while (batch.length) await flush(key);
fs.mkdirSync(path.join(dir, 'stream-receipts'), { recursive: true });
fs.writeFileSync(path.join(dir, `stream-receipts/${split}-epoch${epoch}.json`), JSON.stringify({ split, epoch, emitted, valueSamples, aggregateSha256: inputDigest.digest('hex'), distribution, symmetries, threatenedCommanderSamples, maximumBufferedBytes, encodedFeatureFiles: 0 }, null, 2));
console.error(JSON.stringify({ split, epoch, emitted, encodedFeatureFiles: 0 }));
