import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import {
    reconstructGameStateFromObservation,
    validateStateActionParity,
    type QuarantineRecord
} from './skirmish_provenance_split';

export async function runParityProbe(limit = 50) {
    const datasetPath = path.resolve('training_runs/agent_upgrade_20260919_01/baseline_dataset/dataset_part_00.jsonl');
    const reportDir = path.resolve('docs/training/reports/agent_upgrade_20260920_v4_01');
    const datasetOutDir = path.resolve('training_runs/agent_upgrade_20260920_v4_01/datasets');

    fs.mkdirSync(reportDir, { recursive: true });
    fs.mkdirSync(datasetOutDir, { recursive: true });

    const rl = readline.createInterface({
        input: fs.createReadStream(datasetPath, { encoding: 'utf8' })
    });

    let verifiedCount = 0;
    let quarantinedCount = 0;
    const quarantineRecords: QuarantineRecord[] = [];
    const sampleVerifications: any[] = [];

    let lineIndex = 0;
    for await (const line of rl) {
        if (!line.trim()) continue;
        lineIndex++;

        let s: any;
        try {
            s = JSON.parse(line);
        } catch (err: any) {
            quarantinedCount++;
            quarantineRecords.push({
                provenanceId: `line_${lineIndex}`,
                reasonCode: 'SCHEMA_ERROR',
                details: `JSON 解析失败: ${err.message}`,
                rawSampleSummary: { lineIndex },
                timestamp: new Date().toISOString()
            });
            continue;
        }

        const recon = reconstructGameStateFromObservation(s.observation);
        if (!recon.state) {
            quarantinedCount++;
            quarantineRecords.push({
                provenanceId: `ep_${s.source?.episodeIndex ?? 'unk'}_step_${s.source?.stepIndex ?? 'unk'}`,
                reasonCode: 'RECONSTRUCTION_FAIL',
                details: recon.error ?? '未知重建错误',
                rawSampleSummary: { lineIndex },
                timestamp: new Date().toISOString()
            });
            continue;
        }

        const parity = validateStateActionParity(
            recon.state,
            s.playerId,
            s.label.actionCode,
            s.legalActionCodes
        );

        if (!parity.valid) {
            quarantinedCount++;
            quarantineRecords.push({
                provenanceId: `ep_${s.source?.episodeIndex ?? 'unk'}_step_${s.source?.stepIndex ?? 'unk'}`,
                reasonCode: 'ILLEGAL_ACTION',
                details: parity.reason ?? '合法性校验不通过',
                rawSampleSummary: { actionCode: s.label?.actionCode, playerId: s.playerId },
                timestamp: new Date().toISOString()
            });
        } else {
            verifiedCount++;
            if (sampleVerifications.length < 5) {
                sampleVerifications.push({
                    lineIndex,
                    playerId: s.playerId,
                    actionCode: s.label.actionCode,
                    legalActionCount: parity.legalActionCount,
                    stepSuccess: parity.stepSuccess
                });
            }
        }

        if (verifiedCount >= limit) break;
    }

    const parityReport = {
        schemaVersion: 1,
        runId: 'agent_upgrade_20260920_v4_01',
        auditDate: new Date().toISOString(),
        datasetPath: 'training_runs/agent_upgrade_20260919_01/baseline_dataset/dataset_part_00.jsonl',
        totalProbed: verifiedCount + quarantinedCount,
        verifiedValidSamples: verifiedCount,
        quarantinedSamples: quarantinedCount,
        parityPassRate: verifiedCount / (verifiedCount + quarantinedCount),
        sampleVerifications,
        status: quarantinedCount === 0 ? 'ALL_PARITY_PASSED' : 'SOME_QUARANTINED'
    };

    fs.writeFileSync(path.join(reportDir, 'reconstruction-parity.json'), JSON.stringify(parityReport, null, 2), 'utf8');
    fs.writeFileSync(
        path.join(datasetOutDir, 'quarantine.jsonl'),
        quarantineRecords.map(r => JSON.stringify(r)).join('\n') + '\n',
        'utf8'
    );

    console.log(`Parity probe complete: verified ${verifiedCount}, quarantined ${quarantinedCount}`);
    return parityReport;
}

if (process.argv[1] && process.argv[1].endsWith('skirmish_r02_parity_probe.ts')) {
    runParityProbe(30).catch(err => {
        console.error('Parity probe failed:', err);
        process.exit(1);
    });
}
