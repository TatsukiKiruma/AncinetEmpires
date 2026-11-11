import fs from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { decodeAction } from '../../src/game/env';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { extractFeatures } from './complete_tactics';
import { encodeFeatures, observationState } from './encoding';
import { DIR, read, save } from './io';

const oldSchema = read('old-schema.json');
const out = [];
const states = [];
for (const name of fs.readdirSync(path.join(DIR, 'parity-states')).sort((a,b) => parseInt(a)-parseInt(b))) {
    const { state, codes } = read('parity-states/'+name);
    states.push({ state, codes });
    const engine = new GameEngine(state);
    const actions = codes.map((code: string) => decodeAction(code)!);
    const packet = observe(observationState(state), actions);
    const features = extractFeatures(engine, packet.codes.map(decodeAction));
    const x = encodeFeatures(packet, oldSchema, features);
    const groups = x.codes.map(code => { const a: any = decodeAction(code)!; return (a.unitId ?? a.attackerId ?? a.healerId ?? a.summonerId ?? a.supporterId ?? (a.castlePos ? `castle:${a.castlePos.x},${a.castlePos.y}` : 'global')) + '|' + a.type; });
    out.push({ ...x, target: 0, weight: 1, actionGroups: groups });
}
save('parity-inputs.json',out);
save('browser-states.json',states);
console.log(JSON.stringify({ probes: out.length }));
