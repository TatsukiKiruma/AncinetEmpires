/** 响应帧为版本魔数、样本数、逐字段长度与小端float32；外层仍使用字节长度。 */
export function decodeResponse(raw: Buffer) {
    let offset = 0;
    const integer = () => { if (offset + 4 > raw.length) throw Error('二进制响应截断'); const n = raw.readUInt32LE(offset); offset += 4; return n; };
    if (integer() !== 0x35454149) throw Error('二进制响应版本错误');
    const count = integer();
    if (count < 1 || count > 256) throw Error('响应样本数越界');
    const rows: Record<string, Float32Array>[] = [];
    for (let i = 0; i < count; i++) {
        const row: Record<string, Float32Array> = {};
        for (const name of ['logits', 'valueLogits', 'valueProbs', 'actorPrior']) {
            const length = integer();
            if (length > 2 ** 24 || offset + length * 4 > raw.length || (name.startsWith('value') && length !== 6)) throw Error('响应字段长度错误');
            const values = new Float32Array(length);
            for (let j = 0; j < length; j++) {
                values[j] = raw.readFloatLE(offset); offset += 4;
                if (!Number.isFinite(values[j])) throw Error('响应含非有限值');
            }
            row[name] = values;
        }
        rows.push(row);
    }
    if (offset !== raw.length) throw Error('响应存在尾部数据');
    return rows;
}
