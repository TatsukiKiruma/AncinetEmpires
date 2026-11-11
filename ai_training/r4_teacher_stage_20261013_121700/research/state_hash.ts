import crypto from 'crypto';
import { GameState } from '../env/src/game/types';

/**
 * 递归将对象的键按字母顺序排序，用于生成稳定的规范 JSON
 */
function canonicalize(value: any): any {
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
    // 保持原始数据完整性，按字母序对字段序列化
    return JSON.stringify(canonicalize(state));
}

/**
 * 计算游戏状态的 SHA-256 哈希值
 */
export function computeStateHash(state: GameState): string {
    const canonical = canonicalStateString(state);
    return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * 玩法状态指纹（排除装饰性元数据，用于重复局面检测）
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
            ownerId: g.ownerId
        })),
        units: state.units.map(u => ({
            id: u.id,
            playerId: u.playerId,
            unitClass: u.unitClass,
            x: u.pos.x,
            y: u.pos.y,
            hp: u.hp,
            level: u.level,
            hasActed: u.hasActed,
            hasMoved: u.hasMoved,
            status: u.status
        })),
        tiles: state.map.tiles.map(row => row.map(t => ({
            terrainId: t.terrainId,
            ownerId: t.ownerId ?? null,
            hp: t.hp ?? null
        }))),
        players: state.players.map(p => ({
            id: p.id,
            isAlive: p.isAlive,
            commanderId: p.commanderId ?? null
        }))
    };
    const str = JSON.stringify(canonicalize(gameplayCore));
    return crypto.createHash('sha256').update(str).digest('hex');
}
