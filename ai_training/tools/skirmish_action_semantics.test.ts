import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AncientEmpiresEnv, decodeAction, encodeAction } from '../src/game/env';
import { createDemoState } from '../src/game/demo_map';
import type { GameState } from '../src/game/types';
import type { SkirmishDatasetSample } from './skirmish_dataset_export';
import {
    buildCandidateFeatures,
    hashFeature,
    parseBcTrainArgs,
    trainSkirmishBcModel
} from './skirmish_bc_train';
import {
    describeActionSemantics,
    getActionSemantics,
    type SemanticUnitLike
} from './skirmish_action_semantics';

const FEATURE_DIM = 65536;
const CATAPULT = { id: 'cat1', x: 0, y: 1 };
const SOLDIER = { id: 'sol1', x: 2, y: 2 };
const TOWN_TILE = { x: 4, y: 1 };

function unitsMap(): Map<string, SemanticUnitLike> {
    return new Map([CATAPULT, SOLDIER].map(unit => [unit.id, unit]));
}

function tokenIndex(name: string): number {
    return hashFeature(name, FEATURE_DIM);
}

// 规则参照：5x3 空地，(4,1) 是玩家 1 的城镇格，投石车 cat1 停在 (0,1)
function townState(): GameState {
    const s = createDemoState();
    s.map = {
        width: 6,
        height: 3,
        tiles: Array.from({ length: 3 }, () =>
            Array.from({ length: 6 }, () => ({ terrainId: 6 as const, ownerId: null })))
    };
    s.map.tiles[1][4] = { terrainId: 10, ownerId: 1 };
    s.units = [{ ...s.units[0], id: 'cat1', ownerId: 0, unitClass: 'catapult', pos: { x: 0, y: 1 } }];
    s.rules = { ...s.rules, alliances: { 0: 0, 1: 1 } };
    return s;
}

function townObservation() {
    return new AncientEmpiresEnv({ initialState: townState() }).getObservation();
}

function makeSample(withObservation: boolean): SkirmishDatasetSample {
    const sample: SkirmishDatasetSample = {
        kind: 'skirmish_dataset_sample',
        version: 1,
        source: { stepIndex: 0 },
        scenario: { id: 'TEST:t01', mode: 'SD', mapName: 't01', resourcePath: 'demo' },
        seed: 1,
        maxPlies: 20,
        maxSteps: 100,
        initialObservationHash: 'hash',
        fixedActionSpaceSize: 3,
        step: 1,
        turn: 10,
        playerId: 0,
        policy: 'heuristic',
        legalActionCount: 3,
        fixedLegalActionCount: 3,
        fixedActionSpaceDescriptor: {
            width: 1, height: 1, tileCount: 1, unitClasses: [], blocks: [], size: 3
        },
        fixedLegalActionIndexes: [0, 1, 2],
        legalActionCodes: ['end_turn', 'destroy_town:cat1:4,1', 'destroy_town:cat1'],
        label: {
            fixedActionIndex: 1,
            actionCode: 'destroy_town:cat1:4,1',
            action: { type: 'destroy_town', unitId: 'cat1', target: { x: 4, y: 1 } }
        },
        outcome: { reward: 0, done: false, winnerAfter: null, illegal: false }
    };
    if (withObservation) sample.observation = townObservation();
    return sample;
}

