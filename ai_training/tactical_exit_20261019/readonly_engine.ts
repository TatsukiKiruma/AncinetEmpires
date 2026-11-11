import { GameEngine } from '../../src/game/engine';
import type { Action,GameState } from '../../src/game/types';

const proxies=new WeakSet<GameEngine>();
const records=new WeakMap<GameEngine,{proxy:GameEngine;refresh:()=>void}>();
export const READONLY_AUDIT={snapshots:0,sharedCloneStarts:0,stepSnapshots:0};
let validateFrozen=false;
/** 离线完整特征审计时启用，检测任何违反内部只读约定的代码路径。 */
export function setReadonlyValidation(enabled:boolean){validateFrozen=enabled;}

/** 只冻结公共引擎已经隔离的快照，绝不冻结引擎自身的可变状态。 */
function freezeSnapshot<T>(value:T):T{
    if(value&&typeof value==='object'&&!Object.isFrozen(value)){
        for(const child of Object.values(value))freezeSnapshot(child);
        Object.freeze(value);
    }
    return value;
}

function wrap(base:GameEngine,initial?:GameState):GameEngine{
    let snapshot=initial;
    const getState=()=>{if(!snapshot){snapshot=base.getState();READONLY_AUDIT.snapshots++;}return validateFrozen?freezeSnapshot(snapshot):snapshot;};
    const step=(action:Action)=>{
        snapshot=undefined;
        const result=base.step(action);snapshot=validateFrozen?freezeSnapshot(result.state):result.state;READONLY_AUDIT.stepSnapshots++;
        return {...result,state:snapshot};
    };
    const reset=(state?:GameState)=>{snapshot=undefined;snapshot=base.reset(state);if(validateFrozen)freezeSnapshot(snapshot);return snapshot;};
    const clone=()=>{const seed=getState(),branch=base.clone();READONLY_AUDIT.sharedCloneStarts++;return wrap(branch,seed);};
    const methods=new Map<PropertyKey,unknown>([['getState',getState],['step',step],['reset',reset],['clone',clone]]);
    const proxy=new Proxy(base,{
        get(target,key){
            if(methods.has(key))return methods.get(key);
            const value=Reflect.get(target,key,target);
            if(typeof value!=='function')return value;
            const bound=value.bind(target);methods.set(key,bound);return bound;
        },
    });
    proxies.add(proxy);records.set(base,{proxy,refresh:()=>{snapshot=undefined;}});return proxy;
}

/** 只供内部已审计的只读推理借用，不能替代公共可变快照API；从原引擎进入时始终刷新。 */
export function readonlyEngine(engine:GameEngine):GameEngine{
    if(proxies.has(engine))return engine;
    const prior=records.get(engine);if(prior){prior.refresh();return prior.proxy;}
    return wrap(engine);
}
