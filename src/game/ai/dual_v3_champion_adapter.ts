import { deploymentSearchOptions } from '../../ai_runtime/dual_v3/deployment_config';
import { DualStreamModel, type WeightManifest } from '../../ai_runtime/dual_v3/model_runtime';
import { NeuralBeamSearchAI, type BeamOptions } from '../../ai_runtime/dual_v3/beam_search';
import type { GameEngine } from '../engine';
import type { AiActionOptions, AiActionResult } from './neural_ai_adapter';

export const CHAMPION_SHA256 = '81012a047520fe038ca93383a2620c4d89d87d4a825b79025c5dfd8fc121cb2e';
const policy = 'dual_v3_stage7_k1';
const assetDirectory = 'public/models/dual_v3_stage7_k1';
let model: DualStreamModel | undefined;
let loading: Promise<DualStreamModel> | undefined;

function instantiate(manifest: WeightManifest, binary: ArrayBuffer): DualStreamModel {
    if (binary.byteLength !== 7867640 || manifest.parameters !== 1966910) throw Error('冠军模型权重长度不匹配');
    return new DualStreamModel(manifest, binary);
}

function loadNodeModel(): DualStreamModel {
    if (model) return model;
    if (typeof process === 'undefined' || !process.getBuiltinModule) throw Error('请先异步预加载冠军模型');
    const fs = process.getBuiltinModule('fs');
    const path = process.getBuiltinModule('path');
    const local = path.resolve(process.cwd(), assetDirectory);
    // 发布资产必须完整，避免本机归档掩盖交付缺失。
    const directory = local;
    const bytes = fs.readFileSync(path.join(directory, 'final.bin'));
    const sha = process.getBuiltinModule('crypto').createHash('sha256').update(bytes).digest('hex');
    if (sha !== CHAMPION_SHA256) throw Error('冠军模型 SHA256 不匹配');
    model = instantiate(JSON.parse(fs.readFileSync(path.join(directory, 'final.json'), 'utf8')), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    return model;
}

export function preloadDualV3ChampionModel(): Promise<DualStreamModel> {
    if (model) return Promise.resolve(model);
    if (!loading) loading = (async () => {
        if (typeof process !== 'undefined' && process.getBuiltinModule) return loadNodeModel();
        const responses = await Promise.all([fetch('/models/dual_v3_stage7_k1/final.json'), fetch('/models/dual_v3_stage7_k1/final.bin')]);
        if (responses.some(response => !response.ok)) throw Error('冠军模型资源加载失败');
        const [manifest, binary] = await Promise.all([responses[0].json() as Promise<WeightManifest>, responses[1].arrayBuffer()]);
        const digest = await crypto.subtle.digest('SHA-256', binary);
        const sha = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
        if (sha !== CHAMPION_SHA256) throw Error('冠军模型 SHA256 不匹配');
        model = instantiate(manifest, binary);
        return model;
    })().catch(error => { loading = undefined; throw error; });
    return loading;
}

export function createDualV3Stage7K1SearchAI(options?: Partial<BeamOptions>): NeuralBeamSearchAI {
    const loaded = model ?? loadNodeModel();
    return new NeuralBeamSearchAI(loaded, deploymentSearchOptions(CHAMPION_SHA256, options));
}

export function getDualV3ChampionAction(engine: GameEngine, playerId: number, options?: AiActionOptions): AiActionResult {
    const start = performance.now();
    const remaining = (options?.deadlineMs ?? 1000) - (performance.now() - start);
    if (remaining < 100) throw Error('冠军模型决策剩余预算不足');
    const budget = Math.min(3800, remaining * .75);
    const ai = createDualV3Stage7K1SearchAI({ budgetMs: budget });
    const action = ai.getAction(engine, playerId);
    const elapsed = performance.now() - start;
    const result: AiActionResult = {
        action, latencyMs: elapsed, e2eMs: elapsed, nodesExpanded: ai.telemetry.nodes,
        source: 'Stage 7 K1（Dual-Stream v3 冠军模型）', status: elapsed > (options?.deadlineMs ?? 1000) ? 'TIMEOUT' : 'OK',
        requestedPolicy: policy, actualPolicy: policy, checkpointSha256: CHAMPION_SHA256,
        encoderVersion: 'dual-v2-schema', fallbackUsed: false, fallbackReason: null,
        deadlineMiss: elapsed > (options?.deadlineMs ?? 1000),
    };
    options?.onTelemetry?.(result);
    return result;
}
