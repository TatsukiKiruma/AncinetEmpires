import {readFile,writeFile} from 'node:fs/promises';
import {parseBcTrainArgs,trainSkirmishBcModel,evaluateBcModel,loadBcModel} from './skirmish_bc_train';

const root='training_runs/endgame_20260918';
await readFile(`${root}/training-manifest.json`);
const rows=[];
for(const ratio of [10,25]){
    const name=`verified-v4-p${ratio}`;
    const args=['--train',`${root}/train-p${ratio}.jsonl`,'--val',`${root}/selection-validation.jsonl`,'--out',`${root}/${name}.json`,
        '--feature-dim','4096','--feature-extractor','hashed-action-v4','--epochs','3','--learning-rate','0.1','--objective','label','--teacher-weight','0',
        '--max-candidates','64','--average-weights','--save-epochs','--select-best'];
    const summary=await trainSkirmishBcModel(parseBcTrainArgs(args));
    const model=await loadBcModel(summary.outFile);
    const validation={ai:await evaluateBcModel('training_runs/pvp_navigation_20260918/ai-validation-v4.jsonl',model),
        curriculum:await evaluateBcModel(`${root}/curriculum-validation.jsonl`,model)};
    rows.push({name,ratio,summary,validation});
    await writeFile(`${root}/training-results.json`,JSON.stringify(rows,null,2));
    console.log(`${name} 选第 ${model.epochs} 轮，验证 ${summary.epochs.map(e=>e.val?.accuracy.toFixed(4)).join('/')}`);
}
rows.sort((a,b)=>Math.max(...b.summary.epochs.map(e=>e.val!.accuracy))-Math.max(...a.summary.epochs.map(e=>e.val!.accuracy)));
const selected=rows[0];
const baseline=await loadBcModel('training_runs/pvp_navigation_20260918/fresh-v4-p0.json');
await writeFile(`${root}/selected.json`,JSON.stringify({name:selected.name,model:selected.summary.outFile,selection:'仅使用 AI 80%＋隔离收官验证 20% 选参',
    baseline:{ai:await evaluateBcModel('training_runs/pvp_navigation_20260918/ai-validation-v4.jsonl',baseline),curriculum:await evaluateBcModel(`${root}/curriculum-validation.jsonl`,baseline)}},null,2));
console.log(`冻结候选 ${selected.name}`);
