import fs from 'node:fs';
import path from 'node:path';
import { DIR, read, save, resource, sha, files } from './io';
import { latency, type Slot } from './match';

const manifest = read('manifest.json'), replay = read('replay-verification.json');
const results = (manifest.slots as Slot[]).map(slot => {
  const p = `slots/${slot.id}/result.json`;
  return fs.existsSync(path.join(DIR, p)) ? read(p) : { slot, classification: 'not_started', actions: 0, realSwitches: 0 };
});
const summaries = ['pc', 'phone'].map(device => {
  const rows = results.filter(r => r.slot.device === device);
  const classifications = Object.fromEntries(manifest.classification.map((c: string) => [c, rows.filter(r => r.classification === c).length]));
  const natural = rows.filter(r => r.classification.startsWith('natural_')).length;
  const unknown = rows.filter(r => !r.classification.startsWith('natural_') && r.classification !== 'surrender').length;
  return { device, denominator: 10, classifications, naturalWinProportion: classifications.natural_win / 10, naturalTerminalProportion: natural / 10, naturalConditionalWinRate: natural ? classifications.natural_win / natural : null, censoredSensitivityRange: [classifications.natural_win / 10, (classifications.natural_win + unknown) / 10], actions: rows.reduce((n, r) => n + (r.actions ?? 0), 0), switches: rows.reduce((n, r) => n + (r.realSwitches ?? 0), 0), latency: latency(rows.flatMap(r => r.latencySamples?.model ?? [])), opponentLatency: latency(rows.flatMap(r => r.latencySamples?.heuristic ?? [])) };
});
const pairs = manifest.maps.flatMap((_: unknown, mapIndex: number) => [0, 1].map(seat => {
  const pc = results.find(r => r.slot.mapIndex === mapIndex && r.slot.modelSeat === seat && r.slot.device === 'pc');
  const phone = results.find(r => r.slot.mapIndex === mapIndex && r.slot.modelSeat === seat && r.slot.device === 'phone');
  const a = replay.slots.find((r: { slot: string }) => r.slot === pc.slot.id), b = replay.slots.find((r: { slot: string }) => r.slot === phone.slot.id);
  return { map: manifest.maps[mapIndex].name, seat, identicalTrajectory: a.trajectorySha256 === b.trajectorySha256, pc: pc.classification, phone: phone.classification };
}));
const summary = { at: new Date().toISOString(), summaries, pairs, replayPassed: replay.passed, results, resource: resource() };
save('summary.json', summary);
const names: Record<string, string> = { natural_win: '自然胜', natural_loss: '自然负', natural_draw: '自然和', surrender: '投降终局', loop: '循环停止', action_truncation: '动作截断', wall_truncation: '墙钟截断', decision_timeout: '决策超时', error: '错误/拒绝', interrupted: '中断', not_started: '未开始' };
const lines = ['# 冻结试训模型对战启发式AI', '', '2026-10-16，Asia/Shanghai。PC离线单worker，两个来源分别执行全部预注册槽；未训练、微调、晋升或部署。', '', '## 结果', '', '| 来源 | 总槽 | 自然胜 | 自然负 | 自然和 | 投降 | 循环 | 动作截断 | 时间截断 | 错误/拒绝 | 中断/未开始 | 自然胜/固定分母 |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|'];
for (const s of summaries) { const c = s.classifications; lines.push(`| ${s.device} | 10 | ${c.natural_win} | ${c.natural_loss} | ${c.natural_draw} | ${c.surrender} | ${c.loop} | ${c.action_truncation} | ${c.wall_truncation + c.decision_timeout} | ${c.error} | ${c.interrupted + c.not_started} | ${s.naturalWinProportion * 100}% |`); }
lines.push('', '| 地图 | 模型席位 | PC结局 | PC动作/换手 | 手机来源结局 | 手机动作/换手 | 配对轨迹完全相同 |', '|---|---:|---|---:|---|---:|---|');
for (const pair of pairs) { const rows = results.filter(r => r.slot.mapName === pair.map && r.slot.modelSeat === pair.seat); const a = rows.find(r => r.slot.device === 'pc'), b = rows.find(r => r.slot.device === 'phone'); lines.push(`| ${pair.map} | ${pair.seat}（${pair.seat === 0 ? '先手' : '后手'}） | ${names[a.classification]} | ${a.actions}/${a.realSwitches} | ${names[b.classification]} | ${b.actions}/${b.realSwitches} | ${pair.identicalTrajectory ? '是' : '否'} |`); }
lines.push('', '## 决策与拒绝证据', '', '| 来源 | 模型决策数 | 模型p50/p95/p99/最大毫秒 | 对手p50/p95/p99/最大毫秒 | 总动作 | 真实换手 |', '|---|---:|---|---|---:|---:|');
for (const s of summaries) { const fmt = (l: ReturnType<typeof latency>) => [l.p50, l.p95, l.p99, l.max].map(n => n?.toFixed(3) ?? '无').join('/'); lines.push(`| ${s.device} | ${s.latency.count} | ${fmt(s.latency)} | ${fmt(s.opponentLatency)} | ${s.actions} | ${s.switches} |`); }
const errors = results.filter(r => r.error);
for (const r of errors) lines.push('', `- ${r.slot.id}：${r.error.message}。已执行${r.actions}动作，当前真实回合${r.finalTurn}；完整失败局面、候选和RNG见该槽final.json与decision-evidence.json。`);
lines.push('', '延迟为Node/当前PC端到端实际决策，覆盖完整候选生成、复制、严格编码、前向、动作码映射和必要摘要；不等同浏览器性能。抛错的未完成决策不混入成功完成决策分位数。对手使用权威HeuristicAI，独立持久mulberry32，各配对槽同seed。', '', '## 合同与核验', '', '- [manifest.json](manifest.json)在评分前冻结五张首选官方地图、20槽顺序、seed、源码SHA、两个独立来源模型包和预算。每槽3000动作、300秒、每决策1000ms；父进程看门狗，超限不强行归自然胜负。未按结果补赛或换检查点。', '- 官方工厂已结算首名玩家回合收益，恢复引擎不再次发放；SD默认300初金、30单位、3级上限，联盟合同沿用工厂。初态完整保存在initial/。', '- [preflight.json](preflight.json)记录双来源×五图初态完整加载、候选双射/反序、未知特征拒绝、初始收益、克隆、一步闭环与RNG对照。共享编码器/schema/权重未改。', `- [replay-verification.json](replay-verification.json)实际重放${replay.slots.length}槽、${replay.totalActions}动作，逐步重新调用双方策略并核对全部动作、候选、模型输入/前向、RNG、状态摘要与最终结局。未知schema拒绝另在同一最终状态复现。`, '- 每槽保留started/result/final、gzip动作日志与恢复SHA收据；每步保存摘要和动作，未保存dense张量。合法投降未屏蔽，value未参与选择，无搜索。', '', '## 解释范围', '', `两份模型来自预选第0次、各2400行/300更新试训，最大参数差${manifest.modelMaxDifference}，二进制SHA不同，分别加载big-endian float64并校验28528字节/3566有限参数与冻结清单。${pairs.filter((p: { identicalTrajectory: boolean }) => p.identicalTrajectory).length}/10个PC/手机配对槽轨迹完全相同；不能称20个独立随机实验。`, '', '标准初态已在训练来源出现，本面板只用于开发/产品回归，不是严格独立泛化或全量训练最终验收。20槽小面板不足以确定总体强弱；错误、循环和截断均保留在各10槽分母，不能解释为自然和局或自然失败。自然条件胜率无自然终局时为不可定义；summary.json另列固定分母自然终局比例及删失敏感范围（不是置信区间）。', '', `本目录交付前约${(resource().outputBytes / 1024 ** 2).toFixed(2)}MiB，C盘可用约${(resource().freeBytes / 1024 ** 3).toFixed(2)}GiB；低于512MiB且保留12GiB。只运行自己的单worker，没有使用ADB或操作手机采集、APK、Frida。未修改CURRENT.md、公共规则、共享推理和应用UI。`, '', '## 重现', '', '首次执行（已有冻结manifest和原始结果不得覆盖）：', '', '```text', 'node ai_training/run.mjs node --import tsx sd_trial_vs_heuristic_20261016/prepare.ts', 'node ai_training/run.mjs node --import tsx sd_trial_vs_heuristic_20261016/preflight.ts', 'node ai_training/run.mjs node --import tsx sd_trial_vs_heuristic_20261016/run.ts', 'node ai_training/run.mjs node --import tsx sd_trial_vs_heuristic_20261016/replay.ts', 'node ai_training/run.mjs node --import tsx sd_trial_vs_heuristic_20261016/report.ts', '```', '', '所有输出以exclusive-create防覆盖。中断后run只保留失败槽，不重赛；需要新面板应另建目录、另行预注册。');
fs.writeFileSync(path.join(DIR, 'REPORT.md'), lines.join('\n') + '\n', { flag: 'wx' });
save('DELIVERY_MANIFEST.json', { sealedAt: new Date().toISOString(), artifacts: files(DIR).filter(p => !p.endsWith('DELIVERY_MANIFEST.json')).map(p => ({ path: path.relative(DIR, p).replaceAll('\\', '/'), bytes: fs.statSync(p).size, sha256: sha(fs.readFileSync(p)) })) });
console.log(JSON.stringify({ summaries, pairs, resource: resource() }, null, 2));
