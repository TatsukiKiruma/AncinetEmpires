import type {
  NativeBoard, NativeCoord, NativeDefinitions, NativeFrame, NativeGameConfig, NativeMap,
  NativePathCache, NativePlayers, NativeRuleField, NativeRules, NativeRuntime, NativeSnapshot,
  NativeTerrainDefinition, NativeUnit, NativeUnitDefinition, NativeVariable, NativeVariables,
} from './types';
export type * from './types';

export const NATIVE_SERIALIZER_MAGIC = 365703 as const;
export const RULE_FIELDS: readonly NativeRuleField[] = [
  'a', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r',
  's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'E', 'F', 'G', 'H', 'I', 'J',
];

export class NativeDecodeError extends Error {
  constructor(public readonly label: string, public readonly offset: number, reason: string) {
    super(`${label}@${offset}: ${reason}`); this.name = 'NativeDecodeError';
  }
}

/** 对应DataInputStream；所有数字均大端，任何嵌套对象均不允许越界。 */
export class NativeBinaryReader {
  readonly data: Buffer;
  offset = 0;
  constructor(bytes: Uint8Array, readonly label = '原生对象') {
    this.data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  fail(reason: string): never { throw new NativeDecodeError(this.label, this.offset, reason); }
  require(n: number): void {
    if (!Number.isSafeInteger(n) || n < 0 || n > this.data.length - this.offset) this.fail(`数据不足或长度无效：${n}`);
  }
  byte(): number { this.require(1); return this.data[this.offset++]; }
  bool(): boolean {
    const n = this.byte();
    // 原生writeBoolean只会产生0/1；拒绝其他值避免损坏流被静默接受。
    if (n !== 0 && n !== 1) this.fail(`非规范boolean：${n}`);
    return n === 1;
  }
  int(): number { this.require(4); const n = this.data.readInt32BE(this.offset); this.offset += 4; return n; }
  long(): bigint { this.require(8); const n = this.data.readBigInt64BE(this.offset); this.offset += 8; return n; }
  bytes(n: number): Buffer { this.require(n); const b = Buffer.from(this.data.subarray(this.offset, this.offset + n)); this.offset += n; return b; }
  count(minBytes = 1): number {
    const n = this.int();
    if (n < 0 || n > Math.floor((this.data.length - this.offset) / minBytes)) this.fail(`数组/集合计数无效：${n}`);
    return n;
  }
  nullable<T>(body: () => T): T | null { return this.bool() ? null : body(); }
  array<T>(body: () => T, minBytes = 1): T[] | null {
    return this.nullable(() => { const n = this.count(minBytes); return Array.from({ length: n }, body); });
  }
  ints(): number[] | null { return this.array(() => this.int(), 4); }
  blob(): Buffer | null { return this.nullable(() => this.bytes(this.count())); }
  string(): string | null {
    return this.nullable(() => {
      this.require(2); const n = this.data.readUInt16BE(this.offset); this.offset += 2;
      return decodeJavaModifiedUtf8(this.bytes(n));
    });
  }
  end(): void { if (this.offset !== this.data.length) this.fail(`对象尾部多余${this.data.length - this.offset}字节`); }
}

/** Java modified UTF-8按UTF-16代码单元解码，保留代理对和U+0000。 */
export function decodeJavaModifiedUtf8(bytes: Uint8Array): string {
  const out: number[] = [];
  for (let i = 0; i < bytes.length;) {
    const first = bytes[i++];
    if (first > 0 && first < 0x80) { out.push(first); continue; }
    const continuation = () => {
      if (i >= bytes.length || (bytes[i] & 0xc0) !== 0x80) throw new Error('Java modified UTF-8续字节无效或截断');
      return bytes[i++] & 0x3f;
    };
    if ((first & 0xe0) === 0xc0) {
      const value = ((first & 0x1f) << 6) | continuation();
      if (value < 0x80 && value !== 0) throw new Error('Java modified UTF-8存在非规范过长编码');
      out.push(value);
    } else if ((first & 0xf0) === 0xe0) {
      const value = ((first & 15) << 12) | (continuation() << 6) | continuation();
      if (value < 0x800) throw new Error('Java modified UTF-8存在非规范过长编码');
      out.push(value);
    } else throw new Error(`Java modified UTF-8首字节无效：${first}`);
  }
  let result = '';
  for (let i = 0; i < out.length; i += 8192) result += String.fromCharCode(...out.slice(i, i + 8192));
  return result;
}

function root<T>(bytes: Uint8Array, label: string, body: (r: NativeBinaryReader) => T): T | null {
  const r = new NativeBinaryReader(bytes, label);
  if (r.int() !== NATIVE_SERIALIZER_MAGIC) r.fail('序列化magic错误');
  const value = r.nullable(() => body(r)); r.end(); return value;
}
function coord(r: NativeBinaryReader): NativeCoord { return { a: r.int(), b: r.int() }; }
function unit(r: NativeBinaryReader): NativeUnit {
  const a = r.int(), b = r.int(), c = coord(r), d = r.int(), e = r.int(), f = r.int(), g = r.int(), h = r.int();
  const i = r.bool(), j = r.bool(), k = r.bool(), l = r.bool(), m = r.string();
  let n = 0;
  if (d !== 0) for (let level = 9; level > 0; level--) if (d >= ((level + 1) * 100 * level) / 2) { n = level; break; }
  return { a, b, c, d, e, f, g, h, i, j, k, l, m, derived: { n } };
}
function terrainDefinition(r: NativeBinaryReader): NativeTerrainDefinition {
  return { a: r.bool(), b: r.int(), c: r.int(), d: r.int(), e: r.int(), f: r.int(), g: r.bool(), h: r.int(), i: r.int(), j: r.ints(), k: r.int() };
}
function unitDefinition(r: NativeBinaryReader): NativeUnitDefinition {
  // C0620c的序列化顺序是m,o,n，不是按字母顺序。
  const a = r.int(), b = r.int(), c = r.int(), d = r.int(), e = r.int(), f = r.int(), g = r.int(), h = r.int();
  const i = r.int(), j = r.int(), k = r.int(), l = r.int(), m = r.int(), o = r.int(), n = r.int();
  return { a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p: r.ints(), q: r.bool(), r: r.bool() };
}
function definitions(r: NativeBinaryReader): NativeDefinitions {
  return { a: r.array(() => r.nullable(() => terrainDefinition(r))), b: r.array(() => r.nullable(() => unitDefinition(r))) };
}
function rules(r: NativeBinaryReader): NativeRules {
  const result = { derivedDefaults: { b: 10 as const, D: 0.25 as const } } as NativeRules;
  for (const key of RULE_FIELDS) result[key] = r.int();
  return result;
}
function map(r: NativeBinaryReader): NativeMap {
  return { a: r.int(), b: r.int(), c: r.string(), d: r.ints(), e: r.ints(), f: r.ints(), g: r.int(), h: r.ints(), i: r.ints() };
}
function gameConfig(r: NativeBinaryReader): NativeGameConfig {
  return { a: r.bool(), b: r.nullable(() => definitions(r)), c: r.nullable(() => map(r)), d: r.nullable(() => rules(r)), e: r.long(), f: r.string(), g: r.int(), h: r.ints(), i: r.ints(), j: r.ints(), k: r.ints() };
}
function board(r: NativeBinaryReader): NativeBoard {
  return { a: r.int(), b: r.int(), c: r.array(() => r.ints()), d: r.array(() => r.ints()), e: r.array(() => r.array(() => r.nullable(() => unit(r)))) };
}
function variable(r: NativeBinaryReader): NativeVariable {
  const a = r.int();
  if (a === 0) return { a, b: r.bool() };
  if (a === 1) return { a, b: r.int() };
  if (a === 2) { const bits = r.bytes(4); return { a, b: bits.readFloatBE(), rawFloatBits: bits.readUInt32BE() }; }
  if (a === 3) return { a, b: r.long() };
  if (a === 4) { const rawBytes = r.blob(); return { a, b: rawBytes === null ? null : rawBytes.toString('utf8'), rawBytes }; }
  if (a === 5) return { a, b: r.blob() };
  // Java对未知tag不读payload并保留null；此处同样保留，不凭猜测跳字节。
  return { a, b: null };
}
function variables(r: NativeBinaryReader): NativeVariables {
  const count = r.count(2);
  return { a: Array.from({ length: count }, () => ({ key: r.string(), value: r.nullable(() => variable(r)) })) };
}
function players(r: NativeBinaryReader): NativePlayers {
  return {
    a: r.nullable(() => variables(r)), b: r.long(), c: r.nullable(() => rules(r)), d: r.nullable(() => unit(r)),
    e: r.int(), f: r.int(), g: r.int(), h: r.int(), i: r.ints(), j: r.ints(), k: r.ints(), l: r.ints(), m: r.ints(),
    n: r.array(() => r.ints()), o: r.ints(), p: r.ints(), q: r.ints(), r: r.array(() => r.nullable(() => unit(r))), s: r.ints(),
  };
}
function pathCache(r: NativeBinaryReader): NativePathCache {
  const a = r.array(() => r.ints());
  const coords = () => { const n = r.count(); return Array.from({ length: n }, () => r.nullable(() => coord(r))); };
  return { a, b: coords(), c: coords(), d: coords() };
}
function runtime(r: NativeBinaryReader): NativeRuntime {
  return { a: r.int(), b: r.int(), c: r.nullable(() => coord(r)), d: r.nullable(() => coord(r)), e: r.nullable(() => pathCache(r)) };
}

export function readNativeConfig(bytes: Uint8Array): NativeGameConfig | null { return root(bytes, 'C0585e配置', gameConfig); }
export function readNativeDefinitions(bytes: Uint8Array): NativeDefinitions | null { return root(bytes, 'C0618a定义', definitions); }
export function readNativeBoard(bytes: Uint8Array): NativeBoard | null { return root(bytes, 'C0607b棋盘', board); }
export function readNativePlayers(bytes: Uint8Array): NativePlayers | null { return root(bytes, 'C0606a玩家', players); }
export function readNativeRuntime(bytes: Uint8Array): NativeRuntime | null { return root(bytes, 'C0612e运行态', runtime); }

export function readNativeSnapshot(bytes: Uint8Array): NativeSnapshot {
  const value = root(bytes, 'C0617b快照', r => ({ a: r.int(), b: r.int(), c: r.blob(), d: r.blob(), e: r.blob(), f: r.blob() }));
  if (value === null) throw new NativeDecodeError('C0617b快照', 4, '快照根对象为null');
  return {
    header: { magic: NATIVE_SERIALIZER_MAGIC, a: value.a, b: value.b },
    components: {
      c: value.c === null ? null : readNativeDefinitions(value.c), d: value.d === null ? null : readNativeBoard(value.d),
      e: value.e === null ? null : readNativePlayers(value.e), f: value.f === null ? null : readNativeRuntime(value.f),
    }, raw: { c: value.c, d: value.d, e: value.e, f: value.f }, byteLength: bytes.byteLength,
  };
}

/** states流已解压后的逐帧读取；length为BE有符号int32，必须精确抵达流末尾。 */
export function* readNativeStateFrames(bytes: Uint8Array): Generator<NativeFrame> {
  const r = new NativeBinaryReader(bytes, 'states帧流'); let index = 0;
  while (r.offset < r.data.length) {
    const offset = r.offset, length = r.int();
    if (length <= 0) r.fail(`快照帧长度无效：${length}`);
    const frameBytes = r.bytes(length);
    yield { index: index++, offset, byteLength: length, bytes: frameBytes, snapshot: readNativeSnapshot(frameBytes) };
  }
  r.end();
}
