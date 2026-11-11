import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { auditSearchRisks } from './audit_search_risks';
import { DIR, read, hash, sha } from './io';

// 中断原件只读；只对停止记录中的完整行生成独立前缀收据，不生成自然结局。
const stopped=read('revisions/r21/USER_STOP_20261019T222424.json');
const entry=stopped.interruptedSlots[Number(process.argv[2])];assert.ok(entry);
const plan=read('teacher-battle-plan.json'),slot=plan.slots.find((s:any)=>s.id===entry.slot);assert.ok(slot);
const source=path.join(DIR,entry.rawLog),folder=path.dirname(source),receipt=path.join(folder,'strict-prefix-replay.json');
assert.ok(!fs.existsSync(receipt),'前缀收据已存在，拒绝覆盖');
assert.ok(!fs.existsSync(path.join(folder,'result.json')),'中断前缀不能冒充完整对局');
const digest=createHash('sha256');for await(const chunk of fs.createReadStream(source))digest.update(chunk);
assert.equal(digest.digest('hex'),entry.sha256);assert.equal(fs.statSync(source).size,entry.bytes);
assert.equal(entry.hasIncompleteLastLine,false,'非完整末行须单独登记后处理');
const root=path.resolve(DIR,'../..'),freeze=read('source-freeze-teacher-r21.json');
for(const [name,identity] of Object.entries(freeze.files) as [string,any][])assert.equal(sha(fs.readFileSync(path.join(root,name))),identity.sha256,name);
const initial=read(plan.maps[slot.mapIndex].path);assert.equal(hash(initial),plan.maps[slot.mapIndex].sha256);
const started=read(path.relative(DIR,path.join(folder,'started.json')));assert.deepEqual(started.slot,slot);assert.equal(started.initialHash,hash(initial));
assert.equal(started.modelHash,read('teacher-r21-model-identities.json').models[slot.model].semanticSha256);
const engine=new GameEngine(initial),counts:Record<string,number>={};let actions=0,rng:any=null;
const inputs=new Set<string>();
for await(const line of createInterface({input:fs.createReadStream(source),crlfDelay:Infinity})){
    assert.ok(line.length);const row=JSON.parse(line),state=engine.getState();assert.equal(row.i,actions);
    assert.equal(row.player,state.currentPlayer);assert.equal(row.side,state.currentPlayer===slot.seat?'model':'opponent');
    assert.equal(hash(state),row.beforeHash);inputs.add(row.beforeHash);
    const legal=engine.getLegalActions(state.currentPlayer).filter(a=>a.type!=='surrender').map(encodeAction).sort();
    assert.equal(hash(legal),row.legalHash);assert.equal(encodeAction(row.action),row.code);assert.ok(legal.includes(row.code));
    if(rng)assert.deepEqual(row.rngBefore,rng);else assert.deepEqual(row.rngBefore,{state:slot.opponentSeed>>>0,calls:0});
    rng=row.rngAfter;
    for(const [k,v] of Object.entries(auditSearchRisks(engine,row.search)))counts[k]=(counts[k]??0)+v;
    assert.ok(!engine.step(row.action).info.includes('非法动作'));assert.equal(hash(engine.getState()),row.afterHash);actions++;
}
assert.equal(actions,entry.completeLines);
const final=engine.getState();
const result={passed:true,classification:'user_interrupted_prefix',slot:slot.id,actions,rawLogSha256:entry.sha256,rawBytes:entry.bytes,initialHash:hash(initial),finalHash:hash(final),terminalAtLastCommittedAction:engine.isTerminal(),riskWitnessAudit:counts,distinctConsumedBeforeHashes:inputs.size,policyRecomputed:false,sourceFreezeSha256:sha(fs.readFileSync(path.join(DIR,'source-freeze-teacher-r21.json'))),checkerSha256:sha(fs.readFileSync(new URL(import.meta.url))),scope:'只核验真实已提交完整动作及分支风险见证，不补写result或胜负'};
fs.writeFileSync(path.join(folder,'strict-prefix-final.json'),JSON.stringify(final),{flag:'wx'});
fs.writeFileSync(receipt,JSON.stringify(result),{flag:'wx'});
console.log(JSON.stringify(result));
