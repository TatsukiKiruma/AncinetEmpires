import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getAllianceId } from '../../src/game/rule_config';
import { auditSearchRisks } from './audit_search_risks';
import { DIR, read, hash, sha } from './io';

// 停机原件只读；完整局和中断前缀均逐动作核验，不重新运行策略或补写胜负。
const stopPath='revisions/xiaomi_20261020/20261020T010559/R24_PC_STOP.json';
const stopped=read(stopPath), index=Number(process.argv[2]);
const interrupted=index>=stopped.completed.length;
const entry=interrupted?stopped.interruptedSlots[index-stopped.completed.length]:stopped.completed[index];
assert.ok(entry);
const plan=read('teacher-battle-plan.json'),slot=plan.slots.find((s:any)=>s.id===entry.slot);
assert.ok(slot);
const folder=path.join(DIR,'teacher-r24-battles/slots',entry.slot);
const raw=fs.readFileSync(path.join(folder,'actions.jsonl'));
assert.equal(sha(raw),interrupted?entry.sha256:entry.rawSha256);
assert.equal(raw.at(-1),10,'所有已提交行必须完整');
const receipt=path.join(folder,interrupted?'strict-prefix-replay.json':'strict-replay.json');
assert.ok(!fs.existsSync(receipt),'收据已经存在，拒绝覆盖');
if(interrupted){
    assert.equal(raw.length,entry.bytes);assert.equal(entry.hasIncompleteLastLine,false);
    assert.ok(!fs.existsSync(path.join(folder,'result.json')));
}else{
    assert.equal(sha(fs.readFileSync(path.join(folder,'result.json'))),entry.resultSha256);
    assert.deepEqual(gunzipSync(fs.readFileSync(path.join(folder,'actions.jsonl.gz'))),raw);
}
const initial=read(plan.maps[slot.mapIndex].path);
assert.equal(hash(initial),plan.maps[slot.mapIndex].sha256);
const started=read(path.relative(DIR,path.join(folder,'started.json')));
assert.deepEqual(started.slot,slot);assert.equal(started.initialHash,hash(initial));
const identity=read('teacher-r24-model-identities.json').models[slot.model];
assert.equal(started.modelHash,identity.semanticSha256);
assert.equal(sha(fs.readFileSync(identity.file)),identity.fileSha256);
const engine=new GameEngine(initial),counts:Record<string,number>={};
let actions=0,rng:any={state:slot.opponentSeed>>>0,calls:0};
const inputs=new Set<string>();
for(const line of raw.toString('utf8').trimEnd().split('\n')){
    const row=JSON.parse(line),state=engine.getState();
    assert.equal(row.i,actions);assert.equal(row.player,state.currentPlayer);
    assert.equal(row.side,state.currentPlayer===slot.seat?'model':'opponent');
    assert.equal(hash(state),row.beforeHash);inputs.add(row.beforeHash);
    const legal=engine.getLegalActions(state.currentPlayer).filter(a=>a.type!=='surrender').map(encodeAction).sort();
    assert.equal(hash(legal),row.legalHash);assert.equal(encodeAction(row.action),row.code);
    assert.ok(legal.includes(row.code));assert.deepEqual(row.rngBefore,rng);rng=row.rngAfter;
    for(const [key,value] of Object.entries(auditSearchRisks(engine,row.search)))counts[key]=(counts[key]??0)+value;
    assert.ok(!engine.step(row.action).info.includes('非法动作'));
    assert.equal(hash(engine.getState()),row.afterHash);actions++;
}
assert.equal(actions,interrupted?entry.completeLines:entry.actions);
const final=engine.getState();
if(!interrupted){
    const result=read(path.relative(DIR,path.join(folder,'result.json')));
    assert.deepEqual(result.slot,slot);assert.equal(result.actions,actions);
    assert.equal(result.finalHash,hash(final));assert.equal(result.modelHash,identity.semanticSha256);
    assert.deepEqual(result.rngFinal,rng);assert.equal(result.terminal,engine.isTerminal());
    if(result.classification.startsWith('natural_')){
        assert.ok(engine.isTerminal());
        assert.equal(result.classification,final.winner===-1?'natural_draw':final.winner===getAllianceId(final,slot.seat)?'natural_win':'natural_loss');
    }
}
const result={passed:true,classification:interrupted?'user_interrupted_prefix':entry.classification,slot:slot.id,actions,
    rawLogSha256:sha(raw),rawBytes:raw.length,initialHash:hash(initial),finalHash:hash(final),
    terminalAtLastCommittedAction:engine.isTerminal(),riskWitnessAudit:counts,distinctConsumedBeforeHashes:inputs.size,
    policyRecomputed:false,stopRecordSha256:sha(fs.readFileSync(path.join(DIR,stopPath))),
    checkerSha256:sha(fs.readFileSync(new URL(import.meta.url))),
    scope:'100%权威合法集合、动作及前后态、RNG连续性和搜索风险见证；不重算策略，不补写中断结局'};
fs.writeFileSync(receipt,JSON.stringify(result),{flag:'wx'});
console.log(JSON.stringify(result));
