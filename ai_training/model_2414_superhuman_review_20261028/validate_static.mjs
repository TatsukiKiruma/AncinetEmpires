/** 只检查本次分析产物和已读证据的摘要，不导入游戏或模型。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const out = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(out, '../..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const json = name => JSON.parse(fs.readFileSync(path.join(out, name), 'utf8').replace(/^\uFEFF/, ''));
const checked = [];
function check(name, condition) { assert.ok(condition, name); checked.push(name); }
const delivery = json('DELIVERY_CHECK.json'), weights = json('WEIGHT_METADATA.json');
const learning = json('LEARNING_CURVE.json'), data = json('DATA_INVENTORY.json'), arena = json('ARENA_STATIC.json');
const proposal = json('PROPOSAL.json');
check('46份完成交付SHA匹配', delivery.count === 46 && delivery.passed);
check('权重1966910个FP32且有限', weights.parameters === 1966910 && weights.summedTensorParameters === 1966910 && weights.nonfinite === 0 && weights.bytes === 1966910 * 4);
check('样本与更新累计匹配', learning.stages.reduce((n,s)=>n+s.samples,0) === 1935189 && learning.stages.reduce((n,s)=>n+s.updates,0) === 241899);
check('重复日志记录明确且相同损失游标', learning.stages[2].duplicateGlobalSteps === 35 && learning.stages[2].duplicateDetails.every(x=>x.sameLoss&&x.sameCursor));
check('冻结原划分与日程不误标', data.data.train.representatives === 2414 && data.data.dev.representatives === 268 && data.data.dev.expectedAtomicPositions === null && data.schedulerFraction === 1/3);
check('40局保存结果与日志数量匹配', Object.values(arena.arenas).every(a=>a.matches.length===20&&a.matches.every(m=>m.stepCountMatches&&m.result.terminal&&!m.result.error)));
check('两套运行与当前源码匹配', Object.values(arena.arenas).every(a=>[...a.runtimeChecks,...a.sourceChecks].every(x=>x.actual===x.expected)));
check('配对身份一致，共有源码46份无差异', arena.sharedSourceCount === 46 && arena.sharedManifestDifferences.length === 0 && Object.values(arena.paired).every(g=>g.rows.every(r=>r.sameSlot&&r.sameInitial)));
check('胜负与配对改善回退一致', arena.arenas.direct.buckets.hard.outcomes.model_win === 1 && arena.arenas.search.buckets.hard.outcomes.model_win === 4 && arena.arenas.direct.buckets.simple.outcomes.model_win === 8 && arena.arenas.search.buckets.simple.outcomes.model_win === 10 && arena.paired.hard.improved === 4 && arena.paired.hard.regressed === 1);
check('无搜索调用数缺失不伪记为0', arena.arenas.direct.buckets.hard.networkCallsTotal === null);
check('所有提案未授权未执行且有预算停止标准', !proposal.execute && !proposal.executionAuthorized && proposal.experiments.length >= 3 && proposal.experiments.every(e=>!e.authorized&&!e.executed&&e.budget&&e.stopRollback&&e.nextOnSuccess));
check('本次更新前向新局手机重放与数据变更均为0', proposal.optimizerUpdatesExecuted===0&&proposal.modelForwardsExecuted===0&&proposal.newGamesExecuted===0&&proposal.phoneOperationsExecuted===0&&!proposal.replayExecuted&&!proposal.splitFrozenOrModified);
const manifest=json('EVIDENCE_MANIFEST.json');
const changed=[];
for(const e of manifest.files){const p=path.resolve(root,e.path);if(!fs.existsSync(p)||sha(fs.readFileSync(p))!==e.sha256)changed.push(e.path);}
check('本次所读输入至交付复核时未变化', changed.length===0);
const validation={passed:true,checkedUtc:new Date().toISOString(),checks:checked,evidenceFiles:manifest.files.length,changedInputs:changed,scope:'静态产物与输入摘要；不证明规则正确或棋力',publicLintTestBuild:'未运行：无公共代码变更；全量测试可能含用户禁止的历史重放，本次不触发',trainingWorkspaceTests:'未运行：无训练源码变更',syntaxCheck:'另以node --check检查两份静态脚本'};
fs.writeFileSync(path.join(out,'VALIDATION.json'),JSON.stringify(validation,null,2)+'\n');
const files=fs.readdirSync(out).filter(n=>n!=='OUTPUT_MANIFEST.json'&&fs.statSync(path.join(out,n)).isFile()).map(n=>{const b=fs.readFileSync(path.join(out,n));return {path:n,sha256:sha(b),bytes:b.length};});
fs.writeFileSync(path.join(out,'OUTPUT_MANIFEST.json'),JSON.stringify({files},null,2)+'\n');
console.log(JSON.stringify(validation,null,2));
