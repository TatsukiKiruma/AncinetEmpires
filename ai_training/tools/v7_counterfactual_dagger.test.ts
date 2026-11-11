import { describe, it, expect } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { Action, GameState, Position, Unit } from '../src/game/types';

describe('V7 Counterfactual Failure Detection (R7-04)', () => {
    const rules = getApkSkirmishRuleConfig('SD');

    function detectFailureWindow(
        state: GameState,
        playerId: number,
        studentAction: Action,
        teacherAction: Action,
        legalActions: Action[]
    ): { isFailure: boolean; failureType?: string } {
        const player = state.players.find(p => p.id === playerId);
        if (!player) return { isFailure: false };

        const commAlive = state.units.some(u => u.ownerId === playerId && u.unitClass === 'commander' && u.hp > 0);
        const commCost = 400;
        let castlePos: Position | null = null;
        for (let y = 0; y < state.map.height; y++) {
            for (let x = 0; x < state.map.width; x++) {
                if (state.map.tiles[y][x].terrainId === 10 && state.map.tiles[y][x].ownerId === playerId) {
                    castlePos = { x, y };
                    break;
                }
            }
        }

        // 1. Missed Rehire
        if (!commAlive && castlePos && player.gold >= commCost) {
            const unitOnCastle = state.units.find(u => u.pos.x === castlePos!.x && u.pos.y === castlePos!.y && u.hp > 0);
            if (!unitOnCastle) {
                const hasRehireLegal = legalActions.some(a => a.type === 'recruit_to_castle' && a.unitClass === 'commander');
                if (hasRehireLegal && (studentAction.type !== 'recruit_to_castle' || studentAction.unitClass !== 'commander')) {
                    return { isFailure: true, failureType: 'MISSED_REHIRE' };
                }
            } else if (unitOnCastle.ownerId === playerId) {
                if (studentAction.type !== 'move' || (studentAction as any).unitId !== unitOnCastle.id) {
                    return { isFailure: true, failureType: 'CASTLE_BLOCKED' };
                }
            }
        }

        return { isFailure: false };
    }

    it('flags MISSED_REHIRE when gold >= 400, castle open, commander dead, but student recruits soldier', () => {
        const state = createDemoState(rules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].gold = 500;

        const engine = new GameEngine(state);
        const legals = engine.getLegalActions(0);
        const rehireAction: Action = { type: 'recruit_to_castle', unitClass: 'commander', castlePos: { x: 0, y: 0 } };
        const blunderAction: Action = { type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 0, y: 0 } };

        const detection = detectFailureWindow(state, 0, blunderAction, rehireAction, legals);
        expect(detection.isFailure).toBe(true);
        expect(detection.failureType).toBe('MISSED_REHIRE');
    });

    it('flags CASTLE_BLOCKED when friendly unit on castle and student moves different unit', () => {
        const state = createDemoState(rules);
        state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        state.players[0].gold = 500;

        // Friendly soldier on castle (0, 0)
        const blocker: Unit = {
            id: 'u_blocker',
            ownerId: 0,
            unitClass: 'soldier',
            pos: { x: 0, y: 0 },
            hp: 100,
            maxHp: 100,
            hasMoved: false,
            hasActed: false
        };
        state.units.push(blocker);

        const blunderAction: Action = { type: 'end_turn' };
        const teacherAction: Action = { type: 'move', unitId: 'u_blocker', to: { x: 1, y: 0 } };

        const engine = new GameEngine(state);
        const legals = engine.getLegalActions(0);

        const detection = detectFailureWindow(state, 0, blunderAction, teacherAction, legals);
        expect(detection.isFailure).toBe(true);
        expect(detection.failureType).toBe('CASTLE_BLOCKED');
    });
});
