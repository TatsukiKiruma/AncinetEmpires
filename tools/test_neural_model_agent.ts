import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { getSpatialPredictor, type SupportedSpatialPolicy } from '../src/game/ai/spatial_neural_adapter';
import { predictSpatialAction } from '../src/game/ai/shared_spatial_policy';
import { Action, GameState } from '../src/game/types';
import { calculateDamage } from '../src/game/rules';
import { isCommanderUnit, getAllianceId } from '../src/game/rule_config';

export class NeuralModelAI {
  private predictor = getSpatialPredictor('spatial_v2_experimental');

  public getAction(engine: GameEngine, playerId: number): Action {
    const state = engine.getState();
    const legalActions = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
    if (legalActions.length === 0) return { type: 'end_turn' };
    if (legalActions.length === 1) return legalActions[0];

    // 1. Check for immediate winning move (lethal on enemy commander or capturing last castle)
    for (const action of legalActions) {
      if (action.type === 'attack') {
        const target = state.units.find(u => u.id === action.targetId);
        if (target && isCommanderUnit(state, target)) {
          const dmg = calculateDamage(state, action.attackerId, target.id);
          if (dmg >= target.hp) {
            return action; // Immediate game win!
          }
        }
      }
    }

    // 2. Query the Trained Neural Model for action logits & state value
    const pred = predictSpatialAction(this.predictor, state, playerId, legalActions, 'v2');
    const logits = pred.actionLogits;

    // 3. Score candidates combining neural logits + safety gating
    const ownUnits = state.units.filter(u => u.ownerId === playerId && u.hp > 0);
    const unactedUnits = ownUnits.filter(u => !u.hasActed || !u.hasMoved);
    const ownGold = state.players.find(p => p.id === playerId)?.gold ?? 0;
    const commAlive = ownUnits.some(u => isCommanderUnit(state, u));

    let bestScore = -Infinity;
    let bestAction = legalActions[0];

    for (let i = 0; i < legalActions.length; i++) {
      const act = legalActions[i];
      let score = logits[i] ?? -100;

      // Penalize premature end_turn if we still have productive actions
      if (act.type === 'end_turn') {
        if (!commAlive && ownGold >= 500) {
          score -= 1000; // Must re-recruit commander if dead and have gold!
        } else if (unactedUnits.length > 0) {
          score -= 50; // Still have unacted units
        }
      }

      // Check suicidal commander move
      if (act.type === 'move') {
        const u = state.units.find(unit => unit.id === act.unitId);
        if (u && isCommanderUnit(state, u)) {
          // If commander moves forward alone, check if enemy can swarm
          const enemyAttackers = state.units.filter(eu => eu.ownerId !== playerId && eu.hp > 0);
          let potentialDmg = 0;
          for (const ea of enemyAttackers) {
            const dist = Math.abs(ea.pos.x - act.to.x) + Math.abs(ea.pos.y - act.to.y);
            if (dist <= 4) {
              potentialDmg += calculateDamage(state, ea.id, u.id);
            }
          }
          if (potentialDmg >= u.hp) {
            score -= 500; // Suicidal move vetoed!
          }
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

// Quick test match
console.log('Testing NeuralModelAI on Liberty Port...');
const engine = new GameEngine(createAppApkSkirmishGameState('(2) Liberty Port.aem', 'SD'));
const modelAI = new NeuralModelAI();
const heu = new HeuristicAI();

let steps = 0;
let lastTurn = -1;
const t0 = Date.now();

while (engine.getState().winner === null && steps < 100 * 80 && engine.getState().turn <= 50) {
  const s = engine.getState();
  if (s.turn !== lastTurn) {
    lastTurn = s.turn;
    const u0 = s.units.filter(u => u.ownerId === 0 && u.hp > 0).length;
    const u1 = s.units.filter(u => u.ownerId === 1 && u.hp > 0).length;
    console.log(`[T${s.turn}] gold=${s.players[0].gold}/${s.players[1].gold} units=${u0}/${u1} steps=${steps} (${Date.now() - t0}ms)`);
  }
  const act = s.currentPlayer === 0 ? modelAI.getAction(engine, 0) : heu.getAction(engine, 1);
  engine.step(act);
  steps++;
}
const st = engine.getState();
console.log(`Finished: winner=P${st.winner} in ${st.turn} turns, ${steps} steps (${Date.now() - t0}ms)`);
