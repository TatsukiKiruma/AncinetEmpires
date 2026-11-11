import fs from 'node:fs';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { decodeAction } from '../../src/game/env';
import { extractFeatures } from './complete_tactics';
import { read, save, quantiles } from './io';

let candidates = 0, values = 0;
const oldMs: number[] = [], newMs: number[] = [];
for (let i = 0; i < 128; i++) {
    const probe = read(`probes/${i}.json`);
    const start = performance.now();
    const features = extractFeatures(new GameEngine(probe.state), probe.codes.map(decodeAction));
    const ms = performance.now() - start;
    assert.deepEqual(features.old, probe.old, `状态${i}旧特征不一致`);
    assert.deepEqual(features.extra, probe.extra, `状态${i}新特征不一致`);
    oldMs.push(probe.ms); newMs.push(ms); candidates += probe.codes.length; values += probe.codes.length * 32;
    if (i % 8 === 0) console.log(JSON.stringify({ i, ms, stats: features.stats }));
    save('speed.live.json', { states: i + 1, candidates, ms });
}
assert.equal(candidates, 16877);
save(process.argv[2] ?? 'feature-parity-speed.json', { passed: true, states: 128, candidates, values, maxFloat32Error: 0,
    oldMs: quantiles(oldMs), newMs: quantiles(newMs), totalSpeedup: oldMs.reduce((a,b)=>a+b)/newMs.reduce((a,b)=>a+b) });