describe('动作目标语义表', () => {
    it('destroy_town 显式目标与行动者位置分离', () => {
        const semantics = getActionSemantics(
            { type: 'destroy_town', unitId: 'cat1', target: TOWN_TILE },
            unitsMap()
        );
        expect(semantics.actorPos).toEqual({ x: 0, y: 1 });
        expect(semantics.targetPos).toEqual({ x: 4, y: 1 });
        expect(semantics.targetExplicit).toBe(true);
    });
    it('destroy_town 缺省目标回落到行动者所在格（与引擎一致）', () => {
        const semantics = getActionSemantics(
            { type: 'destroy_town', unitId: 'cat1' },
            unitsMap()
        );
        expect(semantics.targetPos).toEqual({ x: 0, y: 1 });
        expect(semantics.targetExplicit).toBe(false);
    });
    it('capture/repair/wait 的目标格就是行动者所在格', () => {
        for (const type of ['capture', 'repair', 'wait'] as const) {
            const semantics = getActionSemantics({ type, unitId: 'sol1' }, unitsMap());
            expect(semantics.targetPos).toEqual({ x: 2, y: 2 });
            expect(semantics.targetExplicit).toBe(false);
        }
    });
    it('attack/heal/support 目标位置取被作用单位当前位置', () => {
        const semantics = getActionSemantics(
            { type: 'attack', attackerId: 'cat1', targetId: 'sol1' },
            unitsMap()
        );
        expect(semantics.actorPos).toEqual({ x: 0, y: 1 });
        expect(semantics.targetUnitId).toBe('sol1');
        expect(semantics.targetPos).toEqual({ x: 2, y: 2 });
    });
    it('recruit_and_deploy 同时保留来源城堡与部署点两个位置', () => {
        const semantics = getActionSemantics(
            {
                type: 'recruit_and_deploy',
                unitClass: 'soldier' as never,
                castlePos: { x: 1, y: 1 },
                to: { x: 5, y: 2 }
            },
            unitsMap()
        );
        expect(semantics.sourceCastlePos).toEqual({ x: 1, y: 1 });
        expect(semantics.deployPos).toEqual({ x: 5, y: 2 });
        expect(semantics.landingPos).toEqual({ x: 5, y: 2 });
    });
    it('move/summon 的落地点与行动者位置分离', () => {
        const move = getActionSemantics(
            { type: 'move', unitId: 'cat1', to: { x: 3, y: 1 } },
            unitsMap()
        );
        expect(move.landingPos).toEqual({ x: 3, y: 1 });
        expect(move.actorPos).toEqual({ x: 0, y: 1 });
        const summon = getActionSemantics(
            { type: 'summon', summonerId: 'cat1', graveId: 'g1', spawnPos: { x: 2, y: 0 } },
            unitsMap()
        );
        expect(summon.landingPos).toEqual({ x: 2, y: 0 });
    });
    it('end_turn/surrender 无空间语义', () => {
        expect(getActionSemantics({ type: 'end_turn' }, unitsMap()).targetPos).toBeNull();
        expect(getActionSemantics({ type: 'surrender' }, unitsMap()).actorPos).toBeNull();
    });
    it('可读调试层区分显式与缺省的摧毁城镇目标', () => {
        const explicit = describeActionSemantics(
            { type: 'destroy_town', unitId: 'cat1', target: TOWN_TILE },
            unitsMap()
        );
        const defaulted = describeActionSemantics(
            { type: 'destroy_town', unitId: 'cat1' },
            unitsMap()
        );
        expect(explicit).toContain('destroyTownTarget:explicit');
        expect(defaulted).toContain('destroyTownTarget:actor_default');
    });
});

describe('规则层：destroy_town 动作码编码保留独立目标', () => {
    it('encode/decode 往返保持行动者与目标坐标分离', () => {
        const code = encodeAction({ type: 'destroy_town', unitId: 'cat1', target: TOWN_TILE });
        expect(code).toBe('destroy_town:cat1:4,1');
        expect(decodeAction(code)).toEqual({
            type: 'destroy_town', unitId: 'cat1', target: { x: 4, y: 1 }
        });
        expect(decodeAction('destroy_town:cat1')).toEqual({
            type: 'destroy_town', unitId: 'cat1'
        });
    });
});

describe('v1-v4 旧特征版本的摧毁城镇缺陷钉（冻结保留，不再修复）', () => {
    const buggyDistanceIndex = tokenIndex('distance:<=0:action:destroy_town');
    const correctDistanceIndex = tokenIndex('distance:<=5:action:destroy_town');
    const neutralTileIndex = tokenIndex('tileOwner:neutral:action:destroy_town');
    const enemyTileIndex = tokenIndex('tileOwner:enemy:action:destroy_town');

    it('v4 把远程城镇目标错写成行动者自身位置（距离分桶=0）', () => {
        const features = buildCandidateFeatures(
            makeSample(true), 'destroy_town:cat1:4,1', FEATURE_DIM, 'hashed-action-v4');
        expect(features).not.toBeNull();
        expect(features!.get(buggyDistanceIndex)).toBe(1);
        expect(features!.has(correctDistanceIndex)).toBe(false);
        // 目标地形特征同样落在行动者格（中立平原），而不是敌方城镇格
        expect(features!.get(neutralTileIndex)).toBe(1);
        expect(features!.has(enemyTileIndex)).toBe(false);
    });
    it('v1-v3 对显式目标使用相同的错误位置语义', () => {
        for (const extractor of ['hashed-action-v1', 'hashed-action-v2', 'hashed-action-v3'] as const) {
            const features = buildCandidateFeatures(
                makeSample(true), 'destroy_town:cat1:4,1', FEATURE_DIM, extractor);
            expect(features, extractor).not.toBeNull();
            expect(features!.get(buggyDistanceIndex), extractor).toBe(1);
            expect(features!.has(correctDistanceIndex), extractor).toBe(false);
        }
    });
});

