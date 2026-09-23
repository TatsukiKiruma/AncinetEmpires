import * as fs from 'node:fs';
import * as path from 'node:path';
import { RUN_ID, RUN_DIR, REPORT_DIR, V10_DIR, ensureDir, getSha256, readJson, writeJson, writeJsonl, readJsonl } from '../v10_common';
import { GameEngine } from '../../src/game/engine';
import { createAppApkSkirmishGameState } from '../../src/game/apk_skirmish_map_assets';
import { evaluatePositionHeuristic } from '../v7_heuristic_bounded_search';
import { encodeGameStateSpatial, encodeCandidateActionSpatial } from '../../src/game/ai/spatial_tensor_encoder';
import { getBehavioralStateHash } from '../v7_training_pipeline';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';

const BASE_MODEL_PATH = path.resolve('training_runs/agent_upgrade_20260922_v9_identity_03/checkpoints/spatial_resnet/d10_best.json');
const TEACHER_DIR = path.join(RUN_DIR, 'teacher_loss');
const TEACHER_DATASET = path.join(TEACHER_DIR, 'd_v10_teacher.jsonl');
const TEACHER_SPLIT = path.join(TEACHER_DIR, 'teacher_split_manifest.json');
const MAX_SAMPLES_PER_EPISODE = 16;

interface TeacherSample {
    sampleId: string;
    rootFamilyId: string;
    episodeId: string;
    playerId: number;
    spatialTensor: number[];
    globalFeatures: number[];
    candidateActions: any[];
    targetActionIndex: number;
    teacherQ: number[];
    equivalenceGroups: number[][];
    valueTarget: null;
    category: 'TEACHER_SOFT';
}

function buildTeacherDataset(): void {
    ensureDir(TEACHER_DIR);
    if (fs.existsSync(TEACHER_DATASET) && process.env.V10_REBUILD_TEACHER !== '1') {
        console.log('[teacher] reusing existing', TEACHER_DATASET);
        return;
    }
    const episodes = readJsonl<any>(path.join(V10_DIR, 'episodes.jsonl'));
    const rows: TeacherSample[] = [];
    for (const ep of episodes) {
        if (!ep.trajectoryLogPath || !fs.existsSync(ep.trajectoryLogPath)) continue;
        const traj = readJson<any>(ep.trajectoryLogPath);
        const totalSteps = (traj.actionHistory || []).length;
        if (totalSteps < 4) continue;
        const stride = Math.max(1, Math.floor(totalSteps / MAX_SAMPLES_PER_EPISODE));
        const sampleSteps = new Set<number>();
        for (let s = 0; s < totalSteps; s += stride) {
            sampleSteps.add(s);
            if (sampleSteps.size >= MAX_SAMPLES_PER_EPISODE) break;
        }
        const state = createAppApkSkirmishGameState(ep.mapName, 'SD');
        const engine = new GameEngine(state);
        for (let stepIdx = 0; stepIdx < totalSteps; stepIdx++) {
            const stepItem = traj.actionHistory[stepIdx];
            const curState = engine.getState();
            const curPlayer = curState.currentPlayer;
            if (sampleSteps.has(stepIdx) && !engine.isTerminal()) {
                const legal = engine.getLegalActions(curPlayer).filter((a: any) => a.type !== 'surrender');
                const targetIdx = legal.findIndex((a: any) => JSON.stringify(a) === JSON.stringify(stepItem.action));
                if (legal.length > 0 && targetIdx !== -1) {
                    const q: number[] = [];
                    const hashes: string[] = [];
                    for (let i = 0; i < legal.length; i++) {
                        const clone = new GameEngine(JSON.parse(JSON.stringify(curState)));
                        clone.step(legal[i]);
                        let score: number;
                        if (clone.isTerminal()) {
                            const winner = clone.getWinner();
                            score = winner === curPlayer ? 1000 : winner === null ? 0 : -1000;
                        } else {
                            score = evaluatePositionHeuristic(clone.getState(), curPlayer);
                        }
                        q.push(Number(score.toFixed(4)));
                        hashes.push(getBehavioralStateHash(clone.getState(), curPlayer));
                    }
                    const hashGroups = new Map<string, number[]>();
                    for (let i = 0; i < hashes.length; i++) {
                        if (!hashGroups.has(hashes[i])) hashGroups.set(hashes[i], []);
                        hashGroups.get(hashes[i])!.push(i);
                    }
                    const equivalenceGroups: number[][] = hashes.map(h => hashGroups.get(h) ?? []);
                    const enc = encodeGameStateSpatial(curState, curPlayer, 'v2');
                    const cand = legal.map((a: any) => encodeCandidateActionSpatial(curState, curPlayer, a, 'v2'));
                    rows.push({
                        sampleId: `v10_teacher_${ep.episodeId}_s${stepIdx}`,
                        rootFamilyId: ep.rootFamilyId,
                        episodeId: ep.episodeId,
                        playerId: curPlayer,
                        spatialTensor: Array.from(enc.spatialTensor),
                        globalFeatures: Array.from(enc.globalFeatures),
                        candidateActions: cand.map((c: any) => ({
                            actorCoord: c.actorCoord,
                            landingCoord: c.landingCoord,
                            targetCoord: c.targetCoord,
                            semantics: Array.from(c.semantics)
                        })),
                        targetActionIndex: targetIdx,
                        teacherQ: q,
                        equivalenceGroups,
                        valueTarget: null,
                        category: 'TEACHER_SOFT'
                    });
                }
            }
            engine.step(stepItem.action);
        }
    }
    writeJsonl(TEACHER_DATASET, rows);
    console.log(`[teacher] wrote ${rows.length} teacher samples -> ${TEACHER_DATASET}`);
}

