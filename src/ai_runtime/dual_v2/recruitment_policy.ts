import type { Action } from '../../game/types';

/** 保留兼容接口，兵种竞争由动态战术先验决定，不再硬过滤根首选之外的兵种。 */
export class RootRecruitmentPolicy {
    reset() {}
    observe(_player: number, _ranked: readonly { action: Action }[]) {}
    constrain<T extends { action: Action }>(_player: number, ranked: readonly T[]): T[] { return [...ranked]; }
}
