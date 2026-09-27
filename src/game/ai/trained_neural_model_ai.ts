import * as fs from 'node:fs';
import * as path from 'node:path';
import { GameEngine } from '../engine';
import { loadDualHeadModelFromJson, predictDecision, type DualHeadNet } from '../../../tools/skirmish_dual_head_net';
import { encodeGameState, encodeGameActionV2 } from '../../../tools/skirmish_network_features';
import { Action, GameState, Position } from '../types';
import { isCommanderUnit, getAllianceId } from '../rule_config';
import { calculateDamage } from '../rules';
import { getTileTerrainKey } from '../terrain_rules';
import { RuleTacticalEvaluator } from './tactical_evaluation';

let cachedModel: DualHeadNet | null = null;

function getTrainedModel(): DualHeadNet {
  if (cachedModel) return cachedModel;
  const p = path.resolve('src/game/ai/models/trained_5map_dual_head.json');
  const jsonStr = fs.readFileSync(p, 'utf8');
  cachedModel = loadDualHeadModelFromJson(jsonStr);
  return cachedModel;
}

export class TrainedNeuralModelAI {
  private net: DualHeadNet;

  constructor(customNet?: DualHeadNet) {
    this.net = customNet ?? getTrainedModel();
  }

  public getAction(engine: GameEngine, playerId: number, preparedActions?: readonly Action[]): Action {
    const state = engine.getState();
    const legal = (preparedActions ?? engine.getLegalActions(playerId)).filter(a => a.type !== 'surrender');
    if (legal.length === 0) return { type: 'end_turn' };
    if (legal.length === 1) return legal[0];

    // 1. Pending Unit Priority (rules requirement: if unit just recruited, must move/wait)
    const pendingId = state.pendingUnitId;
    if (pendingId) {
      const pendingUnit = state.units.find(u => u.id === pendingId && u.ownerId === playerId);
      if (pendingUnit && !pendingUnit.hasActed && pendingUnit.hp > 0) {
        const pendingActs = legal.filter(a => 'unitId' in a && a.unitId === pendingId);
        if (pendingActs.length > 0) {
          return this.selectBestAction(engine, state, playerId, pendingActs);
        }
      }
    }

    // 2. Immediate Lethal Check: kill enemy commander if possible
    for (const a of legal) {
      if (a.type === 'attack') {
        const target = state.units.find(u => u.id === a.targetId);
        if (target && isCommanderUnit(state, target)) {
          const dmg = calculateDamage(state, a.attackerId, target.id);
          if (dmg >= target.hp) {
            return a; // Lethal on enemy commander!
          }
        }
      }
    }

    return this.selectBestAction(engine, state, playerId, legal);
  }

  private selectBestAction(engine: GameEngine, state: GameState, playerId: number, actions: Action[]): Action {
    const ownAlliance = getAllianceId(state, playerId);
    const ownPlayer = state.players.find(p => p.id === playerId);
    const ownGold = ownPlayer?.gold ?? 0;
    const ownUnits = state.units.filter(u => u.ownerId === playerId && u.hp > 0);
    const commUnit = ownUnits.find(u => isCommanderUnit(state, u));
    const commAlive = commUnit !== undefined;
    const unactedUnits = ownUnits.filter(u => !u.hasActed || !u.hasMoved);

    // Compute candidate action features
    const stateVec = Array.from(encodeGameState(state, playerId));
    const candVecs = actions.map(a => Array.from(encodeGameActionV2(state, playerId, a)));

    // Policy Head prior scores for all candidates in one batch
    const decision = predictDecision(this.net, stateVec, candVecs);
    const policyLogits = decision.logits;

    // Tactical evaluator for ground-truth tactical safety and movement scoring
    const tactics = new RuleTacticalEvaluator(state, playerId);

    let bestScore = -Infinity;
    let bestAction = actions[0];

    // Find owned castles
    const ownedCastles: Position[] = [];
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        const t = state.map.tiles[y]?.[x];
        if (t && getTileTerrainKey(t) === 'castle' && t.ownerId !== null && getAllianceId(state, t.ownerId) === ownAlliance) {
          ownedCastles.push({ x, y });
        }
      }
    }
    const hasOpenCastle = ownedCastles.some(c => !state.units.some(u => u.hp > 0 && u.pos.x === c.x && u.pos.y === c.y));

    for (let i = 0; i < actions.length; i++) {
      const act = actions[i];

      // Base score: RuleTacticalEvaluator (same engine as HeuristicAI uses)
      let score = tactics.scoreAction(act);

      // Add model policy prior
      score += (policyLogits[i] ?? 0) * 20;

      // 1-Ply Neural Value Evaluation: evaluate resulting state s'
      const clone = engine.clone();
      clone.step(act);
      const nextState = clone.getState();

      if (nextState.winner !== null) {
        if (nextState.winner === playerId) {
          score += 200000; // Immediate win!
        } else {
          score -= 200000; // Immediate loss!
        }
      } else {
        const nextStateVec = Array.from(encodeGameState(nextState, playerId));
        const nextDecision = predictDecision(this.net, nextStateVec, []);
        score += nextDecision.value * 800; // Neural Value Head
      }

      // Invariant 1: Commander Protection
      if (commAlive && commUnit) {
        if ((act.type === 'move' || act.type === 'post_attack_move') && act.unitId === commUnit.id) {
          // Retreat low-HP commander to healing buildings
          if (commUnit.hp < 70) {
            const tile = state.map.tiles[act.to.y]?.[act.to.x];
            if (tile && (getTileTerrainKey(tile) === 'town' || getTileTerrainKey(tile) === 'castle') && tile.ownerId === playerId) {
              score += 25000; // Priority retreat to healing building!
            }
          }
        }
        // Penalize waiting on castle when gold is available
        if (act.type === 'wait' && act.unitId === commUnit.id) {
          const onCastle = ownedCastles.some(c => c.x === commUnit.pos.x && c.y === commUnit.pos.y);
          if (onCastle && ownGold >= 150) {
            score -= 40000; // Must unblock castle to recruit!
          }
        }
      }

      // Invariant 2: Castle Unblocking
      if (act.type === 'wait') {
        const u = state.units.find(unit => unit.id === act.unitId);
        if (u) {
          const onCastle = ownedCastles.some(c => c.x === u.pos.x && c.y === u.pos.y);
          if (onCastle && ownGold >= 150) {
            score -= 40000; // Must clear castle for recruitment!
          }
        }
      }
      if (act.type === 'move') {
        const u = state.units.find(unit => unit.id === act.unitId);
        if (u) {
          const wasOnCastle = ownedCastles.some(c => c.x === u.pos.x && c.y === u.pos.y);
          const movingOffCastle = !ownedCastles.some(c => c.x === act.to.x && c.y === act.to.y);
          if (wasOnCastle && movingOffCastle && ownGold >= 150) {
            score += 15000; // Unblocking castle for recruitment!
          }
        }
      }

      // Invariant 3: End Turn suppression
      if (act.type === 'end_turn') {
        if (!commAlive && ownGold >= 500) {
          score -= 100000; // Must re-hire commander!
        } else if (hasOpenCastle && ownGold >= 150) {
          score -= 50000; // Must recruit when castle is open!
        } else if (unactedUnits.length > 0) {
          score -= 5000;
        }
      }

      // Invariant 4: Immediate Commander Respawn
      if (!commAlive && ownGold >= 500) {
        if (act.type === 'recruit_to_castle' && act.unitClass === 'commander') {
          score += 80000; // Respawn commander immediately!
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestAction = act;
      }
    }

    return bestAction;
  }
}
