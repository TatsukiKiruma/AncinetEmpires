/** 规则与编码最小反例；人工诊断状态只作机制验证，不当作正式胜率证据。 */
import * as fs from 'node:fs';
import { createAppApkSkirmishGameState } from '../../src/game/apk_skirmish_map_assets';
import { createDemoState } from '../../src/game/demo_map';
import { GameEngine } from '../../src/game/engine';
import { AncientEmpiresEnv, encodeAction } from '../../src/game/env';
import { getRuleConfig } from '../../src/game/rule_config';
import { encodeGameStateSpatial, encodeCandidateActionSpatial } from '../../src/game/ai/spatial_tensor_encoder';
import { canonicalActionOrderV16 } from '../../src/game/ai/action_ordering';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { predictSpatialAction } from '../../src/game/ai/shared_spatial_policy';
import { calculateDamage } from '../../src/game/rules';
import type { GameState, Unit, UnitClass } from '../../src/game/types';

const maps = ['(2) Duel.aem', '(2) Icy Paths.aem', '(2) Liberty Port.aem', '(2) Mourningstar.aem', '(2) Crossed swords.aem'];
const openings = maps.map(mapName => {
    const state = createAppApkSkirmishGameState(mapName);
    const actions = new GameEngine(state).getLegalActions(state.currentPlayer);
    const rules = getRuleConfig(state);
    return { mapName, width: state.map.width, height: state.map.height, gold: state.players.map(p => p.gold),
        legal: actions.length, recruits: actions.filter(a => a.type.startsWith('recruit')).length,
        rules: { unitLimit: rules.unitLimit, populationLimit: rules.populationLimit ?? null,
            commanderBase: rules.commanderRecruitBaseCost, commanderGrowth: rules.commanderRecruitCostGrowth,
            incomeVillage: rules.incomeVillage, incomeCastle: rules.incomeCastle,
            incomeCommanderBase: rules.incomeCommanderBase, incomeCommanderGrowth: rules.incomeCommanderGrowth,
            defeatOnNoUnitsAndNoCastles: rules.defeatOnNoUnitsAndNoCastles, defeatOnCommanderDeath: rules.defeatOnCommanderDeath,
            allowPendingRecruitEndTurn: rules.allowPendingRecruitEndTurn } };
});

function unit(id: string, ownerId: number, unitClass: UnitClass, x: number, y: number): Unit {
    return { id, ownerId, unitClass, pos: { x, y }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false, level: 0, exp: 0 };
}
const a = createDemoState();
a.map = { width: 10, height: 10, tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ terrainId: 6 as const, ownerId: null }))) };
a.players.forEach(p => { p.gold = 0; });
a.units = [unit('own', 0, 'commander', 3, 3), unit('near', 1, 'slime', 4, 4), unit('far', 1, 'water_elemental', 7, 7), unit('enemy_commander', 1, 'commander', 9, 9)];
const b: GameState = structuredClone(a);
b.units.find(u => u.id === 'near')!.unitClass = 'water_elemental';
b.units.find(u => u.id === 'far')!.unitClass = 'slime';

function modelInput(s: GameState) {
    const encoded = encodeGameStateSpatial(s, 0, 'v2', { channels: 26 });
    const legal = new GameEngine(s).getLegalActions(0).filter(x => x.type !== 'surrender');
    const candidates = canonicalActionOrderV16(legal).map(x => {
        const feature = encodeCandidateActionSpatial(s, 0, x.action, 'v2', 'v15_current');
        return { code: x.code, ...feature, semantics: Array.from(feature.semantics) };
    });
    return { spatial: Array.from(encoded.spatialTensor), globals: Array.from(encoded.globalFeatures), candidates };
}
const inputA = modelInput(a), inputB = modelInput(b);
const predictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(fs.readFileSync('v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json', 'utf8')));
const predictions = [a, b].map(s => predictSpatialAction(predictor, s, 0, new GameEngine(s).getLegalActions(0).filter(x => x.type !== 'surrender')));
const afterMove = [a, b].map(s => {
    const e = new GameEngine(s);
    e.step({ type: 'move', unitId: 'own', to: { x: 4, y: 3 } });
    const before = e.getState();
    const predictedDamage = calculateDamage(before, 'own', 'near');
    e.step({ type: 'attack', attackerId: 'own', targetId: 'near' });
    return { nearbyEnemyClass: before.units.find(u => u.id === 'near')!.unitClass, predictedDamage,
        hpAfter: e.getState().units.map(u => ({ id: u.id, hp: u.hp })) };
});

// 当前敌军的 hasMoved 是其上一回合的标记，但下次敌军开始回合会重置。
const moved: GameState = structuredClone(a);
moved.units.filter(u => u.ownerId === 1).forEach(u => { u.hasMoved = true; u.hasActed = true; });
const threatAt = (s: GameState, x: number, y: number) => {
    const enc = encodeGameStateSpatial(s, 0, 'v2', { channels: 26 });
    const area = enc.spatialTensor.length / 26;
    const width = Math.sqrt(area);
    return enc.spatialTensor[21 * area + y * width + x];
};
const enemyEngine = new GameEngine(moved);
enemyEngine.step({ type: 'end_turn' });
const enemyStart = enemyEngine.getState();

// 用真实环境接口验证截断奖励口径，避免后续强化学习误接代理胜负。
const timeoutEnv = new AncientEmpiresEnv({ initialState: createAppApkSkirmishGameState('(2) Duel.aem'), maxPlies: 1 });
const timeout = timeoutEnv.stepAction({ type: 'end_turn' });
const result = {
    openings,
    representationCounterexample: { artificialDiagnosticOnly: true,
        fullInputsIdentical: JSON.stringify(inputA) === JSON.stringify(inputB),
        legalCandidates: inputA.candidates.length,
        selectedCodes: predictions.map(p => p.bestActionCode),
        logitsIdentical: JSON.stringify(predictions[0].actionLogits) === JSON.stringify(predictions[1].actionLogits),
        sameMoveThenAttack: afterMove },
    threatTurnBoundary: { enemyBeforeHasMoved: moved.units.find(u => u.id === 'near')!.hasMoved,
        enemyAfterHasMoved: enemyStart.units.find(u => u.id === 'near')!.hasMoved,
        dangerAtOwnPositionBefore: threatAt(moved, 3, 3), dangerAtOwnPositionAfter: threatAt(enemyStart, 3, 3) },
    timeoutReward: { reward: timeout.reward, done: timeout.done, info: timeout.info, actualWinner: timeoutEnv.getState().winner },
};
if (!result.representationCounterexample.fullInputsIdentical) throw new Error('人工反例没有构成输入碰撞');
fs.writeFileSync('v19/review/rules_and_encoding_probe.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