function writeTeacherSplit(): void {
    const split = readJson<any>(path.join(V10_DIR, 'split_v10.json'));
    const train = split?.partitions?.train?.roots ?? split?.partitions?.train?.rootFamilies ?? [];
    const valId = split?.partitions?.val_id?.roots ?? split?.partitions?.val_id?.rootFamilies ?? [];
    const valOod = split?.partitions?.val_ood?.roots ?? split?.partitions?.val_ood?.rootFamilies ?? [];
    const test = split?.partitions?.test?.roots ?? split?.partitions?.test?.rootFamilies ?? [];
    writeJson(TEACHER_SPLIT, {
        trainRootFamilies: train,
        valRootFamilies: [...valId, ...valOod],
        testRootFamilies: test
    });
}

function prepareT1005Loss(): void {
    buildTeacherDataset();
    writeTeacherSplit();
    const arms = [
        { label: 't10-05-loss-ce', lossMode: 'ce', teacherTemperature: 1.0, softWeight: 0.0, equivWeight: 0.0 },
        { label: 't10-05-loss-soft-equiv', lossMode: 'soft+equiv', teacherTemperature: 1.0, softWeight: 0.5, equivWeight: 0.5 }
    ];
    const jobs = arms.map(arm => {
        const model = path.join(TEACHER_DIR, `${arm.label}.json`);
        const metrics = path.join(TEACHER_DIR, `${arm.label}_metrics.json`);
        const consumed = path.join(TEACHER_DIR, `${arm.label}_consumed_samples_manifest.json`);
        return {
            label: arm.label,
            script: 'python/train_spatial_resnet.py',
            args: [
                '--dataset', TEACHER_DATASET,
                '--init-checkpoint', BASE_MODEL_PATH,
                '--split-manifest', TEACHER_SPLIT,
                '--epochs', '3',
                '--batch-size', '64',
                '--lr', '0.0005',
                '--value-weight', '0.0',
                '--seed', '42',
                '--model-version', 'spatial-resnet-v2',
                '--num-blocks', '2',
                '--loss-mode', arm.lossMode,
                '--teacher-temperature', String(arm.teacherTemperature),
                '--soft-weight', String(arm.softWeight),
                '--equiv-weight', String(arm.equivWeight),
                '--out-model', model,
                '--out-metrics', metrics,
                '--consumed-manifest', consumed
            ],
            outputs: [model, metrics, consumed]
        };
    });
    const meta = {
        task: 'T10-05-loss',
        generatedAt: new Date().toISOString(),
        runId: RUN_ID,
        datasetPath: TEACHER_DATASET,
        splitManifest: TEACHER_SPLIT,
        jobs: path.join(TEACHER_DIR, 't10_05_loss_jobs.json'),
        arms: arms.map((arm, i) => ({ ...arm, model: jobs[i].args[jobs[i].args.indexOf('--out-model') + 1], metrics: jobs[i].args[jobs[i].args.indexOf('--out-metrics') + 1], consumed: jobs[i].args[jobs[i].args.indexOf('--consumed-manifest') + 1] }))
    };
    writeJson(meta.jobs, jobs);
    writeJson(path.join(V10_DIR, 'T10-05_loss_prepare.json'), meta);
    console.log('[t10-05-loss prepare] dataset=', fs.existsSync(TEACHER_DATASET) ? readJsonl(TEACHER_DATASET).length : 0, 'jobs=', meta.jobs);
}

