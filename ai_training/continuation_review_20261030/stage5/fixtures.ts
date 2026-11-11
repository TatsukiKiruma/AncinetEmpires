import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../../src/game/engine';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { packTensorBatch } from '../../dual_stream_v2_phase1_20261020/tensor_bridge';
import { read, initialState } from '../stage1/io';
import { Storage } from './storage';
const here = path.dirname(fileURLToPath(import.meta.url));
const storage = new Storage(process.argv[2]);
const parents = read(path.join(here, '../stage1/PARTITIONS.json')).parents.filter((p: any) => p.corpus === 'new' && p.admitted && p.split === 'train');
// 轮流覆盖人数与地图，隔离校验只读取训练分区。
const selected: any[] = [];
for (let i = 0; i < 64; i++) selected.push(parents.filter((p: any) => p.players === 2 + i % 3)[Math.floor(i / 3)]);
for (let i = 0; i < selected.length; i++) {
    const p = selected[i], state = initialState(p), engine = new GameEngine(state, {applyInitialTurnStart: false});
    const obs = encodeDualObservation(state, engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender'));
    const packed = packTensorBatch([obs], [{target: 0, policyMask: false, valueTarget: new Float32Array(6), valueMask: false, weight: 1}]);
    storage.write(`${i}.json.gz`, {metadata: {...packed.metadata, sources: [{parentId: p.parentId, split: 'train'}]}, bytes: packed.bytes.toString('base64')}, true);
}
