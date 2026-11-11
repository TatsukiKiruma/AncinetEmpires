import path from 'node:path';
import { HERE, DATA, S3, read, fileSha, save } from './arena_io';
import { runtimeIdentity } from '../stage4_v7/runtime_identity';
import { runPanel } from './match_runner';
import { healthy, strength } from './gates';

// 只复用完整且身份相同的开发收据；中断尝试另行原样归档后才恢复。
const screen = [];
for (const id of ['C1','C2']) {
    const result=read(path.join(DATA,'development-v1',`screen-${id}`,'ANALYSIS.json'));
    if(result.runtimeSha256!==runtimeIdentity().sha256 || result.configSha256!==fileSha(path.join(HERE,`config-${id}.json`))) throw Error('已完成初筛身份变化');
    for(const [name,hash] of Object.entries(result.sources)) if(fileSha(path.join(HERE,name))!==hash) throw Error('已完成初筛执行器变化');
    for(const game of result.games) {
        const dir=path.dirname(game.artifactDirectory), receipt=read(dir+'.receipt.json');
        if(receipt.summarySha256!==fileSha(path.join(dir,'SUMMARY.json'))) throw Error('已完成逐局收据变化');
    }
    screen.push(result);
}
const panelFile=path.join(S3,'OMNI_ARENA_DEV_PANEL.json'), subset=read(path.join(HERE,'DEV_SUBSET.json'));
if(subset.panelSha256!==fileSha(panelFile)) throw Error('开发面板变化');
screen.push(await runPanel('C3',panelFile,subset.ids,'dev','screen-C3'));
await save(path.join(HERE,'DEV18_SUMMARY.json'),screen,true);
const selected=screen.filter(r=>healthy(r,18)).sort((a,b)=>b.scores.equalRank-a.scores.equalRank||b.scores.equalWin-a.scores.equalWin||b.games.filter((g:any)=>g.firstPlace===1).length-a.games.filter((g:any)=>g.firstPlace===1).length||a.id.localeCompare(b.id))[0];
if(!selected) await save(path.join(HERE,'GATE_DECISION.json'),{passed:false,stage:'Dev18',reason:'三组候选均未通过健康门禁',sealedAccess:0},true);
else {
    const full=await runPanel(selected.id,panelFile,read(panelFile).matches.map((m:any)=>m.id),'dev',`full-${selected.id}`);
    await save(path.join(HERE,'DEV54_SUMMARY.json'),full,true);
    await save(path.join(HERE,'GATE_DECISION.json'),{passed:healthy(full,54)&&strength(full.games),healthPassed:healthy(full,54),strengthPassed:strength(full.games),stage:'Dev54',selectedId:selected.id,configSha256:full.configSha256,full,sealedAccess:0},true);
}
