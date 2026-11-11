import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { GameState } from '../src/game/types';
import { encodeGameStateSpatial, encodeCandidateActionSpatial } from '../src/game/ai/spatial_tensor_encoder';
import { decodeAction } from '../src/game/env';
import { createInitializedSpatialResNet, SpatialResNetPredictor } from '../src/game/ai/spatial_conv_net';

async function main() {
    console.log('=== TypeScript Benchmark ===');
    const datasetPath = path.resolve('training_runs/agent_upgrade_20260919_01/baseline_dataset/dataset_part_pvp.jsonl');
    
    // 1. JSON Parsing Benchmark
    const t0 = performance.now();
    const rl = readline.createInterface({
        input: fs.createReadStream(datasetPath, { encoding: 'utf8' }),
        crlfDelay: Infinity
    });

    const rawRecords: any[] = [];
    let bytesRead = 0;
    const targetCount = 300;

    for await (const line of rl) {
        if (!line.trim()) continue;
        bytesRead += Buffer.byteLength(line, 'utf8');
        const data = JSON.parse(line);
        rawRecords.push(data);
        if (rawRecords.length >= targetCount) break;
    }
    const t1 = performance.now();
    const parseTimeSec = (t1 - t0) / 1000;
    console.log(`[TS Data Parse] ${rawRecords.length} samples (${(bytesRead / (1024 * 1024)).toFixed(2)} MB) parsed in ${parseTimeSec.toFixed(3)}s`);
    console.log(`  -> Throughput: ${(rawRecords.length / parseTimeSec).toFixed(1)} samples/s (${((bytesRead / (1024 * 1024)) / parseTimeSec).toFixed(2)} MB/s)`);

    // 2. Spatial Feature Encoding Benchmark
    const t2 = performance.now();
    const encodedSamples: any[] = [];
    for (const r of rawRecords) {
        const obs = r.observation;
        if (!obs) continue;
        const tiles: any[][] = Array.from({ length: obs.mapHeight }, () => new Array(obs.mapWidth));
        for (const t of obs.tiles) tiles[t.y][t.x] = t;
        const units = obs.units.map((u: any) => ({ ...u, pos: u.pos ?? { x: u.x, y: u.y } }));
        const state: GameState = {
            turn: obs.turn,
            currentPlayer: obs.currentPlayer,
            map: { width: obs.mapWidth, height: obs.mapHeight, tiles },
            units,
            players: obs.players,
            rules: obs.rules,
            metadata: obs.metadata,
            winner: null
        };

        const enc = encodeGameStateSpatial(state, r.playerId);
        const candidates: any[] = [];
        for (const code of r.legalActionCodes.slice(0, 32)) {
            const act = decodeAction(code);
            if (act) {
                candidates.push(encodeCandidateActionSpatial(state, r.playerId, act));
            }
        }
        encodedSamples.push({ enc, candidates });
    }
    const t3 = performance.now();
    const encodeTimeSec = (t3 - t2) / 1000;
    console.log(`[TS Feature Encode] ${encodedSamples.length} samples encoded in ${encodeTimeSec.toFixed(3)}s`);
    console.log(`  -> Throughput: ${(encodedSamples.length / encodeTimeSec).toFixed(1)} samples/s`);

    // 3. Model Forward Inference Benchmark
    const weights = createInitializedSpatialResNet(42);
    const predictor = new SpatialResNetPredictor(weights);

    const t4 = performance.now();
    let fwdCount = 0;
    for (const s of encodedSamples) {
        predictor.predict(s.enc, s.candidates);
        fwdCount++;
    }
    const t5 = performance.now();
    const fwdTimeSec = (t5 - t4) / 1000;
    console.log(`[TS Model Forward] ${fwdCount} forward inferences in ${fwdTimeSec.toFixed(3)}s`);
    console.log(`  -> Inference Throughput: ${(fwdCount / fwdTimeSec).toFixed(1)} inferences/s (${((fwdTimeSec / fwdCount) * 1000).toFixed(2)} ms/sample)`);
    console.log(`  * Note: TS only does inference here. TS has NO autograd / Conv2D backprop engine.`);
}

main().catch(console.error);
