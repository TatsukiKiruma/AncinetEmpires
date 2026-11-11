import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {frozenPlan,verifyFrozenReceipt,registerFile,checkpoint,checkpointIdentity,wireJob,verifyReceipt} from './resume_plan';
import {fileSha,save} from './io';
import {leagueGame} from './league_game';
import {DatabaseSync} from 'node:sqlite';
import {CUSTOM_SKIRMISH_MAPS,createCustomSkirmishState} from '../../../src/game/custom_skirmish/catalog';
import {rotatingCuts} from './cut_rotation';
import {prototype} from './scenarios';
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'ae-stage8-planb-'));
describe('身份兼容与真实HardAI恢复',()=>{
 it('精确登记旧文件；拒绝未登记及篡改计划/收据',()=>{
  const dir=temp(),plan=path.join(dir,'block-0.json'),migration=path.join(dir,'migration.json'),receipt=path.join(dir,'a.receipt.json');
  save(plan,[{sourceIdentity:'old',seed:7}]);save(receipt,{sourceIdentity:'old'});
  save(migration,{files:[plan,receipt].map(file=>({file,sha256:fileSha(file)}))});
  expect(frozenPlan(plan,migration)).toEqual([{sourceIdentity:'old',seed:7}]);expect(()=>verifyFrozenReceipt(receipt,migration)).not.toThrow();
  save(plan,[{sourceIdentity:'old',seed:8}]);expect(()=>frozenPlan(plan,migration)).toThrow('改写');
  save(receipt,{sourceIdentity:'new'});expect(()=>verifyFrozenReceipt(receipt,migration)).toThrow('改写');
  const unknown=path.join(dir,'unknown.json');save(unknown,[]);expect(()=>frozenPlan(unknown,migration)).toThrow('未登记');
  registerFile(unknown,'new');expect(frozenPlan(unknown,migration)).toEqual([]);
 });
 it('新增外层调度元数据不进入worker身份；seed/id变化拒绝',async()=>{
  const dir=temp(),state=createCustomSkirmishState(CUSTOM_SKIRMISH_MAPS[0]);
  const job={gameId:'test-hard',generation:1,players:2,kind:'league',map:'fixture',seed:123,database:path.join(dir,'game.sqlite'),state,
   roles:{0:'hard',1:'hard'},candidate:0,cut:null,sourceIdentity:'old',config:{},deadlineMs:Number.MAX_SAFE_INTEGER,candidateModelSha256:'fixture'};
  const model={forwardBatch:()=>{throw Error('全HardAI不得请求模型');}} as any;
  const execute=async (j:any,step:number)=>{await expect(leagueGame(wireJob(j,85),model,e=>{if(e.event==='step'&&e.step===step)throw Error('测试断点');})).rejects.toThrow('测试断点');};
  await execute(job,12);const before=checkpoint(job,85)!;
  expect(before.step).toBe(12);expect(checkpointIdentity(job,85)).toBe(checkpointIdentity({...job,deadlineMs:0},85));
  expect(()=>checkpoint({...job,seed:124},85)).toThrow('身份');expect(()=>checkpoint(job,86)).toThrow('身份');
  const db=new DatabaseSync(job.database,{readOnly:true});const prefix=db.prepare('SELECT value FROM steps ORDER BY step').all();db.close();
  await execute(job,24);const resumed=checkpoint(job,85)!;
  const baseline={...job,database:path.join(dir,'baseline.sqlite')};await execute(baseline,24);
  expect(resumed).toEqual(checkpoint(baseline,85));
  const after=new DatabaseSync(job.database,{readOnly:true});expect(after.prepare('SELECT value FROM steps WHERE step<=12 ORDER BY step').all()).toEqual(prefix);after.close();
  expect(()=>verifyReceipt(job,before,{sourceIdentity:'old',result:{complete:true,gameId:job.gameId,database:job.database}})).toThrow();
 },30000);
 it('Gen2人数分桶轮转仍保留任意存活席位，不改变谱系',()=>{
  const cuts=Array.from({length:8},(_,i)=>({state:prototype(5),sourceGame:`s8-train-g1-${i}`,generation:1,sourceStep:10+i}));
  expect([...rotatingCuts(cuts,[5,5],1),...rotatingCuts(cuts,[5,5],2)].map(c=>c!.sourceStep)).toEqual([10,11,12,13]);
  expect(rotatingCuts(cuts,[6],1)).toEqual([undefined]);
 });
});

import {guard,stopRequested,DrainStop} from './io';
import {assertCutSources} from './cut_rotation';
describe('训练与中盘来源门禁',()=>{
 it('隔离目录STOP/DRAIN均阻止后续训练',()=>{
  for(const flag of ['STOP','DRAIN']){const dir=temp();fs.writeFileSync(path.join(dir,flag),'停止');let trained=false;
   expect(stopRequested(dir)).toBe(true);expect(()=>{guard(dir);trained=true;}).toThrow(DrainStop);expect(trained).toBe(false);}
 });
 it('Gen2拒绝未通过、跨代和Dev来源',()=>{
  const dir=temp(),prior={passed:true,sealedAccess:0,generation:1,games:[{gameId:'s8-train-g1-b0-5p-0',complete:true,database:path.join(dir,'a.sqlite')}]};
  expect(()=>assertCutSources(prior,2,dir)).not.toThrow();
  expect(()=>assertCutSources({...prior,passed:false},2,dir)).toThrow();
  expect(()=>assertCutSources({...prior,generation:2},2,dir)).toThrow();
  expect(()=>assertCutSources({...prior,games:[{...prior.games[0],gameId:'s8-dev-g1-b0-5p-0'}]},2,dir)).toThrow();
 });
});
