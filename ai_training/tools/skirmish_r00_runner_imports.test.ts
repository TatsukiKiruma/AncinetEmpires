import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeSha256 } from './skirmish_model_registry';

describe('R00: Zero Side-Effect Runner Import Test', () => {
    const originalHashes = {
        browserNetB: '4839E4C79C861245BF8E50C4F1DD0FDC284A85F1E97A25A9F00C99C691A888B2',
        modelsNetA: '9627F1D045B1B895C8F3838814EE0D8EEAF47656EBFB1E8E1C6A68EC53A6311A',
        modelsNetB: '4839E4C79C861245BF8E50C4F1DD0FDC284A85F1E97A25A9F00C99C691A888B2'
    };

    it('导入所有 5 个 runner 模块不触发执行、不修改公共模型文件', async () => {
        // 动态导入 5 个脚本
        const m1 = await import('./skirmish_final_eval_runner');
        const m2 = await import('./skirmish_ablation_runner');
        const m3 = await import('./skirmish_teacher_qualification_runner');
        const m4 = await import('./skirmish_depth_comparison_runner');
        const m5 = await import('./test_dual_head_value_training');

        expect(m1.runFinalEvaluation).toBeDefined();
        expect(m2.runNeuralSearchAblation).toBeDefined();
        expect(m3.runTeacherQualification).toBeDefined();
        expect(m4.runDepthComparison).toBeDefined();
        expect(m5.runDualHeadTraining).toBeDefined();

        // 校验公共模型文件未被篡改
        const browserB = readFileSync('src/game/ai/models/net_b_checkpoint.json', 'utf8');
        expect(computeSha256(browserB)).toBe(originalHashes.browserNetB);

        const modelsA = readFileSync('training_runs/models/net_a_checkpoint.json', 'utf8');
        expect(computeSha256(modelsA)).toBe(originalHashes.modelsNetA);

        const modelsB = readFileSync('training_runs/models/net_b_checkpoint.json', 'utf8');
        expect(computeSha256(modelsB)).toBe(originalHashes.modelsNetB);
    });
});
