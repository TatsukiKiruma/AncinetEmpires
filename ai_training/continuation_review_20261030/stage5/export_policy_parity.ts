import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../../src/game/engine';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { DualStreamModel } from '../../../src/ai_runtime/dual_v3/model_runtime';
import { read, fileSha } from '../stage1/io';

/** 实际TypeScript运行时加载导出文件，对训练分区64个异尺寸前态逐位核验策略。 */
const base = 'D:/AncientEmpiresData/continuation_stage3_20261030_v1/acceptance_mac100k_20261031_v1/best/final';
const root = 'D:/AncientEmpiresData/continuation_stage5_20261104_v1/heads-v1';
const prefixes = [base, path.join(root, 'H1/final'), path.join(root, 'H2/final')];
const models = prefixes.map(prefix => { const b = fs.readFileSync(prefix + '.bin'); return new DualStreamModel(read(prefix + '.json'), b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); });
const selection = read('continuation_review_20261030/stage5/OOD_TRAIN_SELECTION.json');
const maxima = [0, 0], dimensions = new Set<string>();
for (let i = 0; i < 64; i++) {
    const entry = selection.rows[Math.floor(i * selection.rows.length / 64)];
    if (fileSha(entry.path) !== entry.sha256) throw Error('输入源摘要变化');
    const row = JSON.parse(gunzipSync(fs.readFileSync(entry.path)).toString());
    const state = row.samples[i % 12].state, engine = new GameEngine(state, {applyInitialTurnStart: false});
    const obs = encodeDualObservation(state, engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender'));
    dimensions.add(`${obs.width}x${obs.height}`);
    const reference = models[0].forward(obs).logits;
    for (let j = 0; j < 2; j++) {
        const actual = models[j + 1].forward(obs).logits;
        if (actual.length !== reference.length) throw Error('策略形状不一致');
        actual.forEach((value, k) => { if (!Number.isFinite(value)) throw Error('非有限策略'); maxima[j] = Math.max(maxima[j], Math.abs(value - reference[k])); });
    }
    if (i % 8 === 7) console.log(JSON.stringify({samples: i + 1, maxima}));
}
const report = {samples: 64, dimensions: [...dimensions], maxima, passed: maxima.every(v => v === 0), models: prefixes.map(p => ({prefix: p, sha256: fileSha(p + '.bin')})), sealedAccess: 0};
fs.writeFileSync('continuation_review_20261030/stage5/EXPORTED_POLICY_PARITY.json', JSON.stringify(report, null, 2), {flag: 'wx'});
if (!report.passed) throw Error('导出策略改变');
