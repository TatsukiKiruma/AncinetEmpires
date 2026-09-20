import { describe, it, expect } from 'vitest';
import {
    assignNaturalValueLabel,
    createDeterministicPrng,
    shuffleArrayWithSeed
} from './skirmish_value_labeling';
import {
    saveImmutableCheckpoint,
    isProtectedModelPath,
    computeSha256
} from './skirmish_model_registry';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

describe('R03: Natural Value Labels & Model Immutability', () => {
    it('价值标签：自然胜利联盟赋 +1.0，自然失败赋 -1.0，自然平局赋 0.0', () => {
        // P0 (A0) 胜 -> A0视角 = 1.0, A1视角 = -1.0
        const resA0 = assignNaturalValueLabel({
            engineTerminal: true,
            terminationCause: 'RULE_TERMINAL',
            winnerAlliance: 0,
            subjectAllianceId: 0
        });
        expect(resA0.valueTarget).toBe(1.0);
        expect(resA0.valueMask).toBe(1.0);

        const resA1 = assignNaturalValueLabel({
            engineTerminal: true,
            terminationCause: 'RULE_TERMINAL',
            winnerAlliance: 0,
            subjectAllianceId: 1
        });
        expect(resA1.valueTarget).toBe(-1.0);
        expect(resA1.valueMask).toBe(1.0);

        // 规则自然平局
        const resDraw = assignNaturalValueLabel({
            engineTerminal: true,
            terminationCause: 'RULE_TERMINAL',
            winnerAlliance: null,
            subjectAllianceId: 0
        });
        expect(resDraw.valueTarget).toBe(0.0);
        expect(resDraw.valueMask).toBe(1.0);
    });

    it('价值标签：截断与未解决样本一律置为 valueTarget = null 且 mask = 0', () => {
        const resTrunc = assignNaturalValueLabel({
            engineTerminal: false,
            terminationCause: 'MAX_STEPS',
            winnerAlliance: null,
            subjectAllianceId: 0
        });
        expect(resTrunc.valueTarget).toBeNull();
        expect(resTrunc.valueMask).toBe(0.0);

        // 哪怕有材料裁定胜者，非自然终局一律 mask
        const resAdj = assignNaturalValueLabel({
            engineTerminal: false,
            terminationCause: 'MAX_STEPS',
            winnerAlliance: null,
            adjudicatedWinnerAlliance: 0,
            subjectAllianceId: 0
        });
        expect(resAdj.valueTarget).toBeNull();
        expect(resAdj.valueMask).toBe(0.0);
    });

    it('确定性洗牌：给定相同 Seed 的洗牌结果完全相同，不同 Seed 不同', () => {
        const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const shuf1 = shuffleArrayWithSeed(arr, 42);
        const shuf2 = shuffleArrayWithSeed(arr, 42);
        const shufDiff = shuffleArrayWithSeed(arr, 999);

        expect(shuf1).toEqual(shuf2);
        expect(shuf1).not.toEqual(shufDiff);
        expect(shuf1.length).toBe(arr.length);
    });

    it('模型注册保护：受保护的公共部署路径被正确识别', () => {
        expect(isProtectedModelPath('src/game/ai/models/net_b_checkpoint.json')).toBe(true);
        expect(isProtectedModelPath('training_runs/models/net_a_checkpoint.json')).toBe(true);
        expect(isProtectedModelPath('training_runs/models/net_b_checkpoint.json')).toBe(true);
        expect(isProtectedModelPath('training_runs/agent_upgrade_20260920_v4_01/checkpoints/test/model.json')).toBe(false);
    });

    it('不可变检查点：模型保存在专属目录，计算正确 SHA256，且不覆盖公共模型', () => {
        const mockModel = JSON.stringify({ architectureId: 'NET_B', weights: [1, 2, 3] });
        const artifact = saveImmutableCheckpoint({
            runId: 'agent_upgrade_20260920_v4_01',
            modelId: 'test_model_01',
            modelJson: mockModel,
            metadata: {
                architectureId: 'NET_B',
                seed: 42,
                epochs: 3,
                trainingDataHash: 'DATA_HASH',
                splitManifestHash: 'SPLIT_HASH',
                featureDimensions: { state: 356, action: 45 },
                parameterCount: 3,
                trainMetrics: { loss: 0.1 },
                devMetrics: { loss: 0.2 },
                status: 'PROTOTYPE'
            }
        });

        expect(existsSync(artifact.modelJsonPath)).toBe(true);
        expect(artifact.sha256).toBe(computeSha256(mockModel));
        const meta = JSON.parse(readFileSync(artifact.metadataPath, 'utf8'));
        expect(meta.safetyGuards.publicPathsUntouched).toBe(true);
    });
});
