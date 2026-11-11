import fs from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { projectSnapshot } from '../data_acceptance_20261016/phone/projection';
import { readNativeSnapshot } from '../data_acceptance_20261016/native_reader/reader';
import { extractFeatures } from './tactics';
import { DIR } from './io';
for (const id of ['s0049', 's0496', 's0515']) {
    const base = path.join(DIR, 'initial-native', id);
    const state = projectSnapshot(readNativeSnapshot(fs.readFileSync(path.join(base, 'initial.bin'))), fs.readFileSync(path.join(base, 'config.bin')), '成本探针');
    const engine = new GameEngine(state), legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
    const features = extractFeatures(engine, legal);
    console.log(JSON.stringify({ id, units: state.units.length, stats: features.stats }));
}
