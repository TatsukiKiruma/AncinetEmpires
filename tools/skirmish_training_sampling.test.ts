import { describe, expect, it } from 'vitest';
import type {
    SkirmishEpisodeRecord,
    SkirmishEpisodeStep
} from './skirmish_training_runner';
import {
    selectEpisodeStepIndexes,
    StreamingSampleQuota
} from './skirmish_training_sampling';

function createEpisode(
    turnCount: number,
    summary: Partial<SkirmishEpisodeRecord['summary']>
): SkirmishEpisodeRecord {
    const steps = Array.from({ length: turnCount }, (_, index): SkirmishEpisodeStep => ({
        step: index + 1,
        turnBefore: index + 1,
        playerId: index % 2,
        policy: 'apk-like',
        legalActionCount: 10,
        fixedLegalActionCount: 10,
        fixedActionIndex: 0,
        actionCode: index % 2 === 0 ? 'move:u1:1,1' : 'attack:u1:u2',
        reward: 0,
        done: false,
        winnerAfter: null,
        info: '',
        illegal: false,
        incomeValueByPlayer: {},
        spendValue: 0,
        killValueByPlayer: {},
        lostValueByPlayer: {}
    }));
    return {
        kind: 'skirmish_episode',
        version: 1,
        scenario: {
            id: 'SD:test',
            mode: 'SD',
            mapName: 'test',
            resourcePath: 'test'
        },
        seed: 1,
        maxPlies: turnCount,
        maxSteps: turnCount,
        initialObservationHash: 'hash',
        initialLegalActionCount: 10,
        fixedActionSpaceSize: 10,
        players: [],
        policyByPlayer: {},
        steps,
        summary: {
            stepCount: turnCount,
            terminal: false,
            stoppedByMaxSteps: false,
            timeout: false,
            illegalActionCount: 0,
            totalReward: 0,
            winnerAlliance: null,
            adjudicatedWinnerAlliance: null,
            finalArmyValueByAlliance: {},
            finalTurn: turnCount,
            finalCurrentPlayer: 0,
            economyByPlayer: {},
            ...summary
        }
    };
}

describe('skirmish training sampling', () => {
    it('超时局保留可信前缀并去掉尾部', () => {
        const episode = createEpisode(10, { timeout: true });
        const selection = selectEpisodeStepIndexes(episode, {
            timeoutPrefixTurns: 6,
            timeoutTailTurns: 2
        });

        expect(selection.truncationKind).toBe('timeout');
        expect(selection.indexes).toEqual([0, 1, 2, 3, 4, 5]);
        expect(selection.droppedByTruncation).toBe(4);
    });

    it('局内样本配额会均匀保留时间跨度', () => {
        const episode = createEpisode(10, {});
        const selection = selectEpisodeStepIndexes(episode, {
            maxSamplesPerEpisode: 3
        });

        expect(selection.indexes).toEqual([0, 5, 9]);
        expect(selection.droppedByEpisodeQuota).toBe(7);
    });

    it('流式配额可同时限制动作类型与总样本数', () => {
        const quota = new StreamingSampleQuota({
            maxSamples: 3,
            maxByActionType: {
                move: 1
            }
        });

        expect(quota.accept({
            scenarioId: 'SD:test',
            policy: 'apk-like',
            actionCode: 'move:u1:1,1'
        })).toBe(true);
        expect(quota.accept({
            scenarioId: 'SD:test',
            policy: 'apk-like',
            actionCode: 'move:u1:1,2'
        })).toBe(false);
        expect(quota.accept({
            scenarioId: 'SD:test',
            policy: 'apk-like',
            actionCode: 'attack:u1:u2'
        })).toBe(true);
        expect(quota.accept({
            scenarioId: 'SD:test',
            policy: 'heuristic',
            actionCode: 'capture:u1'
        })).toBe(true);
        expect(quota.accept({
            scenarioId: 'SO:test',
            policy: 'heuristic',
            actionCode: 'wait:u1'
        })).toBe(false);

        expect(quota.snapshot()).toEqual(expect.objectContaining({
            accepted: 3,
            rejected: 2,
            byActionType: {
                move: 1,
                attack: 1,
                capture: 1
            }
        }));
    });
});
