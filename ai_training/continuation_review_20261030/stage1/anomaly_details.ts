/** 仅直读被隔离父局的异常附近保存前态，细分投降和终局后标签。 */
import path from 'node:path';
import { HERE, read, save, decisions } from './io';
const parents = read(path.join(HERE, 'PARTITIONS.json')).parents.filter((p: any) => p.corpus === 'new' && !p.admitted);
const details: any[] = [];
for (const p of parents) {
    const last = p.positions.at(-1)?.[0] ?? 0, chosen = new Set<number>(Array.from({ length: Math.min(8, p.actions - last) }, (_, n) => last + n));
    const found: any[] = [];
    for await (const r of decisions(p, chosen)) if (r.action.type === 'surrender' || r.state.winner !== null) found.push({ macro: r.macro, sub: r.sub, action: r.action.type, winnerBefore: r.state.winner, reason: r.action.type === 'surrender' ? '示范投降不在当前网络输出指针集合，保守隔离整父局及关联组' : '保存前态已终局，保守隔离' });
    if (!found.length) throw Error('隔离原因不能在保存前态复查');
    details.push({ parentId: p.parentId, observations: found });
}
save(path.join(HERE, 'ANOMALY_DETAILS.json'), { parents: details, historicalWholeGameReplay: false });
console.log(JSON.stringify(details));
