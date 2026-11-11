import { it, expect } from 'vitest';
import { Writable } from 'node:stream';
import { gunzipSync } from 'node:zlib';
import { boundedWriter } from './bounded_writer';

it('低水位异步背压下完整保存所有JSON行', async () => {
    const chunks: Buffer[] = [];
    const sink = new Writable({ highWaterMark: 1, write(chunk, _, callback) { chunks.push(Buffer.from(chunk)); setTimeout(callback, 1); } });
    const writer = boundedWriter('注入内存目标', 2000, sink);
    const rows = Array.from({ length: 40 }, (_, i) => ({ i, text: '测试'.repeat(1000) }));
    for (const row of rows) await writer.write(row);
    await writer.close();
    expect(gunzipSync(Buffer.concat(chunks)).toString().trim().split('\n').map(line => JSON.parse(line))).toEqual(rows);
});

it('目标磁盘错误及已经关闭的失败流不会永久等待close事件', async () => {
    const sink = new Writable({ write(_, __, callback) { callback(Object.assign(Error('磁盘空间不足'), { code: 'ENOSPC' })); } });
    const writer = boundedWriter('注入磁盘错误', 500, sink);
    try { for (let i = 0; i < 16; i++) await writer.write({ i }); } catch { /* 允许错误在写入阶段暴露。 */ }
    await expect(writer.close()).rejects.toThrow('磁盘空间不足');
    await expect(writer.close()).rejects.toThrow('磁盘空间不足');
});

it('永不回调的底层目标也会在安全时限内拒绝并释放管道', async () => {
    const sink = new Writable({ write() { /* 模拟底层写入永不完成。 */ } });
    const writer = boundedWriter('注入停滞目标', 50, sink);
    await writer.write({ test: true });
    await expect(writer.close()).rejects.toThrow('安全时限');
    expect(sink.destroyed).toBe(true);
});
