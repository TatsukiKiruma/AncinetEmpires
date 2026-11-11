/** 中文：本次评估的只读探针；不训练、不修改历史产物，仅向本评估目录保存证据。 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction } from '../../../src/game/env';
import { predictSpatialAction } from '../../../src/game/ai/shared_spatial_policy';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../../src/game/ai/spatial_conv_net';
import { tacticalScore, tacticalCandidateCodes, type TacticalSummary } from '../../search/rollout_search';

const manifest = JSON.parse(fs.readFileSync('v19/out/s0s1_20260930/search/window_manifest.json', 'utf8'));
const weights = fs.readFileSync(manifest.policy.path, 'utf8');
const predictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(weights));
const base: TacticalSummary = {
    ownCommanderHp: 50, enemyCommanderHp: 50,
    ownCommanderHpDelta: 0, enemyCommanderHpDelta: 0,
    ownUnitCount: 3, enemyUnitCount: 3, ownGold: 0, enemyGold: 0, turn: 1,
};
const monotonicity = {
    baseline: tacticalScore(base),
    ownHpPlus23: tacticalScore({ ...base, ownCommanderHp: 73 }),
    enemyHpMinus23: tacticalScore({ ...base, enemyCommanderHp: 27 }),
    ownUnitPlus1: tacticalScore({ ...base, ownUnitCount: 4 }),
    enemyUnitMinus1: tacticalScore({ ...base, enemyUnitCount: 2 }),
    ownGoldPlus100: tacticalScore({ ...base, ownGold: 100 }),
};
const rows = manifest.entries.map((entry: any) => {
    const state = JSON.parse(entry.rootStateJson);
    const engine = new GameEngine(state);
    const legal = engine.getLegalActions(entry.ownSeat).filter(a => a.type !== 'surrender');
    const prediction = predictSpatialAction(predictor, state, entry.ownSeat, legal);
    const claimedTop4 = prediction.orderedActionCodes.slice(0, 4);
    const actualTop4 = prediction.orderedActionCodes.map((code, index) => ({ code, logit: prediction.actionLogits[index], index }))
        .sort((a, b) => b.logit - a.logit || a.index - b.index).slice(0, 4).map(item => item.code);
    // 中文：逐字复现现有搜索的候选并集、按动作类型排序和五分支裁剪。
    const candidates = new Map<string, typeof legal[number]>();
    for (const code of [...claimedTop4, ...tacticalCandidateCodes(legal)]) {
        const action = legal.find(a => encodeAction(a) === code);
        if (action) candidates.set(code, action);
    }
    const rank = (type: string) => type === 'attack' ? 0 : type === 'capture' ? 1 : type === 'recruit' ? 2 : 3;
    const expanded = [...candidates.values()].sort((a, b) => rank(a.type) - rank(b.type)).slice(0, 5).map(encodeAction);
    const recruits = legal.filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy').map(encodeAction);
    return {
        windowId: entry.windowId, group: entry.group, legalCount: legal.length,
        claimedTop4, actualTop4, expanded, best: prediction.bestActionCode,
        sameTop4Set: actualTop4.every(code => claimedTop4.includes(code)),
        claimedTop4ContainsBest: claimedTop4.includes(prediction.bestActionCode),
        expandedContainsBest: expanded.includes(prediction.bestActionCode),
        actualTop4ExpandedCount: actualTop4.filter(code => expanded.includes(code)).length,
        legalAttackCount: legal.filter(a => a.type === 'attack').length,
        expandedAttackCount: expanded.filter(code => code.startsWith('attack:')).length,
        recruits,
        tacticalRetainsRecruit: tacticalCandidateCodes(legal).some(code => recruits.includes(code)),
    };
});
const result = {
    note: '只读调用当前生产函数和已冻结40个根状态；未执行搜索长续弈或训练。',
    modelSha256: crypto.createHash('sha256').update(weights).digest('hex'),
    monotonicity,
    summary: {
        windows: rows.length,
        wrongTop4Set: rows.filter((r: any) => !r.sameTop4Set).length,
        claimedTop4MissingBest: rows.filter((r: any) => !r.claimedTop4ContainsBest).length,
        expandedMissingBest: rows.filter((r: any) => !r.expandedContainsBest).length,
        attacksPruned: rows.filter((r: any) => r.legalAttackCount > r.expandedAttackCount).length,
        recruitWindows: rows.filter((r: any) => r.recruits.length > 0).length,
        recruitWindowsMissingTactical: rows.filter((r: any) => r.recruits.length > 0 && !r.tacticalRetainsRecruit).length,
    },
    rows,
};
fs.writeFileSync('v19/review/assessment_20261003/search_probe.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ modelSha256: result.modelSha256, monotonicity, summary: result.summary }, null, 2));
