import fs from 'node:fs';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
import type { Encoded, Sparse } from './model';
export const int = (v: number) => { const b = Buffer.alloc(4); b.writeInt32BE(v); return b; };
const number = (v: number) => { const b = Buffer.alloc(8); b.writeDoubleBE(v); return b; };
const sparse = (r: Sparse) => { const b = Buffer.alloc(4 + r.length * 8); b.writeInt32BE(r.length); r.forEach(([i, v], j) => { b.writeInt32BE(i, 4 + j * 8); b.writeFloatBE(v, 8 + j * 8); }); return b; };

/** 分段字典是精确字节去重，不省略实体或候选；定义编号只在本分段有效。 */
export async function segmentWriter(filename: string, rows: number) {
  const gz = createGzip({ level: 6 }), file = fs.createWriteStream(filename, { flags: 'wx' }); gz.pipe(file);
  const write = async (b: Buffer) => { if (!gz.write(b)) await once(gz, 'drain'); };
  await write(Buffer.concat([int(0x53443332), int(rows)]));
  const tokenDict = new Map<string, number>(), candidateDict = new Map<string, number>();
  const ref = (r: Sparse, group: number | null, dict: Map<string, number>) => {
    const key = String(group) + ':' + JSON.stringify(r), old = dict.get(key);
    if (old !== undefined) return int(old);
    const index = dict.size; dict.set(key, index);
    return Buffer.concat([int(-index - 1), ...(group === null ? [] : [int(group)]), sparse(r)]);
  };
  return {
    async row(x: Encoded, target: number, weight: number) {
      await write(Buffer.concat([int(x.tokens.length), ...x.tokens.map((r, i) => ref(r, x.groups[i], tokenDict)), int(x.candidates.length),
        ...x.candidates.flatMap((r, i) => [ref(r, null, candidateDict), ...x.refs[i].map(int)]), int(target), number(weight)]));
    },
    async close() { gz.end(); await once(file, 'finish'); return { tokenDefinitions: tokenDict.size, candidateDefinitions: candidateDict.size }; },
  };
}
