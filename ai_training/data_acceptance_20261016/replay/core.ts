import { createHash } from 'node:crypto';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction, decodeAction } from '../../../src/game/env';
import { getAllianceId } from '../../../src/game/rule_config';
import { createRecordExpansionOptions, expandApkReplayRecordToProjectActions, type ApkReplayActionRecord } from '../../../src/game/apk_replay';
import type { Action, GameState } from '../../../src/game/types';

export const SCHEMA = 'replay_candidate_stream_v1';
export const ENGINE_OPTIONS = { disableAutoAdvanceWhenNoMeaningfulAction: true, applyInitialTurnStart: true } as const;
export const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
export function canonical(value: unknown): string {
  if (value === undefined) throw new Error('规范哈希不接受undefined');
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().filter(k => (value as Record<string, unknown>)[k] !== undefined)
    .map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
}
export const digest = (value: unknown) => sha256(canonical(value));
export function ruleStateHash(state: GameState): string {
  // metadata在公共GameState中明确不参与规则；其余字段与数组顺序全部保留。
  const { metadata: _metadata, ...rulesState } = state;
  return digest(rulesState);
}
export interface PrivateIdentity {
  gameIdHash: string | null;
  ownerIdHash: string | null;
  players: Array<{ seat: number; type: number; idHash: string | null; labelHash: string | null }>;
}
export function privateIdentity(bytes: Uint8Array): PrivateIdentity {
  // 沿用权威解析器的C1258d布局，仅保存标识散列，不保留账号和昵称原文。
  const b = Buffer.from(bytes); let p = 0;
  const need = (n: number) => { if (p + n > b.length) throw Error('身份对象截断'); };
  const byte = () => { need(1); return b[p++]; };
  const int = () => { need(4); const x = b.readInt32BE(p); p += 4; return x; };
  const str = () => { if (byte()) return null; need(2); const n = b.readUInt16BE(p); p += 2; need(n); const h = sha256(b.subarray(p, p + n)); p += n; return h; };
  if (int() !== 365703 || byte()) throw Error('身份对象头无效');
  const gameIdHash = str(), ownerIdHash = str();
  for (let i = 0; i < 2; i++) if (!byte()) int();
  need(8); p += 8;
  const players: PrivateIdentity['players'] = [];
  if (!byte()) {
    const n = int(); if (n < 0 || n > 32) throw Error('身份玩家数越界');
    for (let seat = 0; seat < n; seat++) {
      if (byte()) continue;
      players.push({ seat, type: int(), idHash: str(), labelHash: str() });
    }
  }
  return { gameIdHash, ownerIdHash, players };
}
export function strictExpand(records: readonly ApkReplayActionRecord[], macro: number, state: GameState): Action[] {
  return expandApkReplayRecordToProjectActions(records[macro], state, createRecordExpansionOptions(records, macro, {
    allowAmbiguousRecruitDeployFirstMatch: false,
    allowMissingAttackTargetAsNoop: false,
    allowMissingSourceAsNoop: false,
    allowInvalidRecruitAsNoop: false,
    skipInvalidEventAsNoop: false,
    onNotice: notice => { throw new Error(`拒绝回放信息损失:${notice.kind}:${notice.reason}`); }
  }));
}
export function stepStrict(engine: GameEngine, state: GameState, action: Action) {
  // 先于engine.step检查终局，禁止其Game already ended分支伪装为成功消费。
  if (engine.isTerminal() || state.winner !== null) throw Error('拒绝终局后原子动作，禁止静默忽略');
  const legal = engine.getLegalActions(state.currentPlayer);
  const codes = legal.map(encodeAction);
  if (new Set(codes).size !== codes.length || codes.includes('unknown')) throw Error('有序候选动作码不唯一或不可编码');
  const actionCode = encodeAction(action), decoded = decodeAction(actionCode);
  if (!decoded || encodeAction(decoded) !== actionCode) throw Error('选中动作编码不能无损往返');
  const index = codes.indexOf(actionCode);
  if (index < 0) throw Error(`严格合法动作缺失:${actionCode}`);
  const result = engine.step(action);
  if (result.info.includes('非法动作') || result.info === 'Game already ended') throw Error(`权威引擎拒绝:${result.info}`);
  return { result, actionCode, candidateIndex: index, candidateCount: codes.length, candidateHash: digest(codes) };
}
export function controller(state: GameState, identity: PrivateIdentity, playerTypes: number[]) {
  const seat = state.currentPlayer;
  const p = identity.players.find(x => x.seat === seat);
  return { seat, alliance: getAllianceId(state, seat), type: playerTypes[seat] ?? null, idHash: p?.idHash ?? null };
}
export function stepLabels(action: Action) {
  // policyMask仅是局部资格；读取者仍必须要求整局receipt.accepted=true。
  return { policyMask: action.type !== 'surrender', valueMask: false, returnMask: false, nativeOutcomeVerified: false };
}
