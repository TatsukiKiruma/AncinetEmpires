import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { decodeJavaModifiedUtf8, NativeBinaryReader, readNativeConfig, readNativePlayers, readNativeSnapshot, readNativeStateFrames, RULE_FIELDS } from './reader';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (name: string) => fs.readFileSync(path.join(fixtures, name));

/** 测试独立按Java写入次序重新编码，检验解析字段无遗漏且字节精确往返。 */
class Writer {
  chunks: Buffer[] = [];
  int(v: number) { const b = Buffer.alloc(4); b.writeInt32BE(v); this.chunks.push(b); }
  long(v: bigint) { const b = Buffer.alloc(8); b.writeBigInt64BE(v); this.chunks.push(b); }
  bool(v: boolean) { this.chunks.push(Buffer.from([v ? 1 : 0])); }
  nullable(v: any, fn: (v: any) => void) { this.bool(v === null); if (v !== null) fn(v); }
  array(v: any[] | null, fn: (v: any) => void) { this.nullable(v, a => { this.int(a.length); for (const item of a) fn(item); }); }
  ints(v: number[] | null) { this.array(v, x => this.int(x)); }
  blob(v: Buffer | null) { this.nullable(v, x => { this.int(x.length); this.chunks.push(x); }); }
  string(v: string | null) {
    this.nullable(v, value => {
      const bytes: number[] = [];
      for (let i = 0; i < value.length; i++) {
        const c = value.charCodeAt(i);
        if (c > 0 && c < 128) bytes.push(c);
        else if (c < 2048) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
      const size = Buffer.alloc(2); size.writeUInt16BE(bytes.length); this.chunks.push(size, Buffer.from(bytes));
    });
  }
  object(v: any, kind: string) { this.nullable(v, value => this.body(value, kind)); }
  matrix(v: any, kind: 'ints' | 'unit') {
    this.array(v, row => kind === 'ints' ? this.ints(row) : this.array(row, value => this.object(value, 'unit')));
  }
  body(v: any, kind: string) {
    switch (kind) {
      case 'coord': this.int(v.a); this.int(v.b); break;
      case 'unit':
        this.int(v.a); this.int(v.b); this.body(v.c, 'coord');
        for (const k of ['d', 'e', 'f', 'g', 'h']) this.int(v[k]);
        for (const k of ['i', 'j', 'k', 'l']) this.bool(v[k]); this.string(v.m); break;
      case 'terrain':
        this.bool(v.a); for (const k of ['b', 'c', 'd', 'e', 'f']) this.int(v[k]); this.bool(v.g);
        this.int(v.h); this.int(v.i); this.ints(v.j); this.int(v.k); break;
      case 'unitdef':
        for (const k of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'o', 'n']) this.int(v[k]);
        this.ints(v.p); this.bool(v.q); this.bool(v.r); break;
      case 'definitions': this.array(v.a, x => this.object(x, 'terrain')); this.array(v.b, x => this.object(x, 'unitdef')); break;
      case 'rules': for (const k of RULE_FIELDS) this.int(v[k]); break;
      case 'map':
        this.int(v.a); this.int(v.b); this.string(v.c); this.ints(v.d); this.ints(v.e); this.ints(v.f);
        this.int(v.g); this.ints(v.h); this.ints(v.i); break;
      case 'config':
        this.bool(v.a); this.object(v.b, 'definitions'); this.object(v.c, 'map'); this.object(v.d, 'rules');
        this.long(v.e); this.string(v.f); this.int(v.g); for (const k of ['h', 'i', 'j', 'k']) this.ints(v[k]); break;
      case 'board': this.int(v.a); this.int(v.b); this.matrix(v.c, 'ints'); this.matrix(v.d, 'ints'); this.matrix(v.e, 'unit'); break;
      case 'variables':
        this.int(v.a.length); for (const item of v.a) { this.string(item.key); this.object(item.value, 'variable'); } break;
      case 'variable':
        this.int(v.a);
        if (v.a === 0) this.bool(v.b);
        if (v.a === 1) this.int(v.b);
        if (v.a === 2) { const b = Buffer.alloc(4); b.writeUInt32BE(v.rawFloatBits); this.chunks.push(b); }
        if (v.a === 3) this.long(v.b);
        if (v.a === 4) this.blob(v.rawBytes);
        if (v.a === 5) this.blob(v.b);
        break;
      case 'players':
        this.object(v.a, 'variables'); this.long(v.b); this.object(v.c, 'rules'); this.object(v.d, 'unit');
        for (const k of ['e', 'f', 'g', 'h']) this.int(v[k]);
        for (const k of ['i', 'j', 'k', 'l', 'm']) this.ints(v[k]);
        this.matrix(v.n, 'ints'); for (const k of ['o', 'p', 'q']) this.ints(v[k]);
        this.array(v.r, x => this.object(x, 'unit')); this.ints(v.s); break;
      case 'path':
        this.matrix(v.a, 'ints'); for (const k of ['b', 'c', 'd']) { this.int(v[k].length); for (const x of v[k]) this.object(x, 'coord'); } break;
      case 'runtime': this.int(v.a); this.int(v.b); this.object(v.c, 'coord'); this.object(v.d, 'coord'); this.object(v.e, 'path'); break;
      default: throw new Error(`未知测试对象类型：${kind}`);
    }
  }
  result() { return Buffer.concat(this.chunks); }
}
function encode(value: any, kind: string) { const w = new Writer(); w.int(365703); w.object(value, kind); return w.result(); }

