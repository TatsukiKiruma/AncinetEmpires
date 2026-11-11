/** 注入当前视图的数值编码与原生纯计算；引用函数仍来自上游脚本。 */
import {hardNativeCacheHelpers} from './apk_hard_native_cache.mjs';
export const hardNativeHelpers=hardNativeCacheHelpers+`
// 每次查询比较完整相关字段，包含临时移动、假想击杀和恢复，不依赖真实引擎步号。
let hardNativeViewCache = null;
let hardNativeThreatCache = new WeakMap();
function consumeHardNativeThreat(packed,team,canCapture,buildingType) {
    const encoded=hardNativeViewCache,nativeTeam=team&&encoded.teams.get(team.id),id=nativeTeam?nativeTeam.id:0;
    const kind=!buildingType?0:buildingType==='房子'?1:buildingType==='城堡'?2:3,key=id+'/'+Number(canCapture)+'/'+kind;
    let results=hardNativeThreatCache.get(packed);
    const cached=results&&results.get(key);
    if(cached!==undefined)return cached;
    const positions=new Float64Array(packed.length/3);
    for(let i=0;i<positions.length;i++)positions[i]=packed[i*3]*appData.cols+packed[i*3+1];
    const result=environment.nativeCompute.threat(encoded.view,positions,id,Number(canCapture),kind);
    if(!results){results=new Map();hardNativeThreatCache.set(packed,results);}
    results.set(key,result);return result;
}
function readHardNativeView() {
    let cache=hardNativeViewCache,reset=!cache||cache.rows!==appData.rows||cache.cols!==appData.cols||cache.terrainData.length!==appData.terrains.length||cache.unitData.length!==appData.units.length||cache.teamData.length!==appData.teams.length;
    if(!reset){
        for(let i=0;i<appData.terrains.length;i++){const t=appData.terrains[i],old=cache.terrainData[i];if(old[0]!==t.id||old[1]!==t.name||old[2]!==t.moveCost){reset=true;break;}}
        for(let i=0;!reset&&i<appData.units.length;i++){const u=appData.units[i],old=cache.unitData[i];if(old[0]!==u.id||old[1]!==Number((u.abilities||[]).includes('空军'))){reset=true;break;}}
        for(let i=0;!reset&&i<appData.teams.length;i++){const t=appData.teams[i],old=cache.teamData[i];if(old[0]!==t.id||old[1]!==t.alliance){reset=true;break;}}
    }
    if(reset){
        const terrains=new Map(appData.terrains.map((t,i)=>[t.id,{index:i+1,kind:(t.name==='房子'?1:t.name==='城堡'?2:0)|(t.id==='castle'?4:0)}])),alliances=new Map(),teams=new Map();
        appData.teams.forEach((t,i)=>{if(!alliances.has(t.alliance))alliances.set(t.alliance,alliances.size+1);teams.set(t.id,{id:i+1,alliance:alliances.get(t.alliance)});});
        cache=hardNativeViewCache={rows:appData.rows,cols:appData.cols,view:new Float64Array(appData.rows*appData.cols*8),raw:new Array(appData.rows*appData.cols*5),terrains,teams,units:new Map(appData.units.map(u=>[u.id,Number((u.abilities||[]).includes('空军'))])),terrainData:appData.terrains.map(t=>[t.id,t.name,t.moveCost]),unitData:appData.units.map(u=>[u.id,Number((u.abilities||[]).includes('空军'))]),teamData:appData.teams.map(t=>[t.id,t.alliance]),version:0,terrainVersion:0,positionsVersion:-1,terrainPositions:new Map(),movementCosts:new Map(),unblockedGraphs:createHardNativeCache(64*1024),graphs:createHardNativeCache(128*1024),distances:createHardNativeCache(32*1024),ranges:createHardNativeCache(256*1024),fields:new Map(),fieldQueries:new Map()};
    }
    const {view,raw,terrains,teams,units}=cache;let changed=reset,terrainChanged=reset,movementChanged=reset;
    for(let r=0;r<appData.rows;r++)for(let c=0;c<appData.cols;c++){
        const cell=appData.gridData[r][c],k=r*appData.cols+c,j=k*5,standby=cell.unitStandby===true;
        if(!reset&&raw[j]===cell.terrain&&raw[j+1]===cell.terrainTeam&&raw[j+2]===cell.unit&&raw[j+3]===cell.unitTeam&&raw[j+4]===standby)continue;
        changed=true;terrainChanged=terrainChanged||raw[j]!==cell.terrain;
        // 建筑归属和待命影响威胁／距离，但不改变移动代价与阻挡。
        movementChanged=movementChanged||raw[j]!==cell.terrain||raw[j+2]!==cell.unit||raw[j+3]!==cell.unitTeam;
        raw[j]=cell.terrain;raw[j+1]=cell.terrainTeam;raw[j+2]=cell.unit;raw[j+3]=cell.unitTeam;raw[j+4]=standby;
        const i=k*8,t=terrains.get(cell.terrain),owner=teams.get(cell.terrainTeam),unit=cell.unit&&teams.get(cell.unitTeam);
        view[i]=t?t.index:0;view[i+1]=t?t.kind:0;view[i+2]=owner?owner.id:0;view[i+3]=owner?owner.alliance:0;
        view[i+4]=unit?unit.id:0;view[i+5]=unit?unit.alliance:0;view[i+6]=(cell.unit?2:0)|(cell.unit&&units.get(cell.unit)||0);view[i+7]=standby?1:0;
    }
    if(terrainChanged){cache.terrainVersion++;cache.unblockedGraphs.clear();}
    if(movementChanged){cache.graphs.clear();cache.ranges.clear();}
    if(changed){cache.version++;cache.distances.clear();cache.fields.clear();cache.fieldQueries.clear();hardNativeThreatCache=new WeakMap();}
    return cache;
}
function prepareHardNativeMovement(selectUnit,movingTeamId) {
    const encoded=readHardNativeView(),abilitiesKey=JSON.stringify(selectUnit.abilities);
    if(encoded.positionsVersion!==encoded.terrainVersion){encoded.terrainPositions.clear();for(let i=0;i<appData.rows*appData.cols;i++){const index=encoded.view[i*8];if(!encoded.terrainPositions.has(index))encoded.terrainPositions.set(index,{row:Math.floor(i/appData.cols),col:i%appData.cols});}encoded.positionsVersion=encoded.terrainVersion;}
    let costEntry=encoded.movementCosts.get(abilitiesKey);
    if(!costEntry){costEntry={costs:new Float64Array(appData.terrains.length+1),ready:new Set()};costEntry.costs.fill(1);encoded.movementCosts.set(abilitiesKey,costEntry);}
    for(const [index,p] of encoded.terrainPositions)if(!costEntry.ready.has(index)){costEntry.costs[index]=calculateMoveCost(p.row,p.col,selectUnit);costEntry.ready.add(index);}
    const team=encoded.teams.get(movingTeamId),assault=getActiveAiAssaultSnapshot(movingTeamId),killed=assault&&assault.assaultKilledPosition;
    const blocked=!!(appData.demoEnemyMovementBlocking||(appData.activePanel==='moveMode'&&appData.moveModeConsiderEnemyBlockers));
    const parameters=[team?team.alliance:0,(selectUnit.abilities||[]).includes('空军')?1:0,blocked?1:0,killed?killed.row*appData.cols+killed.col:-1,killed&&killed.isAir?1:0],key=JSON.stringify([abilitiesKey,...parameters]);
    const cells=appData.rows*appData.cols;
    const graphs=blocked?encoded.graphs:encoded.unblockedGraphs;
    let prepared=graphs.get(key);
    if(!prepared){const values=environment.nativeCompute.movementInput(encoded.view,costEntry.costs,...parameters);prepared={values,costs:values.subarray(0,cells),blocked:values.subarray(cells),key,ranges:encoded.ranges};graphs.set(key,prepared,values.byteLength+64);}
    const result=prepared.values;
    if(environment.verifyMovementBatch)for(let r=0;r<appData.rows;r++)for(let c=0;c<appData.cols;c++){
        const i=r*appData.cols+c;
        if(result[i]!==calculateMoveCost(r,c,selectUnit)||result[cells+i]!==Number(isEnemyMovementBlocker(r,c,movingTeamId,selectUnit)))throw Error('原生移动输入与原表达式不一致');
    }
    return prepared;
}
function calculateHardNativeFieldDistance(encoded,row,col,team,enemy,origin,landing) {
    const key=team.id;let fields=encoded.fields.get(key);
    if(!fields){const queries=(encoded.fieldQueries.get(key)||0)+1;encoded.fieldQueries.set(key,queries);if(queries<(environment.distanceFieldThreshold||32))return undefined;fields=environment.distanceField({view:encoded.view,rows:appData.rows,cols:appData.cols,team:team.id,alliance:team.alliance});encoded.fields.set(key,fields);}
    const at=(row*appData.cols+col)*3,packed=fields[at+2];let total=fields[at+(enemy?0:1)],count=enemy?Math.floor(packed/2048):packed%2048;
    const distance=cell=>Math.abs(row-Math.floor(cell/appData.cols))+Math.abs(col-cell%appData.cols);
    if(!enemy&&origin>=0&&landing>=0){const removed=origin===landing?[origin]:[origin,landing];for(const cell of removed)if(encoded.view[cell*8+4]&&encoded.view[cell*8+5]===team.alliance){total-=distance(cell);count--;}}
    if(!enemy&&landing>=0){total+=distance(landing);count++;}
    return count?roundHardAiDistance(total/count):999;
}
`;
export function injectHardNative(body) {
    const once=(source,a,b)=>{if(source.split(a).length!==2)throw Error('困难原生注入锚点不唯一：'+a.slice(0,80));return source.replace(a,b);};
    body=hardNativeHelpers+body;
    const start=body.indexOf('function hardAiAverageDistance('),end=body.indexOf('\nfunction ',start+10);
    let fn=body.slice(start,end);
    fn=once(fn,'actorLanding = null) {','actorLanding = null, nativeView = null) {');
    fn=once(fn,'    const team = appData.teams.find(item => item.id === teamId);',`
    let acceleratedDistance;
    if(environment.nativeCompute){
        const encoded=nativeView||readHardNativeView(),nativeTeam=encoded.teams.get(teamId),origin=actorOrigin?actorOrigin.row*appData.cols+actorOrigin.col:-1,landing=actorLanding?actorLanding.row*appData.cols+actorLanding.col:-1;
        const key=row+','+col+','+(nativeTeam?nativeTeam.id:0)+','+(nativeTeam?nativeTeam.alliance:0)+','+(enemy?1:0)+','+origin+','+landing;
        acceleratedDistance=encoded.distances.get(key);
        if(acceleratedDistance===undefined){
            if(environment.distanceField&&nativeTeam&&Number.isInteger(row)&&Number.isInteger(col)&&row>=0&&col>=0&&row<appData.rows&&col<appData.cols)acceleratedDistance=calculateHardNativeFieldDistance(encoded,row,col,nativeTeam,enemy,origin,landing);
            if(acceleratedDistance===undefined)acceleratedDistance=environment.nativeCompute.averageDistance(encoded.view,appData.cols,row,col,nativeTeam?nativeTeam.id:0,nativeTeam?nativeTeam.alliance:0,enemy?1:0,origin,landing);
            encoded.distances.set(key,acceleratedDistance,8);
        }
        if(!environment.verifyMovementBatch)return acceleratedDistance;
    }
    const team = appData.teams.find(item => item.id === teamId);`);
    fn=once(fn,'    return roundHardAiDistance(total / positions.length);',`    const result=roundHardAiDistance(total / positions.length);
    if(acceleratedDistance!==undefined&&acceleratedDistance!==result)throw Error('原生平均距离与原表达式不一致');
    return result;`);
    body=body.slice(0,start)+fn+body.slice(end);
    // 同一函数内连续距离查询之间没有状态写入，只检查一次视图。
    for(const name of ['hardAiDistanceDifference','getHardAiHouseBaseScore']){
        const a=body.indexOf('function '+name+'('),b=body.indexOf('\nfunction ',a+10);let section=body.slice(a,b);
        section=once(section,'    const enemyDistance = hardAiAverageDistance(row, col, teamId, true);','    const nativeView=environment.nativeCompute?readHardNativeView():null;\n    const enemyDistance = hardAiAverageDistance(row, col, teamId, true, null, null, nativeView);');
        section=section.replace('hardAiAverageDistance(row, col, teamId, false, origin, landing)','hardAiAverageDistance(row, col, teamId, false, origin, landing, nativeView)').replace('hardAiAverageDistance(row, col, teamId, false, actorOrigin, landing)','hardAiAverageDistance(row, col, teamId, false, actorOrigin, landing, nativeView)').replace('hardAiAverageDistance(row, col, teamId, false);','hardAiAverageDistance(row, col, teamId, false, null, null, nativeView);');
        body=body.slice(0,a)+section+body.slice(b);
    }
    const threatStart=body.indexOf('function IsThreatUnit('),threatEnd=body.indexOf('\nfunction ',threatStart+10);
    let threat=body.slice(threatStart,threatEnd);
    threat=once(threat,'    let reachablePositions = [];','    let reachablePositions = [];\n    let acceleratedThreat;');
    threat=once(threat,'        reachablePositions = calculateMovementRange(row, col);',`
        // 范围函数仍检查当前视图及移动预算；只省去解包、重复威胁计算。
        const options=environment.nativeCompute&&environment.movementRange
            ? {nativeRangeConsumer:packed=>consumeHardNativeThreat(packed,team,unitHasStandardAbility(cell.unit,'占领'),buildingType)} : {};
        reachablePositions = calculateMovementRange(row, col, null, options);
        if(typeof reachablePositions==='boolean'){
            acceleratedThreat=reachablePositions;
            if(!environment.verifyMovementBatch)return acceleratedThreat;
            reachablePositions=calculateMovementRange(row,col);
        }`);
    threat=once(threat,'    for (let k = 0; k < reachablePositions.length; k++) {',`
    if(environment.nativeCompute){
        // 上方移动范围刚检查过网格，至此只恢复阻挡开关，没有改动网格或元数据。
        const encoded=environment.movementRange&&hardNativeViewCache?hardNativeViewCache:readHardNativeView(),nativeTeam=team&&encoded.teams.get(team.id),positions=Float64Array.from(reachablePositions,p=>p.row*appData.cols+p.col);
        const result=environment.nativeCompute.threat(encoded.view,positions,nativeTeam?nativeTeam.id:0,unitHasStandardAbility(cell.unit,'占领')?1:0,!buildingType?0:buildingType==='房子'?1:buildingType==='城堡'?2:3);
        if(!environment.verifyMovementBatch)return result;
        // 验证阶段保留完整上游分支，任一返回点均核对结果。
        const expected=(() => { ORIGINAL_THREAT_BODY })();
        if(result!==expected||acceleratedThreat!==undefined&&acceleratedThreat!==expected)throw Error('原生威胁过滤与原表达式不一致');
        return result;
    }
    for (let k = 0; k < reachablePositions.length; k++) {`);
    const loop=body.slice(threatStart,threatEnd);const original=loop.slice(loop.indexOf('    for (let k = 0; k < reachablePositions.length; k++) {'),loop.lastIndexOf('\n}'));
    threat=threat.replace('ORIGINAL_THREAT_BODY',original);
    return body.slice(0,threatStart)+threat+body.slice(threatEnd);
}
