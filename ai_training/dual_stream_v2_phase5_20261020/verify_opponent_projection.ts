import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { DIR, ROOT, read, save, sha } from './common';
import { gzipRows, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { ApkLikeAI } from '../../src/game/ai/apk_like_ai';

const oldPath = path.join(DIR,'phase53-audit/tactical-evaluation-before-projection-cache.ts'), currentPath = path.join(ROOT,'src/game/ai/tactical_evaluation.ts');
function members(file: string) {
    const source = ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
    const cls = source.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'RuleTacticalEvaluator') as ts.ClassDeclaration;
    return new Map(cls.members.map(n => [n.name?.getText(source) ?? 'constructor',n.getText(source)]));
}
const before = members(oldPath), after = members(currentPath);
for (const [name,body] of before) if (name !== 'estimateDamageAt') assert.equal(after.get(name),body,'非目标评分成员变化:'+name);
assert.deepEqual([...after.keys()].filter(k => !before.has(k)),['damageProjection']);
const arenas = ['champion-pure-arena','champion-search-arena','generations/gen_03/arena'];
const files: Record<string,string> = {}; let games = 0, actual = 0, opponentActions = 0;
for (const arena of arenas) {
    const plan = read(arena+'/plan.json');
    for (const slot of plan.slots) {
        const directory = path.join(DIR,arena,'battles',slot.id), bytes = fs.readFileSync(path.join(directory,'actions.jsonl.gz'));
        files[path.relative(DIR,path.join(directory,'actions.jsonl.gz'))] = sha(bytes);
        const engine = new GameEngine(read(plan.maps[slot.mapIndex].path));
        let cursor = slot.opponentSeed >>> 0, calls = 0;
        const rng = () => { cursor = (cursor + 0x6D2B79F5) >>> 0; let t = cursor; t = Math.imul(t ^ t >>> 15,t | 1); t ^= t + Math.imul(t ^ t >>> 7,t | 61); calls++; return ((t ^ t >>> 14) >>> 0)/4294967296; };
        const policy = slot.opponent === 'apk_like' ? new ApkLikeAI(rng) : new HeuristicAI(rng);
        let count = 0;
        for await (const row of gzipRows(bytes)) {
            const state = engine.getState(); assert.equal(stateHash(state),row.beforeHash); assert.deepEqual({state:cursor,calls},row.rngBefore);
            const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
            if (row.side === 'opponent') {
                const chosen = policy.getAction(engine,state.currentPlayer,[...legal].sort((a,b) => encodeAction(a) < encodeAction(b) ? -1 : encodeAction(a) > encodeAction(b) ? 1 : 0));
                assert.equal(encodeAction(chosen),row.code,`${arena}/${slot.id}/${row.i}:对手动作变化`); opponentActions++;
            }
            assert.deepEqual({state:cursor,calls},row.rngAfter,'随机调用顺序变化');
            const action = legal.find(a => encodeAction(a) === row.code); assert.ok(action); const next = engine.step(action); assert.equal(stateHash(next.state),row.afterHash); count++;
        }
        const result = read(path.join(directory,'result.json')); assert.equal(count,result.actions); assert.equal(stateHash(engine.getState()),result.finalHash);
        games++; actual += count;
        if (games % 4 === 0) { save('phase53-audit/opponent-equivalence-progress.json',{games,actual,opponentActions}); console.log(JSON.stringify({games,actual,opponentActions})); }
    }
}
const beforeRun = JSON.parse(fs.readFileSync(path.join(DIR,'phase53-audit/gen4-opponent-diagnosis.log'),'utf8').trim().split('\n').at(-1)!);
const afterRun = JSON.parse(fs.readFileSync(path.join(DIR,'phase53-audit/gen4-opponent-after-projection.log'),'utf8').trim().split('\n').at(-1)!);
assert.ok(afterRun.originalActionReproduced && afterRun.times.every((n:number) => n < 1000));
const receipt = {passed:true,games,actual,opponentActions,allActionsAndRngUnchanged:true,originalMembersUnchangedExcept:'estimateDamageAt',newMember:'damageProjection',originalSha256:sha(fs.readFileSync(oldPath)),currentSha256:sha(fs.readFileSync(currentPath)),files,beforeRun,afterRun,diagnosticProvenance:{beforeLogSha256:sha(fs.readFileSync(path.join(DIR,'phase53-audit/gen4-opponent-diagnosis.log'))),afterLogSha256:sha(fs.readFileSync(path.join(DIR,'phase53-audit/gen4-opponent-after-projection.log'))),note:'诊断脚本曾复用JSON输出名；前后原始日志独立保全，以上数据从各自原日志读取'},scope:'全部112槽纯策略及双方112槽旧搜索轨迹逐动作、完整状态与随机游标等价复核；非重新跑模型'};
save('phase53-audit/opponent-optimization-equivalence.json',receipt); console.log(JSON.stringify({passed:true,games,actual,opponentActions}));