test('真实initial/final/config及首帧完整消费，并由全部解析字段精确重建字节', () => {
  for (const name of ['initial.bin', 'final.bin']) {
    const bytes = read(name), snap = readNativeSnapshot(bytes);
    assert.equal(snap.byteLength, bytes.length); assert.equal(snap.header.a, 100); assert.equal(snap.header.b, 400);
    assert.equal(snap.components.d?.a, 11); assert.equal(snap.components.d?.b, 19);
    for (const [field, kind] of [['c', 'definitions'], ['d', 'board'], ['e', 'players'], ['f', 'runtime']] as const) {
      assert.deepEqual(encode(snap.components[field], kind), snap.raw[field], `${name}:${field}重编码必须逐字节相等`);
    }
    const w = new Writer(); w.int(365703); w.bool(false); w.int(snap.header.a); w.int(snap.header.b);
    for (const k of ['c', 'd', 'e', 'f'] as const) w.blob(snap.raw[k]); assert.deepEqual(w.result(), bytes);
  }
  const configBytes = read('config.bin'), cfg = readNativeConfig(configBytes);
  assert(cfg); assert.equal(cfg.c?.a, 11); assert.deepEqual(encode(cfg, 'config'), configBytes);
  const frames = [...readNativeStateFrames(read('first-frame.bin'))];
  assert.equal(frames.length, 1); assert.equal(frames[0].offset, 0); assert.deepEqual(frames[0].bytes, read('initial.bin'));
  assert.equal(readNativeSnapshot(read('final.bin')).components.e?.h, 3);
});

test('拒绝错误magic、根null、尾随字节、截断对象和帧、负长与越界长', () => {
  const bytes = read('initial.bin');
  assert.throws(() => readNativeSnapshot(Buffer.alloc(5)), /magic/);
  assert.throws(() => readNativeSnapshot(Buffer.from([0, 5, 148, 135, 1])), /null/);
  assert.throws(() => readNativeSnapshot(Buffer.concat([bytes, Buffer.from([0])])), /尾部/);
  for (const cut of [0, 1, 4, 5, 12, 16, 32, bytes.length - 1]) assert.throws(() => readNativeSnapshot(bytes.subarray(0, cut)));
  for (const prefix of [Buffer.from([255, 255, 255, 255]), Buffer.from([127, 255, 255, 255]), Buffer.from([0, 0, 0, 0])]) {
    assert.throws(() => [...readNativeStateFrames(prefix)]);
  }
  assert.throws(() => [...readNativeStateFrames(read('first-frame.bin').subarray(0, -1))]);
  assert.throws(() => [...readNativeStateFrames(Buffer.concat([read('first-frame.bin'), Buffer.from([0])]))]);
});

test('Java64位、null与空数组、modified UTF-8、非规范boolean严格区分', () => {
  const w = new Writer(); w.long(9223372036854775807n); w.long(-9223372036854775808n); w.ints(null); w.ints([]); w.string('中\0😀');
  const r = new NativeBinaryReader(w.result());
  assert.equal(r.long(), 9223372036854775807n); assert.equal(r.long(), -9223372036854775808n);
  assert.equal(r.ints(), null); assert.deepEqual(r.ints(), []); assert.equal(r.string(), '中\0😀'); r.end();
  for (const bytes of [[0], [0xe4, 0xb8], [0xc1, 0x81], [0xf0, 0x9f, 0x98, 0x80]]) assert.throws(() => decodeJavaModifiedUtf8(Uint8Array.from(bytes)));
  assert.throws(() => new NativeBinaryReader(Buffer.from([2])).bool(), /boolean/);
});

test('变量表所有tag、重复/null键、非有限float原始位模式均保留', () => {
  const players = readNativeSnapshot(read('initial.bin')).components.e!;
  players.a = { a: [
    { key: '重复', value: { a: 0, b: true } }, { key: '重复', value: { a: 1, b: -2147483648 } },
    { key: null, value: null }, { key: '浮点', value: { a: 2, b: NaN, rawFloatBits: 0x7fc01234 } },
    { key: '长整数', value: { a: 3, b: 9223372036854775807n } },
    { key: '文本', value: { a: 4, b: '中', rawBytes: Buffer.from('中') } },
    { key: '空文本', value: { a: 4, b: null, rawBytes: null } },
    { key: '嵌套对象', value: { a: 5, b: Buffer.from([0, 5, 148, 135, 1]) } },
    { key: '未知tag', value: { a: 99, b: null } },
  ] };
  const encoded = encode(players, 'players'), decoded = readNativePlayers(encoded)!;
  assert.deepEqual(decoded.a, players.a); assert.deepEqual(encode(decoded, 'players'), encoded);
  const snapshot = readNativeSnapshot(read('initial.bin'));
  const w = new Writer(); w.int(365703); w.bool(false); w.int(100); w.int(400);
  w.blob(Buffer.concat([snapshot.raw.c!, Buffer.from([0])]));
  for (const key of ['d', 'e', 'f'] as const) w.blob(snapshot.raw[key]);
  assert.throws(() => readNativeSnapshot(w.result()), /C0618a.*尾部/);
});
