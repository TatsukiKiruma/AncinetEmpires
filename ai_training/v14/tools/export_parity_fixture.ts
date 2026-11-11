/**
 * V14/T14-03：导出跨语言一致性夹具（供 Python 端逐数值比对）。
 *
 * 夹具内容：
 * - terrainConfig / unitConfigs / apkTerrainConfigs / skirmishApkToProject：
 *   把规则常量表导出，避免 Python 再维护一份（两侧必须同源）。
 * - states：诊断状态。至少 128 个，来源包括
 *   (a) 真实采集轨迹中的状态（VERIFIED_REPLAY 快照）、
 *   (b) 规则夹具风格的构造状态（空地/边缘/pending/招募/治疗/召唤/多人/高等级/状态异常）。
 * - cases：每个状态 × 每个玩家视角 × 每个候选动作的 TS 端编码结果
 *   （spatialTensor、globalFeatures、candidateActions）。
 *   为控制体积，spatialTensor 以 Float32 精度写入（TS 端本来就是 Float32Array）。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/export_parity_fixture.ts \
 *     --run-id v14_20260924_t14 [--min-states 128] [--raw <dir>]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { TERRAIN_CONFIG } from '../../src/game/terrain';
import { UNIT_CONFIGS } from '../../src/game/units';
import { APK_TERRAIN_CONFIGS, SKIRMISH_APK_TERRAIN_TO_PROJECT } from '../../src/game/apk_terrain';
import {
    ENCODER_SCHEMA_ID,
    encodeCandidateActionSpatial,
    encodeGameStateSpatial,
} from '../../src/game/ai/spatial_tensor_encoder';
import type { GameState, UnitClass } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function* readJsonl<T>(file: string): AsyncGenerator<T> {
    const stream = fs.createReadStream(file, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
        if (!line.trim()) continue;
        yield JSON.parse(line) as T;
    }
}

/** 规则夹具风格的构造状态：覆盖边界、pending、异常状态与多人。 */
function syntheticStates(): Array<{ id: string; note: string; state: GameState; players: number[] }> {
    const flat = (w: number, h: number) => Array.from({ length: h }, () => Array.from({ length: w }, () => ({ terrainId: 6 as const, ownerId: null })));
    const base = (spec: {
        id: string; note: string; width: number; height: number; players: number[]; currentPlayer?: number;
        units: any[]; tiles?: Array<{ x: number; y: number; terrainId: number; ownerId?: number | null }>;
        rules?: Record<string, unknown>; pendingUnitId?: string; graves?: any[];
    }): { id: string; note: string; state: GameState; players: number[] } => {
        const tiles = flat(spec.width, spec.height);
        for (const t of spec.tiles ?? []) {
            const tile = tiles[t.y]?.[t.x];
            if (!tile) throw new Error(`tile 越界 ${t.x},${t.y}`);
            (tile as any).terrainId = t.terrainId;
            (tile as any).ownerId = t.ownerId ?? null;
        }
        const state: GameState = {
            turn: 1,
            currentPlayer: spec.currentPlayer ?? spec.players[0],
            map: { width: spec.width, height: spec.height, tiles: tiles as never },
            units: spec.units.map((u) => ({
                id: u.id, ownerId: u.ownerId, unitClass: u.unitClass as UnitClass,
                pos: { x: u.x, y: u.y }, hp: u.hp ?? 100, maxHp: u.maxHp ?? 100,
                hasMoved: u.hasMoved ?? false, hasActed: u.hasActed ?? false,
                ...(u.status ? { status: u.status } : {}),
                ...(u.level !== undefined ? { level: u.level } : {}),
                exp: 0,
                ...(u.movementRemaining !== undefined ? { movementRemaining: u.movementRemaining } : {}),
                ...(u.apkPendingRecruitSource !== undefined ? { apkPendingRecruitSource: u.apkPendingRecruitSource } : {}),
            })),
            players: spec.players.map((id) => ({
                id, gold: id === 0 ? 1200 : 400, isAlive: true, commanderDeathCount: 0,
                ...(id === 0 ? { commanderReserveLevel: 2 as const, commanderReserveExp: 40 } : {}),
            })),
            winner: null,
            nextUnitId: 900,
            nextGraveId: 1,
            ...(spec.rules ? { rules: spec.rules } : {}),
            ...(spec.graves ? { graves: spec.graves } : {}),
            ...(spec.pendingUnitId ? { pendingUnitId: spec.pendingUnitId } : {}),
        };
        return { id: spec.id, note: spec.note, state, players: spec.players };
    };

    const classes: UnitClass[] = ['soldier', 'archer', 'catapult', 'wolf_archer', 'berserker', 'druid', 'witch', 'paladin', 'commander', 'ghost'];
    const states: Array<{ id: string; note: string; state: GameState; players: number[] }> = [];

    // 每兵种一组对手，覆盖不同射程/能力/魔法攻击
    classes.forEach((cls, index) => {
        states.push(base({
            id: `synthetic/duel-${cls}`,
            note: `1v1 ${cls} 对 soldier，用于覆盖该兵种的攻击/反击/招募语义`,
            width: 8, height: 8, players: [0, 1],
            units: [
                { id: 'a1', ownerId: 0, unitClass: cls, x: 2, y: 2, level: (index % 4) as never },
                { id: 'd1', ownerId: 1, unitClass: 'soldier', x: 2 + Math.min(4, 1 + (index % 4)), y: 2, hp: 60 },
            ],
            tiles: [{ x: 2, y: 2, terrainId: 10, ownerId: 0 }, { x: 0, y: 7, terrainId: 9, ownerId: null }],
        }));
    });

    states.push(base({
        id: 'synthetic/empty-board',
        note: '无单位棋盘：候选为空，必须定义“空候选”行为',
        width: 4, height: 4, players: [0, 1], units: [],
    }));
    states.push(base({
        id: 'synthetic/map-edge',
        note: '单位在棋盘角落，检查越界写入被忽略',
        width: 20, height: 20, players: [0, 1],
        units: [
            { id: 'corner', ownerId: 0, unitClass: 'soldier', x: 0, y: 0 },
            { id: 'corner2', ownerId: 0, unitClass: 'archer', x: 19, y: 19 },
            { id: 'foe', ownerId: 1, unitClass: 'wolf', x: 18, y: 19 },
        ],
    }));
    states.push(base({
        id: 'synthetic/pending-empty-castle',
        note: '空城 pending：候选只剩 pending 单位',
        width: 6, height: 6, players: [0, 1],
        units: [
            { id: 'rec', ownerId: 0, unitClass: 'soldier', x: 3, y: 3, apkPendingRecruitSource: 'empty_castle' },
            { id: 'foe', ownerId: 1, unitClass: 'soldier', x: 5, y: 5 },
        ],
        tiles: [{ x: 3, y: 3, terrainId: 10, ownerId: 0 }],
        pendingUnitId: 'rec',
        rules: { allowSurrender: true, allowPendingRecruitEndTurn: true },
    }));
    states.push(base({
        id: 'synthetic/graves-and-summoner',
        note: '墓碑与召唤者：summon 候选需要墓碑坐标',
        width: 8, height: 8, players: [0, 1],
        units: [
            { id: 'w1', ownerId: 0, unitClass: 'witch', x: 3, y: 3 },
            { id: 'foe', ownerId: 1, unitClass: 'soldier', x: 7, y: 7 },
        ],
        graves: [{ id: 'g1', pos: { x: 4, y: 3 }, remainingTurns: 2, ownerId: 0 }],
    }));
    states.push(base({
        id: 'synthetic/status-heavy',
        note: '中毒/致盲/虚弱/鼓舞同时存在，检查 effectiveStats 对编码的影响',
        width: 8, height: 8, players: [0, 1],
        units: [
            { id: 'poisoned', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, status: { type: 'poisoned', remainingTicks: 2 } },
            { id: 'blinded', ownerId: 0, unitClass: 'archer', x: 2, y: 3, status: { type: 'blinded', remainingTurns: 1 } },
            { id: 'weakened', ownerId: 0, unitClass: 'wolf', x: 3, y: 3, status: { type: 'weakened', remainingTurns: 1 } },
            { id: 'inspired', ownerId: 0, unitClass: 'berserker', x: 4, y: 4, status: { type: 'inspired', remainingTurns: 2 } },
            { id: 'foe1', ownerId: 1, unitClass: 'golem', x: 5, y: 5 },
            { id: 'foe2', ownerId: 1, unitClass: 'dragon', x: 5, y: 6, status: { type: 'poisoned', remainingTicks: 1 } },
        ],
    }));
    states.push(base({
        id: 'synthetic/three-players-ally',
        note: '三人局且 0/1 结盟：敌方集合与联盟语义',
        width: 10, height: 10, players: [0, 1, 2],
        units: [
            { id: 'u0', ownerId: 0, unitClass: 'commander', x: 1, y: 1 },
            { id: 'u1', ownerId: 1, unitClass: 'soldier', x: 1, y: 2 },
            { id: 'u2', ownerId: 2, unitClass: 'soldier', x: 8, y: 8 },
        ],
        rules: { alliances: { 0: 5, 1: 5, 2: 9 } },
    }));
    states.push(base({
        id: 'synthetic/four-players',
        note: '四人局：turnPlayerIds 与对手聚合',
        width: 12, height: 12, players: [0, 1, 2, 3],
        units: [0, 1, 2, 3].map((id) => ({ id: `p${id}`, ownerId: id, unitClass: id % 2 === 0 ? 'soldier' : 'archer', x: 1 + id * 3, y: 1 + id * 2 })),
    }));
    states.push(base({
        id: 'synthetic/terrain-variety',
        note: '覆盖全部 17 种地形，检查地形通道与防御加成',
        width: 20, height: 20, players: [0, 1],
        units: [
            { id: 'walker', ownerId: 0, unitClass: 'soldier', x: 1, y: 1 },
            { id: 'flyer', ownerId: 0, unitClass: 'ghost', x: 2, y: 1 },
            { id: 'foe', ownerId: 1, unitClass: 'archer', x: 18, y: 18 },
        ],
        tiles: Array.from({ length: 17 }, (_, i) => ({ x: i, y: 5, terrainId: i + 1, ownerId: i % 3 === 0 ? 0 : (i % 3 === 1 ? 1 : null) })),
    }));
    states.push(base({
        id: 'synthetic/commander-reserve',
        note: '指挥官已死 + 保留等级经验：招募语义槽 29/30',
        width: 8, height: 8, players: [0, 1],
        units: [{ id: 'foe', ownerId: 1, unitClass: 'soldier', x: 7, y: 7 }],
        tiles: [{ x: 3, y: 3, terrainId: 10, ownerId: 0 }],
        rules: { commanderRecruitBaseCost: 500, commanderCastleRecruitUsesPending: true },
    }));
    // 系统性补充：每个动作类型至少一个能产生该类型候选的状态。
    // 目的不是覆盖战术，而是保证一致性夹具的动作类型召回，避免把结论限制在少数类型上。
    states.push(base({
        id: 'synthetic/action-heal',
        note: '治疗：paladin 与受伤友军相邻（heal 候选的行动者字段）',
        width: 8, height: 8, players: [0, 1],
        units: [
            { id: 'healer', ownerId: 0, unitClass: 'paladin', x: 3, y: 3 },
            { id: 'hurt', ownerId: 0, unitClass: 'soldier', x: 3, y: 4, hp: 40 },
            { id: 'undead', ownerId: 1, unitClass: 'ghost', x: 4, y: 4, hp: 80 },
            { id: 'foe', ownerId: 1, unitClass: 'soldier', x: 7, y: 7 },
        ],
    }));
    states.push(base({
        id: 'synthetic/action-support',
        note: '支援：druid 等级高于已行动的友军（support 候选的行动者字段）',
        width: 8, height: 8, players: [0, 1],
        units: [
            { id: 'sup', ownerId: 0, unitClass: 'druid', x: 3, y: 3, level: 3 },
            { id: 'used', ownerId: 0, unitClass: 'soldier', x: 4, y: 3, hasMoved: true, hasActed: true },
            { id: 'used2', ownerId: 0, unitClass: 'archer', x: 3, y: 4, hasMoved: true, hasActed: true, hasBeenSupportedThisTurn: true },
            { id: 'foe', ownerId: 1, unitClass: 'soldier', x: 7, y: 7 },
        ],
    }));
    states.push(base({
        id: 'synthetic/action-repair-and-capture',
        note: '修理与占领：士兵站在损坏城镇上、指挥官站在中立城堡上',
        width: 8, height: 8, players: [0, 1],
        units: [
            { id: 'fixer', ownerId: 0, unitClass: 'soldier', x: 2, y: 2 },
            { id: 'cap', ownerId: 0, unitClass: 'commander', x: 5, y: 5 },
            { id: 'foe', ownerId: 1, unitClass: 'soldier', x: 7, y: 7 },
        ],
        tiles: [
            { x: 2, y: 2, terrainId: 8, ownerId: 0 },
            { x: 5, y: 5, terrainId: 10, ownerId: null },
        ],
    }));
    states.push(base({
        id: 'synthetic/action-destroy-town',
        note: '摧毁城镇：catapult 射程内的无主城镇（destroy_town 显式目标）',
        width: 10, height: 10, players: [0, 1],
        units: [
            { id: 'cat', ownerId: 0, unitClass: 'catapult', x: 2, y: 2 },
            { id: 'foe', ownerId: 1, unitClass: 'soldier', x: 9, y: 9 },
        ],
        tiles: [
            { x: 5, y: 2, terrainId: 9, ownerId: null },
            { x: 2, y: 2, terrainId: 6, ownerId: 0 },
        ],
    }));
    states.push(base({
        id: 'synthetic/action-post-attack-move',
        note: '突击后移动：wolf 攻击相邻目标后仍有移动力（先经一步攻击才出现该动作）',
        width: 8, height: 8, players: [0, 1],
        units: [
            { id: 'wolf', ownerId: 0, unitClass: 'wolf', x: 3, y: 3, movementRemaining: 6 },
            { id: 'prey', ownerId: 1, unitClass: 'soldier', x: 4, y: 3, hp: 70 },
            { id: 'foe', ownerId: 1, unitClass: 'soldier', x: 7, y: 7 },
        ],
    }));
    states.push(base({
        id: 'synthetic/action-recruit-classes',
        note: '招募：空城堡 + 可招募兵种（recruit_to_castle 的兵种与城堡坐标）',
        width: 8, height: 8, players: [0, 1],
        units: [{ id: 'foe', ownerId: 1, unitClass: 'soldier', x: 7, y: 7 }],
        tiles: [{ x: 3, y: 3, terrainId: 10, ownerId: 0 }],
        rules: { allowSurrender: true, recruitableUnits: ['soldier', 'archer', 'catapult', 'commander'] },
    }));
    states.push(base({
        id: 'synthetic/action-recruit-and-deploy',
        note: '指挥官站城堡时的直接部署（recruit_and_deploy 的落点）',
        width: 8, height: 8, players: [0, 1],
        units: [
            { id: 'cmd', ownerId: 0, unitClass: 'commander', x: 3, y: 3 },
            { id: 'foe', ownerId: 1, unitClass: 'soldier', x: 7, y: 7 },
        ],
        tiles: [{ x: 3, y: 3, terrainId: 10, ownerId: 0 }],
        rules: { commanderCastleRecruitUsesPending: false, recruitableUnits: ['soldier', 'archer'] },
    }));
    states.push(base({
        id: 'synthetic/action-wait-and-end-turn',
        note: 'wait / end_turn：已行动单位只剩待机与换回合',
        width: 6, height: 6, players: [0, 1],
        units: [
            { id: 'done', ownerId: 0, unitClass: 'soldier', x: 2, y: 2 },
            { id: 'foe', ownerId: 1, unitClass: 'soldier', x: 5, y: 5 },
        ],
        rules: { allowSurrender: true },
    }));
    states.push(base({
        id: 'synthetic/surrender-enabled',
        note: '允许投降时的 surrender 候选（策略过滤器会把它剔除，编码器仍需能编码）',
        width: 6, height: 6, players: [0, 1],
        units: [
            { id: 'u0', ownerId: 0, unitClass: 'soldier', x: 2, y: 2 },
            { id: 'foe', ownerId: 1, unitClass: 'soldier', x: 5, y: 5 },
        ],
        rules: { allowSurrender: true },
    }));
    states.push(base({
        id: 'synthetic/allied-owner-territory',
        note: '盟友领地与敌方领地并存，检查归属通道 8/9',
        width: 10, height: 10, players: [0, 1, 2],
        units: [
            { id: 'u0', ownerId: 0, unitClass: 'soldier', x: 2, y: 2 },
            { id: 'u2', ownerId: 2, unitClass: 'soldier', x: 7, y: 7 },
        ],
        tiles: [
            { x: 3, y: 2, terrainId: 9, ownerId: 1 },
            { x: 4, y: 2, terrainId: 9, ownerId: 2 },
            { x: 5, y: 2, terrainId: 9, ownerId: null },
        ],
        rules: { alliances: { 0: 4, 1: 4, 2: 7 } },
    }));
    return states;
}

