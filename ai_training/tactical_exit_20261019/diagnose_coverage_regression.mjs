import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..'),before=process.argv[2]??'teacher-r22',after=process.argv[3]??'teacher-r23',stamp=Date.now(),out=path.join(here,`revisions/${after.replace('teacher-','')}/coverage-regression-${stamp}`),read=n=>JSON.parse(fs.readFileSync(path.resolve(here,n),'utf8')),sha=b=>createHash('sha256').update(b).digest('hex'),hash=x=>sha(JSON.stringify(x));
assert.ok(!read(after+'-gate.json').passed&&read(after+'-gate.json').strictReplay);fs.mkdirSync(out);fs.copyFileSync(fileURLToPath(import.meta.url),path.join(out,'source.mjs.snapshot'));
const runtimes=[];
for(const phase of [before,after]){
    const frozen=read('source-freeze-'+phase+'.json').files,file=path.join(out,phase+'.mjs');
    await build({entryPoints:[path.join(here,'coverage_probe_entry.ts')],bundle:true,platform:'node',format:'esm',outfile:file,plugins:[{name:'完整冻结实际资格版本',setup(b){b.onLoad({filter:/\.(ts|json)$/},args=>{const item=frozen[path.relative(repo,args.path).replaceAll('\\','/')];if(!item)return;const data=fs.readFileSync(path.join(here,item.snapshot));assert.equal(sha(data),item.sha256);return {contents:data.toString(),loader:args.path.endsWith('.json')?'json':'ts',resolveDir:path.dirname(args.path)};});}}]});runtimes.push(await import(pathToFileURL(file)));
}
const [c,n]=runtimes,model=read('teacher-model.json'),old=read('old-schema.json'),plan=read('teacher-battle-plan.json'),cases=[];
for(const slot of plan.slots.filter(v=>v.model==='teacher_search')){
    const bases=[before,after].map(p=>p+'-battles/slots/'+slot.id),results=bases.map(p=>read(p+'/result.json'));
    if(results[0].classification===results[1].classification)continue;
    for(const base of bases)assert.ok(read(base+'/strict-replay.json').passed);assert.ok(results.every(r=>r.modelHash===hash(model)));
    const rows=bases.map(base=>gunzipSync(fs.readFileSync(path.join(here,base,'actions.jsonl.gz'))).toString().trim().split('\n').map(JSON.parse)),e=new c.GameEngine(read(plan.maps[slot.mapIndex].path));let found=false;
    for(let i=0;i<Math.min(rows[0].length,rows[1].length);i++){
        const [a,b]=rows.map(v=>v[i]),state=e.getState();assert.equal(hash(state),a.beforeHash);assert.equal(a.beforeHash,b.beforeHash);
        if(a.code!==b.code){
            assert.ok(a.search?.preferredPolicyEvaluated&&b.search?.preferredPolicyEvaluated,'第一处动作变化需要定位至产生计划的实际根决策');
            const x=c.inspect(state,model,old),y=n.inspect(state,model,old);assert.equal(c.encodeAction(x.action),a.code);assert.equal(n.encodeAction(y.action),b.code);
            const selected=(info,runtime)=>info.decision.traces.find(v=>runtime.encodeAction(v.action)===runtime.encodeAction(info.action));
            const small=v=>v?{action:v.action,plan:v.plan,score:v.score,rankScore:v.rankScore,policyConfidence:v.policyConfidence,tactical:v.tactical,net:v.net,healingNet:v.healingNet,recruits:v.recruits,captures:v.captures,enemyKills:v.enemyKills,freeAttacks:v.freeAttacks,complete:v.complete,deploymentDeferred:v.deploymentDeferred,riskKnown:v.riskKnown,actorLethal:v.actorLethal,commanderLethal:v.commanderLethal}:null;
            const usable=v=>(v.complete||v.deploymentDeferred)&&v.riskKnown&&!v.actorLethal&&!v.commanderLethal&&v.recruits>0;
            const oldSafeRecruits=x.decision.traces.filter(usable),originalCodes=new Set(x.decision.traces.map(v=>c.encodeAction(v.action))),added=y.decision.traces.filter(v=>!originalCodes.has(n.encodeAction(v.action)));
            const audits=[c.auditSearchRisks(new c.GameEngine(state),x.decision),n.auditSearchRisks(new n.GameEngine(state),y.decision)];
            const entry={slot:slot.id,row:i,state,beforeHash:hash(state),oldClassification:results[0].classification,newClassification:results[1].classification,oldSelected:a.code,newSelected:b.code,oldReason:x.decision.reason,newReason:y.decision.reason,rootInputExact:hash(x.root.x)===hash(y.root.x),priorExact:hash(x.root.prior)===hash(y.root.prior),oldSelectedLeaf:small(selected(x,c)),newSelectedLeaf:small(selected(y,n)),oldSafeRecruitmentLeaves:oldSafeRecruits.map(small),addedRootLeaves:added.map(small),audits,scope:'只核对根覆盖前提与实际完整叶子，不以单局胜负判定估值正确'};
            cases.push(entry);fs.writeFileSync(path.join(out,'cases.json'),JSON.stringify(cases));found=true;break;
        }
        e.step(a.action);assert.equal(hash(e.getState()),a.afterHash);
    }
    assert.ok(found,'不同自然结局需明确动作分歧，不用墙钟或代理结果冒充策略因果');
}
const report={passed:true,before,after,outcomeChanges:cases.length,cases:cases.map(v=>({slot:v.slot,row:v.row,old:v.oldClassification,new:v.newClassification,oldSelected:v.oldSelected,newSelected:v.newSelected,alreadyHadSafeRecruitment:v.oldSafeRecruitmentLeaves.length>0})),casesPath:path.relative(here,path.join(out,'cases.json')),modelSha256:sha(fs.readFileSync(path.join(here,'teacher-model.json')))};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report));console.log(report);
