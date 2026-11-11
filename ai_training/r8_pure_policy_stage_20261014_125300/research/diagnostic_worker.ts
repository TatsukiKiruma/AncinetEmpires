// 单局子进程：父进程对同步策略设置独立硬超时。
import { GameEngine,createState,hash,features,inputHash,encodeAction,strictStep,fileHash } from './common';
import { policy } from './diagnostic_policy';
process.once('message',(cfg:any)=>{
 const started=performance.now();let engine:GameEngine;let steps=0;let winner:any=null;let initialStateHash='';let initialState:any;
 const send=(x:any)=>process.send?.(x);
 try{
  initialState=cfg.initialState??createState(cfg.mapName);engine=new GameEngine(initialState);initialStateHash=hash(initialState);
  const policies=[0,1].map(seat=>policy(seat===cfg.candidateSeat?cfg.candidate:{type:'heuristic'},cfg.seeds[seat],seat));
  send({type:'ready',initialState,initialStateHash,modelSha256:cfg.candidate.model?fileHash(cfg.candidate.model):null});
  const fullSeen=new Map<string,number>();
  while(!engine.isTerminal()&&steps<cfg.maxSteps){
   const state=engine.getState();const player=state.currentPlayer;const original=structuredClone(engine.getLegalActions(player));
   if(!original.length)throw Error('非终局空合法动作');
   const before=hash(state);const n=(fullSeen.get(before)??0)+1;fullSeen.set(before,n);
   if(n>=3){send({type:'result',outcome:'cycle_truncated',steps,winner:null,finalStateHash:before});process.exit(0);}
   const t0=performance.now();send({type:'decision',step:steps,player});
   const rngBefore=policies[player].rng.snapshot();
   const chosen=policies[player].act(structuredClone(state),structuredClone(original));
   if(hash(engine.getState())!==before)throw Error('裁判状态被篡改');
   const f=cfg.recordInputs||cfg.collect?features(state,original):null;
   if(cfg.collect && (cfg.collectBoth||player===cfg.candidateSeat)){
    const teacherSeed=parseInt(hash(`${cfg.labelSeed}|${before}|${player}`).slice(0,8),16);
    const teacher=policy(cfg.teacher??{type:'heuristic'},teacherSeed,player);
    const label=teacher.act(structuredClone(state),structuredClone(original));const targetActionIndex=original.map(encodeAction).indexOf(encodeAction(label));
    if(targetActionIndex<0)throw Error('教师非法标签');
    send({type:'sample',sample:{...f,stateJson:structuredClone(state),stateHash:before,inputHash:inputHash(f!),targetActionIndex,actionCodes:original.map(encodeAction),gameId:cfg.gameId,mapName:cfg.mapName,stepIndex:steps,playerId:player,split:cfg.split,teacher:cfg.teacher??{type:'heuristic'},teacherSeed,teacherRng:teacher.rng.snapshot(),familyId:cfg.familyId,behaviorModelSha256:cfg.candidate.model?fileHash(cfg.candidate.model):null}});
   }
   const result=strictStep(engine,original,chosen);
   send({type:'step',step:steps,player,action:chosen,actionCode:encodeAction(chosen),legalCount:original.length,legalCodes:original.map(encodeAction),beforeHash:before,afterHash:hash(engine.getState()),reward:result.reward,done:result.done,info:result.info,elapsedMs:performance.now()-t0,rngBefore,rngAfter:policies[player].rng.snapshot(),inputHash:f?inputHash(f):null,diagnostics:policies[player].diagnostics()});
   steps++;
  }
  winner=engine.getWinner();const outcome=!engine.isTerminal()?'step_truncated':winner===-1?'rule_draw':winner===cfg.candidateSeat?'natural_win':winner===null?'error':'natural_loss';
  send({type:'result',outcome,steps,winner,initialStateHash,finalStateHash:hash(engine.getState()),elapsedMs:performance.now()-started});
 }catch(e:any){send({type:'result',outcome:'error',steps,winner,error:e.stack});}
 setTimeout(()=>process.exit(0),10);
});

