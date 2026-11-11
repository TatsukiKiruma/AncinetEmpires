import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getExpThresholdForLevel } from '../src/game/abilities';
import {
    createApkSkirmishTrainingGameState,
    type ApkSkirmishSetupSelection,
    type ApkSkirmishTrainingScenario
} from '../src/game/apk_skirmish';
import type { ApkAemMap } from '../src/game/apk_map';
import { UNIT_CONFIGS } from '../src/game/constants';
import { TERRAIN_CONFIG, type TerrainId, type Tile } from '../src/game/terrain';
import { mergeRuleConfig } from '../src/game/rule_config';
import type { GameState, Position, Unit, UnitClass, UnitLevel } from '../src/game/types';

export type SdTrainingPlanKind =
    | 'normal'
    | 'parameter_variant'
    | 'advantage_endgame'
    | 'preset_units'
    | 'high_tier'
    | 'skill'
    | 'building_finish';

export interface SdTrainingPlanDerivation {
    profile?: string;
    focusUnitClasses?: UnitClass[];
    skillFocus?: string[];
}

export interface SdTrainingPlanEntry {
    id: string;
    label: string;
    kind: SdTrainingPlanKind;
    episodesPerMap: number;
    mapPlayerCounts?: number[];
    setup?: ApkSkirmishSetupSelection;
    derivation?: SdTrainingPlanDerivation;
}

export interface SdTrainingPlanConfig {
    version: number;
    name: string;
    mode: 'SD';
    description?: string;
    mapNames: string[];
    defaults: {
        seedBase: number;
        maxTurns: number;
        preset: string;
        setup: Required<Pick<ApkSkirmishSetupSelection, 'initialGold' | 'unitLimit' | 'levelCap'>>;
    };
    feature: {
        featureDim: number;
        maxCandidates: number;
        featureExtractor: string;
    };
    paths: {
        jobManifest: string;
        prepareReport: string;
        episodeDir: string;
        datasetDir: string;
        featureDir: string;
        modelDir: string;
    };
    replayCleaning: {
        rootDir: string;
        outDir: string;
        mode: 'SD';
        blacklistOrdinals: number[];
        blacklistFileNames: string[];
    };
    plans: SdTrainingPlanEntry[];
}

export interface SdTrainingJobSpec {
    kind: 'sd_training_job';
    version: 1;
    planId: string;
    planLabel: string;
    planKind: SdTrainingPlanKind;
    mapName: string;
    scenarioId: string;
    episodeIndex: number;
    seed: number;
    setup: ApkSkirmishSetupSelection;
    derived: boolean;
    maxTurns: number;
}

type UnitDraft = {
    unitClass: UnitClass;
    level?: UnitLevel;
    hp?: number;
    acted?: boolean;
    moved?: boolean;
};

const DERIVED_SCENARIO_PREFIX = 'SDPLAN';
const NORMAL_UNIT_CLASSES: UnitClass[] = ['soldier', 'archer', 'slime', 'water_elemental', 'dark_mage'];
const HIGH_TIER_FALLBACK: UnitClass[] = ['dragon', 'catapult', 'wolf_archer', 'druid', 'elf', 'golem', 'witch', 'paladin', 'ice_elemental'];

export async function loadSdTrainingPlanConfig(configPath: string): Promise<SdTrainingPlanConfig> {
    return JSON.parse(await readFile(path.resolve(configPath), 'utf8')) as SdTrainingPlanConfig;
}

export function getSdTrainingPlanEntry(config: SdTrainingPlanConfig, planId: string): SdTrainingPlanEntry {
    const plan = config.plans.find(item => item.id === planId);
    if (!plan) throw new Error(`找不到 SD 训练方案: ${planId}`);
    return plan;
}

export function buildSdPlanScenarioId(planId: string, mapName: string): string {
    return `${DERIVED_SCENARIO_PREFIX}:${planId}:${mapName}`;
}

export function parseSdPlanScenarioId(scenarioId: string): { planId: string; mapName: string } | null {
    const prefix = `${DERIVED_SCENARIO_PREFIX}:`;
    if (!scenarioId.startsWith(prefix)) return null;
    const rest = scenarioId.slice(prefix.length);
    const split = rest.indexOf(':');
    if (split < 0) return null;
    return {
        planId: rest.slice(0, split),
        mapName: rest.slice(split + 1)
    };
}

export function isDerivedSdPlan(plan: SdTrainingPlanEntry): boolean {
    return plan.kind !== 'normal' && plan.kind !== 'parameter_variant';
}

