import path from 'node:path';
import { HERE, DATA, S3, read, save, fileSha } from './arena_io';
import { runPanel } from './match_runner';
import { healthy, strength } from './gates';

if (!read(path.join(HERE, 'EXPORTED_VALUE_PARITY.json')).passed || !read(path.join(HERE, 'OFFLINE_DISTILLATION_REPORT.json')).complete) throw Error('策略蒸馏及导出门禁未完成');
for (const [id, model, priorAnchor] of [['C2','D1',.07],['C3','D2',.085]] as const) {
    const prefix = path.join(DATA, model, 'final');
    await save(path.join(HERE, `config-${id}.json`), {...read(path.join(HERE,'config-C1.json')), priorAnchor, modelPrefix: prefix, modelVersion: fileSha(prefix+'.bin')}, true);
}
const panelFile = path.join(S3, 'OMNI_ARENA_DEV_PANEL.json'), subset = read(path.join(HERE, 'DEV_SUBSET.json'));
if (subset.panelSha256 !== fileSha(panelFile) || subset.ids.length !== 18) throw Error('开发子集身份不符');
const screen = [];
for (const id of ['C1','C2','C3']) screen.push(await runPanel(id, panelFile, subset.ids, 'dev', `screen-${id}`));
await save(path.join(HERE,'DEV18_SUMMARY.json'), screen, true);
const selected = screen.filter(r => healthy(r,18)).sort((a,b) => b.scores.equalRank-a.scores.equalRank || b.scores.equalWin-a.scores.equalWin || b.games.filter(g=>g.firstPlace===1).length-a.games.filter(g=>g.firstPlace===1).length || a.id.localeCompare(b.id))[0];
if (!selected) {
    await save(path.join(HERE,'GATE_DECISION.json'), {passed:false,stage:'Dev18',reason:'三组候选均未通过健康门禁',sealedAccess:0}, true);
} else {
    const full = await runPanel(selected.id,panelFile,read(panelFile).matches.map((m:any)=>m.id),'dev',`full-${selected.id}`);
    await save(path.join(HERE,'DEV54_SUMMARY.json'),full,true);
    await save(path.join(HERE,'GATE_DECISION.json'),{passed:healthy(full,54)&&strength(full.games),healthPassed:healthy(full,54),strengthPassed:strength(full.games),stage:'Dev54',selectedId:selected.id,configSha256:full.configSha256,full,sealedAccess:0},true);
}
