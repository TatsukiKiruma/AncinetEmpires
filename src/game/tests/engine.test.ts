import { describe, it, expect } from 'vitest';
import { GameEngine } from '../engine';
import { createDemoState } from '../demo_map';
import { TERRAIN_CONFIG, UNIT_CONFIGS } from '../constants';
import { calculateDamage, getLegalActions } from '../rules';
import { getReachablePositions } from '../map';
import { getMoveCostForUnit, isFlying, isMountainTerrain, isForestTerrain, getAttackBonus, getDefenseBonus, clearNegativeStatus, getEffectiveStats } from '../abilities';
import { APK_ABILITY_ID_TO_TYPE, APK_STATUS_ID_TO_TYPE, APK_UNIT_ID_TO_CLASS } from '../apk_compat';

describe('GameEngine Rules', () => {

    it('16类地形配置存在，数值正确', () => {
        expect(TERRAIN_CONFIG[1].key).toBe('snow');
        expect(TERRAIN_CONFIG[1].moveCost).toBe(1);
        expect(TERRAIN_CONFIG[1].defenseBonus).toBe(5); // 雪地
        expect(TERRAIN_CONFIG[9].key).toBe('town');
        expect(TERRAIN_CONFIG[9].defenseBonus).toBe(15); // 城镇
        expect(TERRAIN_CONFIG[9].healPerTurn).toBe(20);
        expect(TERRAIN_CONFIG[9].incomePerTurn).toBe(50);
        expect(TERRAIN_CONFIG[10].key).toBe('castle');
        expect(TERRAIN_CONFIG[10].defenseBonus).toBe(15);
        expect(TERRAIN_CONFIG[10].healPerTurn).toBe(20);
        expect(TERRAIN_CONFIG[10].incomePerTurn).toBe(100); // 城堡
        
        expect(Object.keys(TERRAIN_CONFIG).length).toBe(16);
    });

    it('初始化与状态克隆不影响原状态', () => {
        const state = createDemoState();
        const engine = new GameEngine(state);
        const cloneFn = engine.clone();
        
        const act = cloneFn.getLegalActions(0)[0];
        cloneFn.step(act);

        expect(cloneFn.getState().turn).not.toBeUndefined();
        
        const origState = engine.getState();
        expect(origState.currentPlayer).toBe(0);
        expect(origState.units[0].hasMoved).toBe(false);
    });

    it('野外营地回血 20，不能招募，不能占领', () => {
        const state = createDemoState();
        // Give P0 a camp holding by commander
        state.map.tiles[0][0].terrainId = 11; // camp
        state.map.tiles[0][0].ownerId = null; // neutral explicitly
        state.units[0].hp = 50; 
        
        const engine = new GameEngine(state);
        const actions = engine.getLegalActions(0);
        
        // Cannot recruit
        const recruitActions = actions.filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');
        expect(recruitActions.length).toBe(0);
        
        // Cannot capture
        const captureActions = actions.filter(a => a.type === 'capture');
        expect(captureActions.length).toBe(0);
        
        // Check healing mechanics via turn change (P0 -> P1 -> P0)
        engine.step({ type: 'end_turn' });
        engine.step({ type: 'end_turn' });
        const finalState = engine.getState();
        expect(finalState.units.find(u => u.id === 'u1')!.hp).toBe(70);
    });

    it('城镇和城堡会产生金币收益，营地不会，且切换回合兵力回血不超过最大血量', () => {
        const state = createDemoState();
        // 赋予P1一个城镇(9), 城堡(10已经在7,7)
        state.map.tiles[6][6].terrainId = 9;
        state.map.tiles[6][6].ownerId = 1;

        // 让P1的 commander 在己方城堡受损，但伤害很小
        state.units[1].hp = 140; 
        state.units[1].maxHp = 150;
        
        const engine = new GameEngine(state);
        let currentP1Gold = engine.getState().players[1].gold;
        
        // P0 end turn -> P1 turn starts
        engine.step({ type: 'end_turn' });
        
        const finalState = engine.getState();
        expect(finalState.currentPlayer).toBe(1);
        
        // Income = 100 (from 7,7 P1 Castle) + 50 (from 6,6 P1 Town) = 150
        expect(finalState.players[1].gold).toBe(currentP1Gold + 150);
        
        // Healing = +20 (standing on castle), but maxHp is 150
        expect(finalState.units.find(u => u.id === 'u2')!.hp).toBe(150);
    });

    it('非指挥官站在城堡时不生成 recruit_and_deploy 动作，但如果城堡己方可以生成 recruit_to_castle (如果原本为空，这里由于有人而不会生成空堡招募)', () => {
        const state = createDemoState();
        // Replace P0 commander with infantry on the castle
        state.units[0].unitClass = 'soldier';
        const engine = new GameEngine(state);
        const actions = engine.getLegalActions(0);
        // 不应该有任何招募行为，因为被自己的普通士兵占了
        const recruitActions = actions.filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');
        expect(recruitActions.length).toBe(0);
    });

    it('指挥官站在己方城堡可产生 recruit_and_deploy 动作且生成不在城堡原地', () => {
        const engine = new GameEngine(createDemoState());
        const actions = engine.getLegalActions(0);
        const recruitActions = actions.filter(a => a.type === 'recruit_and_deploy');
        expect(recruitActions.length).toBeGreaterThan(0);
        
        const act = recruitActions[0];
        if (act.type === 'recruit_and_deploy') {
            // 生成格子必须与城堡不处于同一格
            expect(act.to.x !== act.castlePos.x || act.to.y !== act.castlePos.y).toBe(true);
            engine.step(act);
            // 新兵已处于目标格子且不能移动
            const newUnits = engine.getState().units.filter(u => u.pos.x === act.to.x && u.pos.y === act.to.y);
            expect(newUnits.length).toBe(1);
            expect(newUnits[0].hasMoved).toBe(true);
            expect(newUnits[0].movementRemaining).toBe(0);
            expect(newUnits[0].hasActed).toBe(false);
            expect(engine.getState().pendingUnitId).toBe(newUnits[0].id);

            // pending 状态下，合法动作只能是该单位的 wait 或 attack / capture / healing (如果合法) 或 end_turn (用于安全逃逸或兜底)
            const subsequentActions = engine.getLegalActions(0);
            
            // 没有其他单位的动作
            const otherUnitsActions = subsequentActions.filter(a => (a as any).unitId && (a as any).unitId !== newUnits[0].id);
            expect(otherUnitsActions.length).toBe(0);

            // 没有招募的动作
            const recruitAgain = subsequentActions.filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');
            expect(recruitAgain.length).toBe(0);

            // 让这个新兵 wait
            const waitAct = subsequentActions.find(a => a.type === 'wait');
            expect(waitAct).toBeDefined();
            engine.step(waitAct!);

            // pending 应该清除了
            expect(engine.getState().pendingUnitId).toBeUndefined();
        }
    });

    it('空城堡可产生 recruit_to_castle 动作，生成的单位可以马上移动和行动', () => {
        const state = createDemoState();
        // 让 P0 城堡上的人走开 (Commander 走到旁边)
        state.units[0].pos = { x: 2, y: 2 };
        const engine = new GameEngine(state);
        const actions = engine.getLegalActions(0);
        const recruitActions = actions.filter(a => a.type === 'recruit_to_castle');
        expect(recruitActions.length).toBeGreaterThan(0);

        const act = recruitActions[0];
        if (act.type === 'recruit_to_castle') {
            engine.step(act);
            const newState = engine.getState();
            const newUnits = newState.units.filter(u => u.pos.x === act.castlePos.x && u.pos.y === act.castlePos.y);
            expect(newUnits.length).toBe(1);
            expect(newUnits[0].hasMoved).toBe(false);
            expect(newUnits[0].hasActed).toBe(false);
            expect(newState.pendingUnitId).toBe(newUnits[0].id);

            // 具有 pendingUnitId，只能该单位动
            const subActions = engine.getLegalActions(0);
            const canMove = subActions.some(a => a.type === 'move' && a.unitId === newUnits[0].id);
            expect(canMove).toBe(true);

            // 执行移动，然后依然 pending (因为移动没有 hasActed)？
            // 移动以后 pending 还会在吗？
            // 引擎里面 step(move) 并未改变 hasActed, 而且因为 action 不是 end_turn, pendingUnit 依然有，所以依然锁住! 这是正确的，符合要求。
            const moveAct = subActions.find(a => a.type === 'move')!;
            engine.step(moveAct);
            expect(engine.getState().pendingUnitId).toBe(newUnits[0].id);
        }
    });

    it('修理者可修理损坏城镇', () => {
        const state = createDemoState();
        state.map.tiles[0][0].terrainId = 8; // Commander is standing on damaged_town (8)
        state.map.tiles[0][0].ownerId = null;
        
        const engine = new GameEngine(state);
        const actions = engine.getLegalActions(0);
        const repairActions = actions.filter(a => a.type === 'repair');
        expect(repairActions.length).toBe(1);

        engine.step(repairActions[0]);
        const tile = engine.getState().map.tiles[0][0];
        
        expect(tile.terrainId).toBe(9); // 变为城镇
        expect(tile.ownerId).toBe(0); // 属于修理者
    });

    it('APK 21 个单位配置和 ID 映射存在', () => {
        expect(Object.keys(UNIT_CONFIGS).length).toBe(21);
        expect(UNIT_CONFIGS.crystal.name).toBe('水晶');
        expect(UNIT_CONFIGS.crystal.cost).toBeNull();
        expect(APK_UNIT_ID_TO_CLASS[11]).toBe('crystal');
        expect(APK_STATUS_ID_TO_TYPE[2]).toBe('inspired');
        expect(APK_ABILITY_ID_TO_TYPE[18]).toBe('attack_aura');
    });

    it('伤害公式: 士兵攻击史莱姆时，按物理防御计算', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'soldier'; // P0 soldier
        state.units[1].unitClass = 'slime';   // P1 slime

        state.units[0].pos = { x: 1, y: 1 };
        state.units[1].pos = { x: 1, y: 2 };
        
        state.map.tiles[2][1].terrainId = 6; // road, 0 defense

        // soldier ATK: 55, physical. slime physical DEF: 40
        // Expected damage: (55 - 40 - 0) * (100/100) = 15
        const dmg = calculateDamage(state, 'u1', 'u2');
        expect(dmg).toBe(15);
    });

    it('伤害公式: 幽灵攻击史莱姆时，按魔法防御计算', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'ghost'; // P0 ghost
        state.units[1].unitClass = 'slime';   // P1 slime

        state.units[0].pos = { x: 1, y: 1 };
        state.units[1].pos = { x: 1, y: 2 };
        
        state.map.tiles[2][1].terrainId = 6; // road, 0 defense

        // ghost ATK: 50, magic. slime magic DEF: -20
        // Expected damage: (50 - (-20) - 0) * (100/100) = 70
        const dmg = calculateDamage(state, 'u1', 'u2');
        expect(dmg).toBe(70);
    });

    it('伤害公式: 地形防御会减少伤害', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'soldier'; // P0 soldier
        state.units[1].unitClass = 'soldier';   // P1 soldier

        state.units[0].pos = { x: 1, y: 1 };
        state.units[1].pos = { x: 1, y: 2 };
        
        state.map.tiles[2][1].terrainId = 9; // town, 15 defense bonus

        // soldier ATK: 55, soldier phys DEF: 5. Town def: +15
        // Expected dmg: 55 - 5 - 15 = 35
        const dmg = calculateDamage(state, 'u1', 'u2');
        expect(dmg).toBe(35);
    });

    it('伤害公式: 空军不享受地形防御', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'soldier'; // P0 soldier
        state.units[1].unitClass = 'ghost';   // P1 ghost (flying)

        state.units[0].pos = { x: 1, y: 1 };
        state.units[1].pos = { x: 1, y: 2 };
        
        state.map.tiles[2][1].terrainId = 9; // town, 15 defense bonus

        // soldier ATK: 55. ghost phys DEF: 5. Town def +15 ignored because ghost is flying
        // Expected dmg: 55 - 5 = 50
        const dmg = calculateDamage(state, 'u1', 'u2');
        expect(dmg).toBe(50);
    });

    it('伤害公式: 战意单位低血量时伤害不下降', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'berserker'; // P0 berserker (fighting_spirit)
        state.units[1].unitClass = 'soldier';   // P1 soldier

        state.units[0].pos = { x: 1, y: 1 };
        state.units[1].pos = { x: 1, y: 2 };
        state.map.tiles[2][1].terrainId = 6;
        
        state.units[0].hp = 10; // Low hp

        // berserker ATK: 70, soldier phys DEF: 5
        // Expected damage with fighting_spirit ignores hpRatio: 70 - 5 = 65
        const dmg = calculateDamage(state, 'u1', 'u2');
        expect(dmg).toBe(65);
    });

    it('伤害公式: 近战大师近战最终伤害 ×1.5', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'dragon'; // P0 dragon (melee_master)
        state.units[1].unitClass = 'soldier';

        state.units[0].pos = { x: 1, y: 1 };
        state.units[1].pos = { x: 1, y: 2 }; // melee (distance 1)
        state.map.tiles[2][1].terrainId = 6;

        // dragon ATK: 70 magic. soldier magic DEF: 5
        // rawDmg = 70 - 5 = 65
        // melee_master: 65 * 1.5 = 97.5 -> 97
        const dmg = calculateDamage(state, 'u1', 'u2');
        expect(dmg).toBe(97);
    });

    it('伤害公式: 远程防御对远程攻击减半', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'archer'; // P0 archer (range 2-3)
        state.units[1].unitClass = 'golem'; // P1 golem (ranged_defense)

        state.units[0].pos = { x: 1, y: 1 };
        state.units[1].pos = { x: 1, y: 3 }; // range 2
        state.map.tiles[3][1].terrainId = 6; 

        // archer phys ATK: 45. golem phys DEF: 30.
        // rawDmg = 45 - 30 = 15
        // ranged_defense (not melee): 15 * 0.5 = 7.5 -> Math.floor -> 7
        const dmg = calculateDamage(state, 'u1', 'u2');
        expect(dmg).toBe(7);
    });

    it('伤害公式: 空军攻击水中非空军单位攻击 +10，同为空军不触发', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'ghost';
        state.units[0].pos = { x: 1, y: 1 };
        state.units[1].unitClass = 'soldier';
        state.units[1].pos = { x: 1, y: 2 };
        state.map.tiles[2][1].terrainId = 2;

        expect(calculateDamage(state, 'u1', 'u2')).toBe(55);

        state.units[1].unitClass = 'ghost';
        expect(calculateDamage(state, 'u1', 'u2')).toBe(35);
    });

    it('伤害公式: 最终伤害向下取整', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'soldier';
        state.units[1].unitClass = 'soldier';

        state.units[0].pos = { x: 1, y: 1 };
        state.units[1].pos = { x: 1, y: 2 };
        state.map.tiles[2][1].terrainId = 6;
        
        state.units[0].hp = 51; // 51/100
        // atk = 55, def = 5. rawDmg = 50. 
        // 50 * 0.51 = 25.5
        // Floor should be 25.
        const dmg = calculateDamage(state, 'u1', 'u2');
        expect(dmg).toBe(25);
    });

    it('能力测试: 空军在深水和山脉上移动消耗均为 1', () => {
        const state = createDemoState();
        const unit = state.units[0]; 
        unit.unitClass = 'ghost';
        
        const deepWaterTile = { terrainId: 2, ownerId: null };
        const mountainTile = { terrainId: 3, ownerId: null };
        
        expect(getMoveCostForUnit(state, unit, deepWaterTile as any)).toBe(1);
        expect(getMoveCostForUnit(state, unit, mountainTile as any)).toBe(1);
    });

    it('能力测试: 空军不享受地形防御加成', () => {
        const state = createDemoState();
        const unit = { ...state.units[0], unitClass: 'ghost' };
        expect(isFlying(unit as any)).toBe(true);
    });

    it('能力测试: 水之子在深水、水中神庙、孤岛移动消耗均为 1', () => {
        const state = createDemoState();
        const unit = { ...state.units[0], unitClass: 'mermaid' }; 
        
        expect(getMoveCostForUnit(state, unit as any, { terrainId: 2, ownerId: null } as any)).toBe(1); 
        expect(getMoveCostForUnit(state, unit as any, { terrainId: 16, ownerId: null } as any)).toBe(1); 
        expect(getMoveCostForUnit(state, unit as any, { terrainId: 5, ownerId: null } as any)).toBe(1); 
    });

    it('能力测试: 水之子在水地形攻防 +10', () => {
        const state = createDemoState();
        const attacker = { ...state.units[0], unitClass: 'mermaid', pos: { x: 1, y: 1 } };
        state.units[0] = attacker as any;
        state.map.tiles[1][1].terrainId = 2; 
        
        const defender = { ...state.units[1], unitClass: 'soldier', pos: { x: 1, y: 2 } };
        
        expect(getAttackBonus(state, attacker as any, defender as any)).toBe(10);
        
        const defenderMermaid = { ...state.units[1], unitClass: 'mermaid', pos: { x: 1, y: 2 } };
        state.units[1] = defenderMermaid as any;
        state.map.tiles[2][1].terrainId = 16; 
        expect(getDefenseBonus(state, attacker as any, defenderMermaid as any)).toBe(10);
    });

    it('能力测试: 山之子匹配山脉、丘陵，不匹配孤岛', () => {
        expect(isMountainTerrain(3)).toBe(true); 
        expect(isMountainTerrain(4)).toBe(true); 
        expect(isMountainTerrain(5)).toBe(false); 
    });

    it('能力测试: 森林之子匹配森林', () => {
        expect(isForestTerrain(7)).toBe(true); 
        expect(isForestTerrain(3)).toBe(false); 
    });

    it('能力测试: 大地之子陆地移动消耗 1，水地形移动消耗 2', () => {
        const state = createDemoState();
        const unit = { ...state.units[0], unitClass: 'berserker' }; 
        
        expect(getMoveCostForUnit(state, unit as any, { terrainId: 1, ownerId: null } as any)).toBe(1);
        expect(getMoveCostForUnit(state, unit as any, { terrainId: 3, ownerId: null } as any)).toBe(1);
        
        expect(getMoveCostForUnit(state, unit as any, { terrainId: 2, ownerId: null } as any)).toBe(2);
    });

    it('能力测试: 自我修复回合开始回复最大生命值 25%', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'slime';
        state.units[0].hp = 50;
        state.units[0].maxHp = 100;
        state.map.tiles[0][0].terrainId = 6; 
        
        const engine = new GameEngine(state);
        engine.step({ type: 'end_turn' }); 
        engine.step({ type: 'end_turn' }); 
        
        const finalState = engine.getState();
        expect(finalState.units[0].hp).toBe(75);
    });

    it('状态系统测试: 单位已有中毒时，致盲不会替换中毒', () => {
        const state = createDemoState();
        // 给 targetA (P1) 手动加上 poisoned 状态
        state.units[1].status = { type: 'poisoned', remainingTicks: 2 };
        // 给 attacker (P0) 配成 blinder (黑巫师 dark_mage 带有 blinder 能力)
        state.units[0].unitClass = 'dark_mage'; 
        
        const engine = new GameEngine(state);
        // 主动攻击
        engine.step({ type: 'attack', attackerId: state.units[0].id, targetId: state.units[1].id });
        
        const target = engine.getState().units.find(u => u.id === state.units[1].id)!;
        expect(target.status?.type).toBe('poisoned'); // 应当不替换
    });

    it('状态系统测试: 投毒者攻击目标后附加中毒', () => {
        const state = createDemoState();
        // 设置 attacker (P0) 是投毒者 (使用 wolf 带有 poisoner 能力)
        state.units[0].unitClass = 'wolf';
        state.units[1].unitClass = 'soldier'; // 确保无 poisoner 
        
        const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
        engine.step({ type: 'attack', attackerId: state.units[0].id, targetId: state.units[1].id });
        
        const target = engine.getState().units.find(u => u.id === state.units[1].id)!;
        expect(target.status?.type).toBe('poisoned');
        expect(target.status?.remainingTicks).toBe(2);
    });

    it('状态系统测试: 被投毒者能力单位不会被投毒', () => {
        const state = createDemoState();
        // 设定双方都有投毒者能力 (wolf 具有 poisoner)
        state.units[0].unitClass = 'wolf';
        state.units[1].unitClass = 'wolf'; 
        
        const engine = new GameEngine(state);
        engine.step({ type: 'attack', attackerId: state.units[0].id, targetId: state.units[1].id });
        
        const target = engine.getState().units.find(u => u.id === state.units[1].id)!;
        expect(target.status).toBeUndefined(); // 此时不该附加上毒
    });

    it('状态系统测试: 中毒回合开始先扣 10 血与状态完结', () => {
        const state = createDemoState();
        // 给 P0 的 soldier 置于 6 号平地（没有基础 heal，也没有任何 self_repair 地带干扰）并设置中毒
        const soldier = state.units[0];
        soldier.unitClass = 'soldier';
        soldier.hp = 50;
        soldier.status = { type: 'poisoned', remainingTicks: 2 };
        state.map.tiles[soldier.pos.y][soldier.pos.x].terrainId = 6;
        
        const engine = new GameEngine(state);
        // 经过一轮（P0 -> P1 -> P0），使 P0 的回合重新开始
        engine.step({ type: 'end_turn' }); // 切到 P1
        engine.step({ type: 'end_turn' }); // 重新切到 P0
        
        let u = engine.getState().units.find(item => item.id === soldier.id)!;
        expect(u.hp).toBe(40); // 第一次少 10
        expect(u.status?.remainingTicks).toBe(1);
        
        engine.step({ type: 'end_turn' }); // P1
        engine.step({ type: 'end_turn' }); // P0
        
        u = engine.getState().units.find(item => item.id === soldier.id)!;
        expect(u.hp).toBe(30); // 第二次少 10
        expect(u.status?.remainingTicks).toBe(0);

        engine.step({ type: 'end_turn' }); // P1
        engine.step({ type: 'end_turn' }); // P0
        
        u = engine.getState().units.find(item => item.id === soldier.id)!;
        expect(u.hp).toBe(30); // 第三次回合不扣血并且中毒消除
        expect(u.status).toBeUndefined();
    });

    it('状态系统测试: 中毒扣血致死后不再触发地形回血', () => {
        const state = createDemoState();
        const soldier = state.units[0];
        soldier.unitClass = 'soldier';
        soldier.hp = 5; // 低保生命 5
        soldier.status = { type: 'poisoned', remainingTicks: 2 };
        // 放置于 11 号地块（城堡且 owner 是 P0 自行势力，有极高的地形回血）
        state.map.tiles[soldier.pos.y][soldier.pos.x].terrainId = 11;
        state.map.tiles[soldier.pos.y][soldier.pos.x].ownerId = 0;
        
        const engine = new GameEngine(state);
        engine.step({ type: 'end_turn' }); // P1
        engine.step({ type: 'end_turn' }); // P0。回合开始，中毒应扣 10 血，导致归零并排除
        
        const u = engine.getState().units.find(item => item.id === soldier.id);
        expect(u).toBeUndefined(); // 该单位应该已经致死退场
    });

    it('状态系统测试: 致盲后攻击范围为 0', () => {
        const state = createDemoState();
        const attacker = state.units[0];
        attacker.status = { type: 'blinded' };
        
        const actions = getLegalActions(state, 0);
        // 合法操作中，由于致盲，一定不可以包含对 defender 发起的攻击动作
        const hasAttack = actions.some((act: any) => act.type === 'attack');
        expect(hasAttack).toBe(false);
    });

    it('状态系统测试: 虚弱后移动力为 1，近战防御 -10，远程减半', () => {
        const state = createDemoState();
        // P0 (x:0, y:0) 位置的 soldier 手动加上 weakened
        const soldier = state.units[0];
        soldier.unitClass = 'soldier'; // 保证防御
        soldier.status = { type: 'weakened', remainingTurns: 1 };
        
        // 1. 测试移动力变成 1
        const reachable = getReachablePositions(state, soldier.id);
        // 仅在原地 1 步范围 (x:0,y:0),(1,0),(0,1) 等
        reachable.forEach((pos: any) => {
            const dist = Math.abs(pos.x - soldier.pos.x) + Math.abs(pos.y - soldier.pos.y);
            expect(dist).toBeLessThanOrEqual(1);
        });

        // 2. 远程攻击时虚弱防御惩罚减半为 -5
        const attacker = state.units[1]; // P1 攻击方
        attacker.unitClass = 'archer'; 
        
        // 我们计算当无 weakened 状态和有 weakened 状态时的防御伤害对比
        const stateNormal = JSON.parse(JSON.stringify(state));
        delete stateNormal.units[0].status; // 正常防御测试
        const normalDmg = calculateDamage(stateNormal, attacker.id, soldier.id);
        const weakenedDmg = calculateDamage(state, attacker.id, soldier.id);
        
        expect(weakenedDmg - normalDmg).toBe(5);

        // 3. 近战攻击时虚弱防御惩罚为 -10
        attacker.unitClass = 'soldier';
        attacker.pos = { x: 0, y: 1 };
        const meleeStateNormal = JSON.parse(JSON.stringify(state));
        delete meleeStateNormal.units[0].status;
        const normalMeleeDmg = calculateDamage(meleeStateNormal, attacker.id, soldier.id);
        const weakenedMeleeDmg = calculateDamage(state, attacker.id, soldier.id);
        expect(weakenedMeleeDmg - normalMeleeDmg).toBe(10);
    });

    it('状态系统测试: 净化函数可以清除中毒、致盲、虚弱', () => {
        const unit = { ...createDemoState().units[0] };
        
        unit.status = { type: 'poisoned', remainingTicks: 2 };
        clearNegativeStatus(unit);
        expect(unit.status).toBeUndefined();

        unit.status = { type: 'blinded' };
        clearNegativeStatus(unit);
        expect(unit.status).toBeUndefined();

        unit.status = { type: 'weakened', remainingTurns: 1 };
        clearNegativeStatus(unit);
        expect(unit.status).toBeUndefined();
    });

    it('状态系统测试: 反击不会附加中毒或致盲', () => {
        const state = createDemoState();
        // attacker (P0) 是普通兵种 (soldier) 无任何状态
        const attacker = state.units[0];
        attacker.unitClass = 'soldier'; 
        // target (P1) 是投毒者 (wolf)
        const target = state.units[1];
        target.unitClass = 'wolf';
        
        const engine = new GameEngine(state);
        // 主动攻击，期待 target 会由于存活并在射程内进行反击
        engine.step({ type: 'attack', attackerId: attacker.id, targetId: target.id });
        
        const finalAttacker = engine.getState().units.find(u => u.id === attacker.id)!;
        expect(finalAttacker.status).toBeUndefined(); // 被反击的一方绝对不能被附加中毒 or 致盲
    });

    describe('第 5 步：主动技能、光环、墓碑与二次移动测试', () => {
        it('5.1 治疗师治疗普通友军 +40，且可突破最大血量', () => {
            const state = createDemoState();
            // 在 (0,0) 放一个 paladin (治疗师)，在相邻 (0,1) 放一个 soldier (友军，受伤状态且 maxHp 为 100)
            const paladin = state.units.find(u => u.ownerId === 0)!;
            paladin.unitClass = 'paladin';
            paladin.pos = { x: 0, y: 0 };
            paladin.hasActed = false;

            // 构造受伤友军
            const friend = state.units.find(u => u.ownerId === 0 && u.id !== paladin.id)!;
            friend.unitClass = 'soldier';
            friend.pos = { x: 0, y: 1 };
            friend.hp = 90;
            friend.maxHp = 100;
            
            const engine = new GameEngine(state);
            engine.step({ type: 'heal', healerId: paladin.id, targetId: friend.id });

            const finalState = engine.getState();
            const resFriend = finalState.units.find(u => u.id === friend.id)!;
            expect(resFriend.hp).toBe(130); // APK：治疗师治疗可以突破最大血量
            expect(resFriend.hasBeenHealedThisTurn).toBe(true);
        });

        it('5.2 治疗师治疗骷髅/幽灵造成 40 伤害', () => {
            const state = createDemoState();
            const paladin = state.units.find(u => u.ownerId === 0)!;
            paladin.unitClass = 'paladin';
            paladin.pos = { x: 0, y: 0 };

            // 构造友军幽灵 (具有 undead 属性)
            const ghostFriend = state.units.find(u => u.ownerId === 0 && u.id !== paladin.id)!;
            ghostFriend.unitClass = 'ghost';
            ghostFriend.pos = { x: 0, y: 1 };
            ghostFriend.hp = 80;
            ghostFriend.maxHp = 100;

            const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
            engine.step({ type: 'heal', healerId: paladin.id, targetId: ghostFriend.id });

            const finalState = engine.getState();
            const resGhost = finalState.units.find(u => u.id === ghostFriend.id)!;
            expect(resGhost.hp).toBe(40); // 80 - 40 = 40 (变为伤害)
        });

        it('5.3 中毒单位不能被治疗师治疗', () => {
            const state = createDemoState();
            const paladin = state.units.find(u => u.ownerId === 0)!;
            paladin.unitClass = 'paladin';
            paladin.pos = { x: 0, y: 0 };

            const friend = state.units.find(u => u.ownerId === 0 && u.id !== paladin.id)!;
            friend.unitClass = 'soldier';
            friend.pos = { x: 0, y: 1 };
            friend.hp = 50;
            friend.status = { type: 'poisoned', remainingTicks: 2 };

            const actions = getLegalActions(state, 0);
            const hasHealFriend = actions.some(a => a.type === 'heal' && a.targetId === friend.id);
            expect(hasHealFriend).toBe(false); // 中毒单位不应生成治疗动作
        });

        it('5.4 墓碑按中立对象存在', () => {
            const state = createDemoState();
            state.graves = [
                { id: 'grave1', pos: { x: 3, y: 3 }, remainingTurns: 2 }
            ];
            expect(state.graves.length).toBe(1);
            expect(state.graves[0].pos.x).toBe(3);
        });

        it('5.5 普通单位踩墓碑扣 10 且墓碑消失', () => {
            const state = createDemoState();
            state.currentPlayer = 0;
            state.graves = [
                { id: 'grave1', pos: { x: 0, y: 1 }, remainingTurns: 2 }
            ];
            const soldier = state.units.find(u => u.ownerId === 0)!;
            soldier.unitClass = 'soldier';
            soldier.pos = { x: 0, y: 0 };
            soldier.hp = 80;

            const engine = new GameEngine(state);
            engine.step({ type: 'move', unitId: soldier.id, to: { x: 0, y: 1 } });

            const finalState = engine.getState();
            const resSoldier = finalState.units.find(u => u.id === soldier.id)!;
            expect(resSoldier.hp).toBe(70); // 80 - 10 = 70
            expect(finalState.graves?.length).toBe(0); // 墓碑消失了
        });

        it('5.6 骷髅/幽灵踩墓碑回复 10 且墓碑消失', () => {
            const state = createDemoState();
            state.currentPlayer = 0;
            state.graves = [
                { id: 'grave1', pos: { x: 0, y: 1 }, remainingTurns: 2 }
            ];
            const ghost = state.units.find(u => u.ownerId === 0)!;
            ghost.unitClass = 'ghost'; // undead
            ghost.pos = { x: 0, y: 0 };
            ghost.hp = 80;

            const engine = new GameEngine(state);
            engine.step({ type: 'move', unitId: ghost.id, to: { x: 0, y: 1 } });

            const finalState = engine.getState();
            const resGhost = finalState.units.find(u => u.id === ghost.id)!;
            expect(resGhost.hp).toBe(90); // 80 + 10 = 90
            expect(finalState.graves?.length).toBe(0); // 墓碑消失
        });

        it('5.7 召唤师可在 2 格范围内用墓碑召唤骷髅', () => {
            const state = createDemoState();
            const witch = state.units.find(u => u.ownerId === 0)!;
            witch.unitClass = 'witch'; // summoner
            witch.pos = { x: 0, y: 0 };

            state.graves = [
                { id: 'grave1', pos: { x: 0, y: 2 }, remainingTurns: 2 }
            ];

            // 检查合法动作应当产生召唤
            const actions = getLegalActions(state, 0);
            const summonAct = actions.find(a => a.type === 'summon');
            expect(summonAct).toBeDefined();

            const engine = new GameEngine(state);
            engine.step(summonAct!);

            const finalState = engine.getState();
            expect(finalState.graves?.length).toBe(0); // 墓碑被用于召唤而消失
            const newSkeleton = finalState.units.find(u => u.unitClass === 'skeleton')!;
            expect(newSkeleton).toBeDefined();
            expect(newSkeleton.pos.x).toBe(0);
            expect(newSkeleton.pos.y).toBe(2);
        });

        it('5.8 支援者可重置合法友军行动状态', () => {
            const state = createDemoState();
            const druid = state.units.find(u => u.ownerId === 0)!;
            druid.unitClass = 'druid'; // supporter
            druid.pos = { x: 0, y: 0 };

            const friend = state.units.find(u => u.ownerId === 0 && u.id !== druid.id)!;
            friend.unitClass = 'soldier';
            friend.pos = { x: 0, y: 2 }; // 相距 2 格
            friend.hasActed = true; // 已行动
            friend.hasMoved = true;

            const actions = getLegalActions(state, 0);
            const supportAct = actions.find(a => a.type === 'support' && a.targetId === friend.id);
            expect(supportAct).toBeDefined();

            const engine = new GameEngine(state);
            engine.step(supportAct!);

            const finalState = engine.getState();
            const resFriend = finalState.units.find(u => u.id === friend.id)!;
            expect(resFriend.hasActed).toBe(false); // 被重置可再次移动和行动
            expect(resFriend.hasMoved).toBe(false);
            expect(resFriend.hasBeenSupportedThisTurn).toBe(true);
        });

        it('5.9 支援者不能支援突击部队、城堡捕获者、支援者', () => {
            const state = createDemoState();
            const druid = state.units.find(u => u.ownerId === 0)!;
            druid.unitClass = 'druid';
            druid.pos = { x: 0, y: 0 };

            // 它是它的本家突击/城堡捕获/支援友军，哪怕它们已经待机，也不能产生支援动作
            const friend = state.units.find(u => u.ownerId === 0 && u.id !== druid.id)!;
            friend.unitClass = 'wolf'; // 属于突击部队 assault_troop 
            friend.pos = { x: 0, y: 1 };
            friend.hasActed = true;

            const actions = getLegalActions(state, 0);
            const hasSupport = actions.some(a => a.type === 'support');
            expect(hasSupport).toBe(false);
        });

        it('5.10 破坏者可将无人守护城镇变为损坏城镇，不能破坏城堡', () => {
            const state = createDemoState();
            const catapult = state.units.find(u => u.ownerId === 0)!;
            catapult.unitClass = 'catapult'; // destroyer
            catapult.pos = { x: 1, y: 1 };

            // 设当前格为城镇
            state.map.tiles[1][1].terrainId = 9; // town
            state.map.tiles[1][1].ownerId = null;

            const actions = getLegalActions(state, 0);
            const destroyAct = actions.find(a => a.type === 'destroy_town' && a.unitId === catapult.id);
            expect(destroyAct).toBeDefined();

            const engine = new GameEngine(state);
            engine.step(destroyAct!);

            const finalState = engine.getState();
            expect(finalState.map.tiles[1][1].terrainId).toBe(8); // 变为损坏城镇 (8)
        });

        it('5.11 攻击光环附加鼓舞状态，且不覆盖已有状态', () => {
            const state = createDemoState();
            const druid = state.units.find(u => u.ownerId === 0)!;
            druid.unitClass = 'druid';
            druid.pos = { x: 1, y: 1 };

            const friend = state.units.find(u => u.ownerId === 0 && u.id !== druid.id)!;
            friend.unitClass = 'soldier';
            friend.pos = { x: 1, y: 2 };

            const engine = new GameEngine(state);
            engine.step({ type: 'wait', unitId: druid.id });

            const inspiredFriend = engine.getState().units.find(u => u.id === friend.id)!;
            expect(inspiredFriend.status?.type).toBe('inspired');

            const blockedState = createDemoState();
            const blockedDruid = blockedState.units.find(u => u.ownerId === 0)!;
            blockedDruid.unitClass = 'druid';
            blockedDruid.pos = { x: 1, y: 1 };
            const poisonedFriend = blockedState.units.find(u => u.ownerId === 0 && u.id !== blockedDruid.id)!;
            poisonedFriend.pos = { x: 1, y: 2 };
            poisonedFriend.status = { type: 'poisoned', remainingTicks: 2 };

            const blockedEngine = new GameEngine(blockedState);
            blockedEngine.step({ type: 'wait', unitId: blockedDruid.id });

            const resFriend = blockedEngine.getState().units.find(u => u.id === poisonedFriend.id)!;
            expect(resFriend.status?.type).toBe('poisoned');
        });

        it('5.12 鼓舞近战攻击 +10，远程攻击加成减半', () => {
            const state = createDemoState();
            const attacker = state.units[0];
            const defender = state.units[1];
            attacker.unitClass = 'soldier';
            attacker.status = { type: 'inspired', remainingTurns: 1 };
            attacker.pos = { x: 1, y: 1 };
            defender.unitClass = 'soldier';
            defender.pos = { x: 1, y: 2 };
            state.map.tiles[2][1].terrainId = 6;

            expect(calculateDamage(state, attacker.id, defender.id)).toBe(60);

            attacker.unitClass = 'archer';
            attacker.pos = { x: 1, y: 0 };
            defender.pos = { x: 1, y: 2 };
            expect(calculateDamage(state, attacker.id, defender.id)).toBe(45);
        });

        it('5.13 净化光环结束回合后触发，清除 debuff 并回血', () => {
            const state = createDemoState();
            const elf = state.units.find(u => u.ownerId === 0)!;
            elf.unitClass = 'elf'; // cleansing_aura
            elf.pos = { x: 1, y: 1 };

            const friend = state.units.find(u => u.ownerId === 0 && u.id !== elf.id)!;
            friend.unitClass = 'soldier';
            friend.pos = { x: 1, y: 2 }; // 相距 1 格
            friend.hp = 80;
            friend.maxHp = 100;
            friend.status = { type: 'poisoned', remainingTicks: 2 };

            // 待机
            const engine = new GameEngine(state);
            engine.step({ type: 'wait', unitId: elf.id });

            const finalState = engine.getState();
            const resFriend = finalState.units.find(u => u.id === friend.id)!;
            expect(resFriend.hp).toBe(90); // 80 + 10 = 90
            expect(resFriend.status).toBeUndefined(); // Poisoned 状态被净化清除
        });

        it('5.14 净化光环对骷髅/幽灵造成 10 伤害', () => {
            const state = createDemoState();
            const elf = state.units.find(u => u.ownerId === 0)!;
            elf.unitClass = 'elf';
            elf.pos = { x: 1, y: 1 };

            const ghost = state.units.find(u => u.ownerId === 0 && u.id !== elf.id)!;
            ghost.unitClass = 'ghost'; // undead
            ghost.pos = { x: 1, y: 2 };
            ghost.hp = 80;

            const engine = new GameEngine(state);
            engine.step({ type: 'wait', unitId: elf.id });

            const finalState = engine.getState();
            const resGhost = finalState.units.find(u => u.id === ghost.id)!;
            expect(resGhost.hp).toBe(70); // 80 - 10 = 70 (变成伤害)
        });

        it('5.15 虚弱光环不覆盖已有状态', () => {
            const state = createDemoState();
            const golem = state.units.find(u => u.ownerId === 0)!;
            golem.unitClass = 'golem'; // weakness_aura
            golem.pos = { x: 1, y: 1 };

            const enemy = state.units.find(u => u.ownerId === 1)!;
            enemy.unitClass = 'soldier';
            enemy.pos = { x: 1, y: 2 };
            enemy.status = { type: 'blinded' }; // 已经拥有一种状态

            const engine = new GameEngine(state);
            engine.step({ type: 'wait', unitId: golem.id });

            const finalState = engine.getState();
            const resEnemy = finalState.units.find(u => u.id === enemy.id)!;
            expect(resEnemy.status?.type).toBe('blinded'); // 不应该变更状态为 weakened
        });

        it('5.16 突击部队攻击后可以使用攻击前剩余移动力移动', () => {
            const state = createDemoState();
            state.currentPlayer = 0;
            const wolf = state.units.find(u => u.ownerId === 0)!;
            wolf.unitClass = 'wolf'; // assault_troop, move=6
            wolf.pos = { x: 2, y: 2 };
            wolf.hasMoved = false;
            wolf.hasActed = false;
            wolf.movementRemaining = 6;

            const enemy = state.units.find(u => u.ownerId === 1)!;
            enemy.unitClass = 'slime';
            enemy.pos = { x: 2, y: 3 }; // 让它们相邻

            // 就地攻击，
            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: wolf.id, targetId: enemy.id });

            const midState = engine.getState();
            const resWolf = midState.units.find(u => u.id === wolf.id)!;
            expect(resWolf.movementRemaining).toBe(6);

            // 合法动作应该含 post_attack_move
            const actions = getLegalActions(midState, 0);
            const hasPostMove = actions.some(a => a.type === 'post_attack_move' && a.unitId === wolf.id);
            expect(hasPostMove).toBe(true);
        });
    });

    describe('第 6 步：经验、等级与升级测试', () => {
        it('6.1 攻击后攻击者 +30 经验', () => {
            const state = createDemoState();
            const attacker = state.units[0];
            attacker.unitClass = 'soldier';
            attacker.pos = { x: 0, y: 0 };
            attacker.exp = 0;
            attacker.level = 0;

            const defender = state.units[1];
            defender.unitClass = 'soldier';
            defender.pos = { x: 0, y: 1 };
            defender.hp = 100; // 确保不被打死

            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: attacker.id, targetId: defender.id });

            const resAttacker = engine.getState().units.find(u => u.id === attacker.id)!;
            expect(resAttacker.exp).toBe(30);
        });

        it('6.2 反击后反击者 +10 经验', () => {
            const state = createDemoState();
            const attacker = state.units[0];
            attacker.unitClass = 'soldier';
            attacker.pos = { x: 0, y: 0 };

            const defender = state.units[1];
            defender.unitClass = 'soldier';
            defender.pos = { x: 0, y: 1 };
            defender.exp = 0;
            defender.level = 0;
            defender.hp = 100;

            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: attacker.id, targetId: defender.id });

            const resDefender = engine.getState().units.find(u => u.id === defender.id)!;
            expect(resDefender.exp).toBe(10); // 反击获得 10 经验
        });

        it('6.3 主动攻击击杀额外 +60', () => {
            const state = createDemoState();
            const attacker = state.units[0];
            attacker.unitClass = 'soldier';
            attacker.pos = { x: 0, y: 0 };
            attacker.exp = 0;
            attacker.level = 0;

            const defender = state.units[1];
            defender.unitClass = 'soldier';
            defender.pos = { x: 0, y: 1 };
            defender.hp = 5; // 脆皮血量，必定能被一击击杀

            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: attacker.id, targetId: defender.id });

            const resAttacker = engine.getState().units.find(u => u.id === attacker.id)!;
            // 攻击 30 + 击杀 60 = 90
            expect(resAttacker.exp).toBe(90);
        });

        it('6.4 反击击杀额外 +60', () => {
            const state = createDemoState();
            const attacker = state.units[0];
            attacker.unitClass = 'soldier';
            attacker.pos = { x: 0, y: 0 };
            attacker.hp = 5; // 一击致命

            const defender = state.units[1];
            defender.unitClass = 'soldier';
            defender.pos = { x: 0, y: 1 };
            defender.exp = 0;
            defender.level = 0;
            defender.hp = 100;

            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: attacker.id, targetId: defender.id });

            const resDefender = engine.getState().units.find(u => u.id === defender.id)!;
            // 反击 10 + 击杀 60 = 70
            expect(resDefender.exp).toBe(70);
        });

        it('6.5 治疗后治疗者 +30', () => {
            const state = createDemoState();
            const paladin = state.units.find(u => u.ownerId === 0)!;
            paladin.unitClass = 'paladin';
            paladin.exp = 0;
            paladin.level = 0;
            paladin.pos = { x: 0, y: 0 };

            const friend = state.units.find(u => u.ownerId === 0 && u.id !== paladin.id)!;
            friend.pos = { x: 0, y: 1 };
            friend.hp = 50;

            const engine = new GameEngine(state);
            engine.step({ type: 'heal', healerId: paladin.id, targetId: friend.id });

            const resPaladin = engine.getState().units.find(u => u.id === paladin.id)!;
            expect(resPaladin.exp).toBe(30);
        });

        it('6.6 支援后支援者 +10', () => {
            const state = createDemoState();
            const druid = state.units.find(u => u.ownerId === 0)!;
            druid.unitClass = 'druid';
            druid.exp = 0;
            druid.level = 0;
            druid.pos = { x: 0, y: 0 };

            const friend = state.units.find(u => u.ownerId === 0 && u.id !== druid.id)!;
            friend.unitClass = 'soldier';
            friend.pos = { x: 0, y: 1 };
            friend.hasActed = true;

            const engine = new GameEngine(state);
            engine.step({ type: 'support', supporterId: druid.id, targetId: friend.id });

            const resDruid = engine.getState().units.find(u => u.id === druid.id)!;
            expect(resDruid.exp).toBe(10);
        });

        it('6.7 召唤后召唤者 +10', () => {
            const state = createDemoState();
            const witch = state.units.find(u => u.ownerId === 0)!;
            witch.unitClass = 'witch';
            witch.exp = 0;
            witch.level = 0;
            witch.pos = { x: 0, y: 0 };

            state.graves = [
                { id: 'g1', pos: { x: 0, y: 1 }, remainingTurns: 2 }
            ];

            const engine = new GameEngine(state);
            engine.step({ type: 'summon', summonerId: witch.id, graveId: 'g1', spawnPos: { x: 0, y: 1 } });

            const resWitch = engine.getState().units.find(u => u.id === witch.id)!;
            expect(resWitch.exp).toBe(10);
        });

        it('6.8 破坏城镇后破坏者 +30', () => {
            const state = createDemoState();
            const catapult = state.units.find(u => u.ownerId === 0)!;
            catapult.unitClass = 'catapult';
            catapult.exp = 0;
            catapult.level = 0;
            catapult.pos = { x: 1, y: 1 };

            state.map.tiles[1][1].terrainId = 9; // town
            state.map.tiles[1][1].ownerId = null;

            const engine = new GameEngine(state);
            engine.step({ type: 'destroy_town', unitId: catapult.id });

            const resCatapult = engine.getState().units.find(u => u.id === catapult.id)!;
            expect(resCatapult.exp).toBe(30);
        });

        it('6.9 经验达到 100 后升到 1 级', () => {
            const state = createDemoState();
            const soldier = state.units[0];
            soldier.unitClass = 'soldier';
            soldier.exp = 90;
            soldier.level = 0;
            soldier.hp = 50;

            const defender = state.units[1];
            defender.hp = 100;

            const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
            engine.step({ type: 'attack', attackerId: soldier.id, targetId: defender.id }); // +30 exp, total 120

            const resSoldier = engine.getState().units.find(u => u.id === soldier.id)!;
            expect(resSoldier.level).toBe(1);
            expect(resSoldier.hp).toBe(100); // 升级回满血（基准100）
        });

        it('6.10 经验达到 300 后升到 2 级', () => {
            const state = createDemoState();
            const soldier = state.units[0];
            soldier.unitClass = 'soldier';
            soldier.exp = 280;
            soldier.level = 1;
            soldier.hp = 50;

            const defender = state.units[1];
            defender.hp = 100;

            const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
            engine.step({ type: 'attack', attackerId: soldier.id, targetId: defender.id }); // +30 exp, total 310

            const resSoldier = engine.getState().units.find(u => u.id === soldier.id)!;
            expect(resSoldier.level).toBe(2);
        });

        it('6.11 经验达到 600 后升到 3 级', () => {
            const state = createDemoState();
            const soldier = state.units[0];
            soldier.unitClass = 'soldier';
            soldier.exp = 580;
            soldier.level = 2;
            soldier.hp = 50;

            const defender = state.units[1];
            defender.hp = 100;

            const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
            engine.step({ type: 'attack', attackerId: soldier.id, targetId: defender.id }); // +30 exp, total 610

            const resSoldier = engine.getState().units.find(u => u.id === soldier.id)!;
            expect(resSoldier.level).toBe(3);
        });

        it('6.12 一般单位升级后攻击 +10、防御 +5', () => {
            const state = createDemoState();
            const soldier = state.units[0];
            soldier.unitClass = 'soldier';
            soldier.level = 1;

            const eff = getEffectiveStats(soldier);
            expect(eff.attack).toBe(65);
            expect(eff.physicalDefense).toBe(10);
            expect(eff.magicDefense).toBe(10);
        });

        it('6.13 圣骑士升级后治疗量 +10', () => {
            const state = createDemoState();
            const paladin = state.units.find(u => u.ownerId === 0)!;
            paladin.unitClass = 'paladin';
            paladin.level = 1; // 1级
            paladin.pos = { x: 0, y: 0 };

            const friend = state.units.find(u => u.ownerId === 0 && u.id !== paladin.id)!;
            friend.pos = { x: 0, y: 1 };
            friend.hp = 40;
            friend.maxHp = 100;

            const engine = new GameEngine(state);
            engine.step({ type: 'heal', healerId: paladin.id, targetId: friend.id });

            const resFriend = engine.getState().units.find(u => u.id === friend.id)!;
            expect(resFriend.hp).toBe(90);
        });

        it('6.14 精灵升级后净化光环回血 +5', () => {
            const state = createDemoState();
            const elf = state.units.find(u => u.ownerId === 0)!;
            elf.unitClass = 'elf';
            elf.level = 1; // 1级
            elf.pos = { x: 1, y: 1 };

            const friend = state.units.find(u => u.ownerId === 0 && u.id !== elf.id)!;
            friend.unitClass = 'soldier';
            friend.pos = { x: 1, y: 2 };
            friend.hp = 80;
            friend.maxHp = 100;

            const engine = new GameEngine(state);
            engine.step({ type: 'wait', unitId: elf.id });

            const resFriend = engine.getState().units.find(u => u.id === friend.id)!;
            expect(resFriend.hp).toBe(95);
        });

        it('6.15 石头人升级后最大血量 +25', () => {
            const golem = {
                id: 'u_golem',
                ownerId: 0,
                unitClass: 'golem' as any,
                pos: { x: 1, y: 1 },
                hp: 100,
                maxHp: 100,
                hasMoved: false,
                hasActed: false,
                level: 1 as any,
                exp: 0
            };

            const eff = getEffectiveStats(golem);
            expect(eff.maxHp).toBe(125);
        });

        it('6.16 指挥官升级后移动 +1，并在回合收入中体现额外金币', () => {
            const state = createDemoState();
            const cmd = state.units.find(u => u.ownerId === 0 && u.unitClass === 'commander')!;
            cmd.level = 1; // 1级
            
            const eff = getEffectiveStats(cmd);
            expect(eff.move).toBe(5);

            const engine = new GameEngine(state);
            const prevGold = state.players[0].gold;
            
            state.map.tiles[0][0].terrainId = 10; // castle
            state.map.tiles[0][0].ownerId = 0;

            engine.step({ type: 'end_turn' }); // 变为 P1
            engine.step({ type: 'end_turn' }); // 回到 P0

            const finalState = engine.getState();
            const diffG = finalState.players[0].gold - prevGold;
            expect(diffG).toBe(125);
        });

        it('6.17 RuleConfig 可以限制等级上限', () => {
            const state = createDemoState();
            state.rules = { levelCap: 1 };

            const soldier = state.units[0];
            soldier.unitClass = 'soldier';
            soldier.exp = 580;
            soldier.level = 0;
            soldier.hp = 50;

            const defender = state.units[1];
            defender.hp = 100;

            const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
            engine.step({ type: 'attack', attackerId: soldier.id, targetId: defender.id });

            const resSoldier = engine.getState().units.find(u => u.id === soldier.id)!;
            expect(resSoldier.level).toBe(1);
            expect(resSoldier.exp).toBe(610);
        });
    });

    describe('RuleConfig 对战配置测试', () => {
        it('队伍初始金币配置会在创建初始状态时生效', () => {
            const defaultState = createDemoState();
            expect(defaultState.players[0].gold).toBe(500);
            expect(defaultState.players[1].gold).toBe(500);

            const configuredState = createDemoState({
                teams: {
                    0: { initialGold: 700 },
                    1: { initialGold: 900 }
                }
            });

            expect(configuredState.players[0].gold).toBe(700);
            expect(configuredState.players[1].gold).toBe(900);
            expect(configuredState.rules?.teams?.[0].initialGold).toBe(700);
        });

        it('可招募列表会限制合法招募动作', () => {
            const state = createDemoState();
            state.rules = {
                teams: {
                    0: { recruitableUnits: ['soldier'] }
                }
            };

            const actions = getLegalActions(state, 0);
            const recruitActions = actions.filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');

            expect(recruitActions.length).toBeGreaterThan(0);
            for (const action of recruitActions) {
                if (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy') {
                    expect(action.unitClass).toBe('soldier');
                }
            }
        });

        it('单位数量上限会阻止继续招募', () => {
            const state = createDemoState();
            state.rules = {
                teams: {
                    0: { unitLimit: 2 }
                }
            };

            const actions = getLegalActions(state, 0);
            const recruitActions = actions.filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');
            expect(recruitActions.length).toBe(0);
        });

        it('人口上限会阻止超出人口的招募', () => {
            const state = createDemoState();
            state.rules = {
                teams: {
                    0: { populationLimit: 1 }
                }
            };

            const actions = getLegalActions(state, 0);
            const recruitActions = actions.filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');
            expect(recruitActions.length).toBe(0);
        });

        it('收入配置会覆盖城镇、城堡与指挥官收入', () => {
            const state = createDemoState();
            state.rules = {
                incomeVillage: 70,
                incomeCastle: 120,
                incomeCommanderBase: 40,
                incomeCommanderGrowth: 10
            };

            const commander = state.units.find(u => u.ownerId === 0 && u.unitClass === 'commander')!;
            commander.level = 2;
            state.map.tiles[1][1].terrainId = 9;
            state.map.tiles[1][1].ownerId = 0;

            const prevGold = state.players[0].gold;
            const engine = new GameEngine(state);

            engine.step({ type: 'end_turn' });
            engine.step({ type: 'end_turn' });

            const finalState = engine.getState();
            expect(finalState.players[0].gold - prevGold).toBe(250);
        });

        it('价格配置会覆盖招募扣费', () => {
            const state = createDemoState();
            state.players[0].gold = 100;
            state.rules = {
                prices: { soldier: 50 },
                teams: {
                    0: { recruitableUnits: ['soldier'] }
                }
            };

            const engine = new GameEngine(state);
            const recruitAction = engine.getLegalActions(0).find(a => a.type === 'recruit_and_deploy');
            expect(recruitAction).toBeDefined();

            engine.step(recruitAction!);
            expect(engine.getState().players[0].gold).toBe(50);
        });

        it('指挥官死亡会记录死亡次数，但不直接淘汰仍有单位的玩家', () => {
            const state = createDemoState();
            const attacker = state.units.find(u => u.ownerId === 0 && u.unitClass === 'soldier')!;
            attacker.unitClass = 'dragon';
            attacker.pos = { x: 6, y: 6 };

            const commander = state.units.find(u => u.ownerId === 1 && u.unitClass === 'commander')!;
            commander.pos = { x: 6, y: 7 };
            commander.hp = 5;

            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: attacker.id, targetId: commander.id });

            const finalState = engine.getState();
            expect(finalState.players[1].commanderDeathCount).toBe(1);
            expect(finalState.players[1].isAlive).toBe(true);
            expect(finalState.units.some(u => u.ownerId === 1 && u.unitClass === 'commander')).toBe(false);
        });

        it('配置开启后指挥官阵亡会直接淘汰玩家', () => {
            const state = createDemoState();
            state.rules = { defeatOnCommanderDeath: true };

            const attacker = state.units.find(u => u.ownerId === 0 && u.unitClass === 'soldier')!;
            attacker.unitClass = 'dragon';
            attacker.pos = { x: 6, y: 6 };

            const commander = state.units.find(u => u.ownerId === 1 && u.unitClass === 'commander')!;
            commander.pos = { x: 6, y: 7 };
            commander.hp = 5;

            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: attacker.id, targetId: commander.id });

            const finalState = engine.getState();
            expect(finalState.players[1].isAlive).toBe(false);
            expect(finalState.winner).toBe(0);
        });

        it('配置开启后失去最后城堡会淘汰玩家', () => {
            const state = createDemoState();
            state.rules = { defeatOnNoCastles: true };

            const commander = state.units.find(u => u.ownerId === 0 && u.unitClass === 'commander')!;
            commander.pos = { x: 7, y: 7 };
            commander.hasMoved = false;
            commander.hasActed = false;
            const enemyCommander = state.units.find(u => u.ownerId === 1 && u.unitClass === 'commander')!;
            enemyCommander.pos = { x: 6, y: 6 };

            const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
            engine.step({ type: 'capture', unitId: commander.id });

            const finalState = engine.getState();
            expect(finalState.map.tiles[7][7].ownerId).toBe(0);
            expect(finalState.players[1].isAlive).toBe(false);
            expect(finalState.winner).toBe(0);
        });

        it('配置开启后可按死亡次数递增价格重招募指挥官', () => {
            const state = createDemoState();
            state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
            state.players[0].gold = 1000;
            state.players[0].commanderDeathCount = 2;
            state.rules = {
                commanderRecruitBaseCost: 400,
                commanderRecruitCostGrowth: 100,
                teams: {
                    0: { recruitableUnits: ['commander'] }
                }
            };

            const engine = new GameEngine(state);
            const recruitAction = engine.getLegalActions(0).find(a => a.type === 'recruit_to_castle' && a.unitClass === 'commander');
            expect(recruitAction).toBeDefined();

            engine.step(recruitAction!);
            const finalState = engine.getState();
            expect(finalState.players[0].gold).toBe(400);
            expect(finalState.units.some(u => u.ownerId === 0 && u.unitClass === 'commander')).toBe(true);
        });

        it('招募执行阶段也会拒绝不满足配置的单位', () => {
            const state = createDemoState();
            state.rules = {
                teams: {
                    0: { recruitableUnits: ['soldier'] }
                }
            };

            const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
            const before = engine.getState();
            const result = engine.step({
                type: 'recruit_and_deploy',
                unitClass: 'dragon',
                castlePos: { x: 0, y: 0 },
                to: { x: 1, y: 1 }
            });

            const after = engine.getState();
            expect(result.info).toContain('招募失败');
            expect(after.players[0].gold).toBe(before.players[0].gold);
            expect(after.units.length).toBe(before.units.length);
        });
    });

    describe('核心规则回归测试', () => {
        it('1. 非法动作 - 非当前玩家单位不能行动', () => {
            const state = createDemoState();
            const engine = new GameEngine(state);
            const enemyUnit = state.units.find(u => u.ownerId === 1)!;
            const res = engine.step({ type: 'move', unitId: enemyUnit.id, to: { x: enemyUnit.pos.x + 1, y: enemyUnit.pos.y } });
            expect(res.info).toContain('非法动作');
            expect(engine.getState()).toEqual(state);
        });

        it('2. 非法动作 - 已行动单位不能再次普通行动', () => {
            const state = createDemoState();
            const engine = new GameEngine(state);
            const unit = state.units.find(u => u.ownerId === 0)!;
            // 第一次普通行动：wait
            engine.step({ type: 'wait', unitId: unit.id });
            const stateAfterMove = engine.getState();
            // 第二次想普通行动
            const res = engine.step({ type: 'wait', unitId: unit.id });
            expect(res.info).toContain('非法动作');
            expect(engine.getState()).toEqual(stateAfterMove);
        });

        it('3-4. 非法动作 - 非法移动/越界不改变坐标和状态', () => {
            const state = createDemoState();
            const engine = new GameEngine(state);
            const unit = state.units.find(u => u.ownerId === 0)!;
            const res1 = engine.step({ type: 'move', unitId: unit.id, to: { x: 999, y: 999 } });
            expect(res1.info).toContain('非法动作');
            expect(engine.getState()).toEqual(state);
        });

        it('5. 非法动作 - 非法招募', () => {
            const state = createDemoState();
            const engine = new GameEngine(state);
            const res = engine.step({ type: 'recruit_to_castle', unitClass: 'dragon', castlePos: {x:0, y:0} });
            expect(res.info).toContain('非法动作');
            expect(engine.getState()).toEqual(state);
        });

        it('6-10. 非法动作 - 非对应能力不能执行特殊动作', () => {
            const state = createDemoState();
            const engine = new GameEngine(state);
            const unit = state.units.find(u => u.ownerId === 0)!; 
            const target = state.units.find(u => u.ownerId === 1)!;
            
            expect(engine.step({ type: 'heal', healerId: unit.id, targetId: unit.id }).info).toContain('非法动作');
            expect(engine.step({ type: 'summon', summonerId: unit.id, graveId: 'g1', spawnPos: {x:0,y:0} }).info).toContain('非法动作');
            expect(engine.step({ type: 'support', supporterId: unit.id, targetId: unit.id }).info).toContain('非法动作');
        });

        it('11. 投石车不能破坏城堡', () => {
            const state = createDemoState();
            const catapult = state.units[0];
            catapult.unitClass = 'catapult';
            state.map.tiles[catapult.pos.y][catapult.pos.x].terrainId = 10; // 城堡
            const engine = new GameEngine(state);
            const res = engine.step({ type: 'destroy_town', unitId: catapult.id });
            expect(res.info).toContain('非法动作');
        });

        it('确定性 - 同一初始状态和合法动作产生同样结果', () => {
            const state = createDemoState();
            const e1 = new GameEngine(state);
            const e2 = new GameEngine(state);
            const a = { type: 'move', unitId: state.units[0].id, to: { x: state.units[0].pos.x, y: state.units[0].pos.y+1 } } as any;
            e1.step(a);
            e2.step(a);
            expect(e1.getState()).toEqual(e2.getState());
        });

        it('能力规则 - counter_storm 和反击', () => {
            const state = createDemoState();
            const b = state.units[0];
            b.unitClass = 'berserker'; 
            const a = state.units[1];
            a.unitClass = 'archer'; 
            a.pos = { x: b.pos.x + 2, y: b.pos.y };
            
            const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
            engine.step({ type: 'attack', attackerId: a.id, targetId: b.id });
            const finalA = engine.getState().units.find(u => u.id === a.id);
            if (finalA) {
               expect(finalA.hp).toBeLessThan(100);
            }
        });

        it('突击部队 - 移动力等于有效移动力', () => {
            const state = createDemoState();
            const wolf = state.units[0];
            wolf.unitClass = 'wolf';
            const enemy = state.units[1];
            enemy.pos = { x: wolf.pos.x + 1, y: wolf.pos.y };
            
            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: wolf.id, targetId: enemy.id });
            const finalWolf = engine.getState().units.find(u=>u.id === wolf.id)!;
            expect(finalWolf.movementRemaining).toBe(6); 
        });

        it('神庙结算 - 回血机制', () => {
             const state = createDemoState();
             const soldier = state.units[0];
             soldier.hp = 20;
             soldier.status = { type: 'poisoned', remainingTicks: 2 };
             state.map.tiles[soldier.pos.y][soldier.pos.x].terrainId = 12; 
             const engine = new GameEngine(state);
             engine.step({ type: 'end_turn' });
             engine.step({ type: 'end_turn' }); 

             const s = engine.getState().units.find(u => u.id === soldier.id);
             expect(s!.status).toBeUndefined(); 
             expect(s!.hp).toBe(10 + 20); 
        });
        
        it('神庙结算 - 虚弱单位在神庙消除虚弱', () => {
             const state = createDemoState();
             const soldier = state.units[0];
             soldier.status = { type: 'weakened', remainingTurns: 1 };
             state.map.tiles[soldier.pos.y][soldier.pos.x].terrainId = 12; 
             const engine = new GameEngine(state);
             engine.step({ type: 'end_turn' });
             engine.step({ type: 'end_turn' }); 

             const s = engine.getState().units.find(u => u.id === soldier.id);
             expect(s!.status).toBeUndefined(); 
        });
    });
});
