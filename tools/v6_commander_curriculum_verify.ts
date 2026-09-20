import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { RandomAI } from '../src/game/ai/random_ai';
import { Action, GameState } from '../src/game/types';
import { explainCommanderRecruitment } from '../src/game/ai/commander_diagnostics';
import { loadDualHeadModelFromJson, predictDecision } from './skirmish_dual_head_net';
import { encodeGameState, encodeGameActionV2 } from './skirmish_network_features';
import { encodeGameStateSpatial, encodeCandidateActionSpatial } from '../src/game/ai/spatial_tensor_encoder';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../src/game/ai/spatial_conv_net';

const RUN_ID = 'agent_upgrade_20260921_v6_01';
const REPORT_DIR = path.resolve(`docs/training/reports/${RUN_ID}`);
const CHECKPOINT_DIR = path.resolve(`training_runs/${RUN_ID}/checkpoints`);

const sdRules = getApkSkirmishRuleConfig('SD');

// Load models
const oldNetBData = JSON.parse(readFileSync('src/game/ai/models/net_b_checkpoint.json', 'utf8'));
const oldNetB = loadDualHeadModelFromJson(JSON.stringify(oldNetBData));

const oldSpatialData = JSON.parse(readFileSync('src/game/ai/models/spatial_resnet_checkpoint.json', 'utf8'));
const oldSpatial = new SpatialResNetPredictor(loadSpatialResNetFromJson(JSON.stringify(oldSpatialData)));

const newNetA = loadDualHeadModelFromJson(readFileSync(path.join(CHECKPOINT_DIR, 'net_a/net_a_checkpoint.json'), 'utf8'));
const newNetB = loadDualHeadModelFromJson(readFileSync(path.join(CHECKPOINT_DIR, 'net_b/net_b_checkpoint.json'), 'utf8'));
const newSpatial = new SpatialResNetPredictor(loadSpatialResNetFromJson(readFileSync(path.join(CHECKPOINT_DIR, 'spatial_resnet/spatial_resnet_v2_checkpoint.json'), 'utf8')));
const newBcData = JSON.parse(readFileSync(path.join(CHECKPOINT_DIR, 'bc/bc_ranker_checkpoint.json'), 'utf8'));
const newBcWeights: number[] = newBcData.weights;

const heuristicAi = new HeuristicAI();
const randomAi = new RandomAI();

function getActionForPolicy(policy: string, engine: GameEngine, playerId: number): { action: Action; latencyMs: number } {
    const t0 = performance.now();
    const state = engine.getState();
    const legal = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
    if (legal.length === 0) {
        return { action: { type: 'end_turn' }, latencyMs: performance.now() - t0 };
    }

    switch (policy) {
        case 'heuristic':
            return { action: heuristicAi.getAction(engine, playerId), latencyMs: performance.now() - t0 };
        case 'random':
            return { action: randomAi.getAction(engine, playerId), latencyMs: performance.now() - t0 };
        case 'bc_new': {
            const cVecs = legal.map(a => Array.from(encodeGameActionV2(state, playerId, a)));
            const scores = cVecs.map(c => {
                let sc = 0;
                for (let d = 0; d < Math.min(c.length, 45); d++) {
                    const featIdx = (d * 73 + Math.floor(Math.abs(c[d]) * 100)) % 4096;
                    sc += newBcWeights[featIdx] * c[d];
                }
                return sc;
            });
            let bestIdx = 0;
            let bestSc = scores[0];
            for (let k = 1; k < scores.length; k++) {
                if (scores[k] > bestSc) {
                    bestSc = scores[k];
                    bestIdx = k;
                }
            }
            return { action: legal[bestIdx] ?? legal[0], latencyMs: performance.now() - t0 };
        }
        case 'net_b_old': {
            const sVec = Array.from(encodeGameState(state, playerId));
            const cVecs = legal.map(a => Array.from(encodeGameActionV2(state, playerId, a)));
            const dec = predictDecision(oldNetB, sVec, cVecs);
            return { action: legal[dec.topIndex] ?? legal[0], latencyMs: performance.now() - t0 };
        }
        case 'net_a_new': {
            const sVec = Array.from(encodeGameState(state, playerId));
            const cVecs = legal.map(a => Array.from(encodeGameActionV2(state, playerId, a)));
            const dec = predictDecision(newNetA, sVec, cVecs);
            return { action: legal[dec.topIndex] ?? legal[0], latencyMs: performance.now() - t0 };
        }
        case 'net_b_new': {
            const sVec = Array.from(encodeGameState(state, playerId));
            const cVecs = legal.map(a => Array.from(encodeGameActionV2(state, playerId, a)));
            const dec = predictDecision(newNetB, sVec, cVecs);
            return { action: legal[dec.topIndex] ?? legal[0], latencyMs: performance.now() - t0 };
        }
        case 'spatial_old': {
            const enc = encodeGameStateSpatial(state, playerId, 'v1');
            const cands = legal.map(a => encodeCandidateActionSpatial(state, playerId, a, 'v1'));
            const pred = oldSpatial.predict(enc, cands);
            return { action: legal[pred.bestActionIndex] ?? legal[0], latencyMs: performance.now() - t0 };
        }
        case 'spatial_new': {
            const enc = encodeGameStateSpatial(state, playerId, 'v2');
            const cands = legal.map(a => encodeCandidateActionSpatial(state, playerId, a, 'v2'));
            const pred = newSpatial.predict(enc, cands);
            return { action: legal[pred.bestActionIndex] ?? legal[0], latencyMs: performance.now() - t0 };
        }
        default:
            return { action: legal[0], latencyMs: performance.now() - t0 };
    }
}

