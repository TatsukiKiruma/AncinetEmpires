import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const replaceOnce=(source:string,old:string,next:string)=>{assert.equal(source.split(old).length,2,'写时复制接入点变化：'+old.slice(0,60));return source.replace(old,next);};

/** 只为手机推理增加写时复制；公共模式的可变快照仍保留原完整复制。 */
function engineSource(source:string,helper?:string,readonlyLegal=false){
    source=source.replace(/\r\n/g,'\n');
    source=replaceOnce(source,'export class GameEngine {',`const phoneCloneToken=Symbol('手机内部克隆');
export class GameEngine {
    private phoneSharedMap=false;
    private phoneReadonlySnapshots=false;
    public phoneBorrowSnapshots(){this.phoneReadonlySnapshots=true;${helper?'this.state.map=internReadonlyMap(this.state.map);this.phoneSharedMap=true;':''}}
    private phoneWritableMap(){
        if(this.phoneSharedMap){this.state.map={...this.state.map,tiles:this.state.map.tiles.map(row=>row.map(tile=>({...tile})))};this.phoneSharedMap=false;}
    }
    private phoneApplyCampaignEvent(event:Parameters<typeof applyCampaignEvents>[1]){
        if(this.state.rules?.campaignEvents?.length)this.phoneWritableMap();
        return applyCampaignEvents(this.state,event);
    }`);
    source=replaceOnce(source,'constructor(initialState: GameState, options?: GameEngineOptions) {','constructor(initialState: GameState, options?: GameEngineOptions, phoneToken?:symbol) {');
    source=replaceOnce(source,'this.state = cloneGameState(initialState);','this.state = cloneGameState(initialState,phoneToken===phoneCloneToken);\n        this.phoneSharedMap=phoneToken===phoneCloneToken;');
    source=replaceOnce(source,'return cloneGameState(this.state);','if(this.phoneReadonlySnapshots)this.phoneSharedMap=true;\n        return cloneGameState(this.state,this.phoneReadonlySnapshots);');
    source=replaceOnce(source,'public clone(): GameEngine {','public clone(): GameEngine {\n        this.phoneSharedMap=true;');
    source=replaceOnce(source,'disableAutoAdvanceWhenNoMeaningfulAction: this.disableAutoAdvanceWhenNoMeaningfulAction\n        });','disableAutoAdvanceWhenNoMeaningfulAction: this.disableAutoAdvanceWhenNoMeaningfulAction\n        },phoneCloneToken);\n        branch.phoneReadonlySnapshots=this.phoneReadonlySnapshots;');
    for(const kind of ['destroy_town','capture','repair']){
        const needle=`            case '${kind}': {`;
        // 此缩进只匹配权威step分派，不修改动作相等性函数。
        source=replaceOnce(source,needle,needle+'\n                this.phoneWritableMap();');
    }
    const calls=source.match(/destroyTeamForRules\(this\.state,/g)??[];assert.equal(calls.length,2);
    source=source.replace(/destroyTeamForRules\(this\.state,/g,'this.phoneWritableMap(); destroyTeamForRules(this.state,');
    const campaigns=source.match(/applyCampaignEvents\(this\.state, /g)??[];assert.ok(campaigns.length>=6);
    // 辅助方法自身不带空格，故不会被替换为递归调用。
    source=source.replace(/applyCampaignEvents\(this\.state, /g,'this.phoneApplyCampaignEvent(');
    if(readonlyLegal)source=replaceOnce(source,'    public getLegalActions(playerId: number, query?: LegalActionQuery): Action[] {',`    // 仅供手机内部只读推理借用，缓存本身已与可变状态隔离；公共接口仍复制。
    public phoneReadonlyLegal(playerId:number,query?:LegalActionQuery):Action[]{return this.getCachedLegalActions(playerId,query);}
    public getLegalActions(playerId: number, query?: LegalActionQuery): Action[] {`);
    return helper?`import {internReadonlyMap} from ${JSON.stringify(helper)};\n`+source:source;
}
function cloneSource(source:string,helper:string){
    source=replaceOnce(source,'export function cloneGameState(state: GameState): GameState {','export function cloneGameState(state: GameState,sharePhoneMap=false): GameState {');
    source=replaceOnce(source,'copy.map = { ...state.map, tiles: state.map.tiles.map(row => row.map(tile => ({ ...tile }))) };','copy.map = { ...state.map, tiles: sharePhoneMap ? state.map.tiles : state.map.tiles.map(row => row.map(tile => ({ ...tile }))) };\n    if(sharePhoneMap)registerReadonlyTiles(copy.map.tiles);');
    return `import {registerReadonlyTiles} from ${JSON.stringify(helper)};\n`+source;
}
function geometrySource(source:string,helper:string,scopeMoves=false){
    source=replaceOnce(source,'    let geom=stateGeometry.get(s);\n    if(geom===undefined){','    let geom=stateGeometry.get(s);\n    if(geom===undefined){\n        const phonePrior=lookupReadonlyGeometry(s,geometryEpoch);\n        if(phonePrior!==undefined){stateGeometry.set(s,phonePrior);return {geom:phonePrior,epoch:geometryEpoch};}');
    source=replaceOnce(source,'        stateGeometry.set(s,geom);','        stateGeometry.set(s,geom);rememberReadonlyGeometry(s,geometryEpoch,geom);');
    if(scopeMoves){
        source=replaceOnce(source,'export function beginMovementScope(){stateGeometry=new WeakMap();}','export function beginMovementScope(){stateGeometry=new WeakMap();phoneScopedMoves=new WeakMap();}');
        source=replaceOnce(source,'    const distance=Math.max(getEffectiveStats(unit).move,unit.movementRemaining??0),','    const scoped=phoneScopedMoves.get(s)?.get(unit);if(scoped)return scoped;\n    const distance=Math.max(getEffectiveStats(unit).move,unit.movementRemaining??0),');
        source=replaceOnce(source,'    return moves;','    let scopedRecords=phoneScopedMoves.get(s);if(!scopedRecords){scopedRecords=new WeakMap();phoneScopedMoves.set(s,scopedRecords);}scopedRecords.set(unit,moves);\n    return moves;');
        source+='\n// 同一只读快照内跳过重复签名构造，作用域开始时清空。\nlet phoneScopedMoves=new WeakMap<GameState,WeakMap<Unit,Action[]>>();\n';
    }
    return `import {lookupReadonlyGeometry,rememberReadonlyGeometry} from ${JSON.stringify(helper)};\n`+source;
}
export function cowPlugin(repo:string,target:string,advanced=false,readonlyLegal=false){
    const helper=path.join(repo,'ai_training/tactical_exit_20261019/phone/cow_geometry.ts');
    return {name:'手机权威引擎只读几何写时复制',setup(builder:any){
        for(const [filter,transform,name] of [
            [/[\\/]src[\\/]game[\\/]engine\.ts$/,(source:string)=>engineSource(source,advanced?helper:undefined,readonlyLegal),'engine.cow.ts.snapshot'],
            [/[\\/]src[\\/]game[\\/]clone_state\.ts$/,(source:string)=>cloneSource(source,helper),'clone-state.cow.ts.snapshot'],
            [/[\\/]tactical_exit_20261019[\\/]movement_query_cache\.ts$/,(source:string)=>geometrySource(source,helper,advanced),'movement-geometry.cow.ts.snapshot'],
        ] as const)builder.onLoad({filter},(args:any)=>{
            const contents=transform(fs.readFileSync(args.path,'utf8'));
            fs.writeFileSync(path.join(target,name),contents,{flag:'wx'});
            return {contents,loader:'ts',resolveDir:path.dirname(args.path)};
        });
    }};
}
