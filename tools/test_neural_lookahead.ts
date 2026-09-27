import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { loadDualHeadModelFromJson, predictDecision, type DualHeadNet } from './skirmish_dual_head_net';
import { encodeGameState, encodeGameActionV2 } from './skirmish_network_features';
import netBData from '../src/game/ai/models/net_b_checkpoint.json';
import { Action, GameState } from '../src/game/types';
import { isCommanderUnit, getAllianceId } from '../src/game/rule_config';
import { calculateDamage } from '../src/game/rules';

const net: DualHeadNet = loadDualHeadModelFromJson(JSON.stringify(netBData));

export class NeuralLookaheadAI {
  public getAction(engine: GameEngine, playerId: number): Action {
    const state = engine.getState();
    const legalActions = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
    if (legalActions.length === 0) return { type: 'end_turn' };
    if (legalActions.length === 1) return legalActions[0];

    // 1. Immediate win check
    for (const action of legalActions) {
      if (action.type === 'attack') {
        const target = state.units.find(u => u.id === action.targetId);
        if (target && isCommanderUnit(state, target)) {
          const dmg = calculateDamage(state, action.attackerId, target.id);
          if (dmg >= target.hp) return action;
        }
      }
    }

    const stateVec = Array.from(encodeGameState(state, playerId));
    const candVecs = legalActions.map(a => Array.from(encodeGameActionV2(state, playerId, a)));
    const decision = predictDecision(net, stateVec, candVecs);
    const logits = decision.logits;

    if (state.turn === 1 && state.currentPlayer === playerId && legalActions.length > 5) {
      console.log('Turn 1 candidate action scores:');
      for (let i = 0; i < Math.min(10, legalActions.length); i++) {
        console.log(`  [${i}] ${JSON.stringify(legalActions[i])} -> logit=${logits[i]?.toFixed(2)}`);
      }
    }

    const ownUnits = state.units.filter(u => u.ownerId === playerId && u.hp > 0);
    const unactedUnits = ownUnits.filter(u => !u.hasActed || !u.hasMoved);
    const ownGold = state.players.find(p => p.id === playerId)?.gold ?? 0;
    const commAlive = ownUnits.some(u => isCommanderUnit(state, u));

    let bestScore = -Infinity;
    let bestAction = legalActions[0];

    for (let i = 0; i < legalActions.length; i++) {
      const act = legalActions[i];
      let score = logits[i] ?? 0;

      // 1-ply lookahead: evaluate next state using neural value head
      const clone = new GameEngine(JSON.parse(JSON.stringify(state)));
      clone.step(act);
      const nextState = clone.getState();

      if (nextState.winner !== null) {
        if (nextState.winner === playerId) score += 10000;
        else score -= 10000;
      } else {
        const nextStateVec = Array.from(encodeGameState(nextState, playerId));
        const nextDec = predictDecision(net, nextStateVec, []);
        score += nextDec.value * 2.0; // Neural Value Head contribution
      }

      // Invariants:
      // Don't prematurely end turn
      if (act.type === 'end_turn') {
        if (!commAlive && ownGold >= 500) score -= 1000;
        else if (unactedUnits.length > 0) score -= 50;
      }

      // Don't suicide commander
      if (act.type === 'move') {
        const u = state.units.find(unit => unit.id === act.unitId);
        if (u && isCommanderUnit(state, u)) {
          const enemies = state.units.filter(eu => eu.ownerId !== playerId && eu.hp > 0);
          let threat = 0;
          for (const e of enemies) {
            const d = Math.abs(e.pos.x - act.to.x) + Math.abs(e.pos.y - act.to.y);
            if (d <= 4) threat += calculateDamage(state, e.id, u.id);
          }
          if (threat >= u.hp) score -= 500;
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

// Run test on Liberty Port
console.log('Testing NeuralLookaheadAI (NET_B Value + Policy) on Liberty Port...');
const engine = new GameEngine(createAppApkSkirmishGameState('(2) Liberty Port.aem', 'SD'));
const ai = new NeuralLookaheadAI();
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
  const act = s.currentPlayer === 0 ? ai.getAction(engine, 0) : heu.getAction(engine, 1);
  engine.step(act);
  steps++;
}
const st = engine.getState();
console.log(`Finished: winner=P${st.winner} in ${st.turn} turns, ${steps} steps (${Date.now() - t0}ms)`);
