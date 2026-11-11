import type { Action, GameState } from '../../game/types';
import { actionActor } from './tactical_prior';

interface PlannedStep { state: GameState; action: Action }

/** 只锁定存在跨单位依赖的协同前缀，普通接管不捎带后续启发式单位。 */
export function cooperativeQueueEnd(steps: readonly PlannedStep[], unitEnds: readonly number[]): number {
    const unitEnd = (index: number) => unitEnds.find(end => end > index) ?? steps.length;
    let end = unitEnds[0] ?? steps.length;
    const hits = new Map<string, Set<string>>(), combinedTargets = new Set<string>();
    for (let i = 0; i < steps.length; i++) {
        const action = steps[i].action;
        if (action.type === 'attack') {
            const actors = hits.get(action.targetId) ?? new Set<string>();
            actors.add(action.attackerId); hits.set(action.targetId, actors);
            if (actors.size > 1) { combinedTargets.add(action.targetId); end = Math.max(end, unitEnd(i)); }
        }
        for (let j = 0; j < i; j++) {
            const prior = steps[j].action;
            if (prior.type === 'support' && actionActor(action) === prior.targetId) end = Math.max(end, unitEnd(i));
            if (prior.type !== 'move' && prior.type !== 'post_attack_move') continue;
            const vacated = steps[j].state.units.find(u => u.id === prior.unitId)?.pos;
            if (!vacated) continue;
            const destination = action.type === 'move' || action.type === 'post_attack_move' ? action.to : action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy' ? action.castlePos : undefined;
            if (destination && actionActor(action) !== prior.unitId && destination.x === vacated.x && destination.y === vacated.y) end = Math.max(end, unitEnd(i));
        }
    }
    for (let i = 0; i < steps.length; i++) if (steps[i].action.type === 'capture') {
        const actor = actionActor(steps[i].action), pos = steps[i].state.units.find(u => u.id === actor)?.pos;
        if (pos && [...combinedTargets].some(id => {
            const target = steps[0].state.units.find(u => u.id === id);
            return target && target.pos.x === pos.x && target.pos.y === pos.y;
        })) end = Math.max(end, unitEnd(i));
    }
    return end;
}
