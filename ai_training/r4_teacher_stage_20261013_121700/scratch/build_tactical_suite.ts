import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameEngine } from '../env/src/game/engine';
import { GameState, Unit, Action } from '../env/src/game/types';
import { createAppApkSkirmishGameState } from '../env/src/game/apk_skirmish_map_assets';
import { encodeAction } from '../env/src/game/env';
import { computeStateHash } from '../research/state_hash';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TacticalCase {
    id: string;
    category: string;
    title: string;
    description: string;
    isDiagnostic: boolean;
    state: GameState;
    stateHash: string;
    expectedActionCodes: string[];
    explanation: string;
}

function cloneState(s: GameState): GameState {
    return JSON.parse(JSON.stringify(s));
}

function setupCleanBoard(mapName: string = '(2) Duel.aem'): GameState {
    const s = createAppApkSkirmishGameState(mapName, 'SD');
    s.units = [];
    s.graves = [];
    s.pendingUnitId = undefined;
    return s;
}

function addUnit(
    state: GameState,
    id: string,
    ownerId: number,
    unitClass: any,
    x: number,
    y: number,
    hp: number = 100,
    hasActed: boolean = false,
    level: any = 0
): Unit {
    const u: Unit = {
        id,
        ownerId,
        unitClass,
        pos: { x, y },
        hp,
        maxHp: 100,
        level,
        exp: 0,
        hasActed,
        hasMoved: hasActed
    };
    state.units.push(u);
    return u;
}

