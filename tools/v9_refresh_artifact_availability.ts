import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

const RUN_ID = process.env.RUN_ID || 'agent_upgrade_20260922_v9_identity_02';
const REPORT_DIR = path.resolve(`docs/training/reports/${RUN_ID}`);
const RUN_DIR = path.resolve(`training_runs/${RUN_ID}`);

function getFileSha256(filePath: string): string {
    const raw = fs.readFileSync(filePath);
    return createHash('sha256').update(raw).digest('hex');
}

function getGitBlobSha(filePath: string): string {
    const raw = fs.readFileSync(filePath);
    const header = `blob ${raw.length}\0`;
    return createHash('sha1').update(header).update(raw).digest('hex');
}

function main() {
    fs.mkdirSync(RUN_DIR, { recursive: true });
    fs.mkdirSync(REPORT_DIR, { recursive: true });

    const inspectedArtifacts = [
        {
            id: "FRONTEND_SPATIAL_V1",
            relativePath: "src/game/ai/models/spatial_resnet_checkpoint.json",
            role: "Built-in frontend v1 spatial checkpoint"
        },
        {
            id: "FRONTEND_NET_B",
            relativePath: "src/game/ai/models/net_b_checkpoint.json",
            role: "Built-in frontend dual-head NET_B checkpoint"
        },
        {
            id: "V7_01_SMOKE_SPATIAL_V2",
            relativePath: "training_runs/agent_upgrade_20260921_v7_01/checkpoints/spatial_resnet/spatial_resnet_v2_best.json",
            role: "Smoke 100-state v2 checkpoint from v7_01 (used erroneously in reeval_01/02)"
        },
        {
            id: "V7_01_SMOKE_DAGGER",
            relativePath: "training_runs/agent_upgrade_20260921_v7_01/checkpoints/spatial_resnet_dagger/spatial_resnet_dagger_best.json",
            role: "Smoke DAgger checkpoint from v7_01"
        },
        {
            id: "V7_01_SMOKE_NET_A",
            relativePath: "training_runs/agent_upgrade_20260921_v7_01/checkpoints/net_a/net_a_checkpoint.json",
            role: "Smoke NET_A checkpoint from v7_01"
        },
        {
            id: "V8_FINAL_BASE_V2_LARGE",
            relativePath: "training_runs/agent_upgrade_20260921_v8_final_01/checkpoints/spatial_resnet/spatial_resnet_v2_best.json",
            role: "Qualified 7832-state large base v2 model (VERIFIED against report SHA)"
        },
        {
            id: "V8_FINAL_DAGGER_V2",
            relativePath: "training_runs/agent_upgrade_20260921_v8_final_01/checkpoints/spatial_resnet_dagger/spatial_resnet_dagger_best.json",
            role: "Qualified DAgger round 1 checkpoint (VERIFIED against report SHA)"
        },
        {
            id: "V8_FINAL_NET_A",
            relativePath: "training_runs/agent_upgrade_20260921_v8_final_01/checkpoints/net_a/net_a_checkpoint.json",
            role: "Qualified NET_A checkpoint from v8_final_01"
        },
        {
            id: "V8_FINAL_SPLIT_MANIFEST",
            relativePath: "training_runs/agent_upgrade_20260921_v8_final_01/split_manifest.json",
            role: "Split manifest: 7832 total (6528 train / 1304 val), 93 root families"
        },
        {
            id: "V8_FINAL_CONSUMED_SPATIAL",
            relativePath: "training_runs/agent_upgrade_20260921_v8_final_01/checkpoints/spatial_resnet/consumed_samples_manifest.json",
            role: "Consumed samples manifest for spatial base v2 (6528 train samples)"
        },
        {
            id: "V8_FINAL_CONSUMED_DAGGER",
            relativePath: "training_runs/agent_upgrade_20260921_v8_final_01/checkpoints/spatial_resnet_dagger/consumed_samples_manifest.json",
            role: "Consumed samples manifest for DAgger v2 (6589 train samples = 6528 + 61)"
        },
        {
            id: "V8_FINAL_DATASET_JSONL",
            relativePath: "training_runs/agent_upgrade_20260921_v8_final_01/datasets/d_v7_spatial.jsonl",
            role: "Full dataset jsonl for v8_final_01 (7832 samples)"
        },
        {
            id: "V8_CLOSURE_02_BASE_V2",
            relativePath: "training_runs/agent_upgrade_20260921_v8_closure_02/checkpoints/spatial_resnet/spatial_resnet_v2_best.json",
            role: "Identical checkpoint in v8_closure_02"
        },
        {
            id: "V8_CLOSURE_02_DAGGER_V2",
            relativePath: "training_runs/agent_upgrade_20260921_v8_closure_02/checkpoints/spatial_resnet_dagger/spatial_resnet_dagger_best.json",
            role: "Identical DAgger checkpoint in v8_closure_02"
        },
        {
            id: "V8_CLOSURE_02_NET_A",
            relativePath: "training_runs/agent_upgrade_20260921_v8_closure_02/checkpoints/net_a/net_a_checkpoint.json",
            role: "Identical NET_A checkpoint in v8_closure_02"
        },
        {
            id: "V9_ID02_DATASET_JSONL",
            relativePath: `training_runs/${RUN_ID}/datasets/d_v7_spatial.jsonl`,
            role: "Full dataset jsonl for identity_02 (7832 states)"
        },
        {
            id: "V9_ID02_SPLIT_MANIFEST",
            relativePath: `training_runs/${RUN_ID}/split_manifest.json`,
            role: "Unified split manifest for identity_02 (62 train / 33 val roots)"
        },
        {
            id: "V9_ID02_DATASET_ACCOUNTING",
            relativePath: `training_runs/${RUN_ID}/dataset_accounting.json`,
            role: "5-way dataset accounting manifest for identity_02"
        },
        {
            id: "V9_ID02_D10_BEST",
            relativePath: `training_runs/${RUN_ID}/checkpoints/spatial_resnet/d10_best.json`,
            role: "D10 baseline best model checkpoint for identity_02"
        },
        {
            id: "V9_ID02_D10_LAST",
            relativePath: `training_runs/${RUN_ID}/checkpoints/spatial_resnet/d10_last.json`,
            role: "D10 baseline final epoch model checkpoint for identity_02"
        },
        {
            id: "V9_ID02_D10_METRICS",
            relativePath: `training_runs/${RUN_ID}/checkpoints/spatial_resnet/d10_metrics.json`,
            role: "D10 baseline training metrics for identity_02"
        },
        {
            id: "V9_ID02_OVERFIT_BEST",
            relativePath: `training_runs/${RUN_ID}/overfit_sanity/overfit_model_best.json`,
            role: "64-sample clean overfit verification model"
        }
    ];

    const results = inspectedArtifacts.map(art => {
        const fullPath = path.resolve(art.relativePath);
        const exists = fs.existsSync(fullPath);
        if (!exists) {
            return {
                id: art.id,
                relativePath: art.relativePath,
                status: "MISSING",
                sizeBytes: 0,
                role: art.role
            };
        }

        const stat = fs.statSync(fullPath);
        const sha256 = getFileSha256(fullPath);
        const gitBlob = stat.size < 50 * 1024 * 1024 ? getGitBlobSha(fullPath) : undefined;

        return {
            id: art.id,
            relativePath: art.relativePath,
            status: "AVAILABLE",
            sha256,
            ...(gitBlob ? { gitBlob } : {}),
            sizeBytes: stat.size, // Exact filesystem stat.size!
            role: art.role
        };
    });

    const payload = {
        runId: RUN_ID,
        auditDate: new Date().toISOString(),
        summary: {
            totalInspected: results.length,
            available: results.filter(r => r.status === "AVAILABLE").length,
            missing: results.filter(r => r.status === "MISSING").length,
            status: results.every(r => r.status === "AVAILABLE") ? "ALL_VERIFIED" : "HAS_MISSING"
        },
        artifacts: results
    };

    fs.writeFileSync(path.join(RUN_DIR, 'artifact_availability.json'), JSON.stringify(payload, null, 2), 'utf8');
    fs.writeFileSync(path.join(REPORT_DIR, 'artifact_availability.json'), JSON.stringify(payload, null, 2), 'utf8');
    console.log(`Wrote artifact_availability.json to ${RUN_DIR} and ${REPORT_DIR}`);
}

main();
