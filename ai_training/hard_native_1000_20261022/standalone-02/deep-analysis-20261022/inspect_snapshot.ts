import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readNativeConfig, readNativeSnapshot } from '../../../data_acceptance_20261016/native_reader/reader';

// 仅解析已保存的原生二进制，不模拟招募规则，不修改游戏状态。
const folder = new URL('./', import.meta.url);
const snapshot = readNativeSnapshot(readFileSync(new URL('before-action-900.bin', folder)));
const config = readNativeConfig(readFileSync(new URL('failed-native/config.bin', folder)));
const { c: definitions, d: board, e: players, f: runtime } = snapshot.components;
if (!definitions || !board || !players) throw new Error('原生组件缺失');
const units = board.e?.flatMap(column => column ?? []).filter(unit => unit !== null) ?? [];
const active = players.e;
const ownUnits = units.filter(unit => unit.b === active);
const output = {
  note: '第900号动作之前的完整原生快照；之后唯一已提交动作是(11,13)移动到(11,11)并待机',
  currentPlayer: active, round: players.f, turn: players.g,
  gold: players.l, populationCaps: players.m, availableTypesOverrides: players.n,
  pendingUnit: players.d, runtime, configCaps: config?.k,
  recruitDefinitions: definitions.b,
  ownUnits: ownUnits.map(unit => ({ type: unit.a, x: unit.c.a, y: unit.c.b, population: definitions.b?.[unit.a]?.b })),
  populationUsed: ownUnits.reduce((sum, unit) => sum + (definitions.b?.[unit.a]?.b ?? 0), 0),
  targetTerrainEncoded: board.c?.[13]?.[4], targetOccupant: board.e?.[13]?.[4],
};
writeFileSync(new URL('snapshot-900-inspection.json', folder), JSON.stringify(output, (_, value) => typeof value === 'bigint' ? String(value) : value, 2));
console.log(JSON.stringify(output, (_, value) => typeof value === 'bigint' ? String(value) : value));
