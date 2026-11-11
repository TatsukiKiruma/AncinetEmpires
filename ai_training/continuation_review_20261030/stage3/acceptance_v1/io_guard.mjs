/** 只对阶段三产物的Windows瞬时替换冲突进行有界重试，不改变对局逻辑。 */
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

const rename = fs.renameSync.bind(fs);
const sleeper = new Int32Array(new SharedArrayBuffer(4));
fs.renameSync = function guardedRename(source, destination) {
    const started = performance.now();
    const target = String(destination).replaceAll('\\', '/').toLowerCase();
    const owned = target.includes('/continuation_stage3_20261030_v1/') || target.includes('/continuation_review_20261030/stage3/');
    let retries = 0;
    for (;;) {
        try {
            const result = rename(source, destination);
            if (retries) console.error(JSON.stringify({ infrastructureRetry: 'renameSync', retries, waitedMs: performance.now() - started, destination: String(destination) }));
            return result;
        } catch (error) {
            if (!owned || !['EPERM', 'EACCES', 'EBUSY'].includes(error?.code) || performance.now() - started >= 2000) throw error;
            retries++;
            Atomics.wait(sleeper, 0, 0, 20);
        }
    }
};
