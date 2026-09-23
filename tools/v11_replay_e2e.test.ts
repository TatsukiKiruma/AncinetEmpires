/**
 * V11 T11-01 end-to-end: a freshly recorded match must be replay-provable.
 *
 * Before the T11-01 fix a recorded episode kept only `actionHistory`, so the
 * initial state was gone and setups varied per seed with nothing recording which
 * one was used. This test proves a recording made *now* can be revalidated from
 * the trajectory file alone, with no guessed setup.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BENCHMARK_MAPS, PolicyAgent, runBenchmarkMatch } from './v7_unified_evaluation';
import { readTrajectory, replayEpisode, resolveInitialSnapshot, v10SetupForSeed } from './v11/replay';

const SCRATCH_ROOT = path.resolve(process.env.V11_TEST_SCRATCH || '_work/v11_tmp');

function scratchDir(): string {
    fs.mkdirSync(SCRATCH_ROOT, { recursive: true });
    const dir = path.join(SCRATCH_ROOT, `v11_record_${randomUUID().slice(0, 8)}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

describe('T11-01: recordings carry a provable initial snapshot', () => {
    it('a recorded match replays from its trajectory file without a guessed setup', () => {
        const dir = scratchDir();
        const outcome = runBenchmarkMatch(BENCHMARK_MAPS[0].name, new PolicyAgent('HEURISTIC'), 0, 42, 6, 400, { runDir: dir });

        expect(outcome.trajectoryLogPath).toBeTruthy();
        const trajectory = readTrajectory(outcome.trajectoryLogPath);
        expect(trajectory).not.toBeNull();
        expect(trajectory!.initialSnapshot).toBeTruthy();

        const resolution = resolveInitialSnapshot({
            mapName: outcome.mapName,
            recordedSnapshot: trajectory!.initialSnapshot,
            recordedInitialStateHash: trajectory!.recordedInitialStateHash,
            setup: trajectory!.setupSelection,
            subjectSeat: trajectory!.candidateSeat ?? 0,
        });
        expect(resolution.provenance).toBe('RECORDED_SNAPSHOT');
        expect(resolution.snapshot).not.toBeNull();

        const validation = replayEpisode(
            outcome.matchId,
            outcome.mapName,
            trajectory!.actions,
            resolution.snapshot!,
            resolution.provenance,
            { hashEveryNSteps: 5 }
        );
        expect(validation.ok).toBe(true);
        expect(validation.stepsReplayed).toBe(trajectory!.actions.length);
        expect(validation.hashChecksPerformed).toBeGreaterThan(0);
    });

    it('the recorded snapshot is refused when its state is tampered with', () => {
        const dir = scratchDir();
        const outcome = runBenchmarkMatch(BENCHMARK_MAPS[0].name, new PolicyAgent('HEURISTIC'), 0, 7, 4, 300, { runDir: dir });
        const trajectory = readTrajectory(outcome.trajectoryLogPath)!;
        const tampered: any = JSON.parse(JSON.stringify(trajectory.initialSnapshot));
        tampered.state.players[0].gold += 25;

        const resolution = resolveInitialSnapshot({
            mapName: outcome.mapName,
            recordedSnapshot: tampered,
            recordedInitialStateHash: trajectory.recordedInitialStateHash,
            setup: trajectory.setupSelection,
            subjectSeat: trajectory.candidateSeat ?? 0,
        });
        expect(resolution.provenance).toBe('UNKNOWN_NOT_PROVEN');
        expect(resolution.reason).toContain('integrity check');
    });

    it('a non-default setup survives the round trip', () => {
        const dir = scratchDir();
        const nonDefault = { ...v10SetupForSeed(9001), initialGold: 700, unitLimit: 70, levelCap: 7 } as any;
        const outcome = runBenchmarkMatch(
            BENCHMARK_MAPS[0].name,
            new PolicyAgent('HEURISTIC'),
            1,
            11,
            4,
            300,
            { runDir: dir },
            undefined,
            nonDefault
        );
        const trajectory = readTrajectory(outcome.trajectoryLogPath)!;
        expect(trajectory.setupSelection).toEqual(nonDefault);
        expect(trajectory.initialSnapshot?.setupId).toBe('g700_u70_c7');

        // Reconstructing with the *default* setup must not be accepted.
        const wrong = resolveInitialSnapshot({
            mapName: outcome.mapName,
            recordedInitialStateHash: trajectory.recordedInitialStateHash,
            setup: v10SetupForSeed(9001),
        });
        expect(wrong.provenance).toBe('UNKNOWN_NOT_PROVEN');

        // Reconstructing with the recorded setup must be accepted.
        const right = resolveInitialSnapshot({
            mapName: outcome.mapName,
            recordedInitialStateHash: trajectory.recordedInitialStateHash,
            setup: trajectory.setupSelection,
            subjectSeat: trajectory.candidateSeat ?? 0,
        });
        expect(right.provenance).toBe('RECONSTRUCTED_HASH_VERIFIED');
    });
});