export function getPlanSetup(config: SdTrainingPlanConfig, plan: SdTrainingPlanEntry): ApkSkirmishSetupSelection {
    return {
        initialGold: plan.setup?.initialGold ?? config.defaults.setup.initialGold,
        unitLimit: plan.setup?.unitLimit ?? config.defaults.setup.unitLimit,
        levelCap: plan.setup?.levelCap ?? config.defaults.setup.levelCap
    };
}

export function buildSdTrainingJobs(config: SdTrainingPlanConfig): SdTrainingJobSpec[] {
    const jobs: SdTrainingJobSpec[] = [];
    for (let planIndex = 0; planIndex < config.plans.length; planIndex += 1) {
        const plan = config.plans[planIndex];
        for (let mapIndex = 0; mapIndex < config.mapNames.length; mapIndex += 1) {
            const mapName = config.mapNames[mapIndex];
            if (!isMapIncludedInPlan(plan, mapName)) continue;
            for (let episodeIndex = 0; episodeIndex < plan.episodesPerMap; episodeIndex += 1) {
                jobs.push({
                    kind: 'sd_training_job',
                    version: 1,
                    planId: plan.id,
                    planLabel: plan.label,
                    planKind: plan.kind,
                    mapName,
                    scenarioId: buildSdPlanScenarioId(plan.id, mapName),
                    episodeIndex,
                    seed: config.defaults.seedBase + planIndex * 100000 + mapIndex * 1000 + episodeIndex,
                    setup: getPlanSetup(config, plan),
                    derived: isDerivedSdPlan(plan),
                    maxTurns: config.defaults.maxTurns
                });
            }
        }
    }
    return jobs;
}