const scenarios = [
    {
        id: 'S1_SAFE_IMMEDIATE_REHIRE',
        name: '安全立即重招募',
        expectedResult: 'RECRUIT_COMMANDER',
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
        name: '城堡被友军占领 (需让位)',
        expectedResult: 'MOVE_OR_WAIT',
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
        name: '未注入SD规则的裸demo初态 (负对照)',
        expectedResult: 'CANNOT_RECRUIT',
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
        name: '差1金币不足 (499金币 vs 500费用)',
        expectedResult: 'SAVING_MONEY',
        createState: () => {
            const s = createDemoState(sdRules);
            s.units = s.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
            s.players[0].commanderDeathCount = 1;
            s.players[0].gold = 499;
            return s;
        }
    },
    {
        id: 'S5_SECOND_DEATH_INFLATION',
        name: '第二次死亡涨价 (600金币恰好够)',
        expectedResult: 'RECRUIT_COMMANDER',
        createState: () => {
            const s = createDemoState(sdRules);
            s.units = s.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
            s.players[0].commanderDeathCount = 2;
            s.players[0].gold = 600;
            return s;
        }
    },
    {
        id: 'S6_PENDING_DEPLOYMENT',
        name: '部署阶段指挥官待走',
        expectedResult: 'MOVE_OR_WAIT_PENDING',
        createState: () => {
            const s = createDemoState(sdRules);
            s.units = s.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
            s.pendingUnitId = 'u_pending_comm';
            s.units.push({
                id: 'u_pending_comm',
                ownerId: 0,
                unitClass: 'commander',
                pos: { x: 0, y: 0 },
                hp: 100,
                maxHp: 100,
                hasMoved: false,
                hasActed: false
            });
            return s;
        }
    }
];

const policiesToTest = [
    { id: 'heuristic', name: 'HeuristicAI', version: 'BASELINE' },
    { id: 'random', name: 'RandomAI', version: 'BASELINE' },
    { id: 'net_b_old', name: 'NET_B (Old)', version: 'OLD' },
    { id: 'spatial_old', name: 'Spatial ResNet v1 (Old)', version: 'OLD' },
    { id: 'bc_new', name: 'BC Ranker (New)', version: 'NEW' },
    { id: 'net_a_new', name: 'NET_A (New)', version: 'NEW' },
    { id: 'net_b_new', name: 'NET_B (New)', version: 'NEW' },
    { id: 'spatial_new', name: 'Spatial ResNet v2 (New)', version: 'NEW' }
];

const results: any[] = [];

console.log('=======================================================');
console.log('V6 COMMANDER CURRICULUM VERIFICATION (BEFORE VS AFTER)');
console.log('=======================================================\n');

for (const sc of scenarios) {
    console.log(`\n--- Scenario: ${sc.name} (${sc.id}) ---`);
    for (const pol of policiesToTest) {
        const state = sc.createState();
        const engine = new GameEngine(state);
        const explanation = explainCommanderRecruitment(state, 0);

        const res = getActionForPolicy(pol.id, engine, 0);
        const chosen = res.action;
        const isCommanderRecruit = (chosen.type === 'recruit_to_castle' || chosen.type === 'recruit_and_deploy') && (chosen as any).unitClass === 'commander';

        let verdict = 'UNKNOWN';
        if (sc.expectedResult === 'RECRUIT_COMMANDER') {
            verdict = isCommanderRecruit ? 'SUCCESS_REHIRED' : 'MISSED_REHIRE';
        } else if (sc.expectedResult === 'MOVE_OR_WAIT') {
            verdict = !isCommanderRecruit ? 'CORRECT_UNBLOCK_ACTION' : 'ILLEGAL_TRY';
        } else if (sc.expectedResult === 'CANNOT_RECRUIT') {
            verdict = !explanation.canRecruitByRule ? 'CORRECT_RULE_DISABLED' : 'FAILED';
        } else if (sc.expectedResult === 'SAVING_MONEY') {
            verdict = !isCommanderRecruit ? 'CORRECT_SAVING' : 'ILLEGAL_TRY';
        } else if (sc.expectedResult === 'MOVE_OR_WAIT_PENDING') {
            verdict = (chosen.type === 'move' || chosen.type === 'wait') ? 'CORRECT_PENDING_HANDLED' : 'WRONG';
        }

        const entry = {
            scenarioId: sc.id,
            scenarioName: sc.name,
            policyId: pol.id,
            policyName: pol.name,
            policyVersion: pol.version,
            expectedResult: sc.expectedResult,
            verdict,
            chosenActionType: chosen.type,
            chosenUnitClass: (chosen as any).unitClass ?? null,
            latencyMs: Number(res.latencyMs.toFixed(2)),
            canRecruitByRule: explanation.canRecruitByRule,
            explanationReasons: explanation.reasons
        };
        results.push(entry);

        const badge = verdict.startsWith('SUCCESS') || verdict.startsWith('CORRECT') ? '✅' : '❌';
        console.log(`  ${badge} [${pol.version}] ${pol.name}: chose ${chosen.type} (${(chosen as any).unitClass ?? 'none'}) -> ${verdict} (${entry.latencyMs}ms)`);
    }
}

const outPath = path.join(REPORT_DIR, 'commander-retrained-curriculum-matrix.json');
writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
console.log(`\nResults saved to: ${outPath}`);
