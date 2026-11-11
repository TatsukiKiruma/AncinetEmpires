/** 审核反击投影是否包含攻击经验升级，以及历史输入语义是否被保留。 */
import fs from 'node:fs';
import { makeState } from '../tools/rule_fixtures';
import { GameEngine } from '../../src/game/engine';
import { estimateCounterDamage, calculateDamage } from '../../src/game/rules';
import { encodeCandidateActionSpatial, ENCODER_SCHEMA_ID_V13 } from '../../src/game/ai/spatial_tensor_encoder';
import { predictSpatialAction } from '../../src/game/ai/shared_spatial_policy';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import type { Action } from '../../src/game/types';

const levels = [0,90].map(exp=>{
    const state=makeState({players:[0,1],units:[
        {id:'attacker',ownerId:0,unitClass:'soldier',x:2,y:2,level:0},
        {id:'target',ownerId:1,unitClass:'soldier',x:3,y:2,level:0},
    ]});
    state.units.find(u=>u.id==='attacker')!.exp=exp;
    const action:Action={type:'attack',attackerId:'attacker',targetId:'target'};
    const engine=new GameEngine(state);
    const predicted=estimateCounterDamage(state,'attacker','target');
    const encoded=Number(encodeCandidateActionSpatial(state,0,action).semantics[15])*100;
    const result=engine.step(action);
    const attacker=result.state.units.find(u=>u.id==='attacker')!;
    return {experienceBefore:exp,levelBefore:0,levelAfter:attacker.level,experienceAfter:attacker.exp,
        predictedCounter:predicted,encodedCounter:encoded,actualAttackerHpLoss:100-attacker.hp,engineInfo:result.info};
});

const ranged=makeState({players:[0,1],units:[
    {id:'a',ownerId:0,unitClass:'catapult',x:1,y:2},
    {id:'d',ownerId:1,unitClass:'soldier',x:4,y:2},
]});
const rangedAction:Action={type:'attack',attackerId:'a',targetId:'d'};
const legacyWeights=loadSpatialResNetFromJson(
    fs.readFileSync('src/game/ai/models/spatial_resnet_v2_checkpoint.json','utf8'));
const legacy=new SpatialResNetPredictor(legacyWeights);
let receivedCounter:number|null=null;
const original=legacy.predict.bind(legacy);
legacy.predict=(state,candidates)=>{
    receivedCounter=Number(candidates[0].semantics[15])*100;
    return original(state,candidates);
};
predictSpatialAction(legacy,ranged,0,[rangedAction]);
const result={schema:'v14b_review_combat_1',generatedAt:new Date().toISOString(),levelCases:levels,
    legacyInput:{checkpointSchema:legacyWeights.encoderSchemaId,expectedHistoricalSchema:ENCODER_SCHEMA_ID_V13,
        oldV13CounterFormula:calculateDamage(ranged,'d','a'),actualReceivedCounter:receivedCounter,
        note:'旧 schema 权重仍收到修正后的反击语义；此处不测该差异对完整棋力的影响。'}};
fs.mkdirSync('v14/review/v14b_audit_20260925',{recursive:true});
fs.writeFileSync('v14/review/v14b_audit_20260925/combat_probe.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
