/**
 * Skirmish Provenance, Partitioning & State Reconstruction (R02)
 *
 * 1. 建立稳定来源身份：archiveHash + sourceEpisodeId + rootFamilyId + stepIndex + subjectPlayerId。
 * 2. 根家族分区严格隔离：train / dev / final 集合交集严格为 0，防止跨集泄漏。
 * 3. 统一 GameState 重建入口与动作合法性单步执行复核，坏样本隔离并分类计数。
 */

import { AncientEmpiresEnv, decodeAction, encodeAction } from '../src/game/env';
import { GameEngine } from '../src/game/engine';
import type { GameState, Action } from '../src/game/types';
import type { Tile } from '../src/game/terrain';
import { sha256Text } from './skirmish_dataset_artifacts';

export interface ProvenanceIdentity {
    archiveHash: string;
    sourceEpisodeId: string | number;
    rootFamilyId: string;
    stepIndex: number;
    subjectPlayerId: number;
    subjectAllianceId: number;
}

export function formatProvenanceId(p: ProvenanceIdentity): string {
    return `${p.archiveHash}:${p.sourceEpisodeId}:${p.rootFamilyId}:${p.stepIndex}:P${p.subjectPlayerId}_A${p.subjectAllianceId}`;
}

export type SplitPartition = 'train' | 'dev' | 'final';

export interface SplitManifestV4 {
    schemaVersion: 4;
    runId: string;
    generatedAt: string;
    partitions: {
        train: string[]; // rootFamilyIds
        dev: string[];   // rootFamilyIds
        final: string[]; // rootFamilyIds
    };
    policies: {
        prohibitOverlap: true;
        augmentationInheritance: true;
        shuffleOnlyWithinTrain: true;
    };
}

export interface PartitionLeakageReport {
    hasLeakage: boolean;
    overlapTrainDev: string[];
    overlapTrainFinal: string[];
    overlapDevFinal: string[];
    totalTrainFamilies: number;
    totalDevFamilies: number;
    totalFinalFamilies: number;
}

/**
 * 纯函数：根家族分区交集泄漏审计
 */
export function auditPartitionLeakage(manifest: SplitManifestV4): PartitionLeakageReport {
    const trainSet = new Set(manifest.partitions.train);
    const devSet = new Set(manifest.partitions.dev);
    const finalSet = new Set(manifest.partitions.final);

    const overlapTrainDev = manifest.partitions.train.filter(f => devSet.has(f));
    const overlapTrainFinal = manifest.partitions.train.filter(f => finalSet.has(f));
    const overlapDevFinal = manifest.partitions.dev.filter(f => finalSet.has(f));

    const hasLeakage = overlapTrainDev.length > 0 || overlapTrainFinal.length > 0 || overlapDevFinal.length > 0;

    return {
        hasLeakage,
        overlapTrainDev,
        overlapTrainFinal,
        overlapDevFinal,
        totalTrainFamilies: trainSet.size,
        totalDevFamilies: devSet.size,
        totalFinalFamilies: finalSet.size
    };
}

export interface QuarantineRecord {
    provenanceId: string;
    reasonCode: 'SCHEMA_ERROR' | 'ILLEGAL_ACTION' | 'RECONSTRUCTION_FAIL' | 'INDEX_MISMATCH' | 'LEAKED_PARTITION' | 'UNKNOWN_ACTION';
    details: string;
    rawSampleSummary: Record<string, unknown>;
    timestamp: string;
}

/**
 * 从样本 Observation 重建完整标准的 GameState
 */
