import { createCipheriv } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseMaybeEncryptedC1270o } from './apk_game_get_report';

// 按 APK C0991r / C0956c 的格式发送匿名只读列表请求，不读取任何账号令牌。
function int(value: number): Buffer {
    const data = Buffer.alloc(4);
    data.writeInt32BE(value);
    return data;
}
function field(name: string, value: string | number | boolean): Buffer {
    const key = Buffer.from(name);
    const length = Buffer.alloc(2);
    length.writeUInt16BE(key.length);
    let body: Buffer;
    if (typeof value === 'boolean') body = Buffer.concat([int(0), Buffer.from([+value])]);
    else if (typeof value === 'number') body = Buffer.concat([int(1), int(value)]);
    else {
        const bytes = Buffer.from(value);
        body = Buffer.concat([int(4), Buffer.from([0]), int(bytes.length), bytes]);
    }
    return Buffer.concat([Buffer.from([0]), length, key, Buffer.from([0]), body]);
}

const out = path.resolve(process.argv[2] ?? 'captures/cloud/20260907');
await mkdir(out, { recursive: true });
const key = Buffer.from('726b000000004646', 'hex');
const cipher = createCipheriv('des-cbc', key, key);
const plain = Buffer.concat([int(365703), Buffer.from([0]), int(0), int(4),
    field('s3', false), field('f4', false), field('p', 0),
    field('a1', '')]);
const body = Buffer.concat([cipher.update(plain), cipher.final()]);
const results = [];
for (const host of ['ae-multiplayer-na.toyknight.net', 'aer.augix.me']) {
    const result: Record<string, unknown> = { host, time: new Date().toISOString(), authenticated: false };
    try {
        const response = await fetch(`https://${host}/api/game_list`, {
            method: 'POST', headers: { accept: 'application/octet-stream', 'content-type': 'application/octet-stream' },
            body, signal: AbortSignal.timeout(20000)
        });
        result.httpStatus = response.status;
        const bytes = Buffer.from(await response.arrayBuffer());
        result.responseBytes = bytes.length;
        if (response.ok) {
            const { parsed } = parseMaybeEncryptedC1270o(bytes);
            result.apiStatus = parsed.version;
            result.fields = parsed.fieldSummaries;
            if (parsed.version === 100) await writeFile(path.join(out, `${host}.list.bin`), bytes);
        }
    } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
        if (error instanceof Error && error.cause) result.cause = String(error.cause);
    }
    results.push(result);
    console.log(JSON.stringify(result));
}
await writeFile(path.join(out, 'connection_probe.json'), JSON.stringify(results, null, 2) + '\n');
