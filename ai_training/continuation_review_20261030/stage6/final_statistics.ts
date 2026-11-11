import path from 'node:path';
import { HERE, read, save, fileSha, allowSealed } from './arena_io';
import { scores, pairedComparison } from '../stage4_v7/analysis';

allowSealed();
const stage3 = 'D:/AncientEmpiresData/continuation_stage3_20261030_v1/acceptance_mac100k_20261031_v1';
const stage4 = 'D:/AncientEmpiresData/continuation_stage4_v7_20261102_v1';
const stage5 = 'D:/AncientEmpiresData/continuation_stage5_20261104_v1/sealed-v1';
const sources: Record<string,string> = {};
function load(file: string) {sources[file]=fileSha(file); return read(file).games;}
const generations: Record<string,any[]> = {
    baseline2414:load(path.join(stage3,'test-baseline/SUMMARY.json')),
    stage3:load(path.join(stage3,'test-candidate/SUMMARY.json')),
    stage4V7C2:load(path.join(stage4,'test-final/SUMMARY.json')),
    stage5C1:load(path.join(stage5,'test-SUMMARY.json')),
    stage6:load(path.join(HERE,'SEALED54_SUMMARY.json')),
};
const historical: Record<string,any[]> = {
    baseline2414:load(path.join(HERE,'../stage1/ARENA_ANALYSIS.json')).map((r:any)=>({...r,players:2,firstPlace:Number(r.classification==='natural_win'),normalizedRank:Number(r.classification==='natural_win')})),
    stage3:load(path.join(stage3,'historical-final/SUMMARY.json')),
    stage4V7C2:load(path.join(stage4,'historical-final/SUMMARY.json')),
    stage5C1:load(path.join(stage5,'historical-SUMMARY.json')),
    stage6:load(path.join(HERE,'HISTORICAL40_SUMMARY.json')),
};
if (new Set(generations.stage6.map(g=>g.slot)).size !== 20) throw Error('封存初态簇数不符');
const names=Object.keys(generations), pairs:Record<string,any>={}, historicalPairs:Record<string,any>={};
for (let i=0;i<names.length;i++) for (let j=i+1;j<names.length;j++) {
    const key=`${names[j]}_vs_${names[i]}`;
    pairs[key]=pairedComparison(generations[names[i]],generations[names[j]],10000,20261101);
    historicalPairs[key]=pairedComparison(historical[names[i]],historical[names[j]],10000,20261101);
}
await save(path.join(HERE,'FINAL_PAIRED_COMPARISON.json'),{sources,generations:Object.fromEntries(names.map(n=>[n,scores(generations[n])])),historicalGenerations:Object.fromEntries(names.map(n=>[n,scores(historical[n])])),pairs,historicalPairs,bootstrap:{iterations:10000,seed:20261101,sealedClusters:20},limitations:'历史代际调度不同；双worker共享GPU竞争会影响限时搜索，差异不能全部归因于策略头。'},true);
await save(path.join(HERE,'STAGE6_SEALED_ACCEPTANCE.json'),{completed:true,sealedAccess:1,selectedId:read(path.join(HERE,'GATE_DECISION.json')).selectedId,sealed54:scores(generations.stage6),historical40:scores(historical.stage6),offline:read(path.join(HERE,'SEALED_OFFLINE_REPORT.json')),noPostTestTuning:true},true);
