import { describe, expect, it } from 'vitest';
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import {
    ENCODER_SCHEMA_ID_V19,
    SPATIAL_TENSOR_CHANNELS_V19,
    SPATIAL_TENSOR_MAX_H,
    SPATIAL_TENSOR_MAX_W,
} from '../../src/game/ai/spatial_tensor_encoder';
import { validateExistingCoverageRow } from './finalize_current_coverage_rows';

function validRow() {
    return {
        encoderSchemaId: ENCODER_SCHEMA_ID_V19,
        spatialTensor: Array(SPATIAL_TENSOR_CHANNELS_V19 * SPATIAL_TENSOR_MAX_H * SPATIAL_TENSOR_MAX_W).fill(0),
        globalFeatures: Array(20).fill(0),
        candidateActions: [{ semantics: Array(53).fill(0) }], orderedActionCodes: ['end_turn'],
        targetActionIndex: 0, policyLossMask: true, valueLossMask: false, valueTarget: null,
        stateHash: 'a'.repeat(64), inputIdentity: 'b'.repeat(64),
        teacher: { rawScores: [1], actionCodes: ['end_turn'], targetActionCode: 'end_turn' },
    };
}

describe('validateExistingCoverageRow', () => {
    it('接受尺寸、有限值和监督字段均正确的行', () => {
        expect(validateExistingCoverageRow(validRow())).toEqual([]);
    });

    it('拒绝非有限输入、越界标签和错误 mask', () => {
        const row = validRow();
        row.globalFeatures[3] = Number.NaN;
        row.targetActionIndex = 2;
        row.policyLossMask = false;
        expect(validateExistingCoverageRow(row)).toEqual(expect.arrayContaining([
            'globalFeatures 错误', 'targetActionIndex 错误', 'loss mask 错误',
        ]));
    });

    it('接受真实 map0 首行，并拒绝其截断空间张量', async () => {
        const rowsPath = 'v19/out/coverage_20261004/map0/rows.jsonl';
        expect(existsSync(rowsPath)).toBe(true);
        const lines = createInterface({ input: createReadStream(rowsPath), crlfDelay: Infinity });
        let first: Record<string, unknown> | null = null;
        for await (const line of lines) {
            if (line.trim()) { first = JSON.parse(line) as Record<string, unknown>; break; }
        }
        expect(first).not.toBeNull();
        expect(validateExistingCoverageRow(first!)).toEqual([]);
        const truncated = { ...first!, spatialTensor: (first!.spatialTensor as number[]).slice(0, -1) };
        expect(validateExistingCoverageRow(truncated)).toContain('spatialTensor 错误');
    });
});
