import { GameEngine } from './engine';
import { ApkScriptState, GameMetadata, GameState, Action, StepResult } from './types';
import { getLegalActions } from './rules';
import { UNIT_CONFIGS } from './constants';
import { getAllianceId, getTurnPlayerIds, getUnitCost } from './rule_config';
import { getTileDefenseBonus, getTileHealPerTurn, getTileMoveCost } from './terrain_rules';

export function mulberry32(a: number): () => number {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

export interface Observation {
  currentPlayer: number;
  turn: number;
  mapWidth: number;
  mapHeight: number;
  metadata?: GameMetadata;
  apkScriptState?: ApkScriptState;
  players: Array<{
    id: number;
    gold: number;
    isAlive: boolean;
    commanderDeathCount: number;
  }>;
  tiles: Array<{
    x: number;
    y: number;
    terrainId: number;
    ownerId: number | null;
    apkTerrainId?: number;
    apkTerrainRaw?: number;
    apkOwnerCode?: number;
    defenseBonus: number;
    healPerTurn: number;
    moveCost: number;
  }>;
  units: Array<{
    id: string;
    apkUnitCode?: string;
    apkStatic?: boolean;
    apkTargeted?: boolean;
    ownerId: number;
    unitClass: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    level: number;
    exp: number;
    hasMoved: boolean;
    hasActed: boolean;
    status: string | null;
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

export function calculateArmyValue(state: GameState, playerId: number): number {
    const player = state.players.find(p => p.id === playerId);
    const goldValue = player?.gold ?? 0;
    const unitValue = state.units
        .filter(unit => unit.ownerId === playerId && unit.hp > 0)
        .reduce((sum, unit) => {
            const configuredCost = getUnitCost(state, playerId, unit.unitClass);
            const baseCost = configuredCost ?? UNIT_CONFIGS[unit.unitClass].cost ?? 0;
            const hpRatio = Math.max(0, unit.hp) / Math.max(1, unit.maxHp);
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

  public getObservation(playerId?: number): Observation {
      const state = this.engine.getState();
      return {
          currentPlayer: state.currentPlayer,
          turn: state.turn,
          mapWidth: state.map.width,
          mapHeight: state.map.height,
          metadata: state.metadata ? { ...state.metadata } : undefined,
          apkScriptState: state.apkScriptState ? {
              booleans: state.apkScriptState.booleans ? { ...state.apkScriptState.booleans } : undefined,
              integers: state.apkScriptState.integers ? { ...state.apkScriptState.integers } : undefined
          } : undefined,
          players: state.players.map(p => ({
              id: p.id,
              gold: p.gold,
              isAlive: p.isAlive,
              commanderDeathCount: p.commanderDeathCount
          })),
          tiles: state.map.tiles.flatMap((row, y) => row.map((t, x) => ({
              x,
              y,
              terrainId: t.terrainId,
              ownerId: t.ownerId,
              apkTerrainId: t.apkTerrainId,
              apkTerrainRaw: t.apkTerrainRaw,
              apkOwnerCode: t.apkOwnerCode,
              defenseBonus: getTileDefenseBonus(t),
              healPerTurn: getTileHealPerTurn(t),
              moveCost: getTileMoveCost(t)
          }))),
          units: state.units.map(u => ({
              id: u.id,
              apkUnitCode: u.apkUnitCode,
              apkStatic: u.apkStatic,
              apkTargeted: u.apkTargeted,
              ownerId: u.ownerId,
              unitClass: u.unitClass,
              x: u.pos.x,
              y: u.pos.y,
              hp: u.hp,
              maxHp: u.maxHp,
              level: u.level ?? 0,
              exp: u.exp ?? 0,
              hasMoved: u.hasMoved,
              hasActed: u.hasActed,
              status: u.status ? u.status.type : null
          })),
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
        case 'end_turn': return { type: 'end_turn' };
        default: return null;
    }
}

export function getActionSpaceSchema(): string[] {
    return []; // For now not implemented as fixed global action space
}
