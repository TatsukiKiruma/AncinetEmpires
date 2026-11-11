import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { getAppApkSkirmishMapOptions, createAppApkSkirmishGameState } from '../../src/game/apk_skirmish_map_assets';
import { getAllianceId } from '../../src/game/rule_config';
import { loadSource } from './adapter';
import { DIR, ROOT, SOURCE, files, sha, digest, save, guard } from './io';

const maps = ['(2) Duel.aem', '(2) Crossed swords.aem', '(2) Icy Paths.aem', '(2) Liberty Port.aem', '(2) Peak Island.aem'];
const model = loadSource(); save('models/phone64x3.json', model);
const mapRecords = maps.map((name, index) => {
  const option = getAppApkSkirmishMapOptions().find(m => m.name === name); assert(option && option.playerCount === 2);
  const state = createAppApkSkirmishGameState(name, 'SD');
  assert.deepEqual(state.players.map(p => p.id), [0, 1]); assert.equal(state.currentPlayer, 0);
  assert.notEqual(getAllianceId(state, 0), getAllianceId(state, 1));
  save(`initial/map-${index}.json`, state);
  return { ...option, initialPath: `initial/map-${index}.json`, initialSha256: digest(state), initialGold: state.players.map(p => p.gold), alliances: state.players.map(p => getAllianceId(state, p.id)), rules: state.rules };
});
const slots = [0, 1].flatMap(modelSeat => maps.map((mapName, mapIndex) => ({ id: `${String(modelSeat * 5 + mapIndex + 1).padStart(2, '0')}-m${mapIndex}-s${modelSeat}`, device: 'phone64x3', mapIndex, mapName, modelSeat, opponentSeed: (2026101600 + mapIndex * 2 + modelSeat) >>> 0 })));
const sourceFiles = [...files(SOURCE).filter(p => /\.(ts|go|py|mjs)$/.test(p)), ...files(path.join(ROOT, 'src')).filter(p => /\.tsx?$/.test(p)), ...files(DIR).filter(p => /\.(ts|md)$/.test(p)), path.join(ROOT, 'ai_training/sd64x3_phone_20261016/model.ts')];
save('manifest.json', {
  registeredAt: new Date().toISOString(), timezone: 'Asia/Shanghai', scope: '最佳模型五图轮换十槽标准开局实战；已知地图开发/产品回归，非独立最终验收',
  sourceBindings: Object.fromEntries(sourceFiles.map(p => [path.relative(ROOT, p).replaceAll('\\', '/'), sha(fs.readFileSync(p))])),
  modelPackages: [{ device: 'phone64x3', file: 'models/phone64x3.json', sha256: sha(fs.readFileSync(path.join(DIR, 'models/phone64x3.json'))), binarySha256: model.binarySha256 }],
  maps: mapRecords, slots, opponent: '权威HeuristicAI，独立持续mulberry32',
  budgets: { maxActions: 3000, wallMs: 300000, decisionMs: 1000, workerCount: 1, outputBytesIncludingTraining: 512 * 1024 ** 2, minFreeBytes: 12 * 1024 ** 3 },
  loop: '完整规范状态含turn/实体计数器及RNG状态与消费次数，第三次完全重复停止，不做近似循环判定',
  initialization: '官方SD默认工厂，工厂已结算初次收益；GameEngine恢复不重复发放',
  decision: '稳定argmax纯policy；合法动作全部参与；不使用未训练value、搜索、禁招或战术替换',
  interruption: '开始即登记；中断计原失败槽，不补赛或重置预算',
  classifications: ['natural_win', 'natural_loss', 'natural_draw', 'surrender', 'loop', 'action_truncation', 'wall_truncation', 'decision_timeout', 'error', 'interrupted', 'not_started'],
  limitations: '官方标准初态与已消费训练来源共享；本次为开发实战；Node时延不代表浏览器时延',
  reusedHarness: '只读复用旧sd_trial_vs_heuristic_20261016的运行/回放合同，在本目录保留独立副本；不修改旧产物',
  resource: guard(), runtime: { node: process.version, platform: process.platform, arch: process.arch },
});
console.log('十槽预注册完成：五图轮换，两轮交换先后手，最佳checkpoint按开发验证冻结。');
