import fs from 'node:fs';
import crypto from 'node:crypto';
import type { GameState, Unit } from '../../src/game/types';
import { getLegalActions } from '../../src/game/rules';
import { encodeAction } from '../../src/game/env';
import { canonicalActionOrderV16 } from '../../src/game/ai/action_ordering';
import { encodeGameStateSpatial, encodeCandidateActionsSpatialForSchema, ENCODER_SCHEMA_ID_V19 } from '../../src/game/ai/spatial_tensor_encoder';

// 合成静态反事实，只查询编码与合法动作；不执行引擎转移或生成对局。
const soldier = (id: string, ownerId: number, x: number, y: number): Unit => ({
  id, ownerId, unitClass: 'soldier', pos: { x, y }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false,
});
const original: GameState = {
  turn: 1, currentPlayer: 0, winner: null,
  map: { width: 10, height: 10, tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ terrainId: 6 as const, ownerId: null }))) },
  players: [0, 1, 2, 3].map(id => ({ id, gold: 0, isAlive: true, commanderDeathCount: 0 })),
  units: [soldier('self', 0, 0, 0), soldier('enemy-a', 1, 6, 6), soldier('enemy-b', 2, 8, 8), soldier('ally', 3, 0, 9)],
  rules: { alliances: { 0: 0, 1: 1, 2: 2, 3: 0 }, allowSurrender: true },
};
const changed = structuredClone(original);
changed.units[1].ownerId = 2;
changed.units[2].ownerId = 1;
const digest = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const describe = (state: GameState) => {
  const ordered = canonicalActionOrderV16(getLegalActions(state, 0));
  const encoded = encodeGameStateSpatial(state, 0, 'v2', { channels: 34 });
  const candidates = encodeCandidateActionsSpatialForSchema(state, 0, ordered.map(row => row.action), 'v2', ENCODER_SCHEMA_ID_V19);
  return {
    fullInputHash: digest({ spatial: Array.from(encoded.spatialTensor), global: Array.from(encoded.globalFeatures), candidates }),
    currentLegalCodes: ordered.map(row => row.code),
    team1LegalCodes: getLegalActions(state, 1).map(encodeAction).sort(),
  };
};
const a = describe(original), b = describe(changed);
const result = {
  capturedAt: new Date().toISOString(), method: '合成多人/联盟静态反事实，0与3同盟，1和2为两个独立敌人；交换相同属性敌兵的ownerId；无引擎step、无新对局。',
  completeCurrentInputEqual: a.fullInputHash === b.fullInputHash,
  currentLegalCodesEqual: digest(a.currentLegalCodes) === digest(b.currentLegalCodes),
  team1LegalCodesEqual: digest(a.team1LegalCodes) === digest(b.team1LegalCodes),
  inputs: { original, changed }, result: { a, b },
  scope: '证明存在完整当前网络输入相同且指定下一敌方队伍可执行单位/目标不同的反例；不证明手机实际数据出现频率或最优动作必然变化。',
};
fs.writeFileSync('ai_training/next_stage_research_20261015/representation_alias_probe.json', JSON.stringify(result, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ completeCurrentInputEqual: result.completeCurrentInputEqual, currentLegalCodesEqual: result.currentLegalCodesEqual, team1LegalCodesEqual: result.team1LegalCodesEqual, hash: a.fullInputHash }, null, 2));
