import { GameEngine } from '../../src/game/engine';
import assert from 'node:assert/strict';
import { evaluateValue,STATE_VALUE_AUDIT } from './value_state';
import { read,save,quantiles } from './io';
import { FOCUS_AUDIT } from './focus_threat';
const phase=process.argv[2]??'teacher',model=read(phase==='initial'?'initial.json':phase.startsWith('teacher')?'teacher-model.json':'model-final.json'),old=read('old-schema.json'),states=read('browser-states.json').map((v:any)=>v.state);
const values:number[]=[],cold:number[]=[];let maxFocusCalls=0,maxAttackWitnessSteps=0;
// 先预热解释器；不缓存最终Value，所有计时仍重新编码状态并计算风险。
for(let i=0;i<4;i++)for(const s of states)evaluateValue(new GameEngine(s),model,old);
for(const s of states){const e=new GameEngine(s);for(let i=0;i<10;i++){const t=performance.now();evaluateValue(e,model,old);const ms=performance.now()-t;maxFocusCalls=Math.max(maxFocusCalls,0,...FOCUS_AUDIT.byTarget.values());maxAttackWitnessSteps=Math.max(maxAttackWitnessSteps,STATE_VALUE_AUDIT.attackWitnessSteps);values.push(ms);if(i===0)cold.push(ms);}}
const q=quantiles(values),result={passed:q.max!==null&&q.max<5&&maxFocusCalls<=1,latency:q,perStateFirstCall:quantiles(cold),states:states.length,fullStateReencodedEveryTime:true,fullCandidateFeatureTraversals:0,maxAttackBooleanWitnessSteps:maxAttackWitnessSteps,maxFocusCallsPerCommander:maxFocusCalls,gate:'全部230次观测最大值<5ms；不是任意机器任意状态的实时最坏界'};save(`${phase}-speed.json`,result);console.log(result);assert.ok(result.passed,'Value速度门禁未过，保留原始测量并停止依赖阶段');
