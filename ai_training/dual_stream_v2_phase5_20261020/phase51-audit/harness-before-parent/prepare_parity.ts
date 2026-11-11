import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DIR, STAGE4, read, save } from './common';
import { getLegalActions } from '../../src/game/rules';
import { encodeDualObservation } from '../../src/ai_runtime/dual_v2/encoder';
import { tacticalActionPriors } from '../../src/ai_runtime/dual_v2/tactical_prior';
import { valueCalibrationFeatures } from '../../src/ai_runtime/dual_v2/value_calibration';

const folder = process.env.LEAGUE_FOLDER ?? path.join(DIR, 'generations/gen_00');
const meta = read(path.join(STAGE4, 'samples.json')), bytes = fs.readFileSync(path.join(STAGE4, 'samples.bin'));
const inputs = read(path.join(STAGE4, 'pipeline-inputs.json')).map((row: any, i: number) => {
    const legal = getLegalActions(row.state, row.state.currentPlayer), observation = encodeDualObservation(row.state, legal), prior = tacticalActionPriors(row.state, legal);
    const arrays: Record<string, Float32Array | Int32Array | Uint8Array> = { spatial: observation.spatialTensor, entities: observation.entityTokens, relations: observation.relationalBias, players: observation.playerOrder.features, active: observation.playerOrder.active, pointers: observation.actions.pointers, actorMask: observation.actions.actorMask, sourceIndices: observation.actions.sourceIndices };
    for (const e of meta.arrays.filter((e: any) => e.batch === i && arrays[e.name])) {
        const a = arrays[e.name]; assert.deepEqual(Buffer.from(a.buffer, a.byteOffset, a.byteLength), bytes.subarray(e.offset, e.offset + e.bytes));
    }
    return { ...row, prior: Array.from(observation.actions.sourceIndices, j => prior[j].prior), features: valueCalibrationFeatures(row.state, observation.playerOrder) };
});
assert.equal(inputs.length, 89);
fs.copyFileSync(path.join(STAGE4, 'samples.json'), path.join(folder, 'samples.json'));
fs.copyFileSync(path.join(STAGE4, 'samples.bin'), path.join(folder, 'samples.bin'));
save(path.join(folder, 'pipeline-inputs.json'), inputs);
save(path.join(folder, 'parity-input-receipt.json'), { states: 89, allFrozenObservationArraysByteIdentical: true });
