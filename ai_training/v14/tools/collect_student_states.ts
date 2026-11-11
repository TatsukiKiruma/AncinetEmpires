/**
 * V14/T14-08：学生访问状态 + 教师重标（DAgger 数据）。
 *
 * 与 T14-02 采集的差异：
 * - 轨迹由学生策略（检查点）产生，因此分布是「学生访问状态」；
 * - 标签由指定教师（heuristic）在同一真实状态上重新给出，并单独记录是否落在
 *   策略允许集合内（`labelInPolicyAllowed`），不合法标签直接 quarantine；
 * - 记录 `behaviorPolicyId` 与 `labelTeacherId` 两个独立身份。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/collect_student_states.ts \
 *     --candidate <checkpoint.json> --scenario "SDPLAN:sd-normal:(2) Duel.aem" \
 *     --seeds 7001,7002 --out-dir <dir> --wall-ms 60000 --max-steps 4000
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { loadSdTrainingPlanConfig } from '../../tools/sd_training_state_generator';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { encodeAction } from '../../src/game/env';
import { getAllianceId, getRuleConfig, getTurnPlayerIds } from '../../src/game/rule_config';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { predictSpatialAction } from '../../src/game/ai/shared_spatial_policy';
import { ENCODER_SCHEMA_ID_V13, ENCODER_SCHEMA_ID_V14 } from '../../src/game/ai/spatial_tensor_encoder';
import type { Action, GameState } from '../../src/game/types';

const UNPACK_DIR = 'APK/_analysis/unpack';
const SD_PLAN_FILE = 'training_configs/sd_training_plan_20260705.json';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(file: string): string {
    return sha256(fs.readFileSync(file, 'utf8'));
}

function stableStringify(value: unknown): string {
    const canonical = (v: any): any => {
        if (Array.isArray(v)) return v.map(canonical);
        if (v && typeof v === 'object') {
            const out: Record<string, unknown> = {};
            for (const key of Object.keys(v).sort()) out[key] = canonical(v[key]);
            return out;
        }
        return v;
    };
    return JSON.stringify(canonical(value));
}

function rulesHashOf(state: GameState): string {
    const rules = getRuleConfig(state) as unknown as Record<string, unknown>;
    return sha256(stableStringify({ rules, map: { width: state.map.width, height: state.map.height } }));
}

function mulberry(a: number): () => number {
    return function next() {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function streamFor(seed: number, seat: number): () => number {
    let h = (seed >>> 0) ^ Math.imul(seat + 1, 0x9e3779b9);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return mulberry((h ^ (h >>> 16)) >>> 0);
}

async function main(): Promise<void> {
    const runId = arg('--run-id', 'v14_20260924_t14') as string;
    const candidatePath = arg('--candidate', null);
    const scenarioId = arg('--scenario', 'SDPLAN:sd-normal:(2) Duel.aem') as string;
    const seeds = (arg('--seeds', '7001') as string).split(',').map(Number).filter(Number.isFinite);
    const candidateSeat = Number(arg('--candidate-seat', '0'));
    const outDir = path.resolve(arg('--out-dir', path.join('v14', 'out', runId, 'T14-08', 'student_states')) as string);
    const wallMs = Number(arg('--wall-ms', '60000'));
    const maxSteps = Number(arg('--max-steps', '4000'));
    const maxPlies = Number(arg('--max-plies', '400'));

    if (!candidatePath) throw new Error('必须提供 --candidate 检查点（学生策略身份）');
    const abs = path.resolve(candidatePath);
    const json = fs.readFileSync(abs, 'utf8');
    const parsed = JSON.parse(json);
    const declared = parsed.encoderSchemaId ?? null;
    const expected = declared === ENCODER_SCHEMA_ID_V14 ? ENCODER_SCHEMA_ID_V14 : ENCODER_SCHEMA_ID_V13;
    const weights = loadSpatialResNetFromJson(json, { expectedEncoderSchemaId: expected });
    const predictor = new SpatialResNetPredictor(weights);
    const checkpointSha256 = sha256File(abs);
    const behaviorPolicyId = `spatial_candidate:${path.basename(abs)}`;

    const sdTrainingPlan = await loadSdTrainingPlanConfig(path.resolve(SD_PLAN_FILE));
    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);
    const mapName = scenarioId.split(':').pop() as string;

    fs.mkdirSync(outDir, { recursive: true });
    const statesPath = path.join(outDir, 'student_states.jsonl');
    const stream = fs.createWriteStream(statesPath, { flags: 'w' });
    const summary: any[] = [];

    for (const seed of seeds) {
        const episode = {
            kind: 'skirmish_episode', version: 1,
            scenario: { id: scenarioId, mode: 'SD', mapName, resourcePath: '' },
            seed, maxPlies, maxSteps,
            initialObservationHash: '', initialLegalActionCount: 0, fixedActionSpaceSize: 0,
            players: [], policyByPlayer: {}, steps: [], summary: {},
        } as any;
        const env = await envFactory.createEnv(episode);
        env.reset(seed);
        const engine = env.getEngine();
        const initialState = engine.getState();
        const rulesHash = rulesHashOf(initialState);
        const playerIds: number[] = initialState.players.map((p: any) => p.id).sort((a, b) => a - b);
        const seatAi = new Map<number, HeuristicAI>();
        for (const seat of playerIds) seatAi.set(seat, new HeuristicAI(streamFor(seed, seat)));

        const startedAt = Date.now();
        let steps = 0;
        let recorded = 0;
        let labelOutside = 0;
        let stopReason = 'NATURAL';
        while (!engine.isTerminal() && steps < maxSteps) {
            if (Date.now() - startedAt > wallMs) { stopReason = 'WALL_TIMEOUT'; break; }
            const state = engine.getState();
            const current = state.currentPlayer;
            const legal = engine.getLegalActions(current);
            const allowed = legal.filter((a) => a.type !== 'surrender');
            if (allowed.length === 0) { stopReason = 'NO_POLICY_ALLOWED_ACTION'; break; }

            let action: Action | null = null;
            if (current === candidateSeat) {
                const result = predictSpatialAction(predictor, state, current, allowed);
                action = result.action;
            } else {
                action = seatAi.get(current)?.getAction(engine, current, undefined) ?? null;
            }
            if (!action) { stopReason = 'NO_ACTION'; break; }

            // 教师重标：在与学生完全相同的真实状态上调用启发式。
            const teacher = seatAi.get(current)?.getAction(engine, current, undefined) ?? null;
            const labelCode = teacher ? encodeAction(teacher) : null;
            const labelInPolicyAllowed = labelCode !== null && allowed.some((a) => encodeAction(a) === labelCode);
            if (!labelInPolicyAllowed) labelOutside += 1;

            const studentCode = encodeAction(action);
            if (labelInPolicyAllowed) {
                stream.write(`${JSON.stringify({
                    rootFamilyId: `V14DAGGER:${scenarioId}#${seed}`,
                    sourceStateKey: `V14DAGGER:${scenarioId}#${seed}#${steps}`,
                    partition: 'train',
                    stepIndex: steps,
                    turn: state.turn,
                    currentPlayer: current,
                    turnPlayerIds: getTurnPlayerIds(state),
                    legalActionCodes: legal.map(encodeAction),
                    policyAllowedActionCodes: allowed.map(encodeAction),
                    studentActionCode: studentCode,
                    labelActionCode: labelCode,
                    labelInPolicyAllowed,
                    agreement: studentCode === labelCode,
                    behaviorPolicyId,
                    behaviorCheckpointSha256: checkpointSha256,
                    labelTeacherId: 'heuristic',
                    labelTeacherVersion: 'src/game/ai/heuristic_ai.ts@v14-run',
                    subjectPlayer: current,
                    subjectAllianceId: getAllianceId(state, current),
                    mapName,
                    playerCount: playerIds.length,
                    rulesHash,
                    stateHash: sha256(stableStringify(state)),
                    state,
                })}\n`);
                recorded += 1;
            }
            engine.step(action);
            steps += 1;
        }
        summary.push({
            seed, steps, recorded, labelOutsidePolicyAllowed: labelOutside,
            stopReason: engine.isTerminal() ? 'NATURAL' : stopReason,
            wallMs: Date.now() - startedAt,
        });
        console.log(`[T14-08] student states seed=${seed} steps=${steps} recorded=${recorded} labelOutside=${labelOutside} stop=${summary[summary.length - 1].stopReason}`);
    }
    await new Promise<void>((resolve) => stream.end(resolve));

    fs.writeFileSync(path.join(outDir, 'student_states_report.json'), `${JSON.stringify({
        schema: 'v14_student_states_1',
        task: 'T14-08',
        runId,
        generatedAt: new Date().toISOString(),
        scenarioId,
        seeds,
        candidateSeat,
        behaviorPolicyId,
        behaviorCheckpointSha256: checkpointSha256,
        encoderSchemaId: weights.encoderSchemaId,
        labelTeacherId: 'heuristic',
        statesPath: statesPath.replace(/\\/g, '/'),
        statesSha256: sha256(fs.readFileSync(statesPath, 'utf8')),
        totalRecorded: summary.reduce((a, s) => a + s.recorded, 0),
        labelOutsidePolicyAllowed: summary.reduce((a, s) => a + s.labelOutsidePolicyAllowed, 0),
        perSeed: summary,
        note: '标签由教师在同一真实状态上给出；labelInPolicyAllowed=false 的步骤不入库（策略过滤后的教师标签不可用）。',
    }, null, 2)}\n`);
    console.log(`[T14-08] -> ${statesPath}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
});
