/** 只准备尚未评过的冻结开发局，用于修订后独立整盘工程验证。 */
import fs from 'node:fs';
import path from 'node:path';
import { HERE, ROOT, S3, DATA, read, save, fileSha, modelIdentity } from './io';
import { runtimeIdentity } from './runtime_identity';
import { verifyPreservation } from './resume_records';

const previous = read(path.join(HERE, 'SCREEN_DIAGNOSIS_V4.json'));
verifyPreservation(previous.preservedFiles);
verifyPreservation(read(path.join(HERE, 'PRESERVED_GAMES_V3.json')).files);
const check = read(path.join(DATA, 'rules-equivalence-v4/SUMMARY.json'));
const roots = read(path.join(DATA, 'counter-projection-diagnostic-v4/SUMMARY.json'));
if (!check.passed || roots.substantiveRate !== 1) throw Error('工程诊断尚未通过');
const panelFile = path.join(S3, 'OMNI_ARENA_DEV_PANEL.json'), panel = read(panelFile);
const completed = new Set(read(path.join(HERE, 'DEV_SUBSET.json')).ids);
const matches = [2, 3, 4].map(n => panel.matches.find((m: any) => !completed.has(m.id) && m.id.startsWith(`p${n}-`)));
if (matches.some(m => !m)) throw Error('没有未评开发局');
const runtime = runtimeIdentity(), snapshot = path.join(HERE, 'revisions/runtime-v4-diagnostic');
fs.mkdirSync(snapshot);
for (const file of Object.keys(runtime.files)) {
    const target = path.join(snapshot, file); fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), target, fs.constants.COPYFILE_EXCL);
}
await save(path.join(HERE, 'PRESERVED_GAMES_V4.json'), { files: previous.preservedFiles, games: 54, verified: true }, true);
await save(path.join(HERE, 'DIAGNOSTIC_DEV_SUBSET_V4.json'), { panelSha256: fileSha(panelFile), ids: matches.map(m => m.id), newMatchesOnly: true }, true);
await save(path.join(HERE, 'ENGINEERING_REVISION_V4.json'), {
    created: new Date().toISOString(), model: modelIdentity(), runtime, snapshot,
    changes: ['反击预测仅复制攻守双方，地图与其他单位只读共享', '破坏目标先检查地形和射程再查询占位', '多落点至同一目标反向距离缓存'],
    equivalence: check, diagnosticRoots: { total: roots.rows.length, substantiveRate: roots.substantiveRate, wholeGameEvidence: false },
    configFile: 'config-v2-maxn-prior035.json', configSha256: fileSha(path.join(HERE, 'config-v2-maxn-prior035.json')),
    selectedDiagnosticMatches: matches.map(m => m.id), retainedFormalGames: 54, sealedAccess: 0,
    selectionStatus: '尚未锁定候选；先用三个未评开发局验证修复。原18局预筛门槛失败结论不变，根级诊断不能替代整盘健康门禁。',
    comparability: '规则数值等价不代表限时搜索动作不变；修复后会展开更多节点，必须披露运行时混合，不能将旧局改称新版本实测。'
}, true);
console.log(JSON.stringify({ ids: matches.map(m => m.id), runtime: runtime.sha256, retained: 54 }));
