/**
 * V19/T19-01b：导出真实快照的跨语言一致性夹具。
 *
 * 目的：让 Python 侧编码器在**同一批真实状态**上与 TS 侧逐数值对齐，覆盖：
 *   - 26 通道（v15 语义）与 34 通道（V19 语义）的空间张量与全局特征；
 *   - 每个快照的候选动作坐标与 53 维语义；
 *   - 用指定检查点在 TS 侧算出的 logits 与 argmax（供 Python 复算比对）。
 *
 * 状态来源是真实对局（H0 vs H0，冻结引擎与冻结 H0），不是人工构造的玩具状态；
 * 每个状态同时记录地图、seed 与步序，便于第三方复现。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v19/tools/export_parity_fixture_v19.ts \
 *     --out v19/out/<runId>/parity/snapshots_v19.jsonl \
 *     --model v19/out/<runId>/experiments/migrated/P1_to_v19schema.json \
 *     --per-map 40
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { encodeAction } from '../../src/game/env';
import { canonicalActionOrderV16 } from '../../src/game/ai/action_ordering';
import {
    encodeCandidateActionSpatial,
    encodeGameStateSpatial,
    SPATIAL_TENSOR_CHANNELS,
    SPATIAL_TENSOR_CHANNELS_V19,
} from '../../src/game/ai/spatial_tensor_encoder';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { UNPACK_DIR, SD_PLAN_FILE, streamFor } from '../../v14/tools/eval_v14_match';
import type { Action, GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const FIVE_MAPS = [
    '(2) Duel.aem', '(2) Icy Paths.aem', '(2) Liberty Port.aem',
    '(2) Mourningstar.aem', '(2) Crossed swords.aem',
] as const;

async function main(): Promise<void> {
    const runId = arg('--run-id', 'run_20260928_v19_01') as string;
    const outPath = path.resolve(arg('--out', `v19/out/${runId}/parity/snapshots_v19.jsonl`) as string);
    const modelPath = arg('--model', null);
    const perMap = Number(arg('--per-map', '40'));
    const seedBase = Number(arg('--seed-base', '2611020000'));
    const maxSteps = Number(arg('--max-steps', '12000'));

    if (fs.existsSync(outPath)) throw new Error(`[T19-01b] 输出已存在，拒绝覆盖：${outPath}`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    let predictor: SpatialResNetPredictor | null = null;
    if (modelPath) {
        const abs = path.resolve(modelPath);
        const json = fs.readFileSync(abs, 'utf8');
        const declared = (JSON.parse(json) as { encoderSchemaId?: string }).encoderSchemaId ?? null;
        predictor = new SpatialResNetPredictor(
            loadSpatialResNetFromJson(json, { expectedEncoderSchemaId: declared }));
        console.log(`[T19-01b] 参考检查点 ${path.basename(abs)} schema=${predictor.encoderSchemaId} `
            + `channels=${predictor.spatialChannels}`);
    }

    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);
    const out = fs.createWriteStream(outPath, { flags: 'a' });
    const write = async (text: string) => {
        if (!out.write(text)) await new Promise<void>(r => out.once('drain', r));
    };

    let written = 0;
    const coverage = { maps: {} as Record<string, number>, actionTypes: {} as Record<string, number> };
    const byChannelDiff: number[] = [];

    for (let mapIndex = 0; mapIndex < FIVE_MAPS.length; mapIndex += 1) {
        const mapName = FIVE_MAPS[mapIndex];
        let perMapWritten = 0;
        let seedIndex = 0;
        while (perMapWritten < perMap && seedIndex < 40) {
            const seed = seedBase + 10 * mapIndex + seedIndex;
            seedIndex += 1;
            const scenarioId = `SDPLAN:sd-normal:${mapName}`;
            const episode = {
                kind: 'skirmish_episode', version: 1,
                scenario: { id: scenarioId, mode: 'SD', mapName, resourcePath: '' },
                seed, maxPlies: 1200, maxSteps,
                initialObservationHash: '', initialLegalActionCount: 0, fixedActionSpaceSize: 0,
                players: [], policyByPlayer: {}, steps: [], summary: {},
            } as any;
            const env = await envFactory.createEnv(episode);
            env.reset(seed);
            const engine = env.getEngine();
            const playerIds: number[] = engine.getState().players.map((p: any) => p.id).sort((a: number, b: number) => a - b);
            const seatAi = new Map<number, HeuristicAI>();
            for (const seat of playerIds) seatAi.set(seat, new HeuristicAI(streamFor(seed, seat)));

            // 每条真实对局里按步长取样，直到本图取够。
            const stride = 7;
            let steps = 0;
            while (!engine.isTerminal() && steps < maxSteps && perMapWritten < perMap) {
                const state: GameState = engine.getState();
                const current = state.currentPlayer;
                const allowed = engine.getLegalActions(current).filter((a: Action) => a.type !== 'surrender');
                if (allowed.length === 0) break;

                if (steps % stride === 0) {
                    const ordered = canonicalActionOrderV16(allowed);
                    const enc26 = encodeGameStateSpatial(state, current, 'v2', { channels: SPATIAL_TENSOR_CHANNELS });
                    const enc34 = encodeGameStateSpatial(state, current, 'v2', { channels: SPATIAL_TENSOR_CHANNELS_V19 });
                    const candidates = ordered.map(item => {
                        const feat = encodeCandidateActionSpatial(state, current, item.action, 'v2', 'v15_current');
                        coverage.actionTypes[item.code.split(':')[0]] =
                            (coverage.actionTypes[item.code.split(':')[0]] ?? 0) + 1;
                        return {
                            actionCode: item.code,
                            action: item.action,
                            actorCoord: feat.actorCoord,
                            landingCoord: feat.landingCoord,
                            targetCoord: feat.targetCoord,
                            semantics: Array.from(feat.semantics),
                        };
                    });
                    // TS 侧参考读数：用 34 通道检查点对同一状态打分。
                    let tsLogits: number[] | null = null;
                    let tsArgmax: number | null = null;
                    let tsValue: number | null = null;
                    if (predictor !== null) {
                        const pred = predictor.predict(enc34, candidates.map(c => ({
                            actorCoord: c.actorCoord, landingCoord: c.landingCoord,
                            targetCoord: c.targetCoord, semantics: c.semantics,
                        })));
                        tsLogits = pred.actionLogits;
                        tsArgmax = pred.bestActionIndex;
                        tsValue = pred.value;
                    }
                    await write(`${JSON.stringify({
                        snapshotId: `${mapName}|seed=${seed}|step=${steps}|player=${current}`,
                        mapName, seed, stepIndex: steps, turn: state.turn, playerId: current,
                        legalActionCount: allowed.length,
                        candidateOrderingId: 'actionCode-codepoint-asc-v1',
                        state,
                        channels26: SPATIAL_TENSOR_CHANNELS,
                        channels34: SPATIAL_TENSOR_CHANNELS_V19,
                        spatialTensor26: Array.from(enc26.spatialTensor),
                        globalFeatures26: Array.from(enc26.globalFeatures),
                        spatialTensor34: Array.from(enc34.spatialTensor),
                        globalFeatures34: Array.from(enc34.globalFeatures),
                        candidates,
                        tsLogits, tsArgmax, tsValue,
                    })}\n`);
                    perMapWritten += 1;
                    written += 1;
                    // 26 通道张量必须等于 34 通道张量的前 26 个通道（旧语义原义保留）。
                    let worst = 0;
                    for (let i = 0; i < enc26.spatialTensor.length; i += 1) {
                        worst = Math.max(worst, Math.abs(enc26.spatialTensor[i] - enc34.spatialTensor[i]));
                    }
                    byChannelDiff.push(worst);
                }

                const action = seatAi.get(current)?.getAction(engine, current, undefined) ?? null;
                if (!action) break;
                if (!allowed.some((a: Action) => encodeAction(a) === encodeAction(action))) break;
                engine.step(action);
                steps += 1;
            }
            console.log(`[T19-01b] ${mapName} seed=${seed} 累计快照=${perMapWritten}`);
        }
        coverage.maps[mapName] = perMapWritten;
        if (perMapWritten < perMap) {
            throw new Error(`[T19-01b] ${mapName} 只取到 ${perMapWritten}/${perMap} 个快照，拒绝用不足的覆盖度出夹具。`);
        }
    }

    await new Promise<void>(r => out.end(r));
    const maxPrefixDiff = byChannelDiff.length ? Math.max(...byChannelDiff) : null;
    const report = {
        schema: 'v19_parity_fixture_report_1',
        runId,
        outPath: outPath.replace(/\\/g, '/'),
        snapshots: written,
        perMap: coverage.maps,
        actionTypesCovered: coverage.actionTypes,
        distinctActionTypes: Object.keys(coverage.actionTypes).length,
        referenceCheckpoint: modelPath,
        referenceSchema: predictor?.encoderSchemaId ?? null,
        maxAbsDiffBetween26And34Prefix: maxPrefixDiff,
        note: '26 通道张量必须逐位等于 34 通道张量的前 26 个通道；不为 0 说明旧通道语义被改动。',
    };
    if (maxPrefixDiff !== null && maxPrefixDiff !== 0) {
        throw new Error(`[T19-01b] 旧通道语义被改动：26/34 前缀最大差 ${maxPrefixDiff}。`);
    }
    const reportPath = outPath.replace(/\.jsonl$/, '.report.json');
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[T19-01b] 完成 snapshots=${written} 动作类型=${report.distinctActionTypes} -> ${outPath}`);
}

const entryPath = (process.argv[1] ?? '').replace(/\\/g, '/');
if (entryPath.endsWith('v19/tools/export_parity_fixture_v19.ts')) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.stack ?? error.message : String(error));
        process.exit(1);
    });
}