async function main(): Promise<void> {
    const runId = arg('--run-id', 'v14_20260924_t14') as string;
    const rawDir = path.resolve(arg('--raw', path.join('v14', 'out', runId, 'T14-02', 'raw')) as string);
    const outDir = path.resolve(path.join('v14', 'out', runId, 'T14-03'));
    const minStates = Number(arg('--min-states', '128'));
    fs.mkdirSync(outDir, { recursive: true });

    // 1) 真实状态：从采集产物里按 root 均匀抽取决策点
    const realStates: Array<{ id: string; note: string; state: GameState; players: number[] }> = [];
    const rootsPath = path.join(rawDir, 'roots.jsonl');
    if (fs.existsSync(rootsPath)) {
        const roots: any[] = [];
        for await (const root of readJsonl<any>(rootsPath)) roots.push(root);
        const decisionsByRoot = new Map<string, any[]>();
        const decisionsPath = path.join(rawDir, 'decisions.jsonl');
        if (fs.existsSync(decisionsPath)) {
            for await (const decision of readJsonl<any>(decisionsPath)) {
                const bucket = decisionsByRoot.get(decision.rootFamilyId);
                if (bucket) bucket.push(decision);
                else decisionsByRoot.set(decision.rootFamilyId, [decision]);
            }
        }
        for (const root of roots) {
            const decisions = (decisionsByRoot.get(root.rootFamilyId) ?? []).sort((a, b) => a.stepIndex - b.stepIndex);
            if (decisions.length === 0) continue;
            const picks = [0, Math.floor(decisions.length / 4), Math.floor(decisions.length / 2), Math.floor((3 * decisions.length) / 4), decisions.length - 1];
            for (const index of [...new Set(picks)]) {
                const decision = decisions[index];
                realStates.push({
                    id: `real/${root.rootFamilyId}#${decision.stepIndex}`,
                    note: `真实采集状态 map=${root.mapName} players=${root.playerCount}`,
                    state: decision.state as GameState,
                    players: root.playerIds as number[],
                });
            }
        }
    }

    const synthetic = syntheticStates();
    const allStates = [...realStates, ...synthetic];
    if (allStates.length < minStates) {
        console.warn(`[T14-03] 真实+构造状态只有 ${allStates.length} 个，少于要求的 ${minStates}；` +
            '请先完成采集，或提高构造状态数量。本次仍会导出，但在报告中标注不足。');
    }

    // 2) 逐状态编码。状态只写一次（states[]），case 用 stateIndex 引用，避免同一状态被重复序列化。
    const cases: any[] = [];
    const stateTable = allStates.map((entry) => ({ id: entry.id, note: entry.note, state: entry.state }));
    const stateIndexById = new Map(stateTable.map((s, index) => [s.id, index]));
    for (const entry of allStates) {
        const state = entry.state;
        const stateIndex = stateIndexById.get(entry.id) as number;
        const players = entry.players.length ? entry.players : state.players.map((p) => p.id);
        for (const playerId of players) {
            const engine = new GameEngine(state);
            if (!engine.getState().players.some((p) => p.id === playerId && p.isAlive)) continue;
            const legal = engine.getLegalActions(playerId);
            const spatial = encodeGameStateSpatial(state, playerId, 'v2');
            const candidates = legal.map((action) => {
                const features = encodeCandidateActionSpatial(state, playerId, action, 'v2');
                return {
                    actionCode: encodeAction(action),
                    // 夹具保留结构化动作本身，Python 端据此复算坐标与语义；
                    // 只给 actionCode 会让 Python 端不得不自己再写一套解析器。
                    action,
                    actorCoord: features.actorCoord,
                    landingCoord: features.landingCoord,
                    targetCoord: features.targetCoord,
                    semantics: Array.from(features.semantics),
                };
            });
            cases.push({
                stateId: entry.id,
                stateIndex,
                note: entry.note,
                playerId,
                legalActionCodes: legal.map(encodeAction),
                spatialTensor: Array.from(spatial.spatialTensor),
                globalFeatures: Array.from(spatial.globalFeatures),
                mapWidth: spatial.mapWidth,
                mapHeight: spatial.mapHeight,
                candidates,
            });
        }
    }

    const skippedStates = allStates.length * 2 - cases.length;
    const fixture = {
        schema: 'v14_parity_fixture_1',
        task: 'T14-03',
        runId,
        generatedAt: new Date().toISOString(),
        encoderSchemaId: ENCODER_SCHEMA_ID,
        note: '本文件是 TS 端编码结果，供 python/tests/test_v14_encoder_parity.py 逐数值比对。' +
            'spatialTensor 与 globalFeatures 按 Float32 精度写出；candidates.semantics 同样为 Float32 精度。',
        terrainTables: {
            terrainConfig: TERRAIN_CONFIG,
            unitConfigs: UNIT_CONFIGS,
            unitClasses: Object.keys(UNIT_CONFIGS),
            apkTerrainConfigs: Object.fromEntries(APK_TERRAIN_CONFIGS.map((c: any) => [String(c.id), c])),
            skirmishApkToProject: Object.fromEntries(
                Object.entries(SKIRMISH_APK_TERRAIN_TO_PROJECT).map(([k, v]) => [String(k), v]),
            ),
        },
        counts: {
            states: allStates.length,
            realStates: realStates.length,
            syntheticStates: synthetic.length,
            cases: cases.length,
            skippedPlayerViews: Math.max(0, skippedStates),
            candidates: cases.reduce((a, c) => a + c.candidates.length, 0),
            minStatesRequired: minStates,
            meetsMinimum: allStates.length >= minStates,
        },
        states: stateTable,
        cases,
    };
    const outPath = path.join(outDir, 'parity_fixture.json');
    fs.writeFileSync(outPath, `${JSON.stringify(fixture)}\n`);
    console.log(`[T14-03] parity fixture: states=${fixture.counts.states} (real=${realStates.length} synthetic=${synthetic.length}) ` +
        `cases=${fixture.counts.cases} candidates=${fixture.counts.candidates}`);
    console.log(`[T14-03] -> ${outPath} (${(fs.statSync(outPath).size / 1048576).toFixed(1)} MB)`);
    if (!fixture.counts.meetsMinimum) {
        console.warn(`[T14-03] 状态数 ${allStates.length} < ${minStates}（要求至少 128 个诊断状态）`);
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
});