async function evalT1005Loss(): Promise<void> {
    const meta = readJson<any>(path.join(V10_DIR, 'T10-05_loss_prepare.json'));
    const split = readJson<any>(path.join(V10_DIR, 'split_v10.json'));
    const rootPart = new Map<string, string>();
    for (const part of ['train', 'val_id', 'val_ood', 'test'] as const) {
        for (const root of (split.partitions?.[part]?.roots ?? [])) rootPart.set(String(root), part);
    }
    const rows = readJsonl<any>(meta.datasetPath);
    const evalRows = rows.filter(r => ['val_id', 'val_ood'].includes(rootPart.get(r.rootFamilyId) || ''));
    if (evalRows.length === 0) throw new Error('T10-05-loss eval has zero held-out rows');
    const results: Record<string, any> = {};
    for (const arm of meta.arms) {
        const predictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(fs.readFileSync(arm.model, 'utf8')));
        let correct = 0;
        let sameGroup = 0;
        let regret = 0;
        for (const sample of evalRows) {
            const encoded = {
                spatialTensor: new Float32Array(sample.spatialTensor),
                globalFeatures: new Float32Array(sample.globalFeatures),
                mapWidth: 20,
                mapHeight: 20,
                subjectPlayerId: sample.playerId ?? 0,
                version: 'v2' as const
            };
            const cand = (sample.candidateActions || []).map((c: any) => ({
                actorCoord: c.actorCoord,
                landingCoord: c.landingCoord,
                targetCoord: c.targetCoord,
                semantics: new Float32Array(c.semantics)
            }));
            const out = predictor.predict(encoded as any, cand);
            const pred = out.bestActionIndex;
            if (pred === sample.targetActionIndex) correct++;
            const targetGroup = sample.equivalenceGroups?.[sample.targetActionIndex] ?? [sample.targetActionIndex];
            if (targetGroup.includes(pred)) sameGroup++;
            if (Array.isArray(sample.teacherQ) && sample.teacherQ.length === cand.length) {
                const qBest = Math.max(...sample.teacherQ);
                regret += qBest - sample.teacherQ[pred];
            }
        }
        results[arm.label] = {
            lossMode: arm.lossMode,
            softWeight: arm.softWeight,
            equivWeight: arm.equivWeight,
            checkpointSha256: getSha256(fs.readFileSync(arm.model)),
            heldOutSamples: evalRows.length,
            top1Accuracy: Number(((correct / evalRows.length) * 100).toFixed(2)),
            equivalenceGroupAccuracy: Number(((sameGroup / evalRows.length) * 100).toFixed(2)),
            meanTeacherRegret: Number((regret / evalRows.length).toFixed(4))
        };
    }
    const labels = Object.keys(results);
    const ce = results[labels[0]];
    const soft = results[labels[1]];
    const report = {
        task: 'T10-05-loss',
        executedAt: new Date().toISOString(),
        runId: RUN_ID,
        datasetAccounting: { totalTeacherSamples: rows.length, heldOutSamples: evalRows.length },
        results,
        findings: [
            `CE: top1=${ce.top1Accuracy}%, groupAccuracy=${ce.equivalenceGroupAccuracy}%, regret=${ce.meanTeacherRegret}.`,
            `soft+equiv: top1=${soft.top1Accuracy}%, groupAccuracy=${soft.equivalenceGroupAccuracy}%, regret=${soft.meanTeacherRegret}.`,
            (Number(soft.top1Accuracy) > Number(ce.top1Accuracy) || Number(soft.meanTeacherRegret) < Number(ce.meanTeacherRegret))
                ? 'Soft/equiv loss shows a positive developmental signal; needs a second seed before adoption.'
                : 'Soft/equiv loss did not beat CE on this single-seed development run; no adoption claim.'
        ]
    };
    writeJson(path.join(V10_DIR, 'T10-05_loss_ablation.json'), report);
    writeJson(path.join(REPORT_DIR, 'T10-05_loss_ablation.json'), report);
    console.log('[t10-05-loss eval]', JSON.stringify(results));
}

async function main(): Promise<void> {
    const cmd = process.argv[2];
    if (cmd === 'prepare-t10-05-loss') return prepareT1005Loss();
    if (cmd === 'eval-t10-05-loss') return evalT1005Loss();
    if (cmd === 'build-teacher-dataset') return buildTeacherDataset();
    throw new Error(`Unknown loss command: ${cmd}`);
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
