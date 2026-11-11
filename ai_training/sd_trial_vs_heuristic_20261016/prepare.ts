import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { getAppApkSkirmishMapOptions, createAppApkSkirmishGameState } from '../../src/game/apk_skirmish_map_assets';
import { getAllianceId } from '../../src/game/rule_config';
import { loadSource } from './adapter';
import { DIR, ROOT, files, sha, digest, save, guard } from './io';

const maps = ['(2) Duel.aem', '(2) Crossed swords.aem', '(2) Icy Paths.aem', '(2) Liberty Port.aem', '(2) Peak Island.aem'];
const models = (['pc', 'phone'] as const).map(loadSource);
for (const model of models) save(`models/${model.device}.json`, model);
const mapRecords = maps.map((name, index) => {
  const option = getAppApkSkirmishMapOptions().find(m => m.name === name);
  assert(option && option.playerCount === 2, `官方双人地图不可用:${name}`);
  const state = createAppApkSkirmishGameState(name, 'SD');
  assert.deepEqual(state.players.map(p => p.id), [0, 1]);
  assert.equal(state.currentPlayer, 0);
  assert.notEqual(getAllianceId(state, 0), getAllianceId(state, 1));
  save(`initial/map-${index}.json`, state);
  return { ...option, initialPath: `initial/map-${index}.json`, initialSha256: digest(state), initialGold: state.players.map(p => p.gold), alliances: state.players.map(p => getAllianceId(state, p.id)), rules: state.rules, metadata: state.metadata };
});
const slots = maps.flatMap((mapName, mapIndex) => [0, 1].flatMap(modelSeat => (['pc', 'phone'] as const).map(device => ({ id: `${String(mapIndex * 4 + modelSeat * 2 + (device === 'pc' ? 1 : 2)).padStart(2, '0')}-${device}-m${mapIndex}-s${modelSeat}`, device, mapIndex, mapName, modelSeat, opponentSeed: (2026101600 + mapIndex * 2 + modelSeat) >>> 0 }))));
const sourceFiles = [...files(path.join(ROOT, 'src')).filter(p => /\.tsx?$/.test(p)), ...files(DIR).filter(p => /\.(ts|json)$/.test(p) && !p.includes(`${path.sep}models${path.sep}`) && !p.includes(`${path.sep}initial${path.sep}`))];
const sourceBindings = Object.fromEntries(sourceFiles.map(p => [path.relative(ROOT, p).replaceAll('\\', '/'), sha(fs.readFileSync(p))]));
save('manifest.json', {
  registeredAt: new Date().toISOString(), timezone: 'Asia/Shanghai', scope: '标准固定初态开发/产品回归；非独立泛化或全量训练最终验收',
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
  gitStatus: execFileSync('git', ['status', '--short', '--', 'src', 'ai_training/sd_trial_vs_heuristic_20261016'], { cwd: ROOT, encoding: 'utf8' }),
  sourceBindings, modelPackages: models.map(m => ({ device: m.device, file: `models/${m.device}.json`, sha256: sha(fs.readFileSync(path.join(DIR, `models/${m.device}.json`))), binarySha256: m.binarySha256 })),
  maps: mapRecords, substitutions: [], slots,
  budgets: { maxActions: 3000, wallMs: 300000, decisionMs: 1000, workerCount: 1, outputBytes: 512 * 1024 ** 2, minFreeBytes: 12 * 1024 ** 3 },
  loop: { enabled: true, contract: '完整规范JSON状态含turn/实体计数/全部规则字段和对手RNG状态及消费次数，第三次完全相同即停止；不去除turn或重命名ID，不使用近似循环' },
  initialization: '官方createAppApkSkirmishGameState默认SD：300初金、30单位、3级上限；工厂已发首回合收益。恢复GameEngine不再applyInitialTurnStart。联盟沿用工厂、两队敌对。',
  decision: '双方均从合法动作生成开始计时，含状态复制、候选校验、观察/编码/前向/选取/证据摘要。1000ms越界不执行该动作；独立父进程监控。纯policy无搜索，不使用value，合法投降照常执行。',
  rng: '每槽独立持续mulberry32，PC/手机配对同seed；记录状态和消费次数。GameEngine确定性，无游戏随机源。',
  interruption: '槽开始即写started.json，任何中断保留partial，不恢复或增加预算、不补赛。未开始/失败始终纳入各10槽分母。',
  classification: ['natural_win', 'natural_loss', 'natural_draw', 'surrender', 'loop', 'action_truncation', 'wall_truncation', 'decision_timeout', 'error', 'interrupted', 'not_started'],
  limitations: '两模型近乎相同，同地图/座位配对轨迹可能相同；20槽不是20个独立随机实验。标准初态已出现在训练来源。Node时延不能称浏览器时延。',
  modelMaxDifference: Math.max(...models[0].weights.map((w, i) => Math.abs(w - models[1].weights[i]))), resource: guard(), runtime: { node: process.version, platform: process.platform, arch: process.arch }
});
console.log('预注册完成：20槽，5张首选官方地图，双来源分别封包。');
