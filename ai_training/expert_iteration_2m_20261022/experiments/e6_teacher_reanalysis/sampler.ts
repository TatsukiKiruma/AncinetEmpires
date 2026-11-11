/** 配额内按地图、行动方和局程轮转，层内固定哈希排序；不复制补足。 */
import { hash, SEED } from './common';
import type { StateRow, Source } from './contract';
export const QUOTAS: Record<Source, number> = {
    'search-expert': 512, 'project-hard-demonstration': 2048,
    'natural-winner-demonstration': 512, 'value-only': 1024,
};
export const developmentMap = (name: string) => /Icy Paths|The Crossing/.test(name);
export function stratified(rows: StateRow[], count: number, used: Set<string>, parents: Map<string, number>, cap = 64) {
    const groups = new Map<string, StateRow[]>();
    for (const row of rows) {
        const key = `${row.map}/${row.state.currentPlayer}/${row.phase}`;
        const group = groups.get(key) ?? []; group.push(row); groups.set(key, group);
    }
    const queues = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([, group]) =>
        group.sort((a, b) => hash(`${SEED}:${a.id}`).localeCompare(hash(`${SEED}:${b.id}`))));
    const picked: StateRow[] = [];
    while (picked.length < count) {
        let progress = false;
        for (const queue of queues) {
            let row: StateRow | undefined;
            while ((row = queue.shift())) {
                if (used.has(row.canonical) || (parents.get(row.parent) ?? 0) >= cap) continue;
                used.add(row.canonical); parents.set(row.parent, (parents.get(row.parent) ?? 0) + 1);
                picked.push(row); progress = true; break;
            }
            if (picked.length === count) break;
        }
        if (!progress) break;
    }
    return picked;
}
