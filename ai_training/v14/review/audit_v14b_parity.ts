/** 使用已保存的 Python 原始前向输出独立重算 TS，并核对一例重新执行的 Python 输出。 */
import fs from 'node:fs';
import { SpatialResNetPredictor, loadSpatialResNetFromJson } from '../../src/game/ai/spatial_conv_net';

const run='v14/out/v14_20260925_t14b';
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
const report=read(`${run}/T14-03/ts_python_forward_parity.json`);
const predictor=new SpatialResNetPredictor(loadSpatialResNetFromJson(
    fs.readFileSync(`${run}/T14-06/c1_s42/c1_s42_best.json`,'utf8')));
let maxLogitDiff=0,maxZDiff=0,bestMismatches=0,cases=0;
for(const item of report.cases){
    const stem=`${run}/T14-03/forward_parity_work/case_${item.stateIndex}_${item.playerId}`;
    const input=read(`${stem}.input.json`),python=read(`${stem}.python.json`);
    const output=predictor.predict({spatialTensor:new Float32Array(input.spatialTensor),
        globalFeatures:new Float32Array(input.globalFeatures),mapWidth:20,mapHeight:20,
        subjectPlayerId:item.playerId},input.candidateActions);
    if(output.actionLogits.length!==python.actionLogits.length||output.spatialFeaturesZ.length!==python.spatialZ.length)
        throw new Error('长度不一致');
    for(let i=0;i<python.actionLogits.length;i++)maxLogitDiff=Math.max(maxLogitDiff,Math.abs(python.actionLogits[i]-output.actionLogits[i]));
    for(let i=0;i<python.spatialZ.length;i++)maxZDiff=Math.max(maxZDiff,Math.abs(python.spatialZ[i]-output.spatialFeaturesZ[i]));
    if(output.bestActionIndex!==python.bestActionIndex)bestMismatches++;
    cases++;
}
const old=read(`${run}/T14-03/forward_parity_work/case_248_0.python.json`);
const fresh=read('v14/review/v14b_audit_20260925/parity_case_248_0.python.json');
const result={schema:'v14b_forward_parity_review_1',cases,maxLogitDiff,maxZDiff,bestMismatches,
    freshPythonCase:{case:'248_0',sameLogits:JSON.stringify(old.actionLogits)===JSON.stringify(fresh.actionLogits),
        sameZ:JSON.stringify(old.spatialZ)===JSON.stringify(fresh.spatialZ)},
    scope:'重算全部 48 案例的 TS，复用原始 Python 数组；其中 1 例另行重跑 Python 并核对。value 头不在此范围。'};
fs.writeFileSync('v14/review/v14b_audit_20260925/parity_review.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
