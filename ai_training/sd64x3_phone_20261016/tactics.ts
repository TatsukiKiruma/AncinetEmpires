import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import type { Action, GameState } from '../../src/game/types';

export const TACTIC_KEYS = ['enemy_hp_loss', 'own_hp_loss', 'enemy_kills', 'own_kills', 'captured_tiles', 'gold_delta', 'actor_reply_damage', 'actor_reply_lethal', 'reply_known', 'legal_actor_supports'].map(k => 'tactic64x3.' + k);

/** 风险仅测对手下一手立即合法攻击，不用距离推断移动后威胁。 */
export function tacticalFeatures(engine: GameEngine, legal: readonly Action[]): number[][] {
  const before = engine.getState(), player = before.currentPlayer;
  const original = JSON.stringify(before);
  const hp = (s: GameState, own: boolean) => s.units.filter(u => (u.ownerId === player) === own).reduce((a, u) => a + u.hp, 0);
  const count = (s: GameState, own: boolean) => s.units.filter(u => (u.ownerId === player) === own).length;
  const out = legal.map(action => {
    const branch = engine.clone(), result = branch.step(action);
    if (result.info.includes('非法动作')) throw Error('战术输入不是权威合法候选');
    const after = result.state;
    const actorId = 'unitId' in action ? action.unitId : 'attackerId' in action ? action.attackerId : 'healerId' in action ? action.healerId : 'supporterId' in action ? action.supporterId : 'summonerId' in action ? action.summonerId : undefined;
    let captured = 0;
    for (let y = 0; y < before.map.height; y++) for (let x = 0; x < before.map.width; x++) {
      if (before.map.tiles[y][x].ownerId !== player && after.map.tiles[y][x].ownerId === player) captured++;
    }
    let supports = 0;
    const afterLegal = !branch.isTerminal() && after.currentPlayer === player ? branch.getLegalActions(player, { skipMovement: true }) : [];
    if (!branch.isTerminal() && after.currentPlayer === player) {
      supports = afterLegal.filter(a => (a.type === 'support' || a.type === 'heal') && a.targetId === actorId).length;
    }
    let known = false, risk = 0, lethal = 0;
    if (!branch.isTerminal()) {
      if (after.currentPlayer === player) {
        const end = afterLegal.find(a => a.type === 'end_turn');
        if (end) branch.step(end);
      }
      const reply = branch.getState(), actor = reply.units.find(u => u.id === actorId);
      if (reply.currentPlayer !== player && !branch.isTerminal()) {
        known = true;
        if (actor) for (const attack of branch.getLegalActions(reply.currentPlayer, { skipMovement: true })) {
          if (attack.type !== 'attack' || attack.targetId !== actor.id) continue;
          const hit = branch.clone().step(attack);
          if (hit.info.includes('非法动作')) throw Error('响应候选合同错误');
          const remaining = hit.state.units.find(u => u.id === actor.id);
          risk = Math.max(risk, actor.hp - (remaining?.hp ?? 0));
          lethal = Math.max(lethal, Number(!remaining));
        }
      }
    } else known = true;
    return [(hp(before, false) - hp(after, false)) / 128, (hp(before, true) - hp(after, true)) / 128,
      (count(before, false) - count(after, false)) / 16, (count(before, true) - count(after, true)) / 16,
      captured / 16, ((after.players.find(p => p.id === player)?.gold ?? 0) - (before.players.find(p => p.id === player)?.gold ?? 0)) / 1024,
      risk / 128, lethal, Number(known), supports / 16].map(Math.fround);
  });
  if (JSON.stringify(engine.getState()) !== original) throw Error('战术计算改写了原始状态');
  if (new Set(legal.map(encodeAction)).size !== legal.length) throw Error('候选动作码重复');
  return out;
}
