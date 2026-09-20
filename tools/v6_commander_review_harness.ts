/**
 * AncientEmpires V6 指挥官重招募专项执行工具 (C60 - C62)
 *
 * 包含：
 * C60: 资产盘点、策略/模型矩阵、预算初始化、失败快照捕获
 * C61: 规则全生命周期验证 (CR01-CR16) 与 入口审计
 * C62: 4层决策漏斗分析与旧策略基线评测
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { GameEngine } from '../src/game/engine';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { createDemoState } from '../src/game/demo_map';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import {
    getUnitCost,
    isCommanderUnit,
    canRecruitUnitClass,
    getRecruitableUnits,
    getRuleConfig
} from '../src/game/rule_config';
import { UNIT_CONFIGS } from '../src/game/constants';
import { getLegalActions, calculateDamage } from '../src/game/rules';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { RandomAI } from '../src/game/ai/random_ai';
import { getAiAction, type SupportedAiPolicy } from '../src/game/ai/neural_ai_adapter';
import { getSpatialAiActionSync } from '../src/game/ai/spatial_neural_adapter';
import { explainCommanderRecruitment, computeStateHash, computeRulesHash } from '../src/game/ai/commander_diagnostics';
import { loadDualHeadModelFromJson, predictDecision, type DualHeadNet } from './skirmish_dual_head_net';
import { encodeGameState, encodeGameActionV2 } from './skirmish_network_features';
import { decodeAction } from '../src/game/env';
import type { Action, GameState, Position, Unit } from '../src/game/types';

const RUN_ID = 'agent_upgrade_20260921_v6_01';
const REPORT_DIR = path.resolve(`docs/training/reports/${RUN_ID}`);
const RUN_DIR = path.resolve(`training_runs/${RUN_ID}`);

function ensureDirs() {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.mkdirSync(path.join(RUN_DIR, 'checkpoints'), { recursive: true });
    fs.mkdirSync(path.join(RUN_DIR, 'datasets'), { recursive: true });
    fs.mkdirSync(path.join(RUN_DIR, 'telemetry'), { recursive: true });
    fs.mkdirSync(path.join(RUN_DIR, 'evaluations'), { recursive: true });
    fs.mkdirSync(path.join(RUN_DIR, 'manifests'), { recursive: true });
}

function sha256File(filePath: string): string {
    if (!fs.existsSync(filePath)) return 'FILE_NOT_FOUND';
    const content = fs.readFileSync(filePath);
    return createHash('sha256').update(content).digest('hex');
}

// ==========================================
// C60: 资产盘点与登记
// ==========================================
export function runC60Inventory() {
    console.log('[C60] Running Inventory and Policy/Model Registration...');
    const modelPaths = [
        { id: 'BC_sd_bc_v3', file: 'training_runs/models/sd-bc-v3-20260918-011742.json', family: 'linear_bc_ranker' },
        { id: 'NET_A_dual_head', file: 'training_runs/models/net_a_checkpoint.json', family: 'dual_head_mlp' },
        { id: 'NET_B_dual_head_run', file: 'training_runs/models/net_b_checkpoint.json', family: 'dual_head_mlp' },
        { id: 'NET_B_dual_head_src', file: 'src/game/ai/models/net_b_checkpoint.json', family: 'dual_head_mlp' },
        { id: 'Spatial_ResNet_run_v1', file: 'training_runs/models/spatial_resnet_checkpoint.json', family: 'spatial_resnet' },
        { id: 'Spatial_ResNet_scaled_run', file: 'training_runs/models/spatial_resnet_scaled_checkpoint.json', family: 'spatial_resnet' },
        { id: 'Spatial_ResNet_src', file: 'src/game/ai/models/spatial_resnet_checkpoint.json', family: 'spatial_resnet' },
    ];

    const inventoryModels = modelPaths.map(m => {
        const fullPath = path.resolve(m.file);
        const exists = fs.existsSync(fullPath);
        const stat = exists ? fs.statSync(fullPath) : null;
        const hash = exists ? sha256File(fullPath) : null;
        return {
            modelId: m.id,
            family: m.family,
            relativePath: m.file,
            exists,
            sizeBytes: stat?.size ?? 0,
            sha256: hash
        };
    });

    const inventory = {
        schemaVersion: '6.0.0',
        runId: RUN_ID,
        timestamp: new Date().toISOString(),
        git: {
            branch: 'path-b-spatial-ai',
            baseCommit: 'a0a9dcdd483cb951a72734805504c947176d5d79',
            qwenBaseline: '85a87a0edb64de18a8b8eced9226ffb1cd1b48e9'
        },
        runtimeEnvironment: {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch
        },
        models: inventoryModels
    };

    fs.writeFileSync(path.join(REPORT_DIR, 'inventory.json'), JSON.stringify(inventory, null, 2));

    const policyModelMatrix = {
        schemaVersion: '6.0.0',
        runId: RUN_ID,
        timestamp: new Date().toISOString(),
        policies: [
            {
                policyId: 'heuristic',
                trainingStatus: 'NOT_APPLICABLE',
                modelId: null,
                sharedWith: [],
                evaluationArm: 'fixed_baseline'
            },
            {
                policyId: 'random',
                trainingStatus: 'NOT_APPLICABLE',
                modelId: null,
                sharedWith: [],
                evaluationArm: 'lower_bound'
            },
            {
                policyId: 's00',
                trainingStatus: 'NOT_APPLICABLE',
                modelId: null,
                sharedWith: [],
                evaluationArm: 'heuristic_search_baseline'
            },
            {
                policyId: 'bc_sd_v3',
                trainingStatus: 'RETRAIN_REQUIRED',
                modelId: 'BC_sd_bc_v3',
                sharedWith: ['bc_blend', 'bc_endgame'],
                evaluationArm: 'bc_linear_ranker'
            },
            {
                policyId: 'net_a_1ply',
                trainingStatus: 'RETRAIN_REQUIRED',
                modelId: 'NET_A_dual_head',
                sharedWith: [],
                evaluationArm: 'dual_head_net_a_1ply'
            },
            {
                policyId: 'net_b_1ply',
                trainingStatus: 'RETRAIN_REQUIRED',
                modelId: 'NET_B_dual_head_src',
                sharedWith: ['net_b_s10'],
                evaluationArm: 'dual_head_net_b_1ply'
            },
            {
                policyId: 'net_b_s10',
                trainingStatus: 'SHARED_WEIGHTS_TRAIN_ONCE',
                modelId: 'NET_B_dual_head_src',
                sharedWith: ['net_b_1ply'],
                evaluationArm: 'dual_head_net_b_s10_search'
            },
            {
                policyId: 'spatial_resnet_v1',
                trainingStatus: 'RETRAIN_REQUIRED',
                modelId: 'Spatial_ResNet_src',
                sharedWith: ['spatial_resnet_scaled'],
                evaluationArm: 'spatial_conv_resnet_1ply'
            }
        ]
    };

    fs.writeFileSync(path.join(REPORT_DIR, 'policy-model-matrix.json'), JSON.stringify(policyModelMatrix, null, 2));

    // 初始化 Budget
    const budget = {
        schemaVersion: '6.0.0',
        runId: RUN_ID,
        allocated: {
            formalFits: 16,
            newGamesCap: 1024,
            finalGamesReserve: 128,
            labelQueriesCap: 10000,
            probeCap: 2000,
            wallSecondsCap: 28800
        },
        consumed: {
            formalFits: 0,
            newGames: 0,
            labelQueries: 0,
            probeQueries: 0,
            wallSeconds: 0
        },
        status: 'INITIALIZED'
    };
    fs.writeFileSync(path.join(REPORT_DIR, 'budget.json'), JSON.stringify(budget, null, 2));

    const ledgerEntry = {
        timestamp: new Date().toISOString(),
        action: 'INIT_BUDGET',
        runId: RUN_ID,
        details: 'Budget initialized according to V6 Taskbook section 14'
    };
    fs.writeFileSync(path.join(REPORT_DIR, 'budget-ledger.jsonl'), JSON.stringify(ledgerEntry) + '\n');

    console.log('[C60] Inventory and Budget initialized successfully.');
}

// ==========================================
// C61: 规则全生命周期验证 (CR01 - CR16)
// ==========================================
export function runC61RuleAudit(): any {
    console.log('[C61] Running Complete Rule Lifecycle Audit (CR01-CR16)...');
    const results: Record<string, any> = {};

    // CR01: SD 首次真实死亡后重新招募 (价格 500, 扣费, pending, 存活)
    (() => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        state.players[0].gold = 600;
        state.units.find(u => u.ownerId === 0 && u.unitClass === 'commander')!.hp = 1;
        state.units.find(u => u.ownerId === 1 && u.unitClass === 'soldier')!.pos = { x: 0, y: 1 };

        const engine = new GameEngine(state);
        // P0 结束回合，轮到 P1
        engine.step({ type: 'end_turn' });

        // P1 攻击 P0 指挥官并将其击杀
        const p1AttackerId = engine.getState().units.find(u => u.ownerId === 1 && u.unitClass === 'soldier')!.id;
        const p0CommId = engine.getState().units.find(u => u.ownerId === 0 && u.unitClass === 'commander')!.id;
        engine.step({
            type: 'attack',
            attackerId: p1AttackerId,
            targetId: p0CommId
        });

        // 验证死亡被记录
        const deathCountAfterKill = engine.getState().players[0].commanderDeathCount;
        const priceP0 = getUnitCost(engine.getState(), 0, 'commander');

        // P1 结束回合，轮到 P0
        engine.step({ type: 'end_turn' });

        const canRecruit1 = canRecruitUnitClass(engine.getState(), 0, 'commander');
        const preGold = engine.getState().players[0].gold;
        // P0 在空城堡 (0,0) 执行招募
        engine.step({
            type: 'recruit_to_castle',
            castlePos: { x: 0, y: 0 },
            unitClass: 'commander'
        });
        const postGold = engine.getState().players[0].gold;

        // 处理 pending
        if (engine.getState().pendingUnitId) {
            engine.step({ type: 'wait', unitId: engine.getState().pendingUnitId! });
        }

        const newComm = engine.getState().units.find(u => u.ownerId === 0 && u.unitClass === 'commander' && u.hp > 0);

        results['CR01'] = {
            id: 'CR01',
            name: 'SD首次真实死亡后重新招募',
            pass: deathCountAfterKill === 1 && priceP0 === 500 && canRecruit1 && (preGold - postGold === 500) && !!newComm && !engine.getState().pendingUnitId,
            deathCount: deathCountAfterKill,
            price: priceP0,
            deducted: preGold - postGold,
            newCommanderAlive: !!newComm
        };
    })();

    // CR02: SD 第二次及第三次死亡 (价格 600, 700)
    (() => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        state.players[0].gold = 3000;
        state.units.find(u => u.ownerId === 0 && u.unitClass === 'commander')!.hp = 1;
        state.units.find(u => u.ownerId === 1 && u.unitClass === 'soldier')!.pos = { x: 0, y: 1 };

        const engine = new GameEngine(state);

        // 第一次死亡
        engine.step({ type: 'end_turn' });
        const p1SoldierId = engine.getState().units.find(u => u.ownerId === 1 && u.unitClass === 'soldier')!.id;
        const c1Id = engine.getState().units.find(u => u.ownerId === 0 && u.unitClass === 'commander')!.id;
        engine.step({ type: 'attack', attackerId: p1SoldierId, targetId: c1Id });
        engine.step({ type: 'end_turn' }); // 回到 P0

        // P0 重招募 (500)
        engine.step({ type: 'recruit_to_castle', castlePos: { x: 0, y: 0 }, unitClass: 'commander' });
        if (engine.getState().pendingUnitId) engine.step({ type: 'wait', unitId: engine.getState().pendingUnitId! });

        // 第二次死亡 (白盒设置 hp: 1 并由合法攻击击杀)
        (engine as any).state.units.find((u: any) => u.ownerId === 0 && u.unitClass === 'commander')!.hp = 1;
        engine.step({ type: 'end_turn' }); // P1
        const p1Attacker2 = engine.getState().units.find(u => u.ownerId === 1 && u.unitClass === 'soldier')!;
        const c2 = engine.getState().units.find(u => u.ownerId === 0 && u.unitClass === 'commander')!;
        engine.step({ type: 'attack', attackerId: p1Attacker2.id, targetId: c2.id });
        const priceAfter2Deaths = getUnitCost(engine.getState(), 0, 'commander'); // 400 + 2 * 100 = 600
        engine.step({ type: 'end_turn' }); // P0

        engine.step({ type: 'recruit_to_castle', castlePos: { x: 0, y: 0 }, unitClass: 'commander' });
        if (engine.getState().pendingUnitId) engine.step({ type: 'wait', unitId: engine.getState().pendingUnitId! });

        // 第三次死亡 (白盒设置 hp: 1 并由合法攻击击杀)
        (engine as any).state.units.find((u: any) => u.ownerId === 0 && u.unitClass === 'commander')!.hp = 1;
        engine.step({ type: 'end_turn' }); // P1
        const p1Attacker3 = engine.getState().units.find(u => u.ownerId === 1 && u.unitClass === 'soldier')!;
        const c3 = engine.getState().units.find(u => u.ownerId === 0 && u.unitClass === 'commander')!;
        engine.step({ type: 'attack', attackerId: p1Attacker3.id, targetId: c3.id });
        const priceAfter3Deaths = getUnitCost(engine.getState(), 0, 'commander'); // 400 + 3 * 100 = 700

        results['CR02'] = {
            id: 'CR02',
            name: 'SD第二及第三次死亡',
            pass: priceAfter2Deaths === 600 && priceAfter3Deaths === 700 && engine.getState().players[0].commanderDeathCount === 3,
            priceAfter2Deaths,
            priceAfter3Deaths,
            deathCount: engine.getState().players[0].commanderDeathCount
        };
    })();

    // CR03: 差 1 金币 (499 vs 500)
    (() => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].commanderDeathCount = 1;
        state.players[0].gold = 499;

        const can = canRecruitUnitClass(state, 0, 'commander');
        const legal = getLegalActions(state, 0).filter(a => (a as any).unitClass === 'commander');

        results['CR03'] = {
            id: 'CR03',
            name: '差1金币',
            pass: !can && legal.length === 0,
            canRecruit: can,
            legalActionsCount: legal.length
        };
    })();

    // CR04: 恰好费用 (500 vs 500)
    (() => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].commanderDeathCount = 1;
        state.players[0].gold = 500;

        const can = canRecruitUnitClass(state, 0, 'commander');
        const legal = getLegalActions(state, 0).filter(a => (a as any).unitClass === 'commander');

        results['CR04'] = {
            id: 'CR04',
            name: '恰好费用',
            pass: can && legal.length > 0,
            canRecruit: can,
            legalActionsCount: legal.length
        };
    })();

    // CR05: 已有存活指挥官
    (() => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        state.players[0].gold = 2000;

        const can = canRecruitUnitClass(state, 0, 'commander');
        const legal = getLegalActions(state, 0).filter(a => (a as any).unitClass === 'commander');

        results['CR05'] = {
            id: 'CR05',
            name: '已有指挥官',
            pass: !can && legal.length === 0,
            canRecruit: can,
            legalActionsCount: legal.length
        };
    })();

    // CR06: pending指挥官
    (() => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].commanderDeathCount = 1;
        state.players[0].gold = 2000;

        const engine = new GameEngine(state);
        engine.step({ type: 'recruit_to_castle', castlePos: { x: 0, y: 0 }, unitClass: 'commander' });
        // 处于 pending 状态
        const isPending = Boolean(engine.getState().pendingUnitId);
        const legalWhilePending = getLegalActions(engine.getState(), 0).filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');

        results['CR06'] = {
            id: 'CR06',
            name: 'pending指挥官',
            pass: isPending && legalWhilePending.length === 0,
            isPending,
            legalRecruitsWhilePending: legalWhilePending.length
        };
    })();

    // CR07: 普通己军占城堡 (腾位前 vs 腾位后)
    (() => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].commanderDeathCount = 1;
        state.players[0].gold = 1000;

        // 己方 soldier 站在城堡 (0,0)
        const soldier = state.units.find(u => u.ownerId === 0 && u.unitClass === 'soldier')!;
        soldier.pos = { x: 0, y: 0 };

        const engine = new GameEngine(state);
        const legalBefore = getLegalActions(engine.getState(), 0).filter(a => (a as any).unitClass === 'commander');
        // 移开 soldier 到未被占据的 (0,1)
        engine.step({ type: 'move', unitId: soldier.id, to: { x: 0, y: 1 } });
        engine.step({ type: 'wait', unitId: soldier.id });
        const legalAfter = getLegalActions(engine.getState(), 0).filter(a => (a as any).unitClass === 'commander');

        results['CR07'] = {
            id: 'CR07',
            name: '普通己军占城堡',
            pass: legalBefore.length === 0 && legalAfter.length > 0,
            legalBefore: legalBefore.length,
            legalAfter: legalAfter.length
        };
    })();

    // CR08: 敌军占城堡
    (() => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].commanderDeathCount = 1;
        state.players[0].gold = 1000;

        // 敌军 soldier 站在 (0,0)
        const enemySoldier = state.units.find(u => u.ownerId === 1 && u.unitClass === 'soldier')!;
        enemySoldier.pos = { x: 0, y: 0 };

        const legal = getLegalActions(state, 0).filter(a => (a as any).unitClass === 'commander');
        results['CR08'] = {
            id: 'CR08',
            name: '敌军占城堡',
            pass: legal.length === 0,
            legalCount: legal.length
        };
    })();

    // CR09: 没有己方城堡
    (() => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].commanderDeathCount = 1;
        state.players[0].gold = 1000;
        // 把己方城堡改归中立或敌方
        state.map.tiles[0][0].ownerId = null;

        const legal = getLegalActions(state, 0).filter(a => (a as any).unitClass === 'commander');
        results['CR09'] = {
            id: 'CR09',
            name: '没有己方城堡',
            pass: legal.length === 0,
            legalCount: legal.length
        };
    })();

    // CR10: 单位上限已满
    (() => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        sdRules.unitLimit = 2;
        const state = createDemoState(sdRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].commanderDeathCount = 1;
        state.players[0].gold = 1000;
        // 添加 2 个己方兵
        state.units.push({ id: 'u_extra1', ownerId: 0, unitClass: 'soldier', pos: { x: 2, y: 0 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false });

        const can = canRecruitUnitClass(state, 0, 'commander');
        const legal = getLegalActions(state, 0).filter(a => (a as any).unitClass === 'commander');

        results['CR10'] = {
            id: 'CR10',
            name: '单位数量上限',
            pass: !can && legal.length === 0,
            canRecruit: can,
            legalCount: legal.length
        };
    })();

    // CR11: 人口上限但指挥官 population=0
    (() => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        (sdRules as any).populationLimit = 1;
        const state = createDemoState(sdRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].commanderDeathCount = 1;
        state.players[0].gold = 1000;
        // 己方已有 1 个 soldier (pop=1)，人口已满
        const can = canRecruitUnitClass(state, 0, 'commander');
        const legal = getLegalActions(state, 0).filter(a => (a as any).unitClass === 'commander');

        results['CR11'] = {
            id: 'CR11',
            name: '人口已满但指挥官pop=0',
            pass: can && legal.length > 0,
            canRecruit: can,
            legalCount: legal.length
        };
    })();

    // CR12: SO 模式禁止招募指挥官
    (() => {
        const soRules = getApkSkirmishRuleConfig('SO');
        const state = createDemoState(soRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].commanderDeathCount = 1;
        state.players[0].gold = 2000;

        const price = getUnitCost(state, 0, 'commander');
        const can = canRecruitUnitClass(state, 0, 'commander');
        const legal = getLegalActions(state, 0).filter(a => (a as any).unitClass === 'commander');

        results['CR12'] = {
            id: 'CR12',
            name: 'SO模式禁招',
            pass: price === null && !can && legal.length === 0,
            price,
            canRecruit: can,
            legalCount: legal.length
        };
    })();

    // CR13: 指挥官阵亡即判定失败模式 (defeatOnCommanderDeath)
    (() => {
        const rules = getApkSkirmishRuleConfig('SD');
        rules.defeatOnCommanderDeath = true;
        const state = createDemoState(rules);
        state.units.find(u => u.ownerId === 0 && u.unitClass === 'commander')!.hp = 1;
        state.units.find(u => u.ownerId === 1 && u.unitClass === 'soldier')!.pos = { x: 0, y: 1 };

        const engine = new GameEngine(state);
        engine.step({ type: 'end_turn' }); // 轮到 P1
        const p1SoldierId = engine.getState().units.find(u => u.ownerId === 1 && u.unitClass === 'soldier')!.id;
        const p0CommId = engine.getState().units.find(u => u.ownerId === 0 && u.unitClass === 'commander')!.id;
        engine.step({ type: 'attack', attackerId: p1SoldierId, targetId: p0CommId });

        results['CR13'] = {
            id: 'CR13',
            name: '指挥官死即判负规则',
            pass: engine.isTerminal() && engine.getState().players[0].isAlive === false,
            winner: engine.getState().winner,
            player0Alive: engine.getState().players[0].isAlive
        };
    })();

    // CR14: 保留等级与经验
    (() => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        const engine = new GameEngine(state);
        const comm = state.units.find(u => u.ownerId === 0 && u.unitClass === 'commander')!;
        comm.level = 3;
        comm.exp = 80;
        comm.hp = 1;
        engine.step({ type: 'attack', attackerId: state.units.find(u => u.ownerId === 1)!.id, targetId: comm.id });

        state.players[0].gold = 1000;
        engine.step({ type: 'recruit_to_castle', castlePos: { x: 0, y: 0 }, unitClass: 'commander' });
        if (state.pendingUnitId) engine.step({ type: 'wait', unitId: state.pendingUnitId });

        const newComm = state.units.find(u => u.ownerId === 0 && u.unitClass === 'commander' && u.hp > 0)!;
        results['CR14'] = {
            id: 'CR14',
            name: '保留等级与经验',
            pass: newComm?.level === 3 && newComm?.exp === 80,
            level: newComm?.level,
            exp: newComm?.exp
        };
    })();

    // CR15: 视角隔离 (P0 与 P1 各自独立计数与费用)
    (() => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        state.players[0].commanderDeathCount = 2; // cost 600
        state.players[1].commanderDeathCount = 0; // cost 400
        const costP0 = getUnitCost(state, 0, 'commander');
        const costP1 = getUnitCost(state, 1, 'commander');

        results['CR15'] = {
            id: 'CR15',
            name: 'P0/P1独立计数',
            pass: costP0 === 600 && costP1 === 400,
            costP0,
            costP1
        };
    })();

    // CR16: 状态 clone 与序列化后费用和动作一致性
    (() => {
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].commanderDeathCount = 1;
        state.players[0].gold = 550;

        const origCost = getUnitCost(state, 0, 'commander');
        const origActions = getLegalActions(state, 0).filter(a => (a as any).unitClass === 'commander');

        const clone: GameState = JSON.parse(JSON.stringify(state));
        const cloneCost = getUnitCost(clone, 0, 'commander');
        const cloneActions = getLegalActions(clone, 0).filter(a => (a as any).unitClass === 'commander');

        results['CR16'] = {
            id: 'CR16',
            name: 'Clone序列化一致性',
            pass: origCost === cloneCost && origActions.length === cloneActions.length,
            origCost,
            cloneCost,
            origActionsCount: origActions.length,
            cloneActionsCount: cloneActions.length
        };
    })();

    const allPassed = Object.values(results).every(r => r.pass === true);
    console.log(`[C61] CR01-CR16 Audit Result: ${allPassed ? 'ALL 16 PASSED' : 'SOME FAILED'}`);

    fs.writeFileSync(path.join(REPORT_DIR, 'commander-rule-audit.json'), JSON.stringify(results, null, 2));

    // 审计真实代码入口
    const entrypoints = [
        {
            entrypoint: 'src/game/default_state.ts -> createDefaultAppGameState',
            mode: 'SD (ApkSkirmishMapAssets)',
            injectsSdRules: true,
            commanderCost: '400 + 100*deaths',
            verdict: 'CORRECT_SD'
        },
        {
            entrypoint: 'src/game/demo_map.ts -> createDemoState (no args)',
            mode: 'DEFAULT_RULE_CONFIG',
            injectsSdRules: false,
            commanderCost: 'null (DISABLED)',
            verdict: 'INTENDED_NEGATIVE_CONTROL'
        },
        {
            entrypoint: 'tools/skirmish_spatial_dataset_export.ts -> generateSpatialEpisodeSamples',
            mode: 'createDemoState() (no args)',
            injectsSdRules: false,
            commanderCost: 'null (DISABLED)',
            verdict: 'DEFECT_MUST_FIX_IN_C63'
        },
        {
            entrypoint: 'tools/skirmish_spatial_match_benchmark.ts -> runSpatialVsHeuristicMatch',
            mode: 'createDemoState() (no args)',
            injectsSdRules: false,
            commanderCost: 'null (DISABLED)',
            verdict: 'DEFECT_MUST_FIX_IN_C63'
        },
        {
            entrypoint: 'tools/run_match_evaluation_200turns.ts -> runMatchEvaluation200Turns',
            mode: 'createDemoState() (no args)',
            injectsSdRules: false,
            commanderCost: 'null (DISABLED)',
            verdict: 'DEFECT_MUST_FIX_IN_C63'
        }
    ];

    fs.writeFileSync(path.join(REPORT_DIR, 'rules-entrypoint-matrix.json'), JSON.stringify(entrypoints, null, 2));
    console.log('[C61] rules-entrypoint-matrix.json written.');

    return results;
}

// ==========================================
// C62: 4 层决策漏斗与旧策略基线捕获
// ==========================================
export function runC62DecisionFunnelAndBaseline() {
    console.log('[C62] Running Decision Funnel & Baseline Snapshot on Existing Policies...');
    const sdRules = getApkSkirmishRuleConfig('SD');

    // 建立 4 个典型场景：
    // S1: 纯正例：指挥官阵亡(deathCount=1)，金币600，城堡空着，没有威胁 -> 应立即重招募
    // S2: 城堡被己军阻挡：金币600，但士兵站在城堡上
    // S3: 裸 Demo 路径：没有传入 SD rules (复现评测工具为何没有招募动作)
    // S4: 敌军压境：城堡受威胁，Heuristic 优先防守还是招募
    const scenarios = [
        {
            id: 'S1_SAFE_IMMEDIATE_REHIRE',
            name: '安全立即重招募',
            createState: () => {
                const s = createDemoState(sdRules);
                s.units = s.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
                s.players[0].commanderDeathCount = 1;
                s.players[0].gold = 600;
                return s;
            }
        },
        {
            id: 'S2_CASTLE_BLOCKED_BY_SOLDIER',
            name: '城堡被友军占领',
            createState: () => {
                const s = createDemoState(sdRules);
                s.units = s.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
                s.players[0].commanderDeathCount = 1;
                s.players[0].gold = 600;
                s.units.find(u => u.ownerId === 0 && u.unitClass === 'soldier')!.pos = { x: 0, y: 0 };
                return s;
            }
        },
        {
            id: 'S3_BARE_DEMO_DEFECT_ENTRYPOINT',
            name: '未注入SD规则的裸demo初态',
            createState: () => {
                const s = createDemoState(); // no rules
                s.units = s.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
                s.players[0].commanderDeathCount = 1;
                s.players[0].gold = 1000;
                return s;
            }
        },
        {
            id: 'S4_INSUFFICIENT_GOLD',
            name: '差1金币不足',
            createState: () => {
                const s = createDemoState(sdRules);
                s.units = s.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
                s.players[0].commanderDeathCount = 1;
                s.players[0].gold = 499;
                return s;
            }
        }
    ];

    const policies: Array<{ id: SupportedAiPolicy; name: string }> = [
        { id: 'heuristic', name: 'HeuristicAI' },
        { id: 'random', name: 'RandomAI' },
        { id: 'net_b_1ply', name: 'NET_B (1-ply)' },
        { id: 'net_b_s10', name: 'NET_B (S10)' },
        { id: 'spatial_resnet_v1', name: 'Spatial ResNet v1' }
    ];

    const funnelLog: any[] = [];
    const baselineMatrix: any[] = [];
    const failureSnapshots: any[] = [];

    for (const sc of scenarios) {
        for (const pol of policies) {
            const state = sc.createState();
            const explanation = explainCommanderRecruitment(state, 0);
            const engine = new GameEngine(state);

            let chosenAction: Action | null = null;
            let latencyMs = 0;
            let error: string | null = null;

            try {
                const res = getAiAction(pol.id, engine, 0, { deadlineMs: 1000 });
                chosenAction = res.action;
                latencyMs = res.latencyMs;
            } catch (err: any) {
                error = err.message;
            }

            const chosenIsCommanderRecruit =
                chosenAction !== null &&
                (chosenAction.type === 'recruit_to_castle' || chosenAction.type === 'recruit_and_deploy') &&
                (chosenAction as any).unitClass === 'commander';

            // 归因漏斗分析
            let funnelStage: 'RULE_BLOCK' | 'CANDIDATE_MISSING' | 'POLICY_REJECTED' | 'EXECUTION_FAIL' | 'SUCCESS';
            let failureReason: string;

            if (!explanation.canRecruitByRule) {
                funnelStage = 'RULE_BLOCK';
                failureReason = explanation.reasons.join(',');
            } else if (explanation.legalCommanderActionCodes.length === 0) {
                funnelStage = 'CANDIDATE_MISSING';
                failureReason = 'NO_LEGAL_ACTIONS_GENERATED';
            } else if (!chosenIsCommanderRecruit) {
                funnelStage = 'POLICY_REJECTED';
                failureReason = `MODEL_CHOSE_${chosenAction?.type}_INSTEAD`;
            } else {
                funnelStage = 'SUCCESS';
                failureReason = 'RECRUIT_CHOSEN';
            }

            const record = {
                scenarioId: sc.id,
                scenarioName: sc.name,
                policyId: pol.id,
                funnelStage,
                failureReason,
                chosenAction,
                chosenIsCommanderRecruit,
                latencyMs,
                error,
                explanation
            };

            funnelLog.push(record);
            baselineMatrix.push({
                scenarioId: sc.id,
                policyId: pol.id,
                stage: funnelStage,
                reason: failureReason,
                chosenType: chosenAction?.type,
                unitClass: (chosenAction as any)?.unitClass ?? null,
                latencyMs
            });

            if (sc.id === 'S1_SAFE_IMMEDIATE_REHIRE' && !chosenIsCommanderRecruit) {
                failureSnapshots.push({
                    scenarioId: sc.id,
                    policyId: pol.id,
                    stateHash: explanation.stateHash,
                    rulesHash: explanation.rulesHash,
                    chosenAction,
                    funnelStage,
                    failureReason
                });
            }
        }
    }

    fs.writeFileSync(
        path.join(REPORT_DIR, 'commander-decision-funnel.jsonl'),
        funnelLog.map(l => JSON.stringify(l)).join('\n') + '\n'
    );
    fs.writeFileSync(path.join(REPORT_DIR, 'commander-baseline-matrix.json'), JSON.stringify(baselineMatrix, null, 2));
    fs.writeFileSync(path.join(REPORT_DIR, 'failure-snapshots-index.json'), JSON.stringify(failureSnapshots, null, 2));

    console.log('[C62] Decision funnel and baseline snapshots captured successfully.');
    console.log(`[C62] Total baseline evaluations: ${baselineMatrix.length}, Failure snapshots: ${failureSnapshots.length}`);
}

function main() {
    ensureDirs();
    runC60Inventory();
    runC61RuleAudit();
    runC62DecisionFunnelAndBaseline();
}

main();
