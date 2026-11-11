import { createAppApkSkirmishGameState } from '../../src/game/apk_skirmish_map_assets';
import { GameEngine } from '../../src/game/engine';
import { hash, save } from './io';

const maps = ['(2) Duel.aem', '(2) Crossed swords.aem', '(2) Icy Paths.aem', '(2) Liberty Port.aem', '(2) Peak Island.aem'];
const initial = maps.map((name, index) => {
    const state = createAppApkSkirmishGameState(name, 'SD');
    // 与冻结训练来源一致，显式配置人口上限；不改变公共引擎规则。
    const rules = state.rules! as NonNullable<typeof state.rules> & { allowZeroPopulationRecruitAtLimit?: boolean };
    rules.populationLimit = rules.unitLimit; delete rules.unitLimit; rules.allowZeroPopulationRecruitAtLimit = true;
    if (rules.teams) for (const team of Object.values(rules.teams)) { if (team.unitLimit !== undefined) { team.populationLimit = team.unitLimit; delete team.unitLimit; } }
    const restored = new GameEngine(state).getState();
    if (hash(restored) !== hash(state)) throw Error('工厂快照恢复不一致');
    save(`battles/initial/map-${index}.json`, state);
    return { name, index, path: `battles/initial/map-${index}.json`, sha256: hash(state), initialGold: state.players.map(p => p.gold) };
});
const slots = ['random', 'apk_like', 'heuristic'].flatMap(opponent => ['baseline', 'best'].flatMap(model => ['direct', 'group_mass'].flatMap(decoder => [0,1].flatMap(seat => maps.map((_,mapIndex) => ({
    id: `${opponent}-${model}-${decoder}-m${mapIndex}-s${seat}`, opponent, model, decoder, seat, mapIndex,
    opponentSeed: 2026101800 + mapIndex*2 + seat,
}))))));
save('battle-plan.json', { maps: initial, slots, budgets: { maxActions: 2000, maxWallMs: 600000, maxDecisionMs: 30000 },
    randomDefinition: '当前合法动作过滤surrender后，包含end_turn的均匀随机；原RandomAI有90%非end_turn偏置，未直接复用该偏置',
    apkLikeIdentity: '项目ApkLikeAI近似策略，非原生APK逐动作等价', automaticHandoff: true,
    round10Definition: '首次进入第10轮时；双方城镇/城堡、规则每轮收入、累计实际入账及金币余额同时保留',
    moveDefinition: '有效移动=move/post_attack_move实际换格；致死落点=下一敌方回合单单位移动+攻击的最大结算净损血可致死',
    loopDefinition: '除turn外的完整规则状态加对手RNG状态第三次完全重复；不能把动作截断称为循环',
    scope: '标准已知地图/已消费开发材料上的诊断，非独立泛化验收', totalSlots: slots.length });
console.log(JSON.stringify({ slots: slots.length }));
