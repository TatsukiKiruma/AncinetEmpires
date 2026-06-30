import { GameEngine } from './engine';
import { Ability, ApkScriptState, GameMetadata, GameState, Action, StepResult, UnitClass, LevelCap } from './types';
import { getLegalActions } from './rules';
import { AttackType, UNIT_CONFIGS } from './constants';
import { getAllianceId, getCommanderUnit, getCurrentPopulation, getCurrentUnitCount, getRecruitableUnits, getRuleConfig, getTurnPlayerIds, getUnitCost, isCommanderUnit, isTeamEnabled } from './rule_config';
import { getTileDefenseBonus, getTileHealPerTurn, getTileMoveCost, getTileTerrainConfig, getTileTerrainIdForRules, getTileTerrainKey } from './terrain_rules';
import { getEffectiveStats } from './abilities';
import { ApkTerrainMappingConfidence, getApkTerrainConfig, getSkirmishApkTerrainMappingInfo } from './apk_terrain';
import { APK_ABILITY_TYPE_TO_ID, APK_STATUS_TYPE_TO_ID, APK_UNIT_CLASS_TO_ID } from './apk_compat';

export function mulberry32(a: number): () => number {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

export interface TerrainMappingSummary {
  apkTileCount: number;
  byConfidence: Record<ApkTerrainMappingConfidence, number>;
  apkTerrainUsage: Record<number, number>;
  approximateApkTerrainIds: number[];
  unmappedApkTerrainIds: number[];
}

export interface ApkTerrainConfigSnapshot {
  id: number;
  kind: number;
  flagA: number;
  variant: number;
  linkedA: number;
  defenseBonus: number;
  healPerTurn: number;
  moveCost: number;
  flagB: number;
  linkedB: number;
  linkedC: number;
  flagC: number;
  tail: string;
}

export interface Observation {
  currentPlayer: number;
  pendingUnitId?: string;
  turn: number;
  turnPlayerIds: number[];
  mapWidth: number;
  mapHeight: number;
  metadata?: GameMetadata;
  terrainMappingSummary?: TerrainMappingSummary;
  apkScriptState?: ApkScriptState;
  rules: {
    initialGold: number | null;
    incomeVillage: number;
    incomeCastle: number;
    incomeCommanderBase: number;
    incomeCommanderGrowth: number;
    levelCap: LevelCap;
    unitLimit: number | null;
    populationLimit: number | null;
    recruitableUnits: UnitClass[] | null;
    priceOverrides: Partial<Record<UnitClass, number | null>>;
    commanderRecruitBaseCost: number | null;
    commanderRecruitCostGrowth: number;
    allowSurrender: boolean;
    allowPendingRecruitEndTurn: boolean;
    allowPendingRecruitSurrender: boolean;
    defeatOnNoUnitsAndNoCastles: boolean;
    defeatOnNoUnits: boolean;
    defeatOnCommanderDeath: boolean;
    defeatOnNoCastles: boolean;
    alliances: Record<number, number>;
    disabledTeams: number[];
    commanderUnitIds: Record<number, string>;
    teams: Record<number, {
      initialGold: number | null;
      unitLimit: number | null;
      populationLimit: number | null;
      recruitableUnits: UnitClass[] | null;
    }>;
  };
  players: Array<{
    id: number;
    gold: number;
    isAlive: boolean;
    isEnabled: boolean;
    allianceId: number;
    unitCount: number;
    population: number;
    unitLimit: number | null;
    populationLimit: number | null;
    recruitableUnits: UnitClass[];
    recruitCosts: Partial<Record<UnitClass, number>>;
    commanderUnitId: string | null;
    commanderDeathCount: number;
  }>;
  tiles: Array<{
    x: number;
    y: number;
    terrainId: number;
    ruleTerrainId: number;
    terrainKey: string;
    terrainTags: string[];
    ownerId: number | null;
    apkTerrainId?: number;
    apkTerrainRaw?: number;
    apkOwnerCode?: number;
    apkTerrainConfig?: ApkTerrainConfigSnapshot;
    apkTerrainMappingConfidence?: ApkTerrainMappingConfidence;
    apkTerrainMappingEvidence?: string[];
    defenseBonus: number;
    healPerTurn: number;
    moveCost: number;
  }>;
  units: Array<{
    id: string;
    apkUnitId?: number;
    apkUnitClassId: number;
    apkUnitExtra?: number;
    apkUnitCode?: string;
    apkStatic?: boolean;
    apkTargeted?: boolean;
    apkUnitHead?: number;
    apkMoveOverrides?: Record<number, number>;
    ownerId: number;
    unitClass: string;
    attackType: AttackType;
    population: number;
    cost: number | null;
    abilities: Ability[];
    apkAbilityIds: number[];
    baseAttack: number;
    basePhysicalDefense: number;
    baseMagicDefense: number;
    baseMinRange: number;
    baseMaxRange: number;
    baseMove: number;
    attackGrowth: number;
    defenseGrowth: number;
    maxHpGrowth: number;
    moveGrowth: number;
    tileTerrainId: number | null;
    tileRuleTerrainId: number | null;
    tileTerrainKey: string | null;
    tileTerrainTags: string[];
    tileOwnerId: number | null;
    tileApkTerrainId?: number;
    tileApkOwnerCode?: number;
    tileApkTerrainConfig?: ApkTerrainConfigSnapshot;
    tileApkTerrainMappingConfidence?: ApkTerrainMappingConfidence;
    tileApkTerrainMappingEvidence?: string[];
    tileDefenseBonus: number | null;
    tileHealPerTurn: number | null;
    tileMoveCost: number | null;
    isCommander: boolean;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    attack: number;
    physicalDefense: number;
    magicDefense: number;
    minRange: number;
    maxRange: number;
    move: number;
    level: number;
    exp: number;
    movementRemaining: number;
    hasMoved: boolean;
    hasActed: boolean;
    hasPostAttackMoved: boolean;
    hasBeenHealedThisTurn: boolean;
    hasBeenSupportedThisTurn: boolean;
    isPending: boolean;
    apkPendingRecruitSource?: 'empty_castle' | 'commander_castle';
    status: string | null;
    apkStatusId: number | null;
    statusRemainingTicks: number | null;
    statusRemainingTurns: number | null;
  }>;
  graves: Array<{
    id: string;
    x: number;
    y: number;
    remainingTurns: number;
  }>;
}

export interface EnvStepResult {
  state: GameState;
  observation: Observation;
  reward: number;
  done: boolean;
  info: string;
  legalActions: Action[];
  actionMask: boolean[];
}

export interface FixedActionSpaceOptions {
  width?: number;
  height?: number;
  unitClasses?: readonly UnitClass[];
  includeSurrender?: boolean;
  includeEndTurn?: boolean;
}

export interface FixedActionSpaceBlock {
  type: Action['type'];
  offset: number;
  size: number;
  dimensions: readonly string[];
}

export interface FixedActionSpaceDescriptor {
  width: number;
  height: number;
  tileCount: number;
  unitClasses: UnitClass[];
  blocks: FixedActionSpaceBlock[];
  size: number;
}

export interface FixedActionMask {
  descriptor: FixedActionSpaceDescriptor;
  legalActionIndexes: number[];
  actionMask: boolean[];
}

const DEFAULT_FIXED_ACTION_UNIT_CLASSES: readonly UnitClass[] = [
    'commander',
    'soldier',
    'ghost',
    'mermaid',
    'archer',
    'slime',
    'dark_mage',
    'water_elemental',
    'paladin',
    'witch',
    'berserker',
    'elf',
    'wolf',
    'ice_elemental',
    'golem',
    'druid',
    'catapult',
    'wolf_archer',
    'dragon',
    'skeleton',
    'crystal'
];

export function calculateArmyValue(state: GameState, playerId: number): number {
    const player = state.players.find(p => p.id === playerId);
    const goldValue = player?.gold ?? 0;
    const unitValue = state.units
        .filter(unit => unit.ownerId === playerId && unit.hp > 0)
        .reduce((sum, unit) => {
            const configuredCost = getUnitCost(state, playerId, unit.unitClass);
            const baseCost = configuredCost ?? UNIT_CONFIGS[unit.unitClass].cost ?? 0;
            const hpRatio = Math.max(0, unit.hp) / Math.max(1, getEffectiveStats(unit).maxHp);
            return sum + baseCost * hpRatio + 1;
        }, 0);

    return goldValue + unitValue;
}

function estimatePlyCount(state: GameState): number {
    const playerIds = state.players.map(player => player.id).sort((a, b) => a - b);
    const playerCount = Math.max(1, playerIds.length);
    const currentIndex = Math.max(0, playerIds.indexOf(state.currentPlayer));
    return Math.max(0, state.turn - 1) * playerCount + currentIndex + 1;
}

function cloneGameMetadata(metadata: GameMetadata | undefined): GameMetadata | undefined {
    if (!metadata) return undefined;
    return {
        ...metadata,
        apkSkirmishSetupOptions: metadata.apkSkirmishSetupOptions
            ? {
                initialGold: { ...metadata.apkSkirmishSetupOptions.initialGold },
                unitLimit: { ...metadata.apkSkirmishSetupOptions.unitLimit },
                levelCap: { ...metadata.apkSkirmishSetupOptions.levelCap },
                modes: {
                    default: metadata.apkSkirmishSetupOptions.modes.default,
                    options: [...metadata.apkSkirmishSetupOptions.modes.options],
                    labels: { ...metadata.apkSkirmishSetupOptions.modes.labels }
                }
            }
            : undefined,
        apkApproximateTerrainIds: metadata.apkApproximateTerrainIds
            ? [...metadata.apkApproximateTerrainIds]
            : undefined,
        apkUnmappedTerrainIds: metadata.apkUnmappedTerrainIds
            ? [...metadata.apkUnmappedTerrainIds]
            : undefined,
        apkRuleScriptIgnoredRestoreTeamIds: metadata.apkRuleScriptIgnoredRestoreTeamIds
            ? [...metadata.apkRuleScriptIgnoredRestoreTeamIds]
            : undefined,
        apkRuleScriptIgnoredGameOverAllianceIds: metadata.apkRuleScriptIgnoredGameOverAllianceIds
            ? [...metadata.apkRuleScriptIgnoredGameOverAllianceIds]
            : undefined,
        apkRuleScriptWarnings: metadata.apkRuleScriptWarnings
            ? [...metadata.apkRuleScriptWarnings]
            : undefined,
        apkStageStateScriptWarnings: metadata.apkStageStateScriptWarnings
            ? [...metadata.apkStageStateScriptWarnings]
            : undefined
    };
}

function buildApkTerrainConfigSnapshot(apkTerrainId: number | undefined): ApkTerrainConfigSnapshot | undefined {
    if (apkTerrainId === undefined) return undefined;
    const config = getApkTerrainConfig(apkTerrainId);
    if (!config) return undefined;

    return {
        id: config.id,
        kind: config.kind,
        flagA: config.flagA,
        variant: config.variant,
        linkedA: config.linkedA,
        defenseBonus: config.defenseBonus,
        healPerTurn: config.healPerTurn,
        moveCost: config.moveCost,
        flagB: config.flagB,
        linkedB: config.linkedB,
        linkedC: config.linkedC,
        flagC: config.flagC,
        tail: config.tail
    };
}

function buildTerrainMappingSummary(state: GameState): TerrainMappingSummary | undefined {
    const byConfidence: Record<ApkTerrainMappingConfidence, number> = {
        confirmed: 0,
        atlas: 0,
        approximate: 0,
        unmapped: 0
    };
    const apkTerrainUsage: Record<number, number> = {};
    const approximateApkTerrainIds = new Set<number>();
    const unmappedApkTerrainIds = new Set<number>();
    let apkTileCount = 0;

    for (const row of state.map.tiles) {
        for (const tile of row) {
            if (tile.apkTerrainId === undefined) continue;
            apkTileCount += 1;
            apkTerrainUsage[tile.apkTerrainId] = (apkTerrainUsage[tile.apkTerrainId] ?? 0) + 1;

            const mappingInfo = getSkirmishApkTerrainMappingInfo(tile.apkTerrainId);
            byConfidence[mappingInfo.confidence] += 1;
            if (mappingInfo.confidence === 'approximate') {
                approximateApkTerrainIds.add(tile.apkTerrainId);
            }
            if (mappingInfo.confidence === 'unmapped') {
                unmappedApkTerrainIds.add(tile.apkTerrainId);
            }
        }
    }

    if (apkTileCount === 0) return undefined;

    const sortedUsage = Object.fromEntries(
        Object.entries(apkTerrainUsage)
            .map(([apkTerrainId, count]) => [Number(apkTerrainId), count] as const)
            .sort(([left], [right]) => left - right)
    ) as Record<number, number>;

    return {
        apkTileCount,
        byConfidence,
        apkTerrainUsage: sortedUsage,
        approximateApkTerrainIds: [...approximateApkTerrainIds].sort((a, b) => a - b),
        unmappedApkTerrainIds: [...unmappedApkTerrainIds].sort((a, b) => a - b)
    };
}

function evaluateTimeoutWinnerAlliance(state: GameState): number {
    const valuesByAlliance = new Map<number, number>();
    for (const playerId of getTurnPlayerIds(state)) {
        const allianceId = getAllianceId(state, playerId);
        const currentValue = valuesByAlliance.get(allianceId) ?? 0;
        valuesByAlliance.set(allianceId, currentValue + calculateArmyValue(state, playerId));
    }

    let winnerAlliance = -1;
    let winnerValue = -Infinity;
    let tied = false;
    for (const [allianceId, value] of valuesByAlliance) {
        if (value > winnerValue) {
            winnerAlliance = allianceId;
            winnerValue = value;
            tied = false;
        } else if (value === winnerValue) {
            tied = true;
        }
    }

    return tied ? -1 : winnerAlliance;
}

function resolveFixedActionSpaceOptions(
    options: FixedActionSpaceOptions,
    state?: GameState
): Required<Pick<FixedActionSpaceOptions, 'width' | 'height' | 'unitClasses' | 'includeSurrender' | 'includeEndTurn'>> {
    const width = options.width ?? state?.map.width;
    const height = options.height ?? state?.map.height;
    if (!Number.isInteger(width) || !Number.isInteger(height) || !width || !height || width < 1 || height < 1) {
        throw new Error('固定动作空间需要有效的 width/height。');
    }

    return {
        width,
        height,
        unitClasses: [...(options.unitClasses ?? DEFAULT_FIXED_ACTION_UNIT_CLASSES)],
        includeSurrender: options.includeSurrender ?? true,
        includeEndTurn: options.includeEndTurn ?? true
    };
}

function appendFixedActionBlock(
    blocks: FixedActionSpaceBlock[],
    type: Action['type'],
    size: number,
    dimensions: readonly string[]
): number {
    const offset = blocks.reduce((sum, block) => sum + block.size, 0);
    blocks.push({ type, offset, size, dimensions });
    return offset + size;
}

function getFixedActionBlock(
    descriptor: FixedActionSpaceDescriptor,
    type: Action['type']
): FixedActionSpaceBlock | null {
    return descriptor.blocks.find(block => block.type === type) ?? null;
}

function getTileIndex(pos: { x: number; y: number }, width: number, height: number): number | null {
    if (!Number.isInteger(pos.x) || !Number.isInteger(pos.y)) return null;
    if (pos.x < 0 || pos.y < 0 || pos.x >= width || pos.y >= height) return null;
    return pos.y * width + pos.x;
}

function getFixedUnitClassIndex(unitClasses: readonly UnitClass[], unitClass: UnitClass): number | null {
    const index = unitClasses.indexOf(unitClass);
    return index >= 0 ? index : null;
}

export function getFixedActionSpaceDescriptor(options: FixedActionSpaceOptions): FixedActionSpaceDescriptor {
    const resolved = resolveFixedActionSpaceOptions(options);
    const tileCount = resolved.width * resolved.height;
    const unitClassCount = resolved.unitClasses.length;
    const blocks: FixedActionSpaceBlock[] = [];

    appendFixedActionBlock(blocks, 'move', tileCount * tileCount, ['fromTile', 'toTile']);
    appendFixedActionBlock(blocks, 'post_attack_move', tileCount * tileCount, ['fromTile', 'toTile']);
    appendFixedActionBlock(blocks, 'attack', tileCount * tileCount, ['attackerTile', 'targetTile']);
    appendFixedActionBlock(blocks, 'heal', tileCount * tileCount, ['healerTile', 'targetTile']);
    appendFixedActionBlock(blocks, 'support', tileCount * tileCount, ['supporterTile', 'targetTile']);
    appendFixedActionBlock(blocks, 'summon', tileCount * tileCount, ['summonerTile', 'graveTile']);
    appendFixedActionBlock(blocks, 'recruit_to_castle', unitClassCount * tileCount, ['unitClass', 'castleTile']);
    appendFixedActionBlock(blocks, 'recruit_and_deploy', unitClassCount * tileCount * tileCount, ['unitClass', 'castleTile', 'deployTile']);
    appendFixedActionBlock(blocks, 'capture', tileCount, ['unitTile']);
    appendFixedActionBlock(blocks, 'repair', tileCount, ['unitTile']);
    appendFixedActionBlock(blocks, 'destroy_town', tileCount, ['unitTile']);
    appendFixedActionBlock(blocks, 'wait', tileCount, ['unitTile']);
    if (resolved.includeSurrender) {
        appendFixedActionBlock(blocks, 'surrender', 1, []);
    }
    if (resolved.includeEndTurn) {
        appendFixedActionBlock(blocks, 'end_turn', 1, []);
    }

    return {
        width: resolved.width,
        height: resolved.height,
        tileCount,
        unitClasses: [...resolved.unitClasses],
        blocks,
        size: blocks.reduce((sum, block) => sum + block.size, 0)
    };
}

export function encodeFixedActionIndex(
    action: Action,
    state: GameState,
    options: FixedActionSpaceOptions = {}
): number | null {
    const descriptor = getFixedActionSpaceDescriptor({
        width: options.width ?? state.map.width,
        height: options.height ?? state.map.height,
        unitClasses: options.unitClasses,
        includeSurrender: options.includeSurrender,
        includeEndTurn: options.includeEndTurn
    });
    const block = getFixedActionBlock(descriptor, action.type);
    if (!block) return null;

    const unitById = new Map(state.units.map(unit => [unit.id, unit]));
    const graveById = new Map((state.graves ?? []).map(grave => [grave.id, grave]));
    const tileIndex = (pos: { x: number; y: number }) => getTileIndex(pos, descriptor.width, descriptor.height);
    const unitTileIndex = (unitId: string): number | null => {
        const unit = unitById.get(unitId);
        return unit ? tileIndex(unit.pos) : null;
    };

    switch (action.type) {
        case 'move':
        case 'post_attack_move': {
            const sourceIndex = unitTileIndex(action.unitId);
            const targetIndex = tileIndex(action.to);
            return sourceIndex === null || targetIndex === null
                ? null
                : block.offset + sourceIndex * descriptor.tileCount + targetIndex;
        }
        case 'attack': {
            const sourceIndex = unitTileIndex(action.attackerId);
            const target = unitById.get(action.targetId);
            const targetIndex = target ? tileIndex(target.pos) : null;
            return sourceIndex === null || targetIndex === null
                ? null
                : block.offset + sourceIndex * descriptor.tileCount + targetIndex;
        }
        case 'heal': {
            const sourceIndex = unitTileIndex(action.healerId);
            const target = unitById.get(action.targetId);
            const targetIndex = target ? tileIndex(target.pos) : null;
            return sourceIndex === null || targetIndex === null
                ? null
                : block.offset + sourceIndex * descriptor.tileCount + targetIndex;
        }
        case 'support': {
            const sourceIndex = unitTileIndex(action.supporterId);
            const target = unitById.get(action.targetId);
            const targetIndex = target ? tileIndex(target.pos) : null;
            return sourceIndex === null || targetIndex === null
                ? null
                : block.offset + sourceIndex * descriptor.tileCount + targetIndex;
        }
        case 'summon': {
            const sourceIndex = unitTileIndex(action.summonerId);
            const grave = graveById.get(action.graveId);
            const graveIndex = grave ? tileIndex(grave.pos) : tileIndex(action.spawnPos);
            return sourceIndex === null || graveIndex === null
                ? null
                : block.offset + sourceIndex * descriptor.tileCount + graveIndex;
        }
        case 'recruit_to_castle': {
            const unitClassIndex = getFixedUnitClassIndex(descriptor.unitClasses, action.unitClass);
            const castleIndex = tileIndex(action.castlePos);
            return unitClassIndex === null || castleIndex === null
                ? null
                : block.offset + unitClassIndex * descriptor.tileCount + castleIndex;
        }
        case 'recruit_and_deploy': {
            const unitClassIndex = getFixedUnitClassIndex(descriptor.unitClasses, action.unitClass);
            const castleIndex = tileIndex(action.castlePos);
            const deployIndex = tileIndex(action.to);
            return unitClassIndex === null || castleIndex === null || deployIndex === null
                ? null
                : block.offset + unitClassIndex * descriptor.tileCount * descriptor.tileCount + castleIndex * descriptor.tileCount + deployIndex;
        }
        case 'capture':
        case 'repair':
        case 'destroy_town':
        case 'wait': {
            const sourceIndex = unitTileIndex(action.unitId);
            return sourceIndex === null ? null : block.offset + sourceIndex;
        }
        case 'surrender':
        case 'end_turn':
            return block.offset;
        default:
            return null;
    }
}

export function getFixedLegalActionIndexes(
    state: GameState,
    actions: readonly Action[],
    options: FixedActionSpaceOptions = {}
): number[] {
    const seen = new Set<number>();
    for (const action of actions) {
        const index = encodeFixedActionIndex(action, state, options);
        if (index !== null) {
            seen.add(index);
        }
    }
    return [...seen].sort((left, right) => left - right);
}

export function buildFixedActionMask(
    state: GameState,
    actions: readonly Action[],
    options: FixedActionSpaceOptions = {}
): FixedActionMask {
    const descriptorOptions = {
        width: options.width ?? state.map.width,
        height: options.height ?? state.map.height,
        unitClasses: options.unitClasses,
        includeSurrender: options.includeSurrender,
        includeEndTurn: options.includeEndTurn
    };
    const descriptor = getFixedActionSpaceDescriptor(descriptorOptions);
    const legalActionIndexes = getFixedLegalActionIndexes(state, actions, descriptorOptions);
    const actionMask = new Array(descriptor.size).fill(false);
    for (const index of legalActionIndexes) {
        actionMask[index] = true;
    }

    return { descriptor, legalActionIndexes, actionMask };
}

export class AncientEmpiresEnv {
  private engine: GameEngine;
  private seed: number;
  private maxPlies: number;
  private initialConfig?: GameState;

  constructor(config?: {
    initialState?: GameState;
    seed?: number;
    maxPlies?: number;
  }) {
    this.seed = config?.seed ?? 0;
    this.maxPlies = config?.maxPlies ?? 1000;
    
    if (config?.initialState) {
        this.initialConfig = JSON.parse(JSON.stringify(config.initialState));
    }
    
    // We will initialize the engine in reset() to ensure a fresh state
    this.engine = new GameEngine(this.initialConfig as any); // just a placeholder before reset
    if (this.initialConfig) {
        this.reset(this.seed);
    }
  }

  public reset(seed?: number): EnvStepResult {
    if (seed !== undefined) {
      this.seed = seed;
    }
    
    if (!this.initialConfig) {
      throw new Error("AncientEmpiresEnv requires an initialState either in constructor or reset if unimplemented gen.");
    }
    this.engine = new GameEngine(JSON.parse(JSON.stringify(this.initialConfig)));
    return this.buildStepResult(0, false, "Environment reset");
  }

  public step(actionIndex: number): EnvStepResult {
      const legalActions = this.getLegalActions();
      if (actionIndex < 0 || actionIndex >= legalActions.length) {
          // 非法动作越界不改变状态，返回非法信息
          return this.buildStepResult(-0.01, false, "非法动作越界");
      }
      return this.stepAction(legalActions[actionIndex]);
  }

  public stepAction(action: Action): EnvStepResult {
      if (this.engine.isTerminal() || estimatePlyCount(this.engine.getState()) > this.maxPlies) {
           return this.buildStepResult(0, true, "Game over");
      }
      
      const currentPlayerBefore = this.engine.getState().currentPlayer;
      const res = this.engine.step(action);
      
      let reward = res.reward; 
      
      // We will override reward at env level as requested (sparse reward)
      let sparseReward = 0;
      let finalInfo = `Player ${currentPlayerBefore}: ${res.info}`;
      let done = res.done;
      
      // Override done if reached max plies
      const plies = estimatePlyCount(this.engine.getState());
      if (plies >= this.maxPlies && !done) {
          done = true;
          finalInfo += ". Max plies reached.";
      }
      
      if (res.info.includes("非法动作")) {
          sparseReward = -0.01;
      } else if (done) {
          // check win/loss from current player's perspective BEFORE the step!
          // But wait, the win condition checker updates state.winner. 
          const winner = this.engine.getState().winner;
          
          if (winner === null && plies >= this.maxPlies) {
              // 超时按金币与剩余军力价值评估，避免只数单位导致高价单位劣势。
              const state = this.engine.getState();
              const timeoutWinnerAlliance = evaluateTimeoutWinnerAlliance(state);
              
              if (timeoutWinnerAlliance === -1) {
                  sparseReward = 0;
              } else if (timeoutWinnerAlliance === getAllianceId(state, currentPlayerBefore)) {
                  sparseReward = 1;
              } else {
                  sparseReward = -1;
              }
          } else {
              if (winner === getAllianceId(this.engine.getState(), currentPlayerBefore)) {
                  sparseReward = 1;
              } else if (winner === -1) {
                  sparseReward = 0;
              } else {
                  sparseReward = -1;
              }
          }
      }

      return this.buildStepResult(sparseReward, done, finalInfo);
  }

  public stepFixedAction(actionIndex: number, options: FixedActionSpaceOptions = {}): EnvStepResult {
      const state = this.getState();
      const legalActions = this.getLegalActions();
      const matchedAction = legalActions.find(action => encodeFixedActionIndex(action, state, options) === actionIndex);
      if (!matchedAction) {
          return this.buildStepResult(-0.01, false, "非法固定动作索引");
      }
      return this.stepAction(matchedAction);
  }

  public getState(): GameState {
      return this.engine.getState();
  }

  public getCurrentPlayer(): number {
      return this.engine.getState().currentPlayer;
  }

  public getLegalActions(): Action[] {
      return this.engine.getLegalActions(this.getCurrentPlayer());
  }

  public getActionMask(): boolean[] {
      const actions = this.getLegalActions();
      return new Array(actions.length).fill(true);
  }

  public getFixedActionSpaceDescriptor(options: FixedActionSpaceOptions = {}): FixedActionSpaceDescriptor {
      const state = this.getState();
      return getFixedActionSpaceDescriptor({
          width: options.width ?? state.map.width,
          height: options.height ?? state.map.height,
          unitClasses: options.unitClasses,
          includeSurrender: options.includeSurrender,
          includeEndTurn: options.includeEndTurn
      });
  }

  public getFixedLegalActionIndexes(options: FixedActionSpaceOptions = {}): number[] {
      return getFixedLegalActionIndexes(this.getState(), this.getLegalActions(), options);
  }

  public getFixedActionMask(options: FixedActionSpaceOptions = {}): FixedActionMask {
      return buildFixedActionMask(this.getState(), this.getLegalActions(), options);
  }

  public getObservation(playerId?: number): Observation {
      const state = this.engine.getState();
      const rules = getRuleConfig(state);
      const terrainMappingSummary = buildTerrainMappingSummary(state);
      return {
          currentPlayer: state.currentPlayer,
          pendingUnitId: state.pendingUnitId,
          turn: state.turn,
          turnPlayerIds: getTurnPlayerIds(state),
          mapWidth: state.map.width,
          mapHeight: state.map.height,
          metadata: cloneGameMetadata(state.metadata),
          ...(terrainMappingSummary ? { terrainMappingSummary } : {}),
          apkScriptState: state.apkScriptState ? {
              booleans: state.apkScriptState.booleans ? { ...state.apkScriptState.booleans } : undefined,
              integers: state.apkScriptState.integers ? { ...state.apkScriptState.integers } : undefined
          } : undefined,
          rules: {
              initialGold: rules.initialGold ?? null,
              incomeVillage: rules.incomeVillage,
              incomeCastle: rules.incomeCastle,
              incomeCommanderBase: rules.incomeCommanderBase,
              incomeCommanderGrowth: rules.incomeCommanderGrowth,
              levelCap: rules.levelCap,
              unitLimit: rules.unitLimit ?? null,
              populationLimit: rules.populationLimit ?? null,
              recruitableUnits: rules.recruitableUnits ? [...rules.recruitableUnits] : null,
              priceOverrides: { ...rules.prices },
              commanderRecruitBaseCost: rules.commanderRecruitBaseCost,
              commanderRecruitCostGrowth: rules.commanderRecruitCostGrowth,
              allowSurrender: rules.allowSurrender,
              allowPendingRecruitEndTurn: rules.allowPendingRecruitEndTurn,
              allowPendingRecruitSurrender: rules.allowPendingRecruitSurrender,
              defeatOnNoUnitsAndNoCastles: rules.defeatOnNoUnitsAndNoCastles,
              defeatOnNoUnits: rules.defeatOnNoUnits,
              defeatOnCommanderDeath: rules.defeatOnCommanderDeath,
              defeatOnNoCastles: rules.defeatOnNoCastles,
              alliances: { ...rules.alliances },
              disabledTeams: [...rules.disabledTeams],
              commanderUnitIds: { ...rules.commanderUnitIds },
              teams: Object.fromEntries(Object.entries(rules.teams).map(([teamId, teamRules]) => [
                  Number(teamId),
                  {
                      initialGold: teamRules.initialGold ?? null,
                      unitLimit: teamRules.unitLimit ?? null,
                      populationLimit: teamRules.populationLimit ?? null,
                      recruitableUnits: teamRules.recruitableUnits ? [...teamRules.recruitableUnits] : null
                  }
              ]))
          },
          players: state.players.map(p => {
              const teamRules = rules.teams[p.id] ?? {};
              const recruitableUnits = getRecruitableUnits(state, p.id);
              const recruitCosts = Object.fromEntries(
                  recruitableUnits.map(unitClass => [unitClass, getUnitCost(state, p.id, unitClass)])
              ) as Partial<Record<UnitClass, number>>;
              return {
                  id: p.id,
                  gold: p.gold,
                  isAlive: p.isAlive,
                  isEnabled: isTeamEnabled(state, p.id),
                  allianceId: getAllianceId(state, p.id),
                  unitCount: getCurrentUnitCount(state, p.id),
                  population: getCurrentPopulation(state, p.id),
                  unitLimit: teamRules.unitLimit ?? rules.unitLimit ?? null,
                  populationLimit: teamRules.populationLimit ?? rules.populationLimit ?? null,
                  recruitableUnits,
                  recruitCosts,
                  commanderUnitId: getCommanderUnit(state, p.id)?.id ?? null,
                  commanderDeathCount: p.commanderDeathCount
              };
          }),
          tiles: state.map.tiles.flatMap((row, y) => row.map((t, x) => {
              const apkTerrainMappingInfo = t.apkTerrainId === undefined
                  ? null
                  : getSkirmishApkTerrainMappingInfo(t.apkTerrainId);
              return {
                  x,
                  y,
                  terrainId: t.terrainId,
                  ruleTerrainId: getTileTerrainIdForRules(t),
                  terrainKey: getTileTerrainKey(t),
                  terrainTags: [...getTileTerrainConfig(t).tags],
                  ownerId: t.ownerId,
                  apkTerrainId: t.apkTerrainId,
                  apkTerrainRaw: t.apkTerrainRaw,
                  apkOwnerCode: t.apkOwnerCode,
                  apkTerrainConfig: buildApkTerrainConfigSnapshot(t.apkTerrainId),
                  apkTerrainMappingConfidence: apkTerrainMappingInfo?.confidence,
                  apkTerrainMappingEvidence: apkTerrainMappingInfo
                      ? [...apkTerrainMappingInfo.evidence]
                      : undefined,
                  defenseBonus: getTileDefenseBonus(t),
                  healPerTurn: getTileHealPerTurn(t),
                  moveCost: getTileMoveCost(t)
              };
          })),
          units: state.units.map(u => {
              const effectiveStats = getEffectiveStats(u);
              const unitConfig = UNIT_CONFIGS[u.unitClass];
              const tile = state.map.tiles[u.pos.y]?.[u.pos.x];
              const unitTileMappingInfo = tile?.apkTerrainId === undefined
                  ? null
                  : getSkirmishApkTerrainMappingInfo(tile.apkTerrainId);
              return {
                  id: u.id,
                  apkUnitId: u.apkUnitId,
                  apkUnitClassId: APK_UNIT_CLASS_TO_ID[u.unitClass],
                  apkUnitExtra: u.apkUnitExtra,
                  apkUnitCode: u.apkUnitCode,
                  apkStatic: u.apkStatic,
                  apkTargeted: u.apkTargeted,
                  apkUnitHead: u.apkUnitHead,
                  apkMoveOverrides: u.apkMoveOverrides ? { ...u.apkMoveOverrides } : undefined,
                  ownerId: u.ownerId,
                  unitClass: u.unitClass,
                  attackType: unitConfig.attackType,
                  population: unitConfig.population,
                  cost: getUnitCost(state, u.ownerId, u.unitClass),
                  abilities: [...unitConfig.abilities],
                  apkAbilityIds: unitConfig.abilities.map(ability => APK_ABILITY_TYPE_TO_ID[ability]),
                  baseAttack: unitConfig.attack,
                  basePhysicalDefense: unitConfig.physicalDefense,
                  baseMagicDefense: unitConfig.magicDefense,
                  baseMinRange: unitConfig.minRange,
                  baseMaxRange: unitConfig.maxRange,
                  baseMove: unitConfig.move,
                  attackGrowth: unitConfig.attackGrowth,
                  defenseGrowth: unitConfig.defenseGrowth,
                  maxHpGrowth: unitConfig.maxHpGrowth,
                  moveGrowth: unitConfig.moveGrowth,
                  tileTerrainId: tile?.terrainId ?? null,
                  tileRuleTerrainId: tile ? getTileTerrainIdForRules(tile) : null,
                  tileTerrainKey: tile ? getTileTerrainKey(tile) : null,
                  tileTerrainTags: tile ? [...getTileTerrainConfig(tile).tags] : [],
                  tileOwnerId: tile?.ownerId ?? null,
                  tileApkTerrainId: tile?.apkTerrainId,
                  tileApkOwnerCode: tile?.apkOwnerCode,
                  tileApkTerrainConfig: buildApkTerrainConfigSnapshot(tile?.apkTerrainId),
                  tileApkTerrainMappingConfidence: unitTileMappingInfo?.confidence,
                  tileApkTerrainMappingEvidence: unitTileMappingInfo
                      ? [...unitTileMappingInfo.evidence]
                      : undefined,
                  tileDefenseBonus: tile ? getTileDefenseBonus(tile) : null,
                  tileHealPerTurn: tile ? getTileHealPerTurn(tile) : null,
                  tileMoveCost: tile ? getTileMoveCost(tile) : null,
                  isCommander: isCommanderUnit(state, u),
                  x: u.pos.x,
                  y: u.pos.y,
                  hp: u.hp,
                  maxHp: effectiveStats.maxHp,
                  attack: effectiveStats.attack,
                  physicalDefense: effectiveStats.physicalDefense,
                  magicDefense: effectiveStats.magicDefense,
                  minRange: effectiveStats.minRange,
                  maxRange: effectiveStats.maxRange,
                  move: effectiveStats.move,
                  level: u.level ?? 0,
                  exp: u.exp ?? 0,
                  movementRemaining: u.movementRemaining ?? effectiveStats.move,
                  hasMoved: u.hasMoved,
                  hasActed: u.hasActed,
                  hasPostAttackMoved: !!u.hasPostAttackMoved,
                  hasBeenHealedThisTurn: !!u.hasBeenHealedThisTurn,
                  hasBeenSupportedThisTurn: !!u.hasBeenSupportedThisTurn,
                  isPending: state.pendingUnitId === u.id,
                  apkPendingRecruitSource: u.apkPendingRecruitSource,
                  status: u.status ? u.status.type : null,
                  apkStatusId: u.status ? APK_STATUS_TYPE_TO_ID[u.status.type] : null,
                  statusRemainingTicks: u.status?.remainingTicks ?? null,
                  statusRemainingTurns: u.status?.remainingTurns ?? null
              };
          }),
          graves: state.graves ? state.graves.map(g => ({
              id: g.id,
              x: g.pos.x,
              y: g.pos.y,
              remainingTurns: g.remainingTurns
          })) : []
      };
  }

  public clone(): AncientEmpiresEnv {
      const copy = new AncientEmpiresEnv({
          initialState: this.initialConfig,
          seed: this.seed,
          maxPlies: this.maxPlies
      });
      copy.engine = this.engine.clone();
      return copy;
  }

  private buildStepResult(reward: number, done: boolean, info: string): EnvStepResult {
      return {
          state: this.getState(),
          observation: this.getObservation(),
          reward,
          done,
          info,
          legalActions: this.getLegalActions(),
          actionMask: this.getActionMask()
      };
  }
}

export const ACTION_SPACE_SCHEMA = [
    'move:<unitId>:<x>,<y>',
    'post_attack_move:<unitId>:<x>,<y>',
    'attack:<attackerId>:<targetId>',
    'heal:<healerId>:<targetId>',
    'support:<supporterId>:<targetId>',
    'summon:<summonerId>:<graveId>:<x>,<y>',
    'recruit_to_castle:<unitClass>:<castleX>,<castleY>',
    'recruit_and_deploy:<unitClass>:<castleX>,<castleY>:<toX>,<toY>',
    'capture:<unitId>',
    'repair:<unitId>',
    'destroy_town:<unitId>',
    'wait:<unitId>',
    'surrender',
    'end_turn'
] as const;

export function encodeAction(action: Action): string {
    switch (action.type) {
        case 'move': return `move:${action.unitId}:${action.to.x},${action.to.y}`;
        case 'post_attack_move': return `post_attack_move:${action.unitId}:${action.to.x},${action.to.y}`;
        case 'attack': return `attack:${action.attackerId}:${action.targetId}`;
        case 'heal': return `heal:${action.healerId}:${action.targetId}`;
        case 'support': return `support:${action.supporterId}:${action.targetId}`;
        case 'summon': return `summon:${action.summonerId}:${action.graveId}:${action.spawnPos.x},${action.spawnPos.y}`;
        case 'recruit_to_castle': return `recruit_to_castle:${action.unitClass}:${action.castlePos.x},${action.castlePos.y}`;
        case 'recruit_and_deploy': return `recruit_and_deploy:${action.unitClass}:${action.castlePos.x},${action.castlePos.y}:${action.to.x},${action.to.y}`;
        case 'capture': return `capture:${action.unitId}`;
        case 'repair': return `repair:${action.unitId}`;
        case 'destroy_town': return `destroy_town:${action.unitId}`;
        case 'wait': return `wait:${action.unitId}`;
        case 'surrender': return `surrender`;
        case 'end_turn': return `end_turn`;
        default: return `unknown`;
    }
}

export function decodeAction(code: string): Action | null {
    const parts = code.split(':');
    const type = parts[0];
    switch (type) {
        case 'move': {
            const [x, y] = parts[2].split(',').map(Number);
            return { type: 'move', unitId: parts[1], to: { x, y } };
        }
        case 'post_attack_move': {
            const [x, y] = parts[2].split(',').map(Number);
            return { type: 'post_attack_move', unitId: parts[1], to: { x, y } };
        }
        case 'attack': return { type: 'attack', attackerId: parts[1], targetId: parts[2] };
        case 'heal': return { type: 'heal', healerId: parts[1], targetId: parts[2] };
        case 'support': return { type: 'support', supporterId: parts[1], targetId: parts[2] };
        case 'summon': {
            const [x, y] = parts[3].split(',').map(Number);
            return { type: 'summon', summonerId: parts[1], graveId: parts[2], spawnPos: { x, y } };
        }
        case 'recruit_to_castle': {
            const [cx, cy] = parts[2].split(',').map(Number);
            return { type: 'recruit_to_castle', unitClass: parts[1] as any, castlePos: { x: cx, y: cy } };
        }
        case 'recruit_and_deploy': {
            const [cx, cy] = parts[2].split(',').map(Number);
            const [sx, sy] = parts[3].split(',').map(Number);
            return { type: 'recruit_and_deploy', unitClass: parts[1] as any, castlePos: { x: cx, y: cy }, to: { x: sx, y: sy } };
        }
        case 'capture': return { type: 'capture', unitId: parts[1] };
        case 'repair': return { type: 'repair', unitId: parts[1] };
        case 'destroy_town': return { type: 'destroy_town', unitId: parts[1] };
        case 'wait': return { type: 'wait', unitId: parts[1] };
        case 'surrender': return { type: 'surrender' };
        case 'end_turn': return { type: 'end_turn' };
        default: return null;
    }
}

export function getActionSpaceSchema(): string[] {
    // 这里暴露的是可变参数动作编码模板；实际可行动作仍以当前局面的 legalActions/actionMask 为准。
    return [...ACTION_SPACE_SCHEMA];
}
