/** 所有a/b等名称均对应JADX的原名，未确认含义的字段不做语义替换。 */
export interface NativeCoord { a: number; b: number }
export interface NativeUnit {
  a: number; b: number; c: NativeCoord; d: number; e: number; f: number; g: number; h: number;
  i: boolean; j: boolean; k: boolean; l: boolean; m: string | null;
  derived: { n: number };
}
export interface NativeTerrainDefinition {
  a: boolean; b: number; c: number; d: number; e: number; f: number; g: boolean;
  h: number; i: number; j: number[] | null; k: number;
}
export interface NativeUnitDefinition {
  a: number; b: number; c: number; d: number; e: number; f: number; g: number; h: number;
  i: number; j: number; k: number; l: number; m: number; n: number; o: number;
  p: number[] | null; q: boolean; r: boolean;
}
export interface NativeDefinitions { a: (NativeTerrainDefinition | null)[] | null; b: (NativeUnitDefinition | null)[] | null }
export interface NativeMap {
  a: number; b: number; c: string | null; d: number[] | null; e: number[] | null; f: number[] | null;
  g: number; h: number[] | null; i: number[] | null;
}
export interface NativeGameConfig {
  a: boolean; b: NativeDefinitions | null; c: NativeMap | null; d: NativeRules | null; e: bigint;
  f: string | null; g: number; h: number[] | null; i: number[] | null; j: number[] | null; k: number[] | null;
}
export type NullableMatrix<T> = (T[] | null)[] | null;
export interface NativeBoard {
  a: number; b: number; c: NullableMatrix<number>; d: NullableMatrix<number>; e: NullableMatrix<NativeUnit | null>;
}
export interface NativeVariable {
  a: number; b: boolean | number | bigint | string | Buffer | null;
  /** 字符串的UTF-8原字节和float32原始位模式，便于无损审计。 */
  rawBytes?: Buffer | null; rawFloatBits?: number;
}
export interface NativeVariables { a: { key: string | null; value: NativeVariable | null }[] }
export type NativeRuleField = 'a' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l' | 'm' | 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z' | 'A' | 'B' | 'C' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';
export type NativeRules = Record<NativeRuleField, number> & { derivedDefaults: { b: 10; D: 0.25 } };
export interface NativePlayers {
  a: NativeVariables | null; b: bigint; c: NativeRules | null; d: NativeUnit | null;
  e: number; f: number; g: number; h: number;
  i: number[] | null; j: number[] | null; k: number[] | null; l: number[] | null; m: number[] | null;
  n: NullableMatrix<number>; o: number[] | null; p: number[] | null; q: number[] | null;
  r: (NativeUnit | null)[] | null; s: number[] | null;
}
export interface NativePathCache {
  a: NullableMatrix<number>; b: (NativeCoord | null)[]; c: (NativeCoord | null)[]; d: (NativeCoord | null)[];
}
export interface NativeRuntime { a: number; b: number; c: NativeCoord | null; d: NativeCoord | null; e: NativePathCache | null }
export interface NativeSnapshot {
  header: { magic: 365703; a: number; b: number };
  components: { c: NativeDefinitions | null; d: NativeBoard | null; e: NativePlayers | null; f: NativeRuntime | null };
  raw: { c: Buffer | null; d: Buffer | null; e: Buffer | null; f: Buffer | null };
  byteLength: number;
}
export interface NativeFrame { index: number; offset: number; byteLength: number; bytes: Buffer; snapshot: NativeSnapshot }
