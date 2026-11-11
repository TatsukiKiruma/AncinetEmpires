import { GameEngine } from '../../../src/game/engine';
import { encodeAction } from '../../../src/game/env';
import { HeuristicAI } from '../../../src/game/ai/heuristic_ai';
import { ApkLikeAI } from '../../../src/game/ai/apk_like_ai';
import { getAllianceId } from '../../../src/game/rule_config';
import { choosePolicy } from '../../tactical_scale_20261018/policy';
import { chooseBounded,type SearchMemory } from '../search';
import { evaluateValue } from '../value_state';
import { hash,sha,quantiles } from './browser_io';
import { installCompatibility } from './compat';
import type { Action } from '../../../src/game/types';

installCompatibility();
const check=(value:unknown,message:string)=>{if(!value)throw Error(message);};
function rngStream(seed:number){
    let state=seed>>>0,calls=0;
    return {next(){state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);calls++;return ((t^t>>>14)>>>0)/4294967296;},snapshot:()=>({state,calls})};
}
const legalActions=(engine:GameEngine)=>engine.getLegalActions(engine.getState().currentPlayer).filter(a=>a.type!=='surrender').sort((a,b)=>encodeAction(a)<encodeAction(b)?-1:encodeAction(a)>encodeAction(b)?1:0);
export function decide(engine:GameEngine,legal:Action[],model:any,old:any,arm:string,memory:SearchMemory){
    if(arm==='hierarchical')return {...choosePolicy(engine,legal,model,old,'hierarchical',false),search:null};
    const result=chooseBounded(engine,legal,model,old,arm,Number.MAX_SAFE_INTEGER,memory);
    return {...result,inputHash:hash(result.input),logitsHash:hash(result.logits),decoder:arm,chosenLogit:result.logits[result.index],candidates:result.logits.length};
}
export function decisionFixture(state:any,model:any,old:any,arm:string){
    const engine=new GameEngine(state),legal=legalActions(engine),before=hash(engine.getState());
    const selected=decide(engine,legal,model,old,arm,{});
    check(before===hash(engine.getState()),'决策修改了权威根状态');
    return {beforeHash:before,legalHash:hash(legal.map(encodeAction)),code:encodeAction(selected.action),inputHash:selected.inputHash,logitsHash:selected.logitsHash,chosenLogit:selected.chosenLogit,search:selected.search};
}
function equivalent(actual:any,expected:any):boolean{
    if(typeof expected==='number')return typeof actual==='number'&&Math.abs(actual-expected)<1e-8;
    if(expected===null||typeof expected!=='object')return actual===expected;
    return actual!==null&&typeof actual==='object'&&JSON.stringify(Object.keys(actual))===JSON.stringify(Object.keys(expected))&&Object.keys(expected).every(key=>key==='logitsHash'||equivalent(actual[key],expected[key]));
}
export async function selfcheck(config:any,post:(value:any)=>Promise<void>){
    for(const test of config.hashTests)check(sha(test.text)===test.sha256,'SHA-256不一致');
    const results=[];
    for(const fixture of config.fixtures){
        // 两端都先经过日志使用的JSON表示，避免省略字段与非有限数值造成传输层误报。
        const actual=JSON.parse(JSON.stringify(decisionFixture(fixture.state,config.models[fixture.arm],config.old,fixture.arm)));
        if(!equivalent(actual,fixture.expected))await post({type:'decision-mismatch',id:fixture.id,actual,expected:fixture.expected});
        check(equivalent(actual,fixture.expected),'手机决策与冻结PC单状态参考不一致：'+fixture.id);
        results.push({id:fixture.id,passed:true,code:actual.code});
        await post({type:'check-progress',id:fixture.id});
    }
    const samples:number[]=[],values:any[]=[];
    for(let warm=0;warm<4;warm++)for(const item of config.valueStates)evaluateValue(new GameEngine(item.state),config.models.teacher_search,config.old);
    for(const item of config.valueStates){
        const engine=new GameEngine(item.state);
        for(let repeat=0;repeat<10;repeat++){
            const start=performance.now(),value=evaluateValue(engine,config.models.teacher_search,config.old);samples.push(performance.now()-start);
            check(Math.abs(value-item.expected)<1e-8,'Value冷/热前向不一致');values.push(value);
        }
    }
    const roots:number[]=[];
    for(const state of config.rootStates)for(let repeat=0;repeat<3;repeat++){
        const engine=new GameEngine(state),start=performance.now(),legal=legalActions(engine);
        const result=chooseBounded(engine,legal,config.models.teacher_search,config.old,'teacher_search',Number.MAX_SAFE_INTEGER,{});
        if(repeat)roots.push(performance.now()-start);check(result.search.branchPolicyCalls===0,'搜索分支调用了策略');
        await post({type:'root-progress',count:roots.length,ms:roots[roots.length-1]});
    }
    return {passed:true,fixtures:results,shaTests:config.hashTests.map((test:any)=>{check(sha(test.text)===test.sha256,'SHA-256不一致');return true;}),
        valueLatency:quantiles(samples),rootLatency:quantiles(roots),valueSamples:samples,rootSamples:roots,
        valueGatePassed:quantiles(samples).p95!<5,rootTargetPassed:quantiles(roots).p95!<=500,
        userAgent:navigator.userAgent,devicePixelRatio:devicePixelRatio,hardwareConcurrency:navigator.hardwareConcurrency,gamesStarted:0};
}
export async function playSlot(config:any,slot:any,post:(value:any)=>Promise<void>){
    check(slot.opponent==='apk_like'||slot.opponent==='heuristic','禁止Random或未知对手');
    const model=config.models[slot.model],initial=config.maps[slot.mapIndex],budget=config.plan.budgets;
    check(!!model,'模型未准备');check(hash(initial)===config.plan.maps[slot.mapIndex].sha256,'地图身份不一致');
    const engine=new GameEngine(initial),rng=rngStream(slot.opponentSeed),memory:SearchMemory={};
    const opponent=slot.opponent==='apk_like'?new ApkLikeAI(rng.next):new HeuristicAI(rng.next);
    const samples={model:[] as number[],opponent:[] as number[]},repeats=new Map<string,number>();
    let actions=0,classification='error',error:any=null;
    await post({type:'started',slot,initialHash:hash(initial),modelHash:hash(model),budget,userAgent:navigator.userAgent});
    const start=performance.now();
    try{
        while(true){
            const state=engine.getState();
            if(engine.isTerminal()){classification=state.winner===-1?'natural_draw':state.winner===getAllianceId(state,slot.seat)?'natural_win':'natural_loss';break;}
            if(actions>=budget.maxActions){classification='action_truncation';break;}
            if(performance.now()-start>=budget.maxWallMs){classification='wall_truncation';break;}
            const {turn:_turn,...position}=state;
            const repeat=hash({position,rng:rng.snapshot(),policyMemory:slot.model.endsWith('_search')?memory:null});
            repeats.set(repeat,(repeats.get(repeat)??0)+1);if(repeats.get(repeat)!>=3){classification='loop';break;}
            const legal=legalActions(engine),side=state.currentPlayer===slot.seat?'model':'opponent';check(legal.length,'无合法动作');
            const rngBefore=rng.snapshot(),t=performance.now();
            const selected=side==='model'?decide(engine,legal,model,config.old,slot.model,memory):null;
            const action=selected?.action??opponent.getAction(engine,state.currentPlayer,legal);
            const ms=performance.now()-t;samples[side].push(ms);
            if(ms>budget.maxDecisionMs){classification='decision_timeout';break;}
            if(performance.now()-start>=budget.maxWallMs){classification='wall_truncation';break;}
            const code=encodeAction(action);check(legal.some(a=>encodeAction(a)===code),'选择了非法动作');
            const result=engine.step(action);check(!result.info.includes('非法动作'),'引擎拒绝动作');
            await post({type:'action',row:{i:actions,player:state.currentPlayer,side,action,code,beforeHash:hash(state),afterHash:hash(result.state),legalHash:hash(legal.map(encodeAction)),ms,
                search:selected?.search??null,selected:selected?{inputHash:selected.inputHash,logitsHash:selected.logitsHash,decoder:slot.model,chosenLogit:selected.chosenLogit,candidates:selected.candidates}:null,
                rngBefore,rngAfter:rng.snapshot()}});
            actions++;
        }
    }catch(e){error=String(e);classification='error';}
    const final=engine.getState();
    const result={slot,classification,error,actions,terminal:engine.isTerminal(),winner:final.winner,finalTurn:final.turn,wallSeconds:(performance.now()-start)/1000,
        finalHash:hash(final),latency:{model:quantiles(samples.model),opponent:quantiles(samples.opponent)},latencySamples:samples,rngFinal:rng.snapshot(),modelHash:hash(model),device:'c2357770'};
    await post({type:'result',result,final});return result;
}
export {hash,sha,quantiles};
