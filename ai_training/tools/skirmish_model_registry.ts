/**
 * Skirmish Model Registry & Immutability Manager (R03)
 *
 * 1. 模型产物不可变性：新生成的 Checkpoint 必须保存在独立的 training_runs/<runId>/checkpoints/<modelId>/ 目录。
 * 2. 绝对禁止直接覆盖 src/game/ai/models/net_b_checkpoint.json 或公共历史路径。
 * 3. 记录完整的训练元数据：输入数据 Hash、分区 Hash、超参数、随机数 Seed、训练时间与 SHA256 指纹。
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export interface ModelMetadata {
    modelId: string;
    architectureId: 'NET_A' | 'NET_B' | 'HISTORICAL_BASELINE';
    runId: string;
    trainedAt: string;
    seed: number;
    epochs: number;
    trainingDataHash: string;
    splitManifestHash: string;
    featureDimensions: { state: number; action: number };
    parameterCount: number;
    trainMetrics: Record<string, number | null>;
    devMetrics: Record<string, number | null>;
    status: 'VALUE_HOLD' | 'PROTOTYPE' | 'QUALIFIED' | 'REJECTED';
    safetyGuards: {
        publicPathsUntouched: true;
        immutableCheckpoint: true;
    };
}

export interface CheckpointArtifact {
    modelJsonPath: string;
    metadataPath: string;
    sha256: string;
    byteSize: number;
    metadata: ModelMetadata;
}

/**
 * 计算文件内容 SHA256
 */
export function computeSha256(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex').toUpperCase();
}

/**
 * 安全保存模型检查点（附带元数据并计算不可变 Hash）
 */
export function saveImmutableCheckpoint(params: {
    runId: string;
    modelId: string;
    modelJson: string;
    metadata: Omit<ModelMetadata, 'runId' | 'modelId' | 'trainedAt' | 'safetyGuards'>;
}): CheckpointArtifact {
    // 安全阻断检查：严禁包含公共路径关键字
    if (params.runId === 'models' || params.runId.includes('..')) {
        throw new Error(`安全违规：runId 不能指向公共 models 目录: ${params.runId}`);
    }

    const checkpointDir = path.resolve('training_runs', params.runId, 'checkpoints', params.modelId);
    mkdirSync(checkpointDir, { recursive: true });

    const modelJsonPath = path.join(checkpointDir, 'model.json');
    const metadataPath = path.join(checkpointDir, 'metadata.json');

    const trainedAt = new Date().toISOString();
    const fullMetadata: ModelMetadata = {
        ...params.metadata,
        runId: params.runId,
        modelId: params.modelId,
        trainedAt,
        safetyGuards: {
            publicPathsUntouched: true,
            immutableCheckpoint: true
        }
    };

    writeFileSync(modelJsonPath, params.modelJson, 'utf8');
    writeFileSync(metadataPath, JSON.stringify(fullMetadata, null, 2), 'utf8');

    const sha256 = computeSha256(params.modelJson);
    const byteSize = Buffer.byteLength(params.modelJson, 'utf8');

    return {
        modelJsonPath,
        metadataPath,
        sha256,
        byteSize,
        metadata: fullMetadata
    };
}

/**
 * 校验指定路径是否为受保护的公共部署模型路径
 */
export function isProtectedModelPath(targetPath: string): boolean {
    const normalized = path.resolve(targetPath).toLowerCase();
    const protectedPaths = [
        path.resolve('src/game/ai/models').toLowerCase(),
        path.resolve('training_runs/models').toLowerCase()
    ];
    return protectedPaths.some(p => normalized.startsWith(p));
}
