import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { gzipSync } from 'node:zlib';
import { getLegalActions } from '../../src/game/rules';
import { encodeDualObservation } from '../../src/ai_runtime/dual_v2/encoder';
import { packTensorBatch, type BridgeLabel } from '../dual_stream_v2_phase1_20261020/tensor_bridge';
import { architectureFixtures } from './fixture_states';
import { createLoaderStats, encodeSample, loadExclusions, nativeEntries, replayEntries, streamNativeSegment, streamReplay, type SourceSample } from '../dual_stream_v2_phase1_20261020/streaming_loader';
import { DIR, read, save, sha } from './io';

export async function selectSamples() {
    const manifestBytes = fs.readFileSync(path.join(DIR, '../dual_stream_v2_phase1_20261020/split-manifest-v2.json'));
    const manifest = JSON.parse(manifestBytes.toString()), excluded = loadExclusions(manifest), stats = createLoaderStats(), selected: SourceSample[] = [], seen = new Set<string>();
    const train = new Set(manifest.parents.filter(p => p.split === 'train').map(p => `${p.source}:${p.id}`));
    const choose = async (iterable: AsyncIterable<SourceSample>, count: number, spacing: number) => {
        let taken = 0, nextMacro = -1;
        for await (const s of iterable) {
            if (s.macro < nextMacro || seen.has(s.currentBeforeHash)) continue;
            selected.push(s); seen.add(s.currentBeforeHash); nextMacro = s.macro + spacing; taken++;
            if (taken >= count) break;
        }
        return taken;
    };
    for (const players of [2, 3, 4]) for (const mode of ['SD']) {
        const quota = players === 4 ? 16 : 12;
        let taken = 0;
        for (const e of nativeEntries().filter(e => e.valueEligible && e.admittedAtoms > 0 && e.actualBucket.configuredPlayerCount === players && e.actualBucket.configMode === mode && train.has(`native:${e.parentId}`))) {
            taken += await choose(streamNativeSegment(e, excluded, stats), quota - taken, 8);
            if (taken === quota) break;
        }
        if (taken !== quota) throw Error(`可信真实训练来源不足：${players}/${mode}/${taken}`);
        console.error(JSON.stringify({ players, mode, taken, selected: selected.length }));
    }
    // 真实SO仅存在真人来源；不能把原生SD修改规则后冒充真实SO。
    for (const players of [2, 3]) {
        let taken = 0;
        for (const e of replayEntries().filter(e => !e.zeroPolicy && train.has(`replay:${e.responseSha256}`) && manifest.parents.some(p => p.id === e.responseSha256 && p.stratum.startsWith(`${players}|`) && p.stratum.endsWith('|SO')))) {
            taken += await choose(streamReplay(e, excluded, stats), 4 - taken, 3);
            if (taken === 4) break;
        }
        if (taken !== 4) throw Error('真实SO来源不足');
        console.error(JSON.stringify({ replayPlayers: players, mode: 'SO', selected: selected.length }));
    }
    for (const players of [5, 6]) {
        let taken = 0;
        for (const e of replayEntries().filter(e => !e.zeroPolicy && train.has(`replay:${e.responseSha256}`) && manifest.parents.find(p => p.source === 'replay' && p.id === e.responseSha256)?.configuredPlayers === players)) {
            taken += await choose(streamReplay(e, excluded, stats), 8 - taken, 5);
            if (taken === 8) break;
        }
        if (taken !== 8) throw Error('真实多人来源不足');
        console.error(JSON.stringify({ replayPlayers: players, selected: selected.length }));
    }
    return { selected, stats, manifestSha256: sha(manifestBytes) };
}


async function main() {
    const mode = process.argv[2];
    if (!['prepare', 'stream'].includes(mode)) throw Error('用法：samples.ts prepare|stream');
    const { selected, stats, manifestSha256 } = await selectSamples();
    const encoded = selected.map(s => encodeSample(s));
    const observations = encoded.map(s => s.observation), labels: BridgeLabel[] = encoded.map(s => ({ target: s.target, policyMask: true, valueTarget: s.outcome.target, valueMask: s.outcome.valueMask, weight: s.weight }));
    const sources: any[] = selected.map(s => ({ kind: 'real', source: s.source, parentId: s.parentId, beforeHash: s.currentBeforeHash, sourceBeforeHash: s.sourceBeforeHash, macro: s.macro, subAction: s.subAction, width: s.state.map.width, height: s.state.map.height, players: s.state.players.length, mode: s.state.metadata?.apkSkirmishMode, valueMask: s.valueMask, units: s.state.units.length }));
    if (mode === 'prepare') {
        const fixtures = architectureFixtures();
        for (const { name, state } of fixtures) {
            const legal = getLegalActions(state, state.currentPlayer); observations.push(encodeDualObservation(state, legal));
            labels.push({ target: 0, policyMask: false, valueTarget: new Float32Array(6), valueMask: false, weight: 0 });
            sources.push({ kind: 'fixture', name, width: state.map.width, height: state.map.height, players: state.players.length, units: state.units.length, legalActions: legal.length });
        }
        const packed = packTensorBatch(observations, labels);
        fs.writeFileSync(path.join(DIR, 'samples.bin'), packed.bytes); save('samples.json', { ...packed.metadata, sources, stats, manifestSha256 });
        fs.writeFileSync(path.join(DIR, 'real-states.json.gz'), gzipSync(JSON.stringify(selected.map(s => s.state))));
        console.error(JSON.stringify({ samples: sources.length, bytes: packed.bytes.length, stats }));
    } else {
        process.stdout.on('error', (e: NodeJS.ErrnoException) => { if (e.code === 'EPIPE') process.exit(0); else throw e; });
        for (let start = 0; start < 64; start += 4) {
            const packed = packTensorBatch(observations.slice(start, start + 4), labels.slice(start, start + 4));
            const meta = Buffer.from(JSON.stringify({ ...packed.metadata, sources: sources.slice(start, start + 4), manifestSha256 })), header = Buffer.alloc(8);
            header.writeUInt32LE(meta.length); header.writeUInt32LE(packed.bytes.length, 4);
            for (const bytes of [header, meta, packed.bytes]) if (!process.stdout.write(bytes)) await once(process.stdout, 'drain');
        }
    }
}
await main();