export function reconstructGameStateFromObservation(obs: any): { state: GameState | null; error?: string } {
    try {
        if (!obs || typeof obs !== 'object') {
            return { state: null, error: 'Observation 缺失或非对象' };
        }
        if (typeof obs.mapWidth !== 'number' || typeof obs.mapHeight !== 'number') {
            return { state: null, error: 'Observation 缺少地图尺寸' };
        }
        if (!Array.isArray(obs.tiles) || !Array.isArray(obs.units) || !Array.isArray(obs.players)) {
            return { state: null, error: 'Observation 缺少 tiles / units / players 数组' };
        }

        const tiles: Tile[][] = Array.from({ length: obs.mapHeight }, () => new Array(obs.mapWidth));
        if (Array.isArray(obs.tiles[0])) {
            // 已是二维数组
            for (let y = 0; y < obs.mapHeight; y++) {
                for (let x = 0; x < obs.mapWidth; x++) {
                    tiles[y][x] = obs.tiles[y][x];
                }
            }
        } else {
            // 一维数组：带 x,y 坐标或根据扁平索引恢复
            for (let i = 0; i < obs.tiles.length; i++) {
                const t = obs.tiles[i];
                if (!t) continue;
                const x = typeof t.x === 'number' ? t.x : (i % obs.mapWidth);
                const y = typeof t.y === 'number' ? t.y : Math.floor(i / obs.mapWidth);
                if (y < obs.mapHeight && x < obs.mapWidth) {
                    tiles[y][x] = t;
                }
            }
        }

        const units = obs.units.map((u: any) => ({
            ...u,
            pos: u.pos ?? { x: u.x, y: u.y }
        }));

        const state: GameState = {
            turn: obs.turn ?? 1,
            currentPlayer: obs.currentPlayer ?? 0,
            map: {
                width: obs.mapWidth,
                height: obs.mapHeight,
                tiles
            },
            units,
            players: obs.players,
            rules: obs.rules ?? {
                goldPerTown: 50,
                commanderKillWins: true,
                maxTurn: 50,
                maxPlies: 40
            },
            metadata: obs.metadata ?? { mapName: 'reconstructed' },
            winner: null
        };

        return { state };
    } catch (err: any) {
        return { state: null, error: err?.message ?? String(err) };
    }
}

export interface StateParityResult {
    valid: boolean;
    reason?: string;
    decodedAction?: Action | null;
    legalActionCount?: number;
    stepSuccess?: boolean;
}

/**
 * 校验重建后的 GameState 在游戏引擎中的合法性及动作执行校验
 */
export function validateStateActionParity(
    state: GameState,
    playerId: number,
    actionCode: string,
    expectedLegalCodes?: string[]
): StateParityResult {
    try {
        const engine = new GameEngine(state);
        const legalActions = engine.getLegalActions(playerId);
        const legalCodes = legalActions.map(a => encodeAction(a));

        if (expectedLegalCodes) {
            // 校验合法动作集合与已记录列表的一致性
            const missing = expectedLegalCodes.filter(c => !legalCodes.includes(c));
            if (missing.length > 0) {
                return {
                    valid: false,
                    reason: `合法动作集合不一致，缺失 ${missing.length} 个动作: ${missing.slice(0, 3).join(', ')}`,
                    legalActionCount: legalCodes.length
                };
            }
        }

        const decoded = decodeAction(actionCode);
        if (!decoded) {
            return {
                valid: false,
                reason: `动作代码无法解码: ${actionCode}`,
                legalActionCount: legalCodes.length
            };
        }

        if (!legalCodes.includes(actionCode)) {
            return {
                valid: false,
                reason: `动作代码 ${actionCode} 不在当前引擎合法动作列表中 (合法数: ${legalCodes.length})`,
                decodedAction: decoded,
                legalActionCount: legalCodes.length
            };
        }

        // 尝试单步执行检验
        const stepRes = engine.step(decoded);
        return {
            valid: true,
            decodedAction: decoded,
            legalActionCount: legalCodes.length,
            stepSuccess: stepRes !== undefined
        };
    } catch (err: any) {
        return {
            valid: false,
            reason: `环境单步执行校验抛错: ${err?.message ?? String(err)}`
        };
    }
}
