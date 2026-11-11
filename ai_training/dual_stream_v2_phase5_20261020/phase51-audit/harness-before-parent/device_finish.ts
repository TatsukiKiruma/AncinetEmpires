import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DIR, read, save } from './common';
import { sha } from '../dual_stream_v2_phase1_20261020/io';

// 只汇总已完成的设备测量；保持原联赛停止，不晋升候选模型。
const name = 'device-comparison-10-run02', folder = path.join(DIR, name), summary = read(path.join(folder, 'summary.json'));
assert.ok(summary.strict && summary.phoneFirst);
const plan = read(path.join(folder, 'plan.json')), identity = summary.identity;
const assets: Record<string, string> = { '/plan.json': path.join(folder, 'plan.json'), '/worker.js': path.join(folder, 'worker.js'), '/model.json': path.join(DIR, plan.modelPrefix + '.json'), '/model.bin': path.join(DIR, plan.modelPrefix + '.bin'), '/head.json': path.join(DIR, plan.calibrationPrefix, 'head-calibration.json'), '/value.json': path.join(DIR, plan.calibrationPrefix, 'value-config.json') };
for (const [key, file] of Object.entries(assets)) assert.equal(sha(fs.readFileSync(file)), identity.assets[key], `测量后资产变化：${key}`);
for (const [key, value] of Object.entries(identity.sources)) assert.equal(sha(fs.readFileSync(path.resolve(DIR, '..', key))), value, `测量后源码变化：${key}`);
const phone = summary.devices.phone, pc = summary.devices.pc;
const metrics = [
    `| 整批含槽间收据耗时 | ${(phone.complete.wallMs / 1000).toFixed(2)}秒 | ${(pc.complete.wallMs / 1000).toFixed(2)}秒 |`,
    `| AI平均每步 | ${(phone.latency.model.total / phone.latency.model.count).toFixed(3)}ms | ${(pc.latency.model.total / pc.latency.model.count).toFixed(3)}ms |`,
    `| 队列步p95 / 最大 | ${phone.latency.queue.p95.toFixed(3)} / ${phone.latency.queue.max.toFixed(3)}ms | ${pc.latency.queue.p95.toFixed(3)} / ${pc.latency.queue.max.toFixed(3)}ms |`,
    `| 非空根平均搜索节点 | ${phone.searchNodes.mean.toFixed(2)} | ${pc.searchNodes.mean.toFixed(2)} |`,
    `| 自然胜 / 自然负 / 动作截断 | 5 / 4 / 1 | 6 / 2 / 2 |`,
    `| 单步超时 / 墙钟截断 | 0 / 0 | 0 / 0 |`
];
let report = fs.readFileSync(path.join(folder, 'REPORT.md'), 'utf8');
report = report.replace('| 实际动作strict重放', metrics.join('\n') + '\n| 实际动作strict重放');
const maps = ['Duel', 'Crossed swords', 'Icy Paths', 'Liberty Port', 'Peak Island'];
for (let i = 0; i < maps.length; i++) report = report.replaceAll(`${i + 1}图 / 席位`, `${maps[i]} / 席位`);
report += `\n本轮累计对局墙钟手机是电脑的${(phone.wallMs / pc.wallMs).toFixed(3)}倍，电脑少用${((1 - pc.wallMs / phone.wallMs) * 100).toFixed(2)}%。AI整体单步p95分别724.5/265.7ms；根搜索p95分别741.1/292.9ms。预算限制使手机非空根平均仅搜索105.81节点，电脑164.87节点，不能据总时间比宣称纯硬件倍数。\n\n手机为小米8屏幕指纹版（MI 8 UD），Android10 / Chrome87；电脑为AMD Ryzen 7 9800X3D，Windows11 / Chrome155。两端均为同一个Chrome87目标包和单Worker纯CPU实现，电脑Chrome使用独立临时Profile与无头模式。单步计时由各设备内部performance.now测得；AI计时不含HTTP日志传输，墙钟合计包含传输与核验信息打包，报告另列传输等待。\n\n队列全步小于1ms的原阶段门禁本次仍不成立，手机最大16.6ms、电脑最大1.4ms。本次仅完成用户指定的设备10槽比较，不代表原56槽验收或阶段5整体通过，冠军仍是第0代。\n\n准备阶段的首轮包因Chrome87缺少Object.hasOwn，在任何对局动作前失败；10份零动作错误与原包保留于../device-comparison-10，不计入正式时延。run02只补充浏览器兼容层，没有改模型、校准、权威规则或搜索预算。正式包依赖源码和模型在测量前后SHA完全一致。\n\n手机测试页面保持前台（初始截图及无visibilitychange记录），手机中段电池温度34～35°C，读数及采集时刻见phone-battery-timeline.jsonl。测试结束后已关闭专属Chrome进程、资产服务，移除本次USB转发，清理专属临时Chrome目录，原手机设置未变。\n`;
fs.writeFileSync(path.join(folder, 'REPORT.md'), report);
const cleanup = read(path.join(folder, 'cleanup.json')); assert.ok(cleanup.cleaned);
const validation = { strictActualActions: phone.actualActions + pc.actualActions, strictWitnessActions: phone.witnessActions + pc.witnessActions, slots: 20, passed: true, assetShaUnchanged: true, bundleSourceShaUnchanged: true, phoneFirst: true, independentTypeCheckPassed: true, compatibilityAttemptExcluded: true, cleanup, leagueRemainsStopped: true, championGeneration: read('league-state.json').championGeneration, completedAt: new Date().toISOString() };
save(path.join(folder, 'validation.json'), validation);
save(path.join(folder, 'RUN_STATUS.json'), { status: 'complete', phoneSlots: 10, pcSlots: 10, completedAt: validation.completedAt, originalLeagueResumed: false });
save('TASK_STATE.json', { ...read('TASK_STATE.json'), status: 'league_stopped_device_comparison_complete', deviceComparison: { path: name, phoneSlots: 10, pcSlots: 10, strict: true, phoneWallSeconds: phone.wallMs / 1000, pcWallSeconds: pc.wallMs / 1000 } });
save('pipeline-status.json', { stage: 'device-comparison-complete-league-stopped', pids: [], completedAt: validation.completedAt });
const current = path.resolve(DIR, '../status/CURRENT.md'); let text = fs.readFileSync(current, 'utf8');
const start = text.indexOf('<!-- dual-stream-v2-phase5-20261020 -->'), end = text.indexOf('<!-- end-dual-stream-v2-phase5-20261020 -->', start); assert.ok(start >= 0 && end > start);
text = text.slice(0, start) + `<!-- dual-stream-v2-phase5-20261020 -->\n## 2026-10-20 双流v2阶段5联赛已按用户停止，手机/电脑10槽计时完成\n\n原联赛第1代60局采样、3572次蒸馏更新与89状态三端验证完成，价值切片12/16，不能晋升，冠军仍为第0代。第1代纯策略22/56胜（同运行时第0代34/56）；搜索28/56槽后按用户要求停止。84个完整学生槽及1个中断前缀保留，后者23实际/28反扑动作strict通过，停止记录见dual_stream_v2_phase5_20261020/USER_STOP_FOR_DEVICE_COMPARISON.json。\n\n按最新要求使用第1代搜索候选、固定ApkLikeAI五图双席位10槽，先小米MI8UD/Chrome87，再PC9800X3D/Chrome155，同包同模型同初态同种子、各1Worker串行。手机累计1189.51秒，5胜4负1动作截断；电脑464.49秒，6胜2负2动作截断。整体单步p95手机724.5/电脑265.7ms，根p95为741.1/292.9ms，单步超时及墙钟截断两端均0。17,194实际动作与48,526反扑动作全strict；队列最大16.6/1.4ms，原全步<1ms门禁未过。两端轨迹及搜索节点不同，时间比不能视为纯硬件倍数。详见[设备对比报告](../dual_stream_v2_phase5_20261020/${name}/REPORT.md)。\n\n首轮Chrome87兼容失败零动作记录保留，正式run02补齐兼容层，模型/校准/规则/搜索预算未变，测量前后bundle依赖源码及模型SHA一致。独立类型检查通过；专属服务、Chrome临时目录及USB转发已清理，原联赛未恢复。阶段1～4证据和工作区已有入口差异保留，未接入GUI；阶段5完整验收仍未完成。\n` + text.slice(end);
fs.writeFileSync(current, text);
const snapshot = path.join(folder, 'harness-source'); fs.mkdirSync(snapshot, { recursive: true });
for (const name of ['device_worker.ts', 'device_runner.mjs', 'device_audit.ts', 'device_finish.ts', 'stop_audit.ts']) fs.copyFileSync(path.join(DIR, name), path.join(snapshot, name));
const entries: any[] = [];
function walk(root: string) { for (const e of fs.readdirSync(root, { withFileTypes: true })) { assert.ok(!e.isSymbolicLink()); const f = path.join(root, e.name); if (e.isDirectory()) walk(f); else if (e.name !== 'DELIVERY_MANIFEST.json') entries.push({ path: path.relative(folder, f).replaceAll('\\', '/'), bytes: fs.statSync(f).size, sha256: sha(fs.readFileSync(f)) }); } }
walk(folder);
save(path.join(folder, 'DELIVERY_MANIFEST.json'), { scope: '仅手机/电脑20槽计时证据，不是阶段5整体交付', entries, bytes: entries.reduce((s, e) => s + e.bytes, 0), modelSha256: identity.assets['/model.bin'], generatedAt: new Date().toISOString() });
console.log(JSON.stringify({ ...validation, phoneWallSeconds: phone.wallMs / 1000, pcWallSeconds: pc.wallMs / 1000, ratio: phone.wallMs / pc.wallMs, bytes: entries.reduce((s, e) => s + e.bytes, 0) }));
