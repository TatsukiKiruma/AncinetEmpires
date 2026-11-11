import fs from 'node:fs';
import { createGzip, constants } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import type { Writable } from 'node:stream';

/** 整条压缩管道的错误、背压和关闭都必须有确定的结束条件。 */
export function boundedWriter(file: string, timeoutMs = 15000, destination?: Writable) {
    const target = destination ?? fs.createWriteStream(file, { flags: 'wx' });
    const gzip = createGzip();
    let failure: Error | undefined, closed = false, rows = 0;
    const completed = pipeline(gzip, target).catch(error => { failure = error; });
    async function bounded(task: Promise<unknown>) {
        let timer: NodeJS.Timeout | undefined;
        try {
            await Promise.race([task, new Promise((_, reject) => {
                timer = setTimeout(() => {
                    failure ??= Error('轨迹写入或关闭超过安全时限');
                    gzip.destroy(failure); target.destroy(failure); reject(failure);
                }, timeoutMs);
            })]);
            if (failure) throw failure;
        } finally { if (timer) clearTimeout(timer); }
    }
    return {
        async write(row: unknown) {
            if (failure) throw failure;
            if (closed) throw Error('轨迹流已经关闭');
            await bounded(new Promise<void>((resolve, reject) => gzip.write(JSON.stringify(row) + '\n', error => error ? reject(error) : resolve())));
            // 定期输出压缩块，使长局中的已写记录能被独立观察。
            if (++rows % 16 === 0) await bounded(new Promise<void>((resolve, reject) => gzip.flush(constants.Z_SYNC_FLUSH, (error?: Error | null) => error ? reject(error) : resolve())));
        },
        async close() {
            if (!closed) { closed = true; gzip.end(); }
            await bounded(completed);
        }
    };
}
