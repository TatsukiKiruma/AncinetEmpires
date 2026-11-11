import { readFile, writeFile } from 'node:fs/promises';
import { parseBcTrainArgs, trainSkirmishBcModel, loadBcModel, evaluateBcModel } from './skirmish_bc_train';

const root='training_runs/pvp_navigation_20260918';
await readFile(`${root}/dataset-manifest.json`);
const experiments = [
    ...(['v3','v4'] as const).flatMap(version => [0,10,25].map(ratio => ({name:`fresh-${version}-p${ratio}`,version,ratio,initial:undefined as string|undefined,lr:0.1}))),
    ...[10,25].map(ratio=>({name:`warm-v3-p${ratio}`,version:'v3' as const,ratio,initial:'training_runs/models/sd-bc-v3-20260918-011742.json',lr:0.03})),
];
const rows=[];
for(const experiment of experiments){
    console.log(`开始 ${experiment.name}`);
    const args=['--train',`${root}/train-${experiment.version}-p${experiment.ratio}.jsonl`,'--val',`${root}/select-validation-${experiment.version}.jsonl`,
        '--out',`${root}/${experiment.name}.json`,'--feature-dim','4096','--feature-extractor',`hashed-action-${experiment.version}`,
        '--epochs','3','--learning-rate',String(experiment.lr),'--objective','label','--teacher-weight','0','--max-candidates','64','--average-weights','--save-epochs','--select-best'];
    if(experiment.initial)args.push('--initial-model',experiment.initial);
    const result=await trainSkirmishBcModel(parseBcTrainArgs(args));
    const model=await loadBcModel(result.outFile);
    const validation={ai:await evaluateBcModel(`${root}/ai-validation-${experiment.version}.jsonl`,model),
        human:await evaluateBcModel(`${root}/pvp-validation-${experiment.version}.jsonl`,model)};
    rows.push({experiment,result,validation});
    await writeFile(`${root}/training-results.json`,JSON.stringify(rows,null,2));
    console.log(`${experiment.name} 选中第 ${model.epochs} 轮；综合验证 ${result.epochs.map(e=>e.val?.accuracy.toFixed(4)).join('/')}，真人验证 ${validation.human.accuracy.toFixed(4)}`);
}
const selected=Object.fromEntries(['v3','v4'].map(version=>{
    const candidates=rows.filter(r=>r.experiment.version===version&&r.experiment.ratio>0);
    candidates.sort((a,b)=>Math.max(...b.result.epochs.map(e=>e.val!.accuracy))-Math.max(...a.result.epochs.map(e=>e.val!.accuracy)));
    return [version,candidates[0].experiment.name];
}));
await writeFile(`${root}/selected.json`,JSON.stringify({selection:'仅依据 50% 真人 + 50% AI 验证集，实战与真人测试集均未用于选参',selected},null,2));
// 在模型和超参数冻结后才评估完整的真人测试集。
const tests=[];
for(const row of rows){
    const model=await loadBcModel(row.result.outFile);
    tests.push({name:row.experiment.name,metrics:await evaluateBcModel(`${root}/pvp-test-${row.experiment.version}.jsonl`,model)});
}
const original=await loadBcModel('training_runs/models/sd-bc-v3-20260918-011742.json');
tests.push({name:'original',metrics:await evaluateBcModel(`${root}/pvp-test-v3.jsonl`,original)});
await writeFile(`${root}/human-test.json`,JSON.stringify(tests,null,2));
console.log(JSON.stringify({selected,tests}));
