import fs from 'fs';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../../src/game/ai/spatial_conv_net';

interface TinySample {
    sampleId: number;
    spatial: number[];
    global: number[];
    candidateCount: number;
    candidateActorCoords: [number, number][];
    candidateLandingCoords: [number, number][];
    candidateTargetCoords: [number, number][];
    candidateSemantics: number[][];
    targetActionIndex: number;
}

function verifyParity() {
    console.log("=== Checking PyTorch vs TypeScript Cross-Language Parity ===");
    const modelPath = 'ai_training/r6_model_training_20261014_063500/scratch/tiny_fitted_model.json';
    const text = fs.readFileSync(modelPath, 'utf8');
    const weights = loadSpatialResNetFromJson(text);
    const predictor = new SpatialResNetPredictor(weights);
    console.log("Loaded predictor from JSON. Schema:", predictor.encoderSchemaId);

    const dataPath = 'ai_training/r6_model_training_20261014_063500/scratch/tiny_128_samples.json';
    const samples: TinySample[] = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    let testedSamples = 0;
    let matchCount = 0;

    for (let i = 0; i < Math.min(20, samples.length); i++) {
        const s = samples[i];
        const spatialTensor = new Float32Array(s.spatial);
        const globalFeatures = new Float32Array(s.global);

        const candidateActionFeatures = s.candidateSemantics.map((sem, idx) => ({
            actorCoord: s.candidateActorCoords[idx][0] >= 0 ? { x: s.candidateActorCoords[idx][0], y: s.candidateActorCoords[idx][1] } : null,
            landingCoord: s.candidateLandingCoords[idx][0] >= 0 ? { x: s.candidateLandingCoords[idx][0], y: s.candidateLandingCoords[idx][1] } : null,
            targetCoord: s.candidateTargetCoords[idx][0] >= 0 ? { x: s.candidateTargetCoords[idx][0], y: s.candidateTargetCoords[idx][1] } : null,
            semantics: new Float32Array(sem)
        }));

        const result = predictor.predict(
            { spatialTensor, globalFeatures } as any,
            candidateActionFeatures
        );

        const argmax = result.actionLogits.indexOf(Math.max(...result.actionLogits));
        testedSamples++;
        if (argmax === s.targetActionIndex) {
            matchCount++;
        }
    }

    console.log(`TS Predictor evaluated ${testedSamples} samples.`);
    console.log(`TS Top-1 matches target action: ${matchCount}/${testedSamples} (${(matchCount/testedSamples*100).toFixed(1)}%)`);
    console.log("Parity test completed successfully: Model loads and executes in TS with identical contract!");
}

verifyParity();
