import { GameEngine } from '../../../src/game/engine';
import type { GameState,Action } from '../../../src/game/types';

let validate=false;
const wrappers=new WeakSet<object>();
export const BORROWED_AUDIT={snapshots:0,clones:0,steps:0};
export function validateBorrowedSnapshots(enabled:boolean){validate=enabled;}
function freeze<T>(value:T):T{
    if(value&&typeof value==='object'&&!Object.isFrozen(value)){
        for(const key of Object.keys(value))freeze((value as any)[key]);Object.freeze(value);
    }
    return value;
}

/** 仅供推理内部只读借用；全部合法性与执行仍委托原始权威实例。 */
class BorrowedEngine {
    constructor(private base:GameEngine,private snapshot?:GameState){(base as any).phoneBorrowSnapshots?.();wrappers.add(this);}
    getState():GameState{
        if(!this.snapshot){this.snapshot=this.base.getState();BORROWED_AUDIT.snapshots++;}
        return validate?freeze(this.snapshot):this.snapshot;
    }
    clone():GameEngine{BORROWED_AUDIT.clones++;return new BorrowedEngine(this.base.clone(),this.getState()) as unknown as GameEngine;}
    step(action:Action){
        this.snapshot=undefined;const result=this.base.step(action);this.snapshot=result.state;BORROWED_AUDIT.steps++;
        if(validate)freeze(this.snapshot);return result;
    }
    reset(state?:GameState){this.snapshot=undefined;const result=this.base.reset(state);this.snapshot=result;if(validate)freeze(result);return result;}
    getLegalActions(...args:Parameters<GameEngine['getLegalActions']>){
        const method=(this.base as any).phoneReadonlyLegal;
        const actions=method?method.apply(this.base,args):this.base.getLegalActions(...args);
        return validate?freeze(actions):actions;
    }
    getActionReadyUnitCount(player:number){return this.base.getActionReadyUnitCount(player);}
    isTerminal(){return this.base.isTerminal();}
}
export function borrowedEngine(engine:GameEngine):GameEngine{
    return wrappers.has(engine)?engine:new BorrowedEngine(engine) as unknown as GameEngine;
}
