import fs from 'node:fs';
import { Writable } from 'node:stream';
import { boundedWriter as original } from '../stage4_v7/bounded_writer';
import { reserve } from './arena_io';

/** 压缩后的字节先持久预留，再写入独占文件。 */
export function boundedWriter(file: string) {
    const fd = fs.openSync(file, 'wx');
    const target = new Writable({
        write(chunk, _encoding, callback) {try {reserve(chunk.length); fs.writeSync(fd, chunk); callback();} catch (error) {callback(error as Error);}},
        destroy(error, callback) {fs.close(fd, closeError => callback(error ?? closeError));}
    });
    return original(file, 120000, target);
}
