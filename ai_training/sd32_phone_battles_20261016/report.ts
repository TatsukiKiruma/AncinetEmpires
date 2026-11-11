import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { loadSource } from './adapter';
import { DIR, ROOT, SOURCE, files, read, save, sha, digest, guard } from './io';
import { latency } from './match';

const manifest = read('manifest.json'), replay = read('replay-verification.json');
assert.equal(manifest.slots.length, 10); assert.equal(replay.passed, true); assert.equal(replay.slots.length, 10);
assert.deepEqual(loadSource(), read('models/phone32.json'));
for (const [name, hash] of Object.entries(manifest.sourceBindings)) assert.equal(sha(fs.readFileSync(path.join(ROOT, name))), hash);
const classes = Object.fromEntries(manifest.classifications.map((c: string) => [c, 0]));
const samples: { model: number[]; heuristic: number[] } = { model: [], heuristic: [] };
const types: { model: Record<string, number>; heuristic: Record<string, number> } = { model: {}, heuristic: {} };
const results = manifest.slots.map((slot: any) => {
  const prefix = `slots/${slot.id}`, r = read(`${prefix}/result.json`); classes[r.classification]++;
  for (const side of ['model', 'heuristic'] as const) samples[side].push(...r.latencySamples?.[side] ?? []);
  const log = path.join(DIR, prefix, 'actions.jsonl.gz');
  const rows = fs.existsSync(log) ? gunzipSync(fs.readFileSync(log)).toString().trim().split('\n').filter(Boolean).map(x => JSON.parse(x)) : [];
  for (const row of rows) { const side = row.side as 'model' | 'heuristic'; types[side][row.action.type] = (types[side][row.action.type] ?? 0) + 1; }
  const replayed = replay.slots.find((s: any) => s.slot === slot.id); assert(replayed?.passed);
  return { ...r, committedActions: rows.length, trajectorySha256: replayed.trajectorySha256 };
});
assert.equal(Object.values(classes).reduce((a: number, b: number) => a + b, 0), 10);
const summary = {
  completedAt: new Date().toISOString(), scope: manifest.scope, model: { bestEpoch: read('models/phone32.json').bestEpoch, candidateSha256: read('models/phone32.json').candidateSha256, binarySha256: read('models/phone32.json').binarySha256 },
  slots: 10, classifications: classes, naturalWinFractionFixedDenominator: classes.natural_win / 10,
  naturalTerminalFraction: (classes.natural_win + classes.natural_loss + classes.natural_draw) / 10,
  results, totalCommittedActions: results.reduce((n: number, r: any) => n + r.committedActions, 0),
  totalWallSeconds: results.reduce((n: number, r: any) => n + (r.wallMs ?? 0), 0) / 1000,
  latency: { model: latency(samples.model), heuristic: latency(samples.heuristic) }, actionTypes: types,
  mapResults: manifest.maps.map((m: any) => ({ map: m.name, slots: results.filter((r: any) => r.slot.mapName === m.name).map((r: any) => ({ modelSeat: r.slot.modelSeat, classification: r.classification, actions: r.committedActions, switches: r.realSwitches, finalTurn: r.finalTurn, seconds: (r.wallMs ?? 0) / 1000 })) })),
  legality: { replayVerified: true, strategyChoicesRecomputed: true, checkedActions: replay.totalActions, errors: classes.error, decisionTimeouts: classes.decision_timeout }, resource: guard(),
  independentEvaluation: false, trainingPerformed: false, fullTrainingStarted: false,
};
save('summary.json', summary);
const cn: Record<string, string> = { natural_win: '胜', natural_loss: '负', natural_draw: '自然和局', surrender: '投降终局', loop: '循环停止', action_truncation: '动作截断', wall_truncation: '时间截断', decision_timeout: '决策超时', error: '运行错误', interrupted: '中断', not_started: '未开始' };
const lines = ['# 900父局手机训练最佳模型十局战况', '', `对手：项目权威HeuristicAI。使用开发验证选定的最佳模型，纯policy稳定argmax，不使用value或搜索。候选SHA：\`${summary.model.candidateSha256}\`。`, '', `总计10局：自然胜${classes.natural_win}、自然负${classes.natural_loss}、自然和${classes.natural_draw}；投降${classes.surrender}、循环${classes.loop}、动作截断${classes.action_truncation}、时间截断${classes.wall_truncation}、决策超时${classes.decision_timeout}、运行错误${classes.error}、中断${classes.interrupted}、未开始${classes.not_started}。自然胜/固定10槽：${classes.natural_win * 10}%。`, '', '| 地图 | 模型先手 | 模型后手 | 先手/后手动作数 |', '|---|---|---|---:|'];
for (const m of summary.mapResults) {
  const a = m.slots.find((s: any) => s.modelSeat === 0), b = m.slots.find((s: any) => s.modelSeat === 1);
  lines.push(`| ${m.map} | ${cn[a.classification]} | ${cn[b.classification]} | ${a.actions}/${b.actions} |`);
}
lines.push('', `共执行${summary.totalCommittedActions}条原子动作，逐局计时合计${summary.totalWallSeconds.toFixed(2)}秒。每局3000动作/300秒，每次决策1000ms；截断、循环和错误均保留在10局分母，不强行归胜负或和局。`, '', `模型Node端到端决策p50/p95/p99为${summary.latency.model.p50?.toFixed(3)}/${summary.latency.model.p95?.toFixed(3)}/${summary.latency.model.p99?.toFixed(3)}ms；不是浏览器实战时延。完整逐局动作数、换手、终态、耗时及双方动作分布见summary.json。`, '', `10局、${replay.totalActions}条动作均用权威引擎重新重放，重新调用双方策略核对选招、候选/状态/输入/logits/RNG摘要与终局。模型文件、训练交付清单及本轮源代码SHA复核保持；训练没有继续。`, '', '地图和顺序在开打前冻结：五图各先手一局，再轮换同五图各后手一局；使用官方SD默认标准开局，工厂已发初次收益，恢复引擎不重复发放。每槽独立持续对手RNG，未按结果换模型、改规则或补赛。', '', '这些官方标准开局与已消费训练来源共享，只能作为开发实战/产品回归；不是严格新父局独立泛化或最终验收。十局也不能代表总体胜率。', '', `本次新增${(summary.resource.outputBytes / 1024 ** 2).toFixed(2)}MiB，连同前轮训练约${(summary.resource.phaseWithTrainingBytes / 1024 ** 2).toFixed(2)}MiB；C盘空闲${(summary.resource.freeBytes / 1024 ** 3).toFixed(2)}GiB。对战仅本机单worker推理，没有执行优化器更新；训练在手机完成。全量训练仍未启动。`, '', '证据：manifest.json（评分前冻结）、preflight.json、slots/（逐局日志和状态）、replay-verification.json、summary.json、DELIVERY_MANIFEST.json。');
fs.writeFileSync(path.join(DIR, 'REPORT.md'), lines.join('\n') + '\n', { flag: 'wx' });
const original = read('../sd32_phone_20261016/DELIVERY_MANIFEST.json');
for (const a of original.artifacts) assert.equal(sha(fs.readFileSync(path.join(SOURCE, a.path))), a.sha256, `训练交付改变:${a.path}`);
save('training-source-preservation.json', { passed: true, checkedFiles: original.artifacts.length, deliveryManifestSha256: sha(fs.readFileSync(path.join(SOURCE, 'DELIVERY_MANIFEST.json'))) });
const artifacts = files(DIR).filter(p => path.basename(p) !== 'DELIVERY_MANIFEST.json' && !p.endsWith('run.log')).map(p => ({ path: path.relative(DIR, p).replaceAll('\\', '/'), bytes: fs.statSync(p).size, sha256: sha(fs.readFileSync(p)) }));
save('DELIVERY_MANIFEST.json', { sealedAt: new Date().toISOString(), manifestSha256: digest(manifest), artifacts });
console.log(JSON.stringify({ classifications: classes, actions: replay.totalActions, seconds: summary.totalWallSeconds, resource: summary.resource }));
