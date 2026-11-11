import {encodeAction} from '../../../src/game/env';
import {tacticalPriorBundle} from '../../../src/ai_runtime/dual_v3/search_policy';
import {ReachabilityContext} from '../../../src/ai_runtime/dual_v2/reachability';
const audits=new WeakMap<object,Map<string,string>>();
// 双32位流式摘要包含全部字段、数组次序及类型；碰撞对照在计时之外执行。
export function compactKey(ai:any,state:any){
 const start=performance.now();let a=2166136261,b=0x9e3779b9;
 const add=(s:string)=>{for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b^s.charCodeAt(i),2246822519);}a=Math.imul(a^255,16777619);};
 const visit=(v:any)=>{if(v===null){add('null');return;}add(typeof v);if(typeof v!=='object'){add(String(v));return;}add(Array.isArray(v)?'[':'{');for(const k of Object.keys(v)){add(k);visit(v[k]);}add('}');};
 visit(state);const key=`${a>>>0}:${b>>>0}`;
 ai.telemetry.keyHashMs=(ai.telemetry.keyHashMs??0)+performance.now()-start;
 if(ai.options.auditHash){let seen=audits.get(ai);if(!seen){seen=new Map();audits.set(ai,seen);}const canonical=JSON.stringify(state);if(seen.has(key)&&seen.get(key)!==canonical)throw Error('状态摘要碰撞');seen.set(key,canonical);ai.telemetry.hashChecks=seen.size;}
 return key;
}
export function localEvaluation(ai:any,engine:any,state:any,actor?:string){
 const legal=ai.legal(engine,actor),start=performance.now();
 const {priors,forbidden}=tacticalPriorBundle(state,legal,new ReachabilityContext(state),true);
 const ranked=legal.map((action:any,i:number)=>({action,code:encodeAction(action),prior:priors[i],score:priors[i],forbidden:Boolean(forbidden?.[i])})).sort((a:any,b:any)=>b.score-a.score);
 ai.telemetry.priorMs+=performance.now()-start;ai.telemetry.localWaveC=(ai.telemetry.localWaveC??0)+1;
 return {ranked,value:0};
}
