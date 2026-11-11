/** 原件直读生成有限对照，检验随机寻址副本的宏与候选对应。 */
import fs from 'node:fs';
import path from 'node:path';
import { HERE, read, save, decisions, encode } from './io';
const parents = read(path.join(HERE, 'PARTITIONS.json')).parents.filter((p: any) => p.split === 'train' && p.admitted);
const chosen = new Map<string, any>();
for (const p of parents) { const key = `${p.corpus}/${p.source}/${p.map}`; if (!chosen.has(key)) chosen.set(key, p); }
const requests: any[] = [], fd = fs.openSync(path.join(HERE, 'cache-reference.frames'), 'wx');
try {
    for (const p of chosen.values()) {
        const positions = new Set<number>(p.corpus === 'old' ? [0, p.actions - 1] : [p.positions[0][0], p.positions.at(-1)[0]]);
        for await (const r of decisions(p, positions)) if (r.sub === 0) { const packed = encode(p, r); fs.writeSync(fd, packed.bytes); requests.push({ parentId: p.parentId, macro: r.macro, sub: r.sub, choice: 0, split: p.split }); }
    }
} finally { fs.closeSync(fd); }
save(path.join(HERE, 'CACHE_REQUESTS.json'), requests);
console.log(JSON.stringify({ samples: requests.length, parents: chosen.size }));
