/** 文件、身份、逐帧摘要和跨格式语义排重；完全不执行已有动作。 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {APK_UNIT_CLASS_TO_ID} from '../../src/game/apk_compat';
import {getEffectiveStats} from '../../src/game/abilities';
import {isCommanderUnit} from '../../src/game/rule_config';
import {createJobState,hash as stateHash} from '../gpu/hard_jobs';
import {ROOT,OUT,read,save,sha,hash,fileSha,stable,originalJobs,phoneFile,tally} from './common.mjs';

const pos=(p:any)=>[p.x,p.y];
const sorted=(a:any[])=>a.sort((x,y)=>stable(x).localeCompare(stable(y)));
export function initialSemantics(job:any,s:any,phone=false){
    const active=job.activeNativePlayerIds;
    const units=phone?s.units.map((u:any)=>[...pos(u.pos),u.raw.a,u.raw.b,u.raw.e,u.raw.n,u.raw.d,u.raw.f,u.raw.i,u.raw.j,u.raw.k,u.raw.l]):s.units.map((u:any)=>[...pos(u.pos),APK_UNIT_CLASS_TO_ID[u.unitClass],u.ownerId,u.hp,u.level??0,u.exp??0,u.movementRemaining??getEffectiveStats(u).move,!!u.hasActed,!!u.hasBeenSupportedThisTurn,isCommanderUnit(s,u),!!u.apkTargeted]);
    const buildings=phone?s.buildings.map((b:any)=>[b.x,b.y,b.terrainId,b.owner]):s.map.tiles.flatMap((row:any[],y:number)=>row.flatMap((b:any,x:number)=>[36,37].includes(b.apkTerrainId)?[[x,y,b.apkTerrainId,b.ownerId??(b.apkOwnerCode===254?4094:4095)]]:[]));
    return {map:job.mapAssetSha256,setup:job.setup,currentPlayer:s.currentPlayer,turn:s.turn,players:active.map((id:number)=>phone?[id,s.playerArrays.l[id],s.playerArrays.k[id]]:[id,s.players.find((p:any)=>p.id===id).gold,s.rules.alliances[id]]),units:sorted(units),buildings:sorted(buildings),graves:sorted((s.graves??[]).map((g:any)=>[...pos(g.pos),g.ownerId,g.remainingTurns]))};
}
export function nativeTokens(f:any){
    if(f.i>=0)return [['recruit',f.a,f.b,f.i]];
    if(['NEXT_TURN','GAME_START','SURRENDER'].includes(f.j))return [];
    const tokens:any[]=[],from=[f.a,f.b],to=f.c>=0&&f.d>=0?[f.c,f.d]:from;
    if(stable(from)!==stable(to))tokens.push(['move',...from,...to]);
    const kinds:any={ATTACK:'attack',HEAL:'heal',SUMMON:'summon',SUPPORT:'support',OCCUPY:'capture',REPAIR:'repair'};
    if(kinds[f.j])tokens.push([kinds[f.j],...to,...(['ATTACK','HEAL','SUMMON','SUPPORT'].includes(f.j)?[f.g,f.h]:[])]);
    else assert(['STANDBY','MOVE','NONE','SELECT','REVERSE'].includes(f.j),`未知原生动作：${f.j}`);
    if(f.e>=0&&f.f>=0&&stable(to)!==stable([f.e,f.f]))tokens.push(['move',...to,f.e,f.f]);
    return tokens;
}
export function projectTokens(s:any,a:any){
    if(['end_turn','surrender','wait'].includes(a.type))return [];
    if(a.type.startsWith('recruit_')){
        const r:any[]=[['recruit',...pos(a.castlePos),APK_UNIT_CLASS_TO_ID[a.unitClass]]];
        if(a.type==='recruit_and_deploy'&&stable(a.to)!==stable(a.castlePos))r.push(['move',...pos(a.castlePos),...pos(a.to)]);return r;
    }
    const actor=s.units.find((u:any)=>u.id===(a.unitId??a.attackerId??a.healerId??a.supporterId??a.summonerId));assert(actor,'动作单位不存在于已保存前态');
    if(['move','post_attack_move'].includes(a.type))return [['move',...pos(actor.pos),...pos(a.to)]];
    const kind=a.type==='destroy_town'?'attack':a.type;
    if(['capture','repair'].includes(kind))return [[kind,...pos(actor.pos)]];
    const target=a.target??a.spawnPos??s.units.find((u:any)=>u.id===a.targetId)?.pos;assert(target,`缺动作目标：${a.type}`);
    return [[kind,...pos(actor.pos),...pos(target)]];
}
const byParent=new Map(originalJobs.map((j:any)=>[j.parentId,j]));
function digestStart(initial:any){return crypto.createHash('sha256').update(stable(initial)+'\n');}
function feed(d:any,tokens:any[]){for(const t of tokens)d.update(stable(t)+'\n');}
async function lines(file:string,visit:(v:any)=>void){
    const source=fs.createReadStream(file),gzip=zlib.createGunzip();source.on('error',e=>gzip.destroy(e));source.pipe(gzip);
    for await(const line of readline.createInterface({input:gzip,crlfDelay:Infinity})){if(line)visit(JSON.parse(line));}
}
export async function auditPhone(row:any,suppliedJob?:any){
    const job:any=suppliedJob??byParent.get(row.parentId);
    const directory=row.localDirectory??path.join(ROOT,'ai_training/hard_curriculum3000_execution_20261027/samsung-v1/audit-20261029T045728Z',row.attemptId.includes('-w00-')?'w00-success':'w01-success',row.attemptId);
    const r=read(path.join(directory,'result.json')),receipt=read(path.join(directory,'initial-state-receipt.json'));
    assert(job&&r.parentId===job.parentId&&r.seed===job.seed&&r.naturalEnd&&!r.truncationReason);
    assert(receipt.verified&&receipt.requestedInitialStateSha256===job.initialStateSha256&&r.populationLimit===job.setup.unitLimit);
    const manifest=read(path.join(directory,'artifact-manifest.json')),files:any={};
    for(const f of manifest.files){const b=fs.readFileSync(path.join(directory,f.name));assert(b.length===f.bytes&&sha(b)===f.sha256,`手机原件改变：${directory}/${f.name}`);files[f.name]=f.sha256;}
    const initial=initialSemantics(job,receipt.actual,true),digest=digestStart(initial);let actions=0;
    await lines(path.join(directory,'actions.jsonl.gz'),v=>{assert(v.index===actions&&v.parentId===job.parentId&&v.attemptId===r.attemptId);feed(digest,nativeTokens(v.fields));actions++;});
    const frames=zlib.gunzipSync(fs.readFileSync(path.join(directory,'states.bin.gz')));let offset=0,count=0;while(offset<frames.length){assert(offset+4<=frames.length);const length=frames.readInt32BE(offset);offset+=4;assert(length>0&&offset+length<=frames.length);offset+=length;count++;}
    assert(actions===r.actions&&actions===row.actions&&count===actions);
    assert(read(path.join(directory,'THREAD_EXITED.json')).attemptId===r.attemptId);
    return {...row,localDirectory:directory,seed:job.seed,source:'apk-hard-original-phone',phoneDevice:row.executionSequence<=1000?'mi8':'samsung',initialSemanticSha256:sha(stable(initial)),semanticTrajectorySha256:digest.digest('hex'),files,qualification:'静态文件/身份/帧合同；未执行规则回放',winner:r.winnerAlliance};
}
export async function auditGpu(directory:string,runDirectory:string){
    const job=read(path.join(directory,'job.json')),run=read(path.join(runDirectory,'RUN.json')),r=read(path.join(directory,'result.json'));
    const origin:any=byParent.get(job.parentId),seq=origin?.executionSequence??job.executionSequence;
    if(origin){const actual={...job};delete actual.benchmarkSourceSequence;delete actual.benchmarkReplica;actual.executionSequence=seq;assert(hash(actual)===hash(origin),'GPU job与冻结原槽不符');}
    assert(run.source==='project-apk-hard-replica-gpu'&&r.source===run.source&&r.natural&&r.stop==='natural'&&!r.error&&r.parentId===job.parentId&&r.steps>0);
    const initial=read(path.join(directory,'initial.json')),final=read(path.join(directory,'final.json'));
    assert(initial.requestedInitialStateSha256===job.initialStateSha256&&initial.projectStateSha256===stateHash(initial.projectState));
    assert(stateHash(createJobState(job))===initial.projectStateSha256,'GPU实际初态与权威适配不符');
    const finalSha256=stateHash(final);assert((!r.finalSha256||finalSha256===r.finalSha256)&&final.winner!==null&&final.winner===r.winner,'终态摘要或自然标签不符');
    const initialSemantic=initialSemantics(job,initial.projectState),digest=digestStart(initialSemantic);let count=0,after=initial.projectStateSha256;
    await lines(path.join(directory,'decisions.jsonl.gz'),v=>{assert(v.step===count&&stateHash(v.before)===after,'GPU逐帧摘要链断裂');feed(digest,projectTokens(v.before,v.action));assert(/^[a-f0-9]{64}$/.test(v.afterSha256));after=v.afterSha256;count++;});
    assert(count===r.steps&&after===finalSha256&&(!r.recording||r.recording.records===count));
    const files=Object.fromEntries(['job.json','initial.json','final.json','result.json','decisions.jsonl.gz'].map(f=>[f,fileSha(path.join(directory,f))]));
    return {executionSequence:seq,parentId:job.parentId,seed:job.seed,category:job.category,profile:job.profile,players:job.actualPlayerCount,map:job.map,actions:count,winner:r.winner,source:r.source,native:run.native??false,localDirectory:directory,runDirectory,runSha256:fileSha(path.join(runDirectory,'RUN.json')),sourceIdentity:run.identity,initialSemanticSha256:sha(stable(initialSemantic)),semanticTrajectorySha256:digest.digest('hex'),files,qualification:'静态文件/身份/逐帧摘要/自然标签合同；未执行规则回放'};
}
export function reconcile(rows:any[]){
    const parent=new Map(),groups=new Map();for(const row of rows){if(parent.has(row.parentId))continue;parent.set(row.parentId,row);const g=groups.get(row.semanticTrajectorySha256)??[];g.push(row);groups.set(row.semanticTrajectorySha256,g);}
    const unique=[...groups.values()].map((g:any)=>g[0]);return {rows:[...parent.values()],unique,duplicates:[...groups.values()].filter((g:any)=>g.length>1).map((g:any)=>g.map((r:any)=>({executionSequence:r.executionSequence,parentId:r.parentId,source:r.source,sha:r.semanticTrajectorySha256}))),summary:{qualifiedParents:parent.size,distinct:unique.length,target:3000,remaining:Math.max(0,3000-unique.length),byCategory:tally(unique,(r:any)=>r.category),byPlayers:tally(unique,(r:any)=>r.players),byCell:tally(unique,(r:any)=>`${r.category}/${r.players}`),bySource:tally(unique,(r:any)=>r.source),actions:unique.reduce((n:number,r:any)=>n+r.actions,0)}};
}
async function main(){
    const rows:any[]=[],rejected:any[]=fs.existsSync(path.join(OUT,'HISTORICAL_REJECTIONS.json'))?read(path.join(OUT,'HISTORICAL_REJECTIONS.json')):[],phone=read(phoneFile),inventory=read(path.join(OUT,'HISTORICAL_INVENTORY.json'));
    const phoneCache=path.join(OUT,'PHONE_AUDITED.json');
    if(fs.existsSync(phoneCache))rows.push(...read(phoneCache));else{
        for(const p of phone){rows.push(await auditPhone(p));if(rows.length%100===0){save('AUDIT_PROGRESS.json',{phase:'phone',checked:rows.length});console.log('手机静态核验',rows.length);}}
        save('PHONE_AUDITED.json',rows);
    }
    const historicalCache=path.join(OUT,'HISTORICAL_GPU_AUDITED.json');
    if(fs.existsSync(historicalCache))rows.push(...read(historicalCache));else{
        const gpu:any[]=[];
        for(const c of inventory.selected){const alternatives=[c,...inventory.candidates.filter((v:any)=>v.parentId===c.parentId&&v.directory!==c.directory)];for(const candidate of alternatives){try{gpu.push(await auditGpu(candidate.directory,candidate.runDirectory));break;}catch(e){rejected.push({candidate,error:String(e)});save('HISTORICAL_REJECTIONS.json',rejected);}}save('AUDIT_PROGRESS.json',{phase:'historical_gpu',checked:gpu.length,rejected:rejected.length});if((gpu.length+rejected.length)%16===0)console.log('历史GPU静态核验',gpu.length,'拒收',rejected.length);}
        save('HISTORICAL_GPU_AUDITED.json',gpu);rows.push(...gpu);
    }
    save('HISTORICAL_REJECTIONS.json',rejected);const reconciled=reconcile(rows);save('INITIAL_RECONCILIATION.json',reconciled);console.log(JSON.stringify(reconciled.summary));
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename))await main();
