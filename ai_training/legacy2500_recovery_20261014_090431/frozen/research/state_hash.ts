import crypto from 'crypto';
import type { GameState, Unit, PlayerState } from '../src/game/types';

/**
 * 递归将对象的键按字母顺序排序，用于生成稳定的规范 JSON
 */
export function canonicalize(value: any): any {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    const keys = Object.keys(value).sort();
    const result: Record<string, any> = {};
    for (const key of keys) {
        result[key] = canonicalize(value[key]);
    }
    return result;
}

/**
 * 计算游戏状态的规范 JSON 字符串
 */
export function canonicalStateString(state: GameState): string {
    return JSON.stringify(canonicalize(state));
}

/**
 * 计算游戏状态的完整 SHA-256 哈希值
 */
export function computeStateHash(state: GameState): string {
    const canonical = canonicalStateString(state);
    return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * 玩法状态指纹（用于三折重复检测）：
 * 覆盖实际影响未来转移和终局的所有状态字段，排查并修复了原先漏读 u.ownerId 等致命缺陷。
 */
export function computeGameplayStateKey(state: GameState): string {
    const gameplayCore = {
        currentPlayer: state.currentPlayer,
        pendingUnitId: state.pendingUnitId ?? null,
        graves: (state.graves ?? []).map(g => ({
            id: g.id,
            x: g.pos.x,
            y: g.pos.y,
            remainingTurns: g.remainingTurns,
            ownerId: g.ownerId ?? null
        })),
        units: (state.units ?? []).map((u: Unit) => ({
            id: u.id,
            ownerId: u.ownerId, // 修复：必须为 ownerId，非 playerId
            unitClass: u.unitClass,
            x: u.pos.x,
            y: u.pos.y,
            hp: u.hp,
            maxHp: u.maxHp,
            hasMoved: u.hasMoved,
            hasActed: u.hasActed,
            level: u.level ?? 0,
            exp: u.exp ?? 0,
            status: u.status ? { type: u.status.type, remainingTurns: u.status.remainingTurns } : null,
            movementRemaining: u.movementRemaining ?? null,
            hasPostAttackMoved: u.hasPostAttackMoved ?? null,
            apkPendingRecruitSource: u.apkPendingRecruitSource ?? null
        })),
        tiles: state.map.tiles.map(row => row.map(t => ({
            terrainId: t.terrainId,
            ownerId: t.ownerId ?? null,
            hp: t.hp ?? null
        }))),
        players: state.players.map((p: PlayerState) => ({
            id: p.id,
            gold: p.gold,
            isAlive: p.isAlive,
            commanderDeathCount: p.commanderDeathCount ?? 0,
            commanderReserveLevel: p.commanderReserveLevel ?? null,
            commanderReserveExp: p.commanderReserveExp ?? null
        }))
    };
    const str = JSON.stringify(canonicalize(gameplayCore));
    return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * 真实网络输入特征哈希：
 * 覆盖真正送入神经网络的完整空间张量、全局标量以及所有候选动作的空间坐标与语义向量。
 * 用于彻底杜绝训练集重复输入！
 */
export function computeNetworkInputHash(inputPayload: {
    spatial: number[] | Float32Array;
    global: number[] | Float32Array;
    candidateActorCoords: [number, number][];
    candidateLandingCoords: [number, number][];
    candidateTargetCoords: [number, number][];
    candidateSemantics: (number[] | Float32Array)[];
}): string {
    const hash = crypto.createHash('sha256');
    // 写入空间张量（以 Float32 字节缓冲或字符串）
    const spArr = inputPayload.spatial instanceof Float32Array ? inputPayload.spatial : new Float32Array(inputPayload.spatial);
    hash.update(Buffer.from(spArr.buffer, spArr.byteOffset, spArr.byteLength));

    // 写入全局标量
    const globArr = inputPayload.global instanceof Float32Array ? inputPayload.global : new Float32Array(inputPayload.global);
    hash.update(Buffer.from(globArr.buffer, globArr.byteOffset, globArr.byteLength));

    // 写入候选动作坐标与语义
    const cCount = inputPayload.candidateActorCoords.length;
    hash.update(`candidates:${cCount};`);
    for (let i = 0; i < cCount; i++) {
        const a = inputPayload.candidateActorCoords[i];
        const l = inputPayload.candidateLandingCoords[i];
        const t = inputPayload.candidateTargetCoords[i];
        const sem = inputPayload.candidateSemantics[i];
        const sArr = sem instanceof Float32Array ? sem : new Float32Array(sem);
        hash.update(`[${a[0]},${a[1]}][${l[0]},${l[1]}][${t[0]},${t[1]}]:`);
        hash.update(Buffer.from(sArr.buffer, sArr.byteOffset, sArr.byteLength));
    }
    return hash.digest('hex');
}