export function getSdTrainingMapPlayerCount(mapName: string): number | null {
    const match = mapName.match(/^\((\d+)\)/);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isMapIncludedInPlan(plan: SdTrainingPlanEntry, mapName: string): boolean {
    if (!plan.mapPlayerCounts || plan.mapPlayerCounts.length === 0) return true;
    const playerCount = getSdTrainingMapPlayerCount(mapName);
    return playerCount !== null && plan.mapPlayerCounts.includes(playerCount);
}

export function createSdTrainingGameState(
    map: ApkAemMap,
    scenario: ApkSkirmishTrainingScenario,
    config: SdTrainingPlanConfig,
    plan: SdTrainingPlanEntry,
    seed: number
): GameState {
    const baseState = createApkSkirmishTrainingGameState(map, scenario, {
        setup: getPlanSetup(config, plan)
    });
    if (!isDerivedSdPlan(plan)) {
        return tagGeneratedState(baseState, plan, seed);
    }
    return deriveSdTrainingState(baseState, plan, seed);
}

export function deriveSdTrainingState(baseState: GameState, plan: SdTrainingPlanEntry, seed: number): GameState {
    const state = cloneState(baseState);
    const rng = createRng(seed);
    const primaryTeams = selectPrimaryTeams(state);
    if (primaryTeams.length < 2) {
        throw new Error(`派生局面至少需要两个队伍: ${plan.id}`);
    }
    const [teamA, teamB] = primaryTeams;
    const disabledTeams = state.players
        .map(player => player.id)
        .filter(playerId => playerId !== teamA && playerId !== teamB);

    state.turn = plan.kind === 'advantage_endgame' || plan.kind === 'building_finish' ? 35 : 12;
    state.currentPlayer = teamA;
    state.winner = null;
    state.pendingUnitId = undefined;
    state.graves = [];
    state.units = [];
    state.players = state.players.map(player => ({
        ...player,
        isAlive: player.id === teamA || player.id === teamB,
        gold: player.id === teamA || player.id === teamB ? resolvePlanGold(plan) : 0,
        commanderDeathCount: 0
    }));
    state.rules = mergeRuleConfig(state.rules, {
        disabledTeams,
        alliances: Object.fromEntries(state.players.map(player => [player.id, player.id])),
        teams: Object.fromEntries(state.players.map(player => [
            player.id,
            {
                initialGold: player.id === teamA || player.id === teamB ? resolvePlanGold(plan) : 0,
                unitLimit: plan.setup?.unitLimit ?? 30
            }
        ]))
    });

    normalizeBuildings(state, teamA, teamB, plan.kind === 'building_finish');

    const anchors = getBattleAnchors(state, teamA, teamB);
    const occupied = new Set<string>();
    const teamAQueue = buildPositionQueue(state, anchors.teamA, occupied);
    const teamBQueue = buildPositionQueue(state, anchors.teamB, occupied);
    const rosters = buildRosters(plan, rng);

    const commanderA = addUnitDrafts(state, teamA, rosters.teamA, teamAQueue, occupied, plan.id);
    const commanderB = addUnitDrafts(state, teamB, rosters.teamB, teamBQueue, occupied, plan.id);
    state.rules = mergeRuleConfig(state.rules, {
        commanderUnitIds: {
            [teamA]: commanderA,
            [teamB]: commanderB
        }
    });

    if (plan.kind === 'skill') {
        prepareSkillState(state, teamA, teamB, occupied, rng);
    } else if (plan.kind === 'building_finish') {
        prepareBuildingFinishState(state, teamA, teamB, occupied);
    }

    state.nextUnitId = state.units.length;
    state.nextGraveId = (state.graves?.length ?? 0) + 100;
    return tagGeneratedState(state, plan, seed);
}

function cloneState(state: GameState): GameState {
    return JSON.parse(JSON.stringify(state)) as GameState;
}

function createRng(seed: number): () => number {
    let value = seed >>> 0;
    return () => {
        value += 0x6D2B79F5;
        let t = value;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function tagGeneratedState(state: GameState, plan: SdTrainingPlanEntry, seed: number): GameState {
    state.metadata = {
        ...(state.metadata ?? {}),
        apkSkirmishTrainingScenarioId: buildSdPlanScenarioId(plan.id, state.metadata?.apkMapName ?? 'unknown')
    };
    (state.metadata as Record<string, unknown>).sdTrainingPlanId = plan.id;
    (state.metadata as Record<string, unknown>).sdTrainingPlanKind = plan.kind;
    (state.metadata as Record<string, unknown>).sdTrainingSeed = seed;
    return state;
}

function selectPrimaryTeams(state: GameState): number[] {
    return state.players
        .filter(player => player.isAlive)
        .map(player => player.id)
        .sort((a, b) => a - b)
        .slice(0, 2);
}

function resolvePlanGold(plan: SdTrainingPlanEntry): number {
    return plan.setup?.initialGold ?? 300;
}

function normalizeBuildings(state: GameState, teamA: number, teamB: number, buildingFinish: boolean) {
    const midpoint = (state.map.width - 1) / 2;
    forEachTile(state, (tile, pos) => {
        if (!isBuilding(tile)) return;
        if (buildingFinish) {
            tile.ownerId = pos.x >= midpoint ? teamB : teamA;
        } else if (pos.x < midpoint - 1) {
            tile.ownerId = teamA;
        } else if (pos.x > midpoint + 1) {
            tile.ownerId = teamB;
        } else {
            tile.ownerId = null;
        }
    });
}

function forEachTile(state: GameState, visit: (tile: Tile, pos: Position) => void) {
    for (let y = 0; y < state.map.height; y += 1) {
        for (let x = 0; x < state.map.width; x += 1) {
            visit(state.map.tiles[y][x], { x, y });
        }
    }
}

function isBuilding(tile: Tile): boolean {
    return tile.terrainId === 8 || tile.terrainId === 9 || tile.terrainId === 10;
}

function getBattleAnchors(state: GameState, teamA: number, teamB: number): { teamA: Position; teamB: Position } {
    const y = Math.floor(state.map.height / 2);
    const left = Math.max(1, Math.floor(state.map.width / 2) - 2);
    const right = Math.min(state.map.width - 2, Math.floor(state.map.width / 2) + 2);
    return {
        teamA: findNearestUsablePosition(state, { x: left, y }, new Set(), teamA),
        teamB: findNearestUsablePosition(state, { x: right, y }, new Set(), teamB)
    };
}

function buildPositionQueue(state: GameState, anchor: Position, occupied: Set<string>): Position[] {
    const positions: Position[] = [];
    forEachTile(state, (tile, pos) => {
        if (!isUsableUnitTile(tile)) return;
        if (occupied.has(posKey(pos))) return;
        positions.push(pos);
    });
    return positions.sort((left, right) => {
        const distanceDiff = manhattan(left, anchor) - manhattan(right, anchor);
        if (distanceDiff !== 0) return distanceDiff;
        const yDiff = left.y - right.y;
        return yDiff !== 0 ? yDiff : left.x - right.x;
    });
}

function findNearestUsablePosition(
    state: GameState,
    origin: Position,
    occupied: Set<string>,
    ownerId: number | null
): Position {
    let best: Position | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    forEachTile(state, (tile, pos) => {
        if (!isUsableUnitTile(tile)) return;
        if (occupied.has(posKey(pos))) return;
        const ownerPenalty = ownerId !== null && tile.ownerId === ownerId ? -2 : 0;
        const score = manhattan(pos, origin) + ownerPenalty;
        if (score < bestScore) {
            best = pos;
            bestScore = score;
        }
    });
    if (!best) throw new Error('找不到可用单位落点');
    return best;
}

function isUsableUnitTile(tile: Tile): boolean {
    if (tile.terrainId === 2 || tile.terrainId === 16) return false;
    const tags = TERRAIN_CONFIG[tile.terrainId as TerrainId]?.tags ?? [];
    return !tags.includes('special') || tile.terrainId === 13 || tile.terrainId === 15;
}

function manhattan(left: Position, right: Position): number {
    return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function posKey(pos: Position): string {
    return `${pos.x},${pos.y}`;
}

function buildRosters(plan: SdTrainingPlanEntry, rng: () => number): { teamA: UnitDraft[]; teamB: UnitDraft[] } {
    if (plan.kind === 'advantage_endgame') {
        return buildAdvantageRosters(plan.derivation?.profile ?? 'small_advantage');
    }
    if (plan.kind === 'preset_units') {
        const focus = chooseRotatingClasses(plan.derivation?.focusUnitClasses ?? HIGH_TIER_FALLBACK, rng, 3);
        return {
            teamA: withCommander([...focus, 'soldier', 'archer']),
            teamB: withCommander([...focus.slice().reverse(), 'soldier', 'archer'])
        };
    }
    if (plan.kind === 'high_tier') {
        const focus = chooseRotatingClasses(plan.derivation?.focusUnitClasses ?? HIGH_TIER_FALLBACK, rng, 4);
        return {
            teamA: withCommander(focus.map(unitClass => ({ unitClass, level: 1 as UnitLevel }))),
            teamB: withCommander(['soldier', 'archer', 'paladin', 'wolf', 'golem'])
        };
    }
    if (plan.kind === 'skill') {
        const focus = chooseRotatingStrings(plan.derivation?.skillFocus ?? ['heal', 'summon', 'support', 'aura', 'assault'], rng, 1)[0];
        return buildSkillRosters(focus);
    }
    if (plan.kind === 'building_finish') {
        return {
            teamA: withCommander([
                { unitClass: 'soldier', level: 1 as UnitLevel },
                'paladin',
                'catapult',
                'dragon',
                'wolf_archer'
            ]),
            teamB: withCommander(['soldier', 'archer'])
        };
    }
    return {
        teamA: withCommander(['soldier', 'archer', 'paladin']),
        teamB: withCommander(['soldier', 'archer', 'slime'])
    };
}

function withCommander(units: Array<UnitClass | UnitDraft>): UnitDraft[] {
    return [
        { unitClass: 'commander', level: 1 },
        ...units.map(item => typeof item === 'string' ? { unitClass: item } : item)
    ];
}

function buildAdvantageRosters(profile: string): { teamA: UnitDraft[]; teamB: UnitDraft[] } {
    const smallA = withCommander(['soldier', 'archer', 'paladin', 'wolf']);
    const smallB = withCommander(['soldier', 'archer', 'slime']);
    const mediumA = withCommander(['soldier', 'archer', 'paladin', 'wolf', 'golem', 'catapult']);
    const mediumB = withCommander(['soldier', 'archer', 'slime', 'water_elemental']);
    const largeA = withCommander([
        { unitClass: 'dragon', level: 1 },
        'wolf_archer',
        'paladin',
        'catapult',
        'soldier',
        'druid'
    ]);
    const largeB = withCommander(['soldier', 'archer']);

    if (profile === 'medium_advantage') return { teamA: mediumA, teamB: mediumB };
    if (profile === 'large_advantage') return { teamA: largeA, teamB: largeB };
    if (profile === 'small_disadvantage') return { teamA: smallB, teamB: smallA };
    if (profile === 'medium_disadvantage') return { teamA: mediumB, teamB: mediumA };
    return { teamA: smallA, teamB: smallB };
}

function buildSkillRosters(focus: string): { teamA: UnitDraft[]; teamB: UnitDraft[] } {
    if (focus === 'heal') {
        return {
            teamA: withCommander(['paladin', { unitClass: 'soldier', hp: 45 }, 'archer']),
            teamB: withCommander(['soldier', 'archer', 'slime'])
        };
    }
    if (focus === 'summon') {
        return {
            teamA: withCommander(['witch', 'soldier', 'archer']),
            teamB: withCommander(['soldier', 'archer', 'ghost'])
        };
    }
    if (focus === 'support') {
        return {
            teamA: withCommander(['druid', { unitClass: 'soldier', acted: true, moved: true }, 'archer']),
            teamB: withCommander(['soldier', 'archer', 'wolf'])
        };
    }
    if (focus === 'aura') {
        return {
            teamA: withCommander(['elf', 'golem', 'druid', 'soldier']),
            teamB: withCommander(['soldier', 'archer', 'dark_mage'])
        };
    }
    return {
        teamA: withCommander(['wolf', 'dragon', 'wolf_archer', 'soldier']),
        teamB: withCommander(['soldier', 'archer', 'paladin'])
    };
}

function chooseRotatingClasses(classes: UnitClass[], rng: () => number, count: number): UnitClass[] {
    const start = Math.floor(rng() * Math.max(1, classes.length));
    return Array.from({ length: count }, (_, index) => classes[(start + index) % classes.length]);
}

function chooseRotatingStrings(values: string[], rng: () => number, count: number): string[] {
    const start = Math.floor(rng() * Math.max(1, values.length));
    return Array.from({ length: count }, (_, index) => values[(start + index) % values.length]);
}

function addUnitDrafts(
    state: GameState,
    ownerId: number,
    drafts: UnitDraft[],
    queue: Position[],
    occupied: Set<string>,
    planId: string
): string {
    let commanderId = '';
    for (let index = 0; index < drafts.length; index += 1) {
        const draft = drafts[index];
        const pos = takeNextPosition(queue, occupied);
        const unit = createUnit(planId, ownerId, index, draft, pos);
        if (unit.unitClass === 'commander') commanderId = unit.id;
        state.units.push(unit);
        occupied.add(posKey(pos));
    }
    if (!commanderId) {
        const pos = takeNextPosition(queue, occupied);
        const commander = createUnit(planId, ownerId, drafts.length, { unitClass: 'commander', level: 1 }, pos);
        state.units.unshift(commander);
        occupied.add(posKey(pos));
        commanderId = commander.id;
    }
    return commanderId;
}

function takeNextPosition(queue: Position[], occupied: Set<string>): Position {
    while (queue.length > 0) {
        const pos = queue.shift()!;
        if (!occupied.has(posKey(pos))) return pos;
    }
    throw new Error('派生局面单位数量超过可用落点');
}

function createUnit(planId: string, ownerId: number, index: number, draft: UnitDraft, pos: Position): Unit {
    const level = draft.level ?? 0;
    const config = UNIT_CONFIGS[draft.unitClass];
    const maxHp = Math.max(1, 100 + config.maxHpGrowth * level);
    const hp = Math.max(1, Math.min(maxHp, draft.hp ?? maxHp));
    return {
        id: `sd_${sanitizeId(planId)}_p${ownerId}_${index}_${draft.unitClass}`,
        ownerId,
        unitClass: draft.unitClass,
        pos: { ...pos },
        hp,
        maxHp,
        hasMoved: draft.moved ?? false,
        hasActed: draft.acted ?? false,
        level,
        exp: getExpThresholdForLevel(level)
    };
}

function sanitizeId(value: string): string {
    return value.replace(/[^a-zA-Z0-9_]/g, '_');
}

function prepareSkillState(state: GameState, teamA: number, teamB: number, occupied: Set<string>, rng: () => number) {
    const witch = state.units.find(unit => unit.ownerId === teamA && unit.unitClass === 'witch');
    if (witch) {
        const gravePos = findNearestUsablePosition(state, { x: witch.pos.x + 1, y: witch.pos.y }, occupied, null);
        state.graves = [
            ...(state.graves ?? []),
            {
                id: `sd_grave_${Math.floor(rng() * 100000)}`,
                pos: gravePos,
                remainingTurns: 2,
                ownerId: teamB
            }
        ];
        occupied.add(posKey(gravePos));
    }

    const injured = state.units.find(unit => unit.ownerId === teamA && unit.unitClass !== 'commander' && unit.unitClass !== 'witch');
    if (injured) {
        injured.hp = Math.min(injured.hp, Math.max(1, Math.floor(injured.maxHp * 0.45)));
    }
}

function prepareBuildingFinishState(state: GameState, teamA: number, teamB: number, occupied: Set<string>) {
    const enemyBuildings: Position[] = [];
    forEachTile(state, (tile, pos) => {
        if (!isBuilding(tile)) return;
        tile.ownerId = teamB;
        enemyBuildings.push(pos);
    });
    if (enemyBuildings.length === 0) return;

    const capturer = state.units.find(unit => unit.ownerId === teamA && (unit.unitClass === 'commander' || unit.unitClass === 'soldier' || unit.unitClass === 'paladin'));
    if (!capturer) return;
    const target = enemyBuildings.sort((left, right) => manhattan(left, capturer.pos) - manhattan(right, capturer.pos))[0];
    occupied.delete(posKey(capturer.pos));
    capturer.pos = { ...target };
    occupied.add(posKey(target));
}
