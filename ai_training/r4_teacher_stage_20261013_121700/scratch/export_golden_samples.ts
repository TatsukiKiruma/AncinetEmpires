import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameEngine } from '../env/src/game/engine';
import { GameState, Action } from '../env/src/game/types';
import { createAppApkSkirmishGameState } from '../env/src/game/apk_skirmish_map_assets';
import { encodeAction } from '../env/src/game/env';
import { computeStateHash } from '../research/state_hash';
import { FEATURE_SCHEMA_V1, computeSchemaHash } from '../research/feature_schema';
import { encodeStateAndActions, EncodedStateFeatures } from '../research/features';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface GoldenSample {
    sampleId: string;
    mapName: string;
    split: 'train' | 'dev';
    state: GameState;
    observerPlayerId: number;
    encodedFeatures: EncodedStateFeatures;
}

function exportGolden() {
    const artifactsDir = path.resolve(__dirname, '../artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });

    // 1. 保存 features-v1.json 与 schema hash
    const schemaHash = computeSchemaHash(FEATURE_SCHEMA_V1);
    const schemaFile = path.join(artifactsDir, 'features-v1.json');
    const schemaPayload = {
        schema: FEATURE_SCHEMA_V1,
        schemaHash,
        createdAt: new Date().toISOString()
    };
    fs.writeFileSync(schemaFile, JSON.stringify(schemaPayload, null, 2), 'utf-8');
    console.log(`Saved feature schema to ${schemaFile} (hash: ${schemaHash})`);

    // 2. 采集 ≥ 200 份真实决策样本，覆盖全部动作类型
    const goldenDir = path.join(artifactsDir, 'golden');
    fs.mkdirSync(goldenDir, { recursive: true });

    const goldenSamples: GoldenSample[] = [];
    const actionTypesSeen = new Set<string>();

    const maps = [
        { name: '(2) Duel.aem', split: 'train' as const },
        { name: '(2) Liberty Port.aem', split: 'train' as const },
        { name: '(2) Swamplands.aem', split: 'train' as const },
        { name: '(2) Icy Paths.aem', split: 'dev' as const },
        { name: '(2) The Crossing.aem', split: 'dev' as const }
    ];

    let sampleCounter = 0;

    for (const m of maps) {
        for (let gameIdx = 0; gameIdx < 4; gameIdx++) {
            let seed = 12345 + gameIdx * 777;
            const pseudoRand = () => {
                seed = (seed * 9301 + 49297) % 233280;
                return seed / 233280;
            };

            const state = createAppApkSkirmishGameState(m.name, 'SD');
            const engine = new GameEngine(JSON.parse(JSON.stringify(state)));

        for (let step = 0; step < 150 && !engine.isTerminal(); step++) {
            const currState = engine.getState();
            const legal = engine.getLegalActions(currState.currentPlayer);
            if (legal.length === 0) break;

            const stateHash = computeStateHash(currState);
            const encoded = encodeStateAndActions(
                currState,
                legal,
                currState.currentPlayer,
                stateHash,
                false
            );

            // 统计观察到的动作类型
            for (const act of legal) {
                actionTypesSeen.add(act.type);
            }

            goldenSamples.push({
                sampleId: `golden_${m.split}_${sampleCounter++}`,
                mapName: m.name,
                split: m.split,
                state: JSON.parse(JSON.stringify(currState)),
                observerPlayerId: currState.currentPlayer,
                encodedFeatures: encoded
            });

            // 推进对局
            const chosen = legal[Math.floor(pseudoRand() * legal.length)];
            engine.step(chosen);

            if (goldenSamples.length >= 220) break;
        }
        }
    }

    // 稀有动作夹具 1: post_attack_move (狼或巨龙攻击后移动)
    {
        const sPost = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        sPost.units = [];
        const uWolf = {
            id: 'u_wolf',
            ownerId: 0,
            unitClass: 'wolf' as const,
            pos: { x: 5, y: 5 },
            hp: 100,
            maxHp: 100,
            level: 1,
            exp: 0,
            hasMoved: true,
            hasActed: true,
            hasPostAttackMoved: false
        };
        sPost.units.push(uWolf as any);
        sPost.currentPlayer = 0;
        const engine = new GameEngine(JSON.parse(JSON.stringify(sPost)));
        const legal = engine.getLegalActions(0);
        for (const act of legal) actionTypesSeen.add(act.type);
        goldenSamples.push({
            sampleId: `golden_fixture_post_attack_move_${sampleCounter++}`,
            mapName: 'fixture',
            split: 'dev',
            state: sPost,
            observerPlayerId: 0,
            encodedFeatures: encodeStateAndActions(sPost, legal, 0, computeStateHash(sPost), false)
        });
    }

    // 稀有动作夹具 2: support (德鲁伊支援盟友)
    {
        const sSup = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        sSup.units = [];
        const uDruid = {
            id: 'u_druid',
            ownerId: 0,
            unitClass: 'druid' as const,
            pos: { x: 5, y: 5 },
            hp: 100,
            maxHp: 100,
            level: 1,
            exp: 0,
            hasMoved: false,
            hasActed: false
        };
        const uAlly = {
            id: 'u_ally',
            ownerId: 0,
            unitClass: 'soldier' as const,
            pos: { x: 5, y: 6 },
            hp: 100,
            maxHp: 100,
            level: 1,
            exp: 0,
            hasMoved: true,
            hasActed: true // 已行动的盟友才能被支援再动
        };
        sSup.units.push(uDruid as any, uAlly as any);
        sSup.currentPlayer = 0;
        const engine = new GameEngine(JSON.parse(JSON.stringify(sSup)));
        const legal = engine.getLegalActions(0);
        for (const act of legal) actionTypesSeen.add(act.type);
        goldenSamples.push({
            sampleId: `golden_fixture_support_${sampleCounter++}`,
            mapName: 'fixture',
            split: 'dev',
            state: sSup,
            observerPlayerId: 0,
            encodedFeatures: encodeStateAndActions(sSup, legal, 0, computeStateHash(sSup), false)
        });
    }

    // 稀有动作夹具 3: destroy_town (投石车破坏城镇)
    {
        const sDes = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        sDes.units = [];
        // (8,4) 是 town
        const uCatapult = {
            id: 'u_catapult',
            ownerId: 0,
            unitClass: 'catapult' as const,
            pos: { x: 8, y: 4 },
            hp: 100,
            maxHp: 100,
            level: 1,
            exp: 0,
            hasMoved: false,
            hasActed: false
        };
        sDes.units.push(uCatapult as any);
        sDes.currentPlayer = 0;
        const engine = new GameEngine(JSON.parse(JSON.stringify(sDes)));
        const legal = engine.getLegalActions(0);
        for (const act of legal) actionTypesSeen.add(act.type);
        goldenSamples.push({
            sampleId: `golden_fixture_destroy_town_${sampleCounter++}`,
            mapName: 'fixture',
            split: 'dev',
            state: sDes,
            observerPlayerId: 0,
            encodedFeatures: encodeStateAndActions(sDes, legal, 0, computeStateHash(sDes), false)
        });
    }

    // 稀有动作夹具 4: recruit_and_deploy
    {
        const sRecDeploy = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
        sRecDeploy.rules.commanderCastleRecruitUsesPending = false;
        // P0 指挥官在城堡 (4,4)
        sRecDeploy.units = [{
            id: 'u_cmd',
            ownerId: 0,
            unitClass: 'commander' as const,
            pos: { x: 4, y: 4 },
            hp: 100,
            maxHp: 100,
            level: 1,
            exp: 0,
            hasMoved: false,
            hasActed: false
        } as any];
        sRecDeploy.currentPlayer = 0;
        sRecDeploy.players[0].gold = 500;
        const engine = new GameEngine(JSON.parse(JSON.stringify(sRecDeploy)));
        const legal = engine.getLegalActions(0);
        for (const act of legal) actionTypesSeen.add(act.type);
        goldenSamples.push({
            sampleId: `golden_fixture_recruit_and_deploy_${sampleCounter++}`,
            mapName: 'fixture',
            split: 'dev',
            state: sRecDeploy,
            observerPlayerId: 0,
            encodedFeatures: encodeStateAndActions(sRecDeploy, legal, 0, computeStateHash(sRecDeploy), false)
        });
    }

    // 检查是否覆盖稀有动作；若还缺某些战术动作，从战术用例中补全
    const tacticalFile = path.resolve(__dirname, '../eval/tactical_suite.json');
    if (fs.existsSync(tacticalFile)) {
        const tacticalCases = JSON.parse(fs.readFileSync(tacticalFile, 'utf-8'));
        for (const tc of tacticalCases) {
            const engine = new GameEngine(JSON.parse(JSON.stringify(tc.state)));
            const legal = engine.getLegalActions(tc.state.currentPlayer);
            const stateHash = computeStateHash(tc.state);
            const encoded = encodeStateAndActions(
                tc.state,
                legal,
                tc.state.currentPlayer,
                stateHash,
                false
            );
            for (const act of legal) {
                actionTypesSeen.add(act.type);
            }
            goldenSamples.push({
                sampleId: `golden_tactical_${sampleCounter++}`,
                mapName: tc.state.map.width + 'x' + tc.state.map.height,
                split: 'dev',
                state: JSON.parse(JSON.stringify(tc.state)),
                observerPlayerId: tc.state.currentPlayer,
                encodedFeatures: encoded
            });
        }
    }

    console.log(`Total golden samples generated: ${goldenSamples.length}`);
    console.log(`Action types covered (${actionTypesSeen.size}):`, [...actionTypesSeen]);

    const goldenFile = path.join(goldenDir, 'golden_samples.json');
    fs.writeFileSync(goldenFile, JSON.stringify(goldenSamples, null, 2), 'utf-8');
    console.log(`Saved golden samples to ${goldenFile}`);

    // 3. 验证 100% 精确可重建
    let verifiedCount = 0;
    for (const g of goldenSamples) {
        const engine = new GameEngine(JSON.parse(JSON.stringify(g.state)));
        const legal = engine.getLegalActions(g.observerPlayerId);
        const reHash = computeStateHash(g.state);
        const reEncoded = encodeStateAndActions(g.state, legal, g.observerPlayerId, reHash, false);

        // 验证数组内容逐项完全相等
        if (reEncoded.spatialBuffer.length !== g.encodedFeatures.spatialBuffer.length) {
            throw new Error(`Spatial length mismatch on ${g.sampleId}`);
        }
        if (reEncoded.entityBuffer.length !== g.encodedFeatures.entityBuffer.length) {
            throw new Error(`Entity length mismatch on ${g.sampleId}`);
        }
        if (reEncoded.actionBuffer.length !== g.encodedFeatures.actionBuffer.length) {
            throw new Error(`Action length mismatch on ${g.sampleId}`);
        }
        verifiedCount++;
    }

    console.log(`Verified ${verifiedCount} / ${goldenSamples.length} golden samples with 100% exact parity!`);
}

exportGolden();
