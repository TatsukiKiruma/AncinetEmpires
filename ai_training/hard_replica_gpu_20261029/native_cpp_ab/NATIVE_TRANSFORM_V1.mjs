/** 注入当前视图的数值编码与原生纯计算；引用函数仍来自上游脚本。 */
export function injectHardNative(body) {
    const once=(source,a,b)=>{if(source.split(a).length!==2)throw Error('困难原生注入锚点不唯一：'+a.slice(0,80));return source.replace(a,b);};
    const helper=`
// 每次查询重读当前网格，包含临时移动、假想击杀和恢复，不依赖真实引擎步号。
function readHardNativeView() {
    const terrains = new Map(appData.terrains.map((t,i) => [t.id, {index:i+1,kind:(t.name==='房子'?1:t.name==='城堡'?2:0)|(t.id==='castle'?4:0)}]));
    const alliances = new Map(), teams = new Map();
    appData.teams.forEach((t,i) => {if(!alliances.has(t.alliance))alliances.set(t.alliance,alliances.size+1);teams.set(t.id,{id:i+1,alliance:alliances.get(t.alliance)});});
    const units = new Map(appData.units.map(u => [u.id,(u.abilities||[]).includes('空军')?1:0]));
    const view = new Float64Array(appData.rows*appData.cols*8), terrainPositions = new Map();
    for(let r=0;r<appData.rows;r++)for(let c=0;c<appData.cols;c++){
        const cell=appData.gridData[r][c],i=(r*appData.cols+c)*8,t=terrains.get(cell.terrain),owner=teams.get(cell.terrainTeam),unit=cell.unit&&teams.get(cell.unitTeam);
        view[i]=t?t.index:0;view[i+1]=t?t.kind:0;view[i+2]=owner?owner.id:0;view[i+3]=owner?owner.alliance:0;
        view[i+4]=unit?unit.id:0;view[i+5]=unit?unit.alliance:0;view[i+6]=(cell.unit?2:0)|(cell.unit&&units.get(cell.unit)||0);view[i+7]=cell.unitStandby===true?1:0;
        if(!terrainPositions.has(view[i]))terrainPositions.set(view[i],{row:r,col:c});
    }
    return {view,teams,terrainPositions};
}
function prepareHardNativeMovement(selectUnit,movingTeamId) {
    const encoded=readHardNativeView(),costs=new Float64Array(appData.terrains.length+1);
    costs.fill(1);
    for(const [index,p] of encoded.terrainPositions)costs[index]=calculateMoveCost(p.row,p.col,selectUnit);
    const team=encoded.teams.get(movingTeamId),assault=getActiveAiAssaultSnapshot(movingTeamId),killed=assault&&assault.assaultKilledPosition;
    const blocked=!!(appData.demoEnemyMovementBlocking||(appData.activePanel==='moveMode'&&appData.moveModeConsiderEnemyBlockers));
    const result=environment.nativeCompute.movementInput(encoded.view,costs,team?team.alliance:0,(selectUnit.abilities||[]).includes('空军')?1:0,blocked?1:0,killed?killed.row*appData.cols+killed.col:-1,killed&&killed.isAir?1:0);
    const cells=appData.rows*appData.cols;
    if(environment.verifyMovementBatch)for(let r=0;r<appData.rows;r++)for(let c=0;c<appData.cols;c++){
        const i=r*appData.cols+c;
        if(result[i]!==calculateMoveCost(r,c,selectUnit)||result[cells+i]!==Number(isEnemyMovementBlocker(r,c,movingTeamId,selectUnit)))throw Error('原生移动输入与原表达式不一致');
    }
    return {costs:result.subarray(0,cells),blocked:result.subarray(cells)};
}
`;
    body=helper+body;
    const start=body.indexOf('function hardAiAverageDistance('),end=body.indexOf('\nfunction ',start+10);
    let fn=body.slice(start,end);
    fn=once(fn,'    const team = appData.teams.find(item => item.id === teamId);',`
    let acceleratedDistance;
    if(environment.nativeCompute){
        const encoded=readHardNativeView(),nativeTeam=encoded.teams.get(teamId),origin=actorOrigin?actorOrigin.row*appData.cols+actorOrigin.col:-1,landing=actorLanding?actorLanding.row*appData.cols+actorLanding.col:-1;
        acceleratedDistance=environment.nativeCompute.averageDistance(encoded.view,appData.cols,row,col,nativeTeam?nativeTeam.id:0,nativeTeam?nativeTeam.alliance:0,enemy?1:0,origin,landing);
        if(!environment.verifyMovementBatch)return acceleratedDistance;
    }
    const team = appData.teams.find(item => item.id === teamId);`);
    fn=once(fn,'    return roundHardAiDistance(total / positions.length);',`    const result=roundHardAiDistance(total / positions.length);
    if(acceleratedDistance!==undefined&&acceleratedDistance!==result)throw Error('原生平均距离与原表达式不一致');
    return result;`);
    body=body.slice(0,start)+fn+body.slice(end);
    const threatStart=body.indexOf('function IsThreatUnit('),threatEnd=body.indexOf('\nfunction ',threatStart+10);
    let threat=body.slice(threatStart,threatEnd);
    threat=once(threat,'    for (let k = 0; k < reachablePositions.length; k++) {',`
    if(environment.nativeCompute){
        const encoded=readHardNativeView(),nativeTeam=team&&encoded.teams.get(team.id),positions=Float64Array.from(reachablePositions,p=>p.row*appData.cols+p.col);
        const result=environment.nativeCompute.threat(encoded.view,positions,nativeTeam?nativeTeam.id:0,unitHasStandardAbility(cell.unit,'占领')?1:0,!buildingType?0:buildingType==='房子'?1:buildingType==='城堡'?2:3);
        if(!environment.verifyMovementBatch)return result;
        // 验证阶段保留完整上游分支，任一返回点均核对结果。
        const expected=(() => { ORIGINAL_THREAT_BODY })();
        if(result!==expected)throw Error('原生威胁过滤与原表达式不一致');
        return result;
    }
    for (let k = 0; k < reachablePositions.length; k++) {`);
    const loop=body.slice(threatStart,threatEnd);const original=loop.slice(loop.indexOf('    for (let k = 0; k < reachablePositions.length; k++) {'),loop.lastIndexOf('\n}'));
    threat=threat.replace('ORIGINAL_THREAT_BODY',original);
    return body.slice(0,threatStart)+threat+body.slice(threatEnd);
}
