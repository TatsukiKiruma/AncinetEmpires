// 仅用于协议回归：按请求编号延迟完整响应，模拟迟到包及真正无响应的服务。
const delays = (process.env.STAGE4_FAKE_DELAYS ?? '0').split(',').map(Number);
let input = Buffer.alloc(0), sequence = 0;
process.stdin.on('data', chunk => {
    input = Buffer.concat([input, chunk]);
    while (input.length >= 8) {
        const ms = input.readUInt32LE(), bs = input.readUInt32LE(4);
        if (input.length < 8 + ms + bs) return;
        const meta = JSON.parse(input.subarray(8, 8 + ms).toString()); input = input.subarray(8 + ms + bs);
        const id = ++sequence, delay = delays[Math.min(id - 1, delays.length - 1)];
        setTimeout(() => {
            const bytes = Buffer.from(JSON.stringify(meta.sources.map(() => ({ sequence: id, logits: [id], valueLogits: [0, 0, -1e9, -1e9, -1e9, -1e9], valueProbs: [.5, .5, 0, 0, 0, 0] }))));
            const header = Buffer.alloc(4); header.writeUInt32LE(bytes.length); process.stdout.write(Buffer.concat([header, bytes]));
        }, delay);
    }
});
process.stdin.on('end', () => process.exit(0));
