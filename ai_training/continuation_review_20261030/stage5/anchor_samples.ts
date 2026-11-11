import path from 'node:path';
import { read, decisions, sha, fileSha } from '../stage1/io';
import { GameEngine } from '../../../src/game/engine';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { trainingValueTarget } from '../../../src/ai_runtime/dual_v3/value_target';
import { valueCalibrationFeatures } from '../../../src/ai_runtime/dual_v2/value_calibration';
import { packTensorBatch } from '../../dual_stream_v2_phase1_20261020/tensor_bridge';
import { Storage } from './storage';

/** 从冻结训练分区读取独立前态，不回放或改写历史轨迹。 */
const output = process.argv[2];
const split = process.argv[3] ?? 'train';
if (!['train', 'dev'].includes(split)) throw Error('只允许train/dev分区');
const partition = path.resolve('continuation_review_20261030/stage1/PARTITIONS.json');
const parents = read(partition).parents.filter((p: any) => p.admitted && p.split === split && p.winner !== null && p.winner !== -1);
const storage = new Storage(path.resolve(output));
const rows: any[] = [], categories = new Set<string>();
const plan: [string, number, number][] = [['old', 2, 153], ['new', 2, 153], ['new', 3, 297], ['new', 4, 297]];
if (split === 'dev') for (const entry of plan) entry[2] = parents.filter((p: any) => p.corpus === entry[0] && p.players === entry[1]).length;
for (const [corpus, players, needed] of plan) {
    const pool = parents.filter((p: any) => p.corpus === corpus && p.players === players).sort((a: any, b: any) => sha('stage5-anchor/' + a.parentId).localeCompare(sha('stage5-anchor/' + b.parentId)));
    const kinds = [...new Set(pool.map((p: any) => p.category))].sort();
    const ordered: any[] = [];
    for (let i = 0; ordered.length < pool.length; i++) for (const kind of kinds) { const p = pool.filter((p: any) => p.category === kind)[i]; if (p) ordered.push(p); }
    let count = 0;
    for (const p of ordered) {
        if (count >= needed) break;
        const macros: number[] = corpus === 'old' ? Array.from({length: p.actions}, (_, i) => i) : [...new Set<number>(p.positions.filter((r: number[]) => r[1] === 0).map((r: number[]) => r[0]))];
        if (macros.length < 12) continue;
        const chosen = new Set(Array.from({length: 12}, (_, i) => macros[Math.floor((i + .5) * macros.length / 12)]));
        const obs: any[] = [], labels: any[] = [], sources: any[] = [];
        for await (const r of decisions(p, chosen)) {
            if (r.sub !== 0) continue;
            const engine = new GameEngine(r.state, {applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true});
            const observation = encodeDualObservation(r.state, engine.getLegalActions(r.state.currentPlayer).filter(a => a.type !== 'surrender'));
            const value = trainingValueTarget(r.state, observation.playerOrder, true, p.winner);
            obs.push(observation); labels.push({target: 0, policyMask: false, valueTarget: value.target, valueMask: value.valueMask, weight: 1});
            sources.push({parentId: p.parentId, split, corpus, players, category: p.category, macro: r.macro, source: 'anchor', calibration: valueCalibrationFeatures(r.state, observation.playerOrder)});
        }
        if (obs.length !== 12) throw Error('锚点抽样数量不符：' + p.parentId);
        const packed = packTensorBatch(obs, labels), file = `${corpus}-${players}-${count}.json.gz`;
        storage.write(file, {metadata: {...packed.metadata, sources}, bytes: packed.bytes.toString('base64')}, true);
        rows.push({file, parentId: p.parentId, corpus, players, category: p.category, samples: 12}); categories.add(p.category); count++;
        if (rows.length % 25 === 0) console.log(JSON.stringify({parents: rows.length, samples: rows.length * 12}));
    }
    if (count !== needed) throw Error('锚点来源数量不足');
}
storage.write('ENCODING_REPORT.json', {split, samples: rows.length * 12, partitionSha256: fileSha(partition), ratios: split === 'train' ? [.17, .17, .33, .33] : null, categories: [...categories], rows, sealedAccess: 0});