function buildSuite(): TacticalCase[] {
    const cases: TacticalCase[] = [];

    // ==========================================
    // 类别 1: lethal_commander (斩首指挥官)
    // ==========================================
    for (let i = 1; i <= 3; i++) {
        const s = setupCleanBoard();
        s.currentPlayer = 0;
        const uAtk = addUnit(s, 'u_p0_atk', 0, 'archer', 4, 4, 100, false);
        const uTgt = addUnit(s, 'u_p1_cmd', 1, 'commander', 4, 6, 15, false);
        s.players[1].commanderId = 'u_p1_cmd';

        const atkCode = encodeAction({ type: 'attack', attackerId: uAtk.id, targetId: uTgt.id });
        cases.push({
            id: `tactical_lethal_cmd_${i}`,
            category: 'lethal_commander',
            title: `斩首指挥官案例 ${i}`,
            description: '敌方指挥官仅存微量生命，我方弓手应优先实施致命斩首',
            isDiagnostic: false,
            state: s,
            stateHash: computeStateHash(s),
            expectedActionCodes: [atkCode],
            explanation: '击杀敌方指挥官触发直接淘汰或大幅削弱'
        });
    }

    // ==========================================
    // 类别 2: lethal_castle (指挥官占领敌方城堡)
    // ==========================================
    for (let i = 1; i <= 3; i++) {
        const s = setupCleanBoard();
        s.currentPlayer = 0;
        // P1 城堡真实坐标为 (8, 8)
        const cPos = { x: 8, y: 8 };
        const uCmd = addUnit(s, 'u_p0_cmd', 0, 'commander', cPos.x, cPos.y, 100, false);
        s.players[0].commanderId = 'u_p0_cmd';
        const capCode = encodeAction({ type: 'capture', unitId: uCmd.id });

        cases.push({
            id: `tactical_lethal_castle_${i}`,
            category: 'lethal_castle',
            title: `城堡占领案例 ${i}`,
            description: '我方指挥官已踏入敌方城堡，应立即执行 capture 占领城堡',
            isDiagnostic: false,
            state: s,
            stateHash: computeStateHash(s),
            expectedActionCodes: [capCode],
            explanation: '占领城堡直接剥夺敌军基地招募'
        });
    }

    // ==========================================
    // 类别 3: heal_priority (圣骑士治疗核心)
    // ==========================================
    for (let i = 1; i <= 3; i++) {
        const s = setupCleanBoard();
        s.currentPlayer = 0;
        const uCmd = addUnit(s, 'u_p0_cmd', 0, 'commander', 5, 5, 20, false);
        s.players[0].commanderId = 'u_p0_cmd';
        const uPaladin = addUnit(s, 'u_p0_healer', 0, 'paladin', 5, 6, 100, false);
        const healCode = encodeAction({ type: 'heal', healerId: uPaladin.id, targetId: uCmd.id });

        cases.push({
            id: `tactical_heal_${i}`,
            category: 'heal_priority',
            title: `紧急治疗保护核心 ${i}`,
            description: '我方指挥官生命垂危，圣骑士应立即施加治疗保核',
            isDiagnostic: false,
            state: s,
            stateHash: computeStateHash(s),
            expectedActionCodes: [healCode],
            explanation: '保全指挥官避免崩盘'
        });
    }

    // ==========================================
    // 类别 4: summon_meatshield (女巫墓碑召唤骷髅)
    // ==========================================
    for (let i = 1; i <= 3; i++) {
        const s = setupCleanBoard();
        s.currentPlayer = 0;
        const uWitch = addUnit(s, 'u_p0_witch', 0, 'witch', 4, 4, 100, false);
        s.graves = [{ id: 'g_1', pos: { x: 4, y: 5 }, remainingTurns: 1, ownerId: 1 }];
        const sumCode = encodeAction({ type: 'summon', summonerId: uWitch.id, graveId: 'g_1', spawnPos: { x: 4, y: 5 } });

        cases.push({
            id: `tactical_summon_${i}`,
            category: 'summon_meatshield',
            title: `墓碑召唤骷髅 ${i}`,
            description: '女巫利用邻近墓碑召唤骷髅充当肉盾',
            isDiagnostic: false,
            state: s,
            stateHash: computeStateHash(s),
            expectedActionCodes: [sumCode],
            explanation: '转化墓碑为兵力并卡位'
        });
    }

    // ==========================================
    // 类别 5: body_block (卡位阻挡)
    // ==========================================
    for (let i = 1; i <= 3; i++) {
        const s = setupCleanBoard();
        s.currentPlayer = 0;
        const uSoldier = addUnit(s, 'u_p0_blocker', 0, 'soldier', 4, 5, 100, false);
        addUnit(s, 'u_p1_rush', 1, 'wolf', 4, 7, 100, false);
        const moveCode = encodeAction({ type: 'move', unitId: uSoldier.id, to: { x: 4, y: 6 } });

        cases.push({
            id: `tactical_body_block_${i}`,
            category: 'body_block',
            title: `关键峡口卡位 ${i}`,
            description: '步兵移至隘口阻断敌方恶狼突进我方后排',
            isDiagnostic: true,
            state: s,
            stateHash: computeStateHash(s),
            expectedActionCodes: [moveCode],
            explanation: '利用占位阻挡敌方突进'
        });
    }

    // ==========================================
    // 类别 6: blind_disruption (黑魔法师致盲打击)
    // ==========================================
    for (let i = 1; i <= 3; i++) {
        const s = setupCleanBoard();
        s.currentPlayer = 0;
        // dark_mage 具备 blinder 能力
        const uMage = addUnit(s, 'u_p0_mage', 0, 'dark_mage', 4, 4, 100, false);
        const uEnemyDragon = addUnit(s, 'u_p1_dragon', 1, 'dragon', 4, 6, 100, false);
        const atkCode = encodeAction({ type: 'attack', attackerId: uMage.id, targetId: uEnemyDragon.id });

        cases.push({
            id: `tactical_blind_${i}`,
            category: 'blind_disruption',
            title: `黑魔法致盲打击 ${i}`,
            description: '黑魔法师远程打击巨龙并附加致盲状态',
            isDiagnostic: false,
            state: s,
            stateHash: computeStateHash(s),
            expectedActionCodes: [atkCode],
            explanation: '致盲削弱敌方高机动巨龙'
        });
    }

    // ==========================================
    // 类别 7: focus_fire (集火输出)
    // ==========================================
    for (let i = 1; i <= 3; i++) {
        const s = setupCleanBoard();
        s.currentPlayer = 0;
        const uA1 = addUnit(s, 'u_p0_a1', 0, 'archer', 3, 4, 100, false);
        const uTarget = addUnit(s, 'u_p1_golem', 1, 'golem', 3, 6, 30, false);
        const atkCode = encodeAction({ type: 'attack', attackerId: uA1.id, targetId: uTarget.id });

        cases.push({
            id: `tactical_focus_fire_${i}`,
            category: 'focus_fire',
            title: `集火残血石人 ${i}`,
            description: '残血高防御石人应优先集火击杀，避免下回合反击',
            isDiagnostic: false,
            state: s,
            stateHash: computeStateHash(s),
            expectedActionCodes: [atkCode],
            explanation: '消灭高护甲单位'
        });
    }

    // ==========================================
    // 类别 8: economy_capture (村庄/城镇占领)
    // ==========================================
    for (let i = 1; i <= 3; i++) {
        const s = setupCleanBoard();
        s.currentPlayer = 0;
        // 中立城镇真实坐标为 (8, 4)
        const tPos = { x: 8, y: 4 };
        const uSoldier = addUnit(s, 'u_p0_eco', 0, 'soldier', tPos.x, tPos.y, 100, false);
        const capCode = encodeAction({ type: 'capture', unitId: uSoldier.id });

        cases.push({
            id: `tactical_economy_${i}`,
            category: 'economy_capture',
            title: `城镇经济占领 ${i}`,
            description: '步兵占领中立城镇以增加金币收入',
            isDiagnostic: false,
            state: s,
            stateHash: computeStateHash(s),
            expectedActionCodes: [capCode],
            explanation: '占领中立城镇提升长期经济'
        });
    }

    // ==========================================
    // 类别 9: town_repair_defense (受损据点修复)
    // ==========================================
    for (let i = 1; i <= 3; i++) {
        const s = setupCleanBoard();
        s.currentPlayer = 0;
        // 受损城镇真实坐标为 (6, 4)
        const tPos = { x: 6, y: 4 };
        const uSoldier = addUnit(s, 'u_p0_rep', 0, 'soldier', tPos.x, tPos.y, 100, false);
        const repCode = encodeAction({ type: 'repair', unitId: uSoldier.id });

        cases.push({
            id: `tactical_repair_${i}`,
            category: 'town_repair_defense',
            title: `受损据点修复 ${i}`,
            description: '步兵修复受损城镇以恢复防御加成与收益',
            isDiagnostic: false,
            state: s,
            stateHash: computeStateHash(s),
            expectedActionCodes: [repCode],
            explanation: '修复城镇恢复收入与防御加成'
        });
    }

    // ==========================================
    // 类别 10: range_kite (长程白嫖风筝)
    // ==========================================
    for (let i = 1; i <= 3; i++) {
        const s = setupCleanBoard();
        s.currentPlayer = 0;
        const uArcher = addUnit(s, 'u_p0_kite', 0, 'archer', 5, 5, 100, false);
        const uEnemySoldier = addUnit(s, 'u_p1_melee', 1, 'soldier', 5, 7, 80, false);
        const atkCode = encodeAction({ type: 'attack', attackerId: uArcher.id, targetId: uEnemySoldier.id });

        cases.push({
            id: `tactical_range_kite_${i}`,
            category: 'range_kite',
            title: `长程白嫖攻击 ${i}`,
            description: '弓手利用距离 2 的射程优势无损攻击敌方近战单位',
            isDiagnostic: false,
            state: s,
            stateHash: computeStateHash(s),
            expectedActionCodes: [atkCode],
            explanation: '避免反击伤害同时消耗敌方生命'
        });
    }

    // ==========================================
    // 类别 11: water_mobility (两栖人鱼水面机动)
    // ==========================================
    for (let i = 1; i <= 3; i++) {
        const s = setupCleanBoard('(2) Swamplands.aem');
        s.currentPlayer = 0;
        const uMermaid = addUnit(s, 'u_p0_water', 0, 'mermaid', 2, 2, 100, false);
        const uTarget = addUnit(s, 'u_p1_land', 1, 'soldier', 2, 3, 40, false);
        const atkCode = encodeAction({ type: 'attack', attackerId: uMermaid.id, targetId: uTarget.id });

        cases.push({
            id: `tactical_water_mob_${i}`,
            category: 'water_mobility',
            title: `人鱼水域突袭 ${i}`,
            description: '人鱼水域机动消耗低，越过水面迅速打击岸边残血敌军',
            isDiagnostic: false,
            state: s,
            stateHash: computeStateHash(s),
            expectedActionCodes: [atkCode],
            explanation: '利用水之子地形优势跨越水阻'
        });
    }

    // ==========================================
    // 类别 12: castle_reinforcement (城堡招募对策)
    // ==========================================
    for (let i = 1; i <= 3; i++) {
        const s = setupCleanBoard();
        s.currentPlayer = 0;
        s.players[0].gold = 300;
        let cPos = { x: 4, y: 4 };
        for (let y = 0; y < s.map.height; y++) {
            for (let x = 0; x < s.map.width; x++) {
                if (s.map.tiles[y][x].terrainId === 'castle' && s.map.tiles[y][x].ownerId === 0) {
                    cPos = { x, y };
                    break;
                }
            }
        }
        addUnit(s, 'u_p1_dragon_fly', 1, 'dragon', cPos.x + 3, cPos.y, 100, false);
        const recCode = encodeAction({ type: 'recruit_to_castle', unitClass: 'archer', castlePos: cPos });

        cases.push({
            id: `tactical_recruit_counter_${i}`,
            category: 'castle_reinforcement',
            title: `城堡克制兵种招募 ${i}`,
            description: '敌方有飞行单位逼近，城堡应招募对空克制的射手单位',
            isDiagnostic: true,
            state: s,
            stateHash: computeStateHash(s),
            expectedActionCodes: [recCode],
            explanation: '招募克制兵种抵挡敌方进攻'
        });
    }

    // ==========================================
    // 类别 13: tactical_retreat (残血后撤保全)
    // ==========================================
    for (let i = 1; i <= 3; i++) {
        const s = setupCleanBoard();
        s.currentPlayer = 0;
        const uKnight = addUnit(s, 'u_p0_hurt', 0, 'wolf', 5, 5, 15, false);
        addUnit(s, 'u_p1_foe1', 1, 'soldier', 5, 6, 100, false);
        addUnit(s, 'u_p1_foe2', 1, 'soldier', 6, 5, 100, false);
        const retreatCode = encodeAction({ type: 'move', unitId: uKnight.id, to: { x: 4, y: 4 } });

        cases.push({
            id: `tactical_retreat_${i}`,
            category: 'tactical_retreat',
            title: `濒死核心撤退保全 ${i}`,
            description: '狼仅存 15 生命且被敌军包夹，应迅速后撤脱离攻击范围',
            isDiagnostic: true,
            state: s,
            stateHash: computeStateHash(s),
            expectedActionCodes: [retreatCode],
            explanation: '保存高成本战力'
        });
    }

    // ==========================================
    // 类别 14: grave_denial (踏踩墓碑消除)
    // ==========================================
    for (let i = 1; i <= 3; i++) {
        const s = setupCleanBoard();
        s.currentPlayer = 0;
        s.graves = [{ id: 'g_deny', pos: { x: 4, y: 5 }, remainingTurns: 1, ownerId: 1 }];
        const uSoldier = addUnit(s, 'u_p0_walker', 0, 'soldier', 4, 4, 100, false);
        addUnit(s, 'u_p1_witch', 1, 'witch', 4, 7, 100, false);
        const stepGraveCode = encodeAction({ type: 'move', unitId: uSoldier.id, to: { x: 4, y: 5 } });

        cases.push({
            id: `tactical_grave_denial_${i}`,
            category: 'grave_denial',
            title: `踏踩敌方墓碑消除隐患 ${i}`,
            description: '步兵进入敌方墓碑格受轻微伤害但彻底剥夺敌方女巫召唤资源',
            isDiagnostic: true,
            state: s,
            stateHash: computeStateHash(s),
            expectedActionCodes: [stepGraveCode],
            explanation: '压制敌方亡灵战术资源'
        });
    }

    // ==========================================
    // 类别 15: level_advantage (等级优势碾压)
    // ==========================================
    for (let i = 1; i <= 2; i++) {
        const s = setupCleanBoard();
        s.currentPlayer = 0;
        const uVeteran = addUnit(s, 'u_p0_veteran', 0, 'soldier', 5, 5, 100, false, 3);
        const uTarget = addUnit(s, 'u_p1_rookie', 1, 'soldier', 5, 6, 50, false, 0);
        const atkCode = encodeAction({ type: 'attack', attackerId: uVeteran.id, targetId: uTarget.id });

        cases.push({
            id: `tactical_level_adv_${i}`,
            category: 'level_advantage',
            title: `高级老兵强攻碾压 ${i}`,
            description: '3 级满级士兵凭借高攻防直接斩杀敌方前哨',
            isDiagnostic: false,
            state: s,
            stateHash: computeStateHash(s),
            expectedActionCodes: [atkCode],
            explanation: '发挥等级优势快速建立兵力差'
        });
    }

    return cases;
}

const suite = buildSuite();
console.log(`Generated tactical cases total: ${suite.length}`);

// 验证每个案例在 GameEngine 中动作确实合法！
let allValid = true;
for (const tc of suite) {
    const engine = new GameEngine(cloneState(tc.state));
    const legal = engine.getLegalActions(tc.state.currentPlayer);
    const legalCodes = legal.map(encodeAction);
    for (const exp of tc.expectedActionCodes) {
        if (!legalCodes.includes(exp)) {
            console.error(`Case ${tc.id} expected action ${exp} is NOT in legal actions:`, legalCodes);
            allValid = false;
        }
    }
}

if (!allValid) {
    console.error('Tactical suite validation FAILED!');
    process.exit(1);
}

const outDir = path.resolve(__dirname, '../eval');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'tactical_suite.json');
fs.writeFileSync(outFile, JSON.stringify(suite, null, 2), 'utf-8');
console.log(`Saved ${suite.length} verified tactical cases to ${outFile}`);
