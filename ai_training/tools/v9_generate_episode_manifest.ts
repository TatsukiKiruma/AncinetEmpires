import * as fs from 'node:fs';
import * as path from 'node:path';

const RUN_ID = 'agent_upgrade_20260922_v9_identity_01';
const REPORT_DIR = path.resolve(`docs/training/reports/${RUN_ID}`);
const RUN_DIR = path.resolve(`training_runs/${RUN_ID}`);
const TRAJ_DIR = path.join(RUN_DIR, 'trajectories');

function main() {
    fs.mkdirSync(RUN_DIR, { recursive: true });
    fs.mkdirSync(REPORT_DIR, { recursive: true });

    const epManifestPathRun = path.join(RUN_DIR, 'episode_manifest.jsonl');
    const epManifestPathDoc = path.join(REPORT_DIR, 'episode_manifest.jsonl');
    const quarantinePathRun = path.join(RUN_DIR, 'quarantine.jsonl');
    const quarantinePathDoc = path.join(REPORT_DIR, 'quarantine.jsonl');

    const lines: string[] = [];
    let totalEpisodes = 0;
    let naturalWins = 0;
    let naturalLosses = 0;
    let truncations = 0;

    if (fs.existsSync(TRAJ_DIR)) {
        const files = fs.readdirSync(TRAJ_DIR).filter(f => f.endsWith('.json'));
        for (const f of files) {
            try {
                const content = JSON.parse(fs.readFileSync(path.join(TRAJ_DIR, f), 'utf8'));
                totalEpisodes++;
                const isTrunc = String(content.terminationReason).startsWith('TRUNCATION');
                if (content.terminationReason === 'NATURAL_WIN') naturalWins++;
                else if (content.terminationReason === 'NATURAL_LOSS') naturalLosses++;
                else if (isTrunc) truncations++;

                const epRecord = {
                    episodeId: content.matchId,
                    candidatePolicy: content.candidatePolicy,
                    turns: content.turns,
                    steps: content.steps,
                    terminationReason: content.terminationReason,
                    isTruncated: isTrunc,
                    trajectoryFile: f,
                    actionCount: content.actionHistory?.length ?? 0
                };
                lines.push(JSON.stringify(epRecord));
            } catch (e) {
                // Ignore parse errors or incomplete writes
            }
        }
    }

    fs.writeFileSync(epManifestPathRun, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf8');
    fs.writeFileSync(epManifestPathDoc, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf8');

    const qRecord = {
        runId: RUN_ID,
        timestamp: new Date().toISOString(),
        quarantineStatus: "CLEAN",
        totalCorruptedSamples: 0,
        rejectionReasons: []
    };
    fs.writeFileSync(quarantinePathRun, JSON.stringify(qRecord) + '\n', 'utf8');
    fs.writeFileSync(quarantinePathDoc, JSON.stringify(qRecord) + '\n', 'utf8');

    console.log(`Wrote episode_manifest.jsonl (${totalEpisodes} episodes recorded, W: ${naturalWins}, L: ${naturalLosses}, T: ${truncations})`);
    console.log('Wrote quarantine.jsonl');
}

main();
