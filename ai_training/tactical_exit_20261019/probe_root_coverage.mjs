import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..'),phase=process.argv[2]??'teacher-r22',stamp=Date.now(),output=path.join(here,`revisions/${phase.replace('teacher-','')}/coverage-probe-${stamp}`),read=n=>JSON.parse(fs.readFileSync(path.resolve(here,n),'utf8')),sha=b=>createHash('sha256').update(b).digest('hex'),hash=x=>sha(JSON.stringify(x));
assert.ok(!read(phase+'-gate.json').passed&&read(phase+'-gate.json').strictReplay);fs.mkdirSync(output);
fs.copyFileSync(fileURLToPath(import.meta.url),path.join(output,'probe.mjs.snapshot'));fs.copyFileSync(path.join(here,'coverage_probe_entry.ts'),path.join(output,'entry.ts.snapshot'));
const frozen=read('source-freeze-'+phase+'.json').files,runtimes={};
for(const variant of ['control','shadow']){
    const file=path.join(output,variant+'.mjs');
    await build({entryPoints:[path.join(here,'coverage_probe_entry.ts')],bundle:true,platform:'node',format:'esm',outfile:file,plugins:[{name:'冻结实际版本，仅影子替换最后一个非原六根候选',setup(b){b.onLoad({filter:/\.(ts|json)$/},args=>{
        const relative=path.relative(repo,args.path).replaceAll('\\','/'),item=frozen[relative];if(!item)return;
        const bytes=fs.readFileSync(path.join(here,item.snapshot));assert.equal(sha(bytes),item.sha256);let source=bytes.toString();
        if(variant==='shadow'&&relative.endsWith('/model_battle_search_ai.ts')){
            const needle='indexes=[...new Set([...indexes,...priorOrder])].slice(0,this.options.topK);';assert.equal(source.split(needle).length,2);
            source=source.replace(needle,needle+'\nconst forced=(globalThis as any).__stage5CoverageProbeCode,extra=root.x.codes.indexOf(forced);if(extra>=0&&!indexes.includes(extra)&&indexes.length>6)indexes[indexes.length-1]=extra;');
        }
        return {contents:source,loader:args.path.endsWith('.json')?'json':'ts',resolveDir:path.dirname(args.path)};
    });}}]});runtimes[variant]=await import(pathToFileURL(file));
}
const c=runtimes.control,s=runtimes.shadow,model=read('teacher-model.json'),old=read('old-schema.json'),plan=read('teacher-battle-plan.json'),cases=[];let roots=0,alternatives=0,safeGaps=0,witnessActions=0;
const folders=fs.readdirSync(path.join(here,phase+'-battles/slots')).filter(v=>v.includes('teacher_search')).sort((a,b)=>Number(b.startsWith('expanded'))-Number(a.startsWith('expanded'))||a.localeCompare(b));
for(const slot of folders){
    if(cases.length>=3)break;const base=phase+'-battles/slots/'+slot,result=read(base+'/result.json');if(!['natural_loss','action_truncation'].includes(result.classification))continue;
    assert.ok(read(base+'/strict-replay.json').passed);assert.equal(result.modelHash,hash(model));const e=new c.GameEngine(read(plan.maps[result.slot.mapIndex].path)),rows=gunzipSync(fs.readFileSync(path.join(here,base,'actions.jsonl.gz'))).toString().trim().split('\n').map(JSON.parse);
    for(const row of rows){
        const state=e.getState();assert.equal(hash(state),row.beforeHash);
        if(row.side==='model'&&row.search?.preferredPolicyEvaluated&&cases.length<3){
            const info=c.inspect(state,model,old);assert.equal(c.encodeAction(info.action),row.code);roots++;
            for(const option of info.options){
                alternatives++;const candidate=c.evaluate(info,model,old,option.i);if(!candidate.complete||!candidate.riskKnown||candidate.actorLethal||candidate.commanderLethal)continue;
                const selected=info.decision.traces.find(v=>c.encodeAction(v.action)===row.code);if(selected&&candidate.score<=selected.score+1e-10)continue;safeGaps++;
                const shadow=s.choose(state,model,old,c.encodeAction(candidate.action)),chosen=shadow.decision.traces.find(v=>s.encodeAction(v.action)===shadow.code);
                const causal=shadow.code!==row.code||!!(shadow.decision.planCommitted&&chosen?.plan.some((v,j)=>s.encodeAction(v.action)!==rows[row.i+1+j]?.code));if(!causal)continue;
                const audit=s.auditSearchRisks(new s.GameEngine(state),shadow.decision);witnessActions+=audit.witnessActions;assert.ok(shadow.decision.nodes<=300&&shadow.decision.branchPolicyCalls===0);
                cases.push({slot,row:row.i,state,beforeHash:row.beforeHash,root:candidate.action,newRootCode:c.encodeAction(candidate.action),priority:option.priority,originalRootCodes:info.decision.traces.map(v=>c.encodeAction(v.action)),oldSelected:row.code,oldReason:info.decision.reason,newSelected:shadow.code,newReason:shadow.decision.reason,newPlanCommitted:shadow.decision.planCommitted,newPlan:chosen?.plan,candidate:{score:candidate.score,tactical:candidate.tactical,net:candidate.net,actorLethal:candidate.actorLethal,commanderLethal:candidate.commanderLethal},selectedBefore:selected?{score:selected.score,tactical:selected.tactical,actorLethal:selected.actorLethal,commanderLethal:selected.commanderLethal}:null,audit,shadowNodes:shadow.decision.nodes});fs.writeFileSync(path.join(output,'cases.json'),JSON.stringify(cases));break;
            }
        }
        assert.ok(!e.step(row.action).info.includes('非法动作'));assert.equal(hash(e.getState()),row.afterHash);if(cases.length>=3)break;
        if(row.i%100===0)fs.writeFileSync(path.join(output,'live.json'),JSON.stringify({slot,row:row.i,roots,alternatives,safeGaps,causalCases:cases.length}));
    }
}
const report={passed:true,phase,roots,alternatives,safeGaps,causalCases:cases.length,witnessActions,casesPath:path.relative(here,path.join(output,'cases.json')),modelSha256:sha(fs.readFileSync(path.join(here,'teacher-model.json'))),controlBundleSha256:sha(fs.readFileSync(path.join(output,'control.mjs'))),shadowBundleSha256:sha(fs.readFileSync(path.join(output,'shadow.mjs'))),scope:'诊断性替换最后一个补充根，保留原六根、Top12与300己方节点及全部守卫；不修改生产文件，不据此宣称棋力改善'};fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report));console.log(report);
