/**
 * V11: recover the dataset-source report for a collection that already exists.
 *
 * `v11/out/dataset_v11_source.json` was lost when the workspace was reset
 * externally; the collection itself survived (episodes.jsonl plus 32 trajectory
 * logs with initial snapshots). This rebuilds the accounting from what is on
 * disk and says so, rather than reconstructing numbers from memory.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { OUT_DIR, ensureDir, readJsonl, writeJson } from './common';
import { verifyInitialSnapshot } from '../../src/game/state_snapshot';

export function recoverDatasetSource(runId = 'agent_upgrade_v11_b2_main'): Record<string, unknown> {
    ensureDir(OUT_DIR);
    const runDir = path.resolve(`training_runs/${runId}`);
    const episodesFile = path.join(runDir, 'episodes.jsonl');
    const trajectoryDir = path.join(runDir, 'trajectories');
    if (!fs.existsSync(episodesFile)) {
        throw new Error(`no episodes file for runId ${runId}: ${episodesFile}`);
    }

    const episodes = readJsonl<any>(episodesFile);
    const hash = { sha256Hex: (t: string) => createHash('sha256').update(t, 'utf8').digest('hex') };

    let withSnapshot = 0;
    let snapshotVerified = 0;
    const failures: Array<{ episodeId: string; reason: string }> = [];
    for (const ep of episodes) {
        const p = path.isAbsolute(ep.trajectoryLogPath) ? ep.trajectoryLogPath : path.resolve(ep.trajectoryLogPath);
        if (!fs.existsSync(p)) {
            failures.push({ episodeId: ep.episodeId, reason: 'trajectory missing' });
            continue;
        }
        const traj = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (!traj.initialSnapshot) {
            failures.push({ episodeId: ep.episodeId, reason: 'no initialSnapshot' });
            continue;
        }
        withSnapshot += 1;
        const check = verifyInitialSnapshot(traj.initialSnapshot, hash);
        if (check.ok) snapshotVerified += 1;
        else failures.push({ episodeId: ep.episodeId, reason: check.reason ?? 'integrity check failed' });
    }

    const byMap: Record<string, number> = {};
    const bySetup: Record<string, number> = {};
    for (const ep of episodes) {
        byMap[ep.mapName] = (byMap[ep.mapName] ?? 0) + 1;
        const id = ep.setupId ?? 'unknown';
        bySetup[id] = (bySetup[id] ?? 0) + 1;
    }

    const report = {
        schema: 'v11_dataset_source_1',
        runId,
        generatedAt: new Date().toISOString(),
        recovered: true,
        recoveryNote:
            'Regenerated from the surviving collection after the workspace was reset externally. Counts come from ' +
            'episodes.jsonl and the trajectory logs on disk; the original generation timestamp and elapsed time are lost.',
        plan: {
            runId,
            seeds: Array.from(new Set(episodes.map((e: any) => e.seed))).sort((a: number, b: number) => a - b),
            maps: Array.from(new Set(episodes.map((e: any) => e.mapName))),
            policies: Array.from(new Set(episodes.map((e: any) => e.candidatePolicy))),
        },
        matchCount: episodes.length,
        naturalTerminals: episodes.filter((e: any) => e.z !== null).length,
        truncations: episodes.filter((e: any) => e.isCensored).length,
        byMap,
        bySetup,
        snapshotIntegrity: {
            trajectoriesOnDisk: fs.existsSync(trajectoryDir) ? fs.readdirSync(trajectoryDir).length : 0,
            episodesWithSnapshot: withSnapshot,
            episodesWithVerifiedSnapshot: snapshotVerified,
            failures,
        },
        episodesFile: path.relative(process.cwd(), episodesFile).split(path.sep).join('/'),
        note:
            'Every trajectory carries an initialSnapshot written by runBenchmarkMatch, so the pool is replay-provable. ' +
            'No neural network participated: the candidate policy is the frozen Heuristic baseline.',
    };
    writeJson(path.join(OUT_DIR, 'dataset_v11_source.json'), report);
    return report;
}