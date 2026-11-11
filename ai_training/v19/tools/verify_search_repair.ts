/** 中文：只用已消费的旧开发资料做工程回归；结果不计入新面板收益。 */
import fs from 'node:fs';
import { GameEngine } from '../../src/game/engine';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { predictSpatialAction } from '../../src/game/ai/shared_spatial_policy';
import { encodeAction } from '../../src/game/env';
import { selectSearchCandidates, tacticalScore, tacticalCandidateCodes } from '../search/selection';
import { identifyWindowFeatures } from '../search/window_features';

const manifest = JSON.parse(fs.readFileSync('v19/out/s0s1_20260930/search/window_manifest.json', 'utf8'));
const predictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(fs.readFileSync(manifest.policy.path, 'utf8')));
const rows = manifest.entries.map((entry: any) => {
    const state = JSON.parse(entry.rootStateJson);
    const engine = new GameEngine(state);
    const legal = engine.getLegalActions(entry.ownSeat).filter(a => a.type !== 'surrender');
    const prediction = predictSpatialAction(predictor, state, entry.ownSeat, legal);
    const chosen = selectSearchCandidates(legal, prediction, { policyTopK: 4, maxBranchPerLevel: 6 });
    const features = identifyWindowFeatures(state, legal);
    const recruits = legal.filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy').map(encodeAction);
    return {
        windowId: entry.windowId, diagnostics: chosen.diagnostics,
        recruitWindow: features.hasRecruit,
        allRecruitCodesRecognized: recruits.every(code => tacticalCandidateCodes(legal).includes(code)),
        legalOnly: chosen.actions.every(a => legal.some(b => encodeAction(a) === encodeAction(b))),
    };
});
const baseline = { ownCommanderHp: 50, enemyCommanderHp: 50, ownUnitCount: 3, enemyUnitCount: 3, ownGold: 0, enemyGold: 0 };
const monotonicity = {
    baseline: tacticalScore(baseline),
    ownHpPlus23: tacticalScore({ ...baseline, ownCommanderHp: 73 }),
    enemyHpMinus23: tacticalScore({ ...baseline, enemyCommanderHp: 27 }),
    ownUnitPlus1: tacticalScore({ ...baseline, ownUnitCount: 4 }),
    enemyUnitMinus1: tacticalScore({ ...baseline, enemyUnitCount: 2 }),
};
const passed = rows.every((r: any) => r.diagnostics.argmaxRetained && r.allRecruitCodesRecognized && r.legalOnly)
    && Object.entries(monotonicity).every(([key, score]) => key === 'baseline' || score > monotonicity.baseline);
const report = {
    passed, use: '旧40根工程回归，非独立收益', windows: rows.length,
    argmaxRetained: rows.filter((r: any) => r.diagnostics.argmaxRetained).length,
    recruitWindows: rows.filter((r: any) => r.recruitWindow).length,
    allRecruitCodesRecognized: rows.every((r: any) => r.allRecruitCodesRecognized),
    monotonicity, rows,
};
fs.writeFileSync('v19/out/search_recheck_20261003/selection_regression.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed, windows: report.windows, argmaxRetained: report.argmaxRetained,
    recruitWindows: report.recruitWindows, allRecruitCodesRecognized: report.allRecruitCodesRecognized, monotonicity }));
if (!passed) process.exitCode = 1;