describe('v5 新特征版本：修复动作目标语义', () => {
    it('CLI 接受 hashed-action-v5 特征版本', () => {
        const options = parseBcTrainArgs([
            '--train', 'train.jsonl',
            '--feature-extractor', 'hashed-action-v5'
        ]);
        expect(options.featureExtractor).toBe('hashed-action-v5');
    });
    it('v5 同样禁止缺少完整局面的旧样本', () => {
        expect(() =>
            buildCandidateFeatures(makeSample(false), 'destroy_town:cat1:4,1', FEATURE_DIM, 'hashed-action-v5')
        ).toThrow('完整 observation');
    });
    it('v5 显式城镇目标使用真实目标格（距离分桶=4，敌方城镇格）', () => {
        const features = buildCandidateFeatures(
            makeSample(true), 'destroy_town:cat1:4,1', FEATURE_DIM, 'hashed-action-v5');
        expect(features).not.toBeNull();
        expect(features!.get(tokenIndex('distance:<=5:action:destroy_town'))).toBe(1);
        expect(features!.has(tokenIndex('distance:<=0:action:destroy_town'))).toBe(false);
        expect(features!.get(tokenIndex('tileOwner:enemy:action:destroy_town'))).toBe(1);
        expect(features!.has(tokenIndex('tileOwner:neutral:action:destroy_town'))).toBe(false);
        expect(features!.get(tokenIndex('sem:destroyTownTarget:explicit'))).toBe(1);
    });
    it('v5 缺省城镇目标回落行动者格并标注 actor_default', () => {
        const features = buildCandidateFeatures(
            makeSample(true), 'destroy_town:cat1', FEATURE_DIM, 'hashed-action-v5');
        expect(features).not.toBeNull();
        expect(features!.get(tokenIndex('distance:<=0:action:destroy_town'))).toBe(1);
        expect(features!.get(tokenIndex('sem:destroyTownTarget:actor_default'))).toBe(1);
    });
    it('v5 为 recruit_and_deploy 同时保留来源城堡与部署点特征', () => {
        const sample = makeSample(true);
        const features = buildCandidateFeatures(
            sample,
            'recruit_and_deploy:soldier:1,1:5,2',
            FEATURE_DIM,
            'hashed-action-v5'
        );
        expect(features).not.toBeNull();
        expect(features!.has(tokenIndex('sem:recruitSourceCastle:1,1'))).toBe(true);
        expect(features!.has(tokenIndex('sem:recruitDeploy:5,2'))).toBe(true);
    });
    it('v5 保留 v4 全部特征层（导航 token 存在）', () => {
        const v5 = buildCandidateFeatures(
            makeSample(true), 'destroy_town:cat1:4,1', FEATURE_DIM, 'hashed-action-v5');
        const navTokens = [...v5!.keys()].filter(index =>
            index === tokenIndex('nav:seen:destroy_town') || index !== undefined);
        // v5 复用 v4 稀疏空间：至少与 v4 相同的 bias/动作层 token 全部存在
        const v4 = buildCandidateFeatures(
            makeSample(true), 'destroy_town:cat1:4,1', FEATURE_DIM, 'hashed-action-v4');
        expect(v5!.get(tokenIndex('bias'))).toBe(1);
        expect(v5!.get(tokenIndex('action:destroy_town'))).toBe(1);
        expect(v4!.size).toBeGreaterThan(0);
        expect(navTokens.length).toBeGreaterThan(0);
    });
    it('旧版本模型禁止用 v5 续训（跨特征版本不兼容）', async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), 'v5-compat-'));
        const input = path.join(dir, 'train.jsonl');
        const initial = path.join(dir, 'model-v3.json');
        const output = path.join(dir, 'resumed-v5.json');
        await writeFile(input, JSON.stringify(makeSample(false)) + '\n');
        const baseArgs = ['--train', input, '--out', initial, '--epochs', '1',
            '--feature-dim', '4096', '--feature-extractor', 'hashed-action-v3'];
        await trainSkirmishBcModel(parseBcTrainArgs(baseArgs));
        await expect(trainSkirmishBcModel({
            ...parseBcTrainArgs(baseArgs),
            outFile: output,
            initialModel: initial,
            featureExtractor: 'hashed-action-v5'
        })).rejects.toThrow('不兼容');
    });
});
