import fs from 'fs';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../env/src_game_frozen/ai/spatial_conv_net';

interface FixtureSample {
    sampleId: number;
    spatial: number[];
    global: number[];
    candidateActorCoords: [number, number][];
    candidateLandingCoords: [number, number][];
    candidateTargetCoords: [number, number][];
    candidateSemantics: number[][];
}

function main() {
    const jsonModelPath = 'ai_training/r7_training_stage_20261014_083500/artifacts/models/theta1_baseline.json';
    const fixturePath = 'ai_training/r7_training_stage_20261014_083500/artifacts/parity_fixture_100.json';
    const outTsPred = 'ai_training/r7_training_stage_20261014_083500/artifacts/ts_predictions.json';

    const modelJsonText = fs.readFileSync(jsonModelPath, 'utf8');
    const weights = loadSpatialResNetFromJson(modelJsonText);
    const predictor = new SpatialResNetPredictor(weights);

    const samples: FixtureSample[] = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const tsResults = [];

    for (const s of samples) {
        const spatialTensor = new Float32Array(s.spatial);
        const globalFeatures = new Float32Array(s.global);

        const candidateActions = s.candidateSemantics.map((sem, idx) => ({
            actorCoord: s.candidateActorCoords[idx][0] >= 0
                ? { x: s.candidateActorCoords[idx][0], y: s.candidateActorCoords[idx][1] }
                : null,
            landingCoord: s.candidateLandingCoords[idx][0] >= 0
                ? { x: s.candidateLandingCoords[idx][0], y: s.candidateLandingCoords[idx][1] }
                : null,
            targetCoord: s.candidateTargetCoords[idx][0] >= 0
                ? { x: s.candidateTargetCoords[idx][0], y: s.candidateTargetCoords[idx][1] }
                : null,
            semantics: new Float32Array(sem)
        }));

        const pred = predictor.predict(
            { spatialTensor, globalFeatures } as any,
            candidateActions
        );

        let argmaxIdx = -1;
        if (pred.actionLogits.length > 0) {
            argmaxIdx = pred.actionLogits.indexOf(Math.max(...pred.actionLogits));
        }

        tsResults.append ? tsResults.push({
            sampleId: s.sampleId,
            value: pred.value,
            actionLogits: pred.actionLogits,
            argmaxIndex: argmaxIdx
        }) : tsResults.push({
            sampleId: s.sampleId,
            value: pred.value,
            actionLogits: pred.actionLogits,
            argmaxIndex: argmaxIdx
        });
    }

    fs.writeFileSync(outTsPred, JSON.stringify(tsResults, null, 2), 'utf8');
    console.log(`Computed TS predictions for ${tsResults.length} samples, saved to ${outTsPred}`);
}

main();
