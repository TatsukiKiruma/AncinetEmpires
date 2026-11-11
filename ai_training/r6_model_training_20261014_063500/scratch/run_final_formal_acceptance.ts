import fs from 'fs';
import path from 'path';
import { runFormalAcceptance, FROZEN_ACCEPTANCE_MAPS, ACCEPTANCE_BASE_SEED } from '../research/final_eval_panel';
import { PolicyConfig } from '../research/eval_runner';

const CANDIDATE_JSON_PATH = 'ai_training/r6_model_training_20261014_063500/artifacts/models/arm_a_warm_start.json';
const CANDIDATE_SHA256 = '6df0fc279348df4f0ab1b27d4d55bcdbdb1261f45b5583a8c38e0b92a3ecda6f';

async function main() {
    const candidateCfg: PolicyConfig = {
        type: 'custom_model',
        id: 'arm_a_warm_start',
        modelJsonPath: CANDIDATE_JSON_PATH
    };

    const outDir = 'ai_training/r6_model_training_20261014_063500/artifacts';

    // 冻结 Manifest
    const manifest = {
        timestamp: new Date().toISOString(),
        candidateId: candidateCfg.id,
        modelJsonPath: CANDIDATE_JSON_PATH,
        sha256: CANDIDATE_SHA256,
        architectureId: 'spatial_resnet_32ch_2res',
        encoderSchemaId: 'spatial34_global20_actionSemantics53_v19',
        selectionRationale: 'Arm A (Warm Start from θ1) significantly outperformed Arm B (Scratch) in generalization Top-1 accuracy (40.94% vs 30.22%) and DEV battle resilience (10% win rate vs 0% for Arm B).',
        formalAcceptanceProtocol: {
            opponent: 'frozen_heuristic',
            mapsCount: FROZEN_ACCEPTANCE_MAPS.length,
            totalGames: 20,
            baseSeed: ACCEPTANCE_BASE_SEED,
            maxSteps: 3000,
            maxWallSeconds: 300,
            targetThreshold: '>= 16 wins / 20 games (80.0%)'
        }
    };

    const manifestPath = path.join(outDir, 'frozen_candidate_manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`Saved frozen candidate manifest to: ${manifestPath}`);

    // 执行 20 局正式主验收
    const verdict = runFormalAcceptance(candidateCfg, CANDIDATE_SHA256, outDir);
    console.log('\nFinal Formal Verdict Summary:');
    console.log(`  Target: >= 16/20 (80.0%)`);
    console.log(`  Actual: ${verdict.wins}/20 (${(verdict.naturalWinRate * 100).toFixed(1)}%)`);
    console.log(`  Losses: ${verdict.losses}, Draws: ${verdict.draws}, Truncations: ${verdict.truncations}, Errors: ${verdict.errors}`);
    console.log(`  Accepted: ${verdict.isAccepted}`);
}

main().catch(console.error);
