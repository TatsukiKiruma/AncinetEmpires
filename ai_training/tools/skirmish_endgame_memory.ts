import type { Observation } from '../src/game/env';
import type { Action, Position } from '../src/game/types';
import { navigationTargetCosts, type NavigationTarget } from './skirmish_navigation_features';

type UnitView = Observation['units'][number];
interface Visit { x: number; y: number; turn: number }
interface Intent { target: NavigationTarget; bestDistance: number; progressTurn: number }
const distance = (a: Position,b:Position) => Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const actorId = (a:Action) => 'unitId' in a ? a.unitId : 'attackerId' in a ? a.attackerId : 'healerId' in a ? a.healerId : 'supporterId' in a ? a.supporterId : 'summonerId' in a ? a.summonerId : null;

/** 每个策略实例独占历史；只根据已观察到的状态提交位置，候选评分不提交动作。 */
export class EndgameMemory {
    private visits = new Map<string, Visit[]>();
    private intents = new Map<string,Intent>();
    private lastHp = new Map<string,number>();
    private lastStep = -1;
    private previousAction: Action | null = null;
    private cache = new Map<string,Float64Array|null>();
    private cachedObservation?: Observation;
    readonly stats = { targetsChosen:0, targetsInvalidated:0, targetsStalled:0, revisitCandidates:0, retreatExceptions:0 };

    observe(o:Observation, step:number) {
        if(step<this.lastStep){this.visits.clear();this.intents.clear();this.lastHp.clear();this.previousAction=null;}
        if(o===this.cachedObservation)return;
        this.lastStep=step;this.cachedObservation=o;this.cache.clear();
        if(this.previousAction && !['move','post_attack_move','wait','end_turn'].includes(this.previousAction.type)) {
            const id=actorId(this.previousAction);if(id)this.visits.delete(id);
        }
        this.previousAction=null;
        const alive=new Set(o.units.filter(u=>u.hp>0).map(u=>u.id));
        for(const id of this.visits.keys())if(!alive.has(id)){this.visits.delete(id);this.intents.delete(id);this.lastHp.delete(id);}
        for(const u of o.units.filter(u=>u.hp>0&&u.ownerId===o.currentPlayer)){
            if(u.hp<(this.lastHp.get(u.id)??u.hp))this.visits.delete(u.id);
            this.lastHp.set(u.id,u.hp);
            const history=(this.visits.get(u.id)??[]).filter(v=>o.turn-v.turn<=6);
            const last=history.at(-1);
            if(!last||last.x!==u.x||last.y!==u.y)history.push({x:u.x,y:u.y,turn:o.turn});
            this.visits.set(u.id,history.slice(-8));
        }
    }
    selected(action:Action){this.previousAction=action;}
    private allied(o:Observation,a:number,b:number){return (o.rules.alliances[a]??a)===(o.rules.alliances[b]??b);}
    private choose(o:Observation,u:UnitView,exclude?:NavigationTarget): Intent|null {
        const options: Array<{target:NavigationTarget;priority:number;approx:number}>=[];
        if(u.abilities.includes('castle_capturer'))for(const t of o.tiles){
            if(t.terrainTags.includes('castle')&&(t.ownerId===null||!this.allied(o,u.ownerId,t.ownerId)))options.push({target:{kind:'castle',x:t.x,y:t.y},priority:t.ownerId===null?1:3,approx:distance(u,t)});
        }
        for(const enemy of o.units.filter(e=>e.hp>0&&!this.allied(o,u.ownerId,e.ownerId))){
            options.push({target:{kind:'attack',unitId:enemy.id},priority:enemy.isCommander?2:0,approx:distance(u,enemy)});
        }
        options.sort((a,b)=>a.approx/Math.max(1,u.move)-a.priority-(b.approx/Math.max(1,u.move)-b.priority));
        let best:Intent|null=null,bestValue=Infinity;
        for(const option of options.slice(0,6)){
            if(exclude&&JSON.stringify(option.target)===JSON.stringify(exclude))continue;
            const costs=navigationTargetCosts(o,u.id,option.target);
            const cost=costs?.[u.y*o.mapWidth+u.x]??Infinity;
            const value=cost/Math.max(1,u.move)-option.priority;
            if(value<bestValue){bestValue=value;best={target:option.target,bestDistance:cost,progressTurn:o.turn};}
        }
        if(best)this.stats.targetsChosen++;
        return best;
    }
    private targetCosts(o:Observation,u:UnitView){
        if(this.cache.has(u.id))return this.cache.get(u.id)!;
        let intent=this.intents.get(u.id);
        let costs=intent?navigationTargetCosts(o,u.id,intent.target):null;
        const before=costs?.[u.y*o.mapWidth+u.x]??Infinity;
        if(intent&&!Number.isFinite(before)){this.stats.targetsInvalidated++;intent=undefined;}
        if(intent&&before<intent.bestDistance){intent.bestDistance=before;intent.progressTurn=o.turn;}
        if(intent&&o.turn-intent.progressTurn>=6&&before>0){
            const replacement=this.choose(o,u,intent.target);
            if(replacement){intent=replacement;this.stats.targetsStalled++;}
            else intent.progressTurn=o.turn;
        }
        if(!intent)intent=this.choose(o,u)??undefined;
        if(intent){this.intents.set(u.id,intent);costs=navigationTargetCosts(o,u.id,intent.target);}else{this.intents.delete(u.id);costs=null;}
        this.cache.set(u.id,costs);
        return costs;
    }
    adjustment(o:Observation,action:Action):number {
        const id=actorId(action),u=o.units.find(u=>u.id===id);
        if(!u)return 0;
        if(action.type==='destroy_town'){
            const pos=action.target??u,t=o.tiles.find(t=>t.x===pos.x&&t.y===pos.y);
            // 防止为了短期动作分数反复破坏自己的收入点。
            if(t&&(t.ownerId===null||this.allied(o,u.ownerId,t.ownerId)))return -18000;
        }
        if(action.type!=='move'&&action.type!=='post_attack_move')return 0;
        const threat=(pos:Position)=>o.units.filter(e=>e.hp>0&&!this.allied(o,u.ownerId,e.ownerId)&&distance(e,pos)>=e.minRange&&distance(e,pos)<=e.maxRange).length;
        const escape=threat(action.to)<threat(u)||u.hp<u.maxHp*0.45;
        let adjustment=0;
        const costs=this.targetCosts(o,u);
        const before=costs?.[u.y*o.mapWidth+u.x]??Infinity,after=costs?.[action.to.y*o.mapWidth+action.to.x]??Infinity;
        if(!escape&&Number.isFinite(before)&&Number.isFinite(after))adjustment+=Math.max(-2,Math.min(2,(before-after)/Math.max(1,u.move)))*4500;
        const revisits=(this.visits.get(u.id)??[]).filter(v=>v.x===action.to.x&&v.y===action.to.y&&!(v.x===u.x&&v.y===u.y)).length;
        if(revisits){this.stats.revisitCandidates++;if(escape)this.stats.retreatExceptions++;else adjustment-=Math.min(3,revisits)*10000;}
        return adjustment;
    }
}
