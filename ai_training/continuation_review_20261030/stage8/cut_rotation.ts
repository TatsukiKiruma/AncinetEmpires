import assert from 'node:assert/strict';
import path from 'node:path';
import { aliveSeats } from './scenarios';
import type { GameState } from '../../../src/game/types';

/** 按存活人数分桶，块与块内席位共同推进游标；保留原始玩家ID与来源。 */
export function rotatingCuts<T extends {state: GameState}>(cuts: T[], playerCounts: number[], block: number): (T | undefined)[] {
    const pools = new Map<number, T[]>();
    for (const cut of cuts) {
        const n = aliveSeats(cut.state).length;
        const bucket = pools.get(n) ?? []; bucket.push(cut); pools.set(n, bucket);
    }
    const totals = new Map<number, number>(), cursors = new Map<number, number>();
    for (const n of playerCounts) totals.set(n, (totals.get(n) ?? 0) + 1);
    return playerCounts.map(n => {
        const pool = pools.get(n); if (!pool?.length) return undefined;
        const offset = cursors.get(n) ?? 0; cursors.set(n, offset + 1);
        return pool[((block - 1) * totals.get(n)! + offset) % pool.length];
    });
}

/** 禁止跨代、开发集或未完成上一代的数据进入中盘起点池。 */
export function assertCutSources(prior:any,generation:number,directory:string) {
    assert(prior.passed&&prior.sealedAccess===0&&prior.generation===generation-1,'上一代来源未完成或身份不符');
    assert(prior.games.every((g:any)=>g.complete && path.resolve(path.dirname(g.database))===path.resolve(directory)
        && new RegExp(`^s8-train-g${generation-1}-b[0-9]+-[2-6]p-[0-3]$`).test(g.gameId)),'中盘来源不是上一代训练');
}
