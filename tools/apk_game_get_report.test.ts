import { describe, expect, it } from 'vitest';
import { APK_REPLAY_EVENT_TYPES } from '../src/game/apk_replay';
import { findEmbeddedActionArrayCandidate } from './apk_game_get_report';

function writeBoolean(bytes: number[], value: boolean) {
    bytes.push(value ? 1 : 0);
}

function writeInt32(bytes: number[], value: number) {
    const unsigned = value >>> 0;
    bytes.push(
        (unsigned >>> 24) & 0xff,
        (unsigned >>> 16) & 0xff,
        (unsigned >>> 8) & 0xff,
        unsigned & 0xff
    );
}

function writeInt64Zero(bytes: number[]) {
    bytes.push(0, 0, 0, 0, 0, 0, 0, 0);
}

function writeReplayRecord(bytes: number[], eventOrdinal = APK_REPLAY_EVENT_TYPES.indexOf('NONE')) {
    writeBoolean(bytes, false);
    for (let field = 0; field < 9; field += 1) {
        writeInt32(bytes, -1);
    }
    writeBoolean(bytes, false);
    writeInt32(bytes, eventOrdinal);
}

function writeReplayArray(bytes: number[], recordCount: number) {
    writeBoolean(bytes, false);
    writeInt32(bytes, recordCount);
    for (let index = 0; index < recordCount; index += 1) {
        writeReplayRecord(bytes);
    }
}

function buildMinimalC1258d(recordCount: number, trailingBytes: number[] = []): Uint8Array {
    const bytes: number[] = [];
    writeInt32(bytes, 365703);
    writeBoolean(bytes, false);

    writeBoolean(bytes, true);
    writeBoolean(bytes, true);
    writeBoolean(bytes, true);
    writeBoolean(bytes, true);
    writeInt64Zero(bytes);
    writeBoolean(bytes, true);
    writeBoolean(bytes, true);

    writeBoolean(bytes, false);
    writeBoolean(bytes, false);
    writeBoolean(bytes, true);
    writeBoolean(bytes, true);

    writeInt32(bytes, 0);
    writeInt32(bytes, 0);
    writeReplayArray(bytes, recordCount);
    bytes.push(...trailingBytes);
    return new Uint8Array(bytes);
}

describe('APK game_get 动作数组定位', () => {
    it('按 C1258d 结构定位 EOF 动作数组', () => {
        const candidate = findEmbeddedActionArrayCandidate(buildMinimalC1258d(3), 100);

        expect(candidate.recordCount).toBe(3);
        expect(candidate.remainingBytes).toBe(0);
        expect(candidate.eventCounts.NONE).toBe(3);
    });

    it('拒绝非 EOF 的短动作数组候选', () => {
        expect(() => findEmbeddedActionArrayCandidate(buildMinimalC1258d(1, [0, 1, 2, 3]), 100))
            .toThrow('动作数组未消费到对象末尾');
    });
});
