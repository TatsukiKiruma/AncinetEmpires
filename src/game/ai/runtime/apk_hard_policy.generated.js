/**
 * APK 困难 AI 上游生成资产，禁止手工编辑。
 * 来源：aer-4.2.5.1-patch.apk.1 / assets/hard-ai/runtime.html。
 * 使用 tools/extract_apk_hard_runtime.mjs 重新生成；不调用页面初始化。
 */
export const APK_HARD_RUNTIME_HTML_SHA256 = '6076f354362f89c0a0abbcb10ef4de04d321f96aa7de90e61f0fb33a2ea883eb';
export const APK_HARD_RUNTIME_SCRIPT_SHA256 = 'aa5b88c45122e864c0ed34d61af74d49c5a8e76a76cdbf9bc27ec033ded2dad4';
export function instantiateApkHardPolicy(environment) {
const { document, window, Math, console, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, alert, confirm, prompt, fetch, XMLHttpRequest, WebSocket, FileReader, Blob, URL, localStorage, sessionStorage, navigator } = environment;

function createHardNativeCache(limit) {
    const entries=new Map();let bytes=0;
    return {
        get(key){const item=entries.get(key);return item?item.value:undefined;},
        set(key,value,payloadBytes){const size=payloadBytes+key.length*2+128,old=entries.get(key);if(old){bytes-=old.bytes;entries.delete(key);}if(size>limit)return;while(bytes+size>limit&&entries.size){const first=entries.keys().next().value;bytes-=entries.get(first).bytes;entries.delete(first);}entries.set(key,{value,bytes:size});bytes+=size;},
        clear(){entries.clear();bytes=0;},
        get size(){return entries.size;},get bytes(){return bytes;},limit
    };
}
function packHardNativeRange(positions) {
    const values=new Int16Array(positions.length*3);
    for(let i=0;i<positions.length;i++){const p=positions[i];values[i*3]=p.row;values[i*3+1]=p.col;values[i*3+2]=p.remaining;}
    return values;
}
function unpackHardNativeRange(values) {
    const result=[];for(let i=0;i<values.length;i+=3)result.push({row:values[i],col:values[i+1],remaining:values[i+2]});return result;
}

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
(function () {
    const originalGet = document.getElementById.bind(document);
    const standIns = Object.create(null);
    document.getElementById = function (id) {
        if (originalGet(id))
            return originalGet(id);
        if (!standIns[id])
            standIns[id] = document.createElement('input');
        return standIns[id];
    };
})();
const appData = {
    rows: 10,
    attackMode: false,
    attackTargets: [],
    healMode: false,
    healTargets: [],
    supportMode: false,
    supportTargets: [],
    summonMode: false,
    summonTargets: [],
    moveModeConsiderEnemyBlockers: true,
    fixedMockeryCoefficient: false,
    cols: 10,
    teams: [
        { id: 'blue', name: '蓝队', alliance: 1, playerType: 1, color: '#1296db', commanderPrice: 400, commanderLevel: 0, commanderExp: 0 },
        { id: 'red', name: '红队', alliance: 1, playerType: 1, color: '#e53e3e', commanderPrice: 400, commanderLevel: 0, commanderExp: 0 },
        { id: 'green', name: '绿队', alliance: 1, playerType: 2, color: '#38a169', commanderPrice: 400, commanderLevel: 0, commanderExp: 0 },
        { id: 'black', name: '黑队', alliance: 2, playerType: 3, color: '#1a202c', commanderPrice: 400, commanderLevel: 0, commanderExp: 0 },
        { id: 'purple', name: '紫队', alliance: 2, playerType: 0, color: '#805ad5', commanderPrice: 400, commanderLevel: 0, commanderExp: 0 },
        { id: 'orange', name: '黄队', alliance: 2, playerType: 0, color: '#ed8936', commanderPrice: 400, commanderLevel: 0, commanderExp: 0 }
    ],
    gold: 0,
    terrains: [
        { id: 'plain', name: "平原", defense: 5, moveCost: 1, owner: "", heal: 0, income: 0, svg: '<svg width="15" height="15" viewBox="0 0 100 100"><rect width="100" height="100" fill="none" stroke="#808080" stroke-width="3"/></svg>' },
        { id: 'water', name: "水", defense: 0, moveCost: 3, owner: "", heal: 0, income: 0, svg: '<svg width="15" height="15" viewBox="0 0 100 100"><path d="M10,60 C40,40 70,80 90,60" fill="none" stroke="#808080" stroke-width="3"/></svg>' },
        { id: 'house', name: "房子", defense: 15, moveCost: 1, owner: "", heal: 20, income: 50, svg: '<svg width="15" height="15" viewBox="0 0 100 100"><polygon points="10,40 50,10 90,40 90,90 10,90" fill="none" stroke="currentColor" stroke-width="4"/></svg>' },
        { id: 'castle', name: "城堡", defense: 15, moveCost: 1, owner: "", heal: 20, income: 100, svg: '<svg width="15" height="15" viewBox="0 0 100 100"><polygon points="10,10 90,10 90,90 70,90 70,40 30,40 30,90 10,90" fill="none" stroke="currentColor" stroke-width="4"/></svg>' },
        { id: 'rundown', name: "破房", defense: 10, moveCost: 1, owner: "", heal: 0, income: 0, svg: '<svg width="15" height="15" viewBox="0 0 100 100"><rect x="25" y="55" width="50" height="45" fill="none" stroke="#808080" stroke-width="2" stroke-dasharray="2,1"/><line x1="40" y1="75" x2="40" y2="100" stroke="#808080" stroke-width="2"/><line x1="60" y1="75" x2="60" y2="100" stroke="#808080" stroke-width="2"/><line x1="40" y1="100" x2="60" y2="100" stroke="#808080" stroke-width="2"/><line x1="30" y1="60" x2="40" y2="70" stroke="#808080" stroke-width="2"/><line x1="70" y1="65" x2="60" y2="75" stroke="#808080" stroke-width="2"/></svg>' },
        { id: 'forest', name: "树林", defense: 10, moveCost: 2, owner: "", heal: 0, income: 0, svg: '<svg width="15" height="15" viewBox="0 0 100 100"><polygon points="50,10 20,40 80,40" fill="none" stroke="#808080" stroke-width="3"/><line x1="50" y1="10" x2="50" y2="90" fill="none" stroke="#808080" stroke-width="4"/><polygon points="50,40 20,70 80,70" fill="none" stroke="#808080" stroke-width="3"/></svg>' },
        { id: 'mountain', name: "高山", defense: 15, moveCost: 3, owner: "", heal: 0, income: 0, svg: '<svg width="15" height="15" viewBox="0 0 100 100"><polygon points="10,90 50,20 90,90" fill="none" stroke="#808080" stroke-width="3"/></svg>' },
        { id: 'hill', name: "山丘", defense: 10, moveCost: 2, owner: "", heal: 0, income: 0, svg: '<svg width="15" height="15" viewBox="0 0 100 100"><polygon points="10,90 50,60 90,90" fill="none" stroke="#808080" stroke-width="3"/></svg>' },
        { id: 'temple', name: "神庙", defense: 10, moveCost: 1, owner: "", heal: 20, income: 0, svg: '<svg width="15" height="15" viewBox="0 0 100 100"><rect x="25" y="50" width="50" height="50" fill="none" stroke="#808080" stroke-width="2"/><line x1="30" y1="30" x2="30" y2="50" stroke="#808080" stroke-width="2"/><line x1="70" y1="30" x2="70" y2="50" stroke="#808080" stroke-width="2"/><polygon points="20,50 50,20 80,50" fill="none" stroke="#808080" stroke-width="2"/><line x1="45" y1="30" x2="55" y2="30" stroke="#808080" stroke-width="2"/></svg>' },
        { id: 'road', name: "路", defense: 0, moveCost: 1, owner: "", heal: 0, income: 0, svg: '<svg width="15" height="15" viewBox="0 0 100 100"><rect width="100" height="100" fill="none" stroke="#808080" stroke-width="2"/><line x1="10" y1="50" x2="90" y2="50" stroke="#808080" stroke-width="2"/><line x1="30" y1="50" x2="30" y2="40" stroke="#808080" stroke-width="2"/><line x1="30" y1="50" x2="30" y2="60" stroke="#808080" stroke-width="2"/><line x1="70" y1="50" x2="70" y2="40" stroke="#808080" stroke-width="2"/><line x1="70" y1="50" x2="70" y2="60" stroke="#808080" stroke-width="2"/></svg>' },
        { id: 'bridge', name: "桥", defense: 0, moveCost: 1, owner: "", heal: 0, income: 0, svg: '<svg width="15" height="15" viewBox="0 0 100 100"><rect x="10" y="45" width="80" height="10" fill="none" stroke="#808080" stroke-width="2"/><line x1="30" y1="55" x2="30" y2="90" stroke="#808080" stroke-width="2"/><line x1="70" y1="55" x2="70" y2="90" stroke="#808080" stroke-width="2"/><line x1="10" y1="90" x2="90" y2="90" stroke="#808080" stroke-width="2"/><path d="M20,80 Q40,75 60,80 T100,80" fill="none" stroke="#808080" stroke-width="2"/></svg>' },
        { id: 'waterstone', name: "水石", defense: 10, moveCost: 3, owner: "", heal: 0, income: 0, svg: '<svg width="15" height="15" viewBox="0 0 100 100"><rect width="100" height="100" fill="none" stroke="#808080" stroke-width="2"/><circle cx="50" cy="50" r="25" fill="none" stroke="#808080" stroke-width="2"/><path d="M30,60 Q50,55 70,60" fill="none" stroke="#808080" stroke-width="2"/><path d="M25,70 Q50,65 75,70" fill="none" stroke="#808080" stroke-width="2"/><path d="M40,40 Q50,35 60,40" fill="none" stroke="#808080" stroke-width="2"/></svg>' },
        { id: 'watertemple', name: "水庙", defense: 10, moveCost: 3, owner: "", heal: 20, income: 0, svg: '<svg width="15" height="15" viewBox="0 0 100 100"><rect x="25" y="50" width="50" height="40" fill="none" stroke="#808080" stroke-width="2"/><line x1="30" y1="30" x2="30" y2="50" stroke="#808080" stroke-width="2"/><line x1="70" y1="30" x2="70" y2="50" stroke="#808080" stroke-width="2"/><polygon points="20,50 50,20 80,50" fill="none" stroke="#808080" stroke-width="2"/><path d="M20,90 Q40,85 60,90 T100,90" fill="none" stroke="#808080" stroke-width="2"/><path d="M15,80 Q35,75 55,80 T95,80" fill="none" stroke="#808080" stroke-width="2"/></svg>' },
        { id: 'airport', name: "机场", defense: 20, moveCost: 3, owner: "", heal: 0, income: 0, svg: '<svg width="15" height="15" viewBox="0 0 100 100"><rect width="100" height="100" fill="none" stroke="#808080" stroke-width="2"/><rect x="20" y="45" width="60" height="10" fill="none" stroke="#808080" stroke-width="2"/><path d="M45,35 L55,45 L45,55 Z" fill="none" stroke="#808080" stroke-width="2"/><line x1="20" y1="45" x2="20" y2="55" stroke="#808080" stroke-width="2"/><line x1="80" y1="45" x2="80" y2="55" stroke="#808080" stroke-width="2"/><line x1="10" y1="60" x2="90" y2="60" fill="none" stroke="#808080" stroke-width="2" stroke-dasharray="3,2"/></svg>' },
        { id: 'bathtub', name: "澡盆", defense: 10, moveCost: 1, owner: "", heal: 20, income: 0, svg: '<svg width="15" height="15" viewBox="0 0 100 100"><ellipse cx="50" cy="55" rx="40" ry="25" fill="none" stroke="#808080" stroke-width="2"/><path d="M20,55 Q50,50 80,55" fill="none" stroke="#808080" stroke-width="2"/><line x1="20" y1="55" x2="20" y2="75" stroke="#808080" stroke-width="2"/><line x1="80" y1="55" x2="80" y2="75" stroke="#808080" stroke-width="2"/></svg>' },
        { id: 'leftwing', name: "左翼", defense: 5, moveCost: 1, owner: "", heal: 0, income: 0, svg: '<svg width="15" height="15" viewBox="0 0 100 100"><path d="M80,50 L50,20 L20,50 L50,80 Z" fill="none" stroke="#808080" stroke-width="2"/><line x1="50" y1="20" x2="50" y2="80" stroke="#808080" stroke-width="2"/></svg>' },
        { id: 'rightwing', name: "右翼", defense: 5, moveCost: 1, owner: "", heal: 0, income: 0, svg: '<svg width="15" height="15" viewBox="0 0 100 100"><path d="M20,50 L50,20 L80,50 L50,80 Z" fill="none" stroke="#808080" stroke-width="2"/><line x1="50" y1="20" x2="50" y2="80" stroke="#808080" stroke-width="2"/></svg>' },
        { id: 'tail', name: "机尾", defense: 10, moveCost: 1, owner: "", heal: 0, income: 0, svg: '<svg width="15" height="15" viewBox="0 0 100 100"><polygon points="40,20 60,20 70,80 30,80" fill="none" stroke="#808080" stroke-width="2"/><line x1="50" y1="20" x2="50" y2="80" stroke="#808080" stroke-width="2"/></svg>' }
    ],
    units: [
        { id: 'infantry', name: "士兵", abbreviation: "兵", value: 150, attack: 55, physDef: 5, magicDef: 5, type: "物理",
            atkUp: 10, hpUp: 0, minRange: 1, maxRange: 1, move: 4, population: 1, abilities: ["占领", "修复"] },
        { id: 'ghost', name: "幽灵", abbreviation: "幽", value: 200, attack: 50, physDef: 5, magicDef: 15, type: "魔法",
            atkUp: 10, hpUp: 0, minRange: 1, maxRange: 1, move: 4, population: 1, abilities: ["空军", "亡灵", "死亡收割者"] },
        { id: 'mermaid', name: "人鱼", abbreviation: "鱼", value: 200, attack: 40, physDef: 0, magicDef: 0, type: "物理",
            atkUp: 10, hpUp: 0, minRange: 1, maxRange: 2, move: 4, population: 1, abilities: ["水之子", "占领", "修复"] },
        { id: 'archer', name: "弓箭手", abbreviation: "弓", value: 250, attack: 45, physDef: 5, magicDef: 5, type: "物理",
            atkUp: 10, hpUp: 0, minRange: 2, maxRange: 3, move: 4, population: 1, abilities: ["神射手"] },
        { id: 'Slime', name: "史莱姆", abbreviation: "史", value: 250, attack: 50, physDef: 40, magicDef: -10, type: "魔法",
            atkUp: 10, hpUp: 5, minRange: 1, maxRange: 1, move: 4, population: 1, abilities: ["复原"] },
        { id: 'waterelement', name: "水元素", abbreviation: "水", value: 300, attack: 60, physDef: 15, magicDef: 15, type: "物理",
            atkUp: 10, hpUp: 0, minRange: 1, maxRange: 1, move: 4, population: 1, abilities: ["水之子"] },
        { id: 'mage', name: "黑法", abbreviation: "法", value: 300, attack: 50, physDef: 0, magicDef: 20, type: "魔法",
            atkUp: 10, hpUp: 0, minRange: 1, maxRange: 2, move: 4, population: 1, abilities: ["致盲"] },
        { id: 'witch', name: "女巫", abbreviation: "巫", value: 400, attack: 45, physDef: 0, magicDef: 40, type: "魔法",
            atkUp: 5, hpUp: 0, minRange: 1, maxRange: 2, move: 4, population: 2, abilities: ["召唤"] },
        { id: 'healer', name: "圣骑", abbreviation: "奶", value: 400, attack: 50, physDef: 10, magicDef: 10, type: "物理",
            atkUp: 5, hpUp: 0, minRange: 1, maxRange: 1, move: 4, population: 2, abilities: ["占领", "治疗"] },
        { id: 'elf', name: "精灵", abbreviation: "精", value: 500, attack: 55, physDef: 20, magicDef: 30, type: "魔法",
            atkUp: 5, hpUp: 0, minRange: 1, maxRange: 2, move: 4, population: 2, abilities: ["森林之子", "空军", "净化光环"] },
        { id: 'rampage', name: "狂战", abbreviation: "狂", value: 500, attack: 70, physDef: 20, magicDef: 10, type: "物理",
            atkUp: 10, hpUp: 0, minRange: 1, maxRange: 1, move: 5, population: 2, abilities: ["反击风暴", "战意", "大地之子"] },
        { id: 'wolf', name: "狼", abbreviation: "狼", value: 600, attack: 75, physDef: 20, magicDef: 10, type: "物理",
            atkUp: 10, hpUp: 0, minRange: 1, maxRange: 1, move: 6, population: 3, abilities: ["中毒", "大地之子", "突击部队"] },
        { id: 'rock', name: "石头人", abbreviation: "石", value: 600, attack: 55, physDef: 30, magicDef: 10, type: "物理",
            atkUp: 5, hpUp: 25, minRange: 1, maxRange: 1, move: 5, population: 3, abilities: ["山之子", "远程减半", "虚弱"] },
        { id: 'ice', name: "冰", abbreviation: "冰", value: 600, attack: 55, physDef: 10, magicDef: 20, type: "魔法",
            atkUp: 10, hpUp: 10, minRange: 1, maxRange: 3, move: 4, population: 3, abilities: ["水之子", "复原"] },
        { id: 'druid', name: "德鲁伊", abbreviation: "德", value: 600, attack: 40, physDef: 0, magicDef: 30, type: "魔法",
            atkUp: 5, hpUp: 0, minRange: 1, maxRange: 2, move: 4, population: 3, abilities: ["鼓舞", "支援", "大地之子"] },
        { id: 'catapult', name: "投石车", abbreviation: "投", value: 800, attack: 60, physDef: 5, magicDef: 5, type: "物理",
            atkUp: 10, hpUp: 0, minRange: 3, maxRange: 5, move: 3, population: 4, abilities: ["破坏者"] },
        { id: 'wolfshoot', name: "狼射", abbreviation: "射", value: 800, attack: 60, physDef: 20, magicDef: 10, type: "物理",
            atkUp: 10, hpUp: 0, minRange: 1, maxRange: 3, move: 6, population: 4, abilities: ["神射手", "森林之子", "致盲", "突击部队"] },
        { id: 'dragon', name: "龙", abbreviation: "龙", value: 1000, attack: 70, physDef: 25, magicDef: 25, type: "魔法",
            atkUp: 10, hpUp: 0, minRange: 1, maxRange: 2, move: 6, population: 5, abilities: ["空军", "远程减半", "近战大师", "突击部队"] },
        { id: 'commander', name: "指挥官", abbreviation: "王", value: 600, attack: 60, physDef: 20, magicDef: 20, type: "物理",
            atkUp: 10, hpUp: 0, minRange: 1, maxRange: 1, move: 4, population: 0, abilities: ["占领", "修复", "城主"] },
        { id: 'skeleton', name: "骷髅", abbreviation: "骷", value: 150, attack: 40, physDef: 5, magicDef: 5, type: "物理",
            atkUp: 10, hpUp: 0, minRange: 1, maxRange: 1, move: 3, population: 0, abilities: ["亡灵", "中毒"] }
    ],
    gridData: [],
    selectedTerrain: null,
    selectedUnit: null,
    selectedMarker: null,
    currentMoveTeam: null,
    currentMoveAction: null,
    recruitmentMove: null,
    moveModeTurnHistory: [],
    moveModeTurnStartSnapshot: null,
    moveModeLastCommittedSnapshot: null,
    moveModeHistoryTeamId: null,
    moveModeCompletedTurnHistory: [],
    moveModeRecordActions: false,
    moveModeRecordedActions: [],
    moveModePendingActionRecord: null,
    demoTeamTurn: null,
    demoTeamLoopToken: 0,
    demoEnemyMovementBlocking: false,
    demoAllianceSession: null,
    demoAllianceResults: [],
    demoAllianceViewing: null,
    demoAllianceActionSink: null,
    demoUnitTraceCounter: 0,
    moveDebugSession: null,
    selectedCell: null,
    displaySettings: {
        showTerrain: true,
        showUnits: true,
        showUnitLevel: true,
        showUnitHealth: true,
        showUnitStatus: true,
        showGridCoordinates: false
    },
    activePanel: 'mapConfig',
    calculationResults: null,
    selectedAttackPosition: null,
    highlightedAttackTargets: [],
    dragState: {
        isDragging: false,
        dragStart: null,
        dragUnit: null,
        dragPreview: null
    },
    formatBrushState: {
        active: false,
        brushTeam: '',
        brushLevel: '',
        brushHealth: '',
        brushExp: '',
        brushStatus: '',
        brushStatusTurns: '',
        brushStandby: ''
    }
};
const standardUnitDefinitions = appData.units.map(unit => ({
    ...unit,
    abilities: [...(unit.abilities || [])]
}));
function cloneStandardUnitDefinitions() {
    return standardUnitDefinitions.map(unit => ({
        ...unit,
        abilities: [...(unit.abilities || [])]
    }));
}
function hasValidUnitDefinitions(units) {
    return Array.isArray(units) && units.some(unit => unit && typeof unit === 'object' && typeof unit.id === 'string' && typeof unit.abbreviation === 'string');
}
function getStandardUnitDefinition(unitId) {
    return standardUnitDefinitions.find(unit => unit.id === unitId);
}
function getUnitDefinition(unitId) {
    return (appData.units || []).find(unit => unit && unit.id === unitId) || getStandardUnitDefinition(unitId);
}
function unitHasStandardAbility(unitId, ability) {
    const standardUnit = getStandardUnitDefinition(unitId);
    return !!(standardUnit && standardUnit.abilities && standardUnit.abilities.includes(ability));
}
const WaterTerrain = ["水", "桥", "水石", "水庙"];
const MountainTerrain = ["高山", "山丘", "水石"];
const debuff = ["中毒", "致盲", "虚弱"];
const STATUS_DEFAULT_TURNS = {
    '无': 0,
    '中毒': 2,
    '致盲': 1,
    '虚弱': 1,
    '鼓舞': 0
};
function getDefaultStatusTurns(status) {
    return STATUS_DEFAULT_TURNS[status || '无'] ?? 0;
}
function normalizeUnitStatusFields(cell) {
    if (!cell)
        return;
    const status = cell.unitStatus || '无';
    cell.unitStatus = status;
    if (status === '无' || status === '死亡') {
        cell.unitStatusTurns = 0;
        return;
    }
    const parsedTurns = parseInt(cell.unitStatusTurns);
    cell.unitStatusTurns = Number.isInteger(parsedTurns) && parsedTurns >= 0
        ? parsedTurns
        : getDefaultStatusTurns(status);
}
function setUnitStatusDirect(cell, status, turns = null) {
    if (!cell)
        return;
    const nextStatus = status || '无';
    cell.unitStatus = nextStatus;
    if (nextStatus === '无' || nextStatus === '死亡') {
        cell.unitStatusTurns = 0;
        return;
    }
    const parsedTurns = parseInt(turns);
    cell.unitStatusTurns = Number.isInteger(parsedTurns) && parsedTurns >= 0
        ? parsedTurns
        : getDefaultStatusTurns(nextStatus);
}
function canApplyUnitStatus(currentStatus, nextStatus) {
    const current = currentStatus || '无';
    return current === '无' || current === nextStatus;
}
function applyUnitStatus(cell, status) {
    if (!cell || !status || status === '无')
        return false;
    normalizeUnitStatusFields(cell);
    const currentStatus = cell.unitStatus || '无';
    if (!canApplyUnitStatus(currentStatus, status))
        return false;
    setUnitStatusDirect(cell, status);
    return true;
}
function clearUnitStatus(cell) {
    setUnitStatusDirect(cell, '无', 0);
}
function getStatusDisplayText(cell) {
    if (!cell)
        return '无';
    normalizeUnitStatusFields(cell);
    const status = cell.unitStatus || '无';
    if (status === '无' || status === '死亡')
        return status;
    return status + (cell.unitStatusTurns ?? getDefaultStatusTurns(status));
}
const elements = {
    mapConfigBtn: document.getElementById('mapConfigBtn'),
    fullMapCalcBtn: document.getElementById('fullMapCalcBtn'),
    singleUnitCalcBtn: document.getElementById('singleUnitCalcBtn'),
    demoModeBtn: document.getElementById('demoModeBtn'),
    moveModeBtn: document.getElementById('moveModeBtn'),
    mapConfigPanel: document.getElementById('mapConfigPanel'),
    mapBasicSettingsTab: document.getElementById('mapBasicSettingsTab'),
    mapEditTab: document.getElementById('mapEditTab'),
    fullMapCalcPanel: document.getElementById('fullMapCalcPanel'),
    fullMapDisplayTab: document.getElementById('fullMapDisplayTab'),
    fullMapOverviewTab: document.getElementById('fullMapOverviewTab'),
    singleUnitCalcPanel: document.getElementById('singleUnitCalcPanel'),
    demoModePanel: document.getElementById('demoModePanel'),
    moveModePanel: document.getElementById('moveModePanel'),
    endMoveTurnBtn: document.getElementById('endMoveTurnBtn'),
    undoMoveStepBtn: document.getElementById('undoMoveStepBtn'),
    restartMoveTurnBtn: document.getElementById('restartMoveTurnBtn'),
    refreshMoveTargetBtn: document.getElementById('refreshMoveTargetBtn'),
    surrenderMoveTeamBtn: document.getElementById('surrenderMoveTeamBtn'),
    moveModeRecordActionsToggle: document.getElementById('moveModeRecordActionsToggle'),
    exportMoveModeActionsBtn: document.getElementById('exportMoveModeActionsBtn'),
    moveModeActionsRecordStatus: document.getElementById('moveModeActionsRecordStatus'),
    moveModeCurrentTeam: document.getElementById('moveModeCurrentTeam'),
    moveModeRoundInput: document.getElementById('moveModeRoundInput'),
    moveModeEnemyBlockerToggle: document.getElementById('moveModeEnemyBlockerToggle'),
    fixedMockeryCoefficientToggle: document.getElementById('fixedMockeryCoefficientToggle'),
    moveModeTeamStats: document.getElementById('moveModeTeamStats'),
    moveModeHelp: document.getElementById('moveModeHelp'),
    moveModeSelectedUnit: document.getElementById('moveModeSelectedUnit'),
    selectedUnitName: document.getElementById('selectedUnitName'),
    selectedUnitTeam: document.getElementById('selectedUnitTeam'),
    selectedUnitLevel: document.getElementById('selectedUnitLevel'),
    selectedUnitHp: document.getElementById('selectedUnitHp'),
    selectedUnitStatus: document.getElementById('selectedUnitStatus'),
    selectedUnitWait: document.getElementById('selectedUnitWait'),
    gridContainer: document.getElementById('gridContainer'),
    rowCount: document.getElementById('rowCount'),
    colCount: document.getElementById('colCount'),
    applyGridSize: document.getElementById('applyGridSize'),
    teamConfigs: document.getElementById('teamConfigs'),
    goldInput: document.getElementById('goldInput'),
    toggleTerrainConfig: document.getElementById('toggleTerrainConfig'),
    terrainConfigContent: document.getElementById('terrainConfigContent'),
    terrainTeam: document.getElementById('terrainTeam'),
    terrainList: document.getElementById('terrainList'),
    terrainInfo: document.getElementById('terrainInfo'),
    terrainSvgInput: document.getElementById('terrainSvgInput'),
    updateTerrainSvg: document.getElementById('updateTerrainSvg'),
    applyTerrainToAllEmpty: document.getElementById('applyTerrainToAllEmpty'),
    toggleUnitConfig: document.getElementById('toggleUnitConfig'),
    unitConfigContent: document.getElementById('unitConfigContent'),
    unitTeam: document.getElementById('unitTeam'),
    unitList: document.getElementById('unitList'),
    unitInfo: document.getElementById('unitInfo'),
    unitLevel: document.getElementById('unitLevel'),
    unitHealth: document.getElementById('unitHealth'),
    unitExp: document.getElementById('unitExp'),
    unitStatus: document.getElementById('unitStatus'),
    unitStatusTurns: document.getElementById('unitStatusTurns'),
    unitAbbreviation: document.getElementById('unitAbbreviation'),
    updateUnitInfo: document.getElementById('updateUnitInfo'),
    tombstoneRounds: document.getElementById('tombstoneRounds'),
    tombstoneTeam: document.getElementById('tombstoneTeam'),
    selectTombstoneMarker: document.getElementById('selectTombstoneMarker'),
    tombstoneMarkerStatus: document.getElementById('tombstoneMarkerStatus'),
    showTerrain: document.getElementById('showTerrain'),
    showUnits: document.getElementById('showUnits'),
    showUnitLevel: document.getElementById('showUnitLevel'),
    showUnitHealth: document.getElementById('showUnitHealth'),
    showUnitStatus: document.getElementById('showUnitStatus'),
    showGridCoordinates: document.getElementById('showGridCoordinates'),
    saveLayout: document.getElementById('saveLayout'),
    loadLayout: document.getElementById('loadLayout'),
    exportCompactLayout: document.getElementById('exportCompactLayout'),
    importCompactLayout: document.getElementById('importCompactLayout'),
    removeAllUnits: document.getElementById('removeAllUnits'),
    layoutFileInput: document.getElementById('layoutFileInput'),
    compactLayoutFileInput: document.getElementById('compactLayoutFileInput'),
    exportAemJson: document.getElementById('exportAemJson'),
    importAemJson: document.getElementById('importAemJson'),
    aemFileInput: document.getElementById('aemFileInput'),
    mirrorAxis: document.getElementById('mirrorAxis'),
    mirrorSourceSide: document.getElementById('mirrorSourceSide'),
    executeMirror: document.getElementById('executeMirror'),
    copyAxis: document.getElementById('copyAxis'),
    copySourceSide: document.getElementById('copySourceSide'),
    executeCopy: document.getElementById('executeCopy'),
    toggleMirrorCopy: document.getElementById('toggleMirrorCopy'),
    mirrorCopyContent: document.getElementById('mirrorCopyContent'),
    areaList: document.getElementById('areaList'),
    areaType: document.getElementById('areaType'),
    rectParams: document.getElementById('rectParams'),
    diamondParams: document.getElementById('diamondParams'),
    areaStartRow: document.getElementById('areaStartRow'),
    areaStartCol: document.getElementById('areaStartCol'),
    areaEndRow: document.getElementById('areaEndRow'),
    areaEndCol: document.getElementById('areaEndCol'),
    diamondCenterRow: document.getElementById('diamondCenterRow'),
    diamondCenterCol: document.getElementById('diamondCenterCol'),
    diamondManhattanDist: document.getElementById('diamondManhattanDist'),
    processTeam: document.getElementById('processTeam'),
    teamSelect: document.getElementById('teamSelect'),
    areaTargetTeam: document.getElementById('areaTargetTeam'),
    processType: document.getElementById('processType'),
    typeSelect: document.getElementById('typeSelect'),
    areaNewUnitType: document.getElementById('areaNewUnitType'),
    processLevel: document.getElementById('processLevel'),
    levelInput: document.getElementById('levelInput'),
    areaNewLevel: document.getElementById('areaNewLevel'),
    processStatus: document.getElementById('processStatus'),
    statusSelect: document.getElementById('statusSelect'),
    areaNewStatus: document.getElementById('areaNewStatus'),
    areaNewStatusTurns: document.getElementById('areaNewStatusTurns'),
    processHealth: document.getElementById('processHealth'),
    healthInput: document.getElementById('healthInput'),
    areaNewHealth: document.getElementById('areaNewHealth'),
    addAreaBtn: document.getElementById('addAreaBtn'),
    importAreaConfigBtn: document.getElementById('importAreaConfigBtn'),
    areaConfigFileInput: document.getElementById('areaConfigFileInput'),
    processAllAreasBtn: document.getElementById('processAllAreasBtn'),
    saveAreaConfigBtn: document.getElementById('saveAreaConfigBtn'),
    clearAreasBtn: document.getElementById('clearAreasBtn'),
    areaStatus: document.getElementById('areaStatus'),
    processDelete: document.getElementById('processDelete'),
    deleteSelect: document.getElementById('deleteSelect'),
    deleteUnitType: document.getElementById('deleteUnitType'),
    calculateOverview: document.getElementById('calculateOverview'),
    totalHouses: document.getElementById('totalHouses'),
    priorityBasicRecruitSummary: document.getElementById('priorityBasicRecruitSummary'),
    waterAreaPercentage: document.getElementById('waterAreaPercentage'),
    mermaidRecruitLimit: document.getElementById('mermaidRecruitLimit'),
    waterelementRecruitLimit: document.getElementById('waterelementRecruitLimit'),
    iceRecruitLimit: document.getElementById('iceRecruitLimit'),
    plainAreaPercentage: document.getElementById('plainAreaPercentage'),
    slimeRecruitLimit: document.getElementById('slimeRecruitLimit'),
    totalUnits: document.getElementById('totalUnits'),
    totalPopulation: document.getElementById('totalPopulation'),
    applyGridDisplay: document.getElementById('applyGridDisplay'),
    recruitmentWeights: document.getElementById('recruitmentWeights'),
    blueTeamIncome: document.getElementById('blueTeamIncome'),
    redTeamIncome: document.getElementById('redTeamIncome'),
    greenTeamIncome: document.getElementById('greenTeamIncome'),
    blackTeamIncome: document.getElementById('blackTeamIncome'),
    purpleTeamIncome: document.getElementById('purpleTeamIncome'),
    orangeTeamIncome: document.getElementById('orangeTeamIncome'),
    blueTeamUnits: document.getElementById('blueTeamUnits'),
    redTeamUnits: document.getElementById('redTeamUnits'),
    greenTeamUnits: document.getElementById('greenTeamUnits'),
    blackTeamUnits: document.getElementById('blackTeamUnits'),
    purpleTeamUnits: document.getElementById('purpleTeamUnits'),
    orangeTeamUnits: document.getElementById('orangeTeamUnits'),
    blueTeamPopulation: document.getElementById('blueTeamPopulation'),
    redTeamPopulation: document.getElementById('redTeamPopulation'),
    greenTeamPopulation: document.getElementById('greenTeamPopulation'),
    blackTeamPopulation: document.getElementById('blackTeamPopulation'),
    purpleTeamPopulation: document.getElementById('purpleTeamPopulation'),
    orangeTeamPopulation: document.getElementById('orangeTeamPopulation'),
    noUnitSelected: document.getElementById('noUnitSelected'),
    selectedUnitInfo: document.getElementById('selectedUnitInfo'),
    selectedUnitType: document.getElementById('selectedUnitType'),
    selectedUnitTeam: document.getElementById('selectedUnitTeam'),
    selectedUnitLevel: document.getElementById('selectedUnitLevel'),
    selectedUnitHealth: document.getElementById('selectedUnitHealth'),
    calculateSingleUnit: document.getElementById('calculateSingleUnit'),
    singleUnitResults: document.getElementById('singleUnitResults'),
    singleUnitResultsContent: document.getElementById('singleUnitResultsContent'),
    importUnitsBtn: document.getElementById('importUnitsBtn'),
    clearImportedUnitsBtn: document.getElementById('clearImportedUnitsBtn'),
    unitImportFileInput: document.getElementById('unitImportFileInput'),
    importStatus: document.getElementById('importStatus'),
    resetUnitInfo: document.getElementById('resetUnitInfo'),
    attackTargetsDetails: document.getElementById('attackTargetsDetails'),
    attackTargetsList: document.getElementById('attackTargetsList'),
    selectedPositionInfo: document.getElementById('selectedPositionInfo'),
    applyTerrainToRect: document.getElementById('applyTerrainToRect'),
    rectStartRow: document.getElementById('rectStartRow'),
    rectStartCol: document.getElementById('rectStartCol'),
    rectEndRow: document.getElementById('rectEndRow'),
    rectEndCol: document.getElementById('rectEndCol'),
    toggleFormatBrush: document.getElementById('toggleFormatBrush'),
    brushTeam: document.getElementById('brushTeam'),
    brushLevel: document.getElementById('brushLevel'),
    brushHealth: document.getElementById('brushHealth'),
    brushExp: document.getElementById('brushExp'),
    brushStatus: document.getElementById('brushStatus'),
    brushStatusTurns: document.getElementById('brushStatusTurns'),
    brushStandby: document.getElementById('brushStandby'),
    demoSelectedUnitInfo: document.getElementById('demoSelectedUnitInfo'),
    startDemoBtn: document.getElementById('startDemoBtn'),
    demoUnitSection: document.getElementById('demoUnitSection'),
    demoTeamSection: document.getElementById('demoTeamSection'),
    demoAllianceSection: document.getElementById('demoAllianceSection'),
    demoTeamSelect: document.getElementById('demoTeamSelect'),
    demoAllianceStartTeamSelect: document.getElementById('demoAllianceStartTeamSelect'),
    demoAllianceCountInput: document.getElementById('demoAllianceCountInput'),
    demoAlliancePlayerPolicy: document.getElementById('demoAlliancePlayerPolicy'),
    demoAllianceSkipAnimation: document.getElementById('demoAllianceSkipAnimation'),
    startAllianceDemoBtn: document.getElementById('startAllianceDemoBtn'),
    demoAlliancePlayBtn: document.getElementById('demoAlliancePlayBtn'),
    demoAllianceStepBtn: document.getElementById('demoAllianceStepBtn'),
    demoAllianceUndoBtn: document.getElementById('demoAllianceUndoBtn'),
    demoAlliancePrevRoundBtn: document.getElementById('demoAlliancePrevRoundBtn'),
    demoAllianceNextRoundBtn: document.getElementById('demoAllianceNextRoundBtn'),
    demoAllianceStatus: document.getElementById('demoAllianceStatus'),
    stopAllianceDemoBtn: document.getElementById('stopAllianceDemoBtn'),
    demoRoundInput: document.getElementById('demoRoundInput'),
    demoSkipAnimation: document.getElementById('demoSkipAnimation'),
    demoScoreType: document.getElementById('demoScoreType'),
    demoTeamStatus: document.getElementById('demoTeamStatus'),
    demoKillStats: document.getElementById('demoKillStats'),
    startTeamDemoBtn: document.getElementById('startTeamDemoBtn'),
    demoPauseBtn: document.getElementById('demoPauseBtn'),
    demoStepBtn: document.getElementById('demoStepBtn'),
    demoUndoBtn: document.getElementById('demoUndoBtn'),
    demoNextPreview: document.getElementById('demoNextPreview'),
    hardAiInsightPanel: document.getElementById('hardAiInsightPanel'),
    hardAiInsightRefresh: document.getElementById('hardAiInsightRefresh'),
    hardAiInsightSummary: document.getElementById('hardAiInsightSummary'),
    hardAiInsightMap: document.getElementById('hardAiInsightMap'),
    hardAiInsightBuildings: document.getElementById('hardAiInsightBuildings'),
    hardAiInsightOrder: document.getElementById('hardAiInsightOrder'),
    demoResult: document.getElementById('demoResult'),
    demoResultContent: document.getElementById('demoResultContent'),
    moveModeActions: document.getElementById('moveModeActions'),
    actionButtons: document.getElementById('actionButtons'),
    moveDebugUploadBtn: document.getElementById('moveDebugUploadBtn'),
    moveDebugFileInput: document.getElementById('moveDebugFileInput'),
    moveDebugStatus: document.getElementById('moveDebugStatus'),
    moveDebugMode: document.getElementById('moveDebugMode'),
    startMoveDebugBtn: document.getElementById('startMoveDebugBtn'),
    moveDebugPrevBtn: document.getElementById('moveDebugPrevBtn'),
    moveDebugNextBtn: document.getElementById('moveDebugNextBtn'),
    moveDebugPlayBtn: document.getElementById('moveDebugPlayBtn'),
    moveDebugStopBtn: document.getElementById('moveDebugStopBtn'),
    moveDebugResults: document.getElementById('moveDebugResults')
};
let areas = [];
function initializeApp() {
    document.getElementById('rectStartRow').value = 1;
    document.getElementById('rectStartCol').value = 1;
    document.getElementById('rectEndRow').value = appData.rows;
    document.getElementById('rectEndCol').value = appData.cols;
    areas = [];
    renderAreaList();
    resetGridData(appData.rows, appData.cols);
    renderGrid();
    renderTeamConfigs();
    renderTerrainList();
    renderUnitList();
    renderDemoTeamSelect();
    updateDemoModeSections();
    bindEventListeners();
    initializeDragAndDrop();
}
function resetGridData(rows, cols) {
    appData.gridData = [];
    for (let i = 0; i < rows; i++) {
        const row = [];
        for (let j = 0; j < cols; j++) {
            row.push({
                terrain: null,
                terrainTeam: null,
                unit: null,
                unitTeam: null,
                unitLevel: 1,
                unitHealth: 100,
                unitExp: 0,
                unitStatus: '无',
                unitStatusTurns: 0,
                unitStandby: false,
                unitSupported: false,
                unitRegisteredCommander: false,
                pendingTombstone: null,
                tombstone: null,
            });
        }
        appData.gridData.push(row);
    }
}
function renderGrid() {
    elements.gridContainer.innerHTML = '';
    elements.gridContainer.style.gridTemplateColumns = `repeat(${appData.cols}, minmax(0, 1fr))`;
    elements.gridContainer.style.width = `${appData.cols * 32}px`;
    const moveModeAiSuggestedUnit = getMoveModeAiSuggestedUnit();
    const maxCalculationValue = Array.isArray(appData.calculationResults)
        ? Math.max(...appData.calculationResults
            .filter(result => Number.isFinite(result.value))
            .map(result => result.value))
        : null;
    const muteUnitInfoForActionOrder = Array.isArray(appData.calculationResults)
        && appData.calculationResults.some(result => result.displayOption === 'actionOrder');
    const isGridLabelDisplay = Array.isArray(appData.calculationResults)
        && appData.calculationResults.some(result => isGridLabelDisplayOption(result.displayOption));
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cellData = appData.gridData[i][j];
            const cell = document.createElement('div');
            cell.className = 'grid-cell relative';
            if (muteUnitInfoForActionOrder) {
                cell.classList.add('action-order-units-muted');
            }
            cell.dataset.row = i;
            cell.dataset.col = j;
            if (appData.selectedCell && appData.selectedCell.row === i && appData.selectedCell.col === j) {
                cell.classList.add('ring-2', 'ring-blue-500', 'bg-blue-50');
            }
            if (moveModeAiSuggestedUnit && moveModeAiSuggestedUnit.row === i && moveModeAiSuggestedUnit.col === j) {
                cell.style.backgroundColor = '#ccfbf1';
                const actionOrderMarker = document.createElement('div');
                actionOrderMarker.className = 'absolute inset-0 flex items-center justify-center pointer-events-none';
                actionOrderMarker.style.color = '#dc2626';
                actionOrderMarker.style.fontWeight = '800';
                actionOrderMarker.style.fontSize = '1rem';
                actionOrderMarker.style.zIndex = '35';
                actionOrderMarker.textContent = moveModeAiSuggestedUnit.actionOrder;
                cell.appendChild(actionOrderMarker);
            }
            if (appData.displaySettings.showGridCoordinates) {
                const coordinateElement = document.createElement('div');
                coordinateElement.className = 'grid-coordinate';
                coordinateElement.textContent = `${i + 1},${j + 1}`;
                cell.appendChild(coordinateElement);
            }
            if (cellData.terrain && appData.displaySettings.showTerrain) {
                const terrain = appData.terrains.find(t => t.id === cellData.terrain);
                if (terrain) {
                    const terrainElement = document.createElement('div');
                    terrainElement.className = 'terrain-svg absolute inset-0 flex items-center justify-center';
                    let color = '#808080';
                    if (cellData.terrainTeam) {
                        const team = appData.teams.find(t => t.id === cellData.terrainTeam);
                        if (team) {
                            color = team.color;
                        }
                    }
                    if (getOriginalTerrainRegion(terrain)) {
                        terrainElement.classList.add('terrain-original');
                        cell.classList.add('original-terrain-cell');
                    }
                    terrainElement.innerHTML = getTerrainVisualHtml(terrain, color, !!cellData.terrainTeam, i, j);
                    cell.appendChild(terrainElement);
                }
            }
            if (cellData.tombstone) {
                const tombstoneTeam = appData.teams.find(t => t.id === cellData.tombstone.team);
                const tombstoneElement = document.createElement('div');
                tombstoneElement.className = 'tombstone-marker';
                tombstoneElement.style.borderColor = tombstoneTeam ? tombstoneTeam.color : '#6b7280';
                tombstoneElement.style.color = tombstoneTeam ? tombstoneTeam.color : '#374151';
                tombstoneElement.textContent = cellData.tombstone.rounds === 1 ? '1' : '2';
                cell.appendChild(tombstoneElement);
            }
            if (cellData.unit && appData.displaySettings.showUnits) {
                const unit = getUnitDefinition(cellData.unit);
                if (unit) {
                    const unitElement = document.createElement('div');
                    unitElement.className = 'unit-info absolute inset-0 flex items-center justify-center font-bold';
                    const team = appData.teams.find(t => t.id === cellData.unitTeam);
                    if (team) {
                        unitElement.style.color = team.color;
                        unitElement.style.opacity = cellData.unitStandby ? '0.5' : '1';
                    }
                    else {
                        unitElement.style.color = '#000000';
                        unitElement.style.opacity = '1';
                    }
                    const unitNameLabel = document.createElement('span');
                    unitNameLabel.className = 'unit-name-label';
                    unitNameLabel.textContent = unit.abbreviation || '?';
                    unitElement.appendChild(unitNameLabel);
                    cell.appendChild(unitElement);
                    if (appData.displaySettings.showUnitLevel) {
                        const levelElement = document.createElement('div');
                        levelElement.className = 'unit-level absolute top-0 right-0 font-bold';
                        levelElement.style.color = team ? team.color : '#000000';
                        levelElement.style.opacity = cellData.unitStandby ? '0.5' : '0.8';
                        levelElement.textContent = cellData.unitLevel;
                        cell.appendChild(levelElement);
                    }
                    if (appData.displaySettings.showUnitHealth) {
                        const healthElement = document.createElement('div');
                        healthElement.className = 'unit-health absolute bottom-0 left-0 font-bold';
                        healthElement.style.color = team ? team.color : '#000000';
                        healthElement.style.opacity = cellData.unitStandby ? '0.5' : '0.8';
                        healthElement.textContent = cellData.unitHealth;
                        cell.appendChild(healthElement);
                    }
                    const expElement = document.createElement('div');
                    expElement.className = 'unit-exp absolute bottom-0 right-0 font-bold';
                    expElement.style.color = team ? team.color : '#000000';
                    expElement.style.opacity = cellData.unitStandby ? '0.5' : '0.8';
                    expElement.textContent = cellData.unitExp || 0;
                    cell.appendChild(expElement);
                    if (appData.displaySettings.showUnitStatus && cellData.unitStatus) {
                        const statusElement = document.createElement('div');
                        statusElement.className = 'unit-status absolute top-0 left-0 font-bold';
                        statusElement.style.color = team ? team.color : '#000000';
                        statusElement.style.opacity = cellData.unitStandby ? '0.5' : '0.8';
                        statusElement.textContent = getStatusDisplayText(cellData);
                        cell.appendChild(statusElement);
                    }
                }
            }
            if (appData.calculationResults) {
                const result = appData.calculationResults.find(r => r.row === i && r.col === j);
                if (result) {
                    if (result.details)
                        cell.title = result.details;
                    if (result.type === 'source') {
                        cell.style.boxShadow = '0 0 0 3px #3b82f6';
                        cell.style.backgroundColor = '#dbeafe';
                    }
                    else if (result.type === 'target') {
                        cell.style.boxShadow = '0 0 0 3px #f97316';
                        cell.style.backgroundColor = '#fed7aa';
                    }
                    else if (result.type === 'operationTarget') {
                        cell.style.boxShadow = '0 0 0 3px #22c55e';
                        cell.style.backgroundColor = '#bbf7d0';
                    }
                    else if (result.value !== null && (result.value !== 0 || result.showZero)) {
                        if (result.backgroundColor) {
                            cell.style.backgroundColor = result.backgroundColor;
                        }
                        const resultOverlay = document.createElement('div');
                        resultOverlay.className = 'result-overlay';
                        const resultValue = document.createElement('div');
                        const displayValue = result.displayFloor && Number.isFinite(result.value)
                            ? Math.floor(result.value)
                            : result.value;
                        resultValue.className = 'result-value';
                        if (!isGridLabelDisplay && Number.isFinite(maxCalculationValue) && result.value === maxCalculationValue) {
                            resultValue.classList.add('max-score');
                        }
                        if (result.displayText !== undefined) {
                            resultValue.textContent = result.displayText;
                            if (result.textColor)
                                resultValue.style.color = result.textColor;
                        }
                        else if (typeof result.value === 'number') {
                            resultValue.textContent = displayValue;
                        }
                        if (result.distanceDetails) {
                            resultValue.className = 'distance-details';
                            resultValue.innerHTML = `<div>${result.enemyDistance}</div><div>|</div><div>${result.allyDistance}</div>`;
                        }
                        else if (result.targetRow !== undefined && result.targetCol !== undefined) {
                            resultValue.innerHTML = `${displayValue}<br>(${result.targetRow + 1},${result.targetCol + 1})`;
                            if (!resultValue.classList.contains('max-score')) {
                                resultValue.style.fontSize = '0.4rem';
                            }
                        }
                        else {
                            resultValue.textContent = displayValue;
                        }
                        resultOverlay.appendChild(resultValue);
                        cell.appendChild(resultOverlay);
                    }
                }
            }
            cell.addEventListener('click', () => handleCellClick(i, j));
            if (appData.selectedAttackPosition && appData.selectedAttackPosition.row === i && appData.selectedAttackPosition.col === j) {
                cell.classList.add('highlight-attack-position');
            }
            if (appData.highlightedAttackTargets && appData.highlightedAttackTargets.some(target => target.row === i && target.col === j)) {
                cell.classList.add('highlight-attack-target');
            }
            elements.gridContainer.appendChild(cell);
        }
    }
    if (appData.activePanel === 'moveMode') {
        renderMoveModeTeamStats();
        updateMoveModeRefreshTargetButton();
    }
}
function isAiPlayerType(playerType) {
    return playerType === 2 || playerType === 3;
}
function isHardAiTeam(teamId) {
    return appData.teams.some(team => team.id === teamId && team.playerType === 3);
}
function renderTeamConfigs() {
    elements.teamConfigs.innerHTML = '';
    elements.teamConfigs.className = 'grid grid-cols-3 gap-2';
    ensureAllTeamCommanderPrices();
    if (elements.goldInput)
        elements.goldInput.value = appData.gold || 0;
    const createValue = (value) => {
        const valueEl = document.createElement('span');
        valueEl.className = 'min-w-0 flex-1 truncate text-right text-sm font-semibold text-gray-800';
        valueEl.textContent = value;
        return valueEl;
    };
    const createField = (label, control, options = {}) => {
        const wrapper = document.createElement('label');
        wrapper.className = `flex min-w-0 items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-1 ${options.className || ''}`;
        const labelEl = document.createElement('span');
        labelEl.className = 'shrink-0 text-[11px] leading-none text-gray-500';
        labelEl.textContent = label;
        if (!options.readonly) {
            control.className = 'min-w-0 flex-1 bg-transparent text-right text-sm font-semibold text-gray-900 outline-none';
        }
        wrapper.appendChild(labelEl);
        wrapper.appendChild(control);
        return wrapper;
    };
    appData.teams.forEach(team => {
        const commanderState = getTeamCommanderDisplayState(team.id);
        const teamConfig = document.createElement('div');
        teamConfig.className = 'rounded-md border border-gray-200 bg-gray-50/80 p-2 shadow-sm';
        const header = document.createElement('div');
        header.className = 'mb-2 flex items-center gap-2';
        const colorIndicator = document.createElement('div');
        colorIndicator.className = 'h-4 w-4 shrink-0 rounded-full';
        colorIndicator.style.backgroundColor = team.color;
        const teamName = document.createElement('span');
        teamName.className = 'min-w-0 flex-1 truncate text-sm font-semibold text-gray-900';
        teamName.textContent = team.name;
        const playerTypeSelect = document.createElement('select');
        playerTypeSelect.className = 'w-24 rounded border border-gray-200 bg-white px-1 py-0.5 text-xs font-medium outline-none';
        [
            { value: 0, text: '无' },
            { value: 1, text: '人' },
            { value: 2, text: '简版AI' },
            { value: 3, text: '困难AI' }
        ].forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.text;
            if (team.playerType === opt.value)
                option.selected = true;
            playerTypeSelect.appendChild(option);
        });
        playerTypeSelect.addEventListener('change', (e) => {
            team.playerType = parseInt(e.target.value);
            renderDemoTeamSelect();
            renderDemoAllianceStartTeamSelect();
            updateDemoControlButtons();
            updateMoveModeCurrentTeamLabel();
        });
        header.appendChild(colorIndicator);
        header.appendChild(teamName);
        header.appendChild(playerTypeSelect);
        const fields = document.createElement('div');
        fields.className = 'grid grid-cols-2 gap-1';
        const allianceInput = document.createElement('input');
        allianceInput.type = 'number';
        allianceInput.min = -1;
        allianceInput.value = team.alliance;
        allianceInput.addEventListener('change', (e) => {
            team.alliance = parseInt(e.target.value) || 1;
        });
        const teamGoldInput = document.createElement('input');
        teamGoldInput.type = 'number';
        teamGoldInput.min = 0;
        teamGoldInput.placeholder = '全局';
        teamGoldInput.value = team.gold === undefined || team.gold === null || team.gold === '' ? '' : team.gold;
        teamGoldInput.addEventListener('change', (e) => {
            if (e.target.value === '') {
                delete team.gold;
                return;
            }
            team.gold = Math.max(0, parseInt(e.target.value) || 0);
            e.target.value = team.gold;
        });
        const commanderPriceInput = document.createElement('input');
        commanderPriceInput.type = 'number';
        commanderPriceInput.min = 0;
        commanderPriceInput.step = 100;
        commanderPriceInput.value = ensureTeamCommanderPrice(team);
        commanderPriceInput.addEventListener('change', (e) => {
            team.commanderPrice = normalizeCommanderRecruitPrice(e.target.value);
            e.target.value = team.commanderPrice;
        });
        fields.appendChild(createField('联盟', allianceInput));
        fields.appendChild(createField('金币', teamGoldInput));
        fields.appendChild(createField('王价', commanderPriceInput));
        fields.appendChild(createField('王Lv', createValue(commanderState.level), { readonly: true }));
        fields.appendChild(createField('王Exp', createValue(commanderState.exp), { className: 'col-span-2', readonly: true }));
        teamConfig.appendChild(header);
        teamConfig.appendChild(fields);
        elements.teamConfigs.appendChild(teamConfig);
    });
    renderDemoTeamSelect();
}
const ORIGINAL_TERRAIN_REGIONS = Object.freeze({
    plain: [251, 168], water: [114, 278], house: [311, 142], castle: [336, 136],
    rundown: [401, 186], forest: [301, 217], mountain: [276, 192], hill: [301, 192],
    temple: [401, 161], road: [326, 192], bridge: [426, 186],
    waterstone: [401, 61], watertemple: [376, 36], airport: [261, 142],
    bathtub: [376, 161], leftwing: [426, 161], rightwing: [213, 118], tail: [286, 142]
});
const ORIGINAL_ROAD_REGIONS = Object.freeze({
    horizontal: [326, 192], vertical: [351, 186], cross: [276, 167],
    leftDown: [236, 143], leftUp: [301, 167], rightUp: [326, 167], rightDown: [376, 186]
});
const ORIGINAL_BRIDGE_VERTICAL_REGION = [351, 161];
const ORIGINAL_TERRAIN_DEFAULT_SVGS = new Map(appData.terrains.map(terrain => [terrain.id, terrain.svg]));
const ORIGINAL_BUILDING_OWNER_PIXELS = Object.freeze({
    house: [
        '..........DDD...........', '.........DLHLD..........', '........DMLHLMD.........',
        '.......DMMLHLDD.........', '......DMMMLHL...........', '.....DMMMMLHL...........',
        '....DMMMMMLHL....MD.....', '...DLMMMMMLHL....MLD....', '...DLMMMMMLHL....MLD....',
        '...DLMMMMMLHLM...MLD....', '...DLMMMMMLHLMM..MLD....', '...DLMMMMMLHLMMMMMLD....',
        '...DLMMMMLHHHLMMMMLD....', '...DLMMMLHDDDHLMMMLD....', '...DLMMLHD...DHLMMLD....',
        '...DLMLHD.....DHLMLD....', '...DLLHD.......DHLLD....', '...DLHD.........DHLD....',
        '...DHD...........DHD....', '........................', '........................',
        '........................', '........................', '........................'
    ],
    castle: [
        '........................', '........................', '........................',
        '........................', '........................', '.........DLLLLD.........',
        '..........HHHH..........', '..........LLLL..........', '..........MMMM..........',
        '..........MMMM..........', '..........MMMM..........', '..........MMMM..........',
        '...........MM...........', '........................', '........................',
        '........................', '........................', '........................',
        '........................', '........................', '........................',
        '.A....................A.', '..A..................A..', '...AA..............AA...'
    ]
});
const ORIGINAL_BUILDING_OWNER_CACHE = new Map();
function mixOriginalBuildingColor(color, target, amount) {
    const hex = color.slice(1);
    const channels = hex.length <= 4
        ? [...hex.slice(0, 3)].map(value => parseInt(value + value, 16))
        : [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
    return '#' + channels.map((value, index) => Math.round(value * (1 - amount) + target[index] * amount).toString(16).padStart(2, '0')).join('');
}
function getOriginalBuildingOwnerSvg(terrainId, color) {
    const cacheKey = `${terrainId}:${color}`;
    if (ORIGINAL_BUILDING_OWNER_CACHE.has(cacheKey))
        return ORIGINAL_BUILDING_OWNER_CACHE.get(cacheKey);
    const rows = ORIGINAL_BUILDING_OWNER_PIXELS[terrainId];
    if (!rows)
        return '';
    const shades = {
        M: color,
        D: mixOriginalBuildingColor(color, [15, 24, 32], 0.58),
        L: mixOriginalBuildingColor(color, [255, 255, 255], 0.32),
        H: mixOriginalBuildingColor(color, [255, 255, 255], 0.68),
        A: mixOriginalBuildingColor(color, [15, 24, 32], 0.4)
    };
    const paths = Object.fromEntries(Object.keys(shades).map(shade => [shade, []]));
    rows.forEach((pixels, y) => {
        for (let x = 0; x < pixels.length;) {
            const shade = pixels[x];
            if (shade === '.') {
                x++;
                continue;
            }
            const start = x;
            while (x < pixels.length && pixels[x] === shade)
                x++;
            paths[shade].push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
        }
    });
    const svg = `<svg class="original-terrain-owner-color" viewBox="0 0 24 24" aria-hidden="true">${Object.entries(paths).filter(([, segments]) => segments.length)
        .map(([shade, segments]) => `<path fill="${shades[shade]}" d="${segments.join('')}"/>`).join('')}</svg>`;
    ORIGINAL_BUILDING_OWNER_CACHE.set(cacheKey, svg);
    return svg;
}
function getOriginalTerrainRegion(terrain, row, col) {
    if (!terrain || terrain.svg !== ORIGINAL_TERRAIN_DEFAULT_SVGS.get(terrain.id))
        return null;
    if ((terrain.id === 'road' || terrain.id === 'bridge') && Number.isInteger(row) && Number.isInteger(col)) {
        const joins = (r, c) => ['road', 'bridge'].includes(appData.gridData[r]?.[c]?.terrain);
        const up = joins(row - 1, col);
        const right = joins(row, col + 1);
        const down = joins(row + 1, col);
        const left = joins(row, col - 1);
        if (terrain.id === 'bridge') {
            return Number(up) + Number(down) > Number(left) + Number(right)
                ? ORIGINAL_BRIDGE_VERTICAL_REGION : ORIGINAL_TERRAIN_REGIONS.bridge;
        }
        const connections = Number(up) + Number(right) + Number(down) + Number(left);
        if (connections >= 3)
            return ORIGINAL_ROAD_REGIONS.cross;
        if (up && left)
            return ORIGINAL_ROAD_REGIONS.leftUp;
        if (up && right)
            return ORIGINAL_ROAD_REGIONS.rightUp;
        if (down && left)
            return ORIGINAL_ROAD_REGIONS.leftDown;
        if (down && right)
            return ORIGINAL_ROAD_REGIONS.rightDown;
        if (up || down)
            return ORIGINAL_ROAD_REGIONS.vertical;
        return ORIGINAL_ROAD_REGIONS.horizontal;
    }
    return ORIGINAL_TERRAIN_REGIONS[terrain.id] || null;
}
function getTerrainVisualHtml(terrain, color = '#808080', hasOwner = false, row, col) {
    const region = getOriginalTerrainRegion(terrain, row, col);
    if (!region)
        return (terrain?.svg || '').replaceAll('currentColor', color);
    const safeColor = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6,8})$/i.test(color) ? color : '#808080';
    const building = terrain.id === 'house' || terrain.id === 'castle';
    const ownerColor = hasOwner ? safeColor : '#808080';
    const ownerPixels = building ? getOriginalBuildingOwnerSvg(terrain.id, ownerColor) : '';
    return `<span class="original-terrain-sprite" style="background-position:-${region[0]}px -${region[1]}px;">${ownerPixels}</span>`;
}
function renderTerrainList() {
    elements.terrainList.innerHTML = '';
    appData.terrains.forEach(terrain => {
        const terrainItem = document.createElement('div');
        terrainItem.className = 'p-2 border rounded-md text-center cursor-pointer hover:bg-gray-100 transition-colors';
        if (appData.selectedTerrain === terrain.id) {
            terrainItem.classList.add('bg-blue-50', 'border-blue-500');
        }
        const terrainIcon = document.createElement('div');
        terrainIcon.className = 'flex justify-center';
        terrainIcon.innerHTML = getTerrainVisualHtml(terrain, '#666666');
        const terrainName = document.createElement('div');
        terrainName.className = 'text-xs mt-1';
        terrainName.textContent = terrain.name;
        terrainItem.appendChild(terrainIcon);
        terrainItem.appendChild(terrainName);
        terrainItem.addEventListener('click', () => {
            appData.selectedTerrain = terrain.id;
            appData.selectedUnit = null;
            appData.selectedMarker = null;
            if (elements.tombstoneMarkerStatus)
                elements.tombstoneMarkerStatus.textContent = '';
            renderTerrainList();
            renderUnitList();
            showTerrainInfo(terrain);
        });
        elements.terrainList.appendChild(terrainItem);
    });
}
function showTerrainInfo(terrain) {
    elements.terrainInfo.querySelector('h3').textContent = `地形信息: ${terrain.name}`;
    elements.terrainSvgInput.value = terrain.svg;
    elements.updateTerrainSvg.onclick = () => {
        const terrainIndex = appData.terrains.findIndex(t => t.id === terrain.id);
        if (terrainIndex !== -1) {
            appData.terrains[terrainIndex].svg = elements.terrainSvgInput.value;
            renderTerrainList();
            renderGrid();
            alert('地形SVG已更新');
        }
    };
}
function renderUnitList() {
    elements.unitList.innerHTML = '';
    appData.units.forEach(unit => {
        const unitItem = document.createElement('div');
        unitItem.className = 'p-2 border rounded-md text-center cursor-pointer hover:bg-gray-100 transition-colors';
        if (appData.selectedUnit === unit.id) {
            unitItem.classList.add('bg-blue-50', 'border-blue-500');
        }
        const unitIcon = document.createElement('div');
        unitIcon.className = 'text-center text-lg font-bold';
        unitIcon.textContent = unit.abbreviation;
        const unitName = document.createElement('div');
        unitName.className = 'text-xs mt-1';
        unitName.textContent = unit.name;
        unitItem.appendChild(unitIcon);
        unitItem.appendChild(unitName);
        unitItem.addEventListener('click', () => {
            if (appData.selectedUnit === unit.id) {
                appData.selectedUnit = null;
            }
            else {
                appData.selectedUnit = unit.id;
                appData.selectedTerrain = null;
                appData.selectedMarker = null;
                if (elements.tombstoneMarkerStatus)
                    elements.tombstoneMarkerStatus.textContent = '';
                elements.unitHealth.value = '';
                elements.unitExp.value = 0;
            }
            renderUnitList();
            renderTerrainList();
            if (appData.selectedUnit) {
                showUnitInfo(unit);
            }
            else {
                elements.unitInfo.querySelector('h3').textContent = '兵种信息';
                elements.unitInfo.querySelector('p').textContent = '请选择一种兵种类型';
            }
        });
        elements.unitList.appendChild(unitItem);
    });
}
function showUnitInfo(unit) {
    elements.unitInfo.querySelector('h3').textContent = `兵种信息: ${unit.name}`;
    elements.unitAbbreviation.value = unit.abbreviation;
    elements.updateUnitInfo.onclick = () => {
        if (appData.selectedCell && appData.gridData[appData.selectedCell.row][appData.selectedCell.col].unit) {
            const cell = appData.gridData[appData.selectedCell.row][appData.selectedCell.col];
            if (elements.unitLevel.value !== '') {
                const levelValue = parseInt(elements.unitLevel.value);
                cell.unitLevel = isNaN(levelValue) ? cell.unitLevel : levelValue;
            }
            if (elements.unitHealth.value !== '') {
                cell.unitHealth = parseInt(elements.unitHealth.value) || cell.unitHealth;
            }
            if (elements.unitExp.value !== '') {
                const expValue = parseInt(elements.unitExp.value);
                cell.unitExp = isNaN(expValue) ? (cell.unitExp || 0) : Math.max(0, expValue);
            }
            if (elements.unitStatus.value !== '') {
                setUnitStatusDirect(cell, elements.unitStatus.value, elements.unitStatusTurns.value);
            }
            renderGrid();
            alert('单位属性已更新');
        }
        else if (appData.selectedUnit) {
            const unitIndex = appData.units.findIndex(u => u.id === unit.id);
            if (unitIndex !== -1) {
                appData.units[unitIndex].abbreviation = elements.unitAbbreviation.value;
                renderUnitList();
                alert('兵种信息已更新');
            }
        }
        else {
            alert('请先选择一个兵种类型或包含单位的网格');
        }
    };
}
function bindUnitUpdateHandler(unit, row, col) {
    elements.updateUnitInfo.onclick = () => {
        const cell = appData.gridData[row][col];
        if (cell.unit) {
            if (elements.unitLevel.value !== '') {
                const levelValue = parseInt(elements.unitLevel.value);
                cell.unitLevel = isNaN(levelValue) ? cell.unitLevel : levelValue;
            }
            if (elements.unitHealth.value !== '') {
                cell.unitHealth = parseInt(elements.unitHealth.value) || cell.unitHealth;
            }
            if (elements.unitExp.value !== '') {
                const expValue = parseInt(elements.unitExp.value);
                cell.unitExp = isNaN(expValue) ? (cell.unitExp || 0) : Math.max(0, expValue);
            }
            if (elements.unitStatus.value !== '') {
                setUnitStatusDirect(cell, elements.unitStatus.value, elements.unitStatusTurns.value);
            }
            renderGrid();
            alert('单位属性已更新');
        }
    };
}
function handleCellClick(row, col) {
    if (appData.dragState.isDragging) {
        appData.dragState.isDragging = false;
        return;
    }
    if (appData.formatBrushState.active) {
        applyFormatBrush(row, col);
        return;
    }
    if (appData.activePanel === 'demoMode') {
        if (appData.demoAllianceViewing) {
            jumpDemoAllianceViewingToUnitFirstAction(row, col);
            return;
        }
        appData.selectedCell = { row, col };
        renderGrid();
        return;
    }
    if (appData.activePanel === 'moveMode') {
        if (handleMoveDebugGridUnitClick(row, col)) {
            return;
        }
        if (appData.recruitmentMove) {
            handleRecruitmentMoveClick(row, col);
            return;
        }
        if (appData.attackMode || appData.healMode || appData.supportMode || appData.summonMode) {
            handleMoveModeCellClick(row, col);
            return;
        }
        const cellData = appData.gridData[row][col];
        const activeMoveTeamId = ensureMoveModeCurrentTeam();
        updateMoveModeCurrentTeamLabel();
        if (cellData.unit) {
            if (appData.currentMoveAction) {
                const selected = appData.selectedCell;
                if (selected && selected.row === row && selected.col === col)
                    showActionMenu();
                return;
            }
            if (cellData.unitStandby) {
                appData.currentMoveAction = null;
                appData.recruitmentMove = null;
                appData.calculationResults = null;
                const recruitableCastle = getRecruitableCastleInfo(row, col);
                if (recruitableCastle && recruitableCastle.teamId === activeMoveTeamId) {
                    appData.selectedCell = { row, col };
                    appData.currentMoveTeam = recruitableCastle.teamId;
                    clearMoveRangeHighlight();
                    clearAttackHighlight();
                    clearHealHighlight();
                    clearSupportHighlight();
                    clearSummonHighlight();
                    renderGrid();
                    showActionMenu();
                    return;
                }
                appData.selectedCell = null;
                if (elements.moveModeActions)
                    elements.moveModeActions.classList.add('hidden');
                clearMoveRangeHighlight();
                clearAttackHighlight();
                clearHealHighlight();
                alert('该单位已待机，请选择其他单位');
                appData.currentMoveAction = null;
                appData.recruitmentMove = null;
                appData.calculationResults = null;
                renderGrid();
                updateMoveModeRefreshTargetButton();
                return;
            }
            if (cellData.unitTeam !== activeMoveTeamId) {
                const activeTeam = appData.teams.find(t => t.id === activeMoveTeamId);
                alert(`当前是${activeTeam ? activeTeam.name : '当前队伍'}回合，请先结束回合再操作其他队伍`);
                return;
            }
            appData.selectedCell = { row, col };
            appData.calculationResults = null;
            clearAiActionButtonScores();
            if (cellData.unitTeam)
                appData.currentMoveTeam = cellData.unitTeam;
            updateMoveModeCurrentTeamLabel();
            renderGrid();
            updateMoveModeRange();
            showActionMenu();
        }
        else {
            const recruitableCastle = getRecruitableCastleInfo(row, col);
            const selectedForMove = appData.selectedCell
                ? appData.gridData[appData.selectedCell.row]?.[appData.selectedCell.col]
                : null;
            const selectedCanMoveToClickedCastle = selectedForMove && selectedForMove.unit
                ? calculateMovementRange(appData.selectedCell.row, appData.selectedCell.col).some(pos => pos.row === row && pos.col === col)
                : false;
            if (recruitableCastle && recruitableCastle.teamId !== activeMoveTeamId && !selectedCanMoveToClickedCastle) {
                const activeTeam = appData.teams.find(t => t.id === activeMoveTeamId);
                alert(`当前是${activeTeam ? activeTeam.name : '当前队伍'}回合，请先结束回合再操作其他队伍`);
                return;
            }
            if (recruitableCastle && !appData.currentMoveAction && !selectedCanMoveToClickedCastle) {
                appData.selectedCell = { row, col };
                appData.currentMoveTeam = recruitableCastle.teamId;
                clearMoveRangeHighlight();
                clearAttackHighlight();
                clearHealHighlight();
                clearSupportHighlight();
                clearSummonHighlight();
                renderGrid();
                showActionMenu();
                return;
            }
            handleMoveModeCellClick(row, col);
        }
        return;
    }
    appData.selectedCell = { row, col };
    if (appData.activePanel !== 'singleUnitCalc') {
        if (appData.selectedMarker === 'tombstone') {
            const cellData = appData.gridData[row][col];
            if (cellData.unit) {
                alert('墓碑不能与单位共存');
                return;
            }
            if (cellData.tombstone) {
                cellData.tombstone = null;
            }
            else {
                const rounds = parseInt(elements.tombstoneRounds.value) === 1 ? 1 : 2;
                const team = elements.tombstoneTeam.value || 'blue';
                cellData.tombstone = { rounds, team };
            }
        }
        else if (appData.selectedTerrain) {
            const cellData = appData.gridData[row][col];
            if (cellData.terrain === appData.selectedTerrain) {
                cellData.terrain = null;
                cellData.terrainTeam = null;
            }
            else {
                cellData.terrain = appData.selectedTerrain;
                const selectedTeamValue = elements.terrainTeam.value;
                cellData.terrainTeam = selectedTeamValue === "" ? null : selectedTeamValue;
            }
        }
        else if (appData.selectedUnit) {
            const cellData = appData.gridData[row][col];
            if (cellData.unit === appData.selectedUnit) {
                cellData.unit = null;
                cellData.unitTeam = null;
                cellData.unitLevel = 1;
                cellData.unitHealth = 100;
                cellData.unitExp = 0;
                clearUnitStatus(cellData);
                cellData.unitRegisteredCommander = false;
            }
            else {
                if (cellData.tombstone) {
                    alert('该网格有墓碑，不能添加单位');
                    return;
                }
                const nextUnitTeam = elements.unitTeam.value;
                const shouldRegisterCommander = appData.selectedUnit === 'commander' && !teamHasCommander(nextUnitTeam);
                cellData.unit = appData.selectedUnit;
                cellData.unitTeam = nextUnitTeam;
                cellData.unitRegisteredCommander = shouldRegisterCommander;
                const levelValue = parseInt(elements.unitLevel.value);
                cellData.unitLevel = isNaN(levelValue) ? 0 : levelValue;
                const selectedUnit = appData.units.find(u => u.id === appData.selectedUnit);
                const unitMaxHp = selectedUnit ? (100 + selectedUnit.hpUp * cellData.unitLevel) : 100;
                const healthValue = parseInt(elements.unitHealth.value);
                cellData.unitHealth = isNaN(healthValue) ? unitMaxHp : healthValue;
                const expValue = parseInt(elements.unitExp.value);
                cellData.unitExp = isNaN(expValue) ? 0 : Math.max(0, expValue);
                setUnitStatusDirect(cellData, elements.unitStatus.value, elements.unitStatusTurns.value);
            }
        }
        else {
            if (appData.activePanel === 'demo') {
                return;
            }
            const cellData = appData.gridData[row][col];
            if (cellData.unit && !appData.selectedTerrain && !appData.selectedUnit) {
                elements.unitTeam.value = cellData.unitTeam || 'blue';
                elements.unitLevel.value = cellData.unitLevel;
                elements.unitHealth.value = cellData.unitHealth;
                elements.unitExp.value = cellData.unitExp || 0;
                normalizeUnitStatusFields(cellData);
                elements.unitStatus.value = cellData.unitStatus;
                elements.unitStatusTurns.value = cellData.unitStatus === '无' ? '' : cellData.unitStatusTurns;
                appData.selectedUnit = cellData.unit;
                renderUnitList();
                const unit = appData.units.find(u => u.id === cellData.unit);
                if (unit) {
                    bindUnitUpdateHandler(unit, row, col);
                }
                alert('已选中单位进行编辑,修改后点击"更新兵种信息"保存');
            }
        }
        appData.calculationResults = null;
    }
    else {
        const calcType = document.querySelector('input[name="singleUnitCalcType"]:checked').value;
        if (calcType === 'attackScore' && appData.calculationResults) {
            const result = appData.calculationResults.find(r => r.row === row && r.col === col);
            if (result && result.targets) {
                showAttackTargetsForPosition(row, col, result.targets);
            }
        }
    }
    renderGrid();
    if (appData.activePanel === 'singleUnitCalc') {
        updateSelectedUnitInfo(row, col);
    }
    if (appData.activePanel === 'demoMode') {
        updateDemoUnitInfo();
    }
}
function updateSelectedUnitInfo(row, col) {
    const cellData = appData.gridData[row][col];
    if (cellData.unit) {
        elements.noUnitSelected.classList.add('hidden');
        elements.selectedUnitInfo.classList.remove('hidden');
        const unit = appData.units.find(u => u.id === cellData.unit);
        const team = appData.teams.find(t => t.id === cellData.unitTeam);
        elements.selectedUnitType.textContent = unit ? unit.name : '未知';
        elements.selectedUnitTeam.textContent = team ? team.name : '未知';
        elements.selectedUnitTeam.style.color = team ? team.color : '#000000';
        elements.selectedUnitLevel.textContent = cellData.unitLevel;
        elements.selectedUnitHealth.textContent = cellData.unitHealth;
        elements.singleUnitResults.classList.add('hidden');
    }
    else {
        elements.noUnitSelected.classList.remove('hidden');
        elements.selectedUnitInfo.classList.add('hidden');
        elements.singleUnitResults.classList.add('hidden');
        appData.calculationResults = null;
    }
}
function switchMapConfigSubSection(section) {
    const showBasic = section !== 'edit';
    document.querySelectorAll('.map-config-basic-section').forEach(item => {
        item.classList.toggle('hidden', !showBasic);
    });
    document.querySelectorAll('.map-config-edit-section').forEach(item => {
        item.classList.toggle('hidden', showBasic);
    });
    if (elements.mapBasicSettingsTab && elements.mapEditTab) {
        elements.mapBasicSettingsTab.classList.toggle('bg-blue-600', showBasic);
        elements.mapBasicSettingsTab.classList.toggle('text-white', showBasic);
        elements.mapBasicSettingsTab.classList.toggle('hover:bg-blue-700', showBasic);
        elements.mapBasicSettingsTab.classList.toggle('bg-gray-100', !showBasic);
        elements.mapBasicSettingsTab.classList.toggle('text-gray-700', !showBasic);
        elements.mapBasicSettingsTab.classList.toggle('hover:bg-gray-200', !showBasic);
        elements.mapEditTab.classList.toggle('bg-blue-600', !showBasic);
        elements.mapEditTab.classList.toggle('text-white', !showBasic);
        elements.mapEditTab.classList.toggle('hover:bg-blue-700', !showBasic);
        elements.mapEditTab.classList.toggle('bg-gray-100', showBasic);
        elements.mapEditTab.classList.toggle('text-gray-700', showBasic);
        elements.mapEditTab.classList.toggle('hover:bg-gray-200', showBasic);
    }
}
function switchFullMapSubSection(section) {
    const showDisplay = section !== 'overview';
    document.querySelectorAll('.full-map-display-section').forEach(item => {
        item.classList.toggle('hidden', !showDisplay);
    });
    document.querySelectorAll('.full-map-overview-section').forEach(item => {
        item.classList.toggle('hidden', showDisplay);
    });
    if (elements.fullMapDisplayTab && elements.fullMapOverviewTab) {
        elements.fullMapDisplayTab.classList.toggle('bg-blue-600', showDisplay);
        elements.fullMapDisplayTab.classList.toggle('text-white', showDisplay);
        elements.fullMapDisplayTab.classList.toggle('hover:bg-blue-700', showDisplay);
        elements.fullMapDisplayTab.classList.toggle('bg-gray-100', !showDisplay);
        elements.fullMapDisplayTab.classList.toggle('text-gray-700', !showDisplay);
        elements.fullMapDisplayTab.classList.toggle('hover:bg-gray-200', !showDisplay);
        elements.fullMapOverviewTab.classList.toggle('bg-blue-600', !showDisplay);
        elements.fullMapOverviewTab.classList.toggle('text-white', !showDisplay);
        elements.fullMapOverviewTab.classList.toggle('hover:bg-blue-700', !showDisplay);
        elements.fullMapOverviewTab.classList.toggle('bg-gray-100', showDisplay);
        elements.fullMapOverviewTab.classList.toggle('text-gray-700', showDisplay);
        elements.fullMapOverviewTab.classList.toggle('hover:bg-gray-200', showDisplay);
    }
}
function switchPanel(panelId) {
    elements.mapConfigPanel.classList.add('hidden');
    elements.fullMapCalcPanel.classList.add('hidden');
    elements.singleUnitCalcPanel.classList.add('hidden');
    elements.moveModePanel.classList.add('hidden');
    clearMoveRangeHighlight();
    clearRecruitmentMove();
    elements.moveModeActions.classList.add('hidden');
    elements.demoModePanel.classList.add('hidden');
    elements.mapConfigBtn.classList.remove('bg-blue-700');
    elements.fullMapCalcBtn.classList.remove('bg-green-700');
    elements.singleUnitCalcBtn.classList.remove('bg-purple-700');
    elements.moveModeBtn.classList.remove('bg-teal-700');
    elements.demoModeBtn.classList.remove('bg-orange-700');
    appData.activePanel = panelId;
    if (panelId === 'mapConfig') {
        elements.mapConfigPanel.classList.remove('hidden');
        switchMapConfigSubSection('basic');
        elements.mapConfigBtn.classList.add('bg-blue-700');
        appData.calculationResults = null;
        renderGrid();
    }
    else if (panelId === 'fullMapCalc') {
        elements.fullMapCalcPanel.classList.remove('hidden');
        switchFullMapSubSection('display');
        elements.fullMapCalcBtn.classList.add('bg-green-700');
        calculateOverview();
    }
    else if (panelId === 'singleUnitCalc') {
        elements.singleUnitCalcPanel.classList.remove('hidden');
        elements.singleUnitCalcBtn.classList.add('bg-purple-700');
        if (appData.selectedCell) {
            updateSelectedUnitInfo(appData.selectedCell.row, appData.selectedCell.col);
        }
        else {
            elements.noUnitSelected.classList.remove('hidden');
            elements.selectedUnitInfo.classList.add('hidden');
            elements.singleUnitResults.classList.add('hidden');
        }
    }
    else if (panelId === 'moveMode') {
        elements.moveModePanel.classList.remove('hidden');
        elements.moveModeBtn.classList.add('bg-teal-700');
        ensureMoveModeCurrentTeam();
        syncMoveModeRoundFromDemoRound();
        ensureMoveModeHistoryBaseline();
        if (appData.selectedCell) {
            const selectedMoveCell = appData.gridData[appData.selectedCell.row]?.[appData.selectedCell.col];
            const selectedRecruitCastle = getRecruitableCastleInfo(appData.selectedCell.row, appData.selectedCell.col);
            const selectedTeamId = selectedMoveCell && selectedMoveCell.unit
                ? selectedMoveCell.unitTeam
                : (selectedRecruitCastle ? selectedRecruitCastle.teamId : null);
            if (selectedTeamId && selectedTeamId !== appData.currentMoveTeam) {
                appData.selectedCell = null;
            }
        }
        updateMoveModeCurrentTeamLabel();
        updateMoveModeRange();
        showActionMenu();
    }
    else if (panelId === 'demoMode') {
        elements.demoModePanel.classList.remove('hidden');
        elements.demoModeBtn.classList.add('bg-orange-700');
        updateDemoUnitInfo();
    }
}
function updateDemoUnitInfo() {
    if (appData.selectedCell) {
        const { row, col } = appData.selectedCell;
        const cellData = appData.gridData[row][col];
        if (cellData.unit) {
            const unit = appData.units.find(u => u.id === cellData.unit);
            const team = appData.teams.find(t => t.id === cellData.unitTeam);
            const infoHtml = `

                        <div class="grid grid-cols-2 gap-2 text-sm">

                            <div><span class="text-gray-600">类型:</span> <span class="font-medium">${unit ? unit.name : '未知'}</span></div>

                            <div><span class="text-gray-600">队伍:</span> <span class="font-medium" style="color: ${team ? team.color : '#000'}">${team ? team.name : '未知'}</span></div>

                            <div><span class="text-gray-600">等级:</span> <span class="font-medium">${cellData.unitLevel}</span></div>

                            <div><span class="text-gray-600">血量:</span> <span class="font-medium">${cellData.unitHealth}</span></div>

                            <div><span class="text-gray-600">位置:</span> <span class="font-medium">(${row + 1}, ${col + 1})</span></div>

                        </div>

                    `;
            elements.demoSelectedUnitInfo.innerHTML = infoHtml;
        }
        else {
            elements.demoSelectedUnitInfo.innerHTML = '<span class="text-red-500">当前网格无单位，请选择包含单位的网格</span>';
        }
    }
    else {
        elements.demoSelectedUnitInfo.innerHTML = '<span class="text-gray-500">请在网格中选择一个包含单位的单元格</span>';
    }
}
function clearMoveRangeHighlight() {
    document.querySelectorAll('.grid-cell').forEach(cell => {
        cell.classList.remove('move-range-highlight');
    });
}
function setTombstone(row, col, teamId, rounds = 2) {
    if (row < 0 || row >= appData.rows || col < 0 || col >= appData.cols)
        return false;
    const cell = appData.gridData[row][col];
    if (!cell || cell.unit)
        return false;
    const validTeam = appData.teams.some(t => t.id === teamId) ? teamId : 'blue';
    cell.tombstone = { rounds: rounds === 1 ? 1 : 2, team: validTeam };
    return true;
}
function clearUnitFromCell(cell) {
    cell.unit = null;
    cell.unitTeam = null;
    cell.unitLevel = 0;
    cell.unitHealth = 0;
    cell.unitExp = 0;
    cell.unitStatus = '无';
    cell.unitStatusTurns = 0;
    cell.unitStandby = false;
    cell.unitSupported = false;
    cell.unitRegisteredCommander = false;
    cell.unitTraceId = null;
    cell.pendingTombstone = null;
}
function removeUnitAndMaybeCreateTombstone(row, col, tombstoneTeamId) {
    const cell = appData.gridData[row][col];
    if (!cell || !cell.unit)
        return;
    const unitDef = appData.units.find(u => u.id === cell.unit);
    const abilities = unitDef && unitDef.abilities ? unitDef.abilities : [];
    const deadUnit = cell.unit;
    const deadTeam = cell.unitTeam;
    const deadLevel = cell.unitLevel || 0;
    const deadExp = cell.unitExp || 0;
    const wasRegisteredCommander = isRegisteredCommanderCell(cell);
    const shouldCreateTombstone = cell.unit !== 'commander' && !abilities.includes('亡灵');
    clearUnitFromCell(cell);
    if (wasRegisteredCommander) {
        saveCommanderRecruitState(deadTeam, deadLevel, deadExp);
        increaseCommanderRecruitCost(deadTeam);
    }
    if (shouldCreateTombstone)
        setTombstone(row, col, tombstoneTeamId, 2);
    else
        cell.tombstone = null;
    settleNaturalTeamElimination(deadTeam);
}
function resolveTombstoneStep(row, col) {
    const cell = appData.gridData[row][col];
    if (!cell || !cell.unit || !cell.tombstone)
        return null;
    const unitDef = appData.units.find(u => u.id === cell.unit);
    const abilities = unitDef && unitDef.abilities ? unitDef.abilities : [];
    const stepTeam = cell.unitTeam;
    cell.tombstone = null;
    if (abilities.includes('亡灵')) {
        cell.unitHealth = (cell.unitHealth || 0) + 10;
        return { type: 'heal', amount: 10 };
    }
    if (abilities.includes('召唤'))
        return { type: 'none', amount: 0 };
    cell.unitHealth = Math.max(0, (cell.unitHealth || 0) - 10);
    if (cell.unitHealth <= 0) {
        removeUnitAndMaybeCreateTombstone(row, col, stepTeam);
        return { type: 'damage-death', amount: 10 };
    }
    return { type: 'damage', amount: 10 };
}
function processTombstonesForTeam(teamId) {
    let changed = false;
    for (let i = 0; i < appData.rows; i++)
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i][j];
            if (!cell.unit && cell.tombstone && cell.tombstone.team === teamId) {
                cell.tombstone.rounds = Math.max(0, (cell.tombstone.rounds || 2) - 1);
                if (cell.tombstone.rounds <= 0)
                    cell.tombstone = null;
                changed = true;
            }
        }
    return changed;
}
function normalizeGridData() {
    for (let i = 0; i < appData.rows; i++) {
        if (!appData.gridData[i])
            appData.gridData[i] = [];
        for (let j = 0; j < appData.cols; j++) {
            if (!appData.gridData[i][j])
                appData.gridData[i][j] = { terrain: null, terrainTeam: null, unit: null, unitTeam: null, unitLevel: 1, unitHealth: 100, unitExp: 0, unitStatus: '无', unitStatusTurns: 0, unitStandby: false, unitSupported: false, unitRegisteredCommander: false, unitTraceId: null, pendingTombstone: null, tombstone: null };
            const cell = appData.gridData[i][j];
            const normalizeTombstoneMarker = (marker) => {
                if (!marker)
                    return null;
                marker.rounds = marker.rounds === 1 ? 1 : 2;
                if (!appData.teams.some(t => t.id === marker.team))
                    marker.team = 'blue';
                return marker;
            };
            cell.tombstone = normalizeTombstoneMarker(cell.tombstone);
            cell.pendingTombstone = null;
            if (cell.unitStandby === undefined)
                cell.unitStandby = false;
            cell.unitSupported = !!cell.unitSupported;
            if (!cell.unit)
                cell.unitSupported = false;
            if (cell.unit !== 'commander')
                cell.unitRegisteredCommander = false;
            if (cell.unitExp === undefined || cell.unitExp === null || isNaN(parseInt(cell.unitExp)))
                cell.unitExp = 0;
            normalizeUnitStatusFields(cell);
        }
    }
    normalizeRegisteredCommanders();
}
function snapshotCellForMove(row, col) {
    const cell = appData.gridData[row]?.[col];
    if (!cell)
        return null;
    return {
        terrain: cell.terrain,
        terrainTeam: cell.terrainTeam,
        unit: cell.unit,
        unitTeam: cell.unitTeam,
        unitLevel: cell.unitLevel,
        unitHealth: cell.unitHealth,
        unitExp: cell.unitExp,
        unitStatus: cell.unitStatus,
        unitStatusTurns: cell.unitStatusTurns,
        unitStandby: cell.unitStandby,
        unitSupported: cell.unitSupported || false,
        unitRegisteredCommander: cell.unitRegisteredCommander || false,
        unitTraceId: cell.unitTraceId || null,
        pendingTombstone: cell.pendingTombstone ? { ...cell.pendingTombstone } : null,
        tombstone: cell.tombstone ? { ...cell.tombstone } : null
    };
}
function restoreCellFromMoveSnapshot(row, col, snapshot) {
    if (!snapshot || !appData.gridData[row]?.[col])
        return;
    Object.assign(appData.gridData[row][col], {
        terrain: snapshot.terrain,
        terrainTeam: snapshot.terrainTeam,
        unit: snapshot.unit,
        unitTeam: snapshot.unitTeam,
        unitLevel: snapshot.unitLevel,
        unitHealth: snapshot.unitHealth,
        unitExp: snapshot.unitExp || 0,
        unitStatus: snapshot.unitStatus,
        unitStatusTurns: snapshot.unitStatusTurns,
        unitStandby: snapshot.unitStandby,
        unitSupported: snapshot.unitSupported || false,
        unitRegisteredCommander: snapshot.unitRegisteredCommander || false,
        unitTraceId: snapshot.unitTraceId || null,
        pendingTombstone: snapshot.pendingTombstone ? { ...snapshot.pendingTombstone } : null,
        tombstone: snapshot.tombstone ? { ...snapshot.tombstone } : null
    });
    normalizeUnitStatusFields(appData.gridData[row][col]);
}
function clearCurrentMoveAction() {
    appData.currentMoveAction = null;
    clearAiActionButtonScores();
}
function updateMoveModeActionsRecordStatus() {
    const count = Array.isArray(appData.moveModeRecordedActions) ? appData.moveModeRecordedActions.length : 0;
    if (elements.moveModeActionsRecordStatus) {
        elements.moveModeActionsRecordStatus.textContent = appData.moveModeRecordActions ? `正在记录：${count} 条` : `未记录（已保留 ${count} 条）`;
    }
    if (elements.exportMoveModeActionsBtn)
        elements.exportMoveModeActionsBtn.disabled = count === 0;
}
function makeMoveModeAction(type, actorRow = -1, actorCol = -1, targetRow = -1, targetCol = -1, extra = {}) {
    const move = appData.currentMoveAction;
    const from = move && move.from ? move.from : { row: actorRow, col: actorCol };
    const to = { row: actorRow, col: actorCol };
    const raw = {
        a: from.col, b: from.row, c: to.col, d: to.row,
        e: -1, f: -1, g: targetCol, h: targetRow, i: extra.unitIndex ?? -1,
        j: type
    };
    if (type === 'NEXT_TURN' || type === 'SURRENDER') {
        for (const key of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'])
            raw[key] = -1;
    }
    if (type === 'NONE') {
        raw.c = raw.d = raw.e = raw.f = raw.g = raw.h = -1;
    }
    const action = { index: 0, type };
    if (from.row >= 0 && from.col >= 0)
        action.from = { x: from.col, y: from.row, r: from.row + 1, c: from.col + 1 };
    if (to.row >= 0 && to.col >= 0 && type !== 'NONE')
        action.moveTo = { x: to.col, y: to.row, r: to.row + 1, c: to.col + 1 };
    if (targetRow >= 0 && targetCol >= 0)
        action.target = { x: targetCol, y: targetRow, r: targetRow + 1, c: targetCol + 1 };
    if (type === 'NONE' && extra.unitId) {
        action.recruitUnitId = extra.unitIndex;
        action.recruitType = extra.unitId;
    }
    action.raw = raw;
    return action;
}
function appendMoveModeAction(action) {
    if (Array.isArray(appData.demoAllianceActionSink) && action) {
        action.index = appData.demoAllianceActionSink.length;
        appData.demoAllianceActionSink.push(action);
        return;
    }
    if (!appData.moveModeRecordActions || appData.activePanel !== 'moveMode' || !action)
        return;
    action.index = appData.moveModeRecordedActions.length;
    appData.moveModeRecordedActions.push(action);
    updateMoveModeActionsRecordStatus();
}
function queueMoveModeAction(type, actorRow, actorCol, targetRow = -1, targetCol = -1, extra = {}) {
    const recordsDemoAlliance = Array.isArray(appData.demoAllianceActionSink);
    if (!recordsDemoAlliance && (!appData.moveModeRecordActions || appData.activePanel !== 'moveMode'))
        return;
    appData.moveModePendingActionRecord = makeMoveModeAction(type, actorRow, actorCol, targetRow, targetCol, extra);
}
function commitPendingMoveModeAction() {
    const action = appData.moveModePendingActionRecord;
    if (!action)
        return;
    const move = appData.currentMoveAction;
    if (move && move.postAttackMoveOnly && move.to
        && (move.hasMoved || move.remainingMove > 0)) {
        action.raw.e = move.to.col;
        action.raw.f = move.to.row;
        action.secondMoveTo = { x: move.to.col, y: move.to.row, r: move.to.row + 1, c: move.to.col + 1 };
        const raw = action.raw;
        delete action.raw;
        action.raw = raw;
    }
    appendMoveModeAction(action);
    appData.moveModePendingActionRecord = null;
}
function exportMoveModeActions() {
    const actions = (appData.moveModeRecordedActions || []).map((action, index) => ({ ...action, index }));
    if (!actions.length) {
        alert('当前没有已记录的 Actions');
        return;
    }
    downloadJsonFile({
        format: 'aeii-engine-actions', version: 1,
        meta: { app: '网格计算器 V6.1.4 行棋模式', source: 'move-mode-committed', exportedAt: new Date().toISOString() },
        moveMode: { currentTeam: appData.currentMoveTeam, round: elements.moveModeRoundInput ? Math.max(1, parseInt(elements.moveModeRoundInput.value) || 1) : 1 },
        pendingCount: 0, totalCaptured: actions.length, pendingActions: [], actions
    }, 'online-actions.json');
}
function finishCurrentMoveAction() {
    const shouldRecordMoveModeAction = appData.activePanel === 'moveMode'
        && !appData.demoTeamTurn
        && appData.moveModeLastCommittedSnapshot
        && appData.moveModeHistoryTeamId === appData.currentMoveTeam;
    if (shouldRecordMoveModeAction) {
        appData.moveModeTurnHistory.push(JSON.parse(JSON.stringify(appData.moveModeLastCommittedSnapshot)));
    }
    commitPendingMoveModeAction();
    clearCurrentMoveAction();
    clearRecruitmentMove();
    clearMoveRangeHighlight();
    appData.calculationResults = null;
    if (shouldRecordMoveModeAction) {
        appData.moveModeLastCommittedSnapshot = captureMoveModeHistorySnapshot();
        updateMoveModeHistoryButtons();
    }
}
const DEFAULT_COMMANDER_RECRUIT_COST = 400;
const COMMANDER_DEATH_COST_INCREASE = 100;
function normalizeNonNegativeInteger(value, defaultValue = 0) {
    const parsed = parseInt(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
}
function normalizeCommanderRecruitPrice(value) {
    return normalizeNonNegativeInteger(value, DEFAULT_COMMANDER_RECRUIT_COST);
}
function ensureTeamCommanderPrice(team) {
    if (!team)
        return DEFAULT_COMMANDER_RECRUIT_COST;
    team.commanderPrice = normalizeCommanderRecruitPrice(team.commanderPrice);
    return team.commanderPrice;
}
function ensureTeamCommanderState(team) {
    if (!team)
        return { level: 0, exp: 0 };
    team.commanderLevel = normalizeNonNegativeInteger(team.commanderLevel, 0);
    team.commanderExp = normalizeNonNegativeInteger(team.commanderExp, 0);
    return { level: team.commanderLevel, exp: team.commanderExp };
}
function ensureAllTeamCommanderPrices() {
    (appData.teams || []).forEach(team => {
        ensureTeamCommanderPrice(team);
        ensureTeamCommanderState(team);
    });
}
function getCommanderRecruitCost(teamId) {
    const team = (appData.teams || []).find(t => t.id === teamId);
    return ensureTeamCommanderPrice(team);
}
function increaseCommanderRecruitCost(teamId) {
    const team = (appData.teams || []).find(t => t.id === teamId);
    if (!team)
        return;
    team.commanderPrice = ensureTeamCommanderPrice(team) + COMMANDER_DEATH_COST_INCREASE;
}
function saveCommanderRecruitState(teamId, level, exp) {
    const team = (appData.teams || []).find(t => t.id === teamId);
    if (!team)
        return;
    team.commanderLevel = normalizeNonNegativeInteger(level, 0);
    team.commanderExp = normalizeNonNegativeInteger(exp, 0);
}
function getCommanderRecruitState(teamId) {
    const team = (appData.teams || []).find(t => t.id === teamId);
    return ensureTeamCommanderState(team);
}
function isRegisteredCommanderCell(cell) {
    return !!(cell && cell.unit === 'commander' && cell.unitRegisteredCommander === true);
}
const REGISTERED_COMMANDER_BUCKET_CAPACITY = 64;
function getRegisteredCommanderBucket(row, col) {
    return getGridHash(row, col) % REGISTERED_COMMANDER_BUCKET_CAPACITY;
}
function chooseRegisteredCommanderByBucket(candidates) {
    if (!candidates.length)
        return null;
    candidates.forEach(candidate => {
        candidate.hash = getGridHash(candidate.row, candidate.col);
        candidate.bucket = getRegisteredCommanderBucket(candidate.row, candidate.col);
    });
    const minBucket = Math.min(...candidates.map(candidate => candidate.bucket));
    const minBucketCandidates = candidates.filter(candidate => candidate.bucket === minBucket);
    minBucketCandidates.sort((a, b) => a.col - b.col || a.row - b.row);
    return minBucketCandidates[0];
}
function normalizeRegisteredCommanders(gridData = appData.gridData, rows = appData.rows, cols = appData.cols) {
    const registeredSeen = new Set();
    const candidatesByTeam = new Map();
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            const cell = gridData[i]?.[j];
            if (!cell || !cell.unit) {
                if (cell)
                    cell.unitRegisteredCommander = false;
                continue;
            }
            if (cell.unit !== 'commander') {
                cell.unitRegisteredCommander = false;
                continue;
            }
            if (!candidatesByTeam.has(cell.unitTeam))
                candidatesByTeam.set(cell.unitTeam, []);
            candidatesByTeam.get(cell.unitTeam).push({ cell, row: i, col: j });
            if (cell.unitRegisteredCommander === true && !registeredSeen.has(cell.unitTeam)) {
                registeredSeen.add(cell.unitTeam);
            }
            else {
                cell.unitRegisteredCommander = false;
            }
        }
    }
    candidatesByTeam.forEach((candidates, teamId) => {
        if (registeredSeen.has(teamId))
            return;
        const chosen = chooseRegisteredCommanderByBucket(candidates);
        if (chosen) {
            chosen.cell.unitRegisteredCommander = true;
            registeredSeen.add(teamId);
        }
    });
}
function ensureRegisteredCommanderForTeam(teamId) {
    const candidates = [];
    let hasRegisteredCommander = false;
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i]?.[j];
            if (!cell || cell.unit !== 'commander' || cell.unitTeam !== teamId)
                continue;
            candidates.push({ cell, row: i, col: j });
            if (isRegisteredCommanderCell(cell))
                hasRegisteredCommander = true;
        }
    }
    if (!hasRegisteredCommander) {
        const chosen = chooseRegisteredCommanderByBucket(candidates);
        if (chosen)
            chosen.cell.unitRegisteredCommander = true;
    }
    normalizeRegisteredCommanders();
}
function getTeamCommanderDisplayState(teamId) {
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i]?.[j];
            if (isRegisteredCommanderCell(cell) && cell.unitTeam === teamId) {
                return {
                    level: normalizeNonNegativeInteger(cell.unitLevel, 0),
                    exp: normalizeNonNegativeInteger(cell.unitExp, 0)
                };
            }
        }
    }
    return getCommanderRecruitState(teamId);
}
function getTeamGold(teamId) {
    const team = appData.teams.find(t => t.id === teamId);
    if (!team)
        return 0;
    if (team.gold === undefined || team.gold === null || team.gold === '')
        return appData.gold || 0;
    return Math.max(0, parseInt(team.gold) || 0);
}
function setTeamGold(teamId, value) {
    const team = appData.teams.find(t => t.id === teamId);
    if (!team)
        return;
    const nextValue = Math.max(0, parseInt(value) || 0);
    if (team.gold === undefined || team.gold === null || team.gold === '') {
        appData.gold = nextValue;
        if (elements.goldInput)
            elements.goldInput.value = appData.gold;
    }
    else {
        team.gold = nextValue;
    }
    renderTeamConfigs();
}
function getRecruitCost(unitId, teamId = null) {
    if (unitId === 'commander')
        return getCommanderRecruitCost(teamId);
    const unit = appData.units.find(u => u.id === unitId);
    return unit ? Math.max(0, parseInt(unit.value) || 0) : 0;
}
function floorAiScoreToPointTwo(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue))
        return 0;
    return Math.floor(numericValue * 5 + 1e-9) / 5;
}
function getAiScoringUnitValue(unit, level = 0, teamId = null, row = null, col = null, currentTeamId = null) {
    if (!unit)
        return 0;
    const unitLevel = normalizeNonNegativeInteger(level, 0);
    const isCommander = unit.id === 'commander' || unit.name === '指挥官';
    const unitPrice = isCommander ? getCommanderRecruitCost(teamId) : unit.value;
    let value = Math.floor(Math.max(150, Number(unitPrice) || 0) * (3 + unitLevel) / 3);
    const scoringTeamId = currentTeamId || appData.currentMoveTeam;
    const unitTeam = appData.teams.find(team => team.id === teamId);
    const scoringTeam = appData.teams.find(team => team.id === scoringTeamId);
    const unitCell = Number.isInteger(row) && Number.isInteger(col)
        ? appData.gridData[row]?.[col]
        : null;
    if (unitTeam && scoringTeam
        && unitTeam.alliance !== scoringTeam.alliance
        && unitCell && unitCell.terrain === 'castle'
        && unitCell.terrainTeam === scoringTeamId) {
        value += 5000;
    }
    if (isCommander)
        value += 200 + 100 * unitLevel;
    return value;
}
function hardAiToPageScore(rawScore) {
    return Math.trunc(rawScore) / 5;
}
function roundHardAiDistance(distance) {
    return Math.round((distance + Number.EPSILON) * 100) / 100;
}
function getHardAiUnitActualValue(unit, level, teamId) {
    return getAiScoringUnitValue(unit, level, teamId, null, null, teamId);
}
function calculateHardAiBattlePower(teamId) {
    const actingTeam = appData.teams.find(team => team.id === teamId);
    if (!actingTeam)
        return null;
    const allies = appData.teams.filter(team => team.alliance === actingTeam.alliance && team.playerType !== 0);
    const enemies = appData.teams.filter(team => team.alliance !== actingTeam.alliance && team.playerType !== 0);
    const alliedIds = new Set(allies.map(team => team.id));
    const enemyIds = new Set(enemies.map(team => team.id));
    let alliedUnitValue = 0;
    let enemyUnitValue = 0;
    for (let row = 0; row < appData.rows; row++) {
        for (let col = 0; col < appData.cols; col++) {
            const cell = appData.gridData[row]?.[col];
            if (!cell?.unit || !cell.unitTeam)
                continue;
            const unit = appData.units.find(item => item.id === cell.unit);
            const value = getHardAiUnitActualValue(unit, cell.unitLevel, cell.unitTeam);
            if (alliedIds.has(cell.unitTeam))
                alliedUnitValue += value;
            else if (enemyIds.has(cell.unitTeam))
                enemyUnitValue += value;
        }
    }
    const alliedGold = allies.reduce((sum, team) => sum + getTeamGold(team.id), 0);
    const enemyGold = enemies.reduce((sum, team) => sum + getTeamGold(team.id), 0);
    const enemyNextTurnIncome = enemies.reduce((sum, team) => sum + calculateTeamIncome(team.id), 0);
    const alliedPower = alliedUnitValue + alliedGold;
    const enemyPower = enemyUnitValue + enemyGold + enemyNextTurnIncome / 2;
    return {
        alliedUnitValue, alliedGold, alliedPower,
        enemyUnitValue, enemyGold, enemyNextTurnIncome, enemyPower,
        situation: enemyPower === 0 ? (alliedPower === 0 ? 1 : Infinity) : alliedPower / enemyPower
    };
}
function calculateHardAiCastleAdvantage(teamId) {
    const actingTeam = appData.teams.find(team => team.id === teamId);
    if (!actingTeam)
        return [];
    const alliedCastles = [];
    const enemyCastles = [];
    for (let row = 0; row < appData.rows; row++) {
        for (let col = 0; col < appData.cols; col++) {
            const cell = appData.gridData[row]?.[col];
            if (cell?.terrain !== 'castle' || !cell.terrainTeam)
                continue;
            const owner = appData.teams.find(team => team.id === cell.terrainTeam);
            if (!owner || owner.playerType === 0)
                continue;
            (owner.alliance === actingTeam.alliance ? alliedCastles : enemyCastles).push({ row, col });
        }
    }
    const averageDistance = (row, col, castles) => castles.length
        ? roundHardAiDistance(castles.reduce((sum, castle) => sum + Math.abs(row - castle.row) + Math.abs(col - castle.col), 0) / castles.length)
        : null;
    return Array.from({ length: appData.rows }, (_, row) => Array.from({ length: appData.cols }, (_, col) => {
        const alliedDistance = averageDistance(row, col, alliedCastles);
        const enemyDistance = averageDistance(row, col, enemyCastles);
        const difference = alliedDistance === null || enemyDistance === null
            ? null : roundHardAiDistance(enemyDistance - alliedDistance);
        return {
            row, col, alliedDistance, enemyDistance, difference,
            advantage: difference === null ? null
                : difference > 1 ? 'ally' : difference < -1 ? 'enemy' : null
        };
    }));
}
function calculateHardAiBuildingTargetSet(teamId) {
    const team = appData.teams.find(item => item.id === teamId);
    const result = { castles: new Set(), houses: new Set(), attackHouses: new Set(),
        rundowns: new Set(), details: new Map() };
    if (!team || !isHardAiTeam(teamId))
        return result;
    const alliedCastles = [];
    const enemyCastles = [];
    for (let row = 0; row < appData.rows; row++) {
        for (let col = 0; col < appData.cols; col++) {
            const cell = appData.gridData[row][col];
            const owner = appData.teams.find(item => item.id === cell.terrainTeam);
            if (cell.terrain === 'castle' && owner && owner.playerType !== 0) {
                (owner.alliance === team.alliance ? alliedCastles : enemyCastles).push({ row, col });
            }
        }
    }
    const distance = (a, b) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
    const nearest = (target, castles) => castles.length
        ? Math.min(...castles.map(castle => distance(target, castle))) : null;
    const battleRatio = calculateHardAiBattlePower(teamId)?.situation ?? 1;
    const expansion = battleRatio >= 1.3
        ? 1 + Math.floor((battleRatio - 1.3 + 1e-9) / 0.2) : 0;
    const threshold = expansion ? -expansion : 0;
    const positions = [];
    const corePositions = [];
    for (let row = 0; row < appData.rows; row++) {
        for (let col = 0; col < appData.cols; col++) {
            const target = { row, col };
            const alliedDistance = nearest(target, alliedCastles);
            const enemyDistance = nearest(target, enemyCastles);
            const difference = alliedDistance === null || enemyDistance === null
                ? null : enemyDistance - alliedDistance;
            const core = alliedDistance === null ? enemyDistance === null
                : enemyDistance === null || difference >= threshold;
            const position = { row, col, alliedDistance, enemyDistance, difference, core };
            positions.push(position);
            if (core)
                corePositions.push(position);
        }
    }
    for (const position of positions) {
        const { row, col, alliedDistance, enemyDistance, difference, core } = position;
        const cell = appData.gridData[row][col];
        const group = cell.terrain === 'castle' ? result.castles
            : cell.terrain === 'house' ? result.houses
                : cell.terrain === 'rundown' ? result.rundowns : null;
        if (!group)
            continue;
        const owner = appData.teams.find(item => item.id === cell.terrainTeam);
        if (cell.terrain !== 'rundown' && owner?.alliance === team.alliance)
            continue;
        const expanded = !core && cell.terrain === 'house' && !cell.unit
            && corePositions.some(corePosition => distance(position, corePosition) <= 2);
        const bootstrapCastle = alliedDistance === null && cell.terrain === 'castle'
            && !cell.terrainTeam;
        if (!core && !expanded && !bootstrapCastle)
            continue;
        const key = `${row},${col}`;
        group.add(key);
        if (core && cell.terrain === 'house')
            result.attackHouses.add(key);
        result.details.set(key, { row, col, terrain: cell.terrain,
            alliedDistance, enemyDistance, difference, core, expanded,
            battleRatio, threshold });
    }
    return result;
}
function getHardAiCaptureReadyHouseKeys(teamId) {
    if (!isHardAiTeam(teamId))
        return new Set();
    const targetSet = calculateHardAiBuildingTargetSet(teamId);
    const eligible = new Set([...targetSet.houses].filter(key => {
        const detail = targetSet.details.get(key);
        return detail && (detail.difference === null || detail.difference >= 0);
    }));
    if (!eligible.size)
        return eligible;
    const reachable = new Set();
    for (let row = 0; row < appData.rows; row++) {
        for (let col = 0; col < appData.cols; col++) {
            const cell = appData.gridData[row][col];
            if (cell.unitTeam !== teamId || !cell.unit || cell.unitStandby)
                continue;
            const unit = getUnitDefinition(cell.unit);
            if (!(unit?.abilities || []).includes('占领'))
                continue;
            for (const landing of calculateMovementRange(row, col)) {
                const key = `${landing.row},${landing.col}`;
                if (eligible.has(key))
                    reachable.add(key);
            }
        }
    }
    return reachable;
}
function calculateHardAiBuildingAllocationTargets(teamId) {
    const team = appData.teams.find(item => item.id === teamId);
    if (!team || !isHardAiTeam(teamId))
        return [];
    const targetSet = calculateHardAiBuildingTargetSet(teamId);
    const targets = [];
    for (const [key, detail] of targetSet.details) {
        const cell = appData.gridData[detail.row]?.[detail.col];
        if (!cell)
            continue;
        const owner = appData.teams.find(item => item.id === cell.terrainTeam);
        const neutral = !owner || owner.playerType === 0;
        const openingCastle = cell.terrain === 'castle' && neutral
            && detail.alliedDistance === null;
        if (!detail.core && !openingCastle)
            continue;
        let rank;
        if (cell.terrain === 'castle')
            rank = neutral ? 0 : 4;
        else if (cell.terrain === 'house')
            rank = 1;
        else if (cell.terrain === 'rundown')
            rank = 3;
        else
            continue;
        const originalE = detail.difference;
        const phase = originalE === null || originalE >= 0 ? 0 : 1;
        const correctedE = originalE === null ? 0 : originalE - detail.threshold;
        targets.push({ key, row: detail.row, col: detail.col,
            terrain: cell.terrain, rank, phase, originalE, correctedE,
            houseOwnerTieRank: cell.terrain === 'house' && neutral ? 1 : 0 });
    }
    targets.sort((a, b) => a.phase - b.phase || a.rank - b.rank
        || (a.phase === 0 ? a.correctedE - b.correctedE : b.correctedE - a.correctedE)
        || a.row - b.row || a.col - b.col);
    return targets;
}
function calculateHardAiSituation(teamId) {
    const power = calculateHardAiBattlePower(teamId);
    if (!power)
        return null;
    return { ...power, castleAdvantage: calculateHardAiCastleAdvantage(teamId) };
}
function collectHardAiCastleDistancePositions(teamId, enemy) {
    const team = appData.teams.find(item => item.id === teamId);
    if (!team)
        return [];
    const positions = [];
    for (let row = 0; row < appData.rows; row++) {
        for (let col = 0; col < appData.cols; col++) {
            const cell = appData.gridData[row]?.[col];
            if (cell?.terrain !== 'castle' || !cell.terrainTeam)
                continue;
            const owner = appData.teams.find(item => item.id === cell.terrainTeam);
            if (owner && (enemy ? owner.alliance !== team.alliance : owner.id === teamId)) {
                positions.push({ row, col });
            }
        }
    }
    return positions;
}
function hardAiAverageDistance(row, col, teamId, enemy, actorOrigin = null, actorLanding = null, nativeView = null) {

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
    const team = appData.teams.find(item => item.id === teamId);
    if (!team)
        return 999;
    const positions = [];
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i]?.[j];
            if (!cell?.unit || !cell.unitTeam)
                continue;
            const other = appData.teams.find(item => item.id === cell.unitTeam);
            if (!other || (other.alliance !== team.alliance) !== enemy)
                continue;
            if (!enemy && actorOrigin && actorLanding
                && ((i === actorOrigin.row && j === actorOrigin.col)
                    || (i === actorLanding.row && j === actorLanding.col)))
                continue;
            positions.push({ row: i, col: j });
        }
    }
    if (!enemy && actorLanding)
        positions.push(actorLanding);
    positions.push(...collectHardAiCastleDistancePositions(teamId, enemy));
    if (positions.length === 0)
        return 999;
    const total = positions.reduce((sum, pos) => sum + Math.abs(row - pos.row) + Math.abs(col - pos.col), 0);
    const result=roundHardAiDistance(total / positions.length);
    if(acceleratedDistance!==undefined&&acceleratedDistance!==result)throw Error('原生平均距离与原表达式不一致');
    return result;
}
function hardAiDistanceDifference(row, col, teamId, limit, origin = null, landing = null) {
    const nativeView=environment.nativeCompute?readHardNativeView():null;
    const enemyDistance = hardAiAverageDistance(row, col, teamId, true, null, null, nativeView);
    const allyDistance = hardAiAverageDistance(row, col, teamId, false, origin, landing, nativeView);
    return Math.max(-limit, Math.min(limit, enemyDistance - allyDistance));
}
function hardAiTerrainDefense(row, col, unit) {
    const cell = appData.gridData[row]?.[col];
    const terrain = cell?.terrain ? appData.terrains.find(item => item.id === cell.terrain) : null;
    if (!unit)
        return 0;
    let defense = terrain ? terrain.defense : 5;
    if ((unit.abilities || []).includes('空军'))
        defense = 0;
    const name = terrain?.name;
    if ((unit.abilities || []).includes('森林之子') && name === '树林')
        defense += 10;
    if ((unit.abilities || []).includes('水之子') && WaterTerrain.includes(name))
        defense += 10;
    if ((unit.abilities || []).includes('山之子') && MountainTerrain.includes(name))
        defense += 10;
    return defense;
}
function calculateHardAiLandingPositionScore(allyDistance, enemyDistance, terrainDefense, unitValue, maxRange, situation) {
    const gap = roundHardAiDistance(allyDistance - enemyDistance);
    const terrainDifference = terrainDefense - 10;
    if (gap > 0) {
        const battleRatio = Number.isFinite(situation) ? situation : 1;
        return -(gap - battleRatio + 1) * unitValue / 10 + terrainDifference * 2;
    }
    if (gap >= -1)
        return gap * 10 + terrainDifference * 2;
    if (gap >= -2)
        return (gap + maxRange - 1) * 10 + terrainDifference;
    return 0;
}
function calculateHardAiLandingAllyDistance(row, col, teamId, origin, allyPositions) {
    let relocated = false;
    const positions = allyPositions.map(position => {
        if (!relocated && position.row === origin.row && position.col === origin.col) {
            relocated = true;
            return { row, col };
        }
        return position;
    });
    if (!relocated)
        positions.push({ row, col });
    return calculateAllyDistance(row, col, teamId, positions);
}
function hardAiCandidateCorrection(fromRow, fromCol, moveScore, unit, teamId) {
    if (!isHardAiTeam(teamId) || !unit)
        return 0;
    const landing = { row: moveScore.row, col: moveScore.col };
    const value = getAiScoringUnitValue(unit, moveScore.scoringUnitLevel ?? appData.gridData[fromRow]?.[fromCol]?.unitLevel ?? 0, teamId, fromRow, fromCol, teamId);
    const defense = hardAiTerrainDefense(landing.row, landing.col, unit);
    return hardAiToPageScore(value * (5 + defense) / 100);
}
function teamHasCommander(teamId) {
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i][j];
            if (isRegisteredCommanderCell(cell) && cell.unitTeam === teamId)
                return true;
        }
    }
    return false;
}
function getRecruitableCastleInfo(row, col) {
    const cell = appData.gridData[row]?.[col];
    if (!cell || cell.terrain !== 'castle' || !cell.terrainTeam)
        return null;
    if (!cell.unit)
        return { teamId: cell.terrainTeam, occupiedByCommander: false };
    if (cell.unit === 'commander' && cell.unitTeam === cell.terrainTeam) {
        return { teamId: cell.terrainTeam, occupiedByCommander: true };
    }
    return null;
}
function createDemoUnitTraceId(teamId, unitId, row = null, col = null) {
    appData.demoUnitTraceCounter = (appData.demoUnitTraceCounter || 0) + 1;
    const positionPart = row === null || col === null ? 'new' : `${row}-${col}`;
    return `demo-${appData.demoUnitTraceCounter}-${teamId || 'team'}-${unitId || 'unit'}-${positionPart}`;
}
function ensureDemoUnitTraceIds() {
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i]?.[j];
            if (cell && cell.unit && !cell.unitTraceId) {
                cell.unitTraceId = createDemoUnitTraceId(cell.unitTeam, cell.unit, i, j);
            }
        }
    }
}
function setCellUnit(cell, unitId, teamId, level = 0) {
    const unitDef = appData.units.find(u => u.id === unitId);
    const commanderState = unitId === 'commander' ? getCommanderRecruitState(teamId) : null;
    const isRegisteredCommander = unitId === 'commander' && !teamHasCommander(teamId);
    const unitLevel = commanderState ? commanderState.level : level;
    cell.unit = unitId;
    cell.unitTeam = teamId;
    cell.unitLevel = unitLevel;
    cell.unitHealth = unitDef ? 100 + (unitDef.hpUp || 0) * unitLevel : 100;
    cell.unitExp = commanderState ? commanderState.exp : 0;
    clearUnitStatus(cell);
    cell.unitStandby = false;
    cell.unitSupported = false;
    cell.unitRegisteredCommander = isRegisteredCommander;
    cell.unitTraceId = createDemoUnitTraceId(teamId, unitId);
    cell.pendingTombstone = null;
}
function calculateRecruitMovementRange(row, col, unitId, teamId) {
    const cell = appData.gridData[row]?.[col];
    if (!cell)
        return [];
    const snapshot = snapshotCellForMove(row, col);
    setCellUnit(cell, unitId, teamId, 0);
    const reachable = calculateMovementRange(row, col)
        .filter(pos => !(pos.row === row && pos.col === col))
        .filter(pos => {
        const targetCell = appData.gridData[pos.row]?.[pos.col];
        return targetCell && !targetCell.unit;
    });
    restoreCellFromMoveSnapshot(row, col, snapshot);
    return reachable;
}
function clearRecruitmentMove() {
    appData.recruitmentMove = null;
}
function highlightRecruitmentMoveRange() {
    clearMoveRangeHighlight();
    const recruitMove = appData.recruitmentMove;
    if (!recruitMove)
        return;
    recruitMove.reachable.forEach(pos => {
        const cell = document.querySelector(`.grid-cell[data-row="${pos.row}"][data-col="${pos.col}"]`);
        if (cell)
            cell.classList.add('move-range-highlight');
    });
}
function renderMoveModeRecruitLandingScores() {
    const recruitMove = appData.recruitmentMove;
    if (!recruitMove) {
        appData.calculationResults = null;
        renderGrid();
        return;
    }
    const { row, col } = recruitMove.origin;
    const cell = appData.gridData[row]?.[col];
    if (!cell)
        return;
    const hiddenOriginCell = snapshotCellForMove(row, col);
    setCellUnit(cell, recruitMove.unitId, recruitMove.teamId, 0);
    try {
        appData.calculationResults = buildDemoLandingScores(row, col, 'total', true, { movementOptions: { hiddenOriginCell } });
    }
    finally {
        restoreCellFromMoveSnapshot(row, col, hiddenOriginCell);
    }
    renderGrid();
}
function handleRecruitmentMoveClick(row, col) {
    const recruitMove = appData.recruitmentMove;
    if (!recruitMove)
        return;
    const target = recruitMove.reachable.find(pos => pos.row === row && pos.col === col);
    if (!target) {
        highlightRecruitmentMoveRange();
        return;
    }
    const targetCell = appData.gridData[row]?.[col];
    if (!targetCell || targetCell.unit) {
        alert('该位置不可移动');
        highlightRecruitmentMoveRange();
        return;
    }
    const toSnapshot = snapshotCellForMove(row, col);
    setCellUnit(targetCell, recruitMove.unitId, recruitMove.teamId, 0);
    clearRecruitmentMove();
    appData.selectedCell = { row, col };
    appData.currentMoveTeam = recruitMove.teamId;
    appData.currentMoveAction = {
        from: { row: recruitMove.origin.row, col: recruitMove.origin.col },
        to: { row, col },
        fromSnapshot: snapshotCellForMove(recruitMove.origin.row, recruitMove.origin.col),
        toSnapshot,
        hasMoved: true,
        awaitingAction: true,
        allowMove: false,
        postAttackMoveOnly: false,
        recruitmentForcedMove: true,
        remainingMove: target.remaining || 0,
        preMoveRemainingMove: null
    };
    updateMoveModeHistoryButtons();
    clearMoveRangeHighlight();
    renderGrid();
    showActionMenu();
}
function prepareAssaultPostAttackMove(row, col, remainingMove, assaultContext = null) {
    const previousAction = appData.currentMoveAction;
    const assaultOrigin = assaultContext && assaultContext.origin
        ? { row: assaultContext.origin.row, col: assaultContext.origin.col }
        : previousAction && previousAction.assaultOrigin
            ? { row: previousAction.assaultOrigin.row, col: previousAction.assaultOrigin.col }
            : previousAction && previousAction.from
                ? { row: previousAction.from.row, col: previousAction.from.col }
                : { row, col };
    const assaultPotentialTarget = assaultContext && assaultContext.potentialTarget
        ? { ...assaultContext.potentialTarget }
        : previousAction && previousAction.assaultPotentialTarget
            ? { ...previousAction.assaultPotentialTarget }
            : null;
    const assaultEnemyPositions = assaultContext && Array.isArray(assaultContext.enemyPositions)
        ? assaultContext.enemyPositions.map(pos => ({ row: pos.row, col: pos.col }))
        : previousAction && Array.isArray(previousAction.assaultEnemyPositions)
            ? previousAction.assaultEnemyPositions.map(pos => ({ row: pos.row, col: pos.col }))
            : null;
    const assaultAllyPositions = assaultContext && Array.isArray(assaultContext.allyPositions)
        ? assaultContext.allyPositions.map(pos => ({ row: pos.row, col: pos.col }))
        : previousAction && Array.isArray(previousAction.assaultAllyPositions)
            ? previousAction.assaultAllyPositions.map(pos => ({ row: pos.row, col: pos.col }))
            : null;
    const assaultKilledPosition = assaultContext && assaultContext.killedPosition
        ? { ...assaultContext.killedPosition }
        : previousAction && previousAction.assaultKilledPosition
            ? { ...previousAction.assaultKilledPosition }
            : null;
    const assaultUnitSnapshot = assaultContext && assaultContext.unitSnapshot
        ? JSON.parse(JSON.stringify(assaultContext.unitSnapshot))
        : previousAction && previousAction.assaultUnitSnapshot
            ? JSON.parse(JSON.stringify(previousAction.assaultUnitSnapshot))
            : previousAction && previousAction.fromSnapshot
                ? JSON.parse(JSON.stringify(previousAction.fromSnapshot))
                : snapshotCellForMove(row, col);
    appData.currentMoveAction = {
        from: { row, col },
        to: { row, col },
        fromSnapshot: snapshotCellForMove(row, col),
        toSnapshot: snapshotCellForMove(row, col),
        hasMoved: false,
        awaitingAction: false,
        allowMove: false,
        postAttackMoveOnly: true,
        remainingMove: Math.max(0, remainingMove || 0),
        assaultOrigin,
        assaultPotentialTarget,
        assaultEnemyPositions,
        assaultAllyPositions,
        assaultKilledPosition,
        assaultUnitSnapshot
    };
    appData.selectedCell = { row, col };
    clearMoveRangeHighlight();
    if (appData.currentMoveAction.remainingMove <= 0) {
        appData.currentMoveAction.awaitingAction = true;
    }
    showActionMenu();
}
function cancelCurrentMoveAction() {
    const action = appData.currentMoveAction;
    if (!action || !action.hasMoved)
        return false;
    restoreCellFromMoveSnapshot(action.from.row, action.from.col, action.fromSnapshot);
    restoreCellFromMoveSnapshot(action.to.row, action.to.col, action.toSnapshot);
    appData.selectedCell = { row: action.from.row, col: action.from.col };
    clearMoveRangeHighlight();
    clearAttackHighlight();
    clearHealHighlight();
    clearSupportHighlight();
    clearSummonHighlight();
    clearAiActionButtonScores();
    appData.calculationResults = null;
    if (action.postAttackMoveOnly) {
        appData.currentMoveAction = {
            from: { row: action.from.row, col: action.from.col },
            fromSnapshot: snapshotCellForMove(action.from.row, action.from.col),
            to: { row: action.from.row, col: action.from.col },
            toSnapshot: snapshotCellForMove(action.from.row, action.from.col),
            hasMoved: false,
            awaitingAction: false,
            allowMove: true,
            postAttackMoveOnly: true,
            remainingMove: action.preMoveRemainingMove || action.remainingMove || 0,
            assaultOrigin: action.assaultOrigin || { row: action.from.row, col: action.from.col },
            assaultPotentialTarget: action.assaultPotentialTarget ? { ...action.assaultPotentialTarget } : null,
            assaultEnemyPositions: Array.isArray(action.assaultEnemyPositions)
                ? action.assaultEnemyPositions.map(pos => ({ row: pos.row, col: pos.col }))
                : null,
            assaultAllyPositions: Array.isArray(action.assaultAllyPositions)
                ? action.assaultAllyPositions.map(pos => ({ row: pos.row, col: pos.col }))
                : null,
            assaultKilledPosition: action.assaultKilledPosition
                ? { ...action.assaultKilledPosition }
                : null,
            assaultUnitSnapshot: action.assaultUnitSnapshot
                ? JSON.parse(JSON.stringify(action.assaultUnitSnapshot))
                : null
        };
    }
    else {
        clearCurrentMoveAction();
    }
    renderGrid();
    if (appData.currentMoveAction && appData.currentMoveAction.postAttackMoveOnly) {
        updateMoveModeRange();
    }
    else {
        updateMoveModeRange();
    }
    showActionMenu();
    return true;
}
function isForbiddenAiAssaultLanding(row, col, movingRow = null, movingCol = null) {
    const action = appData.currentMoveAction;
    if (!action || !action.postAttackMoveOnly || !action.assaultKilledPosition)
        return false;
    const sourceRow = movingRow === null ? appData.selectedCell?.row : movingRow;
    const sourceCol = movingCol === null ? appData.selectedCell?.col : movingCol;
    const movingCell = appData.gridData[sourceRow]?.[sourceCol];
    const movingTeam = movingCell ? appData.teams.find(t => t.id === movingCell.unitTeam) : null;
    if (!movingTeam || !isAiPlayerType(movingTeam.playerType))
        return false;
    return row === action.assaultKilledPosition.row
        && col === action.assaultKilledPosition.col;
}
function updateMoveModeRange() {
    clearMoveRangeHighlight();
    if (appData.recruitmentMove) {
        appData.calculationResults = null;
        highlightRecruitmentMoveRange();
        return;
    }
    if (!appData.selectedCell)
        return;
    const { row, col } = appData.selectedCell;
    const cellData = appData.gridData[row][col];
    if (!cellData.unit)
        return;
    if (appData.currentMoveAction && appData.currentMoveAction.awaitingAction)
        return;
    const moveOverride = appData.currentMoveAction
        && appData.currentMoveAction.postAttackMoveOnly
        && !appData.currentMoveAction.hasMoved
        ? appData.currentMoveAction.remainingMove
        : (appData.currentMoveAction && appData.currentMoveAction.allowMove ? appData.currentMoveAction.remainingMove : null);
    const rangeSnapshot = appData.currentMoveAction
        && appData.currentMoveAction.postAttackMoveOnly
        && !appData.currentMoveAction.hasMoved
        && appData.currentMoveAction.assaultUnitSnapshot
        ? appData.currentMoveAction.assaultUnitSnapshot
        : null;
    const reachable = calculateMovementRange(row, col, moveOverride, {
        movingCellOverride: rangeSnapshot
    })
        .filter(pos => !isForbiddenAiAssaultLanding(pos.row, pos.col, row, col));
    if (appData.activePanel === 'moveMode' && isMoveModeAiUnit(row, col)) {
        renderMoveModeAiMovementScores(row, col);
        renderGrid();
    }
    else {
        appData.calculationResults = null;
    }
    reachable.forEach(pos => {
        const cell = document.querySelector(`.grid-cell[data-row="${pos.row}"][data-col="${pos.col}"]`);
        if (cell) {
            cell.classList.add('move-range-highlight');
        }
    });
}
let isHandlingMove = false;
function handleMoveModeCellClick(row, col) {
    if (appData.recruitmentMove) {
        handleRecruitmentMoveClick(row, col);
        return;
    }
    if (appData.attackMode) {
        const clickedCell = appData.gridData[row][col];
        const target = appData.attackTargets.find(t => t.row === row && t.col === col);
        if (target) {
            appData.calculationResults = null;
            clearAiActionButtonScores();
            executeAttack(row, col, target);
        }
        appData.attackMode = false;
        clearAttackHighlight();
        appData.calculationResults = null;
        clearAiActionButtonScores();
        renderGrid();
        return;
    }
    if (appData.healMode) {
        const target = appData.healTargets.find(t => t.row === row && t.col === col);
        if (target) {
            appData.calculationResults = null;
            clearAiActionButtonScores();
            executeHeal(row, col, target);
            return;
        }
        appData.healMode = false;
        appData.healTargets = [];
        clearHealHighlight();
        appData.calculationResults = null;
        clearAiActionButtonScores();
        renderGrid();
        return;
    }
    if (appData.supportMode) {
        const target = appData.supportTargets.find(t => t.row === row && t.col === col);
        if (target) {
            appData.calculationResults = null;
            clearAiActionButtonScores();
            executeSupport(row, col, target);
            return;
        }
        appData.supportMode = false;
        appData.supportTargets = [];
        clearSupportHighlight();
        appData.calculationResults = null;
        clearAiActionButtonScores();
        renderGrid();
        return;
    }
    if (appData.summonMode) {
        const target = appData.summonTargets.find(t => t.row === row && t.col === col);
        if (target) {
            appData.calculationResults = null;
            clearAiActionButtonScores();
            executeSummon(row, col, target);
            return;
        }
        appData.summonMode = false;
        appData.summonTargets = [];
        clearSummonHighlight();
        appData.calculationResults = null;
        renderGrid();
        return;
    }
    if (isHandlingMove) {
        console.log('DEBUG: Already handling move, ignoring duplicate call');
        return;
    }
    isHandlingMove = true;
    console.log('DEBUG: handleMoveModeCellClick called, row=' + row + ', col=' + col + ', selectedCell=' + JSON.stringify(appData.selectedCell));
    const cellData = appData.gridData[row][col];
    const selectedCell = appData.selectedCell;
    if (!selectedCell) {
        console.log('DEBUG: No selectedCell, returning');
        isHandlingMove = false;
        return;
    }
    const { row: selectedRow, col: selectedCol } = selectedCell;
    const selectedCellData = appData.gridData[selectedRow][selectedCol];
    if (!selectedCellData.unit) {
        isHandlingMove = false;
        return;
    }
    if (selectedCellData.unitTeam !== ensureMoveModeCurrentTeam()) {
        isHandlingMove = false;
        return;
    }
    if (appData.currentMoveAction && appData.currentMoveAction.awaitingAction) {
        if (row === selectedRow && col === selectedCol)
            showActionMenu();
        isHandlingMove = false;
        return;
    }
    if (appData.currentMoveAction && appData.currentMoveAction.postAttackMoveOnly && !appData.currentMoveAction.allowMove) {
        if (row === selectedRow && col === selectedCol)
            showActionMenu();
        isHandlingMove = false;
        return;
    }
    const moveOverride = appData.currentMoveAction
        && appData.currentMoveAction.postAttackMoveOnly
        && !appData.currentMoveAction.hasMoved
        ? appData.currentMoveAction.remainingMove
        : (appData.currentMoveAction && appData.currentMoveAction.allowMove ? appData.currentMoveAction.remainingMove : null);
    const rangeSnapshot = appData.currentMoveAction
        && appData.currentMoveAction.postAttackMoveOnly
        && !appData.currentMoveAction.hasMoved
        && appData.currentMoveAction.assaultUnitSnapshot
        ? appData.currentMoveAction.assaultUnitSnapshot
        : null;
    const reachable = calculateMovementRange(selectedRow, selectedCol, moveOverride, {
        movingCellOverride: rangeSnapshot
    })
        .filter(pos => !isForbiddenAiAssaultLanding(pos.row, pos.col, selectedRow, selectedCol));
    const isReachable = reachable.some(pos => pos.row === row && pos.col === col);
    if (isReachable) {
        if (row === selectedRow && col === selectedCol) {
            showActionMenu();
            isHandlingMove = false;
            return;
        }
        if (cellData.unit) {
            isHandlingMove = false;
            return;
        }
        const reachableTarget = reachable.find(pos => pos.row === row && pos.col === col);
        const fromSnapshot = snapshotCellForMove(selectedRow, selectedCol);
        const toSnapshot = snapshotCellForMove(row, col);
        const previousMoveAction = appData.currentMoveAction;
        appData.gridData[row][col].unit = selectedCellData.unit;
        appData.gridData[row][col].unitTeam = selectedCellData.unitTeam;
        appData.gridData[row][col].unitLevel = selectedCellData.unitLevel;
        appData.gridData[row][col].unitHealth = selectedCellData.unitHealth;
        appData.gridData[row][col].unitExp = selectedCellData.unitExp || 0;
        appData.gridData[row][col].unitStatus = selectedCellData.unitStatus;
        appData.gridData[row][col].unitStatusTurns = selectedCellData.unitStatusTurns || 0;
        appData.gridData[row][col].unitStandby = false;
        appData.gridData[row][col].unitSupported = selectedCellData.unitSupported || false;
        appData.gridData[row][col].unitRegisteredCommander = selectedCellData.unitRegisteredCommander || false;
        appData.gridData[row][col].pendingTombstone = null;
        appData.gridData[selectedRow][selectedCol].unit = null;
        appData.gridData[selectedRow][selectedCol].unitTeam = null;
        appData.gridData[selectedRow][selectedCol].unitLevel = null;
        appData.gridData[selectedRow][selectedCol].unitHealth = null;
        appData.gridData[selectedRow][selectedCol].unitExp = 0;
        clearUnitStatus(appData.gridData[selectedRow][selectedCol]);
        appData.gridData[selectedRow][selectedCol].unitStandby = false;
        appData.gridData[selectedRow][selectedCol].unitSupported = false;
        appData.gridData[selectedRow][selectedCol].unitRegisteredCommander = false;
        appData.gridData[selectedRow][selectedCol].pendingTombstone = null;
        appData.selectedCell = { row, col };
        appData.currentMoveAction = {
            from: { row: selectedRow, col: selectedCol },
            to: { row, col },
            fromSnapshot,
            toSnapshot,
            hasMoved: true,
            awaitingAction: true,
            allowMove: false,
            postAttackMoveOnly: !!(previousMoveAction && previousMoveAction.postAttackMoveOnly),
            remainingMove: previousMoveAction && previousMoveAction.postAttackMoveOnly
                ? previousMoveAction.remainingMove
                : (reachableTarget ? reachableTarget.remaining : 0),
            preMoveRemainingMove: previousMoveAction && previousMoveAction.postAttackMoveOnly
                ? previousMoveAction.remainingMove
                : null,
            assaultOrigin: previousMoveAction && previousMoveAction.postAttackMoveOnly
                ? (previousMoveAction.assaultOrigin || { row: selectedRow, col: selectedCol })
                : null,
            assaultPotentialTarget: previousMoveAction && previousMoveAction.postAttackMoveOnly
                ? (previousMoveAction.assaultPotentialTarget ? { ...previousMoveAction.assaultPotentialTarget } : null)
                : null,
            assaultEnemyPositions: previousMoveAction && previousMoveAction.postAttackMoveOnly
                && Array.isArray(previousMoveAction.assaultEnemyPositions)
                ? previousMoveAction.assaultEnemyPositions.map(pos => ({ row: pos.row, col: pos.col }))
                : null,
            assaultAllyPositions: previousMoveAction && previousMoveAction.postAttackMoveOnly
                && Array.isArray(previousMoveAction.assaultAllyPositions)
                ? previousMoveAction.assaultAllyPositions.map(pos => ({ row: pos.row, col: pos.col }))
                : null,
            assaultKilledPosition: previousMoveAction && previousMoveAction.postAttackMoveOnly
                && previousMoveAction.assaultKilledPosition
                ? { ...previousMoveAction.assaultKilledPosition }
                : null
        };
        updateMoveModeHistoryButtons();
        console.log('DEBUG: After move, selectedCell=' + JSON.stringify(appData.selectedCell));
        appData.calculationResults = null;
        clearAiActionButtonScores();
        renderGrid();
        clearMoveRangeHighlight();
        console.log('DEBUG: About to call showActionMenu, selectedCell=' + JSON.stringify(appData.selectedCell));
        showActionMenu();
    }
    isHandlingMove = false;
}
function hasAvailableActionTarget(actionId, row, col, cellData, unit) {
    if (!cellData || !cellData.unit || !unit)
        return false;
    if (actionId === 'attack') {
        return calculateAttackTargets(row, col).length > 0;
    }
    if (actionId === 'heal') {
        return calculateHealTargets(row, col).length > 0;
    }
    if (actionId === 'support') {
        return calculateSupportTargets(row, col).length > 0;
    }
    if (actionId === 'summon') {
        return calculateSummonTargets(row, col).length > 0;
    }
    if (actionId === 'occupy') {
        const terrainDef = cellData.terrain ? appData.terrains.find(t => t.id === cellData.terrain) : null;
        if (!terrainDef || (terrainDef.name !== '房子' && terrainDef.name !== '城堡'))
            return false;
        if (terrainDef.name === '城堡' && !(unit.abilities || []).includes('城主'))
            return false;
        const unitTeam = appData.teams.find(t => t.id === cellData.unitTeam);
        const ownerTeam = cellData.terrainTeam ? appData.teams.find(t => t.id === cellData.terrainTeam) : null;
        if (ownerTeam && unitTeam && ownerTeam.alliance === unitTeam.alliance)
            return false;
        return true;
    }
    if (actionId === 'repair') {
        const terrainDef = cellData.terrain ? appData.terrains.find(t => t.id === cellData.terrain) : null;
        return !!(terrainDef && terrainDef.name === '破房');
    }
    return true;
}
function isMoveModeAiUnit(row, col) {
    const cell = appData.gridData[row]?.[col];
    if (!cell || !cell.unit || !cell.unitTeam)
        return false;
    const team = appData.teams.find(t => t.id === cell.unitTeam);
    return !!(team && isAiPlayerType(team.playerType));
}
function isSelectedMoveModeAiUnit() {
    if (!appData.selectedCell)
        return false;
    return isMoveModeAiUnit(appData.selectedCell.row, appData.selectedCell.col);
}
function clearAiActionButtonScores() {
    if (!elements.actionButtons)
        return;
    elements.actionButtons.querySelectorAll('.ai-action-score').forEach(scoreEl => scoreEl.remove());
}
function setActionButtonsGridColumns(columnCount) {
    if (!elements.actionButtons)
        return;
    elements.actionButtons.className = 'grid gap-2';
    elements.actionButtons.style.display = 'grid';
    elements.actionButtons.style.gridTemplateColumns = `repeat(${columnCount}, minmax(0, 1fr))`;
    elements.actionButtons.style.gap = '0.5rem';
}
function syncMoveModeRoundFromDemoRound() {
    if (!elements.moveModeRoundInput || !elements.demoRoundInput)
        return;
    elements.moveModeRoundInput.value = Math.max(1, parseInt(elements.demoRoundInput.value) || 1);
}
function syncMoveModeRoundToDemoRound() {
    if (!elements.moveModeRoundInput)
        return;
    const value = Math.max(1, parseInt(elements.moveModeRoundInput.value) || 1);
    elements.moveModeRoundInput.value = value;
    if (elements.demoRoundInput)
        elements.demoRoundInput.value = value;
}
function incrementMoveModeRound() {
    const current = elements.moveModeRoundInput ? parseInt(elements.moveModeRoundInput.value) : (elements.demoRoundInput ? parseInt(elements.demoRoundInput.value) : 1);
    const next = Math.max(1, (Number.isFinite(current) ? current : 1) + 1);
    if (elements.moveModeRoundInput)
        elements.moveModeRoundInput.value = next;
    if (elements.demoRoundInput)
        elements.demoRoundInput.value = next;
}
function getMoveModeTeamStats(teamId) {
    const stats = { gold: getTeamGold(teamId), units: 0, population: 0, castles: 0 };
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i][j];
            if (!cell)
                continue;
            if (cell.terrain === 'castle' && cell.terrainTeam === teamId) {
                stats.castles++;
            }
            if (cell.unit && cell.unitTeam === teamId) {
                const unit = appData.units.find(u => u.id === cell.unit);
                stats.units++;
                stats.population += unit ? (unit.population || 0) : 0;
            }
        }
    }
    return stats;
}
function isTeamEliminated(teamId) {
    const stats = getMoveModeTeamStats(teamId);
    return stats.castles === 0 && stats.units === 0;
}
function neutralizeTeamBuildings(teamId) {
    let neutralizedBuildings = 0;
    for (let row = 0; row < appData.rows; row++) {
        for (let col = 0; col < appData.cols; col++) {
            const cell = appData.gridData[row]?.[col];
            if (!cell || cell.terrainTeam !== teamId)
                continue;
            if (cell.terrain !== 'castle' && cell.terrain !== 'house')
                continue;
            cell.terrainTeam = null;
            neutralizedBuildings++;
        }
    }
    return neutralizedBuildings;
}
function settleNaturalTeamElimination(teamId) {
    if (!teamId || !isTeamEliminated(teamId))
        return 0;
    return neutralizeTeamBuildings(teamId);
}
function getActiveMoveModeTeams() {
    return getOrderedTeams().filter(team => team.playerType !== 0 && !isTeamEliminated(team.id));
}
function renderMoveModeTeamStats() {
    if (!elements.moveModeTeamStats)
        return;
    const teams = getActiveMoveModeTeams();
    if (teams.length === 0) {
        elements.moveModeTeamStats.innerHTML = '<div class="text-gray-500 text-center">暂无启用队伍</div>';
        return;
    }
    elements.moveModeTeamStats.innerHTML = `
                <div class="overflow-x-auto">
                    <table class="w-full text-[10px] border-collapse leading-tight">
                        <thead>
                            <tr class="bg-gray-100">
                                <th class="border border-gray-300 px-1 py-0.5 text-left">队</th>
                                <th class="border border-gray-300 px-1 py-0.5 text-center">金</th>
                                <th class="border border-gray-300 px-1 py-0.5 text-center">兵</th>
                                <th class="border border-gray-300 px-1 py-0.5 text-center">口</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${teams.map(team => {
        const stats = getMoveModeTeamStats(team.id);
        const activeClass = team.id === appData.currentMoveTeam ? 'bg-teal-50 text-teal-800 font-semibold' : '';
        return `<tr class="${activeClass}">
                                    <td class="border border-gray-300 px-1 py-0.5">${team.name}</td>
                                    <td class="border border-gray-300 px-1 py-0.5 text-center">${stats.gold}</td>
                                    <td class="border border-gray-300 px-1 py-0.5 text-center">${stats.units}</td>
                                    <td class="border border-gray-300 px-1 py-0.5 text-center">${stats.population}</td>
                                </tr>`;
    }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
}
function updateMoveModeRefreshTargetButton() {
    if (!elements.refreshMoveTargetBtn)
        return;
    const isAssaultRemainderMove = appData.currentMoveAction
        && appData.currentMoveAction.postAttackMoveOnly
        && appData.currentMoveAction.allowMove
        && !appData.currentMoveAction.hasMoved;
    const active = appData.activePanel === 'moveMode'
        && appData.selectedCell
        && (!appData.currentMoveAction || isAssaultRemainderMove)
        && isSelectedMoveModeAiUnit()
        && Array.isArray(appData.calculationResults)
        && appData.calculationResults.some(result => Number.isFinite(result.value));
    elements.refreshMoveTargetBtn.disabled = !active;
}
function getEnabledMoveModeTeams() {
    return getActiveMoveModeTeams();
}
function ensureMoveModeCurrentTeam() {
    const enabledTeams = getEnabledMoveModeTeams();
    if (enabledTeams.length === 0) {
        appData.currentMoveTeam = null;
        return null;
    }
    if (appData.currentMoveTeam && enabledTeams.some(team => team.id === appData.currentMoveTeam)) {
        return appData.currentMoveTeam;
    }
    appData.currentMoveTeam = enabledTeams[0].id;
    return appData.currentMoveTeam;
}
function getNextMoveModeTeamId(currentTeamId) {
    const orderedTeams = getOrderedTeams();
    if (orderedTeams.length === 0)
        return null;
    const currentIndex = orderedTeams.findIndex(team => team.id === currentTeamId);
    const startIndex = currentIndex >= 0 ? currentIndex : -1;
    for (let offset = 1; offset <= orderedTeams.length; offset++) {
        const team = orderedTeams[(startIndex + offset) % orderedTeams.length];
        if (team && team.playerType !== 0 && !isTeamEliminated(team.id))
            return team.id;
    }
    return null;
}
function captureMoveModeHistorySnapshot() {
    const snapshot = cloneMoveDebugState();
    snapshot.moveModeRound = elements.moveModeRoundInput
        ? Math.max(1, parseInt(elements.moveModeRoundInput.value) || 1)
        : 1;
    snapshot.moveModeRecordedActionCount = Array.isArray(appData.moveModeRecordedActions)
        ? appData.moveModeRecordedActions.length : 0;
    return snapshot;
}
function updateMoveModeHistoryButtons() {
    const sameTeam = !!appData.currentMoveTeam
        && appData.moveModeHistoryTeamId === appData.currentMoveTeam;
    const hasInProgressAction = sameTeam && !!(appData.currentMoveAction || appData.recruitmentMove);
    const hasTurnUndo = sameTeam && (hasInProgressAction
        || (Array.isArray(appData.moveModeTurnHistory) && appData.moveModeTurnHistory.length > 0));
    const hasUndo = hasTurnUndo
        || (Array.isArray(appData.moveModeCompletedTurnHistory)
            && appData.moveModeCompletedTurnHistory.length > 0);
    if (elements.undoMoveStepBtn)
        elements.undoMoveStepBtn.disabled = !hasUndo;
    if (elements.restartMoveTurnBtn)
        elements.restartMoveTurnBtn.disabled = !hasTurnUndo;
}
function resetMoveModeHistoryBaseline(preserveCompletedTurns = false) {
    if (!preserveCompletedTurns)
        appData.moveModeCompletedTurnHistory = [];
    if (!appData.currentMoveTeam) {
        appData.moveModeTurnHistory = [];
        appData.moveModeTurnStartSnapshot = null;
        appData.moveModeLastCommittedSnapshot = null;
        appData.moveModeHistoryTeamId = null;
        updateMoveModeHistoryButtons();
        return;
    }
    const baseline = captureMoveModeHistorySnapshot();
    appData.moveModeTurnHistory = [];
    appData.moveModeTurnStartSnapshot = JSON.parse(JSON.stringify(baseline));
    appData.moveModeLastCommittedSnapshot = JSON.parse(JSON.stringify(baseline));
    appData.moveModeHistoryTeamId = appData.currentMoveTeam;
    updateMoveModeHistoryButtons();
}
function saveMoveModeCompletedTurn() {
    ensureMoveModeHistoryBaseline();
    if (!appData.currentMoveTeam || !appData.moveModeTurnStartSnapshot)
        return;
    if (!Array.isArray(appData.moveModeCompletedTurnHistory)) {
        appData.moveModeCompletedTurnHistory = [];
    }
    const completedSnapshot = appData.moveModeLastCommittedSnapshot
        ? JSON.parse(JSON.stringify(appData.moveModeLastCommittedSnapshot))
        : captureMoveModeHistorySnapshot();
    appData.moveModeCompletedTurnHistory.push({
        snapshot: completedSnapshot,
        turnHistory: appData.moveModeTurnHistory,
        turnStartSnapshot: appData.moveModeTurnStartSnapshot,
        historyTeamId: appData.moveModeHistoryTeamId
    });
}
function restorePreviousMoveModeTurn() {
    if (!Array.isArray(appData.moveModeCompletedTurnHistory)
        || !appData.moveModeCompletedTurnHistory.length)
        return false;
    const completedTurn = appData.moveModeCompletedTurnHistory.pop();
    if (!restoreMoveModeHistorySnapshot(completedTurn.snapshot))
        return false;
    appData.moveModeTurnHistory = completedTurn.turnHistory || [];
    appData.moveModeTurnStartSnapshot = completedTurn.turnStartSnapshot || null;
    appData.moveModeLastCommittedSnapshot = captureMoveModeHistorySnapshot();
    appData.moveModeHistoryTeamId = completedTurn.historyTeamId || appData.currentMoveTeam;
    updateMoveModeHistoryButtons();
    return true;
}
function ensureMoveModeHistoryBaseline() {
    if (!appData.currentMoveTeam) {
        updateMoveModeHistoryButtons();
        return;
    }
    if (!appData.moveModeTurnStartSnapshot
        || appData.moveModeHistoryTeamId !== appData.currentMoveTeam) {
        resetMoveModeHistoryBaseline();
    }
    else {
        updateMoveModeHistoryButtons();
    }
}
function restoreMoveModeHistorySnapshot(snapshot) {
    if (!snapshot)
        return false;
    appData.demoTeamLoopToken++;
    appData.demoTeamTurn = null;
    appData.demoEnemyMovementBlocking = false;
    appData.moveModePendingActionRecord = null;
    if (Number.isInteger(snapshot.moveModeRecordedActionCount)) {
        appData.moveModeRecordedActions = (appData.moveModeRecordedActions || []).slice(0, snapshot.moveModeRecordedActionCount);
        appData.moveModeRecordedActions.forEach((action, index) => { action.index = index; });
        updateMoveModeActionsRecordStatus();
    }
    clearMoveModeInteractionState();
    restoreMoveDebugState(snapshot);
    const round = Math.max(1, parseInt(snapshot.moveModeRound) || 1);
    if (elements.moveModeRoundInput)
        elements.moveModeRoundInput.value = round;
    if (elements.demoRoundInput)
        elements.demoRoundInput.value = round;
    clearMoveModeInteractionState();
    updateMoveModeCurrentTeamLabel();
    renderGrid();
    return true;
}
function undoMoveModeStep() {
    ensureMoveModeHistoryBaseline();
    if (appData.currentMoveAction || appData.recruitmentMove) {
        if (restoreMoveModeHistorySnapshot(appData.moveModeLastCommittedSnapshot)) {
            appData.moveModeLastCommittedSnapshot = captureMoveModeHistorySnapshot();
            updateMoveModeHistoryButtons();
        }
        return;
    }
    if (!appData.moveModeTurnHistory.length) {
        restorePreviousMoveModeTurn();
        return;
    }
    const snapshot = appData.moveModeTurnHistory.pop();
    if (!appData.moveModeTurnHistory.length && restorePreviousMoveModeTurn())
        return;
    if (!restoreMoveModeHistorySnapshot(snapshot))
        return;
    appData.moveModeLastCommittedSnapshot = captureMoveModeHistorySnapshot();
    updateMoveModeHistoryButtons();
}
function restartMoveModeTurn() {
    ensureMoveModeHistoryBaseline();
    const hasInProgressAction = !!(appData.currentMoveAction || appData.recruitmentMove);
    if ((!appData.moveModeTurnHistory.length && !hasInProgressAction)
        || !appData.moveModeTurnStartSnapshot)
        return;
    const snapshot = JSON.parse(JSON.stringify(appData.moveModeTurnStartSnapshot));
    if (!restoreMoveModeHistorySnapshot(snapshot))
        return;
    appData.moveModeTurnHistory = [];
    appData.moveModeLastCommittedSnapshot = captureMoveModeHistorySnapshot();
    updateMoveModeHistoryButtons();
}
function isMoveModeRoundWrapped(currentTeamId, nextTeamId) {
    const orderedTeams = getOrderedTeams();
    const currentIndex = orderedTeams.findIndex(team => team.id === currentTeamId);
    const nextIndex = orderedTeams.findIndex(team => team.id === nextTeamId);
    return currentIndex >= 0 && nextIndex >= 0 && nextIndex <= currentIndex;
}
function updateMoveModeCurrentTeamLabel(turnStart = null) {
    if (!elements.moveModeCurrentTeam)
        return;
    const team = appData.teams.find(t => t.id === appData.currentMoveTeam);
    if (!team) {
        elements.moveModeCurrentTeam.textContent = '当前无可行动队伍';
        return;
    }
    const typeName = isAiPlayerType(team.playerType) ? (team.playerType === 3 ? '困难AI' : '简版AI') : (team.playerType === 1 ? '玩家' : '中立');
    const startText = turnStart
        ? `；回合开始：金币+${turnStart.gold.income}，墓碑${turnStart.tombstoneChanged ? '有变化' : '无变化'}，血量死亡${turnStart.health.dead}`
        : '';
    elements.moveModeCurrentTeam.textContent = `当前行动：${team.name}（${typeName}）${startText}`;
    renderMoveModeTeamStats();
    updateMoveModeRefreshTargetButton();
}
function clearMoveModeInteractionState() {
    appData.selectedCell = null;
    appData.currentMoveAction = null;
    appData.recruitmentMove = null;
    appData.attackMode = false;
    appData.attackTargets = [];
    appData.healMode = false;
    appData.healTargets = [];
    appData.supportMode = false;
    appData.supportTargets = [];
    appData.summonMode = false;
    appData.summonTargets = [];
    appData.calculationResults = null;
    clearAiActionButtonScores();
    clearMoveRangeHighlight();
    clearAttackHighlight();
    clearHealHighlight();
    clearSupportHighlight();
    clearSummonHighlight();
    if (elements.moveModeActions)
        elements.moveModeActions.classList.add('hidden');
    if (elements.moveModeSelectedUnit)
        elements.moveModeSelectedUnit.classList.add('hidden');
    if (elements.moveModeHelp)
        elements.moveModeHelp.classList.remove('hidden');
    updateMoveModeRefreshTargetButton();
    updateMoveModeHistoryButtons();
}
function getMoveModeAiSuggestedUnit() {
    if (appData.activePanel !== 'moveMode')
        return null;
    const teamId = appData.currentMoveTeam;
    const team = appData.teams.find(t => t.id === teamId);
    if (!team || !isAiPlayerType(team.playerType))
        return null;
    return calculateNextTeamActionUnit(teamId);
}
function endMoveModeTurn() {
    const currentTeamId = appData.currentMoveTeam || ensureMoveModeCurrentTeam();
    const nextTeamId = getNextMoveModeTeamId(currentTeamId);
    if (!nextTeamId) {
        alert('当前没有可行动队伍');
        return;
    }
    saveMoveModeCompletedTurn();
    appendMoveModeAction(makeMoveModeAction('NEXT_TURN'));
    clearMoveModeInteractionState();
    settleDemoTeamTurnEnd(currentTeamId);
    appData.currentMoveTeam = nextTeamId;
    if (isMoveModeRoundWrapped(currentTeamId, nextTeamId)) {
        incrementMoveModeRound();
    }
    const turnStart = settleDemoTeamTurnStart(nextTeamId);
    resetMoveModeHistoryBaseline(true);
    updateMoveModeCurrentTeamLabel(turnStart);
    renderGrid();
}
function getMoveModeAiActionScores(row, col, availableActions = []) {
    const scores = {};
    const cell = appData.gridData[row]?.[col];
    const unit = cell && cell.unit ? appData.units.find(u => u.id === cell.unit) : null;
    const unitTeam = cell && cell.unitTeam ? appData.teams.find(t => t.id === cell.unitTeam) : null;
    if (!cell || !unit || !unitTeam || !isMoveModeAiUnit(row, col))
        return scores;
    const availableIds = new Set(availableActions.map(action => action.id));
    if (availableIds.has('attack')) {
        const attackEntry = safeCalculateScoreList(calculateAttackScores, row, col)
            .find(score => score.row === row && score.col === col);
        if (attackEntry && Number.isFinite(attackEntry.value))
            scores.attack = attackEntry.value;
    }
    if (availableIds.has('heal')) {
        const healScores = safeCalculateScoreList(calculateHealScores, row, col);
        if (healScores.length > 0)
            scores.heal = Math.max(...healScores.map(score => score.value || 0));
    }
    if (availableIds.has('support')) {
        const supportScores = safeCalculateScoreList(calculateSupportScores, row, col);
        if (supportScores.length > 0)
            scores.support = Math.max(...supportScores.map(score => score.value || 0));
    }
    if (availableIds.has('summon') && calculateSummonTargets(row, col).length > 0) {
        scores.summon = 100;
    }
    if (availableIds.has('occupy')) {
        const occupyScore = getOccupyScoreForCell(row, col, unit, unitTeam);
        if (occupyScore !== null)
            scores.occupy = occupyScore;
    }
    if (availableIds.has('repair')) {
        const repairScore = getRepairScoreForCell(row, col, unit, unitTeam.id);
        if (repairScore !== null)
            scores.repair = repairScore;
    }
    return scores;
}
function renderMoveModeAiMovementScores(row, col) {
    if (!isMoveModeAiUnit(row, col)) {
        appData.calculationResults = null;
        return;
    }
    const isAssaultRemainderMove = appData.currentMoveAction
        && appData.currentMoveAction.postAttackMoveOnly
        && !appData.currentMoveAction.hasMoved;
    const scores = isAssaultRemainderMove
        ? getAssaultPostAttackMovementScores(row, col, appData.currentMoveAction.remainingMove || 0, appData.currentMoveAction.assaultOrigin)
        : calculateSingleUnitTotalScores(row, col, true);
    appData.calculationResults = scores.map(score => ({
        row: score.row,
        col: score.col,
        value: score.value,
        targetRow: score.target ? score.target.row : undefined,
        targetCol: score.target ? score.target.col : undefined,
        showZero: true,
        displayFloor: true
    }));
    updateMoveModeRefreshTargetButton();
}
function refreshMoveModeAiTargets() {
    const isAssaultRemainderMove = appData.currentMoveAction
        && appData.currentMoveAction.postAttackMoveOnly
        && appData.currentMoveAction.allowMove
        && !appData.currentMoveAction.hasMoved;
    if (!appData.selectedCell || !isSelectedMoveModeAiUnit()
        || (appData.currentMoveAction && !isAssaultRemainderMove))
        return;
    updateMoveModeRange();
}
function renderMoveModeAiTargetScores(actionId) {
    if (!isSelectedMoveModeAiUnit() || !appData.selectedCell) {
        appData.calculationResults = null;
        renderGrid();
        return;
    }
    const { row, col } = appData.selectedCell;
    let scores = [];
    if (actionId === 'attack') {
        const attackEntry = safeCalculateScoreList(calculateAttackScores, row, col)
            .find(score => score.row === row && score.col === col);
        scores = (appData.attackTargets || calculateAttackTargets(row, col)).map(target => {
            const scored = attackEntry && attackEntry.targets
                ? attackEntry.targets.find(item => item.row === target.row && item.col === target.col)
                : null;
            return { row: target.row, col: target.col, value: scored ? scored.score : 0, showZero: true };
        });
    }
    else if (actionId === 'heal') {
        const scoreMap = buildScoreMap(safeCalculateScoreList(calculateHealScores, row, col));
        scores = (appData.healTargets || calculateHealTargets(row, col)).map(target => {
            const scored = scoreMap.get(target.row + ',' + target.col);
            return { row: target.row, col: target.col, value: scored ? scored.value : 0, showZero: true };
        });
    }
    else if (actionId === 'support') {
        const scoreMap = buildScoreMap(safeCalculateScoreList(calculateSupportScores, row, col));
        scores = (appData.supportTargets || calculateSupportTargets(row, col)).map(target => {
            const scored = scoreMap.get(target.row + ',' + target.col);
            return { row: target.row, col: target.col, value: scored ? scored.value : 0, showZero: true };
        });
    }
    else if (actionId === 'summon') {
        scores = (appData.summonTargets || calculateSummonTargets(row, col)).map(target => ({
            row: target.row,
            col: target.col,
            value: 10,
            showZero: true
        }));
    }
    appData.calculationResults = scores.map(score => ({ ...score, displayFloor: true }));
    renderGrid();
}
function formatRecruitWeightValue(value) {
    const numericValue = Number(value) || 0;
    return Number.isInteger(numericValue)
        ? String(numericValue)
        : String(Math.round(numericValue * 100) / 100);
}
function getMoveModeRecruitPreview(teamId, row, col) {
    const team = appData.teams.find(t => t.id === teamId);
    if (!team || !isAiPlayerType(team.playerType)) {
        return { isAiTeam: false, weights: {}, nextUnitId: null, randomSelectableUnitIds: [], guardLimitExemptUnitIds: [], reason: '' };
    }
    const weights = getCurrentRecruitmentWeights();
    const selection = chooseDemoRecruitPlan(teamId);
    const plan = selection && selection.plan ? selection.plan : null;
    const isSelectedCastleGuardRecruit = !!(plan
        && selection.reason === '守城单位招募'
        && plan.castle
        && plan.castle.row === row
        && plan.castle.col === col);
    return {
        isAiTeam: true,
        weights: weights[teamId] || {},
        nextUnitId: plan ? plan.unitId : null,
        randomSelectableUnitIds: getMoveModeRandomRecruitUnitIds(teamId, row, col, weights),
        guardLimitExemptUnitIds: isSelectedCastleGuardRecruit ? [plan.unitId] : [],
        reason: selection ? selection.reason : ''
    };
}
function showActionMenu() {
    try {
        if (!appData.selectedCell) {
            if (elements.moveModeActions)
                elements.moveModeActions.classList.add('hidden');
            return;
        }
        const { row, col } = appData.selectedCell;
        if (row === undefined || col === undefined || row < 0 || col < 0) {
            if (elements.moveModeActions)
                elements.moveModeActions.classList.add('hidden');
            return;
        }
        const cellData = appData.gridData[row][col];
        const recruitableCastle = getRecruitableCastleInfo(row, col);
        if (appData.activePanel === 'moveMode') {
            const activeTeamId = ensureMoveModeCurrentTeam();
            const selectedTeamId = cellData && cellData.unit
                ? cellData.unitTeam
                : (recruitableCastle ? recruitableCastle.teamId : null);
            if (selectedTeamId && selectedTeamId !== activeTeamId) {
                if (elements.moveModeActions)
                    elements.moveModeActions.classList.add('hidden');
                return;
            }
        }
        if (!cellData || !cellData.unit) {
            if (recruitableCastle) {
                const buttonsHtml = `

                <button class="action-btn action-recruit bg-yellow-100 text-yellow-700 hover:bg-yellow-200 rounded-lg p-3 flex flex-col items-center transition-colors" data-action="recruit">

                    <i class="fa fa-plus-circle text-xl mb-1"></i>

                    <span class="text-sm font-medium">招募</span>

                </button>

                `;
                if (elements.actionButtons) {
                    setActionButtonsGridColumns(2);
                    elements.actionButtons.innerHTML = buttonsHtml;
                }
                if (elements.moveModeActions)
                    elements.moveModeActions.classList.remove('hidden');
                if (elements.moveModeHelp)
                    elements.moveModeHelp.classList.add('hidden');
                if (elements.moveModeSelectedUnit)
                    elements.moveModeSelectedUnit.classList.add('hidden');
                elements.actionButtons.querySelectorAll('.action-btn').forEach(btn => {
                    btn.addEventListener('click', handleActionClick);
                });
                return;
            }
            if (elements.moveModeActions)
                elements.moveModeActions.classList.add('hidden');
            return;
        }
        if (cellData.unitStandby) {
            appData.currentMoveAction = null;
            appData.recruitmentMove = null;
            appData.calculationResults = null;
            clearMoveRangeHighlight();
            if (recruitableCastle) {
                const buttonsHtml = `

                <button class="action-btn action-recruit bg-yellow-100 text-yellow-700 hover:bg-yellow-200 rounded-lg p-3 flex flex-col items-center transition-colors" data-action="recruit">

                    <i class="fa fa-plus-circle text-xl mb-1"></i>

                    <span class="text-sm font-medium">招募</span>

                </button>

                `;
                if (elements.actionButtons) {
                    setActionButtonsGridColumns(2);
                    elements.actionButtons.innerHTML = buttonsHtml;
                }
                if (elements.moveModeActions)
                    elements.moveModeActions.classList.remove('hidden');
                if (elements.moveModeSelectedUnit)
                    elements.moveModeSelectedUnit.classList.add('hidden');
                elements.actionButtons.querySelectorAll('.action-btn').forEach(btn => {
                    btn.addEventListener('click', handleActionClick);
                });
                return;
            }
            if (elements.moveModeActions)
                elements.moveModeActions.classList.add('hidden');
            return;
        }
        if (!appData.units || !Array.isArray(appData.units)) {
            if (elements.moveModeActions)
                elements.moveModeActions.classList.add('hidden');
            return;
        }
        const unit = appData.units.find(u => u && u.id === cellData.unit);
        if (!unit) {
            if (elements.moveModeActions)
                elements.moveModeActions.classList.add('hidden');
            return;
        }
        const allActions = [
            { id: 'move', name: '移动', icon: 'fa-walking', color: 'blue' },
            { id: 'attack', name: '攻击', icon: 'fa-bolt', color: 'red' },
            { id: 'heal', name: '治疗', icon: 'fa-heart', color: 'green', ability: '治疗' },
            { id: 'support', name: '支援', icon: 'fa-hands-helping', color: 'blue', ability: '支援' },
            { id: 'summon', name: '召唤', icon: 'fa-magic', color: 'purple', ability: '召唤' },
            { id: 'occupy', name: '占领', icon: 'fa-flag', color: 'orange', ability: '占领' },
            { id: 'repair', name: '修复', icon: 'fa-tools', color: 'gray', ability: '修复' },
            { id: 'recruit', name: '招募', icon: 'fa-plus-circle', color: 'orange' },
            { id: 'wait', name: '待机', icon: 'fa-pause', color: 'gray' },
            { id: 'cancelMove', name: '放弃', icon: 'fa-undo', color: 'gray' }
        ];
        const availableActions = allActions.filter(action => {
            if (action.id === 'recruit')
                return !!recruitableCastle;
            if (appData.currentMoveAction && appData.currentMoveAction.recruitmentForcedMove && action.id === 'cancelMove')
                return false;
            if (appData.currentMoveAction && appData.currentMoveAction.postAttackMoveOnly) {
                if (action.id === 'cancelMove')
                    return !!appData.currentMoveAction.hasMoved;
                if (action.id === 'move')
                    return !appData.currentMoveAction.hasMoved && appData.currentMoveAction.remainingMove > 0;
                return action.id === 'wait';
            }
            if (action.id === 'move')
                return !appData.currentMoveAction;
            if (action.id === 'cancelMove') {
                return !!(appData.currentMoveAction && appData.currentMoveAction.hasMoved);
            }
            if (action.id === 'attack')
                return hasAvailableActionTarget(action.id, row, col, cellData, unit);
            if (!action.ability)
                return true;
            if (!(unit.abilities && unit.abilities.includes(action.ability)))
                return false;
            return hasAvailableActionTarget(action.id, row, col, cellData, unit);
        });
        const aiActionScores = (appData.currentMoveAction && appData.currentMoveAction.awaitingAction && isMoveModeAiUnit(row, col))
            ? getMoveModeAiActionScores(row, col, availableActions)
            : {};
        const buttonsHtml = availableActions.map(action => {
            let bgClass, textClass, hoverClass;
            switch (action.color) {
                case 'red':
                    bgClass = 'bg-red-100';
                    textClass = 'text-red-700';
                    hoverClass = 'hover:bg-red-200';
                    break;
                case 'green':
                    bgClass = 'bg-green-100';
                    textClass = 'text-green-700';
                    hoverClass = 'hover:bg-green-200';
                    break;
                case 'blue':
                    bgClass = 'bg-blue-100';
                    textClass = 'text-blue-700';
                    hoverClass = 'hover:bg-blue-200';
                    break;
                case 'purple':
                    bgClass = 'bg-purple-100';
                    textClass = 'text-purple-700';
                    hoverClass = 'hover:bg-purple-200';
                    break;
                case 'orange':
                    bgClass = 'bg-orange-100';
                    textClass = 'text-orange-700';
                    hoverClass = 'hover:bg-orange-200';
                    break;
                case 'gray':
                    bgClass = 'bg-gray-100';
                    textClass = 'text-gray-700';
                    hoverClass = 'hover:bg-gray-200';
                    break;
                default:
                    bgClass = 'bg-gray-100';
                    textClass = 'text-gray-700';
                    hoverClass = 'hover:bg-gray-200';
            }
            const scoreHtml = Object.prototype.hasOwnProperty.call(aiActionScores, action.id)
                ? `<span class="ai-action-score opacity-80 mt-1" style="font-size:10px;line-height:1.1;">最高${aiActionScores[action.id]}</span>`
                : '';
            return `

                <button class="action-btn action-${action.id} ${bgClass} ${textClass} ${hoverClass} rounded-lg p-3 flex flex-col items-center transition-colors" data-action="${action.id}">

                    <i class="fa ${action.icon} text-xl mb-1"></i>

                    <span class="text-sm font-medium">${action.name}</span>
                    ${scoreHtml}

                </button>

                `;
        }).join('');
        if (elements.actionButtons) {
            setActionButtonsGridColumns(2);
            elements.actionButtons.innerHTML = buttonsHtml;
        }
        else {
        }
        if (elements.moveModeActions) {
            elements.moveModeActions.classList.remove('hidden');
        }
        else {
        }
        if (elements.moveModeHelp)
            elements.moveModeHelp.classList.add('hidden');
        if (elements.moveModeSelectedUnit) {
            elements.moveModeSelectedUnit.classList.remove('hidden');
            const unitDef = appData.units.find(u => u.id === cellData.unit);
            if (unitDef) {
                if (elements.selectedUnitName)
                    elements.selectedUnitName.textContent = unitDef.name;
                if (elements.selectedUnitTeam) {
                    elements.selectedUnitTeam.textContent = cellData.unitTeam === 'blue' ? '我方' : '敌方';
                    elements.selectedUnitTeam.className = 'text-xs px-2 py-0.5 rounded ' + (cellData.unitTeam === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700');
                }
                if (elements.selectedUnitLevel)
                    elements.selectedUnitLevel.textContent = 'Lv.' + cellData.unitLevel;
                if (elements.selectedUnitHp)
                    elements.selectedUnitHp.textContent = cellData.unitHealth + ' / ' + (100 + unitDef.hpUp * cellData.unitLevel);
                if (elements.selectedUnitStatus) {
                    elements.selectedUnitStatus.textContent = getStatusDisplayText(cellData);
                }
                if (elements.selectedUnitWait) {
                    elements.selectedUnitWait.classList.toggle('hidden', cellData.unitStandby !== true);
                }
            }
        }
        if (elements.actionButtons) {
            elements.actionButtons.querySelectorAll('.action-btn').forEach(btn => {
                btn.addEventListener('click', handleActionClick);
            });
        }
    }
    catch (error) {
        console.error('showActionMenu error:', error);
    }
}
function showRecruitMenu() {
    if (!appData.selectedCell) {
        appData.calculationResults = null;
        return;
    }
    const { row, col } = appData.selectedCell;
    const recruitableCastle = getRecruitableCastleInfo(row, col);
    if (!recruitableCastle) {
        alert('该位置不可招募');
        return;
    }
    const teamId = recruitableCastle.teamId;
    const availableGold = getTeamGold(teamId);
    const commanderExists = teamHasCommander(teamId);
    const recruitPreview = getMoveModeRecruitPreview(teamId, row, col);
    const recruitUnits = appData.units.filter(unit => unit.id !== 'skeleton');
    const buttonsHtml = recruitUnits.map(unit => {
        const cost = getRecruitCost(unit.id, teamId);
        const blockedByCommander = unit.id === 'commander' && commanderExists;
        const blockedByGold = availableGold < cost;
        const blockedByPopulation = wouldExceedTeamPopulationLimit(teamId, unit.id);
        const blockedByLimit = isRecruitLimitReached(teamId, unit.id);
        const isRandomRecruitOption = recruitPreview.randomSelectableUnitIds.includes(unit.id);
        const isGuardRecruitOption = recruitPreview.guardLimitExemptUnitIds.includes(unit.id);
        const disabled = blockedByCommander || blockedByGold || blockedByPopulation || (blockedByLimit && !isRandomRecruitOption && !isGuardRecruitOption);
        const title = blockedByCommander ? '本队已有指挥官' : (blockedByGold ? '金币不足' : (blockedByPopulation ? '总人口已达上限' : ((blockedByLimit && !isRandomRecruitOption && !isGuardRecruitOption) ? '已达招募上限' : '')));
        const weight = formatRecruitWeightValue(recruitPreview.weights[unit.id]);
        const isNextRecruit = !isRandomRecruitOption && recruitPreview.nextUnitId === unit.id;
        const weightHtml = recruitPreview.isAiTeam
            ? `<span class="leading-tight ${(isNextRecruit || isRandomRecruitOption) ? 'font-semibold text-orange-700' : ''}" style="font-size:10px;">权重:${weight}${isRandomRecruitOption ? ' - 随机招募' : (isNextRecruit ? ' - 下一个招募' : '')}</span>`
            : '';
        return `

                <button class="recruit-unit-btn ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ((isNextRecruit || isRandomRecruitOption) ? 'bg-orange-100 text-orange-800 hover:bg-orange-200 ring-2 ring-orange-300' : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200')} rounded-lg p-2 flex flex-col items-center transition-colors min-w-0" style="width:100%;min-width:0;" data-unit="${unit.id}" ${disabled ? 'disabled' : ''} title="${title}">

                    <span class="text-lg font-bold">${unit.abbreviation || '?'}</span>

                    <span class="text-xs font-medium text-center leading-tight">${unit.name} - ${cost}</span>

                    ${weightHtml}

                </button>

                `;
    }).join('');
    if (elements.actionButtons) {
        setActionButtonsGridColumns(4);
        elements.actionButtons.innerHTML = buttonsHtml + `

                <button class="action-btn action-back bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg p-2 flex flex-col items-center transition-colors" data-action="backToActions">

                    <i class="fa fa-arrow-left text-lg mb-1"></i>

                    <span class="text-xs font-medium">返回</span>

                </button>

                `;
        elements.actionButtons.querySelectorAll('.recruit-unit-btn').forEach(btn => {
            btn.addEventListener('click', () => executeRecruit(btn.dataset.unit));
        });
        elements.actionButtons.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', handleActionClick);
        });
    }
    if (elements.moveModeActions)
        elements.moveModeActions.classList.remove('hidden');
}
function executeRecruit(unitId) {
    if (!appData.selectedCell) {
        appData.calculationResults = null;
        return;
    }
    const { row, col } = appData.selectedCell;
    const cellData = appData.gridData[row]?.[col];
    const recruitableCastle = getRecruitableCastleInfo(row, col);
    const unitDef = appData.units.find(u => u.id === unitId);
    if (!cellData || !recruitableCastle || !unitDef || unitId === 'skeleton') {
        alert('无法招募该单位');
        return;
    }
    const teamId = recruitableCastle.teamId;
    if (unitId === 'commander' && teamHasCommander(teamId)) {
        alert('本队已有指挥官，不能再次招募指挥官');
        showRecruitMenu();
        return;
    }
    const cost = getRecruitCost(unitId, teamId);
    const availableGold = getTeamGold(teamId);
    if (availableGold < cost) {
        alert('金币不足');
        showRecruitMenu();
        return;
    }
    if (wouldExceedTeamPopulationLimit(teamId, unitId)) {
        alert('总人口已达上限');
        showRecruitMenu();
        return;
    }
    const recruitPreview = getMoveModeRecruitPreview(teamId, row, col);
    const randomRecruitUnitIds = getMoveModeRandomRecruitUnitIds(teamId, row, col, getCurrentRecruitmentWeights());
    const isGuardRecruitOption = recruitPreview.guardLimitExemptUnitIds.includes(unitId);
    if (isRecruitLimitReached(teamId, unitId) && !randomRecruitUnitIds.includes(unitId) && !isGuardRecruitOption) {
        alert('该单位已达招募上限');
        showRecruitMenu();
        return;
    }
    if (recruitableCastle.occupiedByCommander) {
        const reachable = calculateRecruitMovementRange(row, col, unitId, teamId);
        if (reachable.length === 0) {
            alert('没有可移动位置，招募已取消');
            showActionMenu();
            return;
        }
        setTeamGold(teamId, availableGold - cost);
        appendMoveModeAction(makeMoveModeAction('NONE', row, col, -1, -1, {
            unitId, unitIndex: UNIT_ID_TO_AEM[unitId]
        }));
        appData.recruitmentMove = {
            unitId,
            teamId,
            origin: { row, col },
            reachable
        };
        appData.selectedCell = { row, col };
        clearAttackHighlight();
        clearHealHighlight();
        clearSupportHighlight();
        clearSummonHighlight();
        renderMoveModeRecruitLandingScores();
        highlightRecruitmentMoveRange();
        if (elements.moveModeActions)
            elements.moveModeActions.classList.add('hidden');
        return;
    }
    if (cellData.unit) {
        alert('该城堡已有单位，不能招募');
        showActionMenu();
        return;
    }
    setTeamGold(teamId, availableGold - cost);
    appendMoveModeAction(makeMoveModeAction('NONE', row, col, -1, -1, {
        unitId, unitIndex: UNIT_ID_TO_AEM[unitId]
    }));
    setCellUnit(cellData, unitId, teamId, 0);
    appData.selectedCell = { row, col };
    appData.currentMoveTeam = teamId;
    clearCurrentMoveAction();
    clearRecruitmentMove();
    renderGrid();
    updateMoveModeRange();
    showActionMenu();
}
function handleActionClick(event) {
    const action = event.currentTarget.dataset.action;
    if (action === 'recruit') {
        clearAiActionButtonScores();
        appData.calculationResults = null;
        showRecruitMenu();
        return;
    }
    if (action === 'backToActions') {
        appData.calculationResults = null;
        showActionMenu();
        return;
    }
    if (action === 'cancelMove') {
        clearAiActionButtonScores();
        appData.calculationResults = null;
        cancelCurrentMoveAction();
        return;
    }
    if (action === 'move') {
        if (!appData.currentMoveAction) {
            updateMoveModeRange();
            return;
        }
        if (!appData.currentMoveAction.postAttackMoveOnly || appData.currentMoveAction.hasMoved)
            return;
        appData.currentMoveAction.allowMove = true;
        appData.currentMoveAction.awaitingAction = false;
        clearAiActionButtonScores();
        updateMoveModeRange();
        return;
    }
    if (action === 'attack') {
        const { row, col } = appData.selectedCell;
        const cellData = appData.gridData[row][col];
        if (cellData && cellData.unitStandby) {
            alert('该单位已待机，无法攻击');
            return;
        }
        appData.healMode = false;
        appData.healTargets = [];
        clearHealHighlight();
        appData.supportMode = false;
        appData.supportTargets = [];
        clearSupportHighlight();
        appData.summonMode = false;
        appData.summonTargets = [];
        clearSummonHighlight();
        appData.attackMode = true;
        clearAiActionButtonScores();
        appData.attackTargets = calculateAttackTargets(row, col);
        renderMoveModeAiTargetScores('attack');
        highlightAttackTargets();
        return;
    }
    if (action === 'heal') {
        const { row, col } = appData.selectedCell;
        const cellData = appData.gridData[row][col];
        const unitDef = cellData && cellData.unit ? appData.units.find(u => u.id === cellData.unit) : null;
        if (cellData && cellData.unitStandby) {
            alert('该单位已待机，无法治疗');
            return;
        }
        if (!unitDef || !unitDef.abilities || !unitDef.abilities.includes('治疗')) {
            alert('该单位没有治疗能力');
            return;
        }
        appData.attackMode = false;
        appData.attackTargets = [];
        clearAttackHighlight();
        appData.supportMode = false;
        appData.supportTargets = [];
        clearSupportHighlight();
        appData.summonMode = false;
        appData.summonTargets = [];
        clearSummonHighlight();
        appData.healMode = true;
        clearAiActionButtonScores();
        appData.healTargets = calculateHealTargets(row, col);
        renderMoveModeAiTargetScores('heal');
        highlightHealTargets();
        return;
    }
    if (action === 'support') {
        const { row, col } = appData.selectedCell;
        const cellData = appData.gridData[row][col];
        const unitDef = cellData && cellData.unit ? appData.units.find(u => u.id === cellData.unit) : null;
        if (cellData && cellData.unitStandby) {
            alert('该单位已待机，无法支援');
            return;
        }
        if (!unitDef || !unitDef.abilities || !unitDef.abilities.includes('支援')) {
            alert('该单位没有支援能力');
            return;
        }
        appData.attackMode = false;
        appData.attackTargets = [];
        clearAttackHighlight();
        appData.healMode = false;
        appData.healTargets = [];
        clearHealHighlight();
        appData.summonMode = false;
        appData.summonTargets = [];
        clearSummonHighlight();
        appData.supportMode = true;
        clearAiActionButtonScores();
        appData.supportTargets = calculateSupportTargets(row, col);
        renderMoveModeAiTargetScores('support');
        highlightSupportTargets();
        return;
    }
    if (action === 'summon') {
        const { row, col } = appData.selectedCell;
        const cellData = appData.gridData[row][col];
        const unitDef = cellData && cellData.unit ? appData.units.find(u => u.id === cellData.unit) : null;
        if (cellData && cellData.unitStandby) {
            alert('该单位已待机，无法召唤');
            return;
        }
        if (!unitDef || !unitDef.abilities || !unitDef.abilities.includes('召唤')) {
            alert('该单位没有召唤能力');
            return;
        }
        if ((cellData.unitStatus || '无') === '致盲') {
            alert('致盲状态下不可召唤');
            return;
        }
        appData.attackMode = false;
        appData.attackTargets = [];
        clearAttackHighlight();
        appData.healMode = false;
        appData.healTargets = [];
        clearHealHighlight();
        appData.supportMode = false;
        appData.supportTargets = [];
        clearSupportHighlight();
        appData.summonMode = true;
        clearAiActionButtonScores();
        appData.summonTargets = calculateSummonTargets(row, col);
        renderMoveModeAiTargetScores('summon');
        highlightSummonTargets();
        return;
    }
    if (action === 'occupy') {
        const { row, col } = appData.selectedCell;
        const cellData = appData.gridData[row][col];
        const unitDef = cellData && cellData.unit ? appData.units.find(u => u.id === cellData.unit) : null;
        const terrainDef = cellData && cellData.terrain ? appData.terrains.find(t => t.id === cellData.terrain) : null;
        if (!cellData || !cellData.unit || !unitDef || !unitDef.abilities || !unitDef.abilities.includes('占领')) {
            alert('该单位没有占领能力');
            return;
        }
        if (cellData.unitStandby) {
            alert('该单位已待机，无法占领');
            return;
        }
        if (!terrainDef || (terrainDef.name !== '房子' && terrainDef.name !== '城堡')) {
            alert('该地形不可占领');
            return;
        }
        if (terrainDef.name === '城堡' && !unitDef.abilities.includes('城主')) {
            alert('城堡需要城主能力');
            return;
        }
        const unitTeam = appData.teams.find(t => t.id === cellData.unitTeam);
        const ownerTeam = cellData.terrainTeam ? appData.teams.find(t => t.id === cellData.terrainTeam) : null;
        if (ownerTeam && unitTeam && ownerTeam.alliance === unitTeam.alliance) {
            alert('该地形已属于同盟');
            return;
        }
        queueMoveModeAction('OCCUPY', row, col);
        const previousOwnerTeamId = cellData.terrainTeam;
        cellData.terrainTeam = cellData.unitTeam;
        settleNaturalTeamElimination(previousOwnerTeamId);
        const standbyHealthPopups = processUnitStandbyEffects(row, col);
        appData.attackMode = false;
        appData.attackTargets = [];
        clearAttackHighlight();
        appData.healMode = false;
        appData.healTargets = [];
        clearHealHighlight();
        appData.supportMode = false;
        appData.supportTargets = [];
        clearSupportHighlight();
        appData.selectedCell = null;
        finishCurrentMoveAction();
        renderGrid();
        showStandbyHealthPopups(standbyHealthPopups);
        elements.moveModeActions.classList.add('hidden');
        return;
    }
    if (action === 'repair') {
        const { row, col } = appData.selectedCell;
        const cellData = appData.gridData[row][col];
        const unitDef = cellData && cellData.unit ? appData.units.find(u => u.id === cellData.unit) : null;
        const terrainDef = cellData && cellData.terrain ? appData.terrains.find(t => t.id === cellData.terrain) : null;
        if (!cellData || !cellData.unit || !unitDef || !unitDef.abilities || !unitDef.abilities.includes('修复')) {
            alert('该单位没有修复能力');
            return;
        }
        if (cellData.unitStandby) {
            alert('该单位已待机，无法修复');
            return;
        }
        if (!terrainDef || terrainDef.name !== '破房') {
            alert('当前地形不是破房');
            return;
        }
        queueMoveModeAction('REPAIR', row, col);
        cellData.terrain = 'house';
        cellData.terrainTeam = null;
        const standbyHealthPopups = processUnitStandbyEffects(row, col);
        appData.attackMode = false;
        appData.attackTargets = [];
        clearAttackHighlight();
        appData.healMode = false;
        appData.healTargets = [];
        clearHealHighlight();
        appData.supportMode = false;
        appData.supportTargets = [];
        clearSupportHighlight();
        appData.selectedCell = null;
        finishCurrentMoveAction();
        renderGrid();
        showStandbyHealthPopups(standbyHealthPopups);
        elements.moveModeActions.classList.add('hidden');
        return;
    }
    if (action === 'wait') {
        const { row, col } = appData.selectedCell;
        const cellData = appData.gridData[row][col];
        if (cellData) {
            if (!appData.moveModePendingActionRecord)
                queueMoveModeAction('STANDBY', row, col);
            const healthPopups = processUnitStandbyEffects(row, col);
            appData.calculationResults = null;
            clearAiActionButtonScores();
            appData.selectedCell = null;
            finishCurrentMoveAction();
            renderGrid();
            showStandbyHealthPopups(healthPopups);
        }
        elements.moveModeActions.classList.add('hidden');
        return;
    }
    alert(`执行操作: ${action}`);
}
function startDemoMode() {
    const demoType = document.querySelector('input[name="demoType"]:checked').value;
    if (demoType === 'unit') {
        demoSingleUnit();
    }
    else if (demoType === 'team') {
        demoTeamTurn();
    }
    else if (demoType === 'alliance') {
        startDemoAlliance();
    }
}
function demoSingleUnit() {
    if (!appData.selectedCell) {
        alert('请先在网格中选择一个单位');
        return;
    }
    const { row, col } = appData.selectedCell;
    const cellData = appData.gridData[row][col];
    if (!cellData.unit) {
        alert('未选中单位');
        return;
    }
    const unit = appData.units.find(u => u.id === cellData.unit);
    const team = appData.teams.find(t => t.id === cellData.unitTeam);
    const totalScores = calculateTotalScores(row, col);
    if (totalScores.length === 0) {
        alert('该单位无法移动');
        return;
    }
    const maxScore = Math.max(...totalScores.map(s => s.value));
    const bestPositions = totalScores.filter(s => s.value === maxScore);
    const chosenPosition = bestPositions[Math.floor(Math.random() * bestPositions.length)];
    const bestCell = appData.gridData[chosenPosition.row][chosenPosition.col];
    const bestTerrain = bestCell.terrain ? appData.terrains.find(t => t.id === bestCell.terrain) : null;
    let operationType = '待机';
    let operationDetails = '';
    let operationTarget = null;
    if (unit.abilities.includes('占领') || unit.abilities.includes('城主')) {
        const terrainTeam = appData.teams.find(t => t.id === bestCell.terrainTeam);
        const alliance = team ? team.alliance : null;
        if (bestTerrain && bestTerrain.name === '城堡' && (!terrainTeam || terrainTeam.alliance !== alliance)) {
            operationType = '占领';
            operationDetails = `占领 (${chosenPosition.row + 1}, ${chosenPosition.col + 1}) 的城堡`;
        }
        else if (bestTerrain && bestTerrain.name === '房子' && (!terrainTeam || terrainTeam.alliance !== alliance)) {
            operationType = '占领';
            operationDetails = `占领 (${chosenPosition.row + 1}, ${chosenPosition.col + 1}) 的房子`;
        }
    }
    if (operationType === '待机' && unit.abilities.includes('修复')) {
        if (bestTerrain && bestTerrain.name === '破房') {
            operationType = '修复';
            operationDetails = `修复 (${chosenPosition.row + 1}, ${chosenPosition.col + 1}) 的破房`;
        }
    }
    if (operationType === '待机' && unit.abilities.includes('治疗')) {
        const healScores = calculateHealScores(row, col);
        const attackScores = calculateAttackScores(row, col);
        const healAtPosition = healScores.filter(s => {
            const distance = Math.abs(s.row - chosenPosition.row) + Math.abs(s.col - chosenPosition.col);
            return distance <= 1;
        }).map(s => ({
            ...s,
            value: s.value + getSameTypeStationaryHealPenalty(unit.id, row, col, chosenPosition.row, chosenPosition.col, s.row, s.col)
        }));
        let maxHealScore = 0;
        let healTarget = null;
        if (healAtPosition.length > 0) {
            maxHealScore = Math.max(...healAtPosition.map(s => s.value));
            healTarget = healAtPosition.find(s => s.value === maxHealScore);
        }
        const attackAtPosition = attackScores.find(s => s.row === chosenPosition.row && s.col === chosenPosition.col);
        const maxAttackScore = attackAtPosition ? attackAtPosition.value : 0;
        let attackTarget = null;
        if (attackAtPosition && attackAtPosition.targets && attackAtPosition.targets.length > 0) {
            attackTarget = attackAtPosition.targets.reduce((best, current) => {
                return current.score > best.score ? current : best;
            }, { score: 0 });
        }
        if (maxHealScore >= maxAttackScore && maxHealScore > 10) {
            operationType = '治疗';
            operationTarget = { row: healTarget.row, col: healTarget.col };
            operationDetails = `移动到 (${chosenPosition.row + 1}, ${chosenPosition.col + 1}) 并治疗 (${healTarget.row + 1}, ${healTarget.col + 1}) (治疗分: ${maxHealScore})`;
        }
        else if (maxAttackScore > 0) {
            operationType = '攻击';
            if (attackTarget) {
                operationTarget = { row: attackTarget.row, col: attackTarget.col };
                const targetCell = appData.gridData[attackTarget.row][attackTarget.col];
                const targetUnit = appData.units.find(u => u.id === targetCell.unit);
                operationDetails = `移动到 (${chosenPosition.row + 1}, ${chosenPosition.col + 1}) 并攻击 (${attackTarget.row + 1}, ${attackTarget.col + 1}) 的${targetUnit ? targetUnit.name : '单位'} (攻击分: ${maxAttackScore})`;
            }
        }
    }
    if (operationType === '待机' && unit.abilities.includes('支援')) {
        const supportScores = calculateSupportScores(row, col);
        const attackScores = calculateAttackScores(row, col);
        const supportAtPosition = supportScores.filter(s => {
            const distance = Math.abs(s.row - chosenPosition.row) + Math.abs(s.col - chosenPosition.col);
            return distance <= 2;
        });
        let maxSupportScore = 0;
        let supportTarget = null;
        if (supportAtPosition.length > 0) {
            maxSupportScore = Math.max(...supportAtPosition.map(s => s.value));
            supportTarget = supportAtPosition.find(s => s.value === maxSupportScore);
        }
        const attackAtPosition = attackScores.find(s => s.row === chosenPosition.row && s.col === chosenPosition.col);
        const maxAttackScore = attackAtPosition ? attackAtPosition.value : 0;
        let attackTarget = null;
        if (attackAtPosition && attackAtPosition.targets && attackAtPosition.targets.length > 0) {
            attackTarget = attackAtPosition.targets.reduce((best, current) => {
                return current.score > best.score ? current : best;
            }, { score: 0 });
        }
        if (maxSupportScore >= maxAttackScore && maxSupportScore > 0) {
            operationType = '支援';
            operationTarget = { row: supportTarget.row, col: supportTarget.col };
            operationDetails = `移动到 (${chosenPosition.row + 1}, ${chosenPosition.col + 1}) 并支援 (${supportTarget.row + 1}, ${supportTarget.col + 1}) (支援分: ${maxSupportScore})`;
        }
        else if (maxAttackScore > 0) {
            operationType = '攻击';
            if (attackTarget) {
                operationTarget = { row: attackTarget.row, col: attackTarget.col };
                const targetCell = appData.gridData[attackTarget.row][attackTarget.col];
                const targetUnit = appData.units.find(u => u.id === targetCell.unit);
                operationDetails = `移动到 (${chosenPosition.row + 1}, ${chosenPosition.col + 1}) 并攻击 (${attackTarget.row + 1}, ${attackTarget.col + 1}) 的${targetUnit ? targetUnit.name : '单位'} (攻击分: ${maxAttackScore})`;
            }
        }
    }
    if (operationType === '待机') {
        const attackScores = calculateAttackScores(row, col);
        const attackAtPosition = attackScores.find(s => s.row === chosenPosition.row && s.col === chosenPosition.col);
        if (attackAtPosition && attackAtPosition.value > 0 && attackAtPosition.targets) {
            const bestTarget = attackAtPosition.targets.reduce((best, current) => {
                return current.score > best.score ? current : best;
            }, { score: 0 });
            if (bestTarget.score > 0) {
                operationType = '攻击';
                operationTarget = { row: bestTarget.row, col: bestTarget.col };
                const targetCell = appData.gridData[bestTarget.row][bestTarget.col];
                const targetUnit = appData.units.find(u => u.id === targetCell.unit);
                operationDetails = `移动到 (${chosenPosition.row + 1}, ${chosenPosition.col + 1}) 并攻击 (${bestTarget.row + 1}, ${bestTarget.col + 1}) 的${targetUnit ? targetUnit.name : '单位'} (攻击分: ${bestTarget.score})`;
            }
        }
    }
    if (operationType === '待机') {
        if (row === chosenPosition.row && col === chosenPosition.col) {
            operationDetails = '原地待机';
        }
        else {
            operationDetails = `移动到 (${chosenPosition.row + 1}, ${chosenPosition.col + 1}) 后待机`;
        }
    }
    let sameScoreListHtml = '';
    if (bestPositions.length > 1) {
        const listItems = bestPositions.map((p, idx) => {
            const marker = (p.row === chosenPosition.row && p.col === chosenPosition.col) ? ' <span class="text-green-600 font-bold">[已选]</span>' : '';
            return `<div class="flex items-center gap-2 mb-1">

                <span class="w-5 h-5 rounded-full flex items-center justify-center text-xs ${(p.row === chosenPosition.row && p.col === chosenPosition.col) ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}">${idx + 1}</span>

                <span>(${p.row + 1}, ${p.col + 1}) - 总分: <span class="font-bold text-orange-600">${p.value}</span></span>

                ${marker}

            </div>`;
        }).join('');
        sameScoreListHtml = `<div class="p-3 bg-yellow-50 rounded-lg mb-3">

            <div class="flex items-center mb-2">

                <i class="fa fa-list text-yellow-600 mr-2"></i>

                <span class="font-semibold text-yellow-800">同分候选位置 (共${bestPositions.length}个，随机选第${bestPositions.indexOf(chosenPosition) + 1}个)</span>

            </div>

            ${listItems}

        </div>`;
    }
    elements.demoResult.classList.remove('hidden');
    elements.demoResultContent.innerHTML = `

        <div class="p-3 bg-orange-50 rounded-lg mb-3">

            <div class="flex items-center mb-2">

                <i class="fa fa-lightbulb-o text-orange-600 mr-2"></i>

                <span class="font-semibold text-orange-800">最优行为分析</span>

            </div>

            <div class="text-sm space-y-1">

                <div><span class="text-gray-600">单位:</span> <span class="font-medium">${unit.name}</span> (${team.name})</div>

                <div><span class="text-gray-600">当前位置:</span> (${row + 1}, ${col + 1})</div>

                <div><span class="text-gray-600">目标位置:</span> (${chosenPosition.row + 1}, ${chosenPosition.col + 1})</div>

                <div><span class="text-gray-600">总分:</span> <span class="font-bold text-orange-600">${chosenPosition.value}</span></div>

            </div>

        </div>

        ${sameScoreListHtml}

        <div class="p-3 bg-blue-50 rounded-lg">

            <div class="flex items-center mb-2">

                <i class="fa fa-check-circle text-blue-600 mr-2"></i>

                <span class="font-semibold text-blue-800">推荐操作</span>

            </div>

            <div class="text-sm">

                <div class="mb-2"><span class="font-medium text-blue-700">操作类型: ${operationType}</span></div>

                <div class="text-gray-700">${operationDetails}</div>

            </div>

        </div>

    `;
    highlightDemoPath(row, col, chosenPosition.row, chosenPosition.col, operationTarget);
}
function highlightDemoPath(fromRow, fromCol, toRow, toCol, operationTarget) {
    appData.calculationResults = null;
    const highlights = [];
    highlights.push({
        row: fromRow,
        col: fromCol,
        type: 'source',
        value: '起点'
    });
    if (fromRow !== toRow || fromCol !== toCol) {
        highlights.push({
            row: toRow,
            col: toCol,
            type: 'target',
            value: '终点'
        });
    }
    if (operationTarget && (operationTarget.row !== toRow || operationTarget.col !== toCol)) {
        highlights.push({
            row: operationTarget.row,
            col: operationTarget.col,
            type: 'operationTarget',
            value: '操作目标'
        });
    }
    appData.calculationResults = highlights;
    renderGrid();
}
function calculateOverview() {
    let totalHouses = 0;
    let waterCells = 0;
    let plainCells = 0;
    let teamStats = {
        blue: { income: 0, units: 0, population: 0 },
        red: { income: 0, units: 0, population: 0 },
        green: { income: 0, units: 0, population: 0 },
        black: { income: 0, units: 0, population: 0 },
        purple: { income: 0, units: 0, population: 0 },
        orange: { income: 0, units: 0, population: 0 }
    };
    let teamUnitsWeight = {
        blue: { infantry: 0, ghost: 0, mermaid: 0, archer: 0, Slime: 0, waterelement: 0, mage: 0, witch: 0, healer: 0, elf: 0, rampage: 0, wolf: 0, rock: 0, ice: 0, druid: 0, catapult: 0, wolfshoot: 0, dragon: 0, commander: 0, skeleton: 0 },
        red: { infantry: 0, ghost: 0, mermaid: 0, archer: 0, Slime: 0, waterelement: 0, mage: 0, witch: 0, healer: 0, elf: 0, rampage: 0, wolf: 0, rock: 0, ice: 0, druid: 0, catapult: 0, wolfshoot: 0, dragon: 0, commander: 0, skeleton: 0 },
        green: { infantry: 0, ghost: 0, mermaid: 0, archer: 0, Slime: 0, waterelement: 0, mage: 0, witch: 0, healer: 0, elf: 0, rampage: 0, wolf: 0, rock: 0, ice: 0, druid: 0, catapult: 0, wolfshoot: 0, dragon: 0, commander: 0, skeleton: 0 },
        black: { infantry: 0, ghost: 0, mermaid: 0, archer: 0, Slime: 0, waterelement: 0, mage: 0, witch: 0, healer: 0, elf: 0, rampage: 0, wolf: 0, rock: 0, ice: 0, druid: 0, catapult: 0, wolfshoot: 0, dragon: 0, commander: 0, skeleton: 0 },
        purple: { infantry: 0, ghost: 0, mermaid: 0, archer: 0, Slime: 0, waterelement: 0, mage: 0, witch: 0, healer: 0, elf: 0, rampage: 0, wolf: 0, rock: 0, ice: 0, druid: 0, catapult: 0, wolfshoot: 0, dragon: 0, commander: 0, skeleton: 0 },
        orange: { infantry: 0, ghost: 0, mermaid: 0, archer: 0, Slime: 0, waterelement: 0, mage: 0, witch: 0, healer: 0, elf: 0, rampage: 0, wolf: 0, rock: 0, ice: 0, druid: 0, catapult: 0, wolfshoot: 0, dragon: 0, commander: 0, skeleton: 0 },
    };
    const teamUnitCounts = {
        blue: {}, red: {}, green: {}, black: {}, purple: {}, orange: {}
    };
    appData.units.forEach(unit => {
        Object.keys(teamUnitCounts).forEach(teamId => {
            teamUnitCounts[teamId][unit.id] = 0;
        });
    });
    let minVillageX = appData.rows - 1;
    let maxVillageX = 0;
    let minVillageY = appData.cols - 1;
    let maxVillageY = 0;
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i][j];
            const terrain = cell.terrain ? appData.terrains.find(t => t.id === cell.terrain) : null;
            if (cell.unit && cell.unitTeam && teamUnitCounts[cell.unitTeam]) {
                teamUnitCounts[cell.unitTeam][cell.unit]++;
            }
            if (cell.terrain === 'house' || cell.terrain === 'rundown') {
                if (i < minVillageX) {
                    minVillageX = i;
                }
                if (i > maxVillageX) {
                    maxVillageX = i;
                }
                if (j < minVillageY) {
                    minVillageY = j;
                }
                if (j > maxVillageY) {
                    maxVillageY = j;
                }
                totalHouses++;
                if (cell.terrainTeam && teamStats[cell.terrainTeam]) {
                    teamStats[cell.terrainTeam].income += 50;
                }
            }
            if (cell.terrain === 'castle') {
                if (cell.terrainTeam && teamStats[cell.terrainTeam]) {
                    teamStats[cell.terrainTeam].income += 100;
                }
            }
            if (cell.unit && cell.unitTeam && teamStats[cell.unitTeam]) {
                teamStats[cell.unitTeam].units++;
                const unit = appData.units.find(u => u.id === cell.unit);
                if (!unit)
                    continue;
                teamStats[cell.unitTeam].population += unit.population;
                if (unit.name === '指挥官') {
                    teamStats[cell.unitTeam].income += 50 + 25 * cell.unitLevel;
                }
            }
        }
    }
    let totalCells = (maxVillageX - minVillageX + 1) * (maxVillageY - minVillageY + 1);
    for (let i = minVillageX; i <= maxVillageX; i++) {
        for (let j = minVillageY; j <= maxVillageY; j++) {
            const cell = appData.gridData[i][j];
            const terrain = cell.terrain ? appData.terrains.find(t => t.id === cell.terrain) : null;
            if (WaterTerrain.includes(terrain.name)) {
                waterCells++;
            }
            else if (!MountainTerrain.includes(terrain.name) && terrain.name !== "树林") {
                plainCells++;
            }
        }
    }
    const waterPercentage = totalCells > 0 ? Math.round((waterCells / totalCells) * 100) : 0;
    const plainPercentage = totalCells > 0 ? Math.round((plainCells / totalCells) * 100) : 0;
    let mermaidLimit = waterPercentage < 60 ? 5 : 6;
    let SlimeLimit = plainPercentage < 30 ? 1 : 2;
    let iceLimit = 3;
    let waterelementLimit = 3;
    if (waterPercentage < 20) {
        iceLimit = 1;
    }
    else if (waterPercentage < 30) {
        iceLimit = 2;
    }
    if (waterPercentage < 20) {
        waterelementLimit = 1;
    }
    else if (waterPercentage < 40) {
        waterelementLimit = 2;
    }
    let unitLimits = {
        infantry: 99,
        dragon: 5,
        witch: 1,
        druid: 1,
        archer: 4,
        catapult: 4,
        elf: 2,
        wolf: 2,
        rock: 2,
        healer: 2,
        rampage: 2,
        ghost: 2,
        mage: 2,
        Slime: SlimeLimit,
        mermaid: mermaidLimit,
        waterelement: waterelementLimit,
        ice: iceLimit,
        wolfshoot: 2,
        commander: 1
    };
    let totalUnits = 0;
    let totalPopulation = 0;
    Object.values(teamStats).forEach(stat => {
        totalUnits += stat.units;
        totalPopulation += stat.population;
    });
    Object.keys(teamUnitsWeight).forEach(teamId => {
        const currentTeam = appData.teams.find(t => t.id === teamId);
        if (!currentTeam)
            return;
        Object.keys(teamUnitCounts).forEach(otherTeamId => {
            const otherTeam = appData.teams.find(t => t.id === otherTeamId);
            if (!otherTeam || otherTeam.alliance === currentTeam.alliance)
                return;
            Object.keys(teamUnitCounts[otherTeamId]).forEach(unitId => {
                const enemyCount = teamUnitCounts[otherTeamId][unitId];
                if (enemyCount === 0)
                    return;
                switch (unitId) {
                    case 'witch':
                    case 'elf':
                    case 'catapult':
                    case 'dragon':
                    case 'ghost':
                    case 'mage':
                    case 'druid':
                        teamUnitsWeight[teamId].archer += enemyCount * 1;
                        teamUnitsWeight[teamId].wolfshoot += enemyCount * 0.25;
                        break;
                    case 'ice':
                        teamUnitsWeight[teamId].waterelement += enemyCount * 1;
                        teamUnitsWeight[teamId].mermaid += enemyCount * 1;
                        break;
                    case 'rock':
                        teamUnitsWeight[teamId].mage += enemyCount * 0.5;
                        teamUnitsWeight[teamId].elf += enemyCount * 0.5;
                        teamUnitsWeight[teamId].dragon += enemyCount * 0.5;
                        teamUnitsWeight[teamId].ice += enemyCount * 0.5;
                        break;
                    case 'Slime':
                        teamUnitsWeight[teamId].ghost += enemyCount * 0.5;
                        teamUnitsWeight[teamId].Slime += enemyCount * 1;
                        teamUnitsWeight[teamId].mage += enemyCount * 0.5;
                        teamUnitsWeight[teamId].ice += enemyCount * 0.3;
                        break;
                }
            });
        });
        Object.keys(teamUnitCounts[teamId]).forEach(unitId => {
            const allyCount = teamUnitCounts[teamId][unitId];
            if (allyCount === 0)
                return;
            switch (unitId) {
                case 'mage':
                    teamUnitsWeight[teamId].ghost += allyCount * 1;
                    break;
                case 'rock':
                    teamUnitsWeight[teamId].ghost += allyCount * 2;
                    break;
                case 'healer':
                    teamUnitsWeight[teamId].wolf += allyCount * 1;
                    teamUnitsWeight[teamId].dragon += allyCount * 1;
                    break;
            }
        });
        Object.keys(teamUnitsWeight[teamId]).forEach(unitId => {
            const currentCount = teamUnitCounts[teamId][unitId] || 0;
            const limit = unitLimits[unitId];
            const unit = appData.units.find(item => item.id === unitId);
            if ((isAiPlayerType(currentTeam.playerType) && getTeamGold(teamId) < getRecruitCost(unitId, teamId))
                || (limit !== undefined && currentCount >= limit)
                || (unit && teamStats[teamId].population + (unit.population || 0) > TEAM_POPULATION_LIMIT)) {
                teamUnitsWeight[teamId][unitId] = 0;
            }
        });
    });
    elements.totalHouses.textContent = totalHouses;
    elements.waterAreaPercentage.textContent = `${waterPercentage}%`;
    elements.plainAreaPercentage.textContent = `${plainPercentage}%`;
    const priorityInfo = calculateRecruitLimitInfo();
    const priorityRoundNumber = getDemoRoundNumber();
    const priorityBasicUnitId = priorityInfo.waterPercentage > 20 ? 'mermaid' : 'infantry';
    const priorityBasicUnitName = priorityBasicUnitId === 'mermaid' ? '人鱼' : '士兵';
    const priorityTeamId = appData.currentMoveTeam || appData.teams.find(team => team.playerType !== 0)?.id || appData.teams[0]?.id || 'blue';
    const priorityBasicTargetCount = getPriorityBasicRecruitCount(priorityTeamId, priorityInfo, priorityRoundNumber);
    if (elements.priorityBasicRecruitSummary)
        elements.priorityBasicRecruitSummary.textContent = `${priorityBasicUnitName}-${priorityBasicTargetCount}`;
    if (elements.mermaidRecruitLimit)
        elements.mermaidRecruitLimit.textContent = unitLimits.mermaid;
    if (elements.waterelementRecruitLimit)
        elements.waterelementRecruitLimit.textContent = unitLimits.waterelement;
    if (elements.iceRecruitLimit)
        elements.iceRecruitLimit.textContent = unitLimits.ice;
    if (elements.slimeRecruitLimit)
        elements.slimeRecruitLimit.textContent = unitLimits.Slime;
    elements.blueTeamIncome.textContent = teamStats.blue.income;
    elements.redTeamIncome.textContent = teamStats.red.income;
    elements.greenTeamIncome.textContent = teamStats.green.income;
    elements.blackTeamIncome.textContent = teamStats.black.income;
    elements.purpleTeamIncome.textContent = teamStats.purple.income;
    elements.orangeTeamIncome.textContent = teamStats.orange.income;
    elements.blueTeamUnits.textContent = teamStats.blue.units;
    elements.redTeamUnits.textContent = teamStats.red.units;
    elements.greenTeamUnits.textContent = teamStats.green.units;
    elements.blackTeamUnits.textContent = teamStats.black.units;
    elements.purpleTeamUnits.textContent = teamStats.purple.units;
    elements.orangeTeamUnits.textContent = teamStats.orange.units;
    elements.blueTeamPopulation.textContent = teamStats.blue.population;
    elements.redTeamPopulation.textContent = teamStats.red.population;
    elements.greenTeamPopulation.textContent = teamStats.green.population;
    elements.blackTeamPopulation.textContent = teamStats.black.population;
    elements.purpleTeamPopulation.textContent = teamStats.purple.population;
    elements.orangeTeamPopulation.textContent = teamStats.orange.population;
    elements.totalUnits.textContent = totalUnits;
    elements.totalPopulation.textContent = totalPopulation;
    appData.lastRecruitmentWeights = JSON.parse(JSON.stringify(teamUnitsWeight));
    updateRecruitmentWeightsDisplay(teamUnitsWeight);
}
function updateRecruitmentWeightsDisplay(teamUnitsWeight) {
    const recruitmentWeightsElement = document.getElementById('recruitmentWeights');
    recruitmentWeightsElement.innerHTML = '';
    appData.units.forEach(unit => {
        const row = document.createElement('tr');
        const unitNameCell = document.createElement('td');
        unitNameCell.className = 'border border-gray-300 px-2 py-1 font-medium';
        unitNameCell.textContent = unit.name;
        row.appendChild(unitNameCell);
        appData.teams.forEach(team => {
            const weightCell = document.createElement('td');
            weightCell.className = 'border border-gray-300 px-2 py-1 text-center';
            weightCell.textContent = teamUnitsWeight[team.id][unit.id] || 0;
            row.appendChild(weightCell);
        });
        recruitmentWeightsElement.appendChild(row);
    });
}
function getCurrentRecruitmentWeights() {
    calculateOverview();
    return appData.lastRecruitmentWeights ? JSON.parse(JSON.stringify(appData.lastRecruitmentWeights)) : {};
}
function getUnitOrder(unitId) {
    const aemUnitOrder = {
        infantry: 0,
        archer: 1,
        waterelement: 2,
        witch: 3,
        elf: 4,
        wolf: 5,
        rock: 6,
        catapult: 7,
        dragon: 8,
        commander: 9,
        skeleton: 10,
        healer: 12,
        rampage: 13,
        ghost: 14,
        mage: 15,
        wolfshoot: 16,
        ice: 17,
        Slime: 18,
        mermaid: 19,
        druid: 20
    };
    return aemUnitOrder[unitId] ?? Number.MAX_SAFE_INTEGER;
}
function calculateRecruitLimitInfo() {
    const teamUnitCounts = {};
    const teamStats = {};
    appData.teams.forEach(team => {
        teamUnitCounts[team.id] = {};
        teamStats[team.id] = { population: 0, units: 0, castles: 0 };
        appData.units.forEach(unit => {
            teamUnitCounts[team.id][unit.id] = 0;
        });
    });
    let minVillageX = appData.rows - 1;
    let maxVillageX = 0;
    let minVillageY = appData.cols - 1;
    let maxVillageY = 0;
    let hasVillage = false;
    let totalHouses = 0;
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i][j];
            if (!cell)
                continue;
            if ((cell.terrain === 'house' || cell.terrain === 'rundown')) {
                hasVillage = true;
                totalHouses++;
                if (i < minVillageX)
                    minVillageX = i;
                if (i > maxVillageX)
                    maxVillageX = i;
                if (j < minVillageY)
                    minVillageY = j;
                if (j > maxVillageY)
                    maxVillageY = j;
            }
            if (cell.terrain === 'castle' && cell.terrainTeam && teamStats[cell.terrainTeam]) {
                teamStats[cell.terrainTeam].castles++;
            }
            if (cell.unit && cell.unitTeam && teamUnitCounts[cell.unitTeam]) {
                const unit = appData.units.find(u => u.id === cell.unit);
                teamUnitCounts[cell.unitTeam][cell.unit] = (teamUnitCounts[cell.unitTeam][cell.unit] || 0) + 1;
                if (unit && teamStats[cell.unitTeam]) {
                    teamStats[cell.unitTeam].units++;
                    teamStats[cell.unitTeam].population += unit.population || 0;
                }
            }
        }
    }
    appData.teams.forEach(team => {
        if (!teamStats[team.id])
            return;
        teamStats[team.id].enemyUnits = 0;
    });
    appData.teams.forEach(team => {
        if (!teamStats[team.id])
            return;
        let count = 0;
        appData.teams.forEach(otherTeam => {
            if (otherTeam.alliance === team.alliance)
                return;
            Object.values(teamUnitCounts[otherTeam.id] || {}).forEach(unitCount => {
                count += unitCount || 0;
            });
        });
        teamStats[team.id].enemyUnits = count;
    });
    let waterCells = 0;
    let plainCells = 0;
    let totalCells = 0;
    if (hasVillage) {
        totalCells = (maxVillageX - minVillageX + 1) * (maxVillageY - minVillageY + 1);
        for (let i = minVillageX; i <= maxVillageX; i++) {
            for (let j = minVillageY; j <= maxVillageY; j++) {
                const cell = appData.gridData[i][j];
                const terrain = cell && cell.terrain ? appData.terrains.find(t => t.id === cell.terrain) : null;
                if (!terrain)
                    continue;
                if (WaterTerrain.includes(terrain.name)) {
                    waterCells++;
                }
                else if (!MountainTerrain.includes(terrain.name) && terrain.name !== "树林") {
                    plainCells++;
                }
            }
        }
    }
    const waterPercentage = totalCells > 0 ? Math.round((waterCells / totalCells) * 100) : 0;
    const plainPercentage = totalCells > 0 ? Math.round((plainCells / totalCells) * 100) : 0;
    const mermaidLimit = waterPercentage < 60 ? 5 : 6;
    const SlimeLimit = plainPercentage < 30 ? 1 : 2;
    let iceLimit = 3;
    let waterelementLimit = 3;
    if (waterPercentage < 20) {
        iceLimit = 1;
        waterelementLimit = 1;
    }
    else {
        if (waterPercentage < 30)
            iceLimit = 2;
        if (waterPercentage < 40)
            waterelementLimit = 2;
    }
    const unitLimits = {
        infantry: 99,
        dragon: 5,
        witch: 1,
        druid: 1,
        archer: 4,
        catapult: 4,
        elf: 2,
        wolf: 2,
        rock: 2,
        healer: 2,
        rampage: 2,
        ghost: 2,
        mage: 2,
        Slime: SlimeLimit,
        mermaid: mermaidLimit,
        waterelement: waterelementLimit,
        ice: iceLimit,
        wolfshoot: 2,
        commander: 1
    };
    const enabledTeamCount = Math.max(1, appData.teams.filter(team => {
        const stats = teamStats[team.id];
        return team.playerType !== 0 && stats && (stats.castles > 0 || stats.units > 0);
    }).length);
    return { teamUnitCounts, teamStats, unitLimits, waterPercentage, plainPercentage, totalHouses, enabledTeamCount };
}
const TEAM_POPULATION_LIMIT = environment.populationLimit ?? 100;
function isPlayerTeam(teamId) {
    const team = appData.teams.find(t => t.id === teamId);
    return !!(team && team.playerType === 1);
}
function isRecruitLimitReached(teamId, unitId) {
    if (isPlayerTeam(teamId))
        return false;
    const info = calculateRecruitLimitInfo();
    const limit = info.unitLimits[unitId];
    if (limit === undefined)
        return false;
    return (info.teamUnitCounts[teamId]?.[unitId] || 0) >= limit;
}
function getTeamPopulation(teamId) {
    const info = calculateRecruitLimitInfo();
    return info.teamStats[teamId]?.population || 0;
}
function wouldExceedTeamPopulationLimit(teamId, unitId) {
    const unit = appData.units.find(u => u.id === unitId);
    if (!unit)
        return true;
    return getTeamPopulation(teamId) + (unit.population || 0) > TEAM_POPULATION_LIMIT;
}
function canRecruitUnitByRules(teamId, unitId) {
    if (!teamId || !unitId || unitId === 'skeleton')
        return false;
    const unit = appData.units.find(u => u.id === unitId);
    if (!unit)
        return false;
    if (unitId === 'commander' && teamHasCommander(teamId))
        return false;
    if (wouldExceedTeamPopulationLimit(teamId, unitId))
        return false;
    if (isRecruitLimitReached(teamId, unitId))
        return false;
    return getTeamGold(teamId) >= getRecruitCost(unitId, teamId);
}
function canRecruitUnitStructurally(teamId, unitId) {
    if (!teamId || !unitId || unitId === 'skeleton')
        return false;
    const unit = appData.units.find(u => u.id === unitId);
    if (!unit)
        return false;
    if (unitId === 'commander' && teamHasCommander(teamId))
        return false;
    if (wouldExceedTeamPopulationLimit(teamId, unitId))
        return false;
    return !isRecruitLimitReached(teamId, unitId);
}
function canRecruitCastleGuardByRules(teamId, unitId) {
    if (!teamId || !unitId || unitId === 'skeleton')
        return false;
    if (unitId === 'rock')
        return false;
    const unit = appData.units.find(u => u.id === unitId);
    if (!unit)
        return false;
    if (wouldExceedTeamPopulationLimit(teamId, unitId))
        return false;
    return getTeamGold(teamId) >= getRecruitCost(unitId, teamId);
}
function canRandomRecruitUnitStructurally(teamId, unitId) {
    if (!teamId || !unitId || unitId === 'skeleton')
        return false;
    const unit = appData.units.find(u => u.id === unitId);
    if (!unit)
        return false;
    if (unitId === 'commander' && teamHasCommander(teamId))
        return false;
    return true;
}
function canRandomRecruitUnitByRules(teamId, unitId) {
    return canRandomRecruitUnitStructurally(teamId, unitId)
        && getTeamGold(teamId) >= getRecruitCost(unitId, teamId);
}
const RANDOM_RECRUIT_UNIT_IDS = ['Slime', 'healer', 'rampage', 'rock', 'catapult'];
function canRecruitUnitAtMoveModeCastle(teamId, unitId, row, col) {
    if (!canRecruitUnitByRules(teamId, unitId))
        return false;
    const recruitableCastle = getRecruitableCastleInfo(row, col);
    if (!recruitableCastle || recruitableCastle.teamId !== teamId)
        return false;
    if (!recruitableCastle.occupiedByCommander)
        return true;
    return calculateRecruitMovementRange(row, col, unitId, teamId).length > 0;
}
function canRandomRecruitUnitAtMoveModeCastle(teamId, unitId, row, col) {
    if (!canRandomRecruitUnitStructurally(teamId, unitId))
        return false;
    const recruitableCastle = getRecruitableCastleInfo(row, col);
    if (!recruitableCastle || recruitableCastle.teamId !== teamId)
        return false;
    if (!recruitableCastle.occupiedByCommander)
        return true;
    return calculateRecruitMovementRange(row, col, unitId, teamId).length > 0;
}
function getMoveModeRandomRecruitUnitIds(teamId, row, col, weights) {
    if (choosePriorityRecruitPlan(teamId))
        return [];
    if (getSortedWeightedRecruitUnits(teamId, weights, 1, Infinity).length > 0)
        return [];
    if (getTeamGold(teamId) <= 469)
        return [];
    return RANDOM_RECRUIT_UNIT_IDS.filter(unitId => canRandomRecruitUnitAtMoveModeCastle(teamId, unitId, row, col));
}
function isCastleThreatenedByEnemyLord(row, col, teamId) {
    const team = appData.teams.find(t => t.id === teamId);
    if (!team)
        return false;
    const castleCell = appData.gridData[row]?.[col];
    if (!castleCell || castleCell.terrain !== 'castle' || castleCell.terrainTeam !== teamId)
        return false;
    if (castleCell.unit && castleCell.unitStandby === true)
        return false;
    const previousDemoEnemyMovementBlocking = appData.demoEnemyMovementBlocking;
    const previousMoveModeConsiderEnemyBlockers = appData.moveModeConsiderEnemyBlockers;
    appData.demoEnemyMovementBlocking = false;
    appData.moveModeConsiderEnemyBlockers = false;
    try {
        for (let i = 0; i < appData.rows; i++) {
            for (let j = 0; j < appData.cols; j++) {
                const cell = appData.gridData[i][j];
                if (!cell || !cell.unit || !cell.unitTeam)
                    continue;
                const enemyTeam = appData.teams.find(t => t.id === cell.unitTeam);
                if (!enemyTeam || enemyTeam.alliance === team.alliance)
                    continue;
                const enemyUnit = getUnitDefinition(cell.unit);
                if (!enemyUnit || !(enemyUnit.abilities || []).includes('城主'))
                    continue;
                if (calculateMovementRange(i, j).some(pos => pos.row === row && pos.col === col)) {
                    return true;
                }
            }
        }
    }
    finally {
        appData.demoEnemyMovementBlocking = previousDemoEnemyMovementBlocking;
        appData.moveModeConsiderEnemyBlockers = previousMoveModeConsiderEnemyBlockers;
    }
    return false;
}
function isCastleThreatenedByEnemyCommander(row, col, teamId) {
    return isCastleThreatenedByEnemyLord(row, col, teamId);
}
function collectRecruitableCastlesForUnit(teamId, unitId) {
    const castles = [];
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const info = getRecruitableCastleInfo(i, j);
            if (!info || info.teamId !== teamId)
                continue;
            const cell = appData.gridData[i]?.[j];
            if (cell && cell.unit && !info.occupiedByCommander)
                continue;
            castles.push({
                row: i,
                col: j,
                targetType: 'terrainCastle',
                occupiedByCommander: info.occupiedByCommander,
                threatened: isCastleThreatenedByEnemyCommander(i, j, teamId),
                enemyAverageDistance: calculateEnemyDistance(i, j, teamId)
            });
        }
    }
    return castles;
}
function chooseRecruitCastle(teamId, unitId) {
    const castles = collectRecruitableCastlesForUnit(teamId, unitId);
    if (castles.length === 0)
        return null;
    const threatenedCastles = castles.filter(castle => castle.threatened);
    if (threatenedCastles.length > 0) {
        const allThreatenedCastlesEmpty = threatenedCastles.every(castle => {
            const cell = appData.gridData[castle.row]?.[castle.col];
            return !cell?.unit;
        });
        if (allThreatenedCastlesEmpty) {
            threatenedCastles.sort((a, b) => {
                const distanceDifference = isHardAiTeam(teamId)
                    ? b.enemyAverageDistance - a.enemyAverageDistance
                    : Math.floor(b.enemyAverageDistance) - Math.floor(a.enemyAverageDistance);
                if (distanceDifference !== 0)
                    return distanceDifference;
                if (a.row !== b.row)
                    return a.row - b.row;
                return a.col - b.col;
            });
            return threatenedCastles[0];
        }
        let selected = threatenedCastles[0];
        for (let index = 1; index < threatenedCastles.length; index++) {
            const candidate = threatenedCastles[index];
            const candidateCell = appData.gridData[candidate.row]?.[candidate.col];
            const selectedCell = appData.gridData[selected.row]?.[selected.col];
            if (!candidateCell?.unit
                || (selectedCell?.unit
                    && (isHardAiTeam(teamId)
                        ? candidate.enemyAverageDistance > selected.enemyAverageDistance
                        : Math.floor(candidate.enemyAverageDistance) > Math.floor(selected.enemyAverageDistance)))) {
                selected = candidate;
            }
        }
        return selected;
    }
    castles.sort((a, b) => {
        const distanceDifference = isHardAiTeam(teamId)
            ? a.enemyAverageDistance - b.enemyAverageDistance
            : Math.floor(a.enemyAverageDistance) - Math.floor(b.enemyAverageDistance);
        if (distanceDifference !== 0)
            return distanceDifference;
        return comparePotentialBuildingTargetsByHash(a, b);
    });
    return castles[0];
}
function evaluateRecruitPlacement(row, col, unitId, teamId, options = {}) {
    const cell = appData.gridData[row]?.[col];
    if (!cell)
        return null;
    if (cell.unit && !options.allowOccupiedSource)
        return null;
    const snapshot = snapshotCellForMove(row, col);
    const originalGold = getTeamGold(teamId);
    const recruitCost = getRecruitCost(unitId, teamId);
    const hiddenOriginCell = snapshot && snapshot.unit === 'commander' && snapshot.unitTeam === teamId
        ? snapshot
        : null;
    setCellUnit(cell, unitId, teamId, 0);
    setTeamGold(teamId, originalGold - recruitCost);
    let candidate = null;
    try {
        const candidates = calculateSingleUnitTotalScores(row, col, true, !!options.excludeOrigin, {
            movementOptions: {
                hiddenOriginCell
            }
        });
        candidate = chooseBestLandingCandidate(candidates, true);
    }
    finally {
        setTeamGold(teamId, originalGold);
        restoreCellFromMoveSnapshot(row, col, snapshot);
    }
    if (!candidate)
        return null;
    return { row, col, candidate };
}
function chooseRecruitActionPlan(teamId, unitId, options = {}) {
    const preferredCastle = chooseRecruitCastle(teamId, unitId);
    if (!preferredCastle)
        return null;
    const castles = isHardAiTeam(teamId)
        ? collectRecruitableCastlesForUnit(teamId, unitId)
        : [preferredCastle];
    const plans = castles
        .filter(castle => !options.requireEmptyCastle || !castle.occupiedByCommander)
        .map(castle => {
        const placement = evaluateRecruitPlacement(castle.row, castle.col, unitId, teamId, castle.occupiedByCommander
            ? { allowOccupiedSource: true, excludeOrigin: true } : {});
        return placement ? { teamId, unitId, castle, placement } : null;
    }).filter(Boolean);
    if (!plans.length)
        return null;
    if (!isHardAiTeam(teamId))
        return plans[0];
    plans.sort((a, b) => b.placement.candidate.value - a.placement.candidate.value
        || Number(b.castle.row === preferredCastle.row && b.castle.col === preferredCastle.col)
            - Number(a.castle.row === preferredCastle.row && a.castle.col === preferredCastle.col)
        || a.castle.row - b.castle.row || a.castle.col - b.castle.col);
    return plans[0];
}
function isRecruitBlockedByCommanderCastle(teamId, unitId) {
    const castle = chooseRecruitCastle(teamId, unitId);
    if (!castle || !castle.occupiedByCommander)
        return false;
    return !evaluateRecruitPlacement(castle.row, castle.col, unitId, teamId, {
        allowOccupiedSource: true,
        excludeOrigin: true
    });
}
function buildRecruitPlanResult(teamId, unitId, reason) {
    const plan = chooseRecruitActionPlan(teamId, unitId);
    if (plan)
        return { plan, reason };
    if (isRecruitBlockedByCommanderCastle(teamId, unitId)) {
        const unit = appData.units.find(u => u.id === unitId);
        return { plan: null, blocked: true, reason: `${unit ? unit.name : unitId}在指挥官城堡无可移动位置` };
    }
    return null;
}
function getTopWeightedRecruitUnit(teamId, weights, minInclusive, maxExclusive, requireAffordable = true) {
    const teamWeights = weights[teamId] || {};
    const candidates = appData.units
        .filter(unit => unit.id !== 'skeleton')
        .map(unit => ({ unit, weight: Number(teamWeights[unit.id]) || 0 }))
        .filter(item => item.weight >= minInclusive && item.weight < maxExclusive);
    candidates.sort((a, b) => {
        if (a.weight !== b.weight)
            return b.weight - a.weight;
        return getUnitOrder(a.unit.id) - getUnitOrder(b.unit.id);
    });
    if (!requireAffordable)
        return candidates.length > 0 ? candidates[0] : null;
    return candidates.find(item => canRecruitUnitByRules(teamId, item.unit.id)) || null;
}
function getSortedWeightedRecruitUnits(teamId, weights, minInclusive, maxExclusive) {
    const teamWeights = weights[teamId] || {};
    return appData.units
        .filter(unit => unit.id !== 'skeleton')
        .map(unit => ({ unit, weight: Number(teamWeights[unit.id]) || 0 }))
        .filter(item => item.weight >= minInclusive && item.weight < maxExclusive)
        .sort((a, b) => {
        if (a.weight !== b.weight)
            return b.weight - a.weight;
        return getUnitOrder(a.unit.id) - getUnitOrder(b.unit.id);
    });
}
function hasHighWeightRecruitUnit(teamId, weights) {
    const teamWeights = weights[teamId] || {};
    return appData.units.some(unit => unit.id !== 'skeleton' && (Number(teamWeights[unit.id]) || 0) >= 1);
}
function getTopLowWeightedRecruitUnit(teamId, weights) {
    const teamWeights = weights[teamId] || {};
    const candidates = appData.units
        .filter(unit => unit.id !== 'skeleton')
        .map(unit => ({ unit, weight: Number(teamWeights[unit.id]) || 0 }))
        .filter(item => item.weight > 0 && item.weight < 1)
        .sort((a, b) => {
        if (a.weight !== b.weight)
            return b.weight - a.weight;
        return getUnitOrder(a.unit.id) - getUnitOrder(b.unit.id);
    });
    return candidates.find(item => canRecruitUnitByRules(teamId, item.unit.id)) || null;
}
function getDemoRoundNumber() {
    const value = elements.demoRoundInput ? parseInt(elements.demoRoundInput.value) : 1;
    return Math.max(1, Number.isFinite(value) ? value : 1);
}
function getPriorityBasicRecruitCount(teamId, info, roundNumber) {
    const population = info.teamStats[teamId]?.population || 0;
    if (roundNumber > 3 && population >= 7) {
        return Math.floor(population / 7);
    }
    return Math.ceil((info.totalHouses / info.enabledTeamCount) * 0.3 + 1);
}
function canTriggerGuardRecruit(teamId) {
    if (getTeamGold(teamId) < getRecruitCost('infantry', teamId))
        return false;
    return getThreatenedOwnCastles(teamId).some(castle => {
        const cell = appData.gridData[castle.row]?.[castle.col];
        return cell && !cell.unit;
    });
}
function chooseGuardRecruitPlan(teamId) {
    if (!canTriggerGuardRecruit(teamId))
        return null;
    const guardUnitIds = new Set(['waterelement', 'infantry']);
    const recruitUnits = appData.units
        .filter(unit => unit.id !== 'skeleton')
        .slice()
        .sort((a, b) => {
        const costDiff = getRecruitCost(a.id, teamId) - getRecruitCost(b.id, teamId);
        return costDiff !== 0 ? costDiff : getUnitOrder(a.id) - getUnitOrder(b.id);
    });
    if (recruitUnits.length === 0)
        return null;
    const threatCount = Math.max(1, countThreatenedOwnCastleThreats(teamId));
    const guardBudget = Math.floor(getTeamGold(teamId) / threatCount);
    let selectedUnit = recruitUnits[0];
    for (const unit of recruitUnits) {
        const unitCost = getRecruitCost(unit.id, teamId);
        if (unitCost > guardBudget)
            continue;
        if (!guardUnitIds.has(unit.id))
            continue;
        if (unitCost <= getRecruitCost(selectedUnit.id, teamId))
            continue;
        selectedUnit = unit;
        break;
    }
    if (!guardUnitIds.has(selectedUnit.id))
        return null;
    if (!canRecruitCastleGuardByRules(teamId, selectedUnit.id))
        return null;
    const plan = chooseRecruitActionPlan(teamId, selectedUnit.id, { requireEmptyCastle: true });
    return plan ? { plan, reason: '守城单位招募' } : null;
}
function choosePriorityRecruitPlan(teamId) {
    const info = calculateRecruitLimitInfo();
    const roundNumber = getDemoRoundNumber();
    const population = info.teamStats[teamId]?.population || 0;
    const teamCounts = info.teamUnitCounts[teamId] || {};
    const gold = getTeamGold(teamId);
    const enemyUnitCount = info.teamStats[teamId]?.enemyUnits || 0;
    const commanderRecruitCost = getRecruitCost('commander', teamId);
    if (!teamHasCommander(teamId) && gold >= commanderRecruitCost) {
        if (commanderRecruitCost <= 500 || population >= 90 || enemyUnitCount < 3) {
            const result = buildRecruitPlanResult(teamId, 'commander', '优先招募指挥官');
            if (result)
                return result;
        }
    }
    const basicUnitId = info.waterPercentage > 20 ? 'mermaid' : 'infantry';
    const basicTargetCount = getPriorityBasicRecruitCount(teamId, info, roundNumber);
    if ((teamCounts[basicUnitId] || 0) < basicTargetCount && canRecruitUnitByRules(teamId, basicUnitId)) {
        const basicUnitName = basicUnitId === 'mermaid' ? '人鱼' : '士兵';
        const result = buildRecruitPlanResult(teamId, basicUnitId, `${basicUnitName}-${basicTargetCount}`);
        if (result)
            return result;
    }
    if (roundNumber <= 3 && ((teamCounts.archer || 0) === 0 || (teamCounts.Slime || 0) === 0)) {
        const earlyUnits = ['Slime', 'archer'].filter(unitId => (teamCounts[unitId] || 0) === 0 && canRecruitUnitByRules(teamId, unitId));
        for (const unitId of earlyUnits) {
            const result = buildRecruitPlanResult(teamId, unitId, unitId === 'Slime' ? '开局优先招募史莱姆' : '开局优先招募弓箭手');
            if (result)
                return result;
        }
    }
    if (population >= 10 && (teamCounts.witch || 0) === 0 && canRecruitUnitByRules(teamId, 'witch')) {
        const result = buildRecruitPlanResult(teamId, 'witch', '优先招募女巫');
        if (result)
            return result;
    }
    if (population >= 15 && (teamCounts.druid || 0) === 0 && canRecruitUnitByRules(teamId, 'druid')) {
        const result = buildRecruitPlanResult(teamId, 'druid', '优先招募德鲁伊');
        if (result)
            return result;
    }
    return null;
}
function chooseDemoRecruitPlan(teamId) {
    const priorityPlan = choosePriorityRecruitPlan(teamId);
    if (priorityPlan) {
        return { plan: priorityPlan.plan, blocked: !!priorityPlan.blocked, reason: priorityPlan.reason };
    }
    const weights = getCurrentRecruitmentWeights();
    const highUnits = getSortedWeightedRecruitUnits(teamId, weights, 1, Infinity);
    if (highUnits.length > 0) {
        for (const highUnit of highUnits) {
            if (!canRecruitUnitByRules(teamId, highUnit.unit.id))
                continue;
            const result = buildRecruitPlanResult(teamId, highUnit.unit.id, '权重>=1招募');
            if (result)
                return { plan: result.plan, blocked: !!result.blocked, reason: result.reason };
        }
        const guardResult = chooseGuardRecruitPlan(teamId);
        if (guardResult) {
            return { plan: guardResult.plan, blocked: !!guardResult.blocked, reason: guardResult.reason };
        }
        return { plan: null, blocked: true, reason: '存在权重>=1单位但暂不可招募' };
    }
    const randomUnits = getTeamGold(teamId) > 469
        ? RANDOM_RECRUIT_UNIT_IDS.filter(unitId => canRandomRecruitUnitStructurally(teamId, unitId) && chooseRecruitCastle(teamId, unitId))
        : [];
    if (randomUnits.length > 0) {
        const selectedUnitId = randomUnits[Math.floor(Math.random() * randomUnits.length)];
        if (getTeamGold(teamId) >= getRecruitCost(selectedUnitId, teamId)
            && !wouldExceedTeamPopulationLimit(teamId, selectedUnitId)) {
            const result = buildRecruitPlanResult(teamId, selectedUnitId, '随机招募');
            if (result)
                return { plan: result.plan, blocked: !!result.blocked, reason: result.reason };
        }
    }
    if (hasHighWeightRecruitUnit(teamId, getCurrentRecruitmentWeights())) {
        return { plan: null, blocked: true, reason: '存在权重>=1单位，跳过低权重招募' };
    }
    const lowUnit = getTopLowWeightedRecruitUnit(teamId, getCurrentRecruitmentWeights());
    if (!lowUnit) {
        const guardResult = chooseGuardRecruitPlan(teamId);
        return guardResult
            ? { plan: guardResult.plan, blocked: !!guardResult.blocked, reason: guardResult.reason }
            : { plan: null, blocked: false, reason: '无可招募单位' };
    }
    const lowResult = buildRecruitPlanResult(teamId, lowUnit.unit.id, '低权重招募');
    if (lowResult) {
        return { plan: lowResult.plan, blocked: !!lowResult.blocked, reason: lowResult.reason };
    }
    const guardResult = chooseGuardRecruitPlan(teamId);
    return guardResult
        ? { plan: guardResult.plan, blocked: !!guardResult.blocked, reason: guardResult.reason }
        : { plan: null, blocked: false, reason: `${lowUnit.unit.name}无可用招募城堡` };
}
async function executeDemoRecruitPlan(recruitPlan, token) {
    if (!recruitPlan || !appData.demoTeamTurn)
        return false;
    const unit = appData.units.find(u => u.id === recruitPlan.unitId);
    if (!unit)
        return false;
    const beforeSnapshot = snapshotDemoTeamStep();
    const actionCountBeforeRecruit = appData.moveModeRecordedActions.length;
    const demoActionCountBeforeRecruit = Array.isArray(appData.demoAllianceActionSink)
        ? appData.demoAllianceActionSink.length
        : null;
    appData.demoTeamTurn.history.push(beforeSnapshot);
    updateDemoControlButtons();
    const cost = getRecruitCost(recruitPlan.unitId, recruitPlan.teamId);
    const gold = getTeamGold(recruitPlan.teamId);
    if (gold < cost || wouldExceedTeamPopulationLimit(recruitPlan.teamId, recruitPlan.unitId)) {
        appData.demoTeamTurn.history.pop();
        return false;
    }
    setTeamGold(recruitPlan.teamId, gold - cost);
    const placementCell = appData.gridData[recruitPlan.placement.row]?.[recruitPlan.placement.col];
    if (!placementCell || (placementCell.unit && !recruitPlan.castle.occupiedByCommander)) {
        const snapshot = appData.demoTeamTurn.history.pop();
        restoreDemoTeamStep(snapshot);
        return false;
    }
    const commanderCastleSnapshot = recruitPlan.castle.occupiedByCommander
        ? snapshotCellForMove(recruitPlan.castle.row, recruitPlan.castle.col)
        : null;
    setCellUnit(placementCell, recruitPlan.unitId, recruitPlan.teamId, 0);
    clearCurrentMoveAction();
    appendMoveModeAction(makeMoveModeAction('NONE', recruitPlan.castle.row, recruitPlan.castle.col, -1, -1, {
        unitId: recruitPlan.unitId, unitIndex: UNIT_ID_TO_AEM[recruitPlan.unitId]
    }));
    appData.selectedCell = { row: recruitPlan.placement.row, col: recruitPlan.placement.col };
    appData.currentMoveTeam = recruitPlan.teamId;
    renderGrid();
    await animateDemoTeamPause(token, 350);
    const unitAction = {
        row: recruitPlan.placement.row,
        col: recruitPlan.placement.col,
        unit
    };
    const executed = await executeDemoCandidate(unitAction, recruitPlan.placement.candidate, token, true);
    if (executed && commanderCastleSnapshot) {
        restoreCellFromMoveSnapshot(recruitPlan.castle.row, recruitPlan.castle.col, commanderCastleSnapshot);
    }
    if (!executed) {
        const snapshot = appData.demoTeamTurn.history.pop();
        restoreDemoTeamStep(snapshot);
        appData.moveModeRecordedActions = appData.moveModeRecordedActions.slice(0, actionCountBeforeRecruit);
        appData.moveModeRecordedActions.forEach((action, index) => { action.index = index; });
        if (demoActionCountBeforeRecruit !== null) {
            appData.demoAllianceActionSink.splice(demoActionCountBeforeRecruit);
            appData.demoAllianceActionSink.forEach((action, index) => { action.index = index; });
        }
        appData.moveModePendingActionRecord = null;
        updateMoveModeActionsRecordStatus();
        return false;
    }
    return true;
}
function isGridLabelDisplayOption(displayOption) {
    return displayOption === 'registeredCommander' || displayOption === 'aiRecruitCastle';
}
function calculateAiRecruitCastleDisplayValues(selectRecruitPlan = chooseDemoRecruitPlan) {
    const teamShortNames = {
        blue: '蓝', red: '红', green: '绿', black: '黑', purple: '紫', orange: '黄'
    };
    return appData.teams
        .filter(team => isAiPlayerType(team.playerType))
        .flatMap(team => {
        const selection = selectRecruitPlan(team.id);
        const plan = selection && selection.plan;
        const castle = plan && plan.castle ? plan.castle : chooseRecruitCastle(team.id, null);
        if (!castle)
            return [];
        const unit = plan ? getUnitDefinition(plan.unitId) : null;
        const teamShortName = teamShortNames[team.id]
            || String(team.name || team.id || '?').replace(/队$/, '').slice(0, 1)
            || '?';
        const unitName = unit ? unit.name : (plan ? plan.unitId : null);
        const unitShortName = unit && unit.abbreviation
            ? unit.abbreviation
            : (unitName ? String(unitName).slice(0, 1) : '城');
        const details = plan
            ? `${team.name || team.id}招募${unitName}：${selection.reason || 'AI招募'}`
            : `${team.name || team.id}出兵城堡：${selection && selection.reason ? selection.reason : '当前无完整招募计划'}`;
        return [{
                row: castle.row,
                col: castle.col,
                teamId: team.id,
                unitId: plan ? plan.unitId : null,
                value: 1,
                details: details,
                backgroundColor: '#fef3c7',
                displayOption: 'aiRecruitCastle',
                displayText: `${teamShortName}${unitShortName}`,
                textColor: team.color || '#111827'
            }];
    });
}
function applyGridDisplaySettings() {
    const displayOption = document.querySelector('input[name="gridDisplayOption"]:checked').value;
    const highlightOption = document.querySelector('input[name="highlightOption"]:checked').value;
    const actionOrderScope = document.getElementById('actionOrderScope');
    const highlightSettings = document.getElementById('highlightSettings');
    if (displayOption === 'actionOrder') {
        actionOrderScope.classList.remove('hidden');
        highlightSettings.classList.add('hidden');
    }
    else if (isGridLabelDisplayOption(displayOption)) {
        actionOrderScope.classList.add('hidden');
        highlightSettings.classList.add('hidden');
    }
    else {
        actionOrderScope.classList.add('hidden');
        highlightSettings.classList.remove('hidden');
    }
    const cellValues = calculateGridDisplayValues(displayOption);
    appData.calculationResults = cellValues;
    renderGrid();
}
function calculateGridDisplayValues(displayOption) {
    const cellValues = [];
    if (displayOption === 'aiRecruitCastle') {
        return calculateAiRecruitCastleDisplayValues();
    }
    const selectedTeamId = document.getElementById('calcTeam').value;
    if (displayOption === 'registeredCommander') {
        ensureRegisteredCommanderForTeam(selectedTeamId);
    }
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            let value = null;
            let details = null;
            let backgroundColor = null;
            let enemyDistance = null;
            let allyDistance = null;
            let distanceDetails = false;
            let displayText = undefined;
            let textColor = undefined;
            switch (displayOption) {
                case 'actionOrder': {
                    const scopeOption = document.querySelector('input[name="actionOrderScopeOption"]:checked').value;
                    if (scopeOption === 'alliance') {
                        const selectedTeam = appData.teams.find(t => t.id === selectedTeamId);
                        const allianceTeams = selectedTeam
                            ? appData.teams.filter(t => t.alliance === selectedTeam.alliance)
                            : [selectedTeamId];
                        for (const allyTeam of allianceTeams) {
                            value = calculateActionOrderForTeam(i, j, allyTeam.id);
                            if (value !== null)
                                break;
                        }
                    }
                    else {
                        value = calculateActionOrderForTeam(i, j, selectedTeamId);
                    }
                    break;
                }
                case 'enemyDistance':
                    value = calculateEnemyDistance(i, j, selectedTeamId);
                    break;
                case 'distanceDifference':
                    const diffResult = calculateDistanceDifference(i, j, selectedTeamId);
                    value = diffResult.value;
                    backgroundColor = diffResult.backgroundColor;
                    break;
                case 'distanceDetails':
                    const detailResult = calculateDistanceDetails(i, j, selectedTeamId);
                    value = detailResult.value;
                    backgroundColor = detailResult.backgroundColor;
                    enemyDistance = detailResult.enemyDistance;
                    allyDistance = detailResult.allyDistance;
                    distanceDetails = true;
                    break;
                case 'coordinates':
                    value = `${i + 1},${j + 1}`;
                    break;
                case 'registeredCommander': {
                    const cell = appData.gridData[i]?.[j];
                    if (isRegisteredCommanderCell(cell) && cell.unitTeam === selectedTeamId) {
                        const team = appData.teams.find(t => t.id === cell.unitTeam);
                        value = 1;
                        details = '真指挥官';
                        backgroundColor = '#fef3c7';
                        displayText = '真王';
                        textColor = team ? team.color : '#92400e';
                    }
                    break;
                }
            }
            cellValues.push({
                row: i,
                col: j,
                value: value,
                details: details,
                backgroundColor: backgroundColor,
                enemyDistance: enemyDistance,
                allyDistance: allyDistance,
                distanceDetails: distanceDetails,
                displayOption: displayOption,
                displayText: displayText,
                textColor: textColor
            });
        }
    }
    return cellValues;
}
function calculateSingleUnitData() {
    appData.selectedAttackPosition = null;
    appData.highlightedAttackTargets = [];
    renderGrid();
    if (!appData.selectedCell)
        return;
    const { row, col } = appData.selectedCell;
    const cellData = appData.gridData[row][col];
    if (!cellData.unit) {
        appData.calculationResults = null;
        return;
    }
    const calcType = document.querySelector('input[name="singleUnitCalcType"]:checked').value;
    const highlightOption = document.querySelector('input[name="singleUnitHighlightOption"]:checked').value;
    let results = [];
    switch (calcType) {
        case 'attackTargets':
            results = calculatePotentialAttackTargets(row, col, { includeAll: true })
                .map(target => ({ ...target, showZero: true }));
            break;
        case 'supportTargets':
            results = calculatePotentialSupportTargets(row, col);
            break;
        case 'healTargets':
            results = calculatePotentialHealTargets(row, col);
            break;
        case 'movementScore':
            results = calculateMovementScores(row, col);
            break;
        case 'attackDamage':
            results = calculateAttackDamage(row, col);
            break;
        case 'counterAttackDamage':
            results = calculateCounterAttackDamage(row, col);
            break;
        case 'attackScore':
            results = calculateAttackScores(row, col);
            break;
        case 'totalScore':
            results = calculateSingleUnitTotalScores(row, col);
            break;
        case 'supportScore':
            results = calculateSupportScores(row, col);
            break;
        case 'healScore':
            results = calculateHealScores(row, col);
            break;
    }
    appData.calculationResults = results;
    displaySingleUnitResults(results, calcType, highlightOption);
    renderGrid();
}
function displaySingleUnitResults(results, calcType, highlightOption) {
    elements.singleUnitResultsContent.innerHTML = '';
    elements.singleUnitResults.classList.remove('hidden');
    elements.attackTargetsDetails.classList.add('hidden');
    const sortedResults = [...results].sort((a, b) => {
        return highlightOption === 'max' ? b.value - a.value : a.value - b.value;
    });
    const calcTypeNames = {
        attackTargets: '潜在攻击目标',
        supportTargets: '潜在支援目标',
        healTargets: '潜在治疗目标',
        movementScore: '移动分',
        attackDamage: '攻击伤害',
        counterAttackDamage: '反击伤害',
        attackScore: '攻击分',
        totalScore: '总分',
        supportScore: '支援分',
        healScore: '治疗分'
    };
    const titleElement = document.createElement('div');
    titleElement.className = 'font-semibold mb-2 pb-1 border-b';
    titleElement.textContent = `${calcTypeNames[calcType]} (共 ${results.length} 个)`;
    elements.singleUnitResultsContent.appendChild(titleElement);
    const displayCount = Math.min(15, sortedResults.length);
    if (calcType === 'attackScore' || calcType === 'totalScore') {
        for (let i = 0; i < displayCount; i++) {
            const result = sortedResults[i];
            const resultElement = document.createElement('div');
            resultElement.className = 'attack-score-item';
            resultElement.dataset.row = result.row;
            resultElement.dataset.col = result.col;
            const positionElement = document.createElement('span');
            positionElement.textContent = `(${result.row + 1}, ${result.col + 1})`;
            const valueElement = document.createElement('span');
            valueElement.className = 'font-medium';
            valueElement.textContent = result.value;
            resultElement.appendChild(positionElement);
            resultElement.appendChild(valueElement);
            resultElement.addEventListener('click', () => {
                document.querySelectorAll('.attack-score-item.selected').forEach(item => {
                    item.classList.remove('selected');
                });
                resultElement.classList.add('selected');
                if (calcType === 'totalScore') {
                    showScoreBreakdown(result);
                }
                else {
                    showAttackTargetsForPosition(result.row, result.col, result.targets);
                }
            });
            elements.singleUnitResultsContent.appendChild(resultElement);
        }
    }
    else {
        for (let i = 0; i < displayCount; i++) {
            const result = sortedResults[i];
            const resultElement = document.createElement('div');
            resultElement.className = 'flex justify-between items-center';
            const positionElement = document.createElement('span');
            positionElement.textContent = `(${result.row + 1}, ${result.col + 1})`;
            const valueElement = document.createElement('span');
            valueElement.className = 'font-medium';
            valueElement.textContent = result.value;
            if (i < 3) {
                valueElement.classList.add(highlightOption === 'max' ? 'text-teamRed' : 'text-teamGreen');
            }
            resultElement.appendChild(positionElement);
            resultElement.appendChild(valueElement);
            elements.singleUnitResultsContent.appendChild(resultElement);
        }
    }
    if (sortedResults.length > displayCount) {
        const moreElement = document.createElement('div');
        moreElement.className = 'text-center text-gray-500 text-xs mt-1';
        moreElement.textContent = `... 还有 ${sortedResults.length - displayCount} 个结果`;
        elements.singleUnitResultsContent.appendChild(moreElement);
    }
}
function showAttackTargetsForPosition(row, col, targets) {
    elements.selectedPositionInfo.textContent = `选择位置: (${row + 1}, ${col + 1})`;
    elements.attackTargetsList.innerHTML = '';
    const sortedTargets = targets.sort((a, b) => b.score - a.score);
    sortedTargets.forEach(target => {
        const targetElement = document.createElement('div');
        targetElement.className = 'attack-target-item';
        const positionElement = document.createElement('span');
        positionElement.textContent = `(${target.row + 1}, ${target.col + 1})`;
        const valueElement = document.createElement('span');
        valueElement.className = 'font-medium';
        valueElement.textContent = target.score;
        targetElement.appendChild(positionElement);
        targetElement.appendChild(valueElement);
        elements.attackTargetsList.appendChild(targetElement);
    });
    elements.attackTargetsDetails.classList.remove('hidden');
    appData.selectedAttackPosition = { row, col };
    appData.highlightedAttackTargets = sortedTargets;
    renderGrid();
}
function showScoreBreakdown(result) {
    const modal = document.createElement('div');
    modal.className = 'score-breakdown-modal';
    modal.id = 'scoreBreakdownModal';
    const content = document.createElement('div');
    content.className = 'score-breakdown-content';
    const actionTypeDisplay = {
        'attack': '攻击',
        'heal': '治疗',
        'support': '支援',
        'occupy': '占领',
        'repair': '修复',
        'summon': '召唤',
        'wait': '待机',
        'idle': '待机'
    };
    const actionTypeName = actionTypeDisplay[result.actionType] || result.actionType || '待机';
    const cell = appData.gridData[result.row][result.col];
    const terrain = cell.terrain ? appData.terrains.find(t => t.id === cell.terrain) : null;
    const terrainName = terrain ? terrain.name : '无';
    const header = document.createElement('div');
    header.className = 'score-breakdown-header';
    header.innerHTML = `

                <div>

                    <h3 class="text-lg font-bold text-gray-800">总分明细</h3>

                    <p class="text-sm text-gray-500">位置 (${result.row + 1}, ${result.col + 1}) - ${terrainName}</p>

                </div>

                <button id="closeScoreBreakdown" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>

            `;
    content.appendChild(header);
    const actionTypeTag = document.createElement('div');
    actionTypeTag.className = 'text-center mb-4';
    actionTypeTag.innerHTML = `<span class="score-breakdown-action-type ${result.actionType || 'idle'}">${actionTypeName}</span>`;
    content.appendChild(actionTypeTag);
    const breakdown = document.createElement('div');
    const moveRow = document.createElement('div');
    moveRow.className = 'score-breakdown-row';
    moveRow.innerHTML = `

                <span class="score-breakdown-label">移动分</span>

                <span class="score-breakdown-value positive">+${result.movementScore || 0}</span>

            `;
    breakdown.appendChild(moveRow);
    const opRow = document.createElement('div');
    opRow.className = 'score-breakdown-row';
    const opTypeName = {
        'attack': '攻击分',
        'heal': '治疗分',
        'support': '支援分',
        'occupy': '占领分'
    }[result.actionType] || '操作分';
    opRow.innerHTML = `

                <span class="score-breakdown-label">${opTypeName}</span>

                <span class="score-breakdown-value positive">+${result.operationScore || 0}</span>

            `;
    breakdown.appendChild(opRow);
    content.appendChild(breakdown);
    const totalRow = document.createElement('div');
    totalRow.className = 'score-breakdown-row score-breakdown-total';
    totalRow.innerHTML = `

                <span>总分</span>

                <span class="text-orange-600">= ${result.value}</span>

            `;
    content.appendChild(totalRow);
    const formula = document.createElement('div');
    formula.className = 'mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600';
    formula.innerHTML = `

                <p class="font-medium text-gray-700 mb-1">计算公式:</p>

                <p class="font-mono">总分 = 移动分(${result.movementScore || 0}) + ${opTypeName}(${result.operationScore || 0})</p>

                <p class="font-mono mt-1">= ${(result.movementScore || 0) + (result.operationScore || 0)}</p>

            `;
    content.appendChild(formula);
    modal.appendChild(content);
    document.body.appendChild(modal);
    document.getElementById('closeScoreBreakdown').addEventListener('click', () => {
        modal.remove();
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}
function downloadJsonFile(data, filename) {
    const jsonData = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);
}
function saveLayout() {
    ensureAllTeamCommanderPrices();
    const layoutData = {
        rows: appData.rows,
        cols: appData.cols,
        teams: appData.teams,
        terrains: appData.terrains,
        units: appData.units,
        gridData: appData.gridData,
        displaySettings: appData.displaySettings,
        fixedMockeryCoefficient: !!appData.fixedMockeryCoefficient,
        gold: appData.gold
    };
    downloadJsonFile(layoutData, `ancient_empire_layout_${new Date().toISOString().slice(0, 10)}.json`);
}
function createCompactLayoutData() {
    ensureAllTeamCommanderPrices();
    const terrain = [];
    const terrainOwners = [];
    const units = [];
    const tombstones = [];
    for (let i = 0; i < appData.rows; i++) {
        const terrainRow = [];
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i]?.[j] || {};
            terrainRow.push(cell.terrain || 'plain');
            if (cell.terrainTeam) {
                terrainOwners.push({ r: i + 1, c: j + 1, owner: cell.terrainTeam });
            }
            if (cell.unit) {
                const unitEntry = {
                    r: i + 1,
                    c: j + 1,
                    type: cell.unit,
                    team: cell.unitTeam,
                    level: cell.unitLevel || 0,
                    hp: cell.unitHealth || 0
                };
                if ((cell.unitExp || 0) !== 0)
                    unitEntry.exp = cell.unitExp || 0;
                normalizeUnitStatusFields(cell);
                if ((cell.unitStatus || '无') !== '无') {
                    unitEntry.status = cell.unitStatus || '无';
                    unitEntry.statusTurns = cell.unitStatusTurns || 0;
                }
                if (cell.unitStandby)
                    unitEntry.standby = true;
                if (cell.unitSupported)
                    unitEntry.supported = true;
                if (cell.unit === 'commander')
                    unitEntry.registeredCommander = isRegisteredCommanderCell(cell);
                units.push(unitEntry);
            }
            if (cell.tombstone) {
                tombstones.push({
                    r: i + 1,
                    c: j + 1,
                    rounds: cell.tombstone.rounds === 1 ? 1 : 2,
                    team: cell.tombstone.team || 'blue'
                });
            }
        }
        terrain.push(terrainRow);
    }
    return {
        format: 'yanshi-compact-layout',
        version: 1,
        meta: {
            app: '网格计算器 V6.1.4',
            exportedAt: new Date().toISOString()
        },
        map: {
            rows: appData.rows,
            cols: appData.cols
        },
        moveMode: {
            currentTeam: appData.currentMoveTeam || ensureMoveModeCurrentTeam(),
            round: elements.moveModeRoundInput ? Math.max(1, parseInt(elements.moveModeRoundInput.value) || 1) : 1,
            considerEnemyBlockers: !!appData.moveModeConsiderEnemyBlockers,
            fixedMockeryCoefficient: !!appData.fixedMockeryCoefficient
        },
        teams: appData.teams.map(team => ({
            id: team.id,
            name: team.name,
            alliance: team.alliance,
            playerType: team.playerType,
            color: team.color,
            commanderPrice: ensureTeamCommanderPrice(team),
            commanderLevel: ensureTeamCommanderState(team).level,
            commanderExp: ensureTeamCommanderState(team).exp,
            gold: getTeamGold(team.id)
        })),
        terrain,
        terrainOwners,
        units,
        tombstones,
        view: {
            showTerrain: !!appData.displaySettings.showTerrain,
            showUnits: !!appData.displaySettings.showUnits,
            showUnitLevel: !!appData.displaySettings.showUnitLevel,
            showUnitHealth: !!appData.displaySettings.showUnitHealth,
            showUnitStatus: !!appData.displaySettings.showUnitStatus,
            showGridCoordinates: !!appData.displaySettings.showGridCoordinates
        }
    };
}
function exportCompactLayoutData() {
    downloadJsonFile(createCompactLayoutData(), `yanshi_compact_layout_${new Date().toISOString().slice(0, 10)}.json`);
}
function validateCompactLayoutData(data) {
    if (!data || data.format !== 'yanshi-compact-layout')
        return '不是简洁布局JSON';
    if (!data.map || !Number.isInteger(data.map.rows) || !Number.isInteger(data.map.cols))
        return '缺少有效map.rows/map.cols';
    if (!Array.isArray(data.terrain) || data.terrain.length !== data.map.rows)
        return 'terrain行数与map.rows不一致';
    for (let i = 0; i < data.map.rows; i++) {
        if (!Array.isArray(data.terrain[i]) || data.terrain[i].length !== data.map.cols) {
            return `terrain第${i + 1}行列数与map.cols不一致`;
        }
    }
    const checkPosition = (item, label) => {
        const row = parseInt(item.r);
        const col = parseInt(item.c);
        if (!Number.isInteger(row) || !Number.isInteger(col) || row < 1 || row > data.map.rows || col < 1 || col > data.map.cols) {
            return `${label}坐标越界：r=${item.r}, c=${item.c}`;
        }
        return null;
    };
    for (const owner of data.terrainOwners || []) {
        const error = checkPosition(owner, 'terrainOwners');
        if (error)
            return error;
    }
    for (const unit of data.units || []) {
        const error = checkPosition(unit, 'units');
        if (error)
            return error;
        if (!unit.type || !unit.team)
            return `units缺少type/team：r=${unit.r}, c=${unit.c}`;
    }
    for (const tombstone of data.tombstones || []) {
        const error = checkPosition(tombstone, 'tombstones');
        if (error)
            return error;
        if (!tombstone.team)
            return `tombstones缺少team：r=${tombstone.r}, c=${tombstone.c}`;
    }
    return null;
}
function createEmptyCellWithTerrain(terrainId) {
    return {
        terrain: terrainId || 'plain',
        terrainTeam: null,
        unit: null,
        unitTeam: null,
        unitLevel: 0,
        unitHealth: 0,
        unitExp: 0,
        unitStatus: '无',
        unitStatusTurns: 0,
        unitStandby: false,
        unitSupported: false,
        unitRegisteredCommander: false,
        pendingTombstone: null,
        tombstone: null
    };
}
function applyCompactLayoutData(data) {
    const error = validateCompactLayoutData(data);
    if (error)
        throw new Error(error);
    appData.rows = data.map.rows;
    appData.cols = data.map.cols;
    appData.gridData = [];
    for (let i = 0; i < appData.rows; i++) {
        const row = [];
        for (let j = 0; j < appData.cols; j++) {
            row.push(createEmptyCellWithTerrain(data.terrain[i][j]));
        }
        appData.gridData.push(row);
    }
    if (Array.isArray(data.teams)) {
        const existingTeamsById = new Map(appData.teams.map(team => [team.id, team]));
        appData.teams = data.teams.map(team => ({
            ...(existingTeamsById.get(team.id) || {}),
            id: team.id,
            name: team.name,
            alliance: team.alliance,
            playerType: team.playerType,
            color: team.color,
            commanderPrice: normalizeCommanderRecruitPrice(team.commanderPrice),
            commanderLevel: normalizeNonNegativeInteger(team.commanderLevel, 0),
            commanderExp: normalizeNonNegativeInteger(team.commanderExp, 0),
            gold: Math.max(0, parseInt(team.gold) || 0)
        }));
        ensureAllTeamCommanderPrices();
    }
    (data.terrainOwners || []).forEach(owner => {
        const row = parseInt(owner.r) - 1;
        const col = parseInt(owner.c) - 1;
        appData.gridData[row][col].terrainTeam = owner.owner || null;
    });
    (data.units || []).forEach(unit => {
        const row = parseInt(unit.r) - 1;
        const col = parseInt(unit.c) - 1;
        const cell = appData.gridData[row][col];
        cell.unit = unit.type;
        cell.unitTeam = unit.team;
        cell.unitLevel = Math.max(0, parseInt(unit.level) || 0);
        cell.unitHealth = Math.max(0, parseInt(unit.hp) || 0);
        cell.unitExp = Math.max(0, parseInt(unit.exp) || 0);
        setUnitStatusDirect(cell, unit.status || '无', unit.statusTurns);
        cell.unitStandby = !!unit.standby;
        cell.unitSupported = !!unit.supported;
        cell.unitRegisteredCommander = unit.type === 'commander'
            ? (Object.prototype.hasOwnProperty.call(unit, 'registeredCommander') ? unit.registeredCommander === true : undefined)
            : false;
    });
    (data.tombstones || []).forEach(tombstone => {
        const row = parseInt(tombstone.r) - 1;
        const col = parseInt(tombstone.c) - 1;
        appData.gridData[row][col].tombstone = {
            rounds: parseInt(tombstone.rounds) === 1 ? 1 : 2,
            team: tombstone.team || 'blue'
        };
    });
    if (data.view) {
        appData.displaySettings = {
            ...appData.displaySettings,
            showTerrain: data.view.showTerrain !== false,
            showUnits: data.view.showUnits !== false,
            showUnitLevel: data.view.showUnitLevel !== false,
            showUnitHealth: data.view.showUnitHealth !== false,
            showUnitStatus: data.view.showUnitStatus !== false,
            showGridCoordinates: !!data.view.showGridCoordinates
        };
    }
    appData.fixedMockeryCoefficient = !!(data.moveMode && data.moveMode.fixedMockeryCoefficient === true);
    if (data.moveMode) {
        appData.currentMoveTeam = data.moveMode.currentTeam || appData.currentMoveTeam;
        appData.moveModeConsiderEnemyBlockers = data.moveMode.considerEnemyBlockers !== false;
        if (elements.moveModeRoundInput)
            elements.moveModeRoundInput.value = Math.max(1, parseInt(data.moveMode.round) || 1);
        if (elements.demoRoundInput)
            elements.demoRoundInput.value = elements.moveModeRoundInput ? elements.moveModeRoundInput.value : Math.max(1, parseInt(data.moveMode.round) || 1);
        if (elements.moveModeEnemyBlockerToggle)
            elements.moveModeEnemyBlockerToggle.checked = appData.moveModeConsiderEnemyBlockers;
        if (elements.fixedMockeryCoefficientToggle)
            elements.fixedMockeryCoefficientToggle.checked = !!appData.fixedMockeryCoefficient;
    }
    normalizeGridData();
    appData.calculationResults = null;
    appData.selectedCell = null;
    clearCurrentMoveAction();
    clearRecruitmentMove();
    clearAttackHighlight();
    clearHealHighlight();
    clearSupportHighlight();
    clearSummonHighlight();
    clearMoveRangeHighlight();
    elements.rowCount.value = appData.rows;
    elements.colCount.value = appData.cols;
    elements.showTerrain.checked = appData.displaySettings.showTerrain;
    elements.showUnits.checked = appData.displaySettings.showUnits;
    elements.showUnitLevel.checked = appData.displaySettings.showUnitLevel;
    elements.showUnitHealth.checked = appData.displaySettings.showUnitHealth;
    elements.showUnitStatus.checked = appData.displaySettings.showUnitStatus;
    elements.showGridCoordinates.checked = appData.displaySettings.showGridCoordinates || false;
    if (elements.fixedMockeryCoefficientToggle)
        elements.fixedMockeryCoefficientToggle.checked = !!appData.fixedMockeryCoefficient;
    renderGrid();
    renderTeamConfigs();
    renderTerrainList();
    renderUnitList();
    renderMoveModeTeamStats();
    updateMoveModeCurrentTeamLabel();
}
function importCompactLayoutData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            applyCompactLayoutData(data);
            alert('简洁布局导入成功');
        }
        catch (error) {
            console.error('导入简洁布局失败:', error);
            alert('导入简洁布局失败: ' + error.message);
        }
    };
    reader.readAsText(file);
}
function loadLayout() {
    elements.layoutFileInput.click();
}
function importLayoutData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const layoutData = JSON.parse(e.target.result);
            appData.rows = layoutData.rows || 10;
            appData.cols = layoutData.cols || 10;
            appData.teams = layoutData.teams || appData.teams;
            ensureAllTeamCommanderPrices();
            appData.terrains = layoutData.terrains || appData.terrains;
            appData.units = layoutData.units || appData.units;
            appData.gridData = layoutData.gridData || [];
            appData.displaySettings = layoutData.displaySettings || appData.displaySettings;
            appData.fixedMockeryCoefficient = layoutData.fixedMockeryCoefficient === true;
            appData.gold = layoutData.gold || 0;
            normalizeGridData();
            appData.calculationResults = null;
            elements.rowCount.value = appData.rows;
            elements.colCount.value = appData.cols;
            elements.showTerrain.checked = appData.displaySettings.showTerrain;
            elements.showUnits.checked = appData.displaySettings.showUnits;
            elements.showUnitLevel.checked = appData.displaySettings.showUnitLevel;
            elements.showUnitHealth.checked = appData.displaySettings.showUnitHealth;
            elements.showUnitStatus.checked = appData.displaySettings.showUnitStatus;
            elements.showGridCoordinates.checked = appData.displaySettings.showGridCoordinates || false;
            if (elements.fixedMockeryCoefficientToggle)
                elements.fixedMockeryCoefficientToggle.checked = !!appData.fixedMockeryCoefficient;
            renderGrid();
            renderTeamConfigs();
            renderTerrainList();
            renderUnitList();
            alert('布局导入成功');
        }
        catch (error) {
            console.error('导入布局失败:', error);
            alert('导入布局失败,请确保文件格式正确');
        }
    };
    reader.readAsText(file);
}
const AEM_TERRAIN_MAP = {
    'plain': 18, 'water': 0, 'house': 36, 'castle': 37, 'rundown': 27,
    'forest': 15, 'mountain': 17, 'hill': 19, 'temple': 31, 'road': 20,
    'bridge': 28, 'waterstone': 81, 'watertemple': 83, 'airport': 33,
    'bathtub': 30, 'leftwing': 32, 'rightwing': 34, 'tail': 35
};
const AEM_TERRAIN_REVERSE = {};
Object.entries(AEM_TERRAIN_MAP).forEach(([internalId, aemId]) => {
    if (!AEM_TERRAIN_REVERSE[aemId]) {
        AEM_TERRAIN_REVERSE[aemId] = internalId;
    }
});
for (let i = 1; i <= 14; i++)
    AEM_TERRAIN_REVERSE[i] = 'water';
for (let i = 38; i <= 71; i++)
    AEM_TERRAIN_REVERSE[i] = 'water';
AEM_TERRAIN_REVERSE[16] = 'forest';
for (let i = 21; i <= 26; i++)
    AEM_TERRAIN_REVERSE[i] = 'road';
for (let i = 72; i <= 79; i++)
    AEM_TERRAIN_REVERSE[i] = 'road';
AEM_TERRAIN_REVERSE[29] = 'bridge';
AEM_TERRAIN_REVERSE[80] = 'temple';
AEM_TERRAIN_REVERSE[82] = 'waterstone';
const TEAM_ID_TO_AEM = { 'blue': 0, 'red': 1, 'green': 2, 'black': 3, 'purple': 4, 'orange': 5 };
const AEM_TO_TEAM_ID = { 0: 'blue', 1: 'red', 2: 'green', 3: 'black', 4: 'purple', 5: 'orange' };
function getTeamIdFromAemValue(value) {
    const numericValue = parseInt(value);
    if (!Number.isFinite(numericValue))
        return null;
    return Object.prototype.hasOwnProperty.call(AEM_TO_TEAM_ID, numericValue) ? AEM_TO_TEAM_ID[numericValue] : null;
}
function parseAemUnitLevel(value) {
    const parsed = parseInt(value);
    if (!Number.isFinite(parsed))
        return 0;
    return Math.min(9, Math.max(0, parsed));
}
const UNIT_ID_TO_AEM = {
    'infantry': 0, 'archer': 1, 'waterelement': 2, 'witch': 3, 'elf': 4,
    'wolf': 5, 'rock': 6, 'catapult': 7, 'dragon': 8, 'commander': 9,
    'skeleton': 10, 'crystal': 11, 'healer': 12, 'rampage': 13, 'ghost': 14,
    'mage': 15, 'wolfshoot': 16, 'ice': 17, 'Slime': 18, 'mermaid': 19, 'druid': 20
};
const AEM_TO_UNIT_ID = {};
Object.entries(UNIT_ID_TO_AEM).forEach(([internalId, aemId]) => {
    AEM_TO_UNIT_ID[aemId] = internalId;
});
function exportAemJson() {
    const width = appData.cols;
    const height = appData.rows;
    const tiles = [];
    const units = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = appData.gridData[y][x];
            let aemTerrainId = 18;
            if (cell.terrain && AEM_TERRAIN_MAP[cell.terrain]) {
                aemTerrainId = AEM_TERRAIN_MAP[cell.terrain];
            }
            if (cell.terrain === 'house' || cell.terrain === 'castle') {
                let teamValue = 4094;
                if (cell.terrainTeam && TEAM_ID_TO_AEM[cell.terrainTeam] !== undefined) {
                    teamValue = TEAM_ID_TO_AEM[cell.terrainTeam];
                }
                tiles.push(`${aemTerrainId}-${teamValue}`);
            }
            else {
                tiles.push(aemTerrainId);
            }
        }
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = appData.gridData[y][x];
            if (cell.unit && UNIT_ID_TO_AEM[cell.unit] !== undefined) {
                const aemType = UNIT_ID_TO_AEM[cell.unit];
                const aemTeam = TEAM_ID_TO_AEM[cell.unitTeam] !== undefined ? TEAM_ID_TO_AEM[cell.unitTeam] : 0;
                let level = cell.unitLevel || 0;
                if (level < 0)
                    level = 0;
                if (level > 9)
                    level = 9;
                units.push(aemType, aemTeam, level, x, y);
            }
        }
    }
    ensureAllTeamCommanderPrices();
    const playerPreset = appData.teams.map(t => t.playerType === 3 ? 2 : (t.playerType !== undefined ? t.playerType : 0));
    if (playerPreset.length < 6) {
        while (playerPreset.length < 6)
            playerPreset.push(0);
    }
    const alliancePreset = appData.teams.map(t => t.alliance !== undefined ? t.alliance : -1);
    if (alliancePreset.length < 6) {
        while (alliancePreset.length < 6)
            alliancePreset.push(-1);
    }
    const commanderPricePreset = appData.teams.map(t => ensureTeamCommanderPrice(t));
    if (commanderPricePreset.length < 6) {
        while (commanderPricePreset.length < 6)
            commanderPricePreset.push(DEFAULT_COMMANDER_RECRUIT_COST);
    }
    const commanderLevelPreset = appData.teams.map(t => ensureTeamCommanderState(t).level);
    if (commanderLevelPreset.length < 6) {
        while (commanderLevelPreset.length < 6)
            commanderLevelPreset.push(0);
    }
    const commanderExpPreset = appData.teams.map(t => ensureTeamCommanderState(t).exp);
    if (commanderExpPreset.length < 6) {
        while (commanderExpPreset.length < 6)
            commanderExpPreset.push(0);
    }
    const jsonLines = [];
    jsonLines.push('{"width": ' + width + ', "height": ' + height + ', "author": null, "teams": [0,1,2,3,4,5],');
    jsonLines.push('  "tiles": [');
    for (let y = 0; y < height; y++) {
        const rowVals = [];
        for (let x = 0; x < width; x++) {
            rowVals.push(typeof tiles[y * width + x] === 'string' ? '"' + tiles[y * width + x] + '"' : tiles[y * width + x]);
        }
        jsonLines.push('    ' + rowVals.join(', ') + (y < height - 1 ? ',' : ''));
    }
    jsonLines.push('  ],');
    jsonLines.push('  "units": [');
    for (let i = 0; i < units.length; i += 5) {
        const unitVals = units.slice(i, i + 5).join(', ');
        jsonLines.push('    ' + unitVals + (i + 5 < units.length ? ',' : ''));
    }
    jsonLines.push('  ],');
    jsonLines.push('  "gold": ' + (appData.gold || 0) + ',');
    jsonLines.push('  "player_preset": [' + playerPreset.join(', ') + '],');
    jsonLines.push('  "alliance_preset": [' + alliancePreset.join(', ') + '],');
    jsonLines.push('  "commander_price_preset": [' + commanderPricePreset.join(', ') + '],');
    jsonLines.push('  "commander_level_preset": [' + commanderLevelPreset.join(', ') + '],');
    jsonLines.push('  "commander_exp_preset": [' + commanderExpPreset.join(', ') + ']');
    jsonLines.push('}');
    const jsonStr = jsonLines.join('\n');
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aem_map_${width}x${height}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);
}
function importAemJson() {
    elements.aemFileInput.click();
}
function handleAemImport(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const aemData = JSON.parse(e.target.result);
            if (!aemData.width || !aemData.height || !aemData.tiles) {
                throw new Error('无效的AEM JSON格式,缺少width/height/tiles字段');
            }
            const width = aemData.width;
            const height = aemData.height;
            if (width > 25 || height > 25) {
                throw new Error('地图尺寸超过25x25限制');
            }
            appData.rows = height;
            appData.cols = width;
            elements.rowCount.value = height;
            elements.colCount.value = width;
            resetGridData(height, width);
            if (!hasValidUnitDefinitions(appData.units)) {
                appData.units = cloneStandardUnitDefinitions();
            }
            const tiles = aemData.tiles;
            if (tiles.length === width * height) {
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const idx = y * width + x;
                        const tileVal = tiles[idx];
                        let terrainId, teamValue;
                        if (typeof tileVal === 'string' && tileVal.includes('-')) {
                            const parts = tileVal.split('-');
                            terrainId = parseInt(parts[0]);
                            teamValue = parseInt(parts[1]);
                        }
                        else {
                            terrainId = parseInt(tileVal);
                            teamValue = 4095;
                        }
                        const internalTerrain = AEM_TERRAIN_REVERSE[terrainId];
                        if (internalTerrain) {
                            appData.gridData[y][x].terrain = internalTerrain;
                            const terrainTeamId = getTeamIdFromAemValue(teamValue);
                            if (terrainTeamId) {
                                appData.gridData[y][x].terrainTeam = terrainTeamId;
                            }
                            else if (teamValue === 4094 && (internalTerrain === 'house' || internalTerrain === 'castle')) {
                                appData.gridData[y][x].terrainTeam = null;
                            }
                            else {
                                appData.gridData[y][x].terrainTeam = null;
                            }
                        }
                    }
                }
            }
            const aemUnits = aemData.units || [];
            for (let i = 0; i < aemUnits.length; i += 5) {
                if (i + 5 > aemUnits.length)
                    break;
                const aemType = aemUnits[i];
                const aemTeam = aemUnits[i + 1];
                const aemState = aemUnits[i + 2];
                const unitLevel = parseAemUnitLevel(aemState);
                const ux = aemUnits[i + 3];
                const uy = aemUnits[i + 4];
                const internalUnit = AEM_TO_UNIT_ID[aemType];
                const internalTeam = getTeamIdFromAemValue(aemTeam);
                if (internalUnit && internalTeam && uy >= 0 && uy < height && ux >= 0 && ux < width) {
                    const unitDef = getUnitDefinition(internalUnit);
                    const maxHp = unitDef ? (100 + (unitDef.hpUp || 0) * unitLevel) : 100;
                    appData.gridData[uy][ux].unit = internalUnit;
                    appData.gridData[uy][ux].unitTeam = internalTeam;
                    appData.gridData[uy][ux].unitLevel = unitLevel;
                    appData.gridData[uy][ux].unitHealth = maxHp;
                    appData.gridData[uy][ux].unitExp = 0;
                    clearUnitStatus(appData.gridData[uy][ux]);
                    appData.gridData[uy][ux].unitStandby = false;
                    appData.gridData[uy][ux].unitSupported = false;
                    appData.gridData[uy][ux].unitRegisteredCommander = internalUnit === 'commander' ? undefined : false;
                }
            }
            if (aemData.alliance_preset && aemData.alliance_preset.length >= 6) {
                for (let i = 0; i < 6; i++) {
                    const teamId = getTeamIdFromAemValue(i);
                    if (teamId) {
                        const team = appData.teams.find(t => t.id === teamId);
                        if (team) {
                            team.alliance = aemData.alliance_preset[i];
                        }
                    }
                }
            }
            if (aemData.player_preset && aemData.player_preset.length >= 6) {
                for (let i = 0; i < 6; i++) {
                    const teamId = getTeamIdFromAemValue(i);
                    if (teamId) {
                        const team = appData.teams.find(t => t.id === teamId);
                        if (team) {
                            team.playerType = aemData.player_preset[i];
                        }
                    }
                }
            }
            if (Array.isArray(aemData.commander_price_preset) && aemData.commander_price_preset.length >= 6) {
                for (let i = 0; i < 6; i++) {
                    const teamId = getTeamIdFromAemValue(i);
                    if (teamId) {
                        const team = appData.teams.find(t => t.id === teamId);
                        if (team) {
                            team.commanderPrice = normalizeCommanderRecruitPrice(aemData.commander_price_preset[i]);
                        }
                    }
                }
            }
            else {
                ensureAllTeamCommanderPrices();
            }
            if (Array.isArray(aemData.commander_level_preset) && aemData.commander_level_preset.length >= 6) {
                for (let i = 0; i < 6; i++) {
                    const teamId = getTeamIdFromAemValue(i);
                    if (teamId) {
                        const team = appData.teams.find(t => t.id === teamId);
                        if (team)
                            team.commanderLevel = normalizeNonNegativeInteger(aemData.commander_level_preset[i], 0);
                    }
                }
            }
            if (Array.isArray(aemData.commander_exp_preset) && aemData.commander_exp_preset.length >= 6) {
                for (let i = 0; i < 6; i++) {
                    const teamId = getTeamIdFromAemValue(i);
                    if (teamId) {
                        const team = appData.teams.find(t => t.id === teamId);
                        if (team)
                            team.commanderExp = normalizeNonNegativeInteger(aemData.commander_exp_preset[i], 0);
                    }
                }
            }
            ensureAllTeamCommanderPrices();
            appData.gold = aemData.gold || 0;
            if (elements.goldInput)
                elements.goldInput.value = appData.gold;
            appData.displaySettings.showUnits = true;
            appData.calculationResults = null;
            normalizeGridData();
            if (elements.showUnits)
                elements.showUnits.checked = true;
            renderGrid();
            renderTeamConfigs();
            renderTerrainList();
            renderUnitList();
            alert(`AEM地图导入成功!尺寸: ${width}x${height}`);
        }
        catch (error) {
            console.error('导入AEM地图失败:', error);
            alert('导入AEM地图失败: ' + error.message);
        }
    };
    reader.readAsText(file);
}
function bindEventListeners() {
    elements.mapConfigBtn.addEventListener('click', () => switchPanel('mapConfig'));
    elements.fullMapCalcBtn.addEventListener('click', () => switchPanel('fullMapCalc'));
    elements.singleUnitCalcBtn.addEventListener('click', () => switchPanel('singleUnitCalc'));
    elements.moveModeBtn.addEventListener('click', () => switchPanel('moveMode'));
    elements.demoModeBtn.addEventListener('click', () => switchPanel('demoMode'));
    if (elements.mapBasicSettingsTab) {
        elements.mapBasicSettingsTab.addEventListener('click', () => switchMapConfigSubSection('basic'));
    }
    if (elements.mapEditTab) {
        elements.mapEditTab.addEventListener('click', () => switchMapConfigSubSection('edit'));
    }
    if (elements.fullMapDisplayTab) {
        elements.fullMapDisplayTab.addEventListener('click', () => switchFullMapSubSection('display'));
    }
    if (elements.fullMapOverviewTab) {
        elements.fullMapOverviewTab.addEventListener('click', () => switchFullMapSubSection('overview'));
    }
    elements.startDemoBtn.addEventListener('click', startDemoMode);
    if (elements.startTeamDemoBtn) {
        elements.startTeamDemoBtn.addEventListener('click', startDemoMode);
    }
    if (elements.demoPauseBtn) {
        elements.demoPauseBtn.addEventListener('click', toggleDemoTeamPause);
    }
    if (elements.demoStepBtn) {
        elements.demoStepBtn.addEventListener('click', stepDemoTeamOnce);
    }
    if (elements.demoScoreType) {
        elements.demoScoreType.addEventListener('change', updateManualDemoScoreLayer);
    }
    if (elements.demoTeamSelect) {
        elements.demoTeamSelect.addEventListener('change', () => {
            updateDemoControlButtons();
            updateHardAiInsightPanel();
        });
    }
    if (elements.hardAiInsightRefresh) {
        elements.hardAiInsightRefresh.addEventListener('click', () => {
            updateHardAiInsightPanel();
        });
    }
    if (elements.demoUndoBtn) {
        elements.demoUndoBtn.addEventListener('click', undoDemoTeamStep);
    }
    if (elements.startAllianceDemoBtn) {
        elements.startAllianceDemoBtn.addEventListener('click', startDemoAlliance);
    }
    if (elements.stopAllianceDemoBtn) {
        elements.stopAllianceDemoBtn.addEventListener('click', stopDemoAlliance);
    }
    if (elements.demoAlliancePlayBtn) {
        elements.demoAlliancePlayBtn.addEventListener('click', playSelectedAllianceDemoResult);
    }
    if (elements.demoAllianceStepBtn) {
        elements.demoAllianceStepBtn.addEventListener('click', stepAllianceDemoViewingForward);
    }
    if (elements.demoAllianceUndoBtn) {
        elements.demoAllianceUndoBtn.addEventListener('click', stepAllianceDemoViewingBackward);
    }
    if (elements.demoAlliancePrevRoundBtn) {
        elements.demoAlliancePrevRoundBtn.addEventListener('click', () => jumpDemoAllianceRound(-1));
    }
    if (elements.demoAllianceNextRoundBtn) {
        elements.demoAllianceNextRoundBtn.addEventListener('click', () => jumpDemoAllianceRound(1));
    }
    if (elements.endMoveTurnBtn) {
        elements.endMoveTurnBtn.addEventListener('click', endMoveModeTurn);
    }
    if (elements.surrenderMoveTeamBtn) {
        elements.surrenderMoveTeamBtn.addEventListener('click', surrenderCurrentMoveTeam);
    }
    if (elements.moveModeRecordActionsToggle) {
        elements.moveModeRecordActionsToggle.addEventListener('change', (event) => {
            const enabled = !!event.target.checked;
            if (enabled && appData.moveModeRecordedActions.length > 0
                && !confirm('开始新的 Actions 记录？确定后会清空已有记录。')) {
                event.target.checked = false;
                return;
            }
            appData.moveModeRecordActions = enabled;
            appData.moveModePendingActionRecord = null;
            if (enabled) {
                appData.moveModeRecordedActions = [];
                resetMoveModeHistoryBaseline();
            }
            updateMoveModeActionsRecordStatus();
        });
    }
    if (elements.exportMoveModeActionsBtn) {
        elements.exportMoveModeActionsBtn.addEventListener('click', exportMoveModeActions);
    }
    if (elements.undoMoveStepBtn) {
        elements.undoMoveStepBtn.addEventListener('click', undoMoveModeStep);
    }
    if (elements.restartMoveTurnBtn) {
        elements.restartMoveTurnBtn.addEventListener('click', restartMoveModeTurn);
    }
    if (elements.refreshMoveTargetBtn) {
        elements.refreshMoveTargetBtn.addEventListener('click', refreshMoveModeAiTargets);
    }
    if (elements.moveModeRoundInput) {
        elements.moveModeRoundInput.addEventListener('change', syncMoveModeRoundToDemoRound);
    }
    if (elements.moveModeEnemyBlockerToggle) {
        elements.moveModeEnemyBlockerToggle.addEventListener('change', (e) => {
            appData.moveModeConsiderEnemyBlockers = e.target.checked;
            if (appData.activePanel === 'moveMode') {
                renderGrid();
                updateMoveModeRange();
            }
        });
    }
    if (elements.fixedMockeryCoefficientToggle) {
        elements.fixedMockeryCoefficientToggle.checked = !!appData.fixedMockeryCoefficient;
        elements.fixedMockeryCoefficientToggle.addEventListener('change', (e) => {
            appData.fixedMockeryCoefficient = e.target.checked;
            appData.calculationResults = null;
        });
    }
    if (elements.moveDebugUploadBtn) {
        elements.moveDebugUploadBtn.addEventListener('click', () => elements.moveDebugFileInput.click());
    }
    if (elements.moveDebugFileInput) {
        elements.moveDebugFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                loadMoveDebugTargetLayout(e.target.files[0]);
                e.target.value = '';
            }
        });
    }
    if (elements.startMoveDebugBtn) {
        elements.startMoveDebugBtn.addEventListener('click', startMoveModeDebug);
    }
    if (elements.moveDebugPrevBtn) {
        elements.moveDebugPrevBtn.addEventListener('click', () => stepMoveDebugPlayback(-1));
    }
    if (elements.moveDebugNextBtn) {
        elements.moveDebugNextBtn.addEventListener('click', () => stepMoveDebugPlayback(1));
    }
    if (elements.moveDebugPlayBtn) {
        elements.moveDebugPlayBtn.addEventListener('click', playMoveDebugPlayback);
    }
    if (elements.moveDebugStopBtn) {
        elements.moveDebugStopBtn.addEventListener('click', () => stopMoveDebugPlayback(true));
    }
    document.querySelectorAll('input[name="demoType"]').forEach(input => {
        input.addEventListener('change', updateDemoModeSections);
    });
    elements.applyGridSize.addEventListener('click', () => {
        const rows = parseInt(elements.rowCount.value) || 10;
        const cols = parseInt(elements.colCount.value) || 10;
        appData.rows = Math.min(Math.max(rows, 1), 25);
        appData.cols = Math.min(Math.max(cols, 1), 25);
        elements.rowCount.value = appData.rows;
        elements.colCount.value = appData.cols;
        resetGridData(appData.rows, appData.cols);
        appData.calculationResults = null;
        renderGrid();
    });
    elements.goldInput.addEventListener('change', (e) => {
        appData.gold = Math.max(0, parseInt(e.target.value) || 0);
        e.target.value = appData.gold;
    });
    elements.toggleTerrainConfig.addEventListener('click', () => {
        elements.terrainConfigContent.classList.toggle('hidden');
        const icon = elements.toggleTerrainConfig.querySelector('i');
        icon.classList.toggle('fa-chevron-down');
        icon.classList.toggle('fa-chevron-up');
    });
    elements.toggleUnitConfig.addEventListener('click', () => {
        elements.unitConfigContent.classList.toggle('hidden');
        const icon = elements.toggleUnitConfig.querySelector('i');
        icon.classList.toggle('fa-chevron-down');
        icon.classList.toggle('fa-chevron-up');
    });
    elements.showTerrain.addEventListener('change', (e) => {
        appData.displaySettings.showTerrain = e.target.checked;
        renderGrid();
    });
    elements.showUnits.addEventListener('change', (e) => {
        appData.displaySettings.showUnits = e.target.checked;
        renderGrid();
    });
    elements.showUnitLevel.addEventListener('change', (e) => {
        appData.displaySettings.showUnitLevel = e.target.checked;
        renderGrid();
    });
    elements.showUnitHealth.addEventListener('change', (e) => {
        appData.displaySettings.showUnitHealth = e.target.checked;
        renderGrid();
    });
    elements.showUnitStatus.addEventListener('change', (e) => {
        appData.displaySettings.showUnitStatus = e.target.checked;
        renderGrid();
    });
    elements.showGridCoordinates.addEventListener('change', (e) => {
        appData.displaySettings.showGridCoordinates = e.target.checked;
        renderGrid();
    });
    elements.saveLayout.addEventListener('click', saveLayout);
    elements.loadLayout.addEventListener('click', loadLayout);
    if (elements.exportCompactLayout) {
        elements.exportCompactLayout.addEventListener('click', exportCompactLayoutData);
    }
    if (elements.importCompactLayout) {
        elements.importCompactLayout.addEventListener('click', () => elements.compactLayoutFileInput.click());
    }
    elements.removeAllUnits.addEventListener('click', removeAllUnits);
    if (elements.surrenderTeamBtn) {
        elements.surrenderTeamBtn.addEventListener('click', surrenderTeam);
    }
    elements.exportAemJson.addEventListener('click', exportAemJson);
    elements.importAemJson.addEventListener('click', importAemJson);
    elements.aemFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleAemImport(e.target.files[0]);
            e.target.value = '';
        }
    });
    elements.layoutFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            importLayoutData(e.target.files[0]);
            e.target.value = '';
        }
    });
    if (elements.compactLayoutFileInput) {
        elements.compactLayoutFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                importCompactLayoutData(e.target.files[0]);
                e.target.value = '';
            }
        });
    }
    elements.executeMirror.addEventListener('click', executeMirror);
    elements.executeCopy.addEventListener('click', executeCopy);
    elements.toggleMirrorCopy.addEventListener('click', () => {
        elements.mirrorCopyContent.classList.toggle('hidden');
        const icon = elements.toggleMirrorCopy.querySelector('i');
        icon.classList.toggle('fa-chevron-down');
        icon.classList.toggle('fa-chevron-up');
    });
    elements.calculateOverview.addEventListener('click', calculateOverview);
    elements.applyGridDisplay.addEventListener('click', applyGridDisplaySettings);
    document.querySelectorAll('input[name="gridDisplayOption"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const displayOption = document.querySelector('input[name="gridDisplayOption"]:checked').value;
            const actionOrderScope = document.getElementById('actionOrderScope');
            const highlightSettings = document.getElementById('highlightSettings');
            if (displayOption === 'actionOrder') {
                actionOrderScope.classList.remove('hidden');
                highlightSettings.classList.add('hidden');
            }
            else if (isGridLabelDisplayOption(displayOption)) {
                actionOrderScope.classList.add('hidden');
                highlightSettings.classList.add('hidden');
            }
            else {
                actionOrderScope.classList.add('hidden');
                highlightSettings.classList.remove('hidden');
            }
        });
    });
    elements.calculateSingleUnit.addEventListener('click', calculateSingleUnitData);
    if (elements.applyTerrainToRect) {
        elements.applyTerrainToRect.addEventListener('click', applyTerrainToRect);
    }
    elements.applyTerrainToRect.addEventListener('click', applyTerrainToRect);
    elements.resetUnitInfo.addEventListener('click', () => {
        elements.unitLevel.value = 0;
        elements.unitHealth.value = 100;
        elements.unitStatus.value = '无';
        elements.unitStatusTurns.value = '';
        alert('兵种信息已重置为默认值');
    });
    elements.importUnitsBtn.addEventListener('click', () => {
        elements.unitImportFileInput.click();
    });
    elements.unitImportFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            importUnitsFromFile(e.target.files[0]);
            e.target.value = '';
        }
    });
    elements.clearImportedUnitsBtn.addEventListener('click', clearImportedUnits);
    if (elements.selectTombstoneMarker) {
        elements.selectTombstoneMarker.addEventListener('click', () => {
            appData.selectedMarker = appData.selectedMarker === 'tombstone' ? null : 'tombstone';
            appData.selectedTerrain = null;
            appData.selectedUnit = null;
            renderTerrainList();
            renderUnitList();
            elements.tombstoneMarkerStatus.textContent = appData.selectedMarker === 'tombstone' ? '已选择墓碑标记，点击无单位网格添加/移除' : '';
        });
    }
    elements.areaType.addEventListener('change', toggleAreaType);
    elements.processTeam.addEventListener('change', toggleProcessOptions);
    elements.processType.addEventListener('change', toggleProcessOptions);
    elements.processLevel.addEventListener('change', toggleProcessOptions);
    elements.processStatus.addEventListener('change', toggleProcessOptions);
    elements.processHealth.addEventListener('change', toggleProcessOptions);
    elements.processDelete.addEventListener('change', toggleProcessOptions);
    elements.addAreaBtn.addEventListener('click', addArea);
    elements.importAreaConfigBtn.addEventListener('click', importAreaConfig);
    elements.areaConfigFileInput.addEventListener('change', loadAreaConfigFromFile);
    elements.processAllAreasBtn.addEventListener('click', processAllAreas);
    elements.saveAreaConfigBtn.addEventListener('click', saveAreaConfig);
    elements.clearAreasBtn.addEventListener('click', clearAllAreas);
    initAreaUnitTypeSelect();
    elements.toggleFormatBrush.addEventListener('click', toggleFormatBrushMode);
}
function toggleFormatBrushMode() {
    const brush = appData.formatBrushState;
    const btn = elements.toggleFormatBrush;
    const statusEl = document.getElementById('brushStatusText');
    if (!brush.active) {
        brush.brushTeam = elements.brushTeam.value;
        brush.brushLevel = elements.brushLevel.value;
        brush.brushHealth = elements.brushHealth.value.trim();
        brush.brushExp = elements.brushExp.value.trim();
        brush.brushStatus = elements.brushStatus.value;
        brush.brushStatusTurns = elements.brushStatusTurns.value.trim();
        brush.brushStandby = elements.brushStandby.value;
        if (!brush.brushTeam && !brush.brushLevel && !brush.brushHealth && !brush.brushExp && !brush.brushStatus && !brush.brushStatusTurns && !brush.brushStandby) {
            statusEl.textContent = '请先填写至少一项属性';
            statusEl.style.color = '#ef4444';
            return;
        }
        if (brush.brushLevel !== '' && (isNaN(brush.brushLevel) || brush.brushLevel < 0 || brush.brushLevel > 9)) {
            statusEl.textContent = '等级需为 0-9 的整数';
            statusEl.style.color = '#ef4444';
            return;
        }
        if (brush.brushHealth !== '' && brush.brushHealth !== '满血') {
            const h = parseInt(brush.brushHealth);
            if (isNaN(h) || h < 1 || h > 999) {
                statusEl.textContent = '血量需为 1-999 的整数或"满血"';
                statusEl.style.color = '#ef4444';
                return;
            }
        }
        if (brush.brushExp !== '') {
            const exp = parseInt(brush.brushExp);
            if (isNaN(exp) || exp < 0) {
                statusEl.textContent = '经验exp需为不小于0的整数';
                statusEl.style.color = '#ef4444';
                return;
            }
        }
        brush.active = true;
        btn.classList.add('format-brush-active');
        document.body.classList.add('format-brush-active');
        btn.innerHTML = '<i class="fa fa-paint-brush mr-1"></i>退出格式刷';
        statusEl.textContent = '连续刷写模式，点击网格刷写属性，再次点击格式刷退出';
        statusEl.style.color = '#9333ea';
    }
    else {
        brush.active = false;
        btn.classList.remove('format-brush-active');
        document.body.classList.remove('format-brush-active');
        btn.innerHTML = '<i class="fa fa-paint-brush mr-1"></i>格式刷';
        statusEl.textContent = '';
    }
}
function applyFormatBrush(row, col) {
    const brush = appData.formatBrushState;
    const cell = appData.gridData[row][col];
    if (!cell.unit)
        return;
    if (brush.brushTeam !== '') {
        cell.unitTeam = brush.brushTeam;
    }
    if (brush.brushLevel !== '') {
        cell.unitLevel = parseInt(brush.brushLevel);
    }
    if (brush.brushHealth !== '') {
        if (brush.brushHealth === '满血') {
            const unit = appData.units.find(u => u.id === cell.unit);
            const level = brush.brushLevel !== '' ? parseInt(brush.brushLevel) : cell.unitLevel;
            cell.unitHealth = unit ? (100 + unit.hpUp * level) : 100;
        }
        else {
            cell.unitHealth = parseInt(brush.brushHealth);
        }
    }
    if (brush.brushExp !== '') {
        cell.unitExp = Math.max(0, parseInt(brush.brushExp) || 0);
    }
    if (brush.brushStatus !== '') {
        setUnitStatusDirect(cell, brush.brushStatus, brush.brushStatusTurns);
    }
    else if (brush.brushStatusTurns !== '') {
        normalizeUnitStatusFields(cell);
        setUnitStatusDirect(cell, cell.unitStatus || '无', brush.brushStatusTurns);
    }
    if (brush.brushStandby !== '') {
        cell.unitStandby = brush.brushStandby === 'true';
        cell.unitSupported = false;
    }
    appData.calculationResults = null;
    renderGrid();
}
function matchUnitType(unitType) {
    let unit = appData.units.find(u => u.name === unitType);
    if (unit)
        return unit;
    if (unitType.length >= 2) {
        const firstChar = unitType.charAt(0);
        const matches = appData.units.filter(u => u.name.startsWith(firstChar));
        if (matches.length === 1 && matches[0].name === unitType) {
            return matches[0];
        }
        unit = matches.find(u => u.name === unitType);
        if (unit)
            return unit;
        unit = matches.find(u => u.name.includes(unitType) || unitType.includes(u.name));
        if (unit)
            return unit;
    }
    return appData.units.find(u => u.name.includes(unitType) ||
        unitType.includes(u.name) ||
        u.abbreviation === unitType);
}
function importUnitsFromFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.units || !Array.isArray(data.units)) {
                throw new Error('JSON格式错误:缺少units数组');
            }
            let importCount = 0;
            let skipCount = 0;
            let errorCount = 0;
            data.units.forEach(unitData => {
                try {
                    const row = unitData.row;
                    const col = unitData.col;
                    const unitType = unitData.unitType;
                    const team = unitData.team;
                    if (row < 1 || row > appData.rows || col < 1 || col > appData.cols) {
                        skipCount++;
                        return;
                    }
                    const unit = matchUnitType(unitType);
                    if (!unit) {
                        errorCount++;
                        return;
                    }
                    const teamMap = {
                        '蓝': 'blue',
                        '红': 'red',
                        '绿': 'green',
                        '黑': 'black',
                        '紫': 'purple',
                        '黄': 'orange'
                    };
                    const teamId = teamMap[team] || team;
                    if (!appData.teams.find(t => t.id === teamId)) {
                        errorCount++;
                        return;
                    }
                    const unitMaxHp = 100 + unit.hpUp * 0;
                    const gridRow = row - 1;
                    const gridCol = col - 1;
                    if (appData.gridData[gridRow][gridCol].tombstone) {
                        skipCount++;
                        return;
                    }
                    appData.gridData[gridRow][gridCol].unit = unit.id;
                    appData.gridData[gridRow][gridCol].unitTeam = teamId;
                    appData.gridData[gridRow][gridCol].unitLevel = 0;
                    appData.gridData[gridRow][gridCol].unitHealth = unitMaxHp;
                    appData.gridData[gridRow][gridCol].unitExp = 0;
                    appData.gridData[gridRow][gridCol].unitRegisteredCommander = unit.id === 'commander' && !teamHasCommander(teamId);
                    clearUnitStatus(appData.gridData[gridRow][gridCol]);
                    importCount++;
                }
                catch (err) {
                    errorCount++;
                }
            });
            let statusText = `导入完成:成功 ${importCount} 个`;
            if (skipCount > 0) {
                statusText += `,跳过 ${skipCount} 个(超出范围)`;
            }
            if (errorCount > 0) {
                statusText += `,错误 ${errorCount} 个`;
            }
            elements.importStatus.textContent = statusText;
            elements.importStatus.style.color = errorCount > 0 ? '#f59e0b' : '#10b981';
            renderGrid();
        }
        catch (error) {
            console.error('导入单位信息失败:', error);
            elements.importStatus.textContent = '导入失败:' + error.message;
            elements.importStatus.style.color = '#ef4444';
            alert('导入单位信息失败,请确保文件格式正确');
        }
    };
    reader.readAsText(file);
}
function clearImportedUnits() {
    if (!confirm('确定要清除所有已导入的单位吗?')) {
        return;
    }
    let clearCount = 0;
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            if (appData.gridData[i][j].unit) {
                appData.gridData[i][j].unit = null;
                appData.gridData[i][j].unitTeam = null;
                appData.gridData[i][j].unitLevel = 1;
                appData.gridData[i][j].unitHealth = 100;
                appData.gridData[i][j].unitExp = 0;
                clearUnitStatus(appData.gridData[i][j]);
                clearCount++;
            }
        }
    }
    elements.importStatus.textContent = `已清除 ${clearCount} 个单位`;
    elements.importStatus.style.color = '#6b7280';
    renderGrid();
}
function initAreaUnitTypeSelect() {
    const select = elements.areaNewUnitType;
    select.innerHTML = '<option value="">选择兵种</option>';
    appData.units.forEach(unit => {
        const option = document.createElement('option');
        option.value = unit.id;
        option.textContent = unit.name;
        select.appendChild(option);
    });
    const deleteSelect = elements.deleteUnitType;
    if (deleteSelect) {
        deleteSelect.innerHTML = '<option value="">选择要删除的兵种</option>';
        appData.units.forEach(unit => {
            const option = document.createElement('option');
            option.value = unit.id;
            option.textContent = unit.name;
            deleteSelect.appendChild(option);
        });
    }
}
function toggleAreaType() {
    if (elements.areaType.value === 'rect') {
        elements.rectParams.classList.remove('hidden');
        elements.diamondParams.classList.add('hidden');
    }
    else {
        elements.rectParams.classList.add('hidden');
        elements.diamondParams.classList.remove('hidden');
    }
}
function toggleProcessOptions() {
    if (elements.processTeam.checked)
        elements.teamSelect.classList.remove('hidden');
    else
        elements.teamSelect.classList.add('hidden');
    if (elements.processType.checked)
        elements.typeSelect.classList.remove('hidden');
    else
        elements.typeSelect.classList.add('hidden');
    if (elements.processLevel.checked)
        elements.levelInput.classList.remove('hidden');
    else
        elements.levelInput.classList.add('hidden');
    if (elements.processStatus.checked)
        elements.statusSelect.classList.remove('hidden');
    else
        elements.statusSelect.classList.add('hidden');
    if (elements.processHealth.checked)
        elements.healthInput.classList.remove('hidden');
    else
        elements.healthInput.classList.add('hidden');
    if (elements.processDelete.checked)
        elements.deleteSelect.classList.remove('hidden');
    else
        elements.deleteSelect.classList.add('hidden');
}
function isInDiamond(row, col, centerRow, centerCol, dist) {
    const distance = Math.abs(row - centerRow) + Math.abs(col - centerCol);
    return distance <= dist;
}
function addArea() {
    const areaType = elements.areaType.value;
    let areaData = {
        id: Date.now(),
        type: areaType,
        processTeam: elements.processTeam.checked,
        processType: elements.processType.checked,
        processLevel: elements.processLevel.checked,
        processStatus: elements.processStatus.checked,
        processHealth: elements.processHealth.checked,
        processDelete: elements.processDelete.checked
    };
    if (areaType === 'rect') {
        const startRow = parseInt(elements.areaStartRow.value);
        const startCol = parseInt(elements.areaStartCol.value);
        const endRow = parseInt(elements.areaEndRow.value);
        const endCol = parseInt(elements.areaEndCol.value);
        if (isNaN(startRow) || isNaN(startCol) || isNaN(endRow) || isNaN(endCol)) {
            showAreaStatus('请输入有效的行列数', '#ef4444');
            return;
        }
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);
        const minCol = Math.min(startCol, endCol);
        const maxCol = Math.max(startCol, endCol);
        if (minRow < 1 || maxRow > appData.rows || minCol < 1 || maxCol > appData.cols) {
            showAreaStatus(`范围超出网格(最大 ${appData.rows}行 × ${appData.cols}列)`, '#ef4444');
            return;
        }
        areaData.startRow = minRow;
        areaData.startCol = minCol;
        areaData.endRow = maxRow;
        areaData.endCol = maxCol;
        areaData.desc = `矩形: (${minRow},${minCol})-(${maxRow},${maxCol})`;
    }
    else {
        const centerRow = parseInt(elements.diamondCenterRow.value);
        const centerCol = parseInt(elements.diamondCenterCol.value);
        const manhattanDist = parseInt(elements.diamondManhattanDist.value);
        if (isNaN(centerRow) || isNaN(centerCol) || isNaN(manhattanDist)) {
            showAreaStatus('请输入有效的参数', '#ef4444');
            return;
        }
        if (centerRow < 1 || centerRow > appData.rows || centerCol < 1 || centerCol > appData.cols) {
            showAreaStatus(`中心点超出网格`, '#ef4444');
            return;
        }
        areaData.centerRow = centerRow;
        areaData.centerCol = centerCol;
        areaData.manhattanDist = manhattanDist;
        areaData.desc = `菱形: 中心(${centerRow},${centerCol}) 距离${manhattanDist}`;
    }
    if (areaData.processTeam) {
        areaData.targetTeam = elements.areaTargetTeam.value;
        const team = appData.teams.find(t => t.id === areaData.targetTeam);
        areaData.targetTeamName = team ? team.name : areaData.targetTeam;
    }
    if (areaData.processType)
        areaData.newUnitType = elements.areaNewUnitType.value;
    if (areaData.processLevel)
        areaData.newLevel = parseInt(elements.areaNewLevel.value) || 0;
    if (areaData.processStatus) {
        areaData.newStatus = elements.areaNewStatus.value;
        areaData.newStatusTurns = elements.areaNewStatusTurns.value.trim();
    }
    if (areaData.processHealth)
        areaData.newHealth = parseInt(elements.areaNewHealth.value) || 100;
    if (areaData.processDelete)
        areaData.deleteUnitType = elements.deleteUnitType.value;
    areas.push(areaData);
    renderAreaList();
    let msg = `已添加${areaData.desc}`;
    if (areaData.processTeam)
        msg += ` → ${areaData.targetTeamName}`;
    showAreaStatus(msg, '#10b981');
}
function showAreaStatus(text, color) {
    elements.areaStatus.textContent = text;
    elements.areaStatus.style.color = color;
}
function renderAreaList() {
    if (areas.length === 0) {
        elements.areaList.innerHTML = '<p class="text-xs text-gray-400 italic">暂无配置的区域</p>';
        return;
    }
    elements.areaList.innerHTML = areas.map((area, index) => {
        let processInfo = [];
        if (area.processTeam)
            processInfo.push(`队伍→${area.targetTeamName}`);
        if (area.processType)
            processInfo.push('类型');
        if (area.processLevel)
            processInfo.push(`等级=${area.newLevel}`);
        if (area.processStatus)
            processInfo.push(`状态=${area.newStatus}${area.newStatusTurns !== undefined && area.newStatusTurns !== '' ? area.newStatusTurns : ''}`);
        if (area.processHealth)
            processInfo.push(`血量=${area.newHealth}`);
        if (area.processDelete) {
            const delUnit = appData.units.find(u => u.id === area.deleteUnitType);
            processInfo.push(`删除${delUnit ? delUnit.name : area.deleteUnitType}`);
        }
        return `

                    <div class="flex justify-between items-center bg-gray-50 p-2 rounded mb-1">

                        <div class="text-xs">

                            <span class="font-medium">${area.type === 'rect' ? '矩形' : '菱形'}${index + 1}:</span>

                            ${area.desc}

                            ${processInfo.length > 0 ? `<span class="text-green-600">[${processInfo.join(',')}]</span>` : ''}

                        </div>

                        <div class="flex gap-1">

                            <button onclick="editArea(${area.id})" class="text-xs bg-yellow-500 text-white px-2 py-0.5 rounded hover:bg-yellow-600">

                                编辑

                            </button>

                            <button onclick="processSingleArea(${area.id})" class="text-xs bg-purple-500 text-white px-2 py-0.5 rounded hover:bg-purple-600">

                                处理

                            </button>

                            <button onclick="removeArea(${area.id})" class="text-xs bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600">

                                删除

                            </button>

                        </div>

                    </div>

                `;
    }).join('');
}
function editArea(areaId) {
    const area = areas.find(a => a.id === areaId);
    if (!area)
        return;
    elements.areaType.value = area.type;
    toggleAreaType();
    if (area.type === 'rect') {
        elements.areaStartRow.value = area.startRow;
        elements.areaStartCol.value = area.startCol;
        elements.areaEndRow.value = area.endRow;
        elements.areaEndCol.value = area.endCol;
    }
    else {
        elements.diamondCenterRow.value = area.centerRow;
        elements.diamondCenterCol.value = area.centerCol;
        elements.diamondManhattanDist.value = area.manhattanDist;
    }
    elements.processTeam.checked = area.processTeam || false;
    if (area.processTeam)
        elements.teamSelect.classList.remove('hidden');
    elements.areaTargetTeam.value = area.targetTeam || 'blue';
    elements.processType.checked = area.processType || false;
    if (area.processType)
        elements.typeSelect.classList.remove('hidden');
    elements.areaNewUnitType.value = area.newUnitType || '';
    elements.processLevel.checked = area.processLevel || false;
    if (area.processLevel)
        elements.levelInput.classList.remove('hidden');
    elements.areaNewLevel.value = area.newLevel || 0;
    elements.processStatus.checked = area.processStatus || false;
    if (area.processStatus)
        elements.statusSelect.classList.remove('hidden');
    elements.areaNewStatus.value = area.newStatus || '无';
    elements.areaNewStatusTurns.value = area.newStatusTurns || '';
    elements.processHealth.checked = area.processHealth || false;
    if (area.processHealth)
        elements.healthInput.classList.remove('hidden');
    elements.areaNewHealth.value = area.newHealth || 100;
    elements.processDelete.checked = area.processDelete || false;
    if (area.processDelete)
        elements.deleteSelect.classList.remove('hidden');
    elements.deleteUnitType.value = area.deleteUnitType || '';
    showAreaStatus(`正在编辑区域 ${areaId},修改后点击"添加区域"保存`, '#f59e0b');
    const originalText = elements.addAreaBtn.innerHTML;
    elements.addAreaBtn.innerHTML = '<i class="fa fa-save mr-1"></i>更新区域';
    elements.addAreaBtn.onclick = function () {
        areas = areas.filter(a => a.id !== areaId);
        addArea();
        elements.addAreaBtn.innerHTML = originalText;
        elements.addAreaBtn.onclick = addArea;
    };
}
function processSingleArea(areaId) {
    const area = areas.find(a => a.id === areaId);
    if (!area)
        return;
    let processedCount = processArea(area);
    renderGrid();
    showAreaStatus(`已处理区域:修改了 ${processedCount} 个单位`, '#10b981');
}
function processArea(area, countOnly = false) {
    let count = 0;
    if (area.type === 'rect') {
        for (let row = area.startRow - 1; row < area.endRow; row++) {
            for (let col = area.startCol - 1; col < area.endCol; col++) {
                if (appData.gridData[row][col].unit) {
                    if (countOnly) {
                        count++;
                    }
                    else {
                        applyAreaProcess(appData.gridData[row][col], area);
                        count++;
                    }
                }
            }
        }
    }
    else {
        for (let row = 1; row <= appData.rows; row++) {
            for (let col = 1; col <= appData.cols; col++) {
                if (isInDiamond(row, col, area.centerRow, area.centerCol, area.manhattanDist)) {
                    const cell = appData.gridData[row - 1][col - 1];
                    if (cell.unit) {
                        if (countOnly) {
                            count++;
                        }
                        else {
                            applyAreaProcess(cell, area);
                            count++;
                        }
                    }
                }
            }
        }
    }
    return count;
}
function applyAreaProcess(cell, area) {
    if (area.processDelete && area.deleteUnitType) {
        if (cell.unit === area.deleteUnitType) {
            cell.unit = null;
            cell.unitTeam = null;
            cell.unitLevel = 1;
            cell.unitHealth = 100;
            cell.unitExp = 0;
            cell.unitRegisteredCommander = false;
            clearUnitStatus(cell);
            return;
        }
    }
    if (area.processTeam)
        cell.unitTeam = area.targetTeam;
    if (area.processType && area.newUnitType) {
        cell.unit = area.newUnitType;
        cell.unitRegisteredCommander = area.newUnitType === 'commander' && !teamHasCommander(cell.unitTeam);
    }
    if (area.processLevel)
        cell.unitLevel = area.newLevel;
    if (area.processStatus)
        setUnitStatusDirect(cell, area.newStatus, area.newStatusTurns);
    if (area.processHealth)
        cell.unitHealth = area.newHealth;
}
function processAllAreas() {
    if (areas.length === 0) {
        showAreaStatus('没有配置的区域需要处理', '#f59e0b');
        return;
    }
    let total = 0;
    areas.forEach(area => {
        total += processArea(area);
    });
    renderGrid();
    showAreaStatus(`已处理 ${areas.length} 个区域:共修改了 ${total} 个单位`, '#10b981');
}
function removeArea(areaId) {
    areas = areas.filter(a => a.id !== areaId);
    renderAreaList();
    showAreaStatus('已删除区域', '#6b7280');
}
function clearAllAreas() {
    if (areas.length === 0)
        return;
    if (!confirm('确定要清除所有区域配置吗?'))
        return;
    areas = [];
    renderAreaList();
    showAreaStatus('已清除所有区域配置', '#6b7280');
}
function importAreaConfig() {
    elements.areaConfigFileInput.click();
}
function loadAreaConfigFromFile(event) {
    const file = event.target.files[0];
    if (!file)
        return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.areas && Array.isArray(data.areas)) {
                areas = data.areas;
                renderAreaList();
                showAreaStatus(`已导入 ${areas.length} 个区域配置`, '#10b981');
            }
            else {
                showAreaStatus('文件格式不正确', '#ef4444');
            }
        }
        catch (err) {
            showAreaStatus('解析文件失败', '#ef4444');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}
function saveAreaConfig() {
    if (areas.length === 0) {
        showAreaStatus('没有区域配置可导出', '#f59e0b');
        return;
    }
    const data = {
        areas: areas,
        savedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `区域配置_${new Date().toLocaleString().replace(/[:\/]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showAreaStatus('区域配置已导出', '#10b981');
}
function initializeDragAndDrop() {
    let isDragging = false;
    let dragStartCell = null;
    let dragPreview = null;
    let hasMoved = false;
    let dragType = null;
    elements.gridContainer.addEventListener('mousedown', (e) => {
        const cell = e.target.closest('.grid-cell');
        if (!cell)
            return;
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        const cellData = appData.gridData[row][col];
        const canDragUnit = appData.activePanel === 'singleUnitCalc' && cellData.unit;
        const canDragTombstone = appData.activePanel === 'mapConfig' && !cellData.unit && cellData.tombstone;
        if (!canDragUnit && !canDragTombstone) {
            appData.calculationResults = null;
            return;
        }
        isDragging = true;
        hasMoved = false;
        dragType = canDragUnit ? 'unit' : 'tombstone';
        dragStartCell = { row, col, type: dragType, data: { ...cellData } };
        dragPreview = document.createElement('div');
        dragPreview.className = 'drag-preview';
        if (dragType === 'unit') {
            const unit = appData.units.find(u => u.id === cellData.unit);
            const team = appData.teams.find(t => t.id === cellData.unitTeam);
            dragPreview.style.color = team ? team.color : '#000';
            dragPreview.textContent = unit ? unit.abbreviation : '';
        }
        else {
            const tombstoneTeam = appData.teams.find(t => t.id === cellData.tombstone.team);
            dragPreview.style.border = `2px solid ${tombstoneTeam ? tombstoneTeam.color : '#6b7280'}`;
            dragPreview.style.color = tombstoneTeam ? tombstoneTeam.color : '#374151';
            dragPreview.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
            dragPreview.style.borderRadius = '50%';
            dragPreview.textContent = cellData.tombstone.rounds === 1 ? '1' : '2';
        }
        dragPreview.style.left = e.pageX + 'px';
        dragPreview.style.top = e.pageY + 'px';
        document.body.appendChild(dragPreview);
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging || !dragPreview)
            return;
        hasMoved = true;
        appData.dragState.isDragging = true;
        dragPreview.style.left = e.pageX + 'px';
        dragPreview.style.top = e.pageY + 'px';
        const cell = e.target.closest('.grid-cell');
        if (cell) {
            document.querySelectorAll('.grid-cell.drag-valid, .grid-cell.drag-invalid').forEach(c => {
                c.classList.remove('drag-valid', 'drag-invalid');
            });
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            const targetData = appData.gridData[row][col];
            if ((row !== dragStartCell.row || col !== dragStartCell.col) && !targetData.unit && !targetData.tombstone) {
                cell.classList.add('drag-valid');
            }
            else {
                cell.classList.add('drag-invalid');
            }
        }
    });
    document.addEventListener('mouseup', (e) => {
        if (!isDragging)
            return;
        document.querySelectorAll('.grid-cell.drag-valid, .grid-cell.drag-invalid').forEach(c => {
            c.classList.remove('drag-valid', 'drag-invalid');
        });
        const cell = e.target.closest('.grid-cell');
        if (cell && dragStartCell) {
            const targetRow = parseInt(cell.dataset.row);
            const targetCol = parseInt(cell.dataset.col);
            const targetData = appData.gridData[targetRow][targetCol];
            if ((targetRow !== dragStartCell.row || targetCol !== dragStartCell.col) && !targetData.unit && !targetData.tombstone) {
                if (dragStartCell.type === 'tombstone') {
                    moveTombstone(dragStartCell.row, dragStartCell.col, targetRow, targetCol);
                }
                else {
                    moveUnit(dragStartCell.row, dragStartCell.col, targetRow, targetCol);
                    updateSelectedUnitInfo(targetRow, targetCol);
                }
                appData.selectedCell = { row: targetRow, col: targetCol };
                renderGrid();
            }
        }
        if (dragPreview) {
            document.body.removeChild(dragPreview);
            dragPreview = null;
        }
        isDragging = false;
        dragStartCell = null;
        dragType = null;
        if (!hasMoved)
            appData.dragState.isDragging = false;
        hasMoved = false;
    });
}
function moveUnit(fromRow, fromCol, toRow, toCol) {
    const fromCell = appData.gridData[fromRow][fromCol];
    const toCell = appData.gridData[toRow][toCol];
    if (toCell.tombstone)
        return false;
    toCell.unit = fromCell.unit;
    toCell.unitTeam = fromCell.unitTeam;
    toCell.unitLevel = fromCell.unitLevel;
    toCell.unitHealth = fromCell.unitHealth;
    toCell.unitExp = fromCell.unitExp || 0;
    toCell.unitStatus = fromCell.unitStatus;
    toCell.unitStatusTurns = fromCell.unitStatusTurns || 0;
    toCell.unitSupported = fromCell.unitSupported || false;
    toCell.unitRegisteredCommander = fromCell.unitRegisteredCommander || false;
    fromCell.unit = null;
    fromCell.unitTeam = null;
    fromCell.unitLevel = 1;
    fromCell.unitHealth = 100;
    fromCell.unitExp = 0;
    fromCell.unitSupported = false;
    fromCell.unitRegisteredCommander = false;
    clearUnitStatus(fromCell);
    appData.calculationResults = null;
    return true;
}
function moveTombstone(fromRow, fromCol, toRow, toCol) {
    const fromCell = appData.gridData[fromRow][fromCol];
    const toCell = appData.gridData[toRow][toCol];
    if (!fromCell.tombstone || toCell.unit || toCell.tombstone)
        return false;
    toCell.tombstone = { ...fromCell.tombstone };
    fromCell.tombstone = null;
    appData.calculationResults = null;
    return true;
}
const DEMO_TEAM_ORDER = ['blue', 'red', 'green', 'black', 'purple', 'orange'];
function getOrderedTeams() {
    return DEMO_TEAM_ORDER
        .map(teamId => appData.teams.find(team => team.id === teamId))
        .filter(Boolean);
}
function renderDemoTeamSelect() {
    if (!elements.demoTeamSelect)
        return;
    const previousValue = elements.demoTeamSelect.value;
    elements.demoTeamSelect.innerHTML = '';
    const aiTeams = getOrderedTeams().filter(team => isAiPlayerType(team.playerType));
    aiTeams.forEach(team => {
        const option = document.createElement('option');
        option.value = team.id;
        option.textContent = team.name;
        elements.demoTeamSelect.appendChild(option);
    });
    if (previousValue && aiTeams.some(team => team.id === previousValue)) {
        elements.demoTeamSelect.value = previousValue;
    }
    else if (aiTeams.length > 0) {
        elements.demoTeamSelect.value = aiTeams[0].id;
    }
    if (elements.demoTeamStatus && aiTeams.length === 0) {
        elements.demoTeamStatus.textContent = '当前没有AI队伍，请先在队伍配置中将队伍类型设为AI';
    }
    renderDemoAllianceStartTeamSelect(aiTeams);
    updateDemoControlButtons();
}
function renderDemoAllianceStartTeamSelect(aiTeams = getOrderedTeams().filter(team => isAiPlayerType(team.playerType))) {
    if (!elements.demoAllianceStartTeamSelect)
        return;
    const previousValue = elements.demoAllianceStartTeamSelect.value;
    elements.demoAllianceStartTeamSelect.innerHTML = '';
    aiTeams.forEach(team => {
        const option = document.createElement('option');
        option.value = team.id;
        option.textContent = team.name;
        elements.demoAllianceStartTeamSelect.appendChild(option);
    });
    if (previousValue && aiTeams.some(team => team.id === previousValue)) {
        elements.demoAllianceStartTeamSelect.value = previousValue;
    }
    else if (aiTeams.length > 0) {
        elements.demoAllianceStartTeamSelect.value = aiTeams[0].id;
    }
    if (elements.demoAllianceStatus && aiTeams.length === 0) {
        elements.demoAllianceStatus.textContent = '当前没有AI队伍，请先在队伍配置中将队伍类型设为AI';
    }
}
function updateDemoModeSections() {
    const demoTypeInput = document.querySelector('input[name="demoType"]:checked');
    const demoType = demoTypeInput ? demoTypeInput.value : 'unit';
    if (elements.demoUnitSection)
        elements.demoUnitSection.classList.toggle('hidden', demoType !== 'unit');
    if (elements.demoTeamSection)
        elements.demoTeamSection.classList.toggle('hidden', demoType !== 'team');
    if (elements.demoAllianceSection)
        elements.demoAllianceSection.classList.toggle('hidden', demoType !== 'alliance');
    if (demoType === 'team')
        updateHardAiInsightPanel();
}
function calculateTeamIncome(teamId) {
    let income = 0;
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i][j];
            if (cell.terrainTeam === teamId) {
                if (cell.terrain === 'house')
                    income += 50;
                if (cell.terrain === 'castle')
                    income += 100;
            }
            if (cell.unit && cell.unitTeam === teamId) {
                const unit = appData.units.find(u => u.id === cell.unit);
                if (unit && unit.name === '指挥官') {
                    income += 50 + 25 * (cell.unitLevel || 0);
                }
            }
        }
    }
    return income;
}
function settleDemoTeamGold(teamId) {
    const team = appData.teams.find(t => t.id === teamId);
    if (!team)
        return { before: 0, income: 0, after: 0 };
    const income = calculateTeamIncome(teamId);
    const before = getTeamGold(teamId);
    team.gold = before + income;
    renderTeamConfigs();
    return { before, income, after: team.gold };
}
function processDemoTeamTombstones(teamId) {
    return processTombstonesForTeam(teamId);
}
function processDemoTeamStatuses(teamId) {
    let clearedNegative = 0;
    let clearedInspired = 0;
    let decremented = 0;
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i][j];
            if (!cell.unit || cell.unitTeam !== teamId)
                continue;
            normalizeUnitStatusFields(cell);
            const status = cell.unitStatus || '无';
            if (!Object.prototype.hasOwnProperty.call(STATUS_DEFAULT_TURNS, status) || status === '无')
                continue;
            const terrain = cell.terrain ? appData.terrains.find(t => t.id === cell.terrain) : null;
            const terrainName = terrain ? terrain.name : '';
            if (debuff.includes(status) && (terrainName === '神庙' || terrainName === '水庙')) {
                clearedNegative++;
                clearUnitStatus(cell);
                continue;
            }
            if ((cell.unitStatusTurns || 0) <= 0) {
                if (debuff.includes(status))
                    clearedNegative++;
                if (status === '鼓舞')
                    clearedInspired++;
                clearUnitStatus(cell);
            }
            else {
                cell.unitStatusTurns = Math.max(0, (cell.unitStatusTurns || 0) - 1);
                decremented++;
            }
        }
    }
    return { clearedNegative, clearedInspired, decremented };
}
function processDemoTeamTurnStartHealth(teamId) {
    const currentTeam = appData.teams.find(t => t.id === teamId);
    if (!currentTeam)
        return { dead: 0 };
    const healthChanges = [];
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i][j];
            if (!cell || !cell.unit)
                continue;
            const unit = appData.units.find(u => u.id === cell.unit);
            const unitTeam = appData.teams.find(t => t.id === cell.unitTeam);
            if (!unit || !unitTeam)
                continue;
            const terrain = cell.terrain ? appData.terrains.find(t => t.id === cell.terrain) : null;
            const abilities = unit.abilities || [];
            const status = cell.unitStatus || '无';
            const maxHealth = 100 + (unit.hpUp || 0) * (cell.unitLevel || 0);
            let delta = 0;
            if (cell.unitTeam === teamId) {
                const terrainOwnerTeam = cell.terrainTeam
                    ? appData.teams.find(team => team.id === cell.terrainTeam)
                    : null;
                const isOwnedBuildingHeal = (cell.terrain === 'house' || cell.terrain === 'castle')
                    && terrainOwnerTeam
                    && terrainOwnerTeam.alliance === unitTeam.alliance;
                const isPublicTerrainHeal = cell.terrain === 'temple'
                    || cell.terrain === 'watertemple'
                    || cell.terrain === 'bathtub';
                const canReceiveTerrainHeal = isOwnedBuildingHeal || isPublicTerrainHeal;
                const poisonBlocksTerrainHeal = status === '中毒' && !abilities.includes('亡灵');
                if (!poisonBlocksTerrainHeal && terrain && (terrain.heal || 0) > 0 && canReceiveTerrainHeal) {
                    delta += terrain.heal || 0;
                }
                if (status === '中毒') {
                    delta += abilities.includes('亡灵') ? 10 : -10;
                }
                if (abilities.includes('复原')) {
                    delta += Math.floor(maxHealth * 0.25);
                }
                if (!poisonBlocksTerrainHeal && terrain) {
                    const terrainName = terrain.name || '';
                    if (abilities.includes('水之子') && WaterTerrain.includes(terrainName))
                        delta += 10;
                    if (abilities.includes('山之子') && MountainTerrain.includes(terrainName))
                        delta += 10;
                    if (abilities.includes('森林之子') && terrainName === '树林')
                        delta += 10;
                }
            }
            else if (unitTeam.alliance !== currentTeam.alliance) {
                if (cell.terrain === 'castle' && cell.terrainTeam === teamId) {
                    delta -= 50;
                }
            }
            const shouldClampOwnOverMax = cell.unitTeam === teamId && (cell.unitHealth || 0) > maxHealth;
            if (delta !== 0 || shouldClampOwnOverMax) {
                healthChanges.push({
                    row: i,
                    col: j,
                    delta,
                    maxHealth,
                    clampToMaxHealth: cell.unitTeam === teamId
                });
            }
        }
    }
    let dead = 0;
    for (const change of healthChanges) {
        const cell = appData.gridData[change.row]?.[change.col];
        if (!cell || !cell.unit)
            continue;
        const oldHealth = cell.unitHealth || 0;
        const healthAfterOverflowClamp = change.clampToMaxHealth
            ? Math.min(change.maxHealth, oldHealth)
            : oldHealth;
        const changedHealth = healthAfterOverflowClamp + change.delta;
        const nextHealth = change.clampToMaxHealth
            ? Math.min(change.maxHealth, changedHealth)
            : changedHealth;
        cell.unitHealth = nextHealth;
        if (cell.unitHealth <= 0) {
            dead++;
            removeUnitAndMaybeCreateTombstone(change.row, change.col, teamId);
        }
    }
    return { dead };
}
function resetDemoTeamUnitsStandby(teamId) {
    let count = 0;
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData?.[i]?.[j];
            if (cell && cell.unit && cell.unitTeam === teamId) {
                if (cell.unitStandby)
                    count++;
                cell.unitStandby = false;
                cell.unitSupported = false;
            }
        }
    }
    return count;
}
function formatKillStats(killsByUnit) {
    const entries = Object.entries(killsByUnit || {});
    if (entries.length === 0)
        return '本回合击杀：无';
    return '本回合击杀：' + entries.map(([unitId, count]) => {
        const unit = appData.units.find(u => u.id === unitId);
        return `${unit ? unit.name : unitId} ${count}`;
    }).join('，');
}
function updateDemoControlButtons() {
    const turn = appData.demoTeamTurn;
    const active = !!(turn && turn.running);
    const selectedTeamId = elements.demoTeamSelect ? elements.demoTeamSelect.value : '';
    const selectedTeam = appData.teams.find(t => t.id === selectedTeamId);
    const canStartManualStep = !!(selectedTeam && isAiPlayerType(selectedTeam.playerType));
    if (elements.demoPauseBtn) {
        elements.demoPauseBtn.disabled = !active || !!(turn && turn.manualStep);
        elements.demoPauseBtn.textContent = turn && turn.paused ? '继续' : '暂停';
    }
    if (elements.demoStepBtn)
        elements.demoStepBtn.disabled = !active && !canStartManualStep;
    if (elements.demoUndoBtn)
        elements.demoUndoBtn.disabled = !(turn && turn.history && turn.history.length > 0);
}
function collectBoardUnitCounts(excludeTeamId = null) {
    const counts = {};
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i][j];
            if (cell.unit && (!excludeTeamId || cell.unitTeam !== excludeTeamId)) {
                counts[cell.unit] = (counts[cell.unit] || 0) + 1;
            }
        }
    }
    return counts;
}
function addKillStatsFromCounts(beforeCounts, afterCounts) {
    const turn = appData.demoTeamTurn;
    if (!turn)
        return;
    Object.keys(beforeCounts || {}).forEach(unitId => {
        const removed = (beforeCounts[unitId] || 0) - (afterCounts[unitId] || 0);
        if (removed > 0) {
            turn.killsByUnit[unitId] = (turn.killsByUnit[unitId] || 0) + removed;
        }
    });
}
function snapshotDemoTeamStep() {
    const turn = appData.demoTeamTurn;
    return {
        gridData: JSON.parse(JSON.stringify(appData.gridData)),
        teams: JSON.parse(JSON.stringify(appData.teams)),
        pendingExpEvents: JSON.parse(JSON.stringify(appData.pendingExpEvents || [])),
        moveModeRound: elements.moveModeRoundInput
            ? Math.max(1, parseInt(elements.moveModeRoundInput.value) || 1)
            : 1,
        demoRound: elements.demoRoundInput
            ? Math.max(1, parseInt(elements.demoRoundInput.value) || 1)
            : 1,
        currentMoveTeam: appData.currentMoveTeam,
        currentMoveAction: appData.currentMoveAction ? JSON.parse(JSON.stringify(appData.currentMoveAction)) : null,
        selectedCell: appData.selectedCell ? { ...appData.selectedCell } : null,
        killsByUnit: JSON.parse(JSON.stringify(turn ? turn.killsByUnit || {} : {})),
        phase: turn ? turn.phase : null,
        manualStep: turn ? !!turn.manualStep : false,
        preview: turn && turn.preview ? JSON.parse(JSON.stringify(turn.preview)) : null,
        turnStart: turn && turn.turnStart ? JSON.parse(JSON.stringify(turn.turnStart)) : null,
        actionQueue: turn && turn.actionQueue ? JSON.parse(JSON.stringify(turn.actionQueue)) : null,
        hardAiReservedBuildingTargets: [...(turn?.hardAiReservedBuildingTargets || [])],
        hardAiBuildingAssignments: turn?.hardAiBuildingAssignments
            ? JSON.parse(JSON.stringify(turn.hardAiBuildingAssignments)) : [],
        moveModeRecordedActionCount: appData.moveModeRecordedActions.length
    };
}
function restoreDemoTeamStep(snapshot) {
    if (!snapshot || !appData.demoTeamTurn)
        return;
    appData.demoEnemyMovementBlocking = true;
    appData.gridData = JSON.parse(JSON.stringify(snapshot.gridData));
    appData.teams = JSON.parse(JSON.stringify(snapshot.teams));
    normalizeGridData();
    appData.pendingExpEvents = JSON.parse(JSON.stringify(snapshot.pendingExpEvents || []));
    const restoredRound = Math.max(1, parseInt(snapshot.moveModeRound || snapshot.demoRound) || 1);
    if (elements.moveModeRoundInput)
        elements.moveModeRoundInput.value = restoredRound;
    if (elements.demoRoundInput)
        elements.demoRoundInput.value = restoredRound;
    appData.currentMoveTeam = snapshot.currentMoveTeam || null;
    appData.currentMoveAction = snapshot.currentMoveAction ? JSON.parse(JSON.stringify(snapshot.currentMoveAction)) : null;
    appData.selectedCell = snapshot.selectedCell ? { ...snapshot.selectedCell } : null;
    appData.demoTeamTurn.killsByUnit = JSON.parse(JSON.stringify(snapshot.killsByUnit || {}));
    appData.demoTeamTurn.phase = snapshot.phase || 'unitActions';
    appData.demoTeamTurn.manualStep = !!snapshot.manualStep;
    appData.demoTeamTurn.preview = snapshot.preview ? JSON.parse(JSON.stringify(snapshot.preview)) : null;
    appData.demoTeamTurn.turnStart = snapshot.turnStart ? JSON.parse(JSON.stringify(snapshot.turnStart)) : null;
    appData.demoTeamTurn.actionQueue = snapshot.actionQueue ? JSON.parse(JSON.stringify(snapshot.actionQueue)) : null;
    appData.demoTeamTurn.hardAiReservedBuildingTargets =
        [...(snapshot.hardAiReservedBuildingTargets || [])];
    appData.demoTeamTurn.hardAiBuildingAssignments = snapshot.hardAiBuildingAssignments
        ? JSON.parse(JSON.stringify(snapshot.hardAiBuildingAssignments)) : [];
    appData.demoTeamTurn.hardAiInsightOrder = null;
    if (Number.isInteger(snapshot.moveModeRecordedActionCount)) {
        appData.moveModeRecordedActions = appData.moveModeRecordedActions.slice(0, snapshot.moveModeRecordedActionCount);
        appData.moveModeRecordedActions.forEach((action, index) => { action.index = index; });
        appData.moveModePendingActionRecord = null;
        updateMoveModeActionsRecordStatus();
    }
    clearAttackHighlight();
    clearHealHighlight();
    clearSupportHighlight();
    clearSummonHighlight();
    clearMoveRangeHighlight();
    normalizeGridData();
    renderGrid();
    if (appData.demoTeamTurn.manualStep) {
        updateManualDemoScoreLayer();
    }
    else {
        updateDemoTeamPreview();
    }
    if (elements.demoKillStats)
        elements.demoKillStats.textContent = formatKillStats(appData.demoTeamTurn.killsByUnit);
    updateDemoControlButtons();
}
function getNextDemoTeamUnit(teamId) {
    return calculateNextTeamActionUnit(teamId);
}
function chooseBestDemoCandidate(row, col, unitAction = null) {
    const assignedBuilding = unitAction?.hardAiBuildingAssignment || null;
    const movementOptions = unitAction
        ? { hardAiAssignedBuilding: assignedBuilding } : {};
    const candidates = calculateSingleUnitTotalScores(row, col, true, false, { movementOptions,
        hardAiSeizeCastles: unitAction?.hardAiCastleSeizure?.targets || null });
    const blockade = unitAction?.hardAiCastleBlockade;
    if (blockade) {
        const waitCandidates = safeCalculateScoreList(calculateTotalScores, row, col, { movementOptions }).filter(candidate => candidate.actionType === 'wait');
        if (blockade.role === 'garrison' || blockade.role === 'advance') {
            const required = waitCandidates.find(candidate => candidate.row === blockade.row && candidate.col === blockade.col);
            if (required)
                return required;
        }
        else if (blockade.role === 'vacate') {
            const available = waitCandidates.filter(candidate => (candidate.row !== row || candidate.col !== col)
                && (candidate.row !== blockade.row || candidate.col !== blockade.col));
            if (available.length)
                return chooseBestLandingCandidate(available, true);
        }
    }
    if (unitAction?.hardAiCastleSeizure?.ready) {
        const castleKeys = new Set(unitAction.hardAiCastleSeizure.targets
            .map(target => `${target.row},${target.col}`));
        const captures = candidates.filter(candidate => candidate.actionType === 'occupy'
            && castleKeys.has(`${candidate.row},${candidate.col}`));
        if (captures.length)
            return chooseBestLandingCandidate(captures, true);
    }
    if (unitAction?.hardAiHouseGuardLanding) {
        const { row: guardRow, col: guardCol } = unitAction.hardAiHouseGuardLanding;
        const bestValue = Math.max(...candidates.map(candidate => candidate.value));
        const houseGuard = candidates.find(candidate => candidate.row === guardRow
            && candidate.col === guardCol && candidate.value === bestValue);
        if (houseGuard)
            return houseGuard;
    }
    return chooseBestLandingCandidate(candidates, true);
}
function formatDemoCandidate(unitAction, candidate) {
    if (!unitAction || !candidate)
        return '暂无';
    const unitName = unitAction.unit ? unitAction.unit.name : '未知单位';
    let text = `${unitName} (${unitAction.row + 1},${unitAction.col + 1})：${candidate.preview}，总分 ${candidate.value}`;
    if (candidate.target) {
        text += `，目标 (${candidate.target.row + 1},${candidate.target.col + 1})`;
    }
    return text;
}
function getDemoScoreType() {
    return elements.demoScoreType ? elements.demoScoreType.value : 'total';
}
function getDemoScoreTypeLabel(type = getDemoScoreType()) {
    return {
        total: '总分',
        movement: '移动分',
        attack: '攻击分',
        support: '支援分',
        heal: '治疗分'
    }[type] || '总分';
}
function mergeBestLandingScore(map, score, value, extra = {}) {
    if (!score || !Number.isFinite(value))
        return;
    const key = score.row + ',' + score.col;
    const current = map.get(key);
    if (!current || value > current.value) {
        map.set(key, {
            row: score.row,
            col: score.col,
            value,
            showZero: true,
            ...extra
        });
    }
}
function getAllowedMovementLandingSet(row, col, excludeOrigin = false, movementOptions = {}) {
    const allowed = new Set();
    const movementScores = safeCalculateScoreList(calculateMovementScores, row, col, movementOptions);
    movementScores.forEach(score => {
        if (excludeOrigin && score.row === row && score.col === col)
            return;
        if (!canStandOnMovementTarget(score.row, score.col, row, col))
            return;
        allowed.add(score.row + ',' + score.col);
    });
    return allowed;
}
function buildDemoLandingScores(row, col, scoreType = getDemoScoreType(), excludeOrigin = false, options = {}) {
    const movementOptions = options.movementOptions || {};
    const allowed = getAllowedMovementLandingSet(row, col, excludeOrigin, movementOptions);
    const resultMap = new Map();
    if (scoreType === 'total') {
        safeCalculateScoreList(calculateTotalScores, row, col, { movementOptions }).forEach(candidate => {
            if (excludeOrigin && candidate.row === row && candidate.col === col)
                return;
            if (!allowed.has(candidate.row + ',' + candidate.col))
                return;
            mergeBestLandingScore(resultMap, candidate, candidate.value, {
                actionType: candidate.actionType,
                targetRow: candidate.target ? candidate.target.row : undefined,
                targetCol: candidate.target ? candidate.target.col : undefined
            });
        });
    }
    else if (scoreType === 'movement') {
        safeCalculateScoreList(calculateMovementScores, row, col, movementOptions).forEach(score => {
            if (excludeOrigin && score.row === row && score.col === col)
                return;
            if (!allowed.has(score.row + ',' + score.col))
                return;
            mergeBestLandingScore(resultMap, score, Number(score.value) || 0);
        });
    }
    else {
        const actionType = { attack: 'attack', support: 'support', heal: 'heal' }[scoreType];
        safeCalculateScoreList(calculateTotalScores, row, col, { movementOptions }).forEach(candidate => {
            if (!actionType || candidate.actionType !== actionType)
                return;
            if (excludeOrigin && candidate.row === row && candidate.col === col)
                return;
            if (!allowed.has(candidate.row + ',' + candidate.col))
                return;
            mergeBestLandingScore(resultMap, candidate, Number(candidate.operationScore) || 0, {
                actionType: candidate.actionType,
                targetRow: candidate.target ? candidate.target.row : undefined,
                targetCol: candidate.target ? candidate.target.col : undefined
            });
        });
    }
    return [...resultMap.values()].map(score => ({ ...score, displayFloor: true }));
}
function renderDemoLandingScores(row, col, options = {}) {
    appData.calculationResults = buildDemoLandingScores(row, col, getDemoScoreType(), !!options.excludeOrigin);
    renderGrid();
}
function renderDemoRecruitLandingScores(plan) {
    if (!plan || !plan.placement) {
        appData.calculationResults = null;
        renderGrid();
        return;
    }
    const row = plan.placement.row;
    const col = plan.placement.col;
    const cell = appData.gridData[row]?.[col];
    if (!cell)
        return;
    const snapshot = snapshotCellForMove(row, col);
    const originalGold = getTeamGold(plan.teamId);
    const recruitCost = getRecruitCost(plan.unitId, plan.teamId);
    const hiddenOriginCell = plan.castle?.occupiedByCommander
        && snapshot.unit === 'commander'
        && snapshot.unitTeam === plan.teamId
        ? snapshot
        : null;
    setCellUnit(cell, plan.unitId, plan.teamId, 0);
    setTeamGold(plan.teamId, originalGold - recruitCost);
    try {
        appData.calculationResults = buildDemoLandingScores(row, col, getDemoScoreType(), !!plan.castle?.occupiedByCommander, { movementOptions: { hiddenOriginCell } });
    }
    finally {
        setTeamGold(plan.teamId, originalGold);
        restoreCellFromMoveSnapshot(row, col, snapshot);
    }
    renderGrid();
}
function updateManualDemoScoreLayer() {
    const turn = appData.demoTeamTurn;
    if (!turn || !turn.manualStep || !turn.preview)
        return;
    if (turn.preview.kind === 'unit' && turn.preview.unitAction) {
        renderDemoLandingScores(turn.preview.unitAction.row, turn.preview.unitAction.col);
    }
    else if (turn.preview.kind === 'recruit' && turn.preview.selection && turn.preview.selection.plan) {
        renderDemoRecruitLandingScores(turn.preview.selection.plan);
    }
    updateManualDemoPreviewText();
}
function settleDemoTeamTurnStart(teamId) {
    const goldResult = settleDemoTeamGold(teamId);
    const tombstoneChanged = processDemoTeamTombstones(teamId);
    const statusResult = processDemoTeamStatuses(teamId);
    const healthResult = processDemoTeamTurnStartHealth(teamId);
    const resetCount = resetDemoTeamUnitsStandby(teamId);
    calculateOverview();
    return {
        gold: goldResult,
        tombstoneChanged,
        status: statusResult,
        health: healthResult,
        resetStandby: resetCount
    };
}
function settleDemoTeamTurnEnd(teamId) {
    const resetCount = resetDemoTeamUnitsStandby(teamId);
    return { resetStandby: resetCount };
}
function formatTurnStartSummary(turnStart) {
    if (!turnStart)
        return '回合开始尚未结算';
    return `金币：${turnStart.gold.before} + ${turnStart.gold.income} = ${turnStart.gold.after}<br>` +
        `墓碑处理：${turnStart.tombstoneChanged ? '有变化' : '无变化'}；` +
        `状态处理：递减 ${turnStart.status.decremented || 0}，清除负面 ${turnStart.status.clearedNegative}，鼓舞 ${turnStart.status.clearedInspired}；` +
        `血量死亡 ${turnStart.health.dead} 个；重置待机 ${turnStart.resetStandby} 个`;
}
function getManualPreviewBestLine() {
    const turn = appData.demoTeamTurn;
    if (!turn || !turn.preview)
        return '暂无';
    if (turn.preview.kind === 'unit') {
        return formatDemoCandidate(turn.preview.unitAction, turn.preview.candidate);
    }
    if (turn.preview.kind === 'recruit') {
        const selection = turn.preview.selection;
        if (!selection || !selection.plan)
            return selection ? selection.reason : '无可招募单位';
        const unit = appData.units.find(u => u.id === selection.plan.unitId);
        const castle = selection.plan.castle;
        return `${selection.reason}：${unit ? unit.name : selection.plan.unitId}，城堡 (${castle.row + 1},${castle.col + 1})，${selection.plan.placement.candidate.preview}，总分 ${selection.plan.placement.candidate.value}`;
    }
    return '暂无';
}
function updateManualDemoPreviewText() {
    const turn = appData.demoTeamTurn;
    if (!turn || !turn.manualStep)
        return;
    const team = appData.teams.find(t => t.id === turn.teamId);
    const phaseName = {
        turnStartPending: '等待回合开始结算',
        unitPreview: '单位行动预览',
        unitExecute: '等待执行单位行动',
        recruitPreview: '招募预览',
        recruitExecute: '等待执行招募',
        done: '演示完成'
    }[turn.phase] || turn.phase;
    if (elements.demoNextPreview) {
        elements.demoNextPreview.innerHTML = `${phaseName}<br>${getManualPreviewBestLine()}`;
    }
    if (elements.demoTeamStatus) {
        elements.demoTeamStatus.innerHTML = `
                    <span class="font-medium" style="color:${team ? team.color : '#111827'}">${team ? team.name : turn.teamId}</span> 单步演示<br>
                    当前阶段：${phaseName}<br>
                    评分显示：${getDemoScoreTypeLabel()}
                `;
    }
    if (elements.demoKillStats)
        elements.demoKillStats.textContent = formatKillStats(turn.killsByUnit);
    if (elements.demoResult)
        elements.demoResult.classList.remove('hidden');
    if (elements.demoResultContent) {
        elements.demoResultContent.innerHTML = `
                    <div>演示队伍：${team ? team.name : turn.teamId}</div>
                    <div>当前阶段：${phaseName}</div>
                    <div>评分显示：${getDemoScoreTypeLabel()}</div>
                    <div>最高候选：${getManualPreviewBestLine()}</div>
                    <div>${formatKillStats(turn.killsByUnit)}</div>
                `;
    }
    updateHardAiInsightPanel();
}
function escapeHardAiInsightHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}
function calculateHardAiInsightSnapshot(teamId, order = null) {
    if (!isHardAiTeam(teamId))
        return null;
    const team = appData.teams.find(item => item.id === teamId);
    const power = calculateHardAiBattlePower(teamId);
    if (!team || !power)
        return null;
    const expansion = power.situation >= 1.3
        ? 1 + Math.floor((power.situation - 1.3 + 1e-9) / 0.2) : 0;
    const alliedCastles = [];
    const enemyCastles = [];
    for (let row = 0; row < appData.rows; row++) {
        for (let col = 0; col < appData.cols; col++) {
            const cell = appData.gridData[row][col];
            if (cell.terrain !== 'castle' || !cell.terrainTeam)
                continue;
            const owner = appData.teams.find(item => item.id === cell.terrainTeam);
            if (!owner || owner.playerType === 0)
                continue;
            (owner.alliance === team.alliance ? alliedCastles : enemyCastles)
                .push({ row, col });
        }
    }
    const nearest = (row, col, castles) => castles.length
        ? Math.min(...castles.map(castle => Math.abs(row - castle.row)
            + Math.abs(col - castle.col))) : null;
    const cells = Array.from({ length: appData.rows }, (_, row) => Array.from({ length: appData.cols }, (_, col) => {
        const allyDistance = nearest(row, col, alliedCastles);
        const enemyDistance = nearest(row, col, enemyCastles);
        const e = allyDistance === null || enemyDistance === null
            ? null : enemyDistance - allyDistance;
        const correctedE = e === null ? null : e + expansion;
        const core = allyDistance === null ? enemyDistance === null
            : enemyDistance === null || correctedE >= 0;
        return { row, col, allyDistance, enemyDistance, e, correctedE,
            zone: e === null ? (core ? 'core' : 'unknown')
                : e >= 0 ? 'core' : correctedE >= 0 ? 'expanded' : 'outside' };
    }));
    const targetSet = calculateHardAiBuildingTargetSet(teamId);
    const allocationTargets = calculateHardAiBuildingAllocationTargets(teamId);
    const allocationIndex = new Map(allocationTargets.map((target, index) => [target.key, index + 1]));
    const turn = appData.demoTeamTurn?.teamId === teamId ? appData.demoTeamTurn : null;
    const currentOrder = order || turn?.hardAiInsightOrder || [];
    const orderRows = currentOrder.map((unit, index) => ({
        index: index + 1, row: unit.row, col: unit.col,
        unitId: unit.unitId || unit.unit?.id,
        target: unit.target || unit.hardAiBuildingAssignment?.house || null,
        forcedRole: unit.forcedRole || unit.hardAiCastleBlockade?.role
            || (unit.hardAiCastleSeizure?.ready ? 'seize' : null)
    }));
    const assignedTo = new Map(orderRows.filter(unit => unit.target)
        .map(unit => [`${unit.target.row},${unit.target.col}`, unit]));
    const buildings = [];
    for (let row = 0; row < appData.rows; row++) {
        for (let col = 0; col < appData.cols; col++) {
            const cell = appData.gridData[row][col];
            if (!['castle', 'house', 'rundown'].includes(cell.terrain))
                continue;
            const key = `${row},${col}`;
            const owner = appData.teams.find(item => item.id === cell.terrainTeam);
            const eligible = cell.terrain === 'castle' ? targetSet.castles.has(key)
                : cell.terrain === 'house' ? targetSet.houses.has(key)
                    : targetSet.rundowns.has(key);
            const allocationEligible = allocationIndex.has(key);
            buildings.push({ row, col, terrain: cell.terrain,
                ownerName: owner && owner.playerType !== 0 ? owner.name : '无主',
                eligible, allocationEligible,
                assignedTo: assignedTo.get(key) || null,
                e: cells[row][col].e, correctedE: cells[row][col].correctedE,
                reason: eligible ? allocationEligible
                    ? '进入集合；可分配' : '进入集合；不参与分配'
                    : owner?.alliance === team.alliance && cell.terrain !== 'rundown'
                        ? '我方建筑'
                        : cell.terrain === 'castle' ? '区外；可直接占领'
                            : '未进入潜在集合' });
        }
    }
    return { teamId, teamName: team.name, power, expansion, cells,
        buildings, order: orderRows };
}
function updateHardAiInsightPanel(order = null) {
    const panel = elements.hardAiInsightPanel;
    if (!panel)
        return null;
    if (elements.demoTeamSection?.classList.contains('hidden'))
        return null;
    const selectedTeamId = appData.demoTeamTurn?.teamId
        || elements.demoTeamSelect?.value;
    if (!selectedTeamId || !isHardAiTeam(selectedTeamId)) {
        panel.classList.add('hidden');
        return null;
    }
    const snapshot = calculateHardAiInsightSnapshot(selectedTeamId, order);
    if (!snapshot) {
        panel.classList.add('hidden');
        return null;
    }
    panel.classList.remove('hidden');
    const fmt = value => value === null ? '—'
        : Number.isFinite(value) ? String(value) : '∞';
    const ratioText = Number.isFinite(snapshot.power.situation)
        ? snapshot.power.situation.toFixed(2) : '∞';
    const safe = escapeHardAiInsightHtml;
    elements.hardAiInsightSummary.innerHTML = `
                <div class="font-medium mb-1">${safe(snapshot.teamName)} · 战力比 ${ratioText}</div>
                <div>本联盟单位实际价值 ${fmt(snapshot.power.alliedUnitValue)}；敌对联盟单位实际价值 ${fmt(snapshot.power.enemyUnitValue)}</div>
                <div>优势区扩张 ${snapshot.expansion} 级；E′ = E + ${snapshot.expansion}</div>`;
    const zoneColor = { core: '#dcfce7', expanded: '#fef3c7',
        outside: '#fee2e2', unknown: '#f3f4f6' };
    elements.hardAiInsightMap.innerHTML = `<div style="display:grid;grid-template-columns:repeat(${appData.cols},42px);gap:2px;width:max-content">${snapshot.cells.flat().map(cell => `<div title="(${cell.row + 1},${cell.col + 1}) 友城距 ${fmt(cell.allyDistance)} 敌城距 ${fmt(cell.enemyDistance)}"
                    style="background:${zoneColor[cell.zone]};text-align:center;padding:3px 1px;border-radius:3px;line-height:1.25">
                    <div>E ${fmt(cell.e)}</div><div>E′ ${fmt(cell.correctedE)}</div></div>`).join('')}</div>`;
    const terrainName = { castle: '城堡', house: '房子', rundown: '破房' };
    const unitName = unit => appData.units.find(item => item.id === unit.unitId)?.name
        || unit.unitId || '单位';
    const buildingRows = snapshot.buildings.map(building => `<tr class="border-b border-gray-100">
                <td class="px-1 py-1 whitespace-nowrap">${terrainName[building.terrain]} (${building.row + 1},${building.col + 1})</td>
                <td class="px-1 py-1 whitespace-nowrap">${safe(building.ownerName)}</td>
                <td class="px-1 py-1 whitespace-nowrap">${fmt(building.e)} / ${fmt(building.correctedE)}</td>
                <td class="px-1 py-1 whitespace-nowrap">${safe(building.reason)}</td>
                <td class="px-1 py-1 whitespace-nowrap">${building.assignedTo
        ? `${safe(unitName(building.assignedTo))} (${building.assignedTo.row + 1},${building.assignedTo.col + 1})` : '—'}</td>
            </tr>`).join('');
    elements.hardAiInsightBuildings.innerHTML = `<table class="text-left min-w-max">
                <thead><tr class="bg-gray-100"><th class="px-1">建筑</th><th class="px-1">归属</th>
                <th class="px-1">E / E′</th><th class="px-1">潜在集合</th>
                <th class="px-1">本次分配对象</th></tr></thead>
                <tbody>${buildingRows}</tbody></table>`;
    const roleName = { seize: '立即夺城', garrison: '驻城待机',
        vacate: '让位', advance: '朝敌城推进', fallback: '路线受阻' };
    elements.hardAiInsightOrder.innerHTML = snapshot.order.length
        ? snapshot.order.map(unit => `<div class="border-b border-gray-100 py-1">
                    ${unit.index}. ${safe(unitName(unit))} (${unit.row + 1},${unit.col + 1})
                    ${unit.target ? `→ 分配目标 (${unit.target.row + 1},${unit.target.col + 1})` : '→ 未分配建筑'}
                    ${unit.forcedRole ? ` · ${roleName[unit.forcedRole] || safe(unit.forcedRole)}` : ''}
                </div>`).join('') : '<div>等待演示计算行动顺序</div>';
    return snapshot;
}
function updateDemoTeamPreview() {
    const turn = appData.demoTeamTurn;
    if (turn && turn.manualStep) {
        updateManualDemoScoreLayer();
        return turn.preview || null;
    }
    if (!elements.demoNextPreview || !turn || !turn.teamId || turn.phase !== 'unitActions') {
        if (elements.demoNextPreview)
            elements.demoNextPreview.textContent = '暂无';
        updateHardAiInsightPanel();
        return null;
    }
    const unitAction = getNextDemoTeamUnit(turn.teamId);
    if (!unitAction) {
        elements.demoNextPreview.textContent = '现有单位行动完成';
        updateHardAiInsightPanel();
        return null;
    }
    const candidate = chooseBestDemoCandidate(unitAction.row, unitAction.col, unitAction);
    elements.demoNextPreview.textContent = formatDemoCandidate(unitAction, candidate);
    updateHardAiInsightPanel();
    return { unitAction, candidate };
}
function getDemoAllianceRunCount() {
    const value = elements.demoAllianceCountInput ? parseInt(elements.demoAllianceCountInput.value) : 1;
    return Math.max(1, Number.isFinite(value) ? value : 1);
}
function snapshotDemoAllianceState() {
    return {
        gridData: JSON.parse(JSON.stringify(appData.gridData)),
        teams: JSON.parse(JSON.stringify(appData.teams)),
        actionQueue: appData.demoTeamTurn?.actionQueue
            ? JSON.parse(JSON.stringify(appData.demoTeamTurn.actionQueue)) : null,
        hardAiReservedBuildingTargets: [...(appData.demoTeamTurn?.hardAiReservedBuildingTargets || [])],
        hardAiBuildingAssignments: appData.demoTeamTurn?.hardAiBuildingAssignments
            ? JSON.parse(JSON.stringify(appData.demoTeamTurn.hardAiBuildingAssignments)) : [],
        pendingExpEvents: JSON.parse(JSON.stringify(appData.pendingExpEvents || [])),
        currentMoveTeam: appData.currentMoveTeam,
        currentMoveAction: appData.currentMoveAction ? JSON.parse(JSON.stringify(appData.currentMoveAction)) : null,
        recruitmentMove: appData.recruitmentMove ? JSON.parse(JSON.stringify(appData.recruitmentMove)) : null,
        selectedCell: appData.selectedCell ? { ...appData.selectedCell } : null,
        calculationResults: appData.calculationResults ? JSON.parse(JSON.stringify(appData.calculationResults)) : null
    };
}
function restoreDemoAllianceState(snapshot, options = {}) {
    if (!snapshot)
        return;
    appData.gridData = JSON.parse(JSON.stringify(snapshot.gridData || []));
    appData.teams = JSON.parse(JSON.stringify(snapshot.teams || []));
    if (appData.demoTeamTurn) {
        appData.demoTeamTurn.actionQueue = snapshot.actionQueue
            ? JSON.parse(JSON.stringify(snapshot.actionQueue)) : null;
        appData.demoTeamTurn.hardAiReservedBuildingTargets =
            [...(snapshot.hardAiReservedBuildingTargets || [])];
        appData.demoTeamTurn.hardAiBuildingAssignments = snapshot.hardAiBuildingAssignments
            ? JSON.parse(JSON.stringify(snapshot.hardAiBuildingAssignments)) : [];
        appData.demoTeamTurn.hardAiInsightOrder = null;
    }
    normalizeGridData();
    appData.pendingExpEvents = JSON.parse(JSON.stringify(snapshot.pendingExpEvents || []));
    appData.currentMoveTeam = snapshot.currentMoveTeam || null;
    appData.currentMoveAction = snapshot.currentMoveAction ? JSON.parse(JSON.stringify(snapshot.currentMoveAction)) : null;
    appData.recruitmentMove = snapshot.recruitmentMove ? JSON.parse(JSON.stringify(snapshot.recruitmentMove)) : null;
    appData.selectedCell = snapshot.selectedCell ? { ...snapshot.selectedCell } : null;
    appData.calculationResults = snapshot.calculationResults ? JSON.parse(JSON.stringify(snapshot.calculationResults)) : null;
    clearAttackHighlight();
    clearHealHighlight();
    clearSupportHighlight();
    clearSummonHighlight();
    clearMoveRangeHighlight();
    normalizeGridData();
    calculateOverview();
    renderTeamConfigs();
    renderGrid();
    if (!options.keepAllianceViewing)
        updateDemoAllianceViewButtons();
}
function getDemoAllianceTeamSequence(startTeamId, playerPolicy) {
    const orderedTeams = getOrderedTeams();
    const startIndex = orderedTeams.findIndex(team => team.id === startTeamId);
    if (startIndex < 0)
        return [];
    const sequence = [];
    for (let i = startIndex; i < orderedTeams.length; i++) {
        const team = orderedTeams[i];
        if (!team)
            continue;
        if (isAiPlayerType(team.playerType)) {
            sequence.push(team.id);
        }
        else if (team.playerType === 1 && playerPolicy === 'stop') {
            break;
        }
    }
    return sequence;
}
function countUnitsByTeamAndUnit(snapshot) {
    const counts = {};
    const gridData = snapshot && snapshot.gridData ? snapshot.gridData : appData.gridData;
    for (let i = 0; i < gridData.length; i++) {
        for (let j = 0; j < (gridData[i] || []).length; j++) {
            const cell = gridData[i][j];
            if (!cell || !cell.unit || !cell.unitTeam)
                continue;
            if (!counts[cell.unitTeam])
                counts[cell.unitTeam] = {};
            counts[cell.unitTeam][cell.unit] = (counts[cell.unitTeam][cell.unit] || 0) + 1;
        }
    }
    return counts;
}
function collectPlayerDeathStats(beforeSnapshot, afterSnapshot) {
    const beforeCounts = countUnitsByTeamAndUnit(beforeSnapshot);
    const afterCounts = countUnitsByTeamAndUnit(afterSnapshot);
    const playerTeams = (afterSnapshot.teams || appData.teams).filter(team => team.playerType === 1);
    const byTeam = {};
    let total = 0;
    playerTeams.forEach(team => {
        const unitIds = new Set([
            ...Object.keys(beforeCounts[team.id] || {}),
            ...Object.keys(afterCounts[team.id] || {})
        ]);
        const byUnit = {};
        let teamTotal = 0;
        unitIds.forEach(unitId => {
            const dead = Math.max(0, (beforeCounts[team.id]?.[unitId] || 0) - (afterCounts[team.id]?.[unitId] || 0));
            if (dead > 0) {
                byUnit[unitId] = dead;
                teamTotal += dead;
            }
        });
        byTeam[team.id] = { total: teamTotal, byUnit };
        total += teamTotal;
    });
    return { total, byTeam };
}
function formatPlayerDeathStats(stats) {
    if (!stats)
        return '玩家死亡：无';
    const playerTeams = getOrderedTeams().filter(team => team.playerType === 1);
    if (playerTeams.length === 0)
        return '玩家死亡：无玩家队伍';
    const parts = playerTeams.map(team => {
        const info = stats.byTeam?.[team.id] || { total: 0, byUnit: {} };
        const unitParts = Object.entries(info.byUnit || {}).map(([unitId, count]) => {
            const unit = getUnitDefinition(unitId);
            return `${unit ? unit.name : unitId} ${count}`;
        });
        return `${team.name} ${info.total}${unitParts.length > 0 ? `（${unitParts.join('，')}）` : ''}`;
    });
    return `玩家死亡：共 ${stats.total}；${parts.join('；')}`;
}
function collectPlayerUnitPositions(snapshot) {
    const positions = [];
    if (!snapshot || !snapshot.gridData)
        return positions;
    const playerTeamIds = new Set((snapshot.teams || appData.teams || [])
        .filter(team => team && team.playerType === 1)
        .map(team => team.id));
    for (let i = 0; i < snapshot.gridData.length; i++) {
        for (let j = 0; j < (snapshot.gridData[i] || []).length; j++) {
            const cell = snapshot.gridData[i][j];
            if (!cell || !cell.unit || !cell.unitTeam || !playerTeamIds.has(cell.unitTeam))
                continue;
            positions.push({
                row: i,
                col: j,
                teamId: cell.unitTeam,
                unitId: cell.unit,
                unitTraceId: cell.unitTraceId || null
            });
        }
    }
    return positions;
}
function getPlayerUnitDeathEvents(beforeSnapshot, afterSnapshot, actionStepIndex, actionPreview = null) {
    const beforeUnits = collectPlayerUnitPositions(beforeSnapshot);
    const afterUnits = collectPlayerUnitPositions(afterSnapshot);
    const afterTraceIds = new Set(afterUnits.map(unit => unit.unitTraceId).filter(Boolean));
    const afterFallbackKeys = new Set(afterUnits.map(unit => `${unit.row},${unit.col},${unit.teamId},${unit.unitId}`));
    return beforeUnits
        .filter(unit => {
        if (unit.unitTraceId)
            return !afterTraceIds.has(unit.unitTraceId);
        return !afterFallbackKeys.has(`${unit.row},${unit.col},${unit.teamId},${unit.unitId}`);
    })
        .map(unit => ({
        ...unit,
        actionStepIndex,
        actionPreview: actionPreview ? JSON.parse(JSON.stringify(actionPreview)) : null
    }));
}
function appendDemoAllianceDeathEvents(result, beforeSnapshot, afterSnapshot, actionStepIndex, actionPreview = null) {
    if (!result || actionStepIndex === null || actionStepIndex === undefined)
        return;
    const events = getPlayerUnitDeathEvents(beforeSnapshot, afterSnapshot, actionStepIndex, actionPreview);
    if (events.length === 0)
        return;
    if (!Array.isArray(result.deathEvents))
        result.deathEvents = [];
    result.deathEvents.push(...events);
}
function formatDeathEventButtonLabel(event) {
    const team = appData.teams.find(item => item.id === event.teamId);
    const unit = getUnitDefinition(event.unitId);
    return `${team ? team.name : event.teamId} ${unit ? unit.name : event.unitId} (${event.row + 1},${event.col + 1})`;
}
function renderDemoAllianceDeathEventButtons(result, index) {
    const events = result && Array.isArray(result.deathEvents) ? result.deathEvents : [];
    if (events.length === 0)
        return '<div class="text-xs text-gray-500">无玩家死亡单位可定位</div>';
    return `
                <div class="space-y-1">
                    <div class="text-xs font-medium text-gray-700">查看死亡前布局</div>
                    <div class="flex flex-wrap gap-1">
                        ${events.map((event, eventIndex) => `
                            <button type="button" class="btn-secondary text-xs py-1 px-2 demo-alliance-death-step" data-index="${index}" data-death-index="${eventIndex}">
                                ${formatDeathEventButtonLabel(event)}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
}
function recordDemoAllianceStep(result, label, preview = null) {
    if (preview && preview.kind === 'unit' && preview.unitAction) {
        const actionCell = appData.gridData[preview.unitAction.row]?.[preview.unitAction.col];
        if (actionCell && actionCell.unit) {
            preview.unitAction.unitTraceId = actionCell.unitTraceId || null;
            preview.unitAction.unitId = actionCell.unit;
            preview.unitAction.teamId = actionCell.unitTeam;
        }
    }
    const logPreview = preview?.kind === 'unit' && preview.unitAction
        ? { ...preview, unitAction: cloneDemoUnitActionForLog(preview.unitAction) }
        : preview;
    const snapshot = snapshotDemoAllianceState();
    const step = {
        label,
        snapshot,
        preview: logPreview ? JSON.parse(JSON.stringify(logPreview)) : null
    };
    result.steps.push(step);
    result.frames.push(step);
    return result.steps.length - 1;
}
function applyDemoAllianceStep(step) {
    if (!step)
        return;
    restoreDemoAllianceState(step.snapshot, { keepAllianceViewing: true });
    if (!step.preview)
        return;
    if (step.preview.kind === 'unit' && step.preview.unitAction) {
        appData.selectedCell = {
            row: step.preview.unitAction.row,
            col: step.preview.unitAction.col
        };
        renderDemoLandingScores(step.preview.unitAction.row, step.preview.unitAction.col);
    }
    else if (step.preview.kind === 'recruit' && step.preview.plan) {
        renderDemoRecruitLandingScores(step.preview.plan);
    }
}
function updateDemoAllianceViewingStatus() {
    const viewing = appData.demoAllianceViewing;
    if (!viewing)
        return;
    const result = appData.demoAllianceResults[viewing.resultIndex];
    const step = result && result.steps ? result.steps[viewing.stepIndex] : null;
    if (elements.demoAllianceStatus && step) {
        const round = (result.roundStarts || []).find(item => item.stepIndex === viewing.stepIndex);
        const roundNumber = round ? `第 ${round.number} 回合 · ` : '';
        elements.demoAllianceStatus.innerHTML = `正在逐步查看第 ${viewing.resultIndex + 1} 次<br>${roundNumber}${formatDemoAllianceStepLabel(step)}`;
    }
    updateDemoAllianceViewButtons();
}
function jumpDemoAllianceViewingToStep(stepIndex) {
    const viewing = appData.demoAllianceViewing;
    if (!viewing)
        return false;
    const result = appData.demoAllianceResults[viewing.resultIndex];
    if (!result || !result.steps || stepIndex < 0 || stepIndex >= result.steps.length)
        return false;
    viewing.stepIndex = stepIndex;
    viewing.playing = false;
    applyDemoAllianceStep(result.steps[stepIndex]);
    updateDemoAllianceViewingStatus();
    return true;
}
function jumpDemoAllianceResultToStep(resultIndex, stepIndex) {
    const result = appData.demoAllianceResults[resultIndex];
    if (!result || !result.steps || stepIndex < 0 || stepIndex >= result.steps.length)
        return false;
    appData.demoAllianceViewing = { resultIndex, stepIndex: 0, playing: false };
    return jumpDemoAllianceViewingToStep(stepIndex);
}
function jumpDemoAllianceToDeathEvent(resultIndex, deathIndex) {
    const result = appData.demoAllianceResults[resultIndex];
    const event = result && result.deathEvents ? result.deathEvents[deathIndex] : null;
    if (!event || event.actionStepIndex === undefined || event.actionStepIndex === null)
        return false;
    return jumpDemoAllianceResultToStep(resultIndex, event.actionStepIndex);
}
function jumpDemoAllianceViewingToUnitFirstAction(row, col) {
    const viewing = appData.demoAllianceViewing;
    if (!viewing || viewing.playing)
        return false;
    const result = appData.demoAllianceResults[viewing.resultIndex];
    const cell = appData.gridData[row]?.[col];
    if (!result || !result.steps || !cell || !cell.unit || !cell.unitTeam)
        return false;
    const team = appData.teams.find(t => t.id === cell.unitTeam);
    if (!team || !isAiPlayerType(team.playerType))
        return false;
    const traceId = cell.unitTraceId || null;
    let stepIndex = traceId ? result.steps.findIndex(step => step.preview
        && step.preview.kind === 'unit'
        && step.preview.unitAction
        && step.preview.unitAction.unitTraceId === traceId) : -1;
    if (stepIndex < 0) {
        stepIndex = result.steps.findIndex(step => {
            if (!step.preview || step.preview.kind !== 'unit' || !step.preview.unitAction)
                return false;
            const unitAction = step.preview.unitAction;
            const beforeCell = step.snapshot?.gridData?.[unitAction.row]?.[unitAction.col];
            return beforeCell
                && beforeCell.unit === cell.unit
                && beforeCell.unitTeam === cell.unitTeam
                && unitAction.row === row
                && unitAction.col === col;
        });
    }
    return stepIndex >= 0 ? jumpDemoAllianceViewingToStep(stepIndex) : false;
}
function formatDemoAllianceStepLabel(step) {
    if (!step)
        return '暂无';
    if (step.preview && step.preview.kind === 'unit') {
        return `${step.label}<br>预览：${formatDemoCandidate(step.preview.unitAction, step.preview.candidate)}`;
    }
    if (step.preview && step.preview.kind === 'recruit') {
        const plan = step.preview.plan;
        const unit = plan ? getUnitDefinition(plan.unitId) : null;
        return `${step.label}<br>预览：${unit ? unit.name : plan?.unitId || '未知单位'}`;
    }
    return step.label;
}
async function runDemoTeamForAlliance(teamId, result, token, skipAnimation, options = {}) {
    const team = appData.teams.find(t => t.id === teamId);
    if (!team || !isAiPlayerType(team.playerType) || isTeamEliminated(teamId))
        return;
    const skipTurnStart = !!options.skipTurnStart;
    let turnStart = null;
    if (skipTurnStart) {
        appData.currentMoveTeam = teamId;
    }
    else {
        let currentTeamId = appData.currentMoveTeam;
        const maxTransitions = getActiveMoveModeTeams().length + 1;
        for (let transition = 0; transition < maxTransitions && currentTeamId !== teamId; transition++) {
            const nextTeamId = getNextMoveModeTeamId(currentTeamId);
            if (!nextTeamId || nextTeamId === currentTeamId)
                break;
            appendMoveModeAction(makeMoveModeAction('NEXT_TURN'));
            settleDemoTeamTurnEnd(currentTeamId);
            appData.currentMoveTeam = nextTeamId;
            const settled = settleDemoTeamTurnStart(nextTeamId);
            if (nextTeamId === teamId)
                turnStart = settled;
            currentTeamId = nextTeamId;
        }
        if (appData.currentMoveTeam !== teamId)
            return;
    }
    appData.demoTeamTurn = {
        teamId,
        phase: 'unitActions',
        skipAnimation,
        running: true,
        paused: false,
        stepOnce: false,
        loopActive: false,
        manualStep: false,
        preview: null,
        history: [],
        killsByUnit: {},
        turnStart,
        actionQueue: null,
        hardAiReservedBuildingTargets: [],
        hardAiBuildingAssignments: []
    };
    appData.demoEnemyMovementBlocking = true;
    const roundStartStepIndex = recordDemoAllianceStep(result, skipTurnStart ? `${team.name} 跳过回合开始` : `${team.name} 回合开始`);
    if (!result.roundStarts)
        result.roundStarts = [];
    result.roundStarts.push({
        number: result.roundStarts.length + 1,
        teamId,
        stepIndex: roundStartStepIndex
    });
    const runAllianceAvailableActions = async (labelPrefix) => {
        return await runAvailableDemoTeamUnitActions(teamId, token, {
            skipSnapshot: true,
            maxSteps: 300,
            onBeforeAction: (unitAction, candidate) => {
                const actionPreview = {
                    kind: 'unit',
                    unitAction,
                    candidate
                };
                const actionStepIndex = recordDemoAllianceStep(result, `${team.name} ${labelPrefix}预览`, actionPreview);
                unitAction.__demoAllianceStepIndex = actionStepIndex;
                unitAction.__demoAllianceBeforeSnapshot = result.steps[actionStepIndex] ? result.steps[actionStepIndex].snapshot : snapshotDemoAllianceState();
                if (elements.demoAllianceStatus) {
                    elements.demoAllianceStatus.innerHTML = `${team.name}：${formatDemoCandidate(unitAction, candidate)}`;
                }
            },
            onAfterAction: (unitAction, candidate) => {
                const actionStepIndex = unitAction.__demoAllianceStepIndex;
                const actionBeforeSnapshot = unitAction.__demoAllianceBeforeSnapshot || snapshotDemoAllianceState();
                const actionPreview = {
                    kind: 'unit',
                    unitAction: cloneDemoUnitActionForLog(unitAction),
                    candidate
                };
                appendDemoAllianceDeathEvents(result, actionBeforeSnapshot, snapshotDemoAllianceState(), actionStepIndex, actionPreview);
                recordDemoAllianceStep(result, `${team.name} ${labelPrefix}：${formatDemoCandidate(unitAction, candidate)}`);
                calculateOverview();
                delete unitAction.__demoAllianceStepIndex;
                delete unitAction.__demoAllianceBeforeSnapshot;
            }
        });
    };
    let actionResult = await runAllianceAvailableActions('行动');
    if (actionResult.guardLimit) {
        recordDemoAllianceStep(result, `${team.name} 行动停止：步数超过上限`);
        appData.demoTeamTurn.phase = 'done';
        appData.demoTeamTurn.running = false;
        appData.demoEnemyMovementBlocking = false;
        return;
    }
    appData.demoTeamTurn.phase = 'recruitment';
    let recruitGuard = 0;
    while (appData.demoTeamTurn && token === appData.demoTeamLoopToken && recruitGuard < 100) {
        recruitGuard++;
        const selection = chooseDemoRecruitPlan(teamId);
        if (!selection.plan)
            break;
        const unit = getUnitDefinition(selection.plan.unitId);
        recordDemoAllianceStep(result, `${team.name} 招募预览`, {
            kind: 'recruit',
            plan: selection.plan
        });
        if (elements.demoAllianceStatus) {
            elements.demoAllianceStatus.innerHTML = `${team.name} 招募：${unit ? unit.name : selection.plan.unitId}`;
        }
        const executed = await executeDemoRecruitPlan(selection.plan, token);
        calculateOverview();
        recordDemoAllianceStep(result, `${team.name} 招募：${unit ? unit.name : selection.plan.unitId}`);
        if (!executed)
            break;
        actionResult = await runAllianceAvailableActions('招募后行动');
        if (actionResult.guardLimit || actionResult.failed)
            break;
    }
    appData.demoTeamTurn.phase = 'done';
    appData.demoTeamTurn.running = false;
    appData.demoEnemyMovementBlocking = false;
}
function getDemoAlliancePlayerTypeName(playerType) {
    return { 0: '无', 1: '玩家', 2: '简版AI', 3: '困难AI' }[playerType] || '未知类型';
}
function escapeDemoAllianceResultText(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}
function getDemoAllianceWinLossStats(results) {
    const stats = new Map();
    for (const result of results) {
        const alliances = [...new Set((result.participantTeams || []).map(team => team.alliance))];
        if (result.winnerAlliance == null || alliances.length < 2
            || !alliances.includes(result.winnerAlliance))
            continue;
        for (const alliance of alliances) {
            if (!stats.has(alliance))
                stats.set(alliance, { alliance, wins: 0, losses: 0 });
            stats.get(alliance)[alliance === result.winnerAlliance ? 'wins' : 'losses']++;
        }
    }
    return [...stats.values()];
}
function renderDemoAllianceVictory(result) {
    const participants = result.participantTeams || [];
    const alliances = [...new Set(participants.map(team => team.alliance))];
    if (result.winnerAlliance == null || alliances.length < 2
        || !alliances.includes(result.winnerAlliance))
        return '';
    const teamsByAlliance = alliances.map(alliance => {
        const teams = participants.filter(team => team.alliance === alliance)
            .map(team => `${escapeDemoAllianceResultText(team.name)}（${getDemoAlliancePlayerTypeName(team.playerType)}）`)
            .join('、');
        const outcome = alliance === result.winnerAlliance ? '胜' : '负';
        return `联盟${escapeDemoAllianceResultText(alliance)}（${outcome}）：${teams}`;
    });
    return `<div class="text-sm text-gray-800">对战队伍与胜负：${teamsByAlliance.join('；')}</div>`;
}
function renderDemoAllianceResults() {
    if (!elements.demoResult || !elements.demoResultContent)
        return;
    elements.demoResult.classList.remove('hidden');
    const results = appData.demoAllianceResults || [];
    if (results.length === 0) {
        elements.demoResultContent.innerHTML = '<div class="text-gray-500">暂无联盟演示结果</div>';
        updateDemoAllianceViewButtons();
        return;
    }
    const winLossStats = getDemoAllianceWinLossStats(results);
    const winLossHtml = winLossStats.length > 0
        ? `<div class="p-2 border border-orange-200 rounded-md bg-orange-50 text-sm">
                    <div class="font-semibold">联盟胜负比（已决胜场次）</div>
                    <div>${winLossStats.map(stat => `联盟${escapeDemoAllianceResultText(stat.alliance)}：${stat.wins}胜${stat.losses}负（${stat.wins}:${stat.losses}）`).join('；')}</div>
                </div>`
        : '';
    elements.demoResultContent.innerHTML = winLossHtml + results.map((result, index) => `
                <div class="p-2 border border-gray-200 rounded-md bg-gray-50 space-y-2">
                    <div class="font-semibold">第 ${index + 1} 次</div>
                    ${result.stopReason ? `<div class="text-sm text-amber-800">${escapeDemoAllianceResultText(result.stopReason)}</div>` : ''}
                    ${renderDemoAllianceVictory(result)}
                    <div>${formatPlayerDeathStats(result.playerDeathStats)}</div>
                    ${renderDemoAllianceDeathEventButtons(result, index)}
                    <div class="text-xs text-gray-600">队伍顺序：${result.teamSequenceNames.join(' → ') || '无'}${result.runUntilOneAlliance ? `（循环至只剩一个联盟，共 ${result.turnCount} 个 AI 回合）` : ''}</div>
                    <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0.5rem;">
                        <button type="button" class="btn-secondary text-xs py-1 demo-alliance-final" data-index="${index}">查看结束布局</button>
                        <button type="button" class="btn-secondary text-xs py-1 demo-alliance-play" data-index="${index}">完整动画</button>
                        <button type="button" class="btn-secondary text-xs py-1 demo-alliance-steps" data-index="${index}">逐步查看</button>
                        <button type="button" class="btn-secondary text-xs py-1 demo-alliance-export-actions" data-index="${index}">导出actions</button>
                    </div>
                </div>
            `).join('');
    elements.demoResultContent.querySelectorAll('.demo-alliance-final').forEach(button => {
        button.addEventListener('click', () => showDemoAllianceFinalLayout(parseInt(button.dataset.index)));
    });
    elements.demoResultContent.querySelectorAll('.demo-alliance-play').forEach(button => {
        button.addEventListener('click', () => playDemoAllianceResult(parseInt(button.dataset.index)));
    });
    elements.demoResultContent.querySelectorAll('.demo-alliance-steps').forEach(button => {
        button.addEventListener('click', () => startDemoAllianceStepViewing(parseInt(button.dataset.index)));
    });
    elements.demoResultContent.querySelectorAll('.demo-alliance-export-actions').forEach(button => {
        button.addEventListener('click', () => exportDemoAllianceActions(parseInt(button.dataset.index)));
    });
    elements.demoResultContent.querySelectorAll('.demo-alliance-death-step').forEach(button => {
        button.addEventListener('click', () => jumpDemoAllianceToDeathEvent(parseInt(button.dataset.index), parseInt(button.dataset.deathIndex)));
    });
    updateDemoAllianceViewButtons();
}
function exportDemoAllianceActions(index) {
    const result = appData.demoAllianceResults[index];
    const actions = (result && Array.isArray(result.actions) ? result.actions : [])
        .map((action, actionIndex) => ({ ...action, index: actionIndex }));
    downloadJsonFile({
        format: 'aeii-engine-actions',
        version: 1,
        meta: {
            app: '网格计算器 V6.1.4 演示模式',
            source: 'demo-alliance-result',
            runNumber: index + 1,
            exportedAt: new Date().toISOString()
        },
        demo: {
            runNumber: index + 1,
            teamSequence: [...(result.teamSequence || [])]
        },
        pendingCount: 0,
        totalCaptured: actions.length,
        pendingActions: [],
        actions
    }, 'online-actions.json');
}
function updateDemoAllianceViewButtons() {
    const viewing = appData.demoAllianceViewing;
    const result = viewing ? appData.demoAllianceResults[viewing.resultIndex] : null;
    const hasResult = !!result;
    if (elements.demoAlliancePlayBtn)
        elements.demoAlliancePlayBtn.disabled = !hasResult;
    if (elements.demoAllianceStepBtn)
        elements.demoAllianceStepBtn.disabled = !hasResult || viewing.stepIndex >= (result.steps.length - 1);
    if (elements.demoAllianceUndoBtn)
        elements.demoAllianceUndoBtn.disabled = !hasResult || viewing.stepIndex <= 0;
    const fallbackResult = !viewing && (appData.demoAllianceResults || []).at(-1);
    const roundStarts = (result || fallbackResult)?.roundStarts || [];
    const canNavigateRounds = !appData.demoAllianceSession?.running && !viewing?.playing;
    if (elements.demoAlliancePrevRoundBtn) {
        elements.demoAlliancePrevRoundBtn.disabled = !canNavigateRounds || !roundStarts.some(round => !viewing || round.stepIndex < viewing.stepIndex);
    }
    if (elements.demoAllianceNextRoundBtn) {
        elements.demoAllianceNextRoundBtn.disabled = !canNavigateRounds || !roundStarts.some(round => !viewing || round.stepIndex > viewing.stepIndex);
    }
}
function jumpDemoAllianceRound(direction) {
    if (appData.demoAllianceSession?.running)
        return false;
    const viewing = appData.demoAllianceViewing;
    if (viewing?.playing)
        return false;
    const resultIndex = viewing ? viewing.resultIndex : (appData.demoAllianceResults || []).length - 1;
    const result = appData.demoAllianceResults[resultIndex];
    const roundStarts = result?.roundStarts || [];
    if (roundStarts.length === 0)
        return false;
    const target = viewing
        ? (direction < 0
            ? [...roundStarts].reverse().find(round => round.stepIndex < viewing.stepIndex)
            : roundStarts.find(round => round.stepIndex > viewing.stepIndex))
        : (direction < 0 ? roundStarts.at(-1) : roundStarts[0]);
    return target ? jumpDemoAllianceResultToStep(resultIndex, target.stepIndex) : false;
}
function showDemoAllianceFinalLayout(index) {
    const result = appData.demoAllianceResults[index];
    if (!result)
        return;
    appData.demoAllianceViewing = { resultIndex: index, stepIndex: Math.max(0, result.steps.length - 1), playing: false };
    restoreDemoAllianceState(result.finalSnapshot, { keepAllianceViewing: true });
    if (elements.demoAllianceStatus) {
        elements.demoAllianceStatus.innerHTML = `正在查看第 ${index + 1} 次结束布局<br>${formatPlayerDeathStats(result.playerDeathStats)}`;
    }
    updateDemoAllianceViewButtons();
}
function startDemoAllianceStepViewing(index) {
    const result = appData.demoAllianceResults[index];
    if (!result || result.steps.length === 0)
        return;
    appData.demoAllianceViewing = { resultIndex: index, stepIndex: 0, playing: false };
    applyDemoAllianceStep(result.steps[0]);
    if (elements.demoAllianceStatus) {
        elements.demoAllianceStatus.innerHTML = `正在逐步查看第 ${index + 1} 次<br>${formatDemoAllianceStepLabel(result.steps[0])}`;
    }
    updateDemoAllianceViewButtons();
}
function stepAllianceDemoViewingForward() {
    const viewing = appData.demoAllianceViewing;
    if (!viewing)
        return;
    const result = appData.demoAllianceResults[viewing.resultIndex];
    if (!result || viewing.stepIndex >= result.steps.length - 1)
        return;
    viewing.stepIndex++;
    applyDemoAllianceStep(result.steps[viewing.stepIndex]);
    if (elements.demoAllianceStatus) {
        elements.demoAllianceStatus.innerHTML = `正在逐步查看第 ${viewing.resultIndex + 1} 次<br>${formatDemoAllianceStepLabel(result.steps[viewing.stepIndex])}`;
    }
    updateDemoAllianceViewButtons();
}
function stepAllianceDemoViewingBackward() {
    const viewing = appData.demoAllianceViewing;
    if (!viewing)
        return;
    const result = appData.demoAllianceResults[viewing.resultIndex];
    if (!result || viewing.stepIndex <= 0)
        return;
    viewing.stepIndex--;
    applyDemoAllianceStep(result.steps[viewing.stepIndex]);
    if (elements.demoAllianceStatus) {
        elements.demoAllianceStatus.innerHTML = `正在逐步查看第 ${viewing.resultIndex + 1} 次<br>${formatDemoAllianceStepLabel(result.steps[viewing.stepIndex])}`;
    }
    updateDemoAllianceViewButtons();
}
async function playSelectedAllianceDemoResult() {
    const viewing = appData.demoAllianceViewing;
    if (!viewing)
        return;
    await playDemoAllianceResult(viewing.resultIndex);
}
async function playDemoAllianceResult(index) {
    const result = appData.demoAllianceResults[index];
    if (!result || result.frames.length === 0)
        return;
    appData.demoAllianceViewing = { resultIndex: index, stepIndex: 0, playing: true };
    updateDemoAllianceViewButtons();
    for (let i = 0; i < result.frames.length; i++) {
        const viewing = appData.demoAllianceViewing;
        if (!viewing || viewing.resultIndex !== index || !viewing.playing)
            break;
        viewing.stepIndex = Math.min(i, result.steps.length - 1);
        applyDemoAllianceStep(result.frames[i]);
        if (elements.demoAllianceStatus) {
            elements.demoAllianceStatus.innerHTML = `正在播放第 ${index + 1} 次<br>${formatDemoAllianceStepLabel(result.frames[i])}`;
        }
        updateDemoAllianceViewButtons();
        await demoTeamDelay(350);
    }
    if (appData.demoAllianceViewing && appData.demoAllianceViewing.resultIndex === index) {
        appData.demoAllianceViewing.playing = false;
        updateDemoAllianceViewButtons();
    }
}
function stopDemoAlliance() {
    const session = appData.demoAllianceSession;
    if (!session?.running)
        return;
    session.stopRequested = true;
    appData.demoTeamLoopToken++;
    if (elements.demoAllianceStatus)
        elements.demoAllianceStatus.textContent = '正在停止联盟演示…';
    if (elements.stopAllianceDemoBtn)
        elements.stopAllianceDemoBtn.disabled = true;
}
function getDemoAllianceCycleSignature(nextTeamId) {
    return JSON.stringify({
        nextTeamId,
        currentMoveTeam: appData.currentMoveTeam,
        teams: getActiveMoveModeTeams().map(team => [team.id, team.alliance,
            getTeamGold(team.id), team.commanderPrice, team.commanderLevel, team.commanderExp]),
        cells: appData.gridData.map(row => row.map(cell => [
            cell.terrain, cell.terrainTeam, cell.unit, cell.unitTeam,
            cell.unitLevel, cell.unitHealth, cell.unitExp,
            cell.unitStatus, cell.unitStatusTurns, cell.unitStandby,
            cell.unitSupported, cell.unitRegisteredCommander,
            cell.tombstone, cell.pendingTombstone
        ]))
    });
}
async function startDemoAlliance() {
    if (appData.demoAllianceSession?.running)
        return;
    const startTeamId = elements.demoAllianceStartTeamSelect ? elements.demoAllianceStartTeamSelect.value : '';
    const startTeam = appData.teams.find(team => team.id === startTeamId);
    if (!startTeam || !isAiPlayerType(startTeam.playerType)) {
        alert('请选择一个AI队伍');
        return;
    }
    const playerPolicy = elements.demoAlliancePlayerPolicy ? elements.demoAlliancePlayerPolicy.value : 'stop';
    const teamSequence = getDemoAllianceTeamSequence(startTeamId, playerPolicy);
    const runUntilOneAlliance = playerPolicy === 'stop'
        && !appData.teams.some(team => team.playerType === 1);
    if (runUntilOneAlliance) {
        const orderedTeams = getOrderedTeams();
        const startIndex = orderedTeams.findIndex(team => team.id === startTeamId);
        teamSequence.push(...orderedTeams.slice(0, startIndex)
            .filter(team => isAiPlayerType(team.playerType))
            .map(team => team.id));
    }
    if (teamSequence.length === 0) {
        alert('没有可执行的AI队伍');
        return;
    }
    const runCount = getDemoAllianceRunCount();
    const skipAnimation = !!(elements.demoAllianceSkipAnimation && elements.demoAllianceSkipAnimation.checked);
    const baseSnapshot = snapshotDemoAllianceState();
    const basePendingActionRecord = appData.moveModePendingActionRecord
        ? JSON.parse(JSON.stringify(appData.moveModePendingActionRecord))
        : null;
    appData.demoAllianceResults = [];
    appData.demoAllianceViewing = null;
    appData.demoAllianceSession = { running: true, stopRequested: false, baseSnapshot, teamSequence };
    appData.demoTeamLoopToken++;
    const token = appData.demoTeamLoopToken;
    if (elements.startAllianceDemoBtn)
        elements.startAllianceDemoBtn.disabled = true;
    if (elements.stopAllianceDemoBtn)
        elements.stopAllianceDemoBtn.disabled = false;
    if (elements.demoResult)
        elements.demoResult.classList.remove('hidden');
    if (elements.demoResultContent)
        elements.demoResultContent.innerHTML = '<div class="text-gray-500">联盟演示执行中...</div>';
    let failure = null;
    try {
        for (let runIndex = 0; runIndex < runCount; runIndex++) {
            if (appData.demoAllianceSession.stopRequested)
                break;
            restoreDemoAllianceState(baseSnapshot, { keepAllianceViewing: true });
            clearCurrentMoveAction();
            clearRecruitmentMove();
            appData.moveModePendingActionRecord = null;
            appData.selectedCell = null;
            ensureDemoUnitTraceIds();
            const beforeSnapshot = snapshotDemoAllianceState();
            const participantTeams = getActiveMoveModeTeams().map(team => ({
                id: team.id, name: team.name, alliance: team.alliance, playerType: team.playerType
            }));
            const result = {
                index: runIndex,
                teamSequence: [...teamSequence],
                teamSequenceNames: teamSequence.map(teamId => appData.teams.find(team => team.id === teamId)?.name || teamId),
                participantTeams,
                winnerAlliance: null,
                stopReason: null,
                runUntilOneAlliance,
                turnCount: 0,
                roundStarts: [],
                steps: [],
                frames: [],
                deathEvents: [],
                actions: []
            };
            appData.demoAllianceActionSink = result.actions;
            try {
                recordDemoAllianceStep(result, `第 ${runIndex + 1} 次开始`);
                if (runUntilOneAlliance) {
                    let teamId = isTeamEliminated(startTeamId)
                        ? getNextMoveModeTeamId(startTeamId) : startTeamId;
                    const cycleCounts = new Map();
                    while (token === appData.demoTeamLoopToken
                        && new Set(getActiveMoveModeTeams().map(team => team.alliance)).size > 1
                        && teamId) {
                        if (teamId === startTeamId && result.turnCount > 0) {
                            const signature = getDemoAllianceCycleSignature(teamId);
                            const repeats = (cycleCounts.get(signature) || 0) + 1;
                            cycleCounts.set(signature, repeats);
                            if (repeats >= 3) {
                                result.stopReason = '局面与资源连续重复，判为平局';
                                break;
                            }
                        }
                        const team = appData.teams.find(t => t.id === teamId);
                        if (elements.demoAllianceStatus) {
                            elements.demoAllianceStatus.innerHTML = `第 ${runIndex + 1}/${runCount} 次：正在演示 ${team.name}（第 ${result.turnCount + 1} 回合）`;
                        }
                        if (elements.demoResultContent && appData.demoAllianceResults.length === 0) {
                            elements.demoResultContent.textContent = `联盟演示执行中：第 ${runIndex + 1}/${runCount} 次，第 ${result.turnCount + 1} 回合，${team.name}`;
                        }
                        await runDemoTeamForAlliance(teamId, result, token, skipAnimation, {
                            skipTurnStart: result.turnCount === 0
                        });
                        result.turnCount++;
                        teamId = getNextMoveModeTeamId(teamId);
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                    if (appData.demoAllianceSession.stopRequested)
                        result.stopReason = '用户停止';
                }
                else {
                    for (let teamIndex = 0; teamIndex < teamSequence.length; teamIndex++) {
                        if (appData.demoAllianceSession.stopRequested) {
                            result.stopReason = '用户停止';
                            break;
                        }
                        const teamId = teamSequence[teamIndex];
                        const team = appData.teams.find(t => t.id === teamId);
                        if (!team || !isAiPlayerType(team.playerType))
                            continue;
                        if (elements.demoAllianceStatus) {
                            elements.demoAllianceStatus.innerHTML = `第 ${runIndex + 1}/${runCount} 次：正在演示 ${team.name}`;
                        }
                        if (elements.demoResultContent && appData.demoAllianceResults.length === 0) {
                            elements.demoResultContent.textContent = `联盟演示执行中：第 ${runIndex + 1}/${runCount} 次，${team.name}`;
                        }
                        await runDemoTeamForAlliance(teamId, result, token, skipAnimation, {
                            skipTurnStart: teamIndex === 0
                        });
                    }
                    if (appData.demoAllianceSession.stopRequested)
                        result.stopReason = '用户停止';
                }
                result.finalSnapshot = snapshotDemoAllianceState();
                const startingAlliances = new Set(result.participantTeams.map(team => team.alliance));
                const endingAlliances = [...new Set(getActiveMoveModeTeams().map(team => team.alliance))];
                if (!result.stopReason && startingAlliances.size > 1 && endingAlliances.length === 1
                    && startingAlliances.has(endingAlliances[0])) {
                    result.winnerAlliance = endingAlliances[0];
                }
                result.playerDeathStats = collectPlayerDeathStats(beforeSnapshot, result.finalSnapshot);
                recordDemoAllianceStep(result, `第 ${runIndex + 1} 次结束`);
                appData.demoAllianceResults.push(result);
                renderDemoAllianceResults();
            }
            finally {
                appData.demoAllianceActionSink = null;
                appData.moveModePendingActionRecord = null;
            }
        }
    }
    catch (error) {
        failure = error;
        console.error('联盟演示失败:', error);
    }
    finally {
        restoreDemoAllianceState(baseSnapshot, { keepAllianceViewing: true });
        appData.demoAllianceActionSink = null;
        appData.moveModePendingActionRecord = basePendingActionRecord;
        appData.demoTeamTurn = null;
        appData.demoEnemyMovementBlocking = false;
        appData.demoAllianceSession.running = false;
        if (elements.startAllianceDemoBtn)
            elements.startAllianceDemoBtn.disabled = false;
        if (elements.stopAllianceDemoBtn)
            elements.stopAllianceDemoBtn.disabled = true;
    }
    if (failure) {
        const message = `联盟演示失败：${failure?.message || String(failure)}`;
        if (elements.demoAllianceStatus)
            elements.demoAllianceStatus.textContent = message;
        if (appData.demoAllianceResults.length > 0)
            renderDemoAllianceResults();
        if (elements.demoResultContent) {
            elements.demoResultContent.innerHTML = `<div class="text-red-700">${escapeDemoAllianceResultText(message)}</div>`
                + (appData.demoAllianceResults.length > 0 ? elements.demoResultContent.innerHTML : '');
        }
        return;
    }
    if (elements.demoAllianceStatus) {
        const stopped = appData.demoAllianceSession.stopRequested;
        const drawn = appData.demoAllianceResults.some(result => result.stopReason && result.stopReason !== '用户停止');
        elements.demoAllianceStatus.innerHTML = stopped
            ? `联盟演示已停止，已保存 ${appData.demoAllianceResults.length} 次结果。网格已恢复到演示前布局。`
            : drawn ? `联盟演示结束，存在循环局面平局。网格已恢复到演示前布局。`
                : `联盟演示完成，共 ${runCount} 次。网格已恢复到演示前布局。`;
    }
    renderDemoAllianceResults();
}
function startManualDemoTeamSession() {
    const teamId = elements.demoTeamSelect ? elements.demoTeamSelect.value : '';
    const team = appData.teams.find(t => t.id === teamId);
    if (!team || !isAiPlayerType(team.playerType)) {
        alert('请选择一个AI队伍');
        return null;
    }
    appData.demoTeamLoopToken++;
    appData.demoTeamTurn = {
        teamId,
        phase: 'turnStartPending',
        skipAnimation: true,
        running: true,
        paused: true,
        stepOnce: false,
        loopActive: false,
        manualStep: true,
        preview: null,
        history: [],
        killsByUnit: {},
        turnStart: null,
        actionQueue: null,
        hardAiReservedBuildingTargets: [],
        hardAiBuildingAssignments: []
    };
    appData.demoEnemyMovementBlocking = true;
    appData.calculationResults = null;
    renderGrid();
    updateManualDemoPreviewText();
    updateDemoControlButtons();
    return appData.demoTeamTurn;
}
function prepareManualUnitPreview(turn) {
    const unitAction = getNextDemoTeamUnit(turn.teamId);
    if (!unitAction) {
        turn.phase = 'recruitPreview';
        return prepareManualRecruitPreview(turn);
    }
    const candidate = chooseBestDemoCandidate(unitAction.row, unitAction.col, unitAction);
    turn.preview = { kind: 'unit', unitAction, candidate };
    turn.phase = 'unitExecute';
    appData.selectedCell = { row: unitAction.row, col: unitAction.col };
    renderDemoLandingScores(unitAction.row, unitAction.col);
    updateManualDemoPreviewText();
    updateDemoControlButtons();
    return true;
}
function prepareManualRecruitPreview(turn) {
    const selection = chooseDemoRecruitPlan(turn.teamId);
    turn.preview = { kind: 'recruit', selection };
    if (!selection.plan) {
        turn.phase = 'done';
        turn.running = false;
        turn.paused = false;
        appData.demoEnemyMovementBlocking = false;
        appData.calculationResults = null;
        renderGrid();
        updateManualDemoPreviewText();
        updateDemoControlButtons();
        return false;
    }
    turn.phase = 'recruitExecute';
    renderDemoRecruitLandingScores(selection.plan);
    updateManualDemoPreviewText();
    updateDemoControlButtons();
    return true;
}
async function advanceManualDemoTeamStep() {
    let turn = appData.demoTeamTurn;
    if (!turn || !turn.running)
        turn = startManualDemoTeamSession();
    if (!turn || !turn.manualStep)
        return;
    if (turn.phase === 'turnStartPending') {
        turn.history.push(snapshotDemoTeamStep());
        turn.turnStart = settleDemoTeamTurnStart(turn.teamId);
        turn.phase = 'unitPreview';
        appData.calculationResults = null;
        renderGrid();
        updateManualDemoPreviewText();
        updateDemoControlButtons();
        return;
    }
    if (turn.phase === 'unitPreview') {
        prepareManualUnitPreview(turn);
        return;
    }
    if (turn.phase === 'unitExecute') {
        const preview = turn.preview;
        if (!preview || !preview.unitAction || !preview.candidate) {
            turn.phase = 'unitPreview';
            updateManualDemoPreviewText();
            return;
        }
        await executeDemoCandidate(preview.unitAction, preview.candidate, appData.demoTeamLoopToken);
        turn.preview = null;
        turn.phase = 'unitPreview';
        appData.calculationResults = null;
        calculateOverview();
        renderGrid();
        updateManualDemoPreviewText();
        updateDemoControlButtons();
        return;
    }
    if (turn.phase === 'recruitPreview') {
        prepareManualRecruitPreview(turn);
        return;
    }
    if (turn.phase === 'recruitExecute') {
        const selection = turn.preview ? turn.preview.selection : null;
        if (!selection || !selection.plan) {
            turn.phase = 'done';
            turn.running = false;
            appData.demoEnemyMovementBlocking = false;
            updateManualDemoPreviewText();
            updateDemoControlButtons();
            return;
        }
        await executeDemoRecruitPlan(selection.plan, appData.demoTeamLoopToken);
        calculateOverview();
        turn.preview = null;
        turn.phase = 'unitPreview';
        appData.calculationResults = null;
        renderGrid();
        updateManualDemoPreviewText();
        updateDemoControlButtons();
    }
}
function toggleDemoTeamPause() {
    const turn = appData.demoTeamTurn;
    if (!turn || !turn.running)
        return;
    turn.paused = !turn.paused;
    updateDemoControlButtons();
    if (!turn.paused)
        continueDemoTeamLoop();
}
async function stepDemoTeamOnce() {
    const turn = appData.demoTeamTurn;
    if (!turn || !turn.running) {
        await advanceManualDemoTeamStep();
        return;
    }
    if (turn.manualStep) {
        await advanceManualDemoTeamStep();
        return;
    }
    turn.stepOnce = true;
    turn.paused = false;
    updateDemoControlButtons();
    continueDemoTeamLoop();
}
function undoDemoTeamStep() {
    const turn = appData.demoTeamTurn;
    if (!turn || !turn.history || turn.history.length === 0)
        return;
    appData.demoEnemyMovementBlocking = true;
    turn.running = true;
    turn.paused = true;
    const snapshot = turn.history.pop();
    restoreDemoTeamStep(snapshot);
}
function demoTeamDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function waitDemoTeamControl(token) {
    const turn = appData.demoTeamTurn;
    if (!turn || token !== appData.demoTeamLoopToken)
        return false;
    while (turn.paused) {
        updateDemoControlButtons();
        await demoTeamDelay(100);
        if (!appData.demoTeamTurn || token !== appData.demoTeamLoopToken)
            return false;
    }
    return true;
}
async function animateDemoTeamPause(token, ms = 450) {
    const turn = appData.demoTeamTurn;
    if (!turn || turn.skipAnimation)
        return true;
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (!(await waitDemoTeamControl(token)))
            return false;
        await demoTeamDelay(50);
    }
    return true;
}
function moveUnitForDemoAction(fromRow, fromCol, toRow, toCol, remainingOverride = null, movementContext = null) {
    if (fromRow === toRow && fromCol === toCol) {
        appData.selectedCell = { row: toRow, col: toCol };
        const stationaryCell = appData.gridData[toRow]?.[toCol];
        const stationaryUnit = stationaryCell && stationaryCell.unit
            ? appData.units.find(u => u.id === stationaryCell.unit)
            : null;
        if (stationaryCell && stationaryUnit && (stationaryUnit.abilities || []).includes('突击部队')) {
            const stationarySnapshot = snapshotCellForMove(fromRow, fromCol);
            appData.currentMoveAction = {
                from: { row: fromRow, col: fromCol },
                to: { row: toRow, col: toCol },
                fromSnapshot: stationarySnapshot,
                toSnapshot: snapshotCellForMove(toRow, toCol),
                hasMoved: false,
                awaitingAction: true,
                allowMove: false,
                postAttackMoveOnly: false,
                remainingMove: stationaryUnit.move,
                preMoveRemainingMove: null,
                assaultOrigin: { row: fromRow, col: fromCol },
                assaultPotentialTarget: movementContext && movementContext.potentialTarget
                    ? { ...movementContext.potentialTarget }
                    : null,
                assaultEnemyPositions: collectEnemyUnitPositions(stationaryCell.unitTeam),
                assaultAllyPositions: collectAllyUnitPositions(stationaryCell.unitTeam),
                assaultKilledPosition: null,
                assaultUnitSnapshot: JSON.parse(JSON.stringify(stationarySnapshot))
            };
        }
        return true;
    }
    const fromCell = appData.gridData[fromRow][fromCol];
    const toCell = appData.gridData[toRow][toCol];
    if (!fromCell || !fromCell.unit || !toCell || toCell.unit)
        return false;
    const previousMoveAction = appData.currentMoveAction;
    const movementSnapshot = previousMoveAction && previousMoveAction.postAttackMoveOnly && previousMoveAction.assaultUnitSnapshot
        ? previousMoveAction.assaultUnitSnapshot
        : null;
    const reachable = calculateMovementRange(fromRow, fromCol, remainingOverride, {
        movingCellOverride: movementSnapshot
    });
    const target = reachable.find(pos => pos.row === toRow && pos.col === toCol);
    if (!target)
        return false;
    const fromSnapshot = snapshotCellForMove(fromRow, fromCol);
    const toSnapshot = snapshotCellForMove(toRow, toCol);
    toCell.unit = fromCell.unit;
    toCell.unitTeam = fromCell.unitTeam;
    toCell.unitLevel = fromCell.unitLevel;
    toCell.unitHealth = fromCell.unitHealth;
    toCell.unitExp = fromCell.unitExp || 0;
    toCell.unitStatus = fromCell.unitStatus;
    toCell.unitStatusTurns = fromCell.unitStatusTurns || 0;
    toCell.unitStandby = false;
    toCell.unitSupported = fromCell.unitSupported || false;
    toCell.unitRegisteredCommander = fromCell.unitRegisteredCommander || false;
    toCell.unitTraceId = fromCell.unitTraceId || null;
    toCell.pendingTombstone = null;
    fromCell.unit = null;
    fromCell.unitTeam = null;
    fromCell.unitLevel = null;
    fromCell.unitHealth = null;
    fromCell.unitExp = 0;
    clearUnitStatus(fromCell);
    fromCell.unitStandby = false;
    fromCell.unitSupported = false;
    fromCell.unitRegisteredCommander = false;
    fromCell.unitTraceId = null;
    fromCell.pendingTombstone = null;
    appData.selectedCell = { row: toRow, col: toCol };
    appData.currentMoveAction = {
        from: { row: fromRow, col: fromCol },
        to: { row: toRow, col: toCol },
        fromSnapshot,
        toSnapshot,
        hasMoved: true,
        awaitingAction: true,
        allowMove: false,
        postAttackMoveOnly: !!(previousMoveAction && previousMoveAction.postAttackMoveOnly),
        remainingMove: previousMoveAction && previousMoveAction.postAttackMoveOnly
            ? previousMoveAction.remainingMove
            : (target.remaining || 0),
        preMoveRemainingMove: previousMoveAction && previousMoveAction.postAttackMoveOnly
            ? previousMoveAction.remainingMove
            : null,
        assaultOrigin: previousMoveAction && previousMoveAction.postAttackMoveOnly
            ? (previousMoveAction.assaultOrigin || { row: fromRow, col: fromCol })
            : { row: fromRow, col: fromCol },
        assaultPotentialTarget: previousMoveAction && previousMoveAction.postAttackMoveOnly
            ? (previousMoveAction.assaultPotentialTarget ? { ...previousMoveAction.assaultPotentialTarget } : null)
            : (movementContext && movementContext.potentialTarget
                ? { ...movementContext.potentialTarget }
                : null),
        assaultEnemyPositions: previousMoveAction && previousMoveAction.postAttackMoveOnly
            && Array.isArray(previousMoveAction.assaultEnemyPositions)
            ? previousMoveAction.assaultEnemyPositions.map(pos => ({ row: pos.row, col: pos.col }))
            : collectEnemyUnitPositions(toCell.unitTeam),
        assaultAllyPositions: previousMoveAction && previousMoveAction.postAttackMoveOnly
            && Array.isArray(previousMoveAction.assaultAllyPositions)
            ? previousMoveAction.assaultAllyPositions.map(pos => ({ row: pos.row, col: pos.col }))
            : collectAllyUnitPositions(toCell.unitTeam, {
                replacePosition: { row: toRow, col: toCol },
                withPosition: { row: fromRow, col: fromCol }
            }),
        assaultKilledPosition: previousMoveAction && previousMoveAction.postAttackMoveOnly
            && previousMoveAction.assaultKilledPosition
            ? { ...previousMoveAction.assaultKilledPosition }
            : null,
        assaultUnitSnapshot: previousMoveAction && previousMoveAction.postAttackMoveOnly
            && previousMoveAction.assaultUnitSnapshot
            ? JSON.parse(JSON.stringify(previousMoveAction.assaultUnitSnapshot))
            : JSON.parse(JSON.stringify(fromSnapshot))
    };
    return true;
}
function executeDemoOccupy(row, col) {
    const cell = appData.gridData[row]?.[col];
    if (!cell || !cell.unit)
        return false;
    const unit = appData.units.find(u => u.id === cell.unit);
    const score = getOccupyScoreForCell(row, col, unit, appData.teams.find(t => t.id === cell.unitTeam));
    if (score === null)
        return false;
    queueMoveModeAction('OCCUPY', row, col);
    const previousOwnerTeamId = cell.terrainTeam;
    cell.terrainTeam = cell.unitTeam;
    settleNaturalTeamElimination(previousOwnerTeamId);
    const popups = processUnitStandbyEffects(row, col);
    finishCurrentMoveAction();
    renderGrid();
    showStandbyHealthPopups(popups);
    return true;
}
function executeDemoRepair(row, col) {
    const cell = appData.gridData[row]?.[col];
    if (!cell || !cell.unit)
        return false;
    const unit = appData.units.find(u => u.id === cell.unit);
    if (getRepairScoreForCell(row, col, unit) === null)
        return false;
    queueMoveModeAction('REPAIR', row, col);
    cell.terrain = 'house';
    cell.terrainTeam = null;
    const popups = processUnitStandbyEffects(row, col);
    finishCurrentMoveAction();
    renderGrid();
    showStandbyHealthPopups(popups);
    return true;
}
function executeDemoWait(row, col) {
    const cell = appData.gridData[row]?.[col];
    if (!cell || !cell.unit)
        return false;
    if (Array.isArray(appData.demoAllianceActionSink) && !appData.moveModePendingActionRecord) {
        queueMoveModeAction('STANDBY', row, col);
    }
    const popups = processUnitStandbyEffects(row, col);
    finishCurrentMoveAction();
    renderGrid();
    showStandbyHealthPopups(popups);
    return true;
}
function getAssaultPostAttackMovementScores(row, col, remainingMove, assaultOrigin = null) {
    const assaultUnitSnapshot = appData.currentMoveAction && appData.currentMoveAction.assaultUnitSnapshot
        ? appData.currentMoveAction.assaultUnitSnapshot
        : null;
    const legalLandingKeys = new Set(calculateMovementRange(row, col, remainingMove, {
        movingCellOverride: assaultUnitSnapshot
    })
        .map(pos => pos.row + ',' + pos.col));
    return calculateMovementScores(row, col, {
        skipAssaultFirstMoveReset: true,
        forcePotentialTargetDistance: true,
        potentialTargetOrigin: assaultOrigin || { row, col },
        movementScoreOrigin: assaultOrigin || { row, col },
        potentialTargetOverride: appData.currentMoveAction && appData.currentMoveAction.assaultPotentialTarget
            ? appData.currentMoveAction.assaultPotentialTarget
            : null,
        enemyDistancePositions: appData.currentMoveAction && Array.isArray(appData.currentMoveAction.assaultEnemyPositions)
            ? appData.currentMoveAction.assaultEnemyPositions
            : null,
        allyDistancePositions: appData.currentMoveAction && Array.isArray(appData.currentMoveAction.assaultAllyPositions)
            ? appData.currentMoveAction.assaultAllyPositions
            : null,
        scoringCellOverride: assaultUnitSnapshot
    })
        .filter(score => canStandOnMovementTarget(score.row, score.col, row, col))
        .filter(score => !isForbiddenAiAssaultLanding(score.row, score.col, row, col))
        .filter(score => legalLandingKeys.has(score.row + ',' + score.col));
}
function chooseAssaultMoveCandidate(row, col, remainingMove) {
    const action = appData.currentMoveAction;
    const movementScores = getAssaultPostAttackMovementScores(row, col, remainingMove, action && action.assaultOrigin ? action.assaultOrigin : null);
    return chooseRandomBest(movementScores, item => item.value);
}
async function executeDemoAssaultRemainder(token) {
    const action = appData.currentMoveAction;
    if (!action || !action.postAttackMoveOnly || !appData.selectedCell)
        return;
    const { row, col } = appData.selectedCell;
    const candidate = chooseAssaultMoveCandidate(row, col, action.remainingMove || 0);
    if (candidate && (candidate.row !== row || candidate.col !== col)) {
        appData.currentMoveAction.allowMove = true;
        renderGrid();
        updateMoveModeRange();
        await animateDemoTeamPause(token, 350);
        moveUnitForDemoAction(row, col, candidate.row, candidate.col, action.remainingMove || 0);
    }
    if (appData.selectedCell)
        executeDemoWait(appData.selectedCell.row, appData.selectedCell.col);
}
async function executeDemoCandidate(unitAction, candidate, token, skipSnapshot = false) {
    if (!unitAction || !candidate)
        return false;
    const beforeCounts = collectBoardUnitCounts(appData.demoTeamTurn.teamId);
    const beforeSnapshot = snapshotDemoTeamStep();
    if (!skipSnapshot)
        appData.demoTeamTurn.history.push(beforeSnapshot);
    updateDemoControlButtons();
    appData.selectedCell = { row: unitAction.row, col: unitAction.col };
    renderGrid();
    updateMoveModeRange();
    await animateDemoTeamPause(token, 350);
    if (!moveUnitForDemoAction(unitAction.row, unitAction.col, candidate.row, candidate.col, null, candidate)) {
        if (!skipSnapshot)
            appData.demoTeamTurn.history.pop();
        const fallbackCell = appData.gridData[unitAction.row]?.[unitAction.col];
        if (fallbackCell && fallbackCell.unit && !fallbackCell.unitStandby) {
            executeDemoWait(unitAction.row, unitAction.col);
            return true;
        }
        return false;
    }
    renderGrid();
    clearMoveRangeHighlight();
    await animateDemoTeamPause(token, 350);
    const { row, col } = appData.selectedCell;
    let executed = false;
    if (candidate.actionType === 'wait') {
        executed = executeDemoWait(row, col);
    }
    else if (candidate.actionType === 'attack') {
        appData.attackTargets = calculateAttackTargets(row, col);
        const target = appData.attackTargets.find(t => candidate.target && t.row === candidate.target.row && t.col === candidate.target.col);
        if (target) {
            appData.attackMode = true;
            highlightAttackTargets();
            await animateDemoTeamPause(token, 350);
            executeAttack(target.row, target.col, target);
            executed = true;
            await executeDemoAssaultRemainder(token);
        }
    }
    else if (candidate.actionType === 'heal') {
        appData.healTargets = calculateHealTargets(row, col);
        const target = appData.healTargets.find(t => candidate.target && t.row === candidate.target.row && t.col === candidate.target.col);
        if (target) {
            appData.healMode = true;
            highlightHealTargets();
            await animateDemoTeamPause(token, 350);
            executeHeal(target.row, target.col, target);
            executed = true;
        }
    }
    else if (candidate.actionType === 'support') {
        appData.supportTargets = calculateSupportTargets(row, col);
        const target = appData.supportTargets.find(t => candidate.target && t.row === candidate.target.row && t.col === candidate.target.col);
        if (target) {
            appData.supportMode = true;
            highlightSupportTargets();
            await animateDemoTeamPause(token, 350);
            executeSupport(target.row, target.col, target);
            executed = true;
        }
    }
    else if (candidate.actionType === 'summon') {
        appData.summonTargets = calculateSummonTargets(row, col);
        const target = appData.summonTargets.find(t => candidate.target && t.row === candidate.target.row && t.col === candidate.target.col);
        if (target) {
            appData.summonMode = true;
            highlightSummonTargets();
            await animateDemoTeamPause(token, 350);
            executeSummon(target.row, target.col, target);
            executed = true;
        }
    }
    else if (candidate.actionType === 'occupy') {
        executed = executeDemoOccupy(row, col);
    }
    else if (candidate.actionType === 'repair') {
        executed = executeDemoRepair(row, col);
    }
    if (!executed && appData.selectedCell) {
        executeDemoWait(appData.selectedCell.row, appData.selectedCell.col);
    }
    const afterCounts = collectBoardUnitCounts(appData.demoTeamTurn.teamId);
    addKillStatsFromCounts(beforeCounts, afterCounts);
    if (elements.demoKillStats)
        elements.demoKillStats.textContent = formatKillStats(appData.demoTeamTurn.killsByUnit);
    if (isHardAiTeam(appData.demoTeamTurn.teamId)) {
        if (executed && unitAction.hardAiBuildingAssignment) {
            const target = unitAction.hardAiBuildingAssignment.house;
            const key = `${target.row},${target.col}`;
            const reserved = appData.demoTeamTurn.hardAiReservedBuildingTargets || [];
            if (!reserved.includes(key))
                reserved.push(key);
            appData.demoTeamTurn.hardAiReservedBuildingTargets = reserved;
        }
        if (unitAction.hardAiPairNext && executed
            && findDescribedHardAiPairCandidate([candidate], unitAction.hardAiPairFirstCandidate)) {
            const next = unitAction.hardAiPairNext;
            const required = next.requiredLanding;
            const targetCell = required ? appData.gridData[required.row]?.[required.col] : null;
            const nextCell = appData.gridData[next.row]?.[next.col];
            const secondCanAct = nextCell && nextCell.unit === next.unitId && !nextCell.unitStandby;
            const secondCanUseLanding = !required || (!!targetCell && !targetCell.unit
                && getHardAiPairCandidates(next, required)
                    .some(candidate => getHardAiPairOperationScore(candidate) > 0));
            appData.demoTeamTurn.actionQueue = secondCanAct && secondCanUseLanding ? { ...next } : null;
        }
        else if (unitAction.hardAiPairPending) {
            appData.demoTeamTurn.actionQueue = null;
        }
    }
    return true;
}
async function runAvailableDemoTeamUnitActions(teamId, token, options = {}) {
    const maxSteps = options.maxSteps || 300;
    let guard = 0;
    if (isHardAiTeam(teamId) && appData.demoTeamTurn) {
        appData.demoTeamTurn.hardAiSituation = calculateHardAiSituation(teamId);
    }
    while (appData.demoTeamTurn && token === appData.demoTeamLoopToken && guard < maxSteps) {
        guard++;
        if (options.waitForControl && !(await waitDemoTeamControl(token)))
            return { completed: false, stopped: true, guard };
        const unitAction = getNextDemoTeamUnit(teamId);
        if (!unitAction)
            return { completed: true, guard };
        const candidate = chooseBestDemoCandidate(unitAction.row, unitAction.col, unitAction);
        if (!candidate)
            return { completed: true, guard };
        if (options.onBeforeAction) {
            await options.onBeforeAction(unitAction, candidate);
        }
        const executed = await executeDemoCandidate(unitAction, candidate, token, !!options.skipSnapshot);
        if (options.onAfterAction) {
            await options.onAfterAction(unitAction, candidate, executed);
        }
        updateDemoTeamPreview();
        const turn = appData.demoTeamTurn;
        if (options.honorStepOnce && turn && turn.stepOnce) {
            turn.stepOnce = false;
            turn.paused = true;
            updateDemoControlButtons();
            return { completed: false, paused: true, guard };
        }
        if (!executed)
            return { completed: false, failed: true, guard };
    }
    return { completed: false, guardLimit: true, guard };
}
function cloneDemoUnitActionForLog(unitAction) {
    const source = unitAction || {};
    const { __demoAllianceStepIndex, __demoAllianceBeforeSnapshot, __moveDebugBefore, hardAiCastleBlockade, ...serializable } = source;
    if (hardAiCastleBlockade) {
        serializable.hardAiCastleBlockade = {
            role: hardAiCastleBlockade.role,
            row: hardAiCastleBlockade.row,
            col: hardAiCastleBlockade.col
        };
    }
    return JSON.parse(JSON.stringify(serializable));
}
async function runDemoTeamRecruitment(token) {
    const turn = appData.demoTeamTurn;
    if (!turn)
        return;
    turn.phase = 'recruitment';
    let guard = 0;
    let endReason = '无可招募单位';
    while (appData.demoTeamTurn && token === appData.demoTeamLoopToken && guard < 100) {
        guard++;
        if (!(await waitDemoTeamControl(token)))
            return;
        const selection = chooseDemoRecruitPlan(turn.teamId);
        if (!selection.plan) {
            endReason = selection.reason || endReason;
            break;
        }
        const unit = appData.units.find(u => u.id === selection.plan.unitId);
        if (elements.demoTeamStatus) {
            elements.demoTeamStatus.innerHTML = `招募阶段：${selection.reason}，正在招募${unit ? unit.name : selection.plan.unitId}`;
        }
        const executed = await executeDemoRecruitPlan(selection.plan, token);
        calculateOverview();
        renderGrid();
        if (!executed) {
            endReason = `${unit ? unit.name : selection.plan.unitId}招募执行失败`;
            break;
        }
        const followUpResult = await runAvailableDemoTeamUnitActions(turn.teamId, token, {
            waitForControl: true,
            honorStepOnce: true,
            onBeforeAction: (unitAction, candidate) => {
                if (elements.demoTeamStatus) {
                    elements.demoTeamStatus.innerHTML = `招募后行动：${formatDemoCandidate(unitAction, candidate)}`;
                }
            }
        });
        if (followUpResult.stopped || followUpResult.paused)
            return;
        if (followUpResult.guardLimit) {
            endReason = '招募后行动步数超过上限，请检查是否存在循环行动';
            break;
        }
        if (followUpResult.failed) {
            endReason = '招募后行动执行失败';
            break;
        }
        if (turn.stepOnce) {
            turn.stepOnce = false;
            turn.paused = true;
            updateDemoControlButtons();
        }
    }
    if (guard >= 100) {
        endReason = '招募步数超过上限，请检查是否存在循环招募';
    }
    if (appData.demoTeamTurn && token === appData.demoTeamLoopToken) {
        turn.phase = 'done';
        turn.running = false;
        turn.paused = false;
        appData.demoEnemyMovementBlocking = false;
        renderGrid();
        updateDemoTeamPreview();
        updateDemoControlButtons();
        if (elements.demoTeamStatus) {
            elements.demoTeamStatus.innerHTML = `演示完成：${endReason}`;
        }
        if (elements.demoResult)
            elements.demoResult.classList.remove('hidden');
        if (elements.demoResultContent) {
            elements.demoResultContent.innerHTML = `
                        <div>演示队伍：${appData.teams.find(t => t.id === turn.teamId)?.name || turn.teamId}</div>
                        <div>当前阶段：演示完成</div>
                        <div>结束原因：${endReason}</div>
                        <div>${formatKillStats(turn.killsByUnit)}</div>
                    `;
        }
    }
}
async function runDemoTeamUnitActions(token) {
    const turn = appData.demoTeamTurn;
    if (!turn)
        return;
    turn.phase = 'unitActions';
    const actionResult = await runAvailableDemoTeamUnitActions(turn.teamId, token, {
        waitForControl: true,
        honorStepOnce: true,
        onBeforeAction: (unitAction, candidate) => {
            if (elements.demoTeamStatus) {
                elements.demoTeamStatus.innerHTML = `正在执行：${formatDemoCandidate(unitAction, candidate)}`;
            }
        }
    });
    if (actionResult.stopped || actionResult.paused)
        return;
    if (actionResult.guardLimit && elements.demoTeamStatus) {
        elements.demoTeamStatus.textContent = '演示已停止：行动步数超过上限，请检查是否存在循环行动';
        turn.running = false;
        appData.demoEnemyMovementBlocking = false;
        updateDemoControlButtons();
        return;
    }
    if (appData.demoTeamTurn && token === appData.demoTeamLoopToken) {
        turn.phase = 'recruitment';
        renderGrid();
        updateDemoTeamPreview();
        updateDemoControlButtons();
        if (elements.demoTeamStatus) {
            elements.demoTeamStatus.innerHTML = '现有单位行动完成，正在进入招募阶段。';
        }
        if (elements.demoResult)
            elements.demoResult.classList.remove('hidden');
        if (elements.demoResultContent) {
            elements.demoResultContent.innerHTML = `
                        <div>演示队伍：${appData.teams.find(t => t.id === turn.teamId)?.name || turn.teamId}</div>
                        <div>当前阶段：招募阶段</div>
                        <div>${formatKillStats(turn.killsByUnit)}</div>
                    `;
        }
        await runDemoTeamRecruitment(token);
    }
}
function continueDemoTeamLoop() {
    const turn = appData.demoTeamTurn;
    if (!turn || !turn.running)
        return;
    const token = appData.demoTeamLoopToken;
    if (turn.loopActive)
        return;
    turn.loopActive = true;
    runDemoTeamUnitActions(token).finally(() => {
        if (appData.demoTeamTurn)
            appData.demoTeamTurn.loopActive = false;
        if (!appData.demoTeamTurn || !appData.demoTeamTurn.running)
            appData.demoEnemyMovementBlocking = false;
    });
}
function demoTeamTurn() {
    const teamId = elements.demoTeamSelect ? elements.demoTeamSelect.value : '';
    const team = appData.teams.find(t => t.id === teamId);
    if (!team || !isAiPlayerType(team.playerType)) {
        alert('请选择一个AI队伍');
        return;
    }
    const skipAnimation = !!(elements.demoSkipAnimation && elements.demoSkipAnimation.checked);
    appData.demoTeamTurn = {
        teamId,
        phase: 'unitActions',
        skipAnimation,
        running: true,
        paused: false,
        stepOnce: false,
        loopActive: false,
        manualStep: false,
        preview: null,
        history: [],
        killsByUnit: {},
        turnStart: null,
        actionQueue: null,
        hardAiReservedBuildingTargets: [],
        hardAiBuildingAssignments: []
    };
    appData.demoEnemyMovementBlocking = true;
    renderGrid();
    updateDemoTeamPreview();
    updateDemoControlButtons();
    if (elements.demoTeamStatus) {
        elements.demoTeamStatus.innerHTML = `
                    <span class="font-medium" style="color:${team.color}">${team.name}</span> 跳过回合开始，正在执行现有单位行动。<br>
                    与行棋模式调试一致：当前队伍不结算金币、墓碑、状态、回血和待机重置。
                `;
    }
    if (elements.demoKillStats) {
        elements.demoKillStats.textContent = formatKillStats(appData.demoTeamTurn.killsByUnit);
    }
    if (elements.demoResult)
        elements.demoResult.classList.remove('hidden');
    if (elements.demoResultContent) {
        elements.demoResultContent.innerHTML = `
                    <div>演示队伍：${team.name}</div>
                    <div>动画模式：${skipAnimation ? '跳过动画' : '保留动画'}</div>
                    <div>当前阶段：现有单位行动中</div>
                    <div>${formatKillStats(appData.demoTeamTurn.killsByUnit)}</div>
                `;
    }
    appData.demoTeamLoopToken++;
    continueDemoTeamLoop();
}
function cloneMoveDebugState() {
    return {
        rows: appData.rows,
        cols: appData.cols,
        actionQueue: appData.demoTeamTurn?.actionQueue
            ? JSON.parse(JSON.stringify(appData.demoTeamTurn.actionQueue)) : null,
        teams: JSON.parse(JSON.stringify(appData.teams || [])),
        terrains: JSON.parse(JSON.stringify(appData.terrains || [])),
        units: JSON.parse(JSON.stringify(appData.units || [])),
        gridData: JSON.parse(JSON.stringify(appData.gridData || [])),
        pendingExpEvents: JSON.parse(JSON.stringify(appData.pendingExpEvents || [])),
        currentMoveTeam: appData.currentMoveTeam,
        currentMoveAction: appData.currentMoveAction ? JSON.parse(JSON.stringify(appData.currentMoveAction)) : null,
        selectedCell: appData.selectedCell ? { ...appData.selectedCell } : null,
        calculationResults: appData.calculationResults ? JSON.parse(JSON.stringify(appData.calculationResults)) : null
    };
}
function restoreMoveDebugState(snapshot) {
    if (!snapshot)
        return;
    appData.rows = snapshot.rows || appData.rows;
    appData.cols = snapshot.cols || appData.cols;
    appData.teams = JSON.parse(JSON.stringify(snapshot.teams || appData.teams || []));
    appData.terrains = JSON.parse(JSON.stringify(snapshot.terrains || appData.terrains || []));
    appData.units = JSON.parse(JSON.stringify(snapshot.units || appData.units || []));
    appData.gridData = JSON.parse(JSON.stringify(snapshot.gridData || []));
    if (appData.demoTeamTurn) {
        appData.demoTeamTurn.actionQueue = snapshot.actionQueue
            ? JSON.parse(JSON.stringify(snapshot.actionQueue)) : null;
    }
    normalizeGridData();
    appData.pendingExpEvents = JSON.parse(JSON.stringify(snapshot.pendingExpEvents || []));
    appData.currentMoveTeam = snapshot.currentMoveTeam || null;
    appData.currentMoveAction = snapshot.currentMoveAction ? JSON.parse(JSON.stringify(snapshot.currentMoveAction)) : null;
    appData.selectedCell = snapshot.selectedCell ? { ...snapshot.selectedCell } : null;
    appData.calculationResults = snapshot.calculationResults ? JSON.parse(JSON.stringify(snapshot.calculationResults)) : null;
    normalizeGridData();
    renderGrid();
    renderTeamConfigs();
    renderTerrainList();
    renderUnitList();
    renderMoveModeTeamStats();
    updateMoveModeCurrentTeamLabel();
}
function getMoveDebugTerrainName(layout, terrainId) {
    const terrain = (layout.terrains || appData.terrains || []).find(item => item.id === terrainId);
    return terrain ? terrain.name : '';
}
function areMoveDebugTerrainsCompatible(currentLayout, targetLayout, row, col) {
    const currentCell = appData.gridData[row]?.[col] || {};
    const targetCell = targetLayout.gridData[row]?.[col] || {};
    if (currentCell.terrain === targetCell.terrain)
        return true;
    const flexibleNames = ['破房', '房子', '城堡'];
    const currentName = getMoveDebugTerrainName(currentLayout, currentCell.terrain);
    const targetName = getMoveDebugTerrainName(targetLayout, targetCell.terrain);
    return flexibleNames.includes(currentName) && flexibleNames.includes(targetName);
}
function validateMoveDebugTargetLayout(targetLayout) {
    const compactError = validateCompactLayoutData(targetLayout);
    if (compactError)
        return compactError;
    if (targetLayout.map.rows !== appData.rows || targetLayout.map.cols !== appData.cols) {
        return `地图尺寸不一致：当前 ${appData.rows}x${appData.cols}，目标 ${targetLayout.map.rows || '?'}x${targetLayout.map.cols || '?'}`;
    }
    const targetSnapshot = createMoveDebugSnapshotFromCompactLayout(targetLayout);
    const currentLayout = {
        terrains: appData.terrains
    };
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            if (!areMoveDebugTerrainsCompatible(currentLayout, targetSnapshot, i, j)) {
                return `地形不一致：(${i + 1},${j + 1}) 当前 ${getMoveDebugTerrainName(currentLayout, appData.gridData[i][j].terrain) || '无'}，目标 ${getMoveDebugTerrainName(targetSnapshot, targetSnapshot.gridData[i][j].terrain) || '无'}`;
            }
        }
    }
    return null;
}
function createMoveDebugSnapshotFromCompactLayout(data) {
    const snapshot = {
        rows: data.map.rows,
        cols: data.map.cols,
        teams: JSON.parse(JSON.stringify(data.teams || appData.teams || [])),
        terrains: JSON.parse(JSON.stringify(appData.terrains || [])),
        units: JSON.parse(JSON.stringify(appData.units || [])),
        gridData: []
    };
    for (let i = 0; i < snapshot.rows; i++) {
        const row = [];
        for (let j = 0; j < snapshot.cols; j++) {
            row.push(createEmptyCellWithTerrain(data.terrain[i][j]));
        }
        snapshot.gridData.push(row);
    }
    (data.terrainOwners || []).forEach(owner => {
        const row = parseInt(owner.r) - 1;
        const col = parseInt(owner.c) - 1;
        snapshot.gridData[row][col].terrainTeam = owner.owner || null;
    });
    (data.units || []).forEach(unit => {
        const row = parseInt(unit.r) - 1;
        const col = parseInt(unit.c) - 1;
        const cell = snapshot.gridData[row][col];
        cell.unit = unit.type;
        cell.unitTeam = unit.team;
        cell.unitLevel = Math.max(0, parseInt(unit.level) || 0);
        cell.unitHealth = Math.max(0, parseInt(unit.hp) || 0);
        cell.unitExp = Math.max(0, parseInt(unit.exp) || 0);
        setUnitStatusDirect(cell, unit.status || '无', unit.statusTurns);
        cell.unitStandby = !!unit.standby;
        cell.unitSupported = !!unit.supported;
        cell.unitRegisteredCommander = unit.type === 'commander'
            ? (Object.prototype.hasOwnProperty.call(unit, 'registeredCommander') ? unit.registeredCommander === true : undefined)
            : false;
    });
    normalizeRegisteredCommanders(snapshot.gridData, snapshot.rows, snapshot.cols);
    (data.tombstones || []).forEach(tombstone => {
        const row = parseInt(tombstone.r) - 1;
        const col = parseInt(tombstone.c) - 1;
        snapshot.gridData[row][col].tombstone = {
            rounds: parseInt(tombstone.rounds) === 1 ? 1 : 2,
            team: tombstone.team || 'blue'
        };
    });
    return snapshot;
}
function loadMoveDebugTargetLayout(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const targetLayout = JSON.parse(event.target.result);
            const error = validateMoveDebugTargetLayout(targetLayout);
            if (error) {
                appData.moveDebugSession = null;
                if (elements.moveDebugStatus)
                    elements.moveDebugStatus.textContent = '目标布局拒绝：' + error;
                if (elements.startMoveDebugBtn)
                    elements.startMoveDebugBtn.disabled = true;
                updateMoveDebugPlaybackButtons();
                return;
            }
            const targetSnapshot = createMoveDebugSnapshotFromCompactLayout(targetLayout);
            appData.moveDebugSession = {
                targetLayout: JSON.parse(JSON.stringify(targetLayout)),
                targetSnapshot,
                steps: [],
                diffs: [],
                playbackIndex: -1,
                playbackTimer: null
            };
            if (elements.moveDebugStatus)
                elements.moveDebugStatus.textContent = '已上传目标布局，可开始调试当前行棋联盟';
            if (elements.startMoveDebugBtn)
                elements.startMoveDebugBtn.disabled = false;
            if (elements.moveDebugResults)
                elements.moveDebugResults.innerHTML = '';
            updateMoveDebugPlaybackButtons();
        }
        catch (error) {
            appData.moveDebugSession = null;
            if (elements.moveDebugStatus)
                elements.moveDebugStatus.textContent = '目标布局解析失败：' + error.message;
            if (elements.startMoveDebugBtn)
                elements.startMoveDebugBtn.disabled = true;
            updateMoveDebugPlaybackButtons();
        }
    };
    reader.readAsText(file);
}
function findMoveDebugUnitPosition(snapshot, identity, preferred = null) {
    const matches = [];
    for (let i = 0; i < (snapshot.rows || appData.rows); i++) {
        for (let j = 0; j < (snapshot.cols || appData.cols); j++) {
            const cell = snapshot.gridData?.[i]?.[j];
            if (cell && cell.unit === identity.unit && cell.unitTeam === identity.teamId) {
                const distance = preferred ? Math.abs(preferred.row - i) + Math.abs(preferred.col - j) : 0;
                let stablePenalty = 0;
                if (Number.isFinite(identity.level) && (cell.unitLevel || 0) !== identity.level)
                    stablePenalty += 1000;
                if (Number.isFinite(identity.exp) && (cell.unitExp || 0) !== identity.exp)
                    stablePenalty += 1000;
                if (identity.status && identity.status === (cell.unitStatus || '无')
                    && Number.isFinite(identity.statusTurns)
                    && (cell.unitStatusTurns || 0) !== identity.statusTurns) {
                    stablePenalty += 100;
                }
                matches.push({ row: i, col: j, cell, distance, stablePenalty });
            }
        }
    }
    matches.sort((a, b) => a.stablePenalty - b.stablePenalty || a.distance - b.distance || a.row - b.row || a.col - b.col);
    return matches[0] || null;
}
function getMoveDebugUnitIdentity(row, col, snapshot = null) {
    const gridData = snapshot && snapshot.gridData ? snapshot.gridData : appData.gridData;
    const cell = gridData[row]?.[col];
    if (!cell || !cell.unit)
        return null;
    return {
        key: `${row},${col},${cell.unitTeam},${cell.unit},${cell.unitLevel || 0},${cell.unitExp || 0}`,
        row,
        col,
        teamId: cell.unitTeam,
        unit: cell.unit,
        level: cell.unitLevel || 0,
        exp: cell.unitExp || 0,
        status: cell.unitStatus || '无',
        statusTurns: cell.unitStatusTurns || 0,
        health: cell.unitHealth || 0
    };
}
function isMoveDebugNegativeStatus(status) {
    return Array.isArray(debuff) && debuff.includes(status || '无');
}
function getMoveDebugTopCandidates(row, col) {
    const candidates = safeCalculateScoreList(calculateTotalScores, row, col);
    if (candidates.length === 0)
        return [];
    const bestValue = Math.max(...candidates.map(candidate => Number(candidate.value) || 0));
    return candidates
        .filter(candidate => (Number(candidate.value) || 0) === bestValue)
        .map(candidate => JSON.parse(JSON.stringify(candidate)));
}
function canMoveDebugStatusReachTarget(currentStatus, targetStatus, reopenedBySupport) {
    currentStatus = currentStatus || '无';
    targetStatus = targetStatus || '无';
    if (currentStatus === targetStatus)
        return true;
    if (reopenedBySupport)
        return true;
    if (currentStatus === '鼓舞')
        return targetStatus === '鼓舞';
    if (isMoveDebugNegativeStatus(currentStatus) && targetStatus === '无')
        return true;
    if (currentStatus === '无' && targetStatus === '鼓舞')
        return true;
    if (isMoveDebugNegativeStatus(currentStatus) && targetStatus === '鼓舞')
        return true;
    return false;
}
function scoreMoveDebugCellAgainstTarget(actualPos, targetPos, options = {}) {
    if (!actualPos && !targetPos)
        return { score: 20000, fatal: false, reason: '' };
    if (!!actualPos !== !!targetPos) {
        return {
            score: -100000,
            fatal: !!options.closed,
            reason: `存亡不同：实际${actualPos ? '存在' : '不存在'}，目标${targetPos ? '存在' : '不存在'}`
        };
    }
    if (!actualPos || !targetPos)
        return { score: 0, fatal: false, reason: '' };
    const actual = actualPos.cell || {};
    const target = targetPos.cell || {};
    let score = 0;
    let fatal = false;
    const reasons = [];
    if (actualPos.row === targetPos.row && actualPos.col === targetPos.col)
        score += 50000;
    else
        reasons.push(`位置不同：实际${formatMoveDebugCell(actualPos)}，目标${formatMoveDebugCell(targetPos)}`);
    if ((actual.unitLevel || 0) === (target.unitLevel || 0))
        score += 5000;
    else {
        fatal = true;
        reasons.push(`等级不同：实际${actual.unitLevel || 0}，目标${target.unitLevel || 0}`);
    }
    if ((actual.unitExp || 0) === (target.unitExp || 0))
        score += 5000;
    else {
        fatal = true;
        reasons.push(`经验不同：实际${actual.unitExp || 0}，目标${target.unitExp || 0}`);
    }
    const actualStatus = actual.unitStatus || '无';
    const targetStatus = target.unitStatus || '无';
    if (actualStatus === targetStatus) {
        score += 2000;
        if ((actual.unitStatusTurns || 0) === (target.unitStatusTurns || 0))
            score += 500;
        else {
            fatal = true;
            reasons.push(`状态回合不同：实际${actual.unitStatusTurns || 0}，目标${target.unitStatusTurns || 0}`);
        }
    }
    else if (canMoveDebugStatusReachTarget(actualStatus, targetStatus, !!options.reopenedBySupport)) {
        score += 300;
        if (actualStatus === '鼓舞' && !options.reopenedBySupport) {
            fatal = true;
            reasons.push(`鼓舞状态不可变更：实际${actualStatus}，目标${targetStatus}`);
        }
    }
    else {
        fatal = true;
        reasons.push(`状态不可达：实际${actualStatus}，目标${targetStatus}`);
    }
    const actualHp = actual.unitHealth || 0;
    const targetHp = target.unitHealth || 0;
    if (actualHp === targetHp) {
        score += 1000;
    }
    else {
        const delta = Math.abs(targetHp - actualHp);
        if (!options.reopenedBySupport && options.closed && delta % 5 !== 0) {
            fatal = true;
            reasons.push(`血量差非5倍数：实际${actualHp}，目标${targetHp}`);
        }
        else if (delta % 5 === 0) {
            score += 150;
        }
    }
    return { score, fatal, reason: reasons.join('；') };
}
function scoreDebugCandidateAgainstTarget(unitAction, candidate, targetSnapshot) {
    const identity = getMoveDebugUnitIdentity(unitAction.row, unitAction.col);
    if (!identity)
        return 0;
    const targetPos = findMoveDebugUnitPosition(targetSnapshot, identity, { row: candidate.row, col: candidate.col });
    let score = 0;
    if (targetPos)
        score += 100000;
    if (targetPos && targetPos.row === candidate.row && targetPos.col === candidate.col)
        score += 10000;
    if (targetPos && candidate.actionType) {
        if (candidate.actionType === 'attack' && candidate.target) {
            const targetCell = targetSnapshot.gridData?.[candidate.target.row]?.[candidate.target.col];
            if (!targetCell || !targetCell.unit)
                score += 1000;
        }
        else if (candidate.actionType === 'heal' && candidate.target) {
            const targetCell = targetSnapshot.gridData?.[candidate.target.row]?.[candidate.target.col];
            if (targetCell && targetCell.unitHealth >= (appData.gridData[candidate.target.row]?.[candidate.target.col]?.unitHealth || 0))
                score += 1000;
        }
        else if (candidate.actionType === 'summon' && candidate.target) {
            const targetCell = targetSnapshot.gridData?.[candidate.target.row]?.[candidate.target.col];
            if (targetCell && !targetCell.tombstone)
                score += 1000;
        }
        else if ((candidate.actionType === 'occupy' || candidate.actionType === 'repair') && targetPos) {
            score += 1000;
        }
        else if (candidate.actionType === 'wait') {
            score += 500;
        }
    }
    if (targetPos) {
        const currentPos = findMoveDebugUnitPosition({ gridData: appData.gridData, rows: appData.rows, cols: appData.cols }, identity, { row: unitAction.row, col: unitAction.col });
        const match = scoreMoveDebugCellAgainstTarget(currentPos, targetPos, { closed: false });
        score += match.score;
    }
    return score;
}
function rankMoveDebugCandidates(unitAction, candidates, targetSnapshot) {
    if (!candidates || candidates.length === 0)
        return [];
    const bestValue = Math.max(...candidates.map(candidate => Number(candidate.value) || 0));
    return candidates
        .filter(candidate => (Number(candidate.value) || 0) === bestValue)
        .map(candidate => ({
        candidate,
        score: scoreDebugCandidateAgainstTarget(unitAction, candidate, targetSnapshot)
    }))
        .sort((a, b) => b.score - a.score);
}
function chooseDebugMatchedCandidate(unitAction, candidates, targetSnapshot) {
    const ranked = rankMoveDebugCandidates(unitAction, candidates, targetSnapshot);
    return ranked.length > 0 ? ranked[0].candidate : null;
}
function refineMoveDebugRecruitSelection(selection, targetSnapshot) {
    if (!selection || !selection.plan || !selection.plan.placement)
        return selection;
    const plan = JSON.parse(JSON.stringify(selection.plan));
    const row = plan.placement.row;
    const col = plan.placement.col;
    const cell = appData.gridData[row]?.[col];
    const unit = getUnitDefinition(plan.unitId);
    if (!cell || !unit)
        return selection;
    const snapshot = snapshotCellForMove(row, col);
    setCellUnit(cell, plan.unitId, plan.teamId, 0);
    const unitAction = { row, col, unit };
    const candidates = calculateTotalScores(row, col);
    const candidate = chooseDebugMatchedCandidate(unitAction, candidates, targetSnapshot);
    restoreCellFromMoveSnapshot(row, col, snapshot);
    if (candidate) {
        plan.placement.candidate = candidate;
    }
    return {
        ...selection,
        plan
    };
}
function formatMoveDebugCell(pos) {
    return pos ? `(${pos.row + 1},${pos.col + 1})` : '无';
}
function collectMoveDebugInitialUnits(snapshot, teamId) {
    const units = [];
    for (let i = 0; i < snapshot.rows; i++) {
        for (let j = 0; j < snapshot.cols; j++) {
            const cell = snapshot.gridData[i]?.[j];
            if (!cell || !cell.unit || cell.unitTeam !== teamId)
                continue;
            units.push({
                key: `${i},${j},${cell.unitTeam},${cell.unit}`,
                row: i,
                col: j,
                teamId: cell.unitTeam,
                unit: cell.unit,
                level: cell.unitLevel || 0,
                health: cell.unitHealth || 0,
                status: cell.unitStatus || '无',
                statusTurns: cell.unitStatusTurns || 0,
                exp: cell.unitExp || 0
            });
        }
    }
    return units;
}
function describeMoveDebugDiff(identity, actualPos, targetPos) {
    const details = [];
    if (!!actualPos !== !!targetPos) {
        details.push(`存亡不同：实际${actualPos ? '存在' : '不存在'}，目标${targetPos ? '存在' : '不存在'}`);
    }
    if (actualPos && targetPos && (actualPos.row !== targetPos.row || actualPos.col !== targetPos.col)) {
        details.push(`位置不同：实际${formatMoveDebugCell(actualPos)}，目标${formatMoveDebugCell(targetPos)}`);
    }
    if (actualPos && targetPos) {
        if ((actualPos.cell.unitHealth || 0) !== (targetPos.cell.unitHealth || 0)) {
            details.push(`血量不同：实际${actualPos.cell.unitHealth || 0}，目标${targetPos.cell.unitHealth || 0}`);
        }
        if ((actualPos.cell.unitStatus || '无') !== (targetPos.cell.unitStatus || '无')
            || (actualPos.cell.unitStatusTurns || 0) !== (targetPos.cell.unitStatusTurns || 0)) {
            details.push(`状态不同：实际${getStatusDisplayText(actualPos.cell)}，目标${getStatusDisplayText(targetPos.cell)}`);
        }
        if ((actualPos.cell.unitExp || 0) !== (targetPos.cell.unitExp || 0) || (actualPos.cell.unitLevel || 0) !== (targetPos.cell.unitLevel || 0)) {
            details.push(`经验等级不同：实际Lv${actualPos.cell.unitLevel || 0}/Exp${actualPos.cell.unitExp || 0}，目标Lv${targetPos.cell.unitLevel || 0}/Exp${targetPos.cell.unitExp || 0}`);
        }
    }
    return details;
}
function compareMoveDebugResult(initialSnapshot, actualSnapshot, targetSnapshot, teamId) {
    const initialUnits = collectMoveDebugInitialUnits(initialSnapshot, teamId);
    const diffs = [];
    for (const identity of initialUnits) {
        const actualPos = findMoveDebugUnitPosition(actualSnapshot, identity, { row: identity.row, col: identity.col });
        const targetPos = findMoveDebugUnitPosition(targetSnapshot, identity, { row: identity.row, col: identity.col });
        const details = describeMoveDebugDiff(identity, actualPos, targetPos);
        if (details.length > 0) {
            const team = appData.teams.find(item => item.id === identity.teamId);
            const unit = appData.units.find(item => item.id === identity.unit);
            diffs.push({
                identity,
                teamName: team ? team.name : identity.teamId,
                unitName: unit ? unit.name : identity.unit,
                actualPos: actualPos ? { row: actualPos.row, col: actualPos.col } : null,
                targetPos: targetPos ? { row: targetPos.row, col: targetPos.col } : null,
                details
            });
        }
    }
    return diffs;
}
function countMoveDebugUnits(snapshot, teamId) {
    const counts = {};
    for (let i = 0; i < (snapshot.rows || appData.rows); i++) {
        for (let j = 0; j < (snapshot.cols || appData.cols); j++) {
            const cell = snapshot.gridData?.[i]?.[j];
            if (!cell || !cell.unit || cell.unitTeam !== teamId)
                continue;
            counts[cell.unit] = (counts[cell.unit] || 0) + 1;
        }
    }
    return counts;
}
function collectMoveDebugFinalUnits(snapshot, teamId, unitId = null) {
    const units = [];
    for (let i = 0; i < (snapshot.rows || appData.rows); i++) {
        for (let j = 0; j < (snapshot.cols || appData.cols); j++) {
            const cell = snapshot.gridData?.[i]?.[j];
            if (!cell || !cell.unit || cell.unitTeam !== teamId)
                continue;
            if (unitId && cell.unit !== unitId)
                continue;
            units.push({
                row: i,
                col: j,
                cell,
                unit: cell.unit,
                teamId: cell.unitTeam,
                level: cell.unitLevel || 0,
                exp: cell.unitExp || 0,
                health: cell.unitHealth || 0,
                status: cell.unitStatus || '无',
                statusTurns: cell.unitStatusTurns || 0
            });
        }
    }
    return units;
}
function describeMoveDebugFinalUnitDiff(actual, target) {
    const details = [];
    if (!!actual !== !!target) {
        details.push(`存亡不同：实际${actual ? '存在' : '不存在'}，目标${target ? '存在' : '不存在'}`);
        return details;
    }
    if (!actual || !target)
        return details;
    if (actual.row !== target.row || actual.col !== target.col) {
        details.push(`位置不同：实际${formatMoveDebugCell(actual)}，目标${formatMoveDebugCell(target)}`);
    }
    if ((actual.cell.unitHealth || 0) !== (target.cell.unitHealth || 0)) {
        details.push(`血量不同：实际${actual.cell.unitHealth || 0}，目标${target.cell.unitHealth || 0}`);
    }
    if ((actual.cell.unitStatus || '无') !== (target.cell.unitStatus || '无')
        || (actual.cell.unitStatusTurns || 0) !== (target.cell.unitStatusTurns || 0)) {
        details.push(`状态不同：实际${getStatusDisplayText(actual.cell)}，目标${getStatusDisplayText(target.cell)}`);
    }
    if ((actual.cell.unitExp || 0) !== (target.cell.unitExp || 0) || (actual.cell.unitLevel || 0) !== (target.cell.unitLevel || 0)) {
        details.push(`经验等级不同：实际Lv${actual.cell.unitLevel || 0}/Exp${actual.cell.unitExp || 0}，目标Lv${target.cell.unitLevel || 0}/Exp${target.cell.unitExp || 0}`);
    }
    return details;
}
function compareMoveDebugGeneratedUnits(initialSnapshot, actualSnapshot, targetSnapshot, teamId) {
    const diffs = [];
    const initialCounts = countMoveDebugUnits(initialSnapshot, teamId);
    const actualCounts = countMoveDebugUnits(actualSnapshot, teamId);
    const targetCounts = countMoveDebugUnits(targetSnapshot, teamId);
    const unitIds = new Set([...Object.keys(actualCounts), ...Object.keys(targetCounts)]);
    for (const unitId of unitIds) {
        const initialCount = initialCounts[unitId] || 0;
        const actualCount = actualCounts[unitId] || 0;
        const targetCount = targetCounts[unitId] || 0;
        if (Math.max(actualCount, targetCount) <= initialCount && actualCount === targetCount)
            continue;
        const actualUnits = collectMoveDebugFinalUnits(actualSnapshot, teamId, unitId);
        const targetUnits = collectMoveDebugFinalUnits(targetSnapshot, teamId, unitId);
        const usedActual = new Set();
        targetUnits.forEach(targetUnit => {
            let bestIndex = -1;
            let bestScore = Infinity;
            actualUnits.forEach((actualUnit, actualIndex) => {
                if (usedActual.has(actualIndex))
                    return;
                let score = Math.abs(actualUnit.row - targetUnit.row) + Math.abs(actualUnit.col - targetUnit.col);
                if ((actualUnit.level || 0) !== (targetUnit.level || 0))
                    score += 100;
                if ((actualUnit.exp || 0) !== (targetUnit.exp || 0))
                    score += 100;
                if (score < bestScore) {
                    bestScore = score;
                    bestIndex = actualIndex;
                }
            });
            const actualUnit = bestIndex >= 0 ? actualUnits[bestIndex] : null;
            if (bestIndex >= 0)
                usedActual.add(bestIndex);
            const details = describeMoveDebugFinalUnitDiff(actualUnit, targetUnit);
            if (details.length > 0) {
                const team = appData.teams.find(item => item.id === teamId);
                const unit = appData.units.find(item => item.id === unitId);
                diffs.push({
                    identity: { row: targetUnit.row, col: targetUnit.col, teamId, unit: unitId },
                    teamName: team ? team.name : teamId,
                    unitName: unit ? unit.name : unitId,
                    actualPos: actualUnit ? { row: actualUnit.row, col: actualUnit.col } : null,
                    targetPos: { row: targetUnit.row, col: targetUnit.col },
                    details
                });
            }
        });
        actualUnits.forEach((actualUnit, actualIndex) => {
            if (usedActual.has(actualIndex))
                return;
            const team = appData.teams.find(item => item.id === teamId);
            const unit = appData.units.find(item => item.id === unitId);
            diffs.push({
                identity: { row: actualUnit.row, col: actualUnit.col, teamId, unit: unitId },
                teamName: team ? team.name : teamId,
                unitName: unit ? unit.name : unitId,
                actualPos: { row: actualUnit.row, col: actualUnit.col },
                targetPos: null,
                details: ['目标布局中没有对应的新增/召唤单位']
            });
        });
    }
    return diffs;
}
function compareMoveDebugAllianceResult(initialSnapshot, actualSnapshot, targetSnapshot, teamIds) {
    const diffs = [];
    for (const teamId of teamIds) {
        diffs.push(...compareMoveDebugResult(initialSnapshot, actualSnapshot, targetSnapshot, teamId));
        diffs.push(...compareMoveDebugGeneratedUnits(initialSnapshot, actualSnapshot, targetSnapshot, teamId));
        const actualCounts = countMoveDebugUnits(actualSnapshot, teamId);
        const targetCounts = countMoveDebugUnits(targetSnapshot, teamId);
        const unitIds = new Set([...Object.keys(actualCounts), ...Object.keys(targetCounts)]);
        for (const unitId of unitIds) {
            const actualCount = actualCounts[unitId] || 0;
            const targetCount = targetCounts[unitId] || 0;
            if (actualCount === targetCount)
                continue;
            const team = appData.teams.find(item => item.id === teamId);
            const unit = appData.units.find(item => item.id === unitId);
            diffs.push({
                identity: { row: null, col: null, teamId, unit: unitId },
                teamName: team ? team.name : teamId,
                unitName: unit ? unit.name : unitId,
                actualPos: null,
                targetPos: null,
                details: [`单位数量不同：实际${actualCount}，目标${targetCount}（包含招募/死亡影响）`]
            });
        }
    }
    return diffs;
}
function updateMoveDebugPlaybackButtons() {
    const session = appData.moveDebugSession;
    const hasSteps = !!(session && session.steps && session.steps.length > 0);
    if (elements.moveDebugPrevBtn)
        elements.moveDebugPrevBtn.disabled = !hasSteps;
    if (elements.moveDebugNextBtn)
        elements.moveDebugNextBtn.disabled = !hasSteps;
    if (elements.moveDebugPlayBtn)
        elements.moveDebugPlayBtn.disabled = !hasSteps;
    if (elements.moveDebugStopBtn)
        elements.moveDebugStopBtn.disabled = !hasSteps;
}
function renderMoveDebugResults() {
    const session = appData.moveDebugSession;
    if (!elements.moveDebugResults || !session)
        return;
    const team = appData.teams.find(item => item.id === session.teamId);
    const diffs = session.diffs || [];
    const summary = `
                <div class="font-semibold text-gray-700 mb-1">调试范围：${session.teamSequenceNames ? session.teamSequenceNames.join(' → ') : (team ? team.name : session.teamId || '未知')}</div>
                <div>步骤数：${session.steps ? session.steps.length : 0}</div>
                <div>差异单位：${diffs.length}</div>
                <div>保留分支：${session.branchCount || 0}${session.prunedBranchCount ? `；裁剪分支：${session.prunedBranchCount}` : ''}</div>
                ${formatMoveDebugFirstMismatch(session.firstMismatch)}
            `;
    if (diffs.length === 0) {
        elements.moveDebugResults.innerHTML = summary + '<div class="mt-2 text-green-600">该AI队伍单位结果与目标布局一致</div>';
        return;
    }
    const items = diffs.map((diff, index) => `
                <div class="mt-2 p-2 bg-white border border-gray-200 rounded">
                    <div class="font-medium text-gray-700">${diff.teamName} ${diff.unitName} ${diff.identity.row === null ? '招募/数量差异' : `初始${formatMoveDebugCell(diff.identity)}`}</div>
                    <div>实际：${formatMoveDebugCell(diff.actualPos)}；目标：${formatMoveDebugCell(diff.targetPos)}</div>
                    <div>${diff.details.join('；')}</div>
                    ${diff.identity.row === null ? '' : `<button class="move-debug-unit-play mt-1 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded px-2 py-1" data-debug-index="${index}">播放该单位</button>`}
                </div>
            `).join('');
    elements.moveDebugResults.innerHTML = summary + items;
    elements.moveDebugResults.querySelectorAll('.move-debug-unit-play').forEach(button => {
        button.addEventListener('click', () => playMoveDebugUnitTrace(parseInt(button.dataset.debugIndex)));
    });
}
const MOVE_DEBUG_BRANCH_LIMIT = 80;
function cloneMoveDebugTurnState() {
    return appData.demoTeamTurn ? JSON.parse(JSON.stringify(appData.demoTeamTurn)) : null;
}
function createMoveDebugTurn(teamId) {
    return {
        teamId,
        phase: 'unitActions',
        skipAnimation: true,
        running: true,
        paused: false,
        stepOnce: false,
        loopActive: false,
        manualStep: false,
        preview: null,
        history: [],
        killsByUnit: {},
        turnStart: null,
        actionQueue: null,
        hardAiReservedBuildingTargets: [],
        hardAiBuildingAssignments: []
    };
}
function restoreMoveDebugBranch(branch) {
    restoreMoveDebugState(branch.state);
    appData.demoTeamTurn = branch.turn ? JSON.parse(JSON.stringify(branch.turn)) : null;
    appData.demoEnemyMovementBlocking = true;
}
function captureMoveDebugBranch(branch, extra = {}) {
    return {
        id: extra.id || branch.id,
        state: cloneMoveDebugState(),
        turn: cloneMoveDebugTurnState(),
        steps: extra.steps || branch.steps || [],
        score: extra.score ?? branch.score ?? 0,
        failures: extra.failures || branch.failures || [],
        pruned: false
    };
}
function getMoveDebugBranchFailure(branch, step, reason) {
    return {
        stepIndex: step ? step.index : (branch.steps ? branch.steps.length : 0),
        label: step ? step.label : '未知步骤',
        unitAction: step ? step.unitAction : null,
        candidate: step ? step.candidate : null,
        reason: reason || '分支不符合目标布局',
        before: step ? step.before : null,
        after: step ? step.after : null
    };
}
function evaluateMoveDebugExecutedStep(unitAction, candidate, before, after, targetSnapshot) {
    const identity = getMoveDebugUnitIdentity(unitAction.row, unitAction.col, before);
    if (!identity)
        return { score: -1000, fatal: false, reason: '行动单位在执行前不存在' };
    const actualPos = findMoveDebugUnitPosition(after, identity, { row: candidate.row, col: candidate.col });
    const targetPos = findMoveDebugUnitPosition(targetSnapshot, identity, { row: candidate.row, col: candidate.col });
    const reopenedBySupport = candidate && candidate.actionType === 'support';
    const closed = !!(actualPos && actualPos.cell && actualPos.cell.unitStandby && !reopenedBySupport);
    const match = scoreMoveDebugCellAgainstTarget(actualPos, targetPos, { closed, reopenedBySupport });
    let score = match.score;
    if (candidate && candidate.actionType === 'support' && candidate.target) {
        const targetCell = targetSnapshot.gridData?.[candidate.target.row]?.[candidate.target.col];
        if (targetCell && targetCell.unit)
            score += 800;
    }
    if (candidate && candidate.actionType === 'summon' && candidate.target) {
        const targetCell = targetSnapshot.gridData?.[candidate.target.row]?.[candidate.target.col];
        if (targetCell && targetCell.unit)
            score += 1000;
        if (targetCell && !targetCell.tombstone)
            score += 300;
    }
    return { score, fatal: match.fatal, reason: match.reason };
}
function sortAndLimitMoveDebugBranches(branches, session) {
    branches.sort((a, b) => (b.score || 0) - (a.score || 0) || (a.steps?.length || 0) - (b.steps?.length || 0));
    if (branches.length > MOVE_DEBUG_BRANCH_LIMIT) {
        session.prunedBranchCount = (session.prunedBranchCount || 0) + branches.length - MOVE_DEBUG_BRANCH_LIMIT;
        return branches.slice(0, MOVE_DEBUG_BRANCH_LIMIT);
    }
    return branches;
}
async function expandMoveDebugUnitActionBranch(branch, teamId, session, label) {
    restoreMoveDebugBranch(branch);
    const unitAction = getNextDemoTeamUnit(teamId);
    if (!unitAction)
        return { completed: true, branches: [branch] };
    const candidates = getMoveDebugTopCandidates(unitAction.row, unitAction.col);
    if (candidates.length === 0)
        return { completed: true, branches: [branch] };
    const ranked = rankMoveDebugCandidates(unitAction, candidates, session.targetSnapshot);
    const sourceCandidates = ranked.length > 0 ? ranked.map(item => item.candidate) : candidates;
    const nextBranches = [];
    const failures = [];
    const team = appData.teams.find(t => t.id === teamId);
    for (const candidate of sourceCandidates) {
        restoreMoveDebugBranch(branch);
        const before = cloneMoveDebugState();
        const actionForLog = cloneDemoUnitActionForLog(unitAction);
        const executed = await executeDemoCandidate(unitAction, candidate, appData.demoTeamLoopToken, true);
        const after = cloneMoveDebugState();
        const step = {
            index: branch.steps.length,
            label: `${team ? team.name : teamId} ${label}`,
            unitAction: actionForLog,
            candidate: JSON.parse(JSON.stringify(candidate)),
            before,
            after,
            executed
        };
        if (!executed) {
            failures.push(getMoveDebugBranchFailure(branch, step, '候选执行失败'));
            continue;
        }
        const evaluation = evaluateMoveDebugExecutedStep(actionForLog, candidate, before, after, session.targetSnapshot);
        if (evaluation.fatal) {
            failures.push(getMoveDebugBranchFailure(branch, step, evaluation.reason));
            continue;
        }
        nextBranches.push(captureMoveDebugBranch(branch, {
            id: `${branch.id}.${nextBranches.length}`,
            steps: [...branch.steps, step],
            score: (branch.score || 0) + evaluation.score,
            failures: branch.failures || []
        }));
    }
    if (nextBranches.length === 0 && failures.length > 0) {
        session.firstMismatch = chooseMoveDebugFirstMismatch([...(session.firstMismatch ? [session.firstMismatch] : []), ...failures]);
        return { completed: false, failed: true, branches: [] };
    }
    return { completed: false, branches: nextBranches };
}
async function runMoveDebugUnitActionsForBranches(branches, teamId, session, label) {
    let active = branches;
    for (let guard = 0; guard < 300; guard++) {
        const next = [];
        let anyAction = false;
        for (const branch of active) {
            const result = await expandMoveDebugUnitActionBranch(branch, teamId, session, label);
            if (result.failed)
                continue;
            if (result.completed) {
                next.push(...result.branches);
            }
            else {
                anyAction = true;
                next.push(...result.branches);
            }
        }
        active = sortAndLimitMoveDebugBranches(next, session);
        if (active.length === 0)
            return [];
        if (!anyAction)
            return active;
    }
    session.firstMismatch = session.firstMismatch || { stepIndex: 300, label, reason: '单位行动步数超过上限' };
    return [];
}
function buildMoveDebugRecruitPlanVariants(selection, targetSnapshot) {
    if (!selection || !selection.plan || !selection.plan.placement)
        return [];
    const basePlan = JSON.parse(JSON.stringify(selection.plan));
    const row = basePlan.placement.row;
    const col = basePlan.placement.col;
    const cell = appData.gridData[row]?.[col];
    const unit = getUnitDefinition(basePlan.unitId);
    if (!cell || !unit)
        return [basePlan];
    const snapshot = snapshotCellForMove(row, col);
    setCellUnit(cell, basePlan.unitId, basePlan.teamId, 0);
    const unitAction = { row, col, unit };
    const candidates = getMoveDebugTopCandidates(row, col);
    const ranked = rankMoveDebugCandidates(unitAction, candidates, targetSnapshot);
    restoreCellFromMoveSnapshot(row, col, snapshot);
    const variants = (ranked.length > 0 ? ranked.map(item => item.candidate) : candidates).map(candidate => {
        const plan = JSON.parse(JSON.stringify(basePlan));
        plan.placement.candidate = candidate;
        return plan;
    });
    return variants.length > 0 ? variants : [basePlan];
}
async function expandMoveDebugRecruitBranch(branch, teamId, session) {
    restoreMoveDebugBranch(branch);
    const selection = chooseDemoRecruitPlan(teamId);
    if (!selection.plan)
        return { completed: true, branches: [branch] };
    const plans = buildMoveDebugRecruitPlanVariants(selection, session.targetSnapshot);
    const team = appData.teams.find(t => t.id === teamId);
    const nextBranches = [];
    const failures = [];
    for (const plan of plans) {
        restoreMoveDebugBranch(branch);
        const unit = getUnitDefinition(plan.unitId);
        const before = cloneMoveDebugState();
        const executed = await executeDemoRecruitPlan(plan, appData.demoTeamLoopToken);
        const after = cloneMoveDebugState();
        const step = {
            index: branch.steps.length,
            label: `${team ? team.name : teamId} 招募并行动：${unit ? unit.name : plan.unitId}`,
            unitAction: null,
            candidate: plan && plan.placement ? JSON.parse(JSON.stringify(plan.placement.candidate)) : null,
            recruitPlan: JSON.parse(JSON.stringify(plan)),
            before,
            after,
            executed
        };
        if (!executed) {
            failures.push(getMoveDebugBranchFailure(branch, step, '招募候选执行失败'));
            continue;
        }
        nextBranches.push(captureMoveDebugBranch(branch, {
            id: `${branch.id}.r${nextBranches.length}`,
            steps: [...branch.steps, step],
            score: (branch.score || 0) + 500,
            failures: branch.failures || []
        }));
    }
    if (nextBranches.length === 0 && failures.length > 0) {
        session.firstMismatch = chooseMoveDebugFirstMismatch([...(session.firstMismatch ? [session.firstMismatch] : []), ...failures]);
        return { completed: false, failed: true, branches: [] };
    }
    return { completed: false, branches: nextBranches };
}
async function runMoveDebugRecruitmentForBranches(branches, teamId, session) {
    let active = branches;
    for (let guard = 0; guard < 100; guard++) {
        const recruited = [];
        let anyRecruit = false;
        for (const branch of active) {
            const result = await expandMoveDebugRecruitBranch(branch, teamId, session);
            if (result.failed)
                continue;
            if (result.completed) {
                recruited.push(...result.branches);
            }
            else {
                anyRecruit = true;
                recruited.push(...result.branches);
            }
        }
        active = sortAndLimitMoveDebugBranches(recruited, session);
        if (active.length === 0)
            return [];
        if (!anyRecruit)
            return active;
        active = await runMoveDebugUnitActionsForBranches(active, teamId, session, '招募后行动');
        if (active.length === 0)
            return [];
    }
    session.firstMismatch = session.firstMismatch || { stepIndex: 100, label: '招募阶段', reason: '招募步数超过上限' };
    return [];
}
async function runMoveDebugTeamActions(teamId, branches, session, options = {}) {
    const team = appData.teams.find(t => t.id === teamId);
    let active = [];
    for (const branch of branches) {
        restoreMoveDebugBranch(branch);
        if (options.previousTeamId) {
            settleDemoTeamTurnEnd(options.previousTeamId);
        }
        appData.demoTeamTurn = createMoveDebugTurn(teamId);
        appData.demoEnemyMovementBlocking = true;
        let steps = branch.steps;
        if (!options.skipTurnStart) {
            const turnStartBefore = cloneMoveDebugState();
            const turnStart = settleDemoTeamTurnStart(teamId);
            appData.demoTeamTurn.turnStart = turnStart;
            steps = [...steps, {
                    index: steps.length,
                    label: `${team ? team.name : teamId} 回合开始`,
                    unitAction: null,
                    candidate: null,
                    before: turnStartBefore,
                    after: cloneMoveDebugState(),
                    executed: true
                }];
        }
        active.push(captureMoveDebugBranch(branch, {
            id: branch.id,
            steps,
            score: branch.score || 0,
            failures: branch.failures || []
        }));
    }
    active = await runMoveDebugUnitActionsForBranches(active, teamId, session, '单位行动');
    if (active.length === 0)
        return [];
    for (const branch of active) {
        branch.turn.phase = 'recruitment';
    }
    active = await runMoveDebugRecruitmentForBranches(active, teamId, session);
    for (const branch of active) {
        branch.turn.running = false;
    }
    appData.demoEnemyMovementBlocking = false;
    return active;
}
async function runMoveDebugAllianceActions(teamIds, session) {
    let branches = [{
            id: 'b0',
            state: cloneMoveDebugState(),
            turn: null,
            steps: [],
            score: 0,
            failures: []
        }];
    session.firstMismatch = null;
    session.prunedBranchCount = 0;
    for (let index = 0; index < teamIds.length; index++) {
        branches = await runMoveDebugTeamActions(teamIds[index], branches, session, {
            skipTurnStart: index === 0,
            previousTeamId: index > 0 ? teamIds[index - 1] : null
        });
        branches = sortAndLimitMoveDebugBranches(branches, session);
        if (branches.length === 0)
            break;
    }
    return branches;
}
function chooseMoveDebugFirstMismatch(failures) {
    return (failures || [])
        .filter(Boolean)
        .sort((a, b) => (a.stepIndex || 0) - (b.stepIndex || 0))[0] || null;
}
function formatMoveDebugFirstMismatch(mismatch) {
    if (!mismatch)
        return '';
    const actionText = mismatch.unitAction && mismatch.candidate
        ? formatDemoCandidate(mismatch.unitAction, mismatch.candidate)
        : (mismatch.label || '未知步骤');
    return `<div class="mt-2 text-red-600">首次不一致：${actionText}<br>${mismatch.reason || '未找到可匹配分支'}</div>`;
}
async function startMoveModeDebug() {
    const session = appData.moveDebugSession;
    if (!session || !session.targetSnapshot) {
        alert('请先上传AI队伍结束后的目标布局');
        return;
    }
    const startTeamId = ensureMoveModeCurrentTeam();
    const team = appData.teams.find(item => item.id === startTeamId);
    if (!team || !isAiPlayerType(team.playerType)) {
        alert('当前行棋队伍不是AI队伍，无法从此处调试联盟');
        return;
    }
    const teamSequence = getDemoAllianceTeamSequence(startTeamId, 'stop');
    if (teamSequence.length === 0) {
        alert('从当前队伍开始没有可调试的AI队伍');
        return;
    }
    stopMoveDebugPlayback(false);
    session.teamId = startTeamId;
    session.teamSequence = [...teamSequence];
    session.teamSequenceNames = teamSequence.map(teamId => appData.teams.find(item => item.id === teamId)?.name || teamId);
    session.initialSnapshot = cloneMoveDebugState();
    session.steps = [];
    session.diffs = [];
    session.playbackIndex = -1;
    if (elements.moveDebugStatus)
        elements.moveDebugStatus.textContent = `正在调试联盟：${session.teamSequenceNames.join(' → ')}...`;
    if (elements.startMoveDebugBtn)
        elements.startMoveDebugBtn.disabled = true;
    const branches = await runMoveDebugAllianceActions(teamSequence, session);
    const evaluated = branches.map(branch => {
        const diffs = compareMoveDebugAllianceResult(session.initialSnapshot, branch.state, session.targetSnapshot, teamSequence);
        return { branch, diffs };
    }).sort((a, b) => a.diffs.length - b.diffs.length || (b.branch.score || 0) - (a.branch.score || 0));
    const chosen = evaluated[0] || null;
    if (chosen) {
        session.steps = chosen.branch.steps || [];
        session.actualSnapshot = chosen.branch.state;
        session.diffs = chosen.diffs;
        session.branchCount = branches.length;
        session.firstMismatch = chosen.diffs.length === 0 ? null : (session.firstMismatch || chooseMoveDebugFirstMismatch(chosen.branch.failures));
        restoreMoveDebugState(session.actualSnapshot);
    }
    else {
        session.actualSnapshot = cloneMoveDebugState();
        session.diffs = [{
                identity: { row: null, col: null, teamId: startTeamId, unit: 'debug' },
                teamName: team ? team.name : startTeamId,
                unitName: '调试分支',
                actualPos: null,
                targetPos: null,
                details: [session.firstMismatch ? session.firstMismatch.reason : '不存在一种匹配的结果']
            }];
    }
    appData.moveDebugSession = session;
    const statusSuffix = session.branchCount ? `，保留分支 ${session.branchCount} 条` : '';
    if (elements.moveDebugStatus)
        elements.moveDebugStatus.textContent = `联盟调试完成：${session.teamSequenceNames.join(' → ')}，差异 ${session.diffs.length} 项${statusSuffix}`;
    if (elements.startMoveDebugBtn)
        elements.startMoveDebugBtn.disabled = false;
    updateMoveDebugPlaybackButtons();
    renderMoveDebugResults();
}
function playMoveDebugStep(index) {
    const session = appData.moveDebugSession;
    if (!session || !session.steps || session.steps.length === 0)
        return;
    const bounded = Math.max(0, Math.min(index, session.steps.length - 1));
    session.playbackIndex = bounded;
    restoreMoveDebugState(session.steps[bounded].after);
    const step = session.steps[bounded];
    if (elements.moveDebugStatus) {
        const stepText = step.unitAction && step.candidate ? formatDemoCandidate(step.unitAction, step.candidate) : (step.label || '状态变化');
        elements.moveDebugStatus.textContent = `回放第 ${bounded + 1}/${session.steps.length} 步：${stepText}`;
    }
    updateMoveDebugPlaybackButtons();
}
function stepMoveDebugPlayback(offset) {
    const session = appData.moveDebugSession;
    if (!session || !session.steps || session.steps.length === 0)
        return;
    const current = session.playbackIndex < 0 ? 0 : session.playbackIndex;
    playMoveDebugStep(current + offset);
}
function stopMoveDebugPlayback(restoreActual = true) {
    const session = appData.moveDebugSession;
    if (!session)
        return;
    if (session.playbackTimer) {
        clearInterval(session.playbackTimer);
        session.playbackTimer = null;
    }
    if (restoreActual && session.actualSnapshot) {
        restoreMoveDebugState(session.actualSnapshot);
        if (elements.moveDebugStatus) {
            const scope = session.teamSequenceNames ? session.teamSequenceNames.join(' → ') : 'AI联盟';
            elements.moveDebugStatus.textContent = `已停止回放，显示${scope}调试后的结果布局`;
        }
    }
    updateMoveDebugPlaybackButtons();
}
function playMoveDebugPlayback() {
    const session = appData.moveDebugSession;
    if (!session || !session.steps || session.steps.length === 0)
        return;
    stopMoveDebugPlayback(false);
    let index = session.playbackIndex < 0 ? 0 : session.playbackIndex;
    playMoveDebugStep(index);
    session.playbackTimer = setInterval(() => {
        index++;
        if (index >= session.steps.length) {
            stopMoveDebugPlayback(true);
            return;
        }
        playMoveDebugStep(index);
    }, 650);
    updateMoveDebugPlaybackButtons();
}
function playMoveDebugUnitTrace(diffIndex) {
    const session = appData.moveDebugSession;
    if (!session || !session.diffs || !session.steps)
        return;
    const diff = session.diffs[diffIndex];
    if (!diff)
        return;
    if (diff.identity.row === null) {
        if (elements.moveDebugStatus)
            elements.moveDebugStatus.textContent = '该项是招募/数量差异，没有单个初始单位可播放';
        return;
    }
    const stepIndex = session.steps.findIndex(step => step.unitAction
        && step.unitAction.row === diff.identity.row
        && step.unitAction.col === diff.identity.col
        && step.unitAction.unit
        && step.unitAction.unit.id === diff.identity.unit);
    if (stepIndex < 0) {
        if (elements.moveDebugStatus)
            elements.moveDebugStatus.textContent = '未找到该单位的行动步骤，可能单位未行动或已在此前死亡';
        return;
    }
    stopMoveDebugPlayback(false);
    const step = session.steps[stepIndex];
    restoreMoveDebugState(step.before);
    if (elements.moveDebugStatus)
        elements.moveDebugStatus.textContent = `播放单位行动前：${diff.unitName} 初始${formatMoveDebugCell(diff.identity)}`;
    setTimeout(() => {
        restoreMoveDebugState(step.after);
        if (elements.moveDebugStatus)
            elements.moveDebugStatus.textContent = `播放单位待机后：${formatDemoCandidate(step.unitAction, step.candidate)}`;
        session.playbackIndex = stepIndex;
        updateMoveDebugPlaybackButtons();
    }, 700);
}
function cloneMoveDebugJson(value) {
    return JSON.parse(JSON.stringify(value));
}
function normalizeReplayCoord(point) {
    if (!point)
        return null;
    if (Number.isFinite(Number(point.y)) && Number.isFinite(Number(point.x))) {
        return { row: Number(point.y), col: Number(point.x) };
    }
    if (Number.isFinite(Number(point.r)) && Number.isFinite(Number(point.c))) {
        return { row: Number(point.r) - 1, col: Number(point.c) - 1 };
    }
    return null;
}
function sameMoveDebugCoord(a, b) {
    if (!a || !b)
        return !a && !b;
    return a.row === b.row && a.col === b.col;
}
function formatMoveDebugCoord(coord) {
    return coord ? `(${coord.row + 1},${coord.col + 1})` : '无';
}
function parseMoveDebugReplay(data) {
    if (!data || !Array.isArray(data.actions)) {
        return { error: '不是有效的 online-actions 回放记录：缺少 actions 数组' };
    }
    const actions = data.actions.map((action, fallbackIndex) => ({
        ...action,
        index: Number.isFinite(Number(action.index)) ? Number(action.index) : fallbackIndex,
        fromCoord: normalizeReplayCoord(action.from),
        moveToCoord: normalizeReplayCoord(action.moveTo),
        targetCoord: normalizeReplayCoord(action.target),
        secondMoveToCoord: normalizeReplayCoord(action.secondMoveTo)
    }));
    const segments = [];
    let current = [];
    actions.forEach(action => {
        if (action.type === 'NEXT_TURN' || action.type === 'SURRENDER') {
            if (action.type === 'SURRENDER')
                current.push(action);
            segments.push({
                index: segments.length,
                actions: current,
                nextTurnIndex: action.index
            });
            current = [];
        }
        else {
            current.push(action);
        }
    });
    if (current.length > 0) {
        segments.push({
            index: segments.length,
            actions: current,
            nextTurnIndex: null
        });
    }
    return { actions, segments };
}
function getMoveDebugTeamPresence(teamId, snapshot = null) {
    const gridData = snapshot && snapshot.gridData ? snapshot.gridData : appData.gridData;
    const presence = { units: 0, castles: 0 };
    for (let i = 0; i < gridData.length; i++) {
        for (let j = 0; j < (gridData[i] || []).length; j++) {
            const cell = gridData[i][j];
            if (!cell)
                continue;
            if (cell.unit && cell.unitTeam === teamId)
                presence.units++;
            if (cell.terrain === 'castle' && cell.terrainTeam === teamId)
                presence.castles++;
        }
    }
    return presence;
}
function hasMoveDebugTeamAnyPresence(teamId, snapshot = null) {
    const presence = getMoveDebugTeamPresence(teamId, snapshot);
    return presence.units > 0 || presence.castles > 0;
}
function getNextMoveDebugRuntimeTeamId(currentTeamId) {
    const ordered = getOrderedTeams();
    if (ordered.length === 0)
        return null;
    const startIndex = ordered.findIndex(team => team.id === currentTeamId);
    for (let offset = 1; offset <= ordered.length; offset++) {
        const team = ordered[(startIndex + offset) % ordered.length];
        if (!team || team.playerType === 0)
            continue;
        if (hasMoveDebugTeamAnyPresence(team.id))
            return team.id;
    }
    return null;
}
function buildMoveDebugReplayTimeline(segments) {
    const ordered = getOrderedTeams().filter(team => team.playerType !== 0 && hasMoveDebugTeamAnyPresence(team.id));
    if (ordered.length === 0)
        return { error: '当前没有启用队伍' };
    let liveTeamIds = ordered.map(team => team.id);
    let round = 1;
    let teamIndex = 0;
    const timeline = [];
    for (const segment of segments) {
        if (liveTeamIds.length === 0)
            break;
        if (teamIndex >= liveTeamIds.length)
            teamIndex = 0;
        const teamId = liveTeamIds[teamIndex];
        timeline.push({
            ...segment,
            round,
            teamId
        });
        const hasSurrender = segment.actions.some(action => action.type === 'SURRENDER');
        if (hasSurrender) {
            liveTeamIds = liveTeamIds.filter(id => id !== teamId);
            if (liveTeamIds.length === 0)
                break;
            if (teamIndex >= liveTeamIds.length) {
                teamIndex = 0;
                round++;
            }
        }
        else {
            teamIndex++;
            if (teamIndex >= liveTeamIds.length) {
                teamIndex = 0;
                round++;
            }
        }
    }
    return { timeline };
}
function getMoveDebugCurrentRound() {
    return elements.moveModeRoundInput ? Math.max(1, parseInt(elements.moveModeRoundInput.value) || 1) : 1;
}
function locateMoveDebugReplayStart(session) {
    const currentTeamId = ensureMoveModeCurrentTeam();
    const currentRound = getMoveDebugCurrentRound();
    const team = appData.teams.find(item => item.id === currentTeamId);
    if (!team)
        return { error: '当前无行棋队伍' };
    if (!isAiPlayerType(team.playerType))
        return { error: `当前行棋队伍 ${team.name} 不是AI队伍` };
    const match = (session.timeline || []).find(segment => segment.round === currentRound && segment.teamId === currentTeamId);
    if (!match) {
        return { error: `回放中找不到第 ${currentRound} 轮 ${team.name} 的行动段` };
    }
    return { startSegmentIndex: match.index, currentTeamId, currentRound };
}
function getMoveDebugReplayActionName(action) {
    if (!action)
        return '未知';
    if (action.type === 'NONE')
        return '招募';
    return {
        ATTACK: '攻击',
        HEAL: '治疗',
        SUPPORT: '支援',
        SUMMON: '召唤',
        OCCUPY: '占领',
        REPAIR: '修复',
        STANDBY: '待机',
        SURRENDER: '投降'
    }[action.type] || action.type;
}
function formatMoveDebugReplayActualChoice(action, team = null, cell = null) {
    if (!action)
        return '';
    const teamName = team ? team.name : '未知队伍';
    const from = action.fromCoord;
    const rowText = from ? `第${from.row + 1}行第${from.col + 1}列` : '未知位置';
    if (action.type === 'NONE') {
        const unitId = getMoveDebugReplayRecruitUnitId(action);
        const unit = unitId ? getUnitDefinition(unitId) : null;
        return `${teamName}${rowText}实际选择：招募${unit ? unit.name : (unitId || action.recruitType || action.recruitUnitId || '未知单位')}`;
    }
    const unit = cell && cell.unit ? getUnitDefinition(cell.unit) : null;
    const unitName = unit ? unit.name : (cell && cell.unit ? cell.unit : '未知单位');
    const parts = [
        `${teamName}${rowText}的${unitName}实际选择：${getMoveDebugReplayActionName(action)}`
    ];
    if (action.moveToCoord)
        parts.push(`移动到${formatMoveDebugCoord(action.moveToCoord)}`);
    if (action.targetCoord)
        parts.push(`目标${formatMoveDebugCoord(action.targetCoord)}`);
    if (action.secondMoveToCoord)
        parts.push(`二次移动到${formatMoveDebugCoord(action.secondMoveToCoord)}`);
    return parts.join('，');
}
function getMoveDebugReplayRecruitUnitId(action) {
    if (!action || action.type !== 'NONE')
        return null;
    const rawId = Number.isFinite(Number(action.recruitUnitId)) ? Number(action.recruitUnitId) : Number(action.raw?.i);
    if (Number.isFinite(rawId) && rawId >= 0 && AEM_TO_UNIT_ID[rawId])
        return AEM_TO_UNIT_ID[rawId];
    if (action.recruitType && appData.units.some(unit => unit.id === action.recruitType))
        return action.recruitType;
    return null;
}
function replayActionTypeToCandidateType(action) {
    return {
        ATTACK: 'attack',
        HEAL: 'heal',
        SUPPORT: 'support',
        SUMMON: 'summon',
        OCCUPY: 'occupy',
        REPAIR: 'repair',
        STANDBY: 'wait'
    }[action.type] || null;
}
function getMoveDebugTargetScoreForCoord(unitAction, candidate, targetCoord) {
    if (!unitAction || !candidate || !targetCoord)
        return null;
    const key = targetCoord.row + ',' + targetCoord.col;
    if (candidate.actionType === 'attack') {
        const entry = safeCalculateScoreList(calculateAttackScores, unitAction.row, unitAction.col)
            .find(score => score.row === candidate.row && score.col === candidate.col);
        const target = entry && entry.targets ? entry.targets.find(item => item.row === targetCoord.row && item.col === targetCoord.col) : null;
        return target ? target.score : null;
    }
    if (candidate.actionType === 'heal') {
        const scoreMap = buildScoreMap(safeCalculateScoreList(calculateHealScores, unitAction.row, unitAction.col));
        const score = scoreMap.get(key);
        return score
            ? (score.value || 0) + getSameTypeStationaryHealPenalty(appData.gridData[unitAction.row]?.[unitAction.col]?.unit, unitAction.row, unitAction.col, candidate.row, candidate.col, targetCoord.row, targetCoord.col)
            : null;
    }
    if (candidate.actionType === 'support') {
        const scoreMap = buildScoreMap(safeCalculateScoreList(calculateSupportScores, unitAction.row, unitAction.col));
        const score = scoreMap.get(key);
        return score ? score.value : null;
    }
    if (candidate.actionType === 'summon') {
        return 100;
    }
    return null;
}
function getMoveDebugReplayTargetScore(unitAction, candidate, action) {
    return getMoveDebugTargetScoreForCoord(unitAction, candidate, action ? action.targetCoord : null);
}
function expandMoveDebugCandidateTargetVariants(candidate, unitAction) {
    if (!candidate)
        return [];
    if (!candidate.target || !Array.isArray(candidate.targets) || candidate.targets.length === 0) {
        return [candidate];
    }
    const variants = [];
    candidate.targets.forEach(target => {
        const score = getMoveDebugTargetScoreForCoord(unitAction, candidate, target);
        if (score === null || score !== candidate.operationScore)
            return;
        const variant = cloneMoveDebugJson(candidate);
        variant.target = {
            ...cloneMoveDebugJson(target),
            score
        };
        variant.preview = `移动到(${variant.row + 1},${variant.col + 1})后${variant.actionTypeName}`;
        variants.push(variant);
    });
    if (variants.length === 0)
        return [candidate];
    return variants;
}
function getMoveDebugReplayMatchedCandidate(candidate, action, unitAction = null) {
    if (!candidate || !action)
        return null;
    const expectedActionType = replayActionTypeToCandidateType(action);
    if (!expectedActionType || candidate.actionType !== expectedActionType)
        return null;
    const moveTo = action.moveToCoord || action.fromCoord;
    if (!sameMoveDebugCoord({ row: candidate.row, col: candidate.col }, moveTo))
        return null;
    const matchedCandidate = cloneMoveDebugJson(candidate);
    if (candidate.target) {
        if (!sameMoveDebugCoord(candidate.target, action.targetCoord)) {
            const legalReplayTarget = Array.isArray(candidate.targets)
                && action.targetCoord
                && candidate.targets.some(target => target.row === action.targetCoord.row && target.col === action.targetCoord.col);
            const replayTargetScore = legalReplayTarget
                ? getMoveDebugReplayTargetScore(unitAction, candidate, action)
                : null;
            if (replayTargetScore === null || replayTargetScore !== candidate.operationScore)
                return null;
            const legalTarget = candidate.targets.find(target => target.row === action.targetCoord.row && target.col === action.targetCoord.col);
            matchedCandidate.target = {
                ...cloneMoveDebugJson(legalTarget),
                score: replayTargetScore
            };
            matchedCandidate.preview = `移动到(${candidate.row + 1},${candidate.col + 1})后${candidate.actionTypeName}`;
        }
    }
    else if (action.targetCoord) {
        return null;
    }
    if (action.secondMoveToCoord && candidate.actionType !== 'attack')
        return null;
    return matchedCandidate;
}
function calculateMoveDebugMovementScoresExhaustive(row, col, options = {}) {
    const allPotentialTargets = calculatePotentialMoveTargets(row, col, { origin: { row, col } });
    const buildingTargets = allPotentialTargets.filter(isPotentialBuildingTarget);
    const potentialTargetVariants = buildingTargets.length > 0
        ? [choosePotentialAttackTarget(buildingTargets)].filter(Boolean)
        : (allPotentialTargets.length > 0 ? allPotentialTargets : [null]);
    const results = [];
    const seen = new Set();
    potentialTargetVariants.forEach(target => {
        const movementOptions = {
            ...(options.movementOptions || {}),
            ...(target ? { potentialTargetOverride: target } : {})
        };
        let scores = [];
        try {
            const result = calculateMovementScores(row, col, movementOptions);
            scores = Array.isArray(result) ? result : [];
        }
        catch (error) {
            console.warn('评分计算失败，已按0分继续:', error);
        }
        scores.forEach(score => {
            const key = [
                score.row,
                score.col,
                score.value,
                target ? target.row : '',
                target ? target.col : '',
                target ? target.targetType || '' : ''
            ].join('|');
            if (seen.has(key))
                return;
            seen.add(key);
            results.push({
                ...score,
                potentialTarget: target ? cloneMoveDebugJson(target) : null,
                debugPotentialTarget: target ? cloneMoveDebugJson(target) : null
            });
        });
    });
    return results;
}
function calculateMoveDebugTotalScoresExhaustive(row, col, options = {}) {
    const cell = appData.gridData[row]?.[col];
    if (!cell || !cell.unit || cell.unitStandby)
        return [];
    const unit = appData.units.find(u => u.id === cell.unit);
    const unitTeam = appData.teams.find(t => t.id === cell.unitTeam);
    if (!unit || !unitTeam)
        return [];
    const movementScores = calculateMoveDebugMovementScoresExhaustive(row, col, options);
    const hiddenOriginCell = options.movementOptions ? options.movementOptions.hiddenOriginCell : null;
    const results = [];
    movementScores.forEach(moveScore => {
        if (options.excludeOrigin && moveScore.row === row && moveScore.col === col)
            return;
        if (!canStandOnMovementTarget(moveScore.row, moveScore.col, row, col))
            return;
        results.push(createDemoCandidate(row, col, moveScore, 'wait', 0));
        moveUnitForEvaluation(row, col, moveScore.row, moveScore.col, () => {
            const movedCell = appData.gridData[moveScore.row]?.[moveScore.col];
            const movedUnit = movedCell && movedCell.unit ? appData.units.find(u => u.id === movedCell.unit) : null;
            if (!movedUnit)
                return;
            const attackTargets = calculateAttackTargets(moveScore.row, moveScore.col);
            if (attackTargets.length > 0) {
                const attackEntry = buildScoreMap(safeCalculateScoreList(calculateAttackScores, moveScore.row, moveScore.col))
                    .get(moveScore.row + ',' + moveScore.col);
                attackTargets.forEach(target => {
                    const scored = attackEntry && attackEntry.targets
                        ? attackEntry.targets.find(item => item.row === target.row && item.col === target.col)
                        : null;
                    const operationScore = scored ? scored.score : 0;
                    results.push(createDemoCandidate(row, col, moveScore, 'attack', operationScore, {
                        ...target,
                        score: operationScore
                    }, {
                        targets: attackTargets
                    }));
                });
            }
            const healTargets = (movedUnit.abilities || []).includes('治疗') ? calculateHealTargets(moveScore.row, moveScore.col) : [];
            if (healTargets.length > 0) {
                const movedHealScoreMap = buildScoreMap(safeCalculateScoreList(calculateHealScores, moveScore.row, moveScore.col));
                healTargets.forEach(target => {
                    const operationScore = ((movedHealScoreMap.get(target.row + ',' + target.col)?.value) || 0)
                        + getSameTypeStationaryHealPenalty(unit.id, row, col, moveScore.row, moveScore.col, target.row, target.col);
                    results.push(createDemoCandidate(row, col, moveScore, 'heal', operationScore, {
                        ...target,
                        score: operationScore
                    }, {
                        targets: healTargets
                    }));
                });
            }
            const supportTargets = (movedUnit.abilities || []).includes('支援') ? calculateSupportTargets(moveScore.row, moveScore.col) : [];
            if (supportTargets.length > 0) {
                const movedSupportScoreMap = buildScoreMap(safeCalculateScoreList(calculateSupportScores, moveScore.row, moveScore.col));
                supportTargets.forEach(target => {
                    const operationScore = (movedSupportScoreMap.get(target.row + ',' + target.col)?.value) || 0;
                    results.push(createDemoCandidate(row, col, moveScore, 'support', operationScore, {
                        ...target,
                        score: operationScore
                    }, {
                        targets: supportTargets
                    }));
                });
            }
            const summonTargets = (movedUnit.abilities || []).includes('召唤') ? calculateSummonTargets(moveScore.row, moveScore.col) : [];
            if (summonTargets.length > 0) {
                summonTargets.forEach(target => {
                    results.push(createDemoCandidate(row, col, moveScore, 'summon', 100, {
                        ...target,
                        score: 100
                    }, {
                        targets: summonTargets
                    }));
                });
            }
            const occupyScore = getOccupyScoreForCell(moveScore.row, moveScore.col, movedUnit, unitTeam);
            if (occupyScore !== null) {
                results.push(createDemoCandidate(row, col, moveScore, 'occupy', occupyScore));
            }
            const repairScore = getRepairScoreForCell(moveScore.row, moveScore.col, movedUnit, unitTeam.id);
            if (repairScore !== null) {
                results.push(createDemoCandidate(row, col, moveScore, 'repair', repairScore));
            }
        }, {
            hiddenOriginCell
        });
    });
    return results;
}
function getMoveDebugPotentialTargetKey(candidate) {
    const target = candidate ? (candidate.debugPotentialTarget || candidate.potentialTarget || null) : null;
    if (!target)
        return 'none';
    return [
        target.row,
        target.col,
        target.targetType || '',
        target.unit || '',
        target.unitTeam || ''
    ].join('|');
}
function getMoveDebugBestCandidates(row, col, options = {}) {
    const candidates = calculateMoveDebugTotalScoresExhaustive(row, col, options);
    if (candidates.length === 0)
        return [];
    const branchMap = new Map();
    candidates.forEach(candidate => {
        const key = getMoveDebugPotentialTargetKey(candidate);
        if (!branchMap.has(key))
            branchMap.set(key, []);
        branchMap.get(key).push(candidate);
    });
    const bestCandidates = [];
    branchMap.forEach(branchCandidates => {
        const bestValue = Math.max(...branchCandidates.map(candidate => Number(candidate.value) || 0));
        branchCandidates
            .filter(candidate => (Number(candidate.value) || 0) === bestValue)
            .forEach(candidate => bestCandidates.push(candidate));
    });
    return bestCandidates.map(candidate => cloneMoveDebugJson(candidate));
}
function getMoveDebugLegalCandidates(row, col, options = {}) {
    return calculateMoveDebugTotalScoresExhaustive(row, col, options)
        .map(candidate => cloneMoveDebugJson(candidate));
}
function getMoveDebugPendingCommanderScoreOptions(session, unitTraceId) {
    const pending = session ? session.pendingCommanderRestore : null;
    if (!pending || !unitTraceId || pending.unitTraceId !== unitTraceId)
        return {};
    return {
        excludeOrigin: true,
        movementOptions: {
            hiddenOriginCell: pending.snapshot
        }
    };
}
function findMoveDebugReplayCandidate(unitAction, action, session = null, options = {}) {
    const scoreOptions = getMoveDebugPendingCommanderScoreOptions(session, unitAction.unitTraceId);
    const candidates = (options.legalOnly
        ? getMoveDebugLegalCandidates(unitAction.row, unitAction.col, scoreOptions)
        : getMoveDebugBestCandidates(unitAction.row, unitAction.col, scoreOptions))
        .flatMap(candidate => expandMoveDebugCandidateTargetVariants(candidate, unitAction));
    const matched = candidates
        .map(candidate => getMoveDebugReplayMatchedCandidate(candidate, action, unitAction))
        .filter(Boolean);
    return {
        candidate: matched[0] || null,
        bestCandidates: candidates,
        candidates,
        legalOnly: !!options.legalOnly,
        matchedCount: matched.length,
        matchedCandidates: matched
    };
}
function getMoveDebugCellTraceId(snapshot, row, col) {
    return snapshot && snapshot.gridData?.[row]?.[col]?.unitTraceId || null;
}
function collectMoveDebugActionTraceIds(before, after, action, unitAction, candidate) {
    const ids = new Set();
    const ownBefore = getMoveDebugCellTraceId(before, unitAction.row, unitAction.col);
    if (ownBefore)
        ids.add(ownBefore);
    if (candidate && candidate.target) {
        const targetBefore = getMoveDebugCellTraceId(before, candidate.target.row, candidate.target.col);
        const targetAfter = getMoveDebugCellTraceId(after, candidate.target.row, candidate.target.col);
        if (targetBefore)
            ids.add(targetBefore);
        if (targetAfter)
            ids.add(targetAfter);
    }
    const moveTo = action ? (action.secondMoveToCoord || action.moveToCoord || action.fromCoord) : null;
    if (moveTo) {
        const movedAfter = getMoveDebugCellTraceId(after, moveTo.row, moveTo.col);
        if (movedAfter)
            ids.add(movedAfter);
    }
    return [...ids];
}
function executeMoveDebugRecruitOnly(plan) {
    if (!plan || !plan.teamId || !plan.unitId || !plan.placement)
        return { ok: false, reason: '没有可执行的招募计划' };
    const unit = getUnitDefinition(plan.unitId);
    if (!unit)
        return { ok: false, reason: `未知招募单位 ${plan.unitId}` };
    const cost = getRecruitCost(plan.unitId, plan.teamId);
    const gold = getTeamGold(plan.teamId);
    if (gold < cost)
        return { ok: false, reason: `${unit.name} 招募金币不足` };
    if (wouldExceedTeamPopulationLimit(plan.teamId, plan.unitId))
        return { ok: false, reason: `${unit.name} 招募会超人口` };
    const placementCell = appData.gridData[plan.placement.row]?.[plan.placement.col];
    if (!placementCell)
        return { ok: false, reason: '招募落点不存在' };
    if (placementCell.unit && !(plan.castle && plan.castle.occupiedByCommander)) {
        return { ok: false, reason: `招募落点 ${formatMoveDebugCoord(plan.placement)} 已有单位` };
    }
    const commanderCastleSnapshot = plan.castle && plan.castle.occupiedByCommander
        ? snapshotCellForMove(plan.castle.row, plan.castle.col)
        : null;
    setTeamGold(plan.teamId, gold - cost);
    setCellUnit(placementCell, plan.unitId, plan.teamId, 0);
    appData.currentMoveTeam = plan.teamId;
    appData.selectedCell = { row: plan.placement.row, col: plan.placement.col };
    clearCurrentMoveAction();
    return { ok: true, commanderCastleSnapshot };
}
function restoreMoveDebugPendingCommanderIfNeeded(session, unitTraceId, options = {}) {
    const pending = session ? session.pendingCommanderRestore : null;
    if (!pending || !unitTraceId || pending.unitTraceId !== unitTraceId)
        return false;
    restoreCellFromMoveSnapshot(pending.row, pending.col, pending.snapshot);
    if (options.clear !== false)
        session.pendingCommanderRestore = null;
    return true;
}
function getMoveDebugPotentialTargetVariantsForPosition(row, col, origin, ignoreAssaultSnapshot = false) {
    const allPotentialTargets = calculatePotentialMoveTargets(row, col, {
        origin: origin || { row, col },
        ignoreAssaultSnapshot
    });
    const buildingTargets = allPotentialTargets.filter(isPotentialBuildingTarget);
    if (buildingTargets.length > 0)
        return [choosePotentialAttackTarget(buildingTargets)].filter(Boolean);
    return allPotentialTargets.length > 0 ? allPotentialTargets : [null];
}
function getMoveDebugAssaultBestMovesByPotentialTarget(row, col, remainingMove, assaultOrigin = null) {
    const currentAction = appData.currentMoveAction;
    const scores = getAssaultPostAttackMovementScores(row, col, remainingMove, assaultOrigin)
        .map(score => ({
        ...score,
        potentialTarget: currentAction && currentAction.assaultPotentialTarget
            ? cloneMoveDebugJson(currentAction.assaultPotentialTarget)
            : null,
        debugPotentialTarget: currentAction && currentAction.assaultPotentialTarget
            ? cloneMoveDebugJson(currentAction.assaultPotentialTarget)
            : null
    }));
    if (scores.length === 0)
        return [];
    const bestValue = Math.max(...scores.map(item => Number(item.value) || 0));
    return scores.filter(item => (Number(item.value) || 0) === bestValue);
}
function validateAndApplyMoveDebugAssaultRemainder(action, options = {}) {
    const currentAction = appData.currentMoveAction;
    if (!currentAction || !currentAction.postAttackMoveOnly || !appData.selectedCell) {
        if (action.secondMoveToCoord)
            return { ok: false, reason: '回放存在二次移动，但当前单位没有二次移动阶段' };
        return { ok: true };
    }
    const { row, col } = appData.selectedCell;
    const allMoves = getAssaultPostAttackMovementScores(row, col, currentAction.remainingMove || 0, currentAction.assaultOrigin || null);
    const bestMoves = options.legalOnly
        ? allMoves
        : getMoveDebugAssaultBestMovesByPotentialTarget(row, col, currentAction.remainingMove || 0, currentAction.assaultOrigin || null);
    const desired = action.secondMoveToCoord || { row, col };
    const matched = bestMoves.find(item => item.row === desired.row && item.col === desired.col);
    if (!matched) {
        const bestText = bestMoves.slice(0, 8)
            .map(item => `${formatMoveDebugCoord(item)}=${item.value}`)
            .join('；');
        return {
            ok: false,
            reason: options.legalOnly
                ? `二次移动 ${formatMoveDebugCoord(desired)} 超出合法移动范围。合法落点：${bestText || '无'}`
                : `二次移动 ${formatMoveDebugCoord(desired)} 不属于最高分候选。最高候选：${bestText || '无'}`
        };
    }
    if (matched.debugPotentialTarget) {
        currentAction.assaultPotentialTarget = { ...matched.debugPotentialTarget };
    }
    if (desired.row !== row || desired.col !== col) {
        appData.currentMoveAction.allowMove = true;
        const moved = moveUnitForDemoAction(row, col, desired.row, desired.col, currentAction.remainingMove || 0);
        if (!moved)
            return { ok: false, reason: `二次移动到 ${formatMoveDebugCoord(desired)} 执行失败` };
    }
    if (appData.selectedCell)
        executeDemoWait(appData.selectedCell.row, appData.selectedCell.col);
    return { ok: true };
}
async function executeMoveDebugCandidateForced(unitAction, candidate, action, token, session = null, options = {}) {
    if (!unitAction || !candidate || !action)
        return { ok: false, reason: '缺少单位动作或候选' };
    appData.selectedCell = { row: unitAction.row, col: unitAction.col };
    if (!moveUnitForDemoAction(unitAction.row, unitAction.col, candidate.row, candidate.col, null, candidate)) {
        return { ok: false, reason: `移动到 ${formatMoveDebugCoord(candidate)} 失败` };
    }
    const restoredCommanderBeforeAction = restoreMoveDebugPendingCommanderIfNeeded(session, unitAction.unitTraceId, { clear: false });
    const selected = appData.selectedCell;
    if (!selected)
        return { ok: false, reason: '移动后未选中单位' };
    const { row, col } = selected;
    let executed = false;
    if (candidate.actionType === 'wait') {
        executed = executeDemoWait(row, col);
    }
    else if (candidate.actionType === 'attack') {
        appData.attackTargets = calculateAttackTargets(row, col);
        const target = appData.attackTargets.find(t => candidate.target && t.row === candidate.target.row && t.col === candidate.target.col);
        if (!target)
            return { ok: false, reason: '攻击目标执行时不可用' };
        appData.attackMode = true;
        executeAttack(target.row, target.col, target);
        executed = true;
        const assault = validateAndApplyMoveDebugAssaultRemainder(action, options);
        if (!assault.ok)
            return assault;
    }
    else if (candidate.actionType === 'heal') {
        appData.healTargets = calculateHealTargets(row, col);
        const target = appData.healTargets.find(t => candidate.target && t.row === candidate.target.row && t.col === candidate.target.col);
        if (!target)
            return { ok: false, reason: '治疗目标执行时不可用' };
        appData.healMode = true;
        executeHeal(target.row, target.col, target);
        executed = true;
    }
    else if (candidate.actionType === 'support') {
        appData.supportTargets = calculateSupportTargets(row, col);
        const target = appData.supportTargets.find(t => candidate.target && t.row === candidate.target.row && t.col === candidate.target.col);
        if (!target)
            return { ok: false, reason: '支援目标执行时不可用' };
        appData.supportMode = true;
        executeSupport(target.row, target.col, target);
        executed = true;
    }
    else if (candidate.actionType === 'summon') {
        appData.summonTargets = calculateSummonTargets(row, col);
        const target = appData.summonTargets.find(t => candidate.target && t.row === candidate.target.row && t.col === candidate.target.col);
        if (!target)
            return { ok: false, reason: '召唤目标执行时不可用' };
        appData.summonMode = true;
        executeSummon(target.row, target.col, target);
        executed = true;
    }
    else if (candidate.actionType === 'occupy') {
        executed = executeDemoOccupy(row, col);
    }
    else if (candidate.actionType === 'repair') {
        executed = executeDemoRepair(row, col);
    }
    if (!executed)
        return { ok: false, reason: '候选动作执行失败' };
    if (restoredCommanderBeforeAction && session)
        session.pendingCommanderRestore = null;
    return { ok: true, restoredCommanderBeforeAction };
}
async function executeMoveDebugCandidateForcedWithFallback(unitAction, candidateResult, action, token, session = null, options = {}) {
    const candidates = candidateResult && Array.isArray(candidateResult.matchedCandidates) && candidateResult.matchedCandidates.length > 0
        ? candidateResult.matchedCandidates
        : (candidateResult && candidateResult.candidate ? [candidateResult.candidate] : []);
    if (candidates.length === 0)
        return { ok: false, reason: '缺少可执行候选' };
    if (candidates.length === 1 || !action.secondMoveToCoord) {
        const single = await executeMoveDebugCandidateForced(unitAction, candidates[0], action, token, session, options);
        return { ...single, candidate: candidates[0] };
    }
    const baseState = cloneMoveDebugState();
    let lastFailure = null;
    for (const candidate of candidates) {
        restoreMoveDebugState(baseState);
        const result = await executeMoveDebugCandidateForced(unitAction, candidate, action, token, session, options);
        if (result.ok)
            return { ...result, candidate };
        lastFailure = { ...result, candidate };
    }
    restoreMoveDebugState(baseState);
    return lastFailure || { ok: false, reason: '没有候选能匹配二次移动' };
}
function createMoveDebugTurnForReplay(teamId) {
    return {
        teamId,
        phase: 'replay',
        skipAnimation: true,
        running: true,
        paused: false,
        stepOnce: false,
        loopActive: false,
        manualStep: false,
        preview: null,
        history: [],
        killsByUnit: {},
        turnStart: null,
        actionQueue: null,
        hardAiReservedBuildingTargets: [],
        hardAiBuildingAssignments: []
    };
}
function createMoveDebugFailure(action, message, extra = {}) {
    return {
        ok: false,
        actionIndex: action ? action.index : null,
        message,
        ...extra
    };
}
function createMoveDebugActionFailure(action, team, message, extra = {}, cell = null) {
    return createMoveDebugFailure(action, message, {
        actualChoice: formatMoveDebugReplayActualChoice(action, team, cell),
        ...extra
    });
}
function attachMoveDebugFailureContext(failure, context = {}) {
    if (!failure)
        return failure;
    const unitAction = context.unitAction || failure.unitAction || null;
    const snapshot = context.before || failure.before || null;
    let unitTraceId = context.unitTraceId || failure.unitTraceId || null;
    if (!unitTraceId && snapshot && unitAction) {
        unitTraceId = getMoveDebugCellTraceId(snapshot, unitAction.row, unitAction.col);
    }
    const affectedTraceIds = new Set(context.affectedTraceIds || failure.affectedTraceIds || []);
    if (unitTraceId)
        affectedTraceIds.add(unitTraceId);
    failure.before = snapshot || null;
    failure.unitAction = unitAction ? cloneDemoUnitActionForLog(unitAction) : (failure.unitAction || null);
    failure.unitTraceId = unitTraceId || null;
    failure.affectedTraceIds = [...affectedTraceIds];
    failure.label = context.label || failure.label || `不一致：${failure.message || ''}`;
    failure.type = failure.type || 'failure';
    return failure;
}
function matchMoveDebugRecruitPlanToReplay(plan, action, replayUnitId) {
    if (!plan)
        return false;
    if (plan.unitId !== replayUnitId)
        return false;
    if (action.fromCoord && plan.castle && !sameMoveDebugCoord(action.fromCoord, plan.castle))
        return false;
    return true;
}
function formatMoveDebugRecruitWeightAndCount(teamId, unitIds) {
    const weights = getCurrentRecruitmentWeights();
    const teamWeights = weights[teamId] || {};
    const info = calculateRecruitLimitInfo();
    const teamCounts = info.teamUnitCounts[teamId] || {};
    return [...new Set((unitIds || []).filter(Boolean))].map(unitId => {
        const unit = getUnitDefinition(unitId);
        const weight = Number(teamWeights[unitId]) || 0;
        const count = Number(teamCounts[unitId]) || 0;
        return `${unit ? unit.name : unitId}（${unitId}）：权重 ${weight}，已有 ${count}`;
    }).join('；');
}
function chooseMoveDebugLowWeightRecruitPlanForReplay(teamId, replayUnitId, action, weights) {
    if (hasHighWeightRecruitUnit(teamId, weights)) {
        return {
            selection: { plan: null, blocked: true, reason: '存在权重>=1单位，跳过低权重招募' },
            matched: false
        };
    }
    const lowUnit = getTopLowWeightedRecruitUnit(teamId, weights);
    if (!lowUnit) {
        const guardResult = chooseGuardRecruitPlan(teamId);
        return guardResult
            ? {
                selection: { plan: guardResult.plan, blocked: !!guardResult.blocked, reason: guardResult.reason },
                matched: matchMoveDebugRecruitPlanToReplay(guardResult.plan, action, replayUnitId)
            }
            : {
                selection: { plan: null, blocked: false, reason: '无可招募单位' },
                matched: false
            };
    }
    const lowResult = buildRecruitPlanResult(teamId, lowUnit.unit.id, '低权重招募');
    if (lowResult) {
        return {
            selection: { plan: lowResult.plan, blocked: !!lowResult.blocked, reason: lowResult.reason },
            matched: matchMoveDebugRecruitPlanToReplay(lowResult.plan, action, replayUnitId)
        };
    }
    const guardResult = chooseGuardRecruitPlan(teamId);
    return guardResult
        ? {
            selection: { plan: guardResult.plan, blocked: !!guardResult.blocked, reason: guardResult.reason },
            matched: matchMoveDebugRecruitPlanToReplay(guardResult.plan, action, replayUnitId)
        }
        : {
            selection: { plan: null, blocked: false, reason: `${lowUnit.unit.name}无可用招募城堡` },
            matched: false
        };
}
function chooseMoveDebugRecruitPlanForReplay(teamId, replayUnitId, action) {
    const priorityPlan = choosePriorityRecruitPlan(teamId);
    if (priorityPlan) {
        return {
            selection: { plan: priorityPlan.plan, blocked: !!priorityPlan.blocked, reason: priorityPlan.reason },
            matched: matchMoveDebugRecruitPlanToReplay(priorityPlan.plan, action, replayUnitId)
        };
    }
    const weights = getCurrentRecruitmentWeights();
    const highUnits = getSortedWeightedRecruitUnits(teamId, weights, 1, Infinity);
    if (highUnits.length > 0) {
        for (const highUnit of highUnits) {
            if (!canRecruitUnitByRules(teamId, highUnit.unit.id))
                continue;
            const result = buildRecruitPlanResult(teamId, highUnit.unit.id, '权重>=1招募');
            if (result) {
                return {
                    selection: { plan: result.plan, blocked: !!result.blocked, reason: result.reason },
                    matched: matchMoveDebugRecruitPlanToReplay(result.plan, action, replayUnitId)
                };
            }
        }
        const guardResult = chooseGuardRecruitPlan(teamId);
        if (guardResult) {
            return {
                selection: { plan: guardResult.plan, blocked: !!guardResult.blocked, reason: guardResult.reason },
                matched: matchMoveDebugRecruitPlanToReplay(guardResult.plan, action, replayUnitId)
            };
        }
        return {
            selection: { plan: null, blocked: true, reason: '存在权重>=1单位但暂不可招募' },
            matched: false
        };
    }
    const randomUnits = getTeamGold(teamId) > 469
        ? RANDOM_RECRUIT_UNIT_IDS.filter(unitId => canRandomRecruitUnitStructurally(teamId, unitId) && chooseRecruitCastle(teamId, unitId))
        : [];
    if (randomUnits.length > 0) {
        const possibleRandomResults = [];
        let canFallThroughToLowWeight = false;
        randomUnits.forEach(unitId => {
            if (getTeamGold(teamId) >= getRecruitCost(unitId, teamId)
                && !wouldExceedTeamPopulationLimit(teamId, unitId)) {
                const result = buildRecruitPlanResult(teamId, unitId, '随机招募');
                if (result && result.plan) {
                    possibleRandomResults.push(result);
                }
                else {
                    canFallThroughToLowWeight = true;
                }
            }
            else {
                canFallThroughToLowWeight = true;
            }
        });
        const matchedRandom = possibleRandomResults.find(result => matchMoveDebugRecruitPlanToReplay(result.plan, action, replayUnitId));
        if (matchedRandom) {
            return {
                selection: { plan: matchedRandom.plan, blocked: !!matchedRandom.blocked, reason: matchedRandom.reason },
                matched: true,
                randomMatched: true,
                randomUnits: randomUnits.slice()
            };
        }
        if (canFallThroughToLowWeight) {
            const fallbackMatch = chooseMoveDebugLowWeightRecruitPlanForReplay(teamId, replayUnitId, action, weights);
            if (fallbackMatch.matched) {
                return {
                    ...fallbackMatch,
                    matched: true,
                    randomFallthroughMatched: true,
                    randomUnits: randomUnits.slice()
                };
            }
        }
        const fallback = possibleRandomResults[0] || (canFallThroughToLowWeight
            ? chooseMoveDebugLowWeightRecruitPlanForReplay(teamId, replayUnitId, action, weights).selection
            : null);
        return {
            selection: fallback
                ? { plan: fallback.plan, blocked: !!fallback.blocked, reason: fallback.reason }
                : { plan: null, blocked: true, reason: '随机招募候选暂不可招募' },
            matched: false,
            randomUnits: randomUnits.slice()
        };
    }
    return chooseMoveDebugLowWeightRecruitPlanForReplay(teamId, replayUnitId, action, weights);
}
function chooseMoveDebugPlayerRecruitPlan(teamId, replayUnitId, action) {
    const coord = action ? action.fromCoord : null;
    if (!coord) {
        return { selection: { plan: null, blocked: true, reason: '玩家招募缺少城堡坐标' }, matched: false };
    }
    if (!canRecruitUnitAtMoveModeCastle(teamId, replayUnitId, coord.row, coord.col)) {
        return { selection: { plan: null, blocked: true, reason: '单位、金币、人口或招募城堡不满足游戏规则' }, matched: false };
    }
    const castle = getRecruitableCastleInfo(coord.row, coord.col);
    if (!castle || castle.teamId !== teamId) {
        return { selection: { plan: null, blocked: true, reason: '该坐标不是本队可招募城堡' }, matched: false };
    }
    const plan = {
        teamId,
        unitId: replayUnitId,
        castle: {
            row: coord.row,
            col: coord.col,
            occupiedByCommander: !!castle.occupiedByCommander
        },
        placement: { row: coord.row, col: coord.col, candidate: null }
    };
    return {
        selection: { plan, blocked: false, reason: '玩家合法招募' },
        matched: true,
        playerLegalOnly: true
    };
}
async function runMoveDebugReplaySegment(segment, isFirstSegment, session, token, options = {}) {
    const team = appData.teams.find(item => item.id === segment.teamId);
    if (!team)
        return createMoveDebugFailure(null, `回放段 ${segment.index} 的队伍不存在`);
    if (!isAiPlayerType(team.playerType) && !options.includePlayerTeams) {
        return { ok: true, stoppedByPlayer: true, teamId: team.id };
    }
    const playerLegalOnly = team.playerType === 1 && !!options.includePlayerTeams;
    appData.demoTeamTurn = createMoveDebugTurnForReplay(team.id);
    appData.demoEnemyMovementBlocking = true;
    appData.currentMoveTeam = team.id;
    if (!isFirstSegment) {
        const before = cloneMoveDebugState();
        const turnStart = settleDemoTeamTurnStart(team.id);
        const after = cloneMoveDebugState();
        session.steps.push({
            label: `${team.name} 回合开始`,
            teamId: team.id,
            teamName: team.name,
            before,
            after,
            action: null,
            type: 'turnStart',
            affectedTraceIds: [],
            detail: `金币+${turnStart.gold.income}`
        });
    }
    for (const action of segment.actions) {
        if (action.type === 'SURRENDER') {
            if (options.includePlayerTeams) {
                const before = cloneMoveDebugState();
                let removedUnits = 0;
                let neutralizedBuildings = 0;
                team.playerType = 0;
                for (let row = 0; row < appData.rows; row++) {
                    for (let col = 0; col < appData.cols; col++) {
                        const cell = appData.gridData[row]?.[col];
                        if (!cell)
                            continue;
                        if (cell.unit && cell.unitTeam === team.id) {
                            clearUnitWithoutTombstone(cell);
                            removedUnits++;
                        }
                        if ((cell.terrain === 'castle' || cell.terrain === 'house') && cell.terrainTeam === team.id) {
                            cell.terrainTeam = null;
                            neutralizedBuildings++;
                        }
                    }
                }
                const after = cloneMoveDebugState();
                session.steps.push({
                    label: `${team.name} 投降`,
                    teamId: team.id,
                    teamName: team.name,
                    before,
                    after,
                    action: cloneMoveDebugJson(action),
                    type: 'surrender',
                    affectedTraceIds: [],
                    detail: `移除 ${removedUnits} 个单位，${neutralizedBuildings} 个建筑变为无归属`
                });
                continue;
            }
            return createMoveDebugActionFailure(action, team, '回放中出现投降，当前调试暂不自动比对投降动作');
        }
        if (action.type === 'NONE') {
            const replayUnitId = getMoveDebugReplayRecruitUnitId(action);
            if (!replayUnitId)
                return createMoveDebugActionFailure(action, team, 'NONE 招募动作缺少可识别的 recruitUnitId');
            const recruitBeforeMismatch = cloneMoveDebugState();
            const recruitCoord = action.fromCoord || null;
            const recruitTraceId = recruitCoord
                ? getMoveDebugCellTraceId(recruitBeforeMismatch, recruitCoord.row, recruitCoord.col)
                : null;
            const recruitUnitAction = recruitCoord
                ? { row: recruitCoord.row, col: recruitCoord.col, unit: null, unitTraceId: recruitTraceId }
                : null;
            const recruitMatch = playerLegalOnly
                ? chooseMoveDebugPlayerRecruitPlan(team.id, replayUnitId, action)
                : chooseMoveDebugRecruitPlanForReplay(team.id, replayUnitId, action);
            const selection = recruitMatch.selection;
            const plan = selection && selection.plan ? selection.plan : null;
            if (!plan)
                return attachMoveDebugFailureContext(createMoveDebugActionFailure(action, team, `回放招募 ${replayUnitId}，但6.1.4没有招募计划：${selection ? selection.reason : ''}`), {
                    before: recruitBeforeMismatch,
                    unitAction: recruitUnitAction,
                    unitTraceId: recruitTraceId,
                    label: `${team.name} 招募不一致`
                });
            if (!recruitMatch.matched && plan.unitId !== replayUnitId) {
                const recruitDetails = formatMoveDebugRecruitWeightAndCount(team.id, [replayUnitId, plan.unitId]);
                const selectionReason = selection && selection.reason ? `；选择原因：${selection.reason}` : '';
                return attachMoveDebugFailureContext(createMoveDebugActionFailure(action, team, `招募单位不一致：回放 ${getUnitDefinition(replayUnitId)?.name || replayUnitId}（${replayUnitId}），6.1.4 ${getUnitDefinition(plan.unitId)?.name || plan.unitId}（${plan.unitId}）；${recruitDetails}${selectionReason}`), {
                    before: recruitBeforeMismatch,
                    unitAction: recruitUnitAction,
                    unitTraceId: recruitTraceId,
                    label: `${team.name} 招募单位不一致`
                });
            }
            if (!recruitMatch.matched && action.fromCoord && plan.castle && !sameMoveDebugCoord(action.fromCoord, plan.castle)) {
                return attachMoveDebugFailureContext(createMoveDebugActionFailure(action, team, `招募建筑不一致：回放 ${formatMoveDebugCoord(action.fromCoord)}，6.1.4 ${formatMoveDebugCoord(plan.castle)}`), {
                    before: recruitBeforeMismatch,
                    unitAction: recruitUnitAction,
                    unitTraceId: recruitTraceId,
                    label: `${team.name} 招募建筑不一致`
                });
            }
            if (!recruitMatch.matched) {
                return attachMoveDebugFailureContext(createMoveDebugActionFailure(action, team, `招募动作不属于6.1.4候选：${selection ? selection.reason : ''}`), {
                    before: recruitBeforeMismatch,
                    unitAction: recruitUnitAction,
                    unitTraceId: recruitTraceId,
                    label: `${team.name} 招募动作不一致`
                });
            }
            const before = cloneMoveDebugState();
            const result = executeMoveDebugRecruitOnly(plan);
            const after = cloneMoveDebugState();
            if (!result.ok)
                return attachMoveDebugFailureContext(createMoveDebugActionFailure(action, team, result.reason), {
                    before,
                    unitAction: recruitUnitAction,
                    unitTraceId: recruitTraceId,
                    label: `${team.name} 招募执行不一致`
                });
            const createdTraceId = getMoveDebugCellTraceId(after, plan.placement.row, plan.placement.col);
            if (result.commanderCastleSnapshot && createdTraceId) {
                session.pendingCommanderRestore = {
                    unitTraceId: createdTraceId,
                    row: plan.castle.row,
                    col: plan.castle.col,
                    snapshot: result.commanderCastleSnapshot
                };
            }
            session.steps.push({
                label: `${team.name} 招募 ${getUnitDefinition(plan.unitId)?.name || plan.unitId}`,
                teamId: team.id,
                teamName: team.name,
                before,
                after,
                action: cloneMoveDebugJson(action),
                recruitPlan: cloneMoveDebugJson(plan),
                type: 'recruit',
                unitTraceId: createdTraceId,
                affectedTraceIds: createdTraceId ? [createdTraceId] : [],
                detail: recruitMatch.playerLegalOnly
                    ? '玩家招募已通过金币、人口、单位限制和城堡合法性校验'
                    : (recruitMatch.randomFallthroughMatched
                        ? `NONE 按招募处理；随机招募可抽中不可购买单位并转入低权重招募，共 ${recruitMatch.randomUnits.length} 个随机候选`
                        : (recruitMatch.randomMatched
                            ? `NONE 按招募处理；命中随机招募候选之一，共 ${recruitMatch.randomUnits.length} 个`
                            : 'NONE 按招募处理'))
            });
            continue;
        }
        const from = action.fromCoord;
        if (!from)
            return createMoveDebugActionFailure(action, team, `${action.type} 缺少 from 坐标`);
        const fromCell = appData.gridData[from.row]?.[from.col];
        if (!fromCell || !fromCell.unit) {
            return createMoveDebugActionFailure(action, team, `回放行动单位不存在：${formatMoveDebugCoord(from)}`);
        }
        if (fromCell.unitTeam !== team.id) {
            const actualTeam = appData.teams.find(item => item.id === fromCell.unitTeam);
            return createMoveDebugActionFailure(action, team, `回放 from 队伍不一致：${formatMoveDebugCoord(from)} 是 ${actualTeam ? actualTeam.name : fromCell.unitTeam}，当前应为 ${team.name}`, {}, fromCell);
        }
        const unitAction = playerLegalOnly
            ? {
                row: from.row,
                col: from.col,
                unit: getUnitDefinition(fromCell.unit),
                unitTraceId: fromCell.unitTraceId || null
            }
            : getNextDemoTeamUnit(team.id);
        if (!unitAction)
            return createMoveDebugActionFailure(action, team, '6.1.4 当前没有可行动单位，但回放还有行动', {}, fromCell);
        const mismatchBefore = cloneMoveDebugState();
        const mismatchTraceId = getMoveDebugCellTraceId(mismatchBefore, unitAction.row, unitAction.col);
        if (!playerLegalOnly && (unitAction.row !== from.row || unitAction.col !== from.col)) {
            return attachMoveDebugFailureContext(createMoveDebugActionFailure(action, team, `单位行动顺序不一致：回放 ${formatMoveDebugCoord(from)}，6.1.4 应行动 ${formatMoveDebugCoord(unitAction)}`, {
                unitAction: cloneDemoUnitActionForLog(unitAction)
            }, fromCell), {
                before: mismatchBefore,
                unitAction,
                unitTraceId: mismatchTraceId,
                label: `${team.name} 单位行动顺序不一致`
            });
        }
        const candidateResult = findMoveDebugReplayCandidate(unitAction, action, session, {
            legalOnly: playerLegalOnly
        });
        if (!candidateResult.candidate) {
            const bestText = candidateResult.bestCandidates.slice(0, 8)
                .map(candidate => `${candidate.actionTypeName}@${formatMoveDebugCoord(candidate)}${candidate.target ? '->' + formatMoveDebugCoord(candidate.target) : ''}=${candidate.value}`)
                .join('；');
            const failureMessage = playerLegalOnly
                ? `${getMoveDebugReplayActionName(action)} 不符合游戏规则。合法候选：${bestText || '无'}`
                : `${getMoveDebugReplayActionName(action)} 不属于6.1.4最高分候选。最高候选：${bestText || '无'}`;
            return attachMoveDebugFailureContext(createMoveDebugActionFailure(action, team, failureMessage, {
                unitAction: cloneDemoUnitActionForLog(unitAction)
            }, fromCell), {
                before: mismatchBefore,
                unitAction,
                unitTraceId: mismatchTraceId,
                label: `${team.name} ${getMoveDebugReplayActionName(action)} 不一致`
            });
        }
        const before = cloneMoveDebugState();
        const beforeCounts = collectBoardUnitCounts(team.id);
        const unitTraceId = getMoveDebugCellTraceId(before, unitAction.row, unitAction.col);
        const executed = await executeMoveDebugCandidateForcedWithFallback(unitAction, candidateResult, action, token, session, {
            legalOnly: playerLegalOnly
        });
        const selectedCandidate = executed.candidate || candidateResult.candidate;
        const after = cloneMoveDebugState();
        if (!executed.ok)
            return attachMoveDebugFailureContext(createMoveDebugActionFailure(action, team, executed.reason, {
                unitAction: cloneDemoUnitActionForLog(unitAction),
                candidate: selectedCandidate
            }, fromCell), {
                before,
                unitAction,
                unitTraceId,
                label: `${team.name} ${getMoveDebugReplayActionName(action)} 执行不一致`
            });
        const restoredCommander = executed.restoredCommanderBeforeAction
            || restoreMoveDebugPendingCommanderIfNeeded(session, unitTraceId);
        const afterWithCommander = restoredCommander ? cloneMoveDebugState() : after;
        const afterCounts = collectBoardUnitCounts(team.id);
        addKillStatsFromCounts(beforeCounts, afterCounts);
        session.steps.push({
            label: `${team.name} ${getMoveDebugReplayActionName(action)}：${formatDemoCandidate(unitAction, candidateResult.candidate)}`,
            teamId: team.id,
            teamName: team.name,
            before,
            after: afterWithCommander,
            action: cloneMoveDebugJson(action),
            unitAction: cloneDemoUnitActionForLog(unitAction),
            candidate: cloneMoveDebugJson(selectedCandidate),
            type: 'unit',
            unitTraceId,
            affectedTraceIds: collectMoveDebugActionTraceIds(before, afterWithCommander, action, unitAction, selectedCandidate),
            detail: (playerLegalOnly
                ? '玩家动作已通过移动范围、落点、目标和动作合法性校验'
                : (candidateResult.bestCandidates.length > 1
                    ? `命中最高分候选之一，共 ${candidateResult.bestCandidates.length} 个同分最高；若目标不同，已按回放目标在潜在目标中匹配`
                    : '命中最高分候选；若目标不同，已按回放目标在潜在目标中匹配'))
                + (restoredCommander ? '；招募后已恢复城堡真王' : '')
        });
    }
    return { ok: true };
}
function compareMoveDebugSnapshotsStrict(expected, actual) {
    const diffs = [];
    const rows = Math.max(expected?.rows || 0, actual?.rows || 0);
    const cols = Math.max(expected?.cols || 0, actual?.cols || 0);
    const comparableFields = [
        'unit', 'unitTeam', 'unitLevel', 'unitHealth', 'unitExp',
        'unitStatus', 'unitStatusTurns', 'unitStandby', 'unitSupported',
        'unitRegisteredCommander', 'terrain', 'terrainTeam'
    ];
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            const a = expected.gridData?.[i]?.[j] || {};
            const b = actual.gridData?.[i]?.[j] || {};
            for (const field of comparableFields) {
                const av = a[field] ?? null;
                const bv = b[field] ?? null;
                if (av !== bv) {
                    diffs.push(`(${i + 1},${j + 1}) ${field}: 6.1.4=${av} 回放=${bv}`);
                    break;
                }
            }
            const at = a.tombstone || null;
            const bt = b.tombstone || null;
            if (JSON.stringify(at) !== JSON.stringify(bt)) {
                diffs.push(`(${i + 1},${j + 1}) 墓碑: 6.1.4=${at ? `${at.team}/${at.rounds}` : '无'} 回放=${bt ? `${bt.team}/${bt.rounds}` : '无'}`);
            }
        }
    }
    return diffs;
}
function updateMoveDebugPlaybackButtons() {
    const session = appData.moveDebugSession;
    const hasSteps = !!(session && session.steps && session.steps.length > 0);
    if (elements.moveDebugPrevBtn)
        elements.moveDebugPrevBtn.disabled = !hasSteps;
    if (elements.moveDebugNextBtn)
        elements.moveDebugNextBtn.disabled = !hasSteps;
    if (elements.moveDebugPlayBtn)
        elements.moveDebugPlayBtn.disabled = !hasSteps;
    if (elements.moveDebugStopBtn)
        elements.moveDebugStopBtn.disabled = !hasSteps;
}
function renderMoveDebugResults() {
    const session = appData.moveDebugSession;
    if (!elements.moveDebugResults || !session)
        return;
    if (session.error) {
        elements.moveDebugResults.innerHTML = `<div class="text-red-600">${session.error}</div>`;
        return;
    }
    const actionTeams = Array.isArray(session.debugTeams)
        ? session.debugTeams.map(team => ({ id: team.id, name: team.name }))
        : [];
    (session.steps || []).forEach(step => {
        if (!step.teamId || actionTeams.some(team => team.id === step.teamId))
            return;
        actionTeams.push({ id: step.teamId, name: step.teamName || appData.teams.find(team => team.id === step.teamId)?.name || step.teamId });
    });
    const selectedTeamId = actionTeams.some(team => team.id === session.actionTeamFilter)
        ? session.actionTeamFilter
        : null;
    session.actionTeamFilter = selectedTeamId;
    const teamFilterButtons = actionTeams.map((team, index) => `
                <button type="button"
                    class="move-debug-team-filter rounded px-2 py-1 text-xs font-medium transition-colors ${selectedTeamId === team.id ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}"
                    data-team-filter-index="${index}">${team.name}</button>
            `).join('');
    const summary = `
                <div class="space-y-2">
                    <div class="${session.finalDiffs && session.finalDiffs.length ? 'text-red-600' : 'text-green-700'} font-medium">
                        ${session.summary || '调试完成'}
                    </div>
                    <div class="flex flex-wrap gap-1">
                        <button type="button" class="move-debug-show-final bg-gray-100 text-gray-700 hover:bg-gray-200 rounded px-2 py-1">查看结束布局</button>
                        <button type="button" class="move-debug-team-filter-all rounded px-2 py-1 text-xs font-medium transition-colors ${selectedTeamId === null ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}">全部</button>
                        ${teamFilterButtons}
                        ${session.failure && session.failure.before ? '<button type="button" class="move-debug-show-failure-before bg-red-100 text-red-700 hover:bg-red-200 rounded px-2 py-1">查看不一致前布局</button>' : ''}
                    </div>
                </div>
            `;
    const failed = session.failure ? `
                <div class="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700">
                    第 ${session.failure.actionIndex ?? '?'} 条：${session.failure.message}
                    ${session.failure.actualChoice ? `<div class="mt-1 font-medium">${session.failure.actualChoice}</div>` : ''}
                </div>
            ` : '';
    const diffs = session.hasFinalLayoutComparison
        ? (session.finalDiffs && session.finalDiffs.length > 0
            ? `<div class="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700">
                    <div class="font-medium">结束布局差异 ${session.finalDiffs.length} 项</div>
                    ${session.finalDiffs.slice(0, 20).map(diff => `<div>${diff}</div>`).join('')}
                </div>`
            : '<div class="mt-2 text-green-700">结束布局严格一致</div>')
        : (session.failure
            ? '<div class="mt-2 text-red-700">回放已在不一致处停止，未执行结束布局对比</div>'
            : '<div class="mt-2 text-green-700">回放动作校验完成（未提供独立结束布局）</div>');
    const visibleSteps = (session.steps || [])
        .map((step, index) => ({ step, index }))
        .filter(item => selectedTeamId === null || item.step.teamId === selectedTeamId);
    const steps = visibleSteps.map(({ step, index }) => `
                <button type="button"
                    class="move-debug-show-step-before block w-full mt-1 border border-gray-200 hover:border-blue-400 hover:bg-blue-50 rounded p-1 text-left transition-colors"
                    data-step-index="${index}">
                    <div>${index + 1}. ${step.label}</div>
                    <div class="text-gray-500">${step.detail || ''}</div>
                </button>
            `).join('');
    const actionCountText = selectedTeamId === null
        ? `全部行动 ${visibleSteps.length} 条`
        : `${actionTeams.find(team => team.id === selectedTeamId)?.name || selectedTeamId} 行动 ${visibleSteps.length} 条`;
    elements.moveDebugResults.innerHTML = summary + failed + diffs + `
                <div class="mt-2">
                    <div class="text-xs font-medium text-gray-600 mb-1">${actionCountText}</div>
                    <div class="max-h-96 overflow-y-auto overscroll-contain pr-1 border-t border-b border-gray-100">
                        ${steps || '<div class="py-3 text-center text-gray-400">该队伍没有行动</div>'}
                    </div>
                </div>`;
    const finalButton = elements.moveDebugResults.querySelector('.move-debug-show-final');
    if (finalButton)
        finalButton.addEventListener('click', showMoveDebugFinalLayout);
    const failureBeforeButton = elements.moveDebugResults.querySelector('.move-debug-show-failure-before');
    if (failureBeforeButton)
        failureBeforeButton.addEventListener('click', showMoveDebugFailureBeforeLayout);
    const allTeamsButton = elements.moveDebugResults.querySelector('.move-debug-team-filter-all');
    if (allTeamsButton)
        allTeamsButton.addEventListener('click', () => {
            session.actionTeamFilter = null;
            renderMoveDebugResults();
        });
    elements.moveDebugResults.querySelectorAll('.move-debug-team-filter').forEach(button => {
        button.addEventListener('click', () => {
            const team = actionTeams[parseInt(button.dataset.teamFilterIndex, 10)];
            if (!team)
                return;
            session.actionTeamFilter = team.id;
            renderMoveDebugResults();
        });
    });
    elements.moveDebugResults.querySelectorAll('.move-debug-show-step-before').forEach(button => {
        button.addEventListener('click', () => showMoveDebugStepBeforeLayout(parseInt(button.dataset.stepIndex, 10)));
    });
}
function showMoveDebugFinalLayout() {
    const session = appData.moveDebugSession;
    if (!session || !session.finalSnapshot)
        return;
    session.viewMode = 'final';
    restoreMoveDebugState(session.finalSnapshot);
    if (elements.moveDebugStatus)
        elements.moveDebugStatus.textContent = '正在显示调试停止时的结束布局；点击任一单位可查看行动前局面';
}
function showMoveDebugFailureBeforeLayout() {
    const session = appData.moveDebugSession;
    const failure = session ? session.failure : null;
    if (!failure || !failure.before)
        return;
    session.viewMode = 'failureBefore';
    restoreMoveDebugState(failure.before);
    if (elements.moveDebugStatus) {
        elements.moveDebugStatus.textContent = `已显示不一致前局面：${failure.label || failure.message || ''}`;
    }
}
function showMoveDebugStepBeforeLayout(stepIndex) {
    const session = appData.moveDebugSession;
    const step = session && session.steps ? session.steps[stepIndex] : null;
    if (!step || !step.before)
        return;
    stopMoveDebugPlayback(false);
    session.playbackIndex = stepIndex - 1;
    session.viewMode = 'beforeStep';
    restoreMoveDebugState(step.before);
    if (elements.moveDebugStatus) {
        elements.moveDebugStatus.textContent = `已显示第 ${stepIndex + 1} 步行动前局面：${step.label || ''}`;
    }
    updateMoveDebugPlaybackButtons();
}
function handleMoveDebugGridUnitClick(row, col) {
    const session = appData.moveDebugSession;
    if (!session || !session.finalSnapshot || session.viewMode !== 'final')
        return false;
    const cell = appData.gridData[row]?.[col];
    if (!cell || !cell.unit)
        return false;
    if (!appData.moveModePendingActionRecord)
        queueMoveModeAction('STANDBY', row, col);
    const traceId = cell.unitTraceId || null;
    if (!traceId) {
        if (elements.moveDebugStatus)
            elements.moveDebugStatus.textContent = '该单位没有可追踪ID';
        return true;
    }
    let step = null;
    const failure = session.failure;
    if (failure && failure.before) {
        if (failure.unitTraceId === traceId
            || (Array.isArray(failure.affectedTraceIds) && failure.affectedTraceIds.includes(traceId))) {
            step = failure;
        }
    }
    if (!step)
        step = (session.steps || []).find(item => item.unitTraceId === traceId);
    if (!step) {
        const reversed = [...(session.steps || [])].reverse();
        step = reversed.find(item => Array.isArray(item.affectedTraceIds) && item.affectedTraceIds.includes(traceId));
    }
    if (!step) {
        if (elements.moveDebugStatus)
            elements.moveDebugStatus.textContent = '该单位在本次调试段内无相关步骤';
        return true;
    }
    session.viewMode = step.type === 'failure' ? 'failureBefore' : 'beforeStep';
    restoreMoveDebugState(step.before);
    if (elements.moveDebugStatus) {
        elements.moveDebugStatus.textContent = `已显示行动/影响前局面：${step.label}`;
    }
    return true;
}
function loadMoveDebugTargetLayout(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            const parsed = parseMoveDebugReplay(data);
            if (parsed.error)
                throw new Error(parsed.error);
            const timelineResult = buildMoveDebugReplayTimeline(parsed.segments);
            if (timelineResult.error)
                throw new Error(timelineResult.error);
            appData.moveDebugSession = {
                replay: data,
                actions: parsed.actions,
                segments: parsed.segments,
                timeline: timelineResult.timeline,
                steps: [],
                finalDiffs: [],
                failure: null,
                finalSnapshot: null,
                baseSnapshot: null,
                viewMode: null,
                playbackIndex: -1,
                playbackTimer: null
            };
            if (elements.moveDebugStatus) {
                elements.moveDebugStatus.textContent = `已上传回放记录：${parsed.actions.length} 条动作，${parsed.segments.length} 个 NEXT_TURN 分段`;
            }
            if (elements.startMoveDebugBtn)
                elements.startMoveDebugBtn.disabled = false;
            if (elements.moveDebugResults)
                elements.moveDebugResults.innerHTML = '';
            updateMoveDebugPlaybackButtons();
        }
        catch (error) {
            appData.moveDebugSession = { error: error.message };
            if (elements.moveDebugStatus)
                elements.moveDebugStatus.textContent = '回放记录解析失败：' + error.message;
            if (elements.startMoveDebugBtn)
                elements.startMoveDebugBtn.disabled = true;
            renderMoveDebugResults();
            updateMoveDebugPlaybackButtons();
        }
    };
    reader.readAsText(file);
}
async function startMoveModeDebug() {
    const session = appData.moveDebugSession;
    if (!session || !session.timeline) {
        alert('请先上传 online-actions 回放记录');
        return;
    }
    const debugMode = elements.moveDebugMode ? elements.moveDebugMode.value : 'oneRound';
    const fullGame = debugMode === 'fullGame';
    const located = fullGame
        ? {
            startSegmentIndex: session.timeline[0]?.index ?? 0,
            currentTeamId: session.timeline[0]?.teamId || null,
            currentRound: session.timeline[0]?.round || 1
        }
        : locateMoveDebugReplayStart(session);
    if (located.error || !located.currentTeamId) {
        const error = located.error || '回放中没有可调试的行动段';
        session.error = error;
        if (elements.moveDebugStatus)
            elements.moveDebugStatus.textContent = error;
        renderMoveDebugResults();
        return;
    }
    session.baseSnapshot = cloneMoveDebugState();
    session.debugMode = debugMode;
    stopMoveDebugPlayback(false);
    session.steps = [];
    session.failure = null;
    session.finalDiffs = [];
    session.viewMode = null;
    session.actionTeamFilter = null;
    session.debugTeams = [];
    session.playbackIndex = -1;
    ensureDemoUnitTraceIds();
    appData.demoTeamLoopToken++;
    const token = appData.demoTeamLoopToken;
    if (elements.startMoveDebugBtn)
        elements.startMoveDebugBtn.disabled = true;
    const startTimelineIndex = session.timeline.findIndex(segment => segment.index === located.startSegmentIndex);
    let stoppedByPlayer = false;
    let runtimeTeamId = located.currentTeamId;
    let runtimeRound = located.currentRound;
    for (let i = startTimelineIndex; i < session.segments.length; i++) {
        const baseSegment = session.segments[i];
        if (elements.moveModeRoundInput)
            elements.moveModeRoundInput.value = Math.max(1, runtimeRound || 1);
        if (elements.demoRoundInput)
            elements.demoRoundInput.value = Math.max(1, runtimeRound || 1);
        const team = appData.teams.find(item => item.id === runtimeTeamId);
        if (!team) {
            session.failure = { actionIndex: null, message: `回放段 ${baseSegment.index} 队伍不存在` };
            break;
        }
        if (!isAiPlayerType(team.playerType) && !fullGame) {
            stoppedByPlayer = true;
            break;
        }
        if (!session.debugTeams.some(item => item.id === team.id)) {
            session.debugTeams.push({ id: team.id, name: team.name });
        }
        if (elements.moveDebugStatus) {
            elements.moveDebugStatus.textContent = `正在校验 ${team.name}...`;
        }
        const segment = { ...baseSegment, teamId: runtimeTeamId };
        if (fullGame) {
            const timelineSegment = session.timeline.find(item => item.index === baseSegment.index);
            if (timelineSegment)
                Object.assign(timelineSegment, { teamId: runtimeTeamId, round: runtimeRound });
        }
        const result = await runMoveDebugReplaySegment(segment, i === startTimelineIndex, session, token, {
            includePlayerTeams: fullGame
        });
        if (!result.ok) {
            session.failure = result;
            break;
        }
        if (result.stoppedByPlayer) {
            stoppedByPlayer = true;
            break;
        }
        if (baseSegment.nextTurnIndex !== null) {
            settleDemoTeamTurnEnd(runtimeTeamId);
        }
        const nextTeamId = getNextMoveDebugRuntimeTeamId(runtimeTeamId);
        if (fullGame && nextTeamId) {
            const orderedIds = getOrderedTeams().map(item => item.id);
            if (orderedIds.indexOf(nextTeamId) <= orderedIds.indexOf(runtimeTeamId))
                runtimeRound++;
        }
        const isLastSegment = i === session.segments.length - 1;
        if (fullGame && isLastSegment && nextTeamId && baseSegment.nextTurnIndex !== null) {
            if (elements.moveModeRoundInput)
                elements.moveModeRoundInput.value = Math.max(1, runtimeRound || 1);
            if (elements.demoRoundInput)
                elements.demoRoundInput.value = Math.max(1, runtimeRound || 1);
            const nextTeam = appData.teams.find(item => item.id === nextTeamId);
            const before = cloneMoveDebugState();
            appData.currentMoveTeam = nextTeamId;
            const turnStart = settleDemoTeamTurnStart(nextTeamId);
            const after = cloneMoveDebugState();
            session.steps.push({
                label: `${nextTeam ? nextTeam.name : nextTeamId} 回合开始`,
                teamId: nextTeamId,
                teamName: nextTeam ? nextTeam.name : nextTeamId,
                before,
                after,
                action: null,
                type: 'turnStart',
                affectedTraceIds: [],
                detail: `金币+${turnStart.gold.income}`
            });
        }
        runtimeTeamId = nextTeamId;
        if (!runtimeTeamId) {
            appData.currentMoveTeam = null;
            break;
        }
    }
    session.finalSnapshot = cloneMoveDebugState();
    session.hasFinalLayoutComparison = !!session.targetSnapshot;
    session.finalDiffs = session.hasFinalLayoutComparison
        ? compareMoveDebugSnapshotsStrict(session.targetSnapshot, session.finalSnapshot)
        : [];
    restoreMoveDebugState(session.finalSnapshot);
    appData.demoTeamTurn = null;
    appData.demoEnemyMovementBlocking = false;
    const stopText = stoppedByPlayer
        ? '调试一轮完成，遇到玩家队伍停止'
        : (session.failure
            ? '发现不一致停止'
            : (fullGame ? '已从布局开始校验完全部回放动作' : '回放动作耗尽停止'));
    session.summary = `${stopText}，已校验 ${session.steps.length} 步`;
    if (elements.moveDebugStatus) {
        elements.moveDebugStatus.textContent = `${session.summary}${session.failure ? '：' + session.failure.message : ''}`;
    }
    if (elements.startMoveDebugBtn)
        elements.startMoveDebugBtn.disabled = false;
    renderMoveDebugResults();
    updateMoveDebugPlaybackButtons();
}
function playMoveDebugStep(index) {
    const session = appData.moveDebugSession;
    if (!session || !session.steps || session.steps.length === 0)
        return;
    const bounded = Math.max(0, Math.min(index, session.steps.length - 1));
    session.playbackIndex = bounded;
    restoreMoveDebugState(session.steps[bounded].after);
    session.viewMode = 'step';
    if (elements.moveDebugStatus)
        elements.moveDebugStatus.textContent = `回放第 ${bounded + 1}/${session.steps.length} 步：${session.steps[bounded].label}`;
    updateMoveDebugPlaybackButtons();
}
function stepMoveDebugPlayback(offset) {
    const session = appData.moveDebugSession;
    if (!session || !session.steps || session.steps.length === 0)
        return;
    const current = Number.isInteger(session.playbackIndex) ? session.playbackIndex : -1;
    if (current < 0) {
        playMoveDebugStep(offset < 0 ? session.steps.length - 1 : 0);
        return;
    }
    playMoveDebugStep(current + offset);
}
function stopMoveDebugPlayback(restoreActual = true) {
    const session = appData.moveDebugSession;
    if (!session)
        return;
    if (session.playbackTimer) {
        clearInterval(session.playbackTimer);
        session.playbackTimer = null;
    }
    if (restoreActual && session.finalSnapshot)
        showMoveDebugFinalLayout();
    updateMoveDebugPlaybackButtons();
}
function playMoveDebugPlayback() {
    const session = appData.moveDebugSession;
    if (!session || !session.steps || session.steps.length === 0)
        return;
    stopMoveDebugPlayback(false);
    const current = Number.isInteger(session.playbackIndex) ? session.playbackIndex : -1;
    let index = current < 0 || current >= session.steps.length - 1 ? 0 : current;
    playMoveDebugStep(index);
    session.playbackTimer = setInterval(() => {
        index++;
        if (index >= session.steps.length) {
            stopMoveDebugPlayback(true);
            return;
        }
        playMoveDebugStep(index);
    }, 650);
    updateMoveDebugPlaybackButtons();
}
function getActionOrderTier(cell, unit) {
    let tier = 4;
    const terrain = cell.terrain ? appData.terrains.find(t => t.id === cell.terrain) : null;
    if (terrain && terrain.name === "城堡") {
        tier = 1;
    }
    else if (["士兵", "人鱼", "圣骑", "黑法", "狼射", "狼", "骷髅", "石头人", "精灵"].includes(unit.name)) {
        tier = 2;
    }
    else if (unit.name === "幽灵") {
        tier = 3;
    }
    return tier;
}
function collectTeamActionUnits(teamId) {
    const teamUnits = [];
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i][j];
            if (cell.unit && cell.unitTeam === teamId) {
                const unit = appData.units.find(u => u.id === cell.unit);
                if (unit) {
                    teamUnits.push({
                        row: i,
                        col: j,
                        unit: unit,
                        unitTraceId: cell.unitTraceId || null,
                        tier: getActionOrderTier(cell, unit),
                        hash: getGridHash(i, j)
                    });
                }
            }
        }
    }
    return teamUnits;
}
function getTotalUnitCount() {
    let totalUnits = 0;
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            if (appData.gridData[i][j].unit) {
                totalUnits++;
            }
        }
    }
    return totalUnits;
}
function getActionOrderCapacity(unitCount) {
    let capacity = 16;
    while (unitCount > capacity * 0.75) {
        capacity *= 2;
    }
    return capacity;
}
function buildActionOrderBucketMeta(allTeamUnits, capacity) {
    const bucketGroups = new Map();
    allTeamUnits.forEach(u => {
        u.bucket = u.hash % capacity;
        if (!bucketGroups.has(u.bucket))
            bucketGroups.set(u.bucket, []);
        bucketGroups.get(u.bucket).push(u);
    });
    const metaByBucket = new Map();
    bucketGroups.forEach((bucketUnits, bucket) => {
        let expandedCapacity = capacity;
        let finalCounts = new Map();
        const recalcFinalCounts = () => {
            finalCounts = new Map();
            bucketUnits.forEach(u => {
                const expandedBucket = u.hash % expandedCapacity;
                finalCounts.set(expandedBucket, (finalCounts.get(expandedBucket) || 0) + 1);
            });
        };
        recalcFinalCounts();
        while (bucketUnits.length > 8 && expandedCapacity < 64) {
            const hasCrowdedBucket = [...finalCounts.values()].some(count => count > 8);
            if (!hasCrowdedBucket)
                break;
            expandedCapacity = Math.min(expandedCapacity * 2, 64);
            recalcFinalCounts();
        }
        metaByBucket.set(bucket, {
            expandedCapacity,
            finalCounts
        });
    });
    return metaByBucket;
}
function applyActionOrderBuckets(unitsToSort, allTeamUnits, capacity) {
    const bucketMeta = buildActionOrderBucketMeta(allTeamUnits, capacity);
    unitsToSort.forEach(u => {
        u.bucket = u.hash % capacity;
        const meta = bucketMeta.get(u.bucket);
        u.expandedBucket = meta ? u.hash % meta.expandedCapacity : u.bucket;
        u.finalBucketOverLimit = !!(meta && meta.expandedCapacity === 64 && (meta.finalCounts.get(u.expandedBucket) || 0) > 8);
    });
}
function compareActionOrderUnits(a, b) {
    if (a.bucket !== b.bucket) {
        return a.bucket - b.bucket;
    }
    if (a.expandedBucket !== b.expandedBucket) {
        return a.expandedBucket - b.expandedBucket;
    }
    if (a.finalBucketOverLimit && b.finalBucketOverLimit && a.col !== b.col) {
        return a.col - b.col;
    }
    if (a.globalBucket !== b.globalBucket) {
        return a.globalBucket - b.globalBucket;
    }
    return a.col - b.col;
}
function canHardAiOccupyEnemyBuilding(actionUnit, terrainId) {
    const cell = appData.gridData[actionUnit.row]?.[actionUnit.col];
    const team = cell ? appData.teams.find(item => item.id === cell.unitTeam) : null;
    if (!team)
        return false;
    return calculateMovementRange(actionUnit.row, actionUnit.col).some(position => {
        const target = appData.gridData[position.row]?.[position.col];
        if (!target || target.terrain !== terrainId)
            return false;
        if (target.unit && (position.row !== actionUnit.row || position.col !== actionUnit.col))
            return false;
        const owner = appData.teams.find(item => item.id === target.terrainTeam);
        return !!owner && owner.alliance !== team.alliance;
    });
}
function getHardAiActionPriority(actionUnit) {
    const cell = appData.gridData[actionUnit.row]?.[actionUnit.col];
    const unit = actionUnit.unit;
    if (!cell || !unit)
        return 99;
    const abilities = unit.abilities || [];
    const negativeStatus = debuff.includes(cell.unitStatus);
    if (cell.terrain === 'castle')
        return 1;
    if (unit.id === 'commander' && abilities.includes('城主')
        && canHardAiOccupyEnemyBuilding(actionUnit, 'castle'))
        return 2;
    if (abilities.includes('占领')
        && canHardAiOccupyEnemyBuilding(actionUnit, 'house'))
        return 3;
    if (!negativeStatus && unit.id === 'rock')
        return 4;
    if (!negativeStatus && abilities.includes('致盲'))
        return 5;
    if (abilities.includes('净化') || abilities.includes('净化光环'))
        return 6;
    if (negativeStatus && unit.id === 'rock')
        return 7;
    if (negativeStatus && abilities.includes('致盲'))
        return 8;
    if (unit.id !== 'witch' && unit.id !== 'druid' && unit.minRange > 1)
        return 9;
    if (unit.id !== 'witch' && unit.id !== 'druid' && unit.maxRange > 1)
        return 10;
    if (abilities.includes('中毒'))
        return 11;
    if (unit.id === 'ghost')
        return 12;
    if (unit.id === 'druid'
        && hasReachableOperationalTarget(actionUnit.row, actionUnit.col, 'support'))
        return 13;
    if (unit.id === 'healer')
        return 14;
    const lateOrder = ['Slime', 'rampage', 'commander', 'waterelement', 'infantry'];
    const lateIndex = lateOrder.indexOf(unit.id);
    if (lateIndex >= 0)
        return 15 + lateIndex;
    if (unit.id === 'witch')
        return 20;
    if (unit.id === 'druid')
        return 21;
    return 22;
}
function getHardAiRefinedOrderMetrics(actionUnit) {
    const targetKeys = new Set();
    const landingKeys = new Set();
    const candidates = safeCalculateScoreList(calculateTotalScores, actionUnit.row, actionUnit.col);
    const team = appData.teams.find(item => item.id === appData.gridData[actionUnit.row][actionUnit.col].unitTeam);
    candidates.forEach(candidate => {
        if (!canStandOnMovementTarget(candidate.row, candidate.col, actionUnit.row, actionUnit.col))
            return;
        const landingKey = `${candidate.row},${candidate.col}`;
        if (candidate.actionType === 'occupy') {
            targetKeys.add(`building:${landingKey}`);
            landingKeys.add(landingKey);
        }
        else if (candidate.actionType === 'attack') {
            const targets = candidate.targets || (candidate.target ? [candidate.target] : []);
            targets.forEach(target => {
                if (target.targetType === 'terrainHouse') {
                    const ownerId = appData.gridData[target.row]?.[target.col]?.terrainTeam;
                    const owner = appData.teams.find(item => item.id === ownerId);
                    if (owner && team && owner.alliance === team.alliance)
                        return;
                }
                targetKeys.add(`${target.targetType === 'terrainHouse' ? 'building' : 'unit'}:${target.row},${target.col}`);
                landingKeys.add(landingKey);
            });
        }
    });
    const bestTotalScore = candidates.length ? Math.max(...candidates.map(item => item.value)) : -Infinity;
    const bestHouseGuardCandidate = candidates.find(candidate => {
        if (candidate.value !== bestTotalScore)
            return false;
        const landing = appData.gridData[candidate.row]?.[candidate.col];
        const terrain = appData.terrains.find(item => item.id === landing?.terrain);
        return terrain?.name === '房子' && landing.terrainTeam === team?.id
            && isTeamBuildingThreatenedByEnemyMover(candidate.row, candidate.col, 'house', team.id)
            && getHardAiHouseGuardMultiplier(actionUnit.row, actionUnit.col, candidate.row, candidate.col) > 0;
    }) || null;
    return {
        targetCount: targetKeys.size,
        landingCount: landingKeys.size,
        bestTotalScore,
        bestHouseGuardCandidate
    };
}
function getHardAiRefinedTypeRank(actionUnit) {
    if (actionUnit.unit.maxRange > 1)
        return 0;
    if (actionUnit.unit.id === 'rock')
        return 1;
    return 2;
}
function compareHardAiRefinedUnits(a, b) {
    const aTargets = a.refined.targetCount === 0 ? Infinity : a.refined.targetCount;
    const bTargets = b.refined.targetCount === 0 ? Infinity : b.refined.targetCount;
    if (aTargets !== bTargets)
        return aTargets - bTargets;
    if (a.refined.landingCount !== b.refined.landingCount) {
        return a.refined.landingCount - b.refined.landingCount;
    }
    if (a.refined.bestTotalScore !== b.refined.bestTotalScore) {
        return b.refined.bestTotalScore - a.refined.bestTotalScore;
    }
    return getHardAiRefinedTypeRank(a) - getHardAiRefinedTypeRank(b)
        || compareActionOrderUnits(a, b);
}
function promoteBestHardAiHouseGuard(activeUnits) {
    const firstGuard = activeUnits[0]?.refined?.bestHouseGuardCandidate;
    if (!firstGuard)
        return false;
    const contenders = activeUnits.filter(unit => {
        const guard = unit.refined?.bestHouseGuardCandidate;
        return guard && guard.row === firstGuard.row && guard.col === firstGuard.col;
    });
    if (contenders.length < 2)
        return false;
    contenders.sort((a, b) => b.refined.bestTotalScore - a.refined.bestTotalScore
        || appData.gridData[a.row][a.col].unitHealth - appData.gridData[b.row][b.col].unitHealth
        || compareHardAiRefinedUnits(a, b));
    const selected = contenders[0];
    const selectedIndex = activeUnits.indexOf(selected);
    if (selectedIndex > 0)
        activeUnits.unshift(activeUnits.splice(selectedIndex, 1)[0]);
    selected.hardAiHouseGuardLanding = { row: firstGuard.row, col: firstGuard.col };
    return true;
}
function getHardAiPairOperationScore(candidate) {
    return candidate && (candidate.actionType === 'attack' || candidate.actionType === 'occupy')
        ? Number(candidate.operationScore) || 0 : 0;
}
function getHardAiPairCandidates(actionUnit, requiredLanding = null, mustVacate = false, includeAllActions = false) {
    return safeCalculateScoreList(calculateTotalScores, actionUnit.row, actionUnit.col, {
        includeAllAttackTargets: true
    })
        .filter(candidate => {
        if (!includeAllActions && !['attack', 'occupy', 'wait'].includes(candidate.actionType))
            return false;
        if (requiredLanding && (candidate.row !== requiredLanding.row || candidate.col !== requiredLanding.col))
            return false;
        if (mustVacate && candidate.row === actionUnit.row && candidate.col === actionUnit.col)
            return false;
        return canStandOnMovementTarget(candidate.row, candidate.col, actionUnit.row, actionUnit.col);
    });
}
function clearHardAiSimulatedUnit(cell) {
    cell.unit = null;
    cell.unitTeam = null;
    cell.unitLevel = 0;
    cell.unitHealth = 0;
    cell.unitExp = 0;
    clearUnitStatus(cell);
    cell.unitStandby = false;
    cell.unitSupported = false;
    cell.unitRegisteredCommander = false;
    cell.unitTraceId = null;
}
function withHardAiSimulatedPairAction(actionUnit, candidate, callback) {
    const gridSnapshot = appData.gridData.map((gridRow, row) => gridRow.map((_, col) => snapshotCellForMove(row, col)));
    const originalTeams = appData.teams;
    const teamsSnapshot = JSON.parse(JSON.stringify(originalTeams));
    const pendingExpSnapshot = JSON.parse(JSON.stringify(appData.pendingExpEvents || []));
    const originalMoveAction = appData.currentMoveAction;
    const originalCell = appData.gridData[actionUnit.row][actionUnit.col];
    const originalUnit = getUnitDefinition(originalCell.unit);
    const assault = candidate.actionType === 'attack'
        && (originalUnit?.abilities || []).includes('突击部队');
    const assaultContext = assault ? {
        remainingMove: calculateMovementRange(actionUnit.row, actionUnit.col)
            .find(pos => pos.row === candidate.row && pos.col === candidate.col)?.remaining || 0,
        originSnapshot: snapshotCellForMove(actionUnit.row, actionUnit.col),
        enemyPositions: collectEnemyUnitPositions(originalCell.unitTeam),
        allyPositions: collectAllyUnitPositions(originalCell.unitTeam)
    } : null;
    try {
        return moveUnitForEvaluation(actionUnit.row, actionUnit.col, candidate.row, candidate.col, () => {
            const actor = appData.gridData[candidate.row][candidate.col];
            let targetSnapshot = null;
            let targetRow = null;
            let targetCol = null;
            let killedPosition = null;
            try {
                if (candidate.actionType === 'attack' && candidate.target) {
                    const legalTarget = calculateAttackTargets(candidate.row, candidate.col)
                        .find(item => item.row === candidate.target.row && item.col === candidate.target.col);
                    if (!legalTarget)
                        return null;
                    targetRow = legalTarget.row;
                    targetCol = legalTarget.col;
                    targetSnapshot = snapshotCellForMove(targetRow, targetCol);
                    const target = appData.gridData[targetRow][targetCol];
                    if (legalTarget.targetType === 'terrainHouse') {
                        target.terrain = 'rundown';
                        target.terrainTeam = null;
                        applyUnitExpAndLevel(actor, 30, true);
                    }
                    else {
                        const attacker = appData.units.find(item => item.id === actor.unit);
                        const defender = appData.units.find(item => item.id === target.unit);
                        const attackerAbilities = attacker?.abilities || [];
                        const defenderAbilities = defender?.abilities || [];
                        const originalAttackerStatus = actor.unitStatus;
                        const originalDefenderStatus = target.unitStatus;
                        const originalDefenderHealth = target.unitHealth;
                        target.unitHealth = Math.max(0, target.unitHealth - legalTarget.attackDamage);
                        applyUnitExpAndLevel(actor, target.unitHealth <= 0 ? 60 : 30, true);
                        if (attackerAbilities.includes('中毒') && !defenderAbilities.includes('中毒'))
                            applyUnitStatus(target, '中毒');
                        if (willInflictBlind(attackerAbilities, defenderAbilities, originalDefenderStatus))
                            applyUnitStatus(target, '致盲');
                        const counter = calculateCounterDamageAfterAttack(candidate.row, candidate.col, targetRow, targetCol, legalTarget.attackDamage, legalTarget.attackMode, originalDefenderHealth);
                        actor.unitHealth = Math.max(0, actor.unitHealth - counter.counterDamage);
                        if (counter.didCounter) {
                            if (willInflictBlind(defenderAbilities, attackerAbilities, originalAttackerStatus))
                                applyUnitStatus(actor, '致盲');
                            if (defenderAbilities.includes('中毒') && !attackerAbilities.includes('中毒'))
                                applyUnitStatus(actor, '中毒');
                        }
                        const attackerTeamId = actor.unitTeam;
                        if (target.unitHealth <= 0) {
                            killedPosition = { row: targetRow, col: targetCol,
                                isAir: (defenderAbilities || []).includes('空军') };
                            removeUnitAndMaybeCreateTombstone(targetRow, targetCol, attackerTeamId);
                        }
                        if (actor.unitHealth <= 0) {
                            removeUnitAndMaybeCreateTombstone(candidate.row, candidate.col, attackerTeamId);
                        }
                    }
                }
                else if (candidate.actionType === 'occupy') {
                    actor.terrainTeam = actor.unitTeam;
                }
                const finishAt = (row, col) => {
                    if (appData.gridData[row][col].unit)
                        processUnitStandbyEffects(row, col);
                    const simulatedMoveAction = appData.currentMoveAction;
                    appData.currentMoveAction = null;
                    try {
                        return callback();
                    }
                    finally {
                        appData.currentMoveAction = simulatedMoveAction;
                    }
                };
                if (actor.unit && assaultContext) {
                    appData.currentMoveAction = {
                        postAttackMoveOnly: true,
                        remainingMove: assaultContext.remainingMove,
                        assaultOrigin: { row: actionUnit.row, col: actionUnit.col },
                        assaultPotentialTarget: candidate.potentialTarget ? { ...candidate.potentialTarget } : null,
                        assaultEnemyPositions: assaultContext.enemyPositions,
                        assaultAllyPositions: assaultContext.allyPositions,
                        assaultKilledPosition: killedPosition,
                        assaultUnitSnapshot: assaultContext.originSnapshot
                    };
                    const finalMove = chooseAssaultMoveCandidate(candidate.row, candidate.col, assaultContext.remainingMove);
                    if (finalMove && (finalMove.row !== candidate.row || finalMove.col !== candidate.col)) {
                        return moveUnitForEvaluation(candidate.row, candidate.col, finalMove.row, finalMove.col, () => finishAt(finalMove.row, finalMove.col));
                    }
                }
                return finishAt(candidate.row, candidate.col);
            }
            finally {
                if (targetSnapshot)
                    restoreCellFromMoveSnapshot(targetRow, targetCol, targetSnapshot);
            }
        });
    }
    finally {
        gridSnapshot.forEach((gridRow, row) => gridRow.forEach((snapshot, col) => restoreCellFromMoveSnapshot(row, col, snapshot)));
        originalTeams.forEach((team, index) => {
            Object.keys(team).forEach(key => { delete team[key]; });
            Object.assign(team, teamsSnapshot[index]);
        });
        appData.teams = originalTeams;
        appData.pendingExpEvents = pendingExpSnapshot;
        appData.currentMoveAction = originalMoveAction;
    }
}
function getHardAiBestPairSecondAction(actionUnit, requiredLanding = null) {
    const cell = appData.gridData[actionUnit.row]?.[actionUnit.col];
    if (!cell?.unit || cell.unitStandby)
        return null;
    const candidates = getHardAiPairCandidates(actionUnit, requiredLanding, false, !requiredLanding);
    if (requiredLanding) {
        for (let i = candidates.length - 1; i >= 0; i--) {
            if (candidates[i].actionType === 'wait')
                candidates.splice(i, 1);
        }
    }
    return candidates.reduce((best, candidate) => {
        const score = getHardAiPairOperationScore(candidate);
        return !best || candidate.value > best.candidate.value
            || (candidate.value === best.candidate.value && score > best.score)
            ? { score, candidate } : best;
    }, null);
}
function evaluateHardAiPairOrder(first, second, requiredSecondLanding = null, firstMustVacate = false) {
    let best = null;
    getHardAiPairCandidates(first, null, firstMustVacate).forEach(firstCandidate => {
        const secondChoice = withHardAiSimulatedPairAction(first, firstCandidate, () => getHardAiBestPairSecondAction(second, requiredSecondLanding));
        if (!secondChoice)
            return;
        const operationScore = getHardAiPairOperationScore(firstCandidate);
        const score = operationScore + secondChoice.score;
        const totalScore = firstCandidate.value + secondChoice.candidate.value;
        if (!best || totalScore > best.totalScore
            || (totalScore === best.totalScore && score > best.score)) {
            best = { first, second, firstCandidate, secondCandidate: secondChoice.candidate, score, totalScore,
                requiredSecondLanding };
        }
    });
    return best;
}
function getHardAiUniqueOccupiedBestLanding(actionUnit, activeUnits) {
    const reachable = new Set(calculateMovementRange(actionUnit.row, actionUnit.col)
        .map(position => `${position.row},${position.col}`));
    const nearbyBlockers = activeUnits.filter(blocker => blocker !== actionUnit
        && reachable.has(`${blocker.row},${blocker.col}`));
    if (nearbyBlockers.length === 0)
        return null;
    const scoresByLanding = new Map();
    const record = candidate => {
        if (candidate.actionType !== 'attack' && candidate.actionType !== 'occupy')
            return;
        const key = `${candidate.row},${candidate.col}`;
        const score = getHardAiPairOperationScore(candidate);
        scoresByLanding.set(key, Math.max(scoresByLanding.get(key) ?? -Infinity, score));
    };
    getHardAiPairCandidates(actionUnit).forEach(record);
    const blockers = new Map();
    nearbyBlockers.forEach(blocker => {
        const key = `${blocker.row},${blocker.col}`;
        const snapshot = snapshotCellForMove(blocker.row, blocker.col);
        try {
            clearHardAiSimulatedUnit(appData.gridData[blocker.row][blocker.col]);
            getHardAiPairCandidates(actionUnit, { row: blocker.row, col: blocker.col })
                .forEach(record);
        }
        finally {
            restoreCellFromMoveSnapshot(blocker.row, blocker.col, snapshot);
        }
        if (scoresByLanding.has(key))
            blockers.set(key, blocker);
    });
    const bestScore = Math.max(0, ...scoresByLanding.values());
    if (bestScore <= 0)
        return null;
    const bestKeys = [...scoresByLanding.entries()].filter(([, score]) => score === bestScore);
    return bestKeys.length === 1 ? blockers.get(bestKeys[0][0]) || null : null;
}
function findHardAiPairPlan(activeUnits) {
    if (activeUnits.length < 2)
        return null;
    const first = activeUnits[0];
    const blocker = getHardAiUniqueOccupiedBestLanding(first, activeUnits);
    if (!blocker)
        return null;
    const normalFirst = chooseBestLandingCandidate(safeCalculateScoreList(calculateTotalScores, first.row, first.col), false);
    if (!normalFirst || !['attack', 'occupy', 'wait'].includes(normalFirst.actionType))
        return null;
    const normalSecond = withHardAiSimulatedPairAction(first, normalFirst, () => getHardAiBestPairSecondAction(blocker));
    if (!normalSecond)
        return null;
    const normalTotal = normalFirst.value + normalSecond.candidate.value;
    const blockerOrigin = { row: blocker.row, col: blocker.col };
    const reverse = evaluateHardAiPairOrder(blocker, first, blockerOrigin, true);
    if (!reverse)
        return null;
    const forward = evaluateHardAiPairOrder(first, blocker);
    const bestPair = forward && forward.totalScore >= reverse.totalScore ? forward : reverse;
    return bestPair.totalScore > normalTotal ? bestPair : null;
}
function describeHardAiPairCandidate(candidate) {
    return {
        row: candidate.row,
        col: candidate.col,
        actionType: candidate.actionType,
        targetRow: candidate.target?.row ?? null,
        targetCol: candidate.target?.col ?? null
    };
}
function findDescribedHardAiPairCandidate(candidates, description) {
    if (!description)
        return null;
    return candidates.find(candidate => candidate.row === description.row
        && candidate.col === description.col
        && candidate.actionType === description.actionType
        && (candidate.target?.row ?? null) === description.targetRow
        && (candidate.target?.col ?? null) === description.targetCol) || null;
}
function findHardAiDominantCaptureRoute(fromRow, fromCol, targetRow, targetCol) {
    const target = appData.gridData[targetRow]?.[targetCol];
    const actorTeamId = appData.gridData[fromRow]?.[fromCol]?.unitTeam;
    if (target?.unit && target.unitTeam !== actorTeamId) {
        const defenderSnapshot = snapshotCellForMove(targetRow, targetCol);
        let route;
        try {
            clearHardAiSimulatedUnit(target);
            route = findHardAiSafestHouseRoute(fromRow, fromCol, targetRow, targetCol, { allowUnvacatableFirstLanding: true });
        }
        finally {
            restoreCellFromMoveSnapshot(targetRow, targetCol, defenderSnapshot);
        }
        if (route?.reachable)
            return {
                route: { ...route, canOccupyOnArrival: false }, approach: true
            };
    }
    if (!target?.unit || target.unitTeam === actorTeamId) {
        const route = findHardAiSafestHouseRoute(fromRow, fromCol, targetRow, targetCol, { allowUnvacatableFirstLanding: true });
        if (route?.reachable && route.canOccupyOnArrival)
            return { route, approach: false };
    }
    let staging = [];
    for (let distance = 1; distance < appData.rows + appData.cols && !staging.length; distance++) {
        for (let row = 0; row < appData.rows; row++) {
            const offset = distance - Math.abs(row - targetRow);
            if (offset < 0)
                continue;
            for (const col of new Set([targetCol - offset, targetCol + offset])) {
                const cell = appData.gridData[row]?.[col];
                if (!cell || (cell.unit && cell.unitTeam !== actorTeamId))
                    continue;
                const route = findHardAiSafestHouseRoute(fromRow, fromCol, row, col, { allowAnyDestination: true, allowUnvacatableFirstLanding: true });
                if (route?.reachable)
                    staging.push(route);
            }
        }
    }
    staging.sort((a, b) => a.turnsToReach - b.turnsToReach
        || (b.minimumSafetyDistance ?? -1) - (a.minimumSafetyDistance ?? -1)
        || (b.totalSafetyDistance ?? -1) - (a.totalSafetyDistance ?? -1)
        || (a.firstLanding?.row ?? fromRow) - (b.firstLanding?.row ?? fromRow)
        || (a.firstLanding?.col ?? fromCol) - (b.firstLanding?.col ?? fromCol));
    return { route: staging[0] || null, approach: true };
}
function calculateHardAiTargetMoveCosts(actionUnit, targets) {
    const unit = actionUnit.unit;
    const originCell = appData.gridData[actionUnit.row][actionUnit.col];
    const teamId = originCell.unitTeam;
    const levelMove = ['commander', 'ghost', 'druid'].includes(unit.id)
        ? originCell.unitLevel || 0 : 0;
    const moveBudget = originCell.unitStatus === '虚弱' ? 1 : unit.move + levelMove;
    const width = appData.cols;
    const size = appData.rows * width;
    const distances = Array(size).fill(Infinity);
    const visited = Array(size).fill(false);
    distances[actionUnit.row * width + actionUnit.col] = 0;
    const directions = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    const previousBlocking = appData.demoEnemyMovementBlocking;
    appData.demoEnemyMovementBlocking = true;
    try {
        for (let count = 0; count < size; count++) {
            let current = -1;
            for (let index = 0; index < size; index++) {
                if (!visited[index] && (current < 0
                    || distances[index] < distances[current]))
                    current = index;
            }
            if (current < 0 || !Number.isFinite(distances[current]))
                break;
            visited[current] = true;
            const row = Math.floor(current / width);
            const col = current % width;
            for (const [dr, dc] of directions) {
                const nextRow = row + dr;
                const nextCol = col + dc;
                if (nextRow < 0 || nextRow >= appData.rows
                    || nextCol < 0 || nextCol >= width
                    || isEnemyMovementBlocker(nextRow, nextCol, teamId, unit))
                    continue;
                const cost = calculateMoveCost(nextRow, nextCol, unit);
                if (!Number.isFinite(cost) || cost < 0 || cost > moveBudget)
                    continue;
                const next = nextRow * width + nextCol;
                distances[next] = Math.min(distances[next], distances[current] + cost);
            }
        }
        const targetCosts = new Map();
        for (const target of targets) {
            const index = target.row * width + target.col;
            if (!isEnemyMovementBlocker(target.row, target.col, teamId, unit)) {
                targetCosts.set(target.key, distances[index]);
                continue;
            }
            const enteringCost = calculateMoveCost(target.row, target.col, unit);
            let best = Infinity;
            if (Number.isFinite(enteringCost) && enteringCost >= 0
                && enteringCost <= moveBudget) {
                for (const [dr, dc] of directions) {
                    const neighborRow = target.row + dr;
                    const neighborCol = target.col + dc;
                    if (neighborRow < 0 || neighborRow >= appData.rows
                        || neighborCol < 0 || neighborCol >= width)
                        continue;
                    best = Math.min(best, distances[neighborRow * width + neighborCol] + enteringCost);
                }
            }
            targetCosts.set(target.key, best);
        }
        return targetCosts;
    }
    finally {
        appData.demoEnemyMovementBlocking = previousBlocking;
    }
}
function calculateHardAiPriorityBuildingPlan(teamId, orderedUnits = null, reservedTargetKeys = []) {
    if (!isHardAiTeam(teamId))
        return { assignments: [] };
    const team = appData.teams.find(item => item.id === teamId);
    const baseUnits = orderedUnits || collectTeamActionUnits(teamId);
    const units = baseUnits.filter(actionUnit => !appData.gridData[actionUnit.row][actionUnit.col].unitStandby
        && (actionUnit.unit.abilities || []).some(ability => ability === '占领' || ability === '修复'));
    if (!team || !units.length)
        return { assignments: [] };
    if (!orderedUnits) {
        const allUnits = collectTeamActionUnits(teamId);
        const globalCapacity = getActionOrderCapacity(getTotalUnitCount());
        allUnits.forEach(unit => { unit.globalBucket = unit.hash % globalCapacity; });
        applyActionOrderBuckets(units, allUnits, getActionOrderCapacity(units.length));
        if (units.length < 15) {
            units.forEach(unit => { unit.refined = getHardAiRefinedOrderMetrics(unit); });
            units.sort(compareHardAiRefinedUnits);
        }
        else {
            units.forEach(unit => { unit.priority = getHardAiActionPriority(unit); });
            units.sort((a, b) => a.priority - b.priority || compareActionOrderUnits(a, b));
        }
    }
    const assignmentOrder = [...units.filter(actionUnit => actionUnit.unit.id === 'commander'),
        ...units.filter(actionUnit => actionUnit.unit.id !== 'commander')];
    const reservedTargets = new Set(reservedTargetKeys);
    const targets = calculateHardAiBuildingAllocationTargets(teamId)
        .filter(target => !reservedTargets.has(target.key));
    for (const phase of [0, 1]) {
        const phaseTargets = targets.filter(target => target.phase === phase);
        if (!phaseTargets.length)
            continue;
        const assignedTargets = new Set();
        const assignments = [];
        for (const actionUnit of assignmentOrder) {
            let movementCosts = null;
            const unitTargets = [...phaseTargets].sort((a, b) => {
                const rankDifference = a.rank - b.rank;
                if (rankDifference)
                    return rankDifference;
                const eDifference = phase === 0 ? a.correctedE - b.correctedE
                    : b.correctedE - a.correctedE;
                if (eDifference)
                    return eDifference;
                if (!movementCosts) {
                    movementCosts = calculateHardAiTargetMoveCosts(actionUnit, phaseTargets);
                }
                const costA = movementCosts.get(a.key);
                const costB = movementCosts.get(b.key);
                if (costA !== costB)
                    return costA - costB;
                if (a.houseOwnerTieRank !== b.houseOwnerTieRank) {
                    return a.houseOwnerTieRank - b.houseOwnerTieRank;
                }
                return a.row - b.row || a.col - b.col;
            });
            for (const target of unitTargets) {
                if (assignedTargets.has(target.key))
                    continue;
                const eligible = target.terrain === 'rundown'
                    ? getRepairScoreForCell(target.row, target.col, actionUnit.unit, teamId) !== null
                    : getOccupyScoreForCell(target.row, target.col, actionUnit.unit, team) !== null;
                if (!eligible)
                    continue;
                const { route, approach } = findHardAiDominantCaptureRoute(actionUnit.row, actionUnit.col, target.row, target.col);
                if (!route?.reachable || (!approach && !route.canOccupyOnArrival))
                    continue;
                const targetCell = appData.gridData[target.row][target.col];
                const blocked = (!!route.requiresVacate && !canHardAiVacateBlockingCell(route.requiresVacate.row, route.requiresVacate.col, target.row, target.col))
                    || (!!targetCell.unit && targetCell.unitTeam === teamId
                        && (actionUnit.row !== target.row || actionUnit.col !== target.col)
                        && !canHardAiVacateBlockingCell(target.row, target.col, target.row, target.col));
                assignedTargets.add(target.key);
                assignments.push({
                    house: { row: target.row, col: target.col },
                    targetType: target.terrain,
                    originalE: target.originalE,
                    firstCommanderTarget: assignments.length === 0
                        && actionUnit.unit.id === 'commander',
                    route, approach, blocked, dominant: true,
                    unit: { row: actionUnit.row, col: actionUnit.col,
                        unitId: actionUnit.unit.id,
                        unitTraceId: actionUnit.unitTraceId || null }
                });
                break;
            }
        }
        if (assignments.length)
            return { assignments, phase };
    }
    return { assignments: [] };
}
function getHardAiCastleSeizureState(teamId, activeUnits) {
    const commander = activeUnits.find(unit => unit.unit.id === 'commander');
    if (!commander)
        return null;
    const team = appData.teams.find(item => item.id === teamId);
    if (!team)
        return null;
    const empty = [];
    const guarded = [];
    const reachable = () => new Set(calculateMovementRange(commander.row, commander.col)
        .map(position => `${position.row},${position.col}`));
    const normalReachable = reachable();
    for (let row = 0; row < appData.rows; row++) {
        for (let col = 0; col < appData.cols; col++) {
            const cell = appData.gridData[row][col];
            if (cell.terrain !== 'castle' || !cell.terrainTeam)
                continue;
            const owner = appData.teams.find(item => item.id === cell.terrainTeam);
            if (!owner || owner.alliance === team.alliance)
                continue;
            const key = `${row},${col}`;
            if (!cell.unit) {
                if (normalReachable.has(key))
                    empty.push({ row, col });
            }
            else if (cell.unitTeam !== teamId) {
                const snapshot = snapshotCellForMove(row, col);
                let canReach = false;
                try {
                    clearHardAiSimulatedUnit(cell);
                    canReach = reachable().has(key);
                }
                finally {
                    restoreCellFromMoveSnapshot(row, col, snapshot);
                }
                if (canReach)
                    guarded.push({ row, col });
            }
        }
    }
    if (empty.length)
        return { commander, ready: true, targets: empty };
    if (guarded.length)
        return { commander, ready: false, targets: guarded };
    return null;
}
function getHardAiBlockadeRemainingHealth(actionUnit, castle, enemyUnits) {
    const actor = appData.gridData[actionUnit.row][actionUnit.col];
    if (!(actor.unitHealth > 50))
        return -Infinity;
    const health = actor.unitHealth;
    const evaluate = () => {
        let maximumDamage = 0;
        for (const enemy of enemyUnits) {
            const enemyCell = appData.gridData[enemy.row]?.[enemy.col];
            const enemyUnit = getUnitDefinition(enemyCell?.unit);
            if (!enemyUnit)
                continue;
            const previousStandby = enemyCell.unitStandby;
            enemyCell.unitStandby = false;
            try {
                for (const landing of calculateMovementRange(enemy.row, enemy.col)) {
                    if (!canStandOnMovementTarget(landing.row, landing.col, enemy.row, enemy.col))
                        continue;
                    const distance = Math.abs(landing.row - castle.row)
                        + Math.abs(landing.col - castle.col);
                    if (distance < enemyUnit.minRange || distance > enemyUnit.maxRange)
                        continue;
                    const target = moveUnitForEvaluation(enemy.row, enemy.col, landing.row, landing.col, () => calculateAttackTargets(landing.row, landing.col).find(item => item.row === castle.row && item.col === castle.col));
                    if (target)
                        maximumDamage = Math.max(maximumDamage, target.attackDamage || 0);
                }
            }
            finally {
                enemyCell.unitStandby = previousStandby;
            }
        }
        return health - maximumDamage;
    };
    const previousBlocking = appData.demoEnemyMovementBlocking;
    appData.demoEnemyMovementBlocking = true;
    try {
        return actionUnit.row === castle.row && actionUnit.col === castle.col
            ? evaluate()
            : moveUnitForEvaluation(actionUnit.row, actionUnit.col, castle.row, castle.col, evaluate);
    }
    finally {
        appData.demoEnemyMovementBlocking = previousBlocking;
    }
}
function getHardAiCastleBlockadeState(teamId, activeUnits) {
    const commander = activeUnits.find(unit => unit.unit.id === 'commander');
    const team = appData.teams.find(item => item.id === teamId);
    if (!commander || !team)
        return null;
    const enemyCastles = new Map();
    const enemyUnits = new Map();
    for (let row = 0; row < appData.rows; row++) {
        for (let col = 0; col < appData.cols; col++) {
            const cell = appData.gridData[row][col];
            const owner = appData.teams.find(item => item.id === cell.terrainTeam);
            if (cell.terrain === 'castle' && owner
                && owner.alliance !== team.alliance && owner.playerType !== 0) {
                const castles = enemyCastles.get(owner.alliance) || [];
                castles.push({ row, col });
                enemyCastles.set(owner.alliance, castles);
            }
            if (cell.unit && cell.unitTeam) {
                const unitTeam = appData.teams.find(item => item.id === cell.unitTeam);
                if (unitTeam && unitTeam.alliance !== team.alliance
                    && unitTeam.playerType !== 0) {
                    const units = enemyUnits.get(unitTeam.alliance) || [];
                    units.push({ row, col });
                    enemyUnits.set(unitTeam.alliance, units);
                }
            }
        }
    }
    const commanderReachable = new Set(calculateMovementRange(commander.row, commander.col).map(item => `${item.row},${item.col}`));
    for (const [alliance, castles] of enemyCastles) {
        if (castles.length !== 1 || (enemyUnits.get(alliance) || []).length >= 2)
            continue;
        const castle = castles[0];
        const castleCell = appData.gridData[castle.row][castle.col];
        const occupant = activeUnits.find(unit => unit.row === castle.row
            && unit.col === castle.col);
        const occupiedByOwnTeam = castleCell.unit && castleCell.unitTeam === teamId;
        if (castleCell.unit && !occupiedByOwnTeam)
            continue;
        const enemies = enemyUnits.get(alliance) || [];
        if (occupant) {
            const safe = getHardAiBlockadeRemainingHealth(occupant, castle, enemies) > 50;
            if (!safe || commanderReachable.has(`${castle.row},${castle.col}`)) {
                if (canHardAiVacateBlockingCell(castle.row, castle.col, castle.row, castle.col)) {
                    return { unit: occupant, role: 'vacate', ...castle };
                }
            }
            else {
                return { unit: occupant, role: 'garrison', ...castle };
            }
        }
        else if (!occupiedByOwnTeam) {
            const candidates = activeUnits.filter(unit => unit.unit.id !== 'commander'
                && appData.gridData[unit.row][unit.col].unitHealth > 50
                && calculateMovementRange(unit.row, unit.col).some(landing => landing.row === castle.row && landing.col === castle.col))
                .map(unit => ({ unit, remaining: getHardAiBlockadeRemainingHealth(unit, castle, enemies) }))
                .filter(item => item.remaining > 50)
                .sort((a, b) => b.remaining - a.remaining
                || compareActionOrderUnits(a.unit, b.unit));
            if (candidates.length) {
                return { unit: candidates[0].unit, role: 'garrison', ...castle };
            }
        }
        let route = findHardAiSafestHouseRoute(commander.row, commander.col, castle.row, castle.col, { allowUnvacatableFirstLanding: true });
        if (!route?.reachable || !route.firstLanding)
            continue;
        let landing = route.firstLanding;
        const blocker = activeUnits.find(unit => unit.row === landing.row
            && unit.col === landing.col && unit !== commander);
        if (blocker && canHardAiVacateBlockingCell(blocker.row, blocker.col, landing.row, landing.col)) {
            return { unit: blocker, role: 'vacate', row: landing.row, col: landing.col };
        }
        if (appData.gridData[landing.row][landing.col].unit) {
            route = findHardAiSafestHouseRoute(commander.row, commander.col, castle.row, castle.col);
            landing = route?.firstLanding;
            if (!landing) {
                return { unit: commander, role: 'fallback',
                    row: castle.row, col: castle.col };
            }
        }
        if (landing && !appData.gridData[landing.row][landing.col].unit) {
            return { unit: commander, role: 'advance', row: landing.row, col: landing.col };
        }
    }
    return null;
}
function calculateHardAiTeamActionOrder(teamId) {
    const teamUnits = collectTeamActionUnits(teamId);
    const activeUnits = teamUnits.filter(unit => !appData.gridData[unit.row]?.[unit.col]?.unitStandby);
    if (activeUnits.length === 0)
        return [];
    const turn = appData.demoTeamTurn?.teamId === teamId ? appData.demoTeamTurn : null;
    if (turn)
        turn.hardAiBuildingAssignments = [];
    const globalCapacity = getActionOrderCapacity(getTotalUnitCount());
    teamUnits.forEach(unit => { unit.globalBucket = unit.hash % globalCapacity; });
    const capacity = getActionOrderCapacity(activeUnits.length);
    applyActionOrderBuckets(activeUnits, teamUnits, capacity);
    if (activeUnits.length < 15) {
        activeUnits.forEach(unit => { unit.refined = getHardAiRefinedOrderMetrics(unit); });
        activeUnits.sort(compareHardAiRefinedUnits);
    }
    else {
        activeUnits.forEach(unit => { unit.priority = getHardAiActionPriority(unit); });
        activeUnits.sort((a, b) => a.priority - b.priority || compareActionOrderUnits(a, b));
    }
    const strategicPlan = calculateHardAiPriorityBuildingPlan(teamId, activeUnits, turn?.hardAiReservedBuildingTargets || []);
    if (turn)
        turn.hardAiBuildingAssignments = strategicPlan.assignments;
    for (const unit of activeUnits) {
        unit.hardAiBuildingAssignment = strategicPlan.assignments.find(assignment => assignment.unit.row === unit.row && assignment.unit.col === unit.col
            && assignment.unit.unitId === unit.unit.id) || null;
    }
    const captureReadyHouses = getHardAiCaptureReadyHouseKeys(teamId);
    const houseBlockers = activeUnits.filter(unit => !(unit.unit.abilities || []).includes('占领')
        && captureReadyHouses.has(`${unit.row},${unit.col}`));
    const castleSeizure = getHardAiCastleSeizureState(teamId, activeUnits);
    const castleBlockade = !castleSeizure
        ? getHardAiCastleBlockadeState(teamId, activeUnits) : null;
    if ((castleSeizure || castleBlockade || houseBlockers.length) && turn)
        turn.actionQueue = null;
    const queued = turn?.actionQueue;
    const hasQueuedPair = queued?.kind === 'hardAiPair';
    const hasPreferredHouseGuard = activeUnits.length < 15 && !hasQueuedPair
        && !castleBlockade
        && !houseBlockers.length
        && promoteBestHardAiHouseGuard(activeUnits);
    if (hasQueuedPair) {
        const nextIndex = activeUnits.findIndex(unit => unit.row === queued.row && unit.col === queued.col
            && unit.unit.id === queued.unitId);
        if (nextIndex >= 0) {
            const [next] = activeUnits.splice(nextIndex, 1);
            next.hardAiPairPending = queued;
            activeUnits.unshift(next);
        }
        else {
            turn.actionQueue = null;
        }
    }
    else if (activeUnits.length < 15 && !hasPreferredHouseGuard
        && !castleSeizure && !castleBlockade && !houseBlockers.length) {
        const plan = findHardAiPairPlan(activeUnits);
        if (plan) {
            const firstIndex = activeUnits.indexOf(plan.first);
            if (firstIndex > 0)
                activeUnits.unshift(activeUnits.splice(firstIndex, 1)[0]);
            plan.first.hardAiPairFirstCandidate = describeHardAiPairCandidate(plan.firstCandidate);
            plan.first.hardAiPairNext = {
                kind: 'hardAiPair',
                row: plan.second.row,
                col: plan.second.col,
                unitId: plan.second.unit.id,
                candidate: describeHardAiPairCandidate(plan.secondCandidate),
                requiredLanding: plan.requiredSecondLanding
            };
        }
    }
    if (castleSeizure) {
        const commanderIndex = activeUnits.indexOf(castleSeizure.commander);
        activeUnits.splice(commanderIndex, 1);
        if (castleSeizure.ready) {
            castleSeizure.commander.hardAiCastleSeizure = {
                ready: true, targets: castleSeizure.targets
            };
            activeUnits.unshift(castleSeizure.commander);
        }
        else {
            activeUnits.push(castleSeizure.commander);
        }
    }
    if (castleBlockade) {
        const index = activeUnits.indexOf(castleBlockade.unit);
        if (index >= 0)
            activeUnits.unshift(activeUnits.splice(index, 1)[0]);
        castleBlockade.unit.hardAiCastleBlockade = {
            role: castleBlockade.role,
            row: castleBlockade.row,
            col: castleBlockade.col
        };
    }
    if (!castleSeizure?.ready && !castleBlockade) {
        for (let index = houseBlockers.length - 1; index >= 0; index--) {
            const blocker = houseBlockers[index];
            activeUnits.splice(activeUnits.indexOf(blocker), 1);
            activeUnits.unshift(blocker);
        }
    }
    activeUnits.forEach((unit, index) => { unit.actionOrder = index + 1; });
    if (turn) {
        turn.hardAiInsightOrder = activeUnits.map(unit => ({
            row: unit.row, col: unit.col, unitId: unit.unit.id,
            target: unit.hardAiBuildingAssignment?.house || null,
            forcedRole: unit.hardAiCastleSeizure?.ready ? 'seize'
                : unit.hardAiCastleBlockade?.role || null
        }));
    }
    return activeUnits;
}
function calculateNextTeamActionUnit(teamId) {
    if (isHardAiTeam(teamId))
        return calculateHardAiTeamActionOrder(teamId)[0] || null;
    const teamUnits = collectTeamActionUnits(teamId);
    if (teamUnits.length === 0)
        return null;
    const remainingTeamUnits = teamUnits.filter(u => {
        const cell = appData.gridData[u.row]?.[u.col];
        return cell && cell.unit && cell.unitTeam === teamId && !cell.unitStandby;
    });
    if (remainingTeamUnits.length === 0)
        return null;
    const globalCapacity = getActionOrderCapacity(getTotalUnitCount());
    teamUnits.forEach(u => {
        u.globalBucket = u.hash % globalCapacity;
    });
    const capacity = getActionOrderCapacity(remainingTeamUnits.length);
    const tierGroups = {
        1: [],
        2: [],
        3: [],
        4: []
    };
    remainingTeamUnits.forEach(u => {
        tierGroups[u.tier].push(u);
    });
    for (let tier = 1; tier <= 4; tier++) {
        const candidates = tierGroups[tier];
        if (candidates.length === 0)
            continue;
        applyActionOrderBuckets(candidates, remainingTeamUnits, capacity);
        candidates.sort(compareActionOrderUnits);
        const nextUnit = candidates[0];
        nextUnit.actionOrder = 1;
        return nextUnit;
    }
    return null;
}
function calculateTeamActionOrder(teamId, options = {}) {
    if (isHardAiTeam(teamId))
        return calculateHardAiTeamActionOrder(teamId);
    const teamUnits = collectTeamActionUnits(teamId);
    const standbyTeamUnits = teamUnits.filter(u => {
        const cell = appData.gridData[u.row]?.[u.col];
        return cell && cell.unitStandby;
    });
    const actionTeamUnits = teamUnits.filter(u => {
        const cell = appData.gridData[u.row]?.[u.col];
        return cell && !cell.unitStandby;
    });
    const bucketScope = options.bucketScope || 'remaining';
    const N = teamUnits.length;
    if (actionTeamUnits.length === 0)
        return [];
    let totalUnits = getTotalUnitCount();
    let globalCapacity = getActionOrderCapacity(totalUnits);
    teamUnits.forEach(u => {
        u.globalBucket = u.hash % globalCapacity;
    });
    const tierGroups = {
        1: [],
        2: [],
        3: [],
        4: []
    };
    actionTeamUnits.forEach(u => {
        tierGroups[u.tier].push(u);
    });
    const sortedUnits = [];
    for (let tier = 1; tier <= 4; tier++) {
        let unsorted = [...tierGroups[tier]];
        if (unsorted.length === 0)
            continue;
        while (unsorted.length > 0) {
            const remainingUnits = N - sortedUnits.length;
            let capacity = getActionOrderCapacity(remainingUnits);
            let bucketCountUnits = teamUnits;
            if (bucketScope === 'remaining') {
                bucketCountUnits = [...standbyTeamUnits, ...unsorted];
                for (let laterTier = tier + 1; laterTier <= 4; laterTier++) {
                    bucketCountUnits.push(...tierGroups[laterTier]);
                }
            }
            applyActionOrderBuckets(unsorted, bucketCountUnits, capacity);
            unsorted.sort(compareActionOrderUnits);
            const nextUnit = unsorted.shift();
            sortedUnits.push(nextUnit);
        }
    }
    sortedUnits.forEach((unit, index) => {
        unit.actionOrder = index + 1;
    });
    return sortedUnits;
}
function calculateActionOrderForTeam(row, col, teamId) {
    const cell = appData.gridData[row][col];
    if (!cell.unit || cell.unitTeam !== teamId) {
        return null;
    }
    const teamActionOrder = calculateTeamActionOrder(teamId);
    const unitAction = teamActionOrder.find(unit => unit.row === row && unit.col === col);
    return unitAction ? unitAction.actionOrder : null;
}
function calculateActionOrder(row, col) {
    const cell = appData.gridData[row][col];
    if (!cell.unit)
        return null;
    const selectedTeamId = document.getElementById('calcTeam').value;
    return calculateActionOrderForTeam(row, col, selectedTeamId);
}
function collectEnemyUnitPositions(selectedTeamId) {
    const selectedTeam = appData.teams.find(t => t.id === selectedTeamId);
    if (!selectedTeam)
        return [];
    const selectedAlliance = selectedTeam.alliance;
    const targetPositions = [];
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const targetCell = appData.gridData[i][j];
            if (!targetCell.unit)
                continue;
            const targetTeam = appData.teams.find(t => t.id === targetCell.unitTeam);
            if (targetTeam && targetTeam.alliance !== selectedAlliance) {
                targetPositions.push({ row: i, col: j });
            }
        }
    }
    return targetPositions;
}
function getActiveAiAssaultSnapshot(teamId = null) {
    const action = appData.currentMoveAction;
    if (!action || !action.postAttackMoveOnly || !appData.selectedCell)
        return null;
    const selectedCell = appData.gridData[appData.selectedCell.row]?.[appData.selectedCell.col];
    if (!selectedCell || !selectedCell.unit || !selectedCell.unitTeam)
        return null;
    if (teamId && selectedCell.unitTeam !== teamId)
        return null;
    const selectedTeam = appData.teams.find(t => t.id === selectedCell.unitTeam);
    if (!selectedTeam || !isAiPlayerType(selectedTeam.playerType))
        return null;
    const selectedUnit = appData.units.find(u => u.id === selectedCell.unit);
    if (!selectedUnit || !(selectedUnit.abilities || []).includes('突击部队'))
        return null;
    return action;
}
function calculateEnemyDistance(row, col, selectedTeamId = null, targetPositionsOverride = null) {
    const teamId = selectedTeamId || document.getElementById('calcTeam').value;
    const selectedTeam = appData.teams.find(t => t.id === teamId);
    if (!selectedTeam)
        return 0;
    const assaultSnapshot = getActiveAiAssaultSnapshot(teamId);
    const unitPositions = Array.isArray(targetPositionsOverride)
        ? targetPositionsOverride
        : assaultSnapshot && Array.isArray(assaultSnapshot.assaultEnemyPositions)
            ? assaultSnapshot.assaultEnemyPositions
            : collectEnemyUnitPositions(teamId);
    const targetPositions = isHardAiTeam(teamId)
        ? [...unitPositions, ...collectHardAiCastleDistancePositions(teamId, true)]
        : unitPositions;
    if (targetPositions.length === 0)
        return 0;
    let totalDistance = 0;
    targetPositions.forEach(pos => {
        const distance = Math.abs(row - pos.row) + Math.abs(col - pos.col);
        totalDistance += distance;
    });
    const average = totalDistance / targetPositions.length;
    return isHardAiTeam(teamId) ? roundHardAiDistance(average) : Math.floor(100 * average) / 100;
}
function collectAllyUnitPositions(selectedTeamId, options = {}) {
    const selectedTeam = appData.teams.find(t => t.id === selectedTeamId);
    if (!selectedTeam)
        return [];
    const selectedAlliance = selectedTeam.alliance;
    const targetPositions = [];
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const targetCell = appData.gridData[i][j];
            if (!targetCell.unit)
                continue;
            const targetTeam = appData.teams.find(t => t.id === targetCell.unitTeam);
            if (targetTeam && targetTeam.alliance === selectedAlliance) {
                const shouldReplace = options.replacePosition
                    && i === options.replacePosition.row
                    && j === options.replacePosition.col
                    && options.withPosition;
                targetPositions.push(shouldReplace
                    ? { row: options.withPosition.row, col: options.withPosition.col }
                    : { row: i, col: j });
            }
        }
    }
    return targetPositions;
}
function calculateAllyDistance(row, col, selectedTeamId = null, targetPositionsOverride = null) {
    const teamId = selectedTeamId || document.getElementById('calcTeam').value;
    const selectedTeam = appData.teams.find(t => t.id === teamId);
    if (!selectedTeam)
        return 0;
    const assaultSnapshot = getActiveAiAssaultSnapshot(teamId);
    const unitPositions = Array.isArray(targetPositionsOverride)
        ? targetPositionsOverride
        : assaultSnapshot && Array.isArray(assaultSnapshot.assaultAllyPositions)
            ? assaultSnapshot.assaultAllyPositions
            : collectAllyUnitPositions(teamId);
    const targetPositions = isHardAiTeam(teamId)
        ? [...unitPositions, ...collectHardAiCastleDistancePositions(teamId, false)]
        : unitPositions;
    if (targetPositions.length === 0)
        return 0;
    let totalDistance = 0;
    targetPositions.forEach(pos => {
        const distance = Math.abs(row - pos.row) + Math.abs(col - pos.col);
        totalDistance += distance;
    });
    const average = totalDistance / targetPositions.length;
    return isHardAiTeam(teamId) ? roundHardAiDistance(average) : Math.floor(100 * average) / 100;
}
function calculateDistanceDifference(row, col, selectedTeamId = null) {
    const hard = isHardAiTeam(selectedTeamId || document.getElementById('calcTeam').value);
    const enemyDistance = calculateEnemyDistance(row, col, selectedTeamId);
    const enemyAvgDistance = hard ? enemyDistance : Math.floor(enemyDistance);
    const allyDistance = calculateAllyDistance(row, col, selectedTeamId);
    const allyAvgDistance = hard ? allyDistance : Math.floor(allyDistance);
    const difference = enemyAvgDistance - allyAvgDistance;
    let backgroundColor = null;
    if (difference < 0) {
        backgroundColor = '#fed7d7';
    }
    else {
        backgroundColor = '#c6f6d5';
    }
    return {
        value: difference,
        backgroundColor: backgroundColor
    };
}
function calculateDistanceDetails(row, col, selectedTeamId = null) {
    const enemyAvgDistance = calculateEnemyDistance(row, col, selectedTeamId);
    const allyAvgDistance = calculateAllyDistance(row, col, selectedTeamId);
    let backgroundColor = null;
    if (enemyAvgDistance < allyAvgDistance) {
        backgroundColor = '#fed7d7';
    }
    else {
        backgroundColor = '#c6f6d5';
    }
    return {
        value: `${enemyAvgDistance} | ${allyAvgDistance}`,
        backgroundColor: backgroundColor,
        enemyDistance: enemyAvgDistance,
        allyDistance: allyAvgDistance
    };
}
function hasAttackTarget(row, col) {
    const cell = appData.gridData[row][col];
    if (!cell.unit)
        return false;
    const unit = appData.units.find(u => u.id === cell.unit);
    if (cell.unitStatus === "致盲" && !unit.abilities.includes("城主") && !unit.abilities.includes("占领") && !unit.abilities.includes("修复"))
        return false;
    const unitTeam = appData.teams.find(t => t.id === cell.unitTeam);
    const alliance = unitTeam.alliance;
    const reachablePositions = calculateMovementRange(row, col);
    for (const pos of reachablePositions) {
        let x = pos.row;
        let y = pos.col;
        const moveCell = appData.gridData[x][y];
        const moveTerrain = moveCell.terrain ? appData.terrains.find(t => t.id === moveCell.terrain) : null;
        const terrainTeam = appData.teams.find(t => t.id === moveCell.terrainTeam);
        if (moveCell.unit && !(x === row && y === col))
            continue;
        if (moveTerrain.name === "城堡" && (!terrainTeam || terrainTeam.alliance !== alliance) && unit.abilities.includes("城主") && (!moveCell.unit || (x === row && y === col))) {
            return true;
        }
        if (moveTerrain.name === "房子" && (!terrainTeam || terrainTeam.alliance !== alliance) && unit.abilities.includes("占领") && (!moveCell.unit || (x === row && y === col))) {
            return true;
        }
        if (moveTerrain.name === "破房" && unit.abilities.includes("修复") && (!moveCell.unit || (x === row && y === col))) {
            return true;
        }
        if (cell.unitStatus === "致盲")
            return false;
        if (unit.abilities.includes("召唤")) {
            const summonDirections = getRangeRelativeCoordinates(unit.minRange || 1, unit.maxRange || 1, false);
            for (const [dx, dy] of summonDirections) {
                const summonRow = x + dx;
                const summonCol = y + dy;
                if (summonRow < 0 || summonRow >= appData.rows || summonCol < 0 || summonCol >= appData.cols)
                    continue;
                const summonCell = appData.gridData[summonRow][summonCol];
                if (summonCell && summonCell.tombstone && !summonCell.unit) {
                    return true;
                }
            }
        }
        for (let i = 0; i < appData.rows; i++) {
            for (let j = 0; j < appData.cols; j++) {
                const distance = Math.abs(i - pos.row) + Math.abs(j - pos.col);
                if (distance < unit.minRange || distance > unit.maxRange)
                    continue;
                const targetCell = appData.gridData[i][j];
                const targetTeam = appData.teams.find(t => t.id === targetCell.unitTeam);
                if (targetTeam) {
                    if (targetTeam.alliance !== alliance) {
                        return true;
                    }
                    else if (unit.abilities.includes("治疗") || unit.abilities.includes("支援")) {
                        if (i === row && j === col)
                            continue;
                        return true;
                    }
                }
            }
        }
    }
    return false;
}
function getTerrains(terrain, teamId, type = "team") {
    let position = [];
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const targetCell = appData.gridData[i][j];
            const moveTerrain = moveCell.terrain ? appData.terrains.find(t => t.id === moveCell.terrain) : null;
            if (moveTerrain === terrain) {
                if (type === "team" && teamId === targetCell.terrainTeam) {
                    ;
                }
            }
        }
    }
}
function getTerrains(terrain, teamId, type = "team") {
    let positions = [];
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const targetCell = appData.gridData[i][j];
            if (!targetCell.terrain)
                continue;
            const terrainObj = appData.terrains.find(t => t.id === targetCell.terrain);
            if (!terrainObj)
                continue;
            if (terrainObj.name !== terrain)
                continue;
            if (type === "team") {
                if (targetCell.terrainTeam === teamId) {
                    positions.push({ row: i, col: j });
                }
            }
            else if (type === "ally") {
                const teamObj = appData.teams.find(t => t.id === teamId);
                if (teamObj) {
                    const terrainTeamObj = appData.teams.find(t => t.id === targetCell.terrainTeam);
                    if (terrainTeamObj && terrainTeamObj.alliance === teamObj.alliance) {
                        positions.push({ row: i, col: j });
                    }
                }
            }
            else if (type === "enemy") {
                const teamObj = appData.teams.find(t => t.id === teamId);
                if (teamObj) {
                    const terrainTeamObj = appData.teams.find(t => t.id === targetCell.terrainTeam);
                    if (!terrainTeamObj || terrainTeamObj.alliance !== teamObj.alliance) {
                        positions.push({ row: i, col: j });
                    }
                }
            }
            else {
                positions.push({ row: i, col: j });
            }
        }
    }
    return positions;
}
function hasTwoCloserHardAiBuildingUnits(position, actorRow, actorCol, teamId, ability) {
    const actorDistance = Math.abs(position.row - actorRow) + Math.abs(position.col - actorCol);
    let closerCount = 0;
    for (let row = 0; row < appData.rows; row++) {
        for (let col = 0; col < appData.cols; col++) {
            const cell = appData.gridData[row][col];
            if (!cell.unit || cell.unitTeam !== teamId || (row === actorRow && col === actorCol))
                continue;
            const unit = appData.units.find(item => item.id === cell.unit);
            if (!(unit?.abilities || []).includes(ability))
                continue;
            if (Math.abs(position.row - row) + Math.abs(position.col - col) >= actorDistance)
                continue;
            if (++closerCount >= 2)
                return true;
        }
    }
    return false;
}
function calculatePotentialAttackTargets(row, col, options = {}) {
    const cell = appData.gridData[row][col];
    const unit = appData.units.find(u => u.id === cell.unit);
    const unitTeam = appData.teams.find(t => t.id === cell.unitTeam);
    const alliance = unitTeam.alliance;
    const actorMinRange = cell.unitStatus === "致盲" ? 0 : unit.minRange;
    const assaultSnapshot = options.ignoreAssaultSnapshot
        ? null
        : getActiveAiAssaultSnapshot(unitTeam.id);
    if (assaultSnapshot && assaultSnapshot.assaultPotentialTarget) {
        return [{ ...assaultSnapshot.assaultPotentialTarget }];
    }
    const originRow = options.origin ? options.origin.row : row;
    const originCol = options.origin ? options.origin.col : col;
    let bestScore = -Infinity;
    let bestTargets = [];
    let allTargets = [];
    const addPotentialTarget = (target) => {
        allTargets.push(target);
        if (target.value > bestScore) {
            bestScore = target.value;
            bestTargets = [target];
        }
        else if (target.value === bestScore) {
            bestTargets.push(target);
        }
    };
    let potentialCastles = [];
    if (unit.abilities.includes("城主")) {
        potentialCastles = getTerrains("城堡", null, "all").filter(position => !appData.gridData[position.row]?.[position.col]?.terrainTeam);
        for (const team of appData.teams) {
            if (team.alliance === alliance)
                continue;
            let teamUnitCount = 0;
            for (let ri = 0; ri < appData.rows; ri++) {
                for (let ci = 0; ci < appData.cols; ci++) {
                    if (appData.gridData[ri][ci].unitTeam === team.id)
                        teamUnitCount++;
                }
            }
            if (teamUnitCount <= 1 && team.gold < 400) {
                potentialCastles = potentialCastles.concat(getTerrains("城堡", team.id, "team"));
            }
        }
    }
    let potentialHouses = unit.abilities.includes("占领")
        ? getTerrains("房子", unitTeam.id, "enemy") : [];
    let potentialRundowns = unit.abilities.includes("修复")
        ? getTerrains("破房", unitTeam.id, isHardAiTeam(unitTeam.id) ? "all" : "enemy") : [];
    const potentialBuildings = [...potentialCastles, ...potentialHouses, ...potentialRundowns];
    if (isHardAiTeam(unitTeam.id) && potentialBuildings.length > 0) {
        const targetSet = calculateHardAiBuildingTargetSet(unitTeam.id);
        const isOwnAdvantage = position => !!targetSet.details.get(`${position.row},${position.col}`)?.core;
        const stillNeeded = (position, ability) => !isOwnAdvantage(position)
            || !hasTwoCloserHardAiBuildingUnits(position, originRow, originCol, unitTeam.id, ability);
        potentialCastles = potentialCastles.filter(position => targetSet.castles.has(`${position.row},${position.col}`)
            && stillNeeded(position, '城主'));
        potentialHouses = potentialHouses.filter(position => targetSet.houses.has(`${position.row},${position.col}`)
            && stillNeeded(position, '占领'));
        potentialRundowns = potentialRundowns.filter(position => targetSet.rundowns.has(`${position.row},${position.col}`)
            && stillNeeded(position, '修复'));
    }
    let distanceMin = 55;
    if (unit.abilities.includes("城主")) {
        const positions1 = potentialCastles;
        for (let k = 0; k < positions1.length; k++) {
            let position = positions1[k];
            let i = position.row;
            let j = position.col;
            const distance = Math.abs(i - originRow) + Math.abs(j - originCol);
            const score = 55 - distance;
            addPotentialTarget({ row: i, col: j, value: score, targetType: 'terrainCastle' });
            if (distance < distanceMin) {
                distanceMin = distance;
            }
        }
    }
    if (unit.abilities.includes("占领") && distanceMin === 55) {
        const positions2 = potentialHouses;
        for (let k = 0; k < positions2.length; k++) {
            let position = positions2[k];
            let i = position.row;
            let j = position.col;
            const distance = Math.abs(i - originRow) + Math.abs(j - originCol);
            const score = 55 - distance;
            addPotentialTarget({ row: i, col: j, value: score, targetType: 'terrainHouse' });
            if (distance < distanceMin) {
                distanceMin = distance;
            }
        }
    }
    if (unit.abilities.includes("修复") && distanceMin === 55) {
        const positions3 = potentialRundowns;
        for (let k = 0; k < positions3.length; k++) {
            let position = positions3[k];
            let i = position.row;
            let j = position.col;
            const distance = Math.abs(i - originRow) + Math.abs(j - originCol);
            const score = 55 - distance;
            addPotentialTarget({ row: i, col: j, value: score, targetType: 'terrainRundown' });
            if (distance < distanceMin) {
                distanceMin = distance;
            }
        }
    }
    if (distanceMin === 55) {
        for (let i = 0; i < appData.rows; i++) {
            for (let j = 0; j < appData.cols; j++) {
                const targetCell = appData.gridData[i][j];
                if (!targetCell.unit)
                    continue;
                const targetTeam = appData.teams.find(t => t.id === targetCell.unitTeam);
                if (!targetTeam || targetTeam.alliance === alliance)
                    continue;
                const targetUnit = appData.units.find(u => u.id === targetCell.unit);
                const distance = Math.abs(i - originRow) + Math.abs(j - originCol);
                const defense = (unit.type === "物理") ? targetUnit.physDef : targetUnit.magicDef;
                let score = unit.attack + unit.atkUp * cell.unitLevel - defense - 5 * targetCell.unitLevel;
                if (actorMinRange > 1) {
                    score /= 2;
                }
                if (unit.abilities.includes("神射手") && targetUnit.abilities.includes("空军")) {
                    score += 15;
                }
                score -= 5 * distance;
                addPotentialTarget({ row: i, col: j, value: score });
            }
        }
    }
    return options.includeAll ? allTargets : bestTargets;
}
function calculateLegacyPotentialSupportTargets(row, col) {
    const cell = appData.gridData[row][col];
    if (!cell.unit)
        return [];
    const currentTeam = appData.teams.find(t => t.id === cell.unitTeam);
    if (!currentTeam)
        return [];
    const results = [];
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            if (i === row && j === col)
                continue;
            const targetCell = appData.gridData[i][j];
            if (!targetCell.unit)
                continue;
            const targetTeam = appData.teams.find(t => t.id === targetCell.unitTeam);
            if (!targetTeam || targetTeam.alliance !== currentAlliance)
                continue;
            const distance = Math.abs(row - i) + Math.abs(col - j);
            const healthFactor = Math.floor((100 - targetCell.unitHealth) / 10);
            const distanceFactor = distance > 0 ? Math.floor(10 / distance) : 10;
            const score = distanceFactor + healthFactor;
            results.push({
                row: i,
                col: j,
                value: score
            });
        }
    }
    return results;
}
function getPotentialSupportValue(unit, unitCell) {
    if (!unit || !unitCell)
        return 0;
    const level = unitCell.unitLevel || 0;
    const abilities = unit.abilities || [];
    const attack = unit.attack + unit.atkUp * level;
    const maxHp = 100 + unit.hpUp * level;
    let value = attack - 20;
    if (abilities.includes("战意"))
        value += 20 + 10 * level;
    if (abilities.includes("召唤"))
        value += 15 + 15 * level;
    if (abilities.includes("治疗") || abilities.includes("净化光环"))
        value += 15 + 5 * level;
    if (abilities.includes("近战大师"))
        value += 10 + 5 * level;
    if (abilities.includes("神射手") || abilities.includes("水之子")
        || abilities.includes("山之子") || abilities.includes("森林之子")) {
        value += 5;
    }
    return Math.floor(value * unitCell.unitHealth / maxHp);
}
function calculatePotentialSupportTargets(row, col) {
    const cell = appData.gridData[row]?.[col];
    if (!cell || !cell.unit)
        return [];
    const actor = appData.units.find(u => u.id === cell.unit);
    const currentTeam = appData.teams.find(t => t.id === cell.unitTeam);
    if (!actor || !currentTeam)
        return [];
    const actorValue = getPotentialSupportValue(actor, cell);
    let maxValue = -Infinity;
    let target = null;
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const targetCell = appData.gridData[i][j];
            if (!targetCell.unit || targetCell.unitTeam !== currentTeam.id)
                continue;
            const targetUnit = appData.units.find(u => u.id === targetCell.unit);
            const value = getPotentialSupportValue(targetUnit, targetCell);
            if (value > actorValue && value > maxValue) {
                maxValue = value;
                target = { row: i, col: j, value, targetType: 'unitSupport' };
            }
        }
    }
    return target ? [target] : [];
}
function calculatePotentialHealTargets(row, col) {
    const cell = appData.gridData[row][col];
    if (!cell.unit)
        return [];
    const currentTeam = appData.teams.find(t => t.id === cell.unitTeam);
    if (!currentTeam)
        return [];
    const results = [];
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            if (i === row && j === col)
                continue;
            const targetCell = appData.gridData[i][j];
            if (!targetCell.unit)
                continue;
            if (targetCell.unitTeam !== currentTeam.id)
                continue;
            const targetUnit = appData.units.find(u => u.id === targetCell.unit);
            const score = getAiScoringUnitValue(targetUnit, targetCell.unitLevel, targetCell.unitTeam, i, j, currentTeam.id);
            results.push({
                row: i,
                col: j,
                value: score
            });
        }
    }
    return results;
}
function calculatePotentialMoveTargets(row, col, options = {}) {
    const cell = appData.gridData[row]?.[col];
    if (!cell || !cell.unit)
        return [];
    const actor = appData.units.find(u => u.id === cell.unit);
    if (!actor)
        return [];
    const attackTargets = calculatePotentialAttackTargets(row, col, options);
    const buildingTargets = attackTargets.filter(isPotentialBuildingTarget);
    if (buildingTargets.length > 0)
        return buildingTargets;
    const abilities = actor.abilities || [];
    if (abilities.includes("支援"))
        return calculatePotentialSupportTargets(row, col);
    if (abilities.includes("治疗")) {
        return calculatePotentialHealTargets(row, col)
            .map(target => ({ ...target, targetType: 'unitHeal' }));
    }
    return attackTargets;
}
function calculateMoveCost(row, col, Unit) {
    const selectCell = appData.gridData[row][col];
    if (!selectCell.terrain)
        return 1;
    const terrain = selectCell.terrain ? appData.terrains.find(t => t.id === selectCell.terrain) : null;
    let terrainMoveCost = terrain.moveCost;
    const UnitAbilities = Unit.abilities;
    if (UnitAbilities.includes("空军")) {
        terrainMoveCost = 1;
    }
    if (UnitAbilities.includes("水之子") && WaterTerrain.includes(terrain.name)) {
        terrainMoveCost = 1;
    }
    if (UnitAbilities.includes("山之子") && MountainTerrain.includes(terrain.name)) {
        terrainMoveCost = 1;
    }
    if (UnitAbilities.includes("森林之子") && terrain.name === "树林") {
        terrainMoveCost = 1;
    }
    if (UnitAbilities.includes("大地之子")) {
        if (WaterTerrain.includes(terrain.name)) {
            terrainMoveCost += 1;
        }
        else {
            terrainMoveCost = 1;
        }
    }
    return terrainMoveCost;
}
function isEnemyMovementBlocker(row, col, movingTeamId, movingUnit = null) {
    const shouldBlock = appData.demoEnemyMovementBlocking
        || (appData.activePanel === 'moveMode' && appData.moveModeConsiderEnemyBlockers);
    if (!shouldBlock)
        return false;
    const assaultSnapshot = getActiveAiAssaultSnapshot(movingTeamId);
    const killedPosition = assaultSnapshot && assaultSnapshot.assaultKilledPosition;
    if (killedPosition && row === killedPosition.row && col === killedPosition.col) {
        const movingAbilities = movingUnit?.abilities || [];
        if (!movingAbilities.includes("空军"))
            return true;
        return !!killedPosition.isAir;
    }
    const cell = appData.gridData[row]?.[col];
    if (!cell || !cell.unit || !cell.unitTeam)
        return false;
    const movingTeam = appData.teams.find(team => team.id === movingTeamId);
    const blockingTeam = appData.teams.find(team => team.id === cell.unitTeam);
    if (!movingTeam || !blockingTeam)
        return false;
    if (blockingTeam.alliance === movingTeam.alliance)
        return false;
    const movingAbilities = movingUnit?.abilities || [];
    if (!movingAbilities.includes("空军"))
        return true;
    const blockingUnit = appData.units.find(unit => unit.id === cell.unit);
    return !!(blockingUnit?.abilities || []).includes("空军");
}
function calculateMovementRange(row, col, moveOverride = null, options = {}) {
    const selectCell = appData.gridData[row][col];
    const movingCell = options.movingCellOverride || selectCell;
    if (!selectCell.unit)
        return [];
    const selectUnit = appData.units.find(u => u.id === (movingCell.unit || selectCell.unit));
    const movingTeamId = movingCell.unitTeam || selectCell.unitTeam;
    const UnitLevel = movingCell.unitLevel ?? selectCell.unitLevel;
    const UnitAbilities = selectUnit.abilities;
    const hasMoveOverride = moveOverride !== null && moveOverride !== undefined;
    let UnitMove = hasMoveOverride ? moveOverride : selectUnit.move;
    if (!hasMoveOverride) {
        if (selectUnit.name === "指挥官" || selectUnit.name === "幽灵" || selectUnit.name === "德鲁伊") {
            UnitMove += UnitLevel;
        }
    }
    if (!hasMoveOverride && (movingCell.unitStatus ?? selectCell.unitStatus) === "虚弱") {
        UnitMove = 1;
    }

    // 地形代价和阻挡仍由原脚本计算，GPU只接手确定性的图搜索。
    let acceleratedRange = null;
    if (environment.movementRange) {
        const prepared = environment.nativeCompute ? prepareHardNativeMovement(selectUnit,movingTeamId) : null;
        const costs = prepared ? prepared.costs : [], blocked = prepared ? prepared.blocked : [], terrainCosts = new Map();
        if (!prepared)
        for (let r = 0; r < appData.rows; r++) for (let c = 0; c < appData.cols; c++) {
            const terrain = appData.gridData[r][c].terrain;
            if (!terrainCosts.has(terrain)) terrainCosts.set(terrain, calculateMoveCost(r, c, selectUnit));
            costs.push(terrainCosts.get(terrain));
            blocked.push(isEnemyMovementBlocker(r, c, movingTeamId, selectUnit) ? 1 : 0);
        }
        const rangeKey = prepared ? prepared.key+'/'+row+','+col+','+UnitMove : null;
        const cachedRange = prepared && prepared.ranges.get(rangeKey);
        let packedRange = cachedRange;
        if(!packedRange) {
            acceleratedRange = environment.movementRange({rows:appData.rows, cols:appData.cols, row, col, move:UnitMove, costs, blocked});
            if(prepared){packedRange=packHardNativeRange(acceleratedRange);prepared.ranges.set(rangeKey,packedRange,packedRange.byteLength);}
        }
        // 仅内部只读威胁查询消费紧凑范围；普通调用仍返回独立对象。
        if(packedRange&&options.nativeRangeConsumer)return options.nativeRangeConsumer(packedRange);
        if(!acceleratedRange)acceleratedRange=unpackHardNativeRange(packedRange);
        if (!environment.verifyMovementBatch) return acceleratedRange;
    }
    const queue = [];
    const maxRemaining = new Map();
    const reachablePositions = [];
    const startKey = `${row},${col}`;
    queue.push({ x: row, y: col, remaining: UnitMove });
    maxRemaining.set(startKey, UnitMove);
    reachablePositions.push({
        row: row,
        col: col,
        remaining: UnitMove
    });
    const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    while (queue.length > 0) {
        const current = queue.shift();
        for (const [dx, dy] of directions) {
            const newX = current.x + dx;
            const newY = current.y + dy;
            if (newX >= 0 && newX < appData.rows && newY >= 0 && newY < appData.cols) {
                if (isEnemyMovementBlocker(newX, newY, movingTeamId, selectUnit))
                    continue;
                const key = `${newX},${newY}`;
                const cellCost = calculateMoveCost(newX, newY, selectUnit);
                const newRemaining = current.remaining - cellCost;
                if (newRemaining >= 0) {
                    const existingRemaining = maxRemaining.get(key) || -1;
                    if (newRemaining > existingRemaining) {
                        maxRemaining.set(key, newRemaining);
                        queue.push({ x: newX, y: newY, remaining: newRemaining });
                        const existingIndex = reachablePositions.findIndex(pos => pos.row === newX && pos.col === newY);
                        if (existingIndex === -1) {
                            reachablePositions.push({
                                row: newX,
                                col: newY,
                                remaining: newRemaining
                            });
                        }
                        else {
                            reachablePositions[existingIndex].remaining = newRemaining;
                        }
                    }
                }
            }
        }
    }

    if (acceleratedRange && JSON.stringify(acceleratedRange) !== JSON.stringify(reachablePositions)) throw Error('GPU移动范围的候选顺序或剩余移动力不同');
    return acceleratedRange || reachablePositions;
}
function canHardAiVacateBlockingCell(row, col, targetRow, targetCol, ignoreStandby = false) {
    const cell = appData.gridData[row]?.[col];
    if (!cell?.unit || (cell.unitStandby && !ignoreStandby))
        return false;
    return calculateMovementRange(row, col).some(landing => (landing.row !== row || landing.col !== col)
        && (landing.row !== targetRow || landing.col !== targetCol)
        && canStandOnMovementTarget(landing.row, landing.col, row, col));
}
function findHardAiSafestHouseRoute(fromRow, fromCol, houseRow, houseCol, options = {}) {
    const actorCell = appData.gridData[fromRow]?.[fromCol];
    const houseCell = appData.gridData[houseRow]?.[houseCol];
    const actorTeam = appData.teams.find(team => team.id === actorCell?.unitTeam);
    const actorUnit = appData.units.find(unit => unit.id === actorCell?.unit);
    if (!actorCell?.unit || !actorTeam || !actorUnit
        || (!options.allowOtherTeams && !isHardAiTeam(actorTeam.id))
        || (!options.allowAnyDestination
            && houseCell?.terrain !== 'house' && houseCell?.terrain !== 'castle'
            && houseCell?.terrain !== 'rundown'))
        return null;
    const enemies = collectEnemyUnitPositions(actorTeam.id);
    const noEnemyDistance = appData.rows + appData.cols + 1;
    const safetyAt = (row, col) => enemies.length
        ? Math.min(...enemies.map(enemy => Math.abs(row - enemy.row) + Math.abs(col - enemy.col)))
        : noEnemyDistance;
    const keyOf = (row, col) => `${row},${col}`;
    const startKey = keyOf(fromRow, fromCol);
    const goalKey = keyOf(houseRow, houseCol);
    const houseOccupantTeam = appData.teams.find(team => team.id === houseCell.unitTeam);
    const houseBlockedByOtherTeam = !!houseCell.unit && startKey !== goalKey
        && houseOccupantTeam?.id !== actorTeam.id;
    const canOccupyOnArrival = !houseBlockedByOtherTeam
        && (houseCell.terrain === 'rundown'
            ? getRepairScoreForCell(houseRow, houseCol, actorUnit, actorTeam.id) !== null
            : getOccupyScoreForCell(houseRow, houseCol, actorUnit, actorTeam) !== null);
    const result = (reachable, route = [], minimumSafetyDistance = null, totalSafetyDistance = null) => ({
        reachable,
        turnsToReach: reachable ? route.length : null,
        route,
        firstLanding: route[0] || null,
        minimumSafetyDistance,
        totalSafetyDistance,
        canOccupyOnArrival,
        requiresVacate: route[0]?.requiresVacate || null
    });
    if (startKey === goalKey)
        return result(true);
    if (houseBlockedByOtherTeam)
        return result(false);
    const positions = new Map([[startKey, { row: fromRow, col: fromCol }]]);
    const turns = new Map([[startKey, 0]]);
    const edges = new Map();
    const queue = [startKey];
    const previousBlocking = appData.demoEnemyMovementBlocking;
    appData.demoEnemyMovementBlocking = true;
    try {
        const ownOccupant = (row, col) => {
            const cell = appData.gridData[row]?.[col];
            return cell?.unit && cell.unitTeam === actorTeam.id
                && (row !== fromRow || col !== fromCol) ? cell : null;
        };
        const canVacateNow = (row, col) => {
            const blocker = ownOccupant(row, col);
            if (!blocker || (!options.allowOtherTeams && blocker.unitStandby))
                return false;
            return canHardAiVacateBlockingCell(row, col, houseRow, houseCol, !!options.allowOtherTeams);
        };
        const nextLandings = key => {
            if (edges.has(key))
                return edges.get(key);
            const position = positions.get(key);
            const reachable = moveUnitForEvaluation(fromRow, fromCol, position.row, position.col, () => calculateMovementRange(position.row, position.col));
            const landings = reachable.filter(landing => (landing.row !== position.row || landing.col !== position.col)
                && (!appData.gridData[landing.row][landing.col].unit
                    || !!ownOccupant(landing.row, landing.col)))
                .map(({ row, col }) => ({ row, col, key: keyOf(row, col) }))
                .sort((a, b) => a.row - b.row || a.col - b.col);
            edges.set(key, landings);
            return landings;
        };
        for (let head = 0; head < queue.length; head++) {
            const key = queue[head];
            if (turns.has(goalKey) && turns.get(key) >= turns.get(goalKey))
                break;
            for (const landing of nextLandings(key)) {
                if (!options.allowUnvacatableFirstLanding
                    && turns.get(key) === 0 && ownOccupant(landing.row, landing.col)
                    && !canVacateNow(landing.row, landing.col))
                    continue;
                if (turns.has(landing.key))
                    continue;
                positions.set(landing.key, { row: landing.row, col: landing.col });
                turns.set(landing.key, turns.get(key) + 1);
                queue.push(landing.key);
            }
        }
        if (!turns.has(goalKey))
            return result(false);
        const minimumTurns = turns.get(goalKey);
        const firstTurnWeight = appData.rows * appData.cols + 1;
        const occupiedCost = (key, landing) => ownOccupant(landing.row, landing.col)
            ? 1 + (turns.get(key) === 0 ? firstTurnWeight : 0) : 0;
        const bestOccupiedCost = new Map([[startKey, 0]]);
        for (const key of queue) {
            const depth = turns.get(key);
            if (depth >= minimumTurns || !bestOccupiedCost.has(key))
                continue;
            for (const landing of nextLandings(key)) {
                if (turns.get(landing.key) !== depth + 1)
                    continue;
                const candidate = bestOccupiedCost.get(key) + occupiedCost(key, landing);
                if (candidate < (bestOccupiedCost.get(landing.key) ?? Infinity)) {
                    bestOccupiedCost.set(landing.key, candidate);
                }
            }
        }
        const remainingOccupiedCost = new Map([[goalKey, 0]]);
        for (let index = queue.length - 1; index >= 0; index--) {
            const key = queue[index];
            const depth = turns.get(key);
            if (depth >= minimumTurns)
                continue;
            for (const landing of nextLandings(key)) {
                if (turns.get(landing.key) !== depth + 1
                    || !remainingOccupiedCost.has(landing.key))
                    continue;
                const candidate = occupiedCost(key, landing)
                    + remainingOccupiedCost.get(landing.key);
                if (candidate < (remainingOccupiedCost.get(key) ?? Infinity)) {
                    remainingOccupiedCost.set(key, candidate);
                }
            }
        }
        const optimalOccupiedCost = bestOccupiedCost.get(goalKey);
        const preservesOccupiedOptimum = (key, landing) => bestOccupiedCost.has(key) && remainingOccupiedCost.has(landing.key)
            && bestOccupiedCost.get(key) + occupiedCost(key, landing)
                + remainingOccupiedCost.get(landing.key) === optimalOccupiedCost;
        const bestMinimum = new Map([[startKey, Infinity]]);
        for (const key of queue) {
            const depth = turns.get(key);
            if (depth >= minimumTurns || !bestMinimum.has(key))
                continue;
            for (const landing of nextLandings(key)) {
                if (turns.get(landing.key) !== depth + 1
                    || !preservesOccupiedOptimum(key, landing))
                    continue;
                const candidate = Math.min(bestMinimum.get(key), safetyAt(landing.row, landing.col));
                if (candidate > (bestMinimum.get(landing.key) ?? -Infinity)) {
                    bestMinimum.set(landing.key, candidate);
                }
            }
        }
        const safetyFloor = bestMinimum.get(goalKey);
        const bestTotal = new Map([[startKey, 0]]);
        const parent = new Map();
        for (const key of queue) {
            const depth = turns.get(key);
            if (depth >= minimumTurns || !bestTotal.has(key))
                continue;
            for (const landing of nextLandings(key)) {
                if (turns.get(landing.key) !== depth + 1
                    || !preservesOccupiedOptimum(key, landing))
                    continue;
                const safety = safetyAt(landing.row, landing.col);
                if (safety < safetyFloor)
                    continue;
                const candidate = bestTotal.get(key) + safety;
                if (candidate > (bestTotal.get(landing.key) ?? -Infinity)) {
                    bestTotal.set(landing.key, candidate);
                    parent.set(landing.key, key);
                }
            }
        }
        const route = [];
        for (let key = goalKey; key !== startKey; key = parent.get(key)) {
            const position = positions.get(key);
            const blocker = ownOccupant(position.row, position.col);
            route.push({
                turn: turns.get(key), row: position.row, col: position.col,
                nearestEnemyDistance: enemies.length ? safetyAt(position.row, position.col) : null,
                requiresVacate: blocker && turns.get(key) === 1 ? {
                    row: position.row, col: position.col,
                    unitId: blocker.unit,
                    unitTraceId: blocker.unitTraceId || null
                } : null
            });
        }
        route.reverse();
        return result(true, route, enemies.length ? safetyFloor : null, enemies.length ? bestTotal.get(goalKey) : null);
    }
    finally {
        appData.demoEnemyMovementBlocking = previousBlocking;
    }
}
function getRangeRelativeCoordinates(minRange, maxRange, includeCenter = false) {
    const coordinates = [];
    for (let dx = -maxRange; dx <= maxRange; dx++) {
        for (let dy = -maxRange; dy <= maxRange; dy++) {
            const distance = Math.abs(dx) + Math.abs(dy);
            const inRange = distance >= minRange && distance <= maxRange;
            const isCenter = dx === 0 && dy === 0;
            const includeThisPoint = includeCenter ? true : !isCenter;
            if (inRange && includeThisPoint) {
                coordinates.push([dx, dy]);
            }
        }
    }
    return coordinates;
}
function getMockeryCoefficient(row, col, attackerTeam) {
    if (appData.fixedMockeryCoefficient)
        return 1;
    const buildingType = isHardAiTeam(attackerTeam?.id) ? '城堡' : null;
    return IsThreatUnit(row, col, attackerTeam, buildingType) ? 2 : 1;
}
function willInflictBlind(attackerAbilities, defenderAbilities, defenderStatus) {
    return (attackerAbilities || []).includes('致盲')
        && !(defenderAbilities || []).includes('致盲')
        && canApplyUnitStatus(defenderStatus, '致盲');
}
function getCounterDefenseStatus(defenseStatus, defenseAbilities, attackerAbilities) {
    let statusAfterAttack = defenseStatus || '无';
    if ((attackerAbilities || []).includes('中毒')
        && !(defenseAbilities || []).includes('中毒')
        && canApplyUnitStatus(statusAfterAttack, '中毒')) {
        statusAfterAttack = '中毒';
    }
    if (willInflictBlind(attackerAbilities, defenseAbilities, defenseStatus)
        && canApplyUnitStatus(statusAfterAttack, '致盲')) {
        statusAfterAttack = '致盲';
    }
    return statusAfterAttack;
}
function canCounterAttackAtDistance(attackDistance, defenseMinRange, defenseAbilities, defenseStatus, attackerAbilities) {
    const abilities = defenseAbilities || [];
    const counterDefenseStatus = getCounterDefenseStatus(defenseStatus, abilities, attackerAbilities);
    const stormCounter = abilities.includes('反击风暴') && attackDistance <= 2;
    if (stormCounter)
        return true;
    if (attackDistance >= 3)
        return false;
    if (attackDistance === 2)
        return false;
    if (defenseMinRange > 1)
        return false;
    return counterDefenseStatus !== '致盲';
}
function IsThreatUnit(row, col, team, buildingType = null) {
    const cell = appData.gridData[row][col];
    if (!cell.unit)
        return false;
    const currentUnitTeam = appData.teams.find(t => t.id === cell.unitTeam);
    if (!currentUnitTeam)
        return false;
    const previousDemoEnemyMovementBlocking = appData.demoEnemyMovementBlocking;
    const previousMoveModeConsiderEnemyBlockers = appData.moveModeConsiderEnemyBlockers;
    appData.demoEnemyMovementBlocking = false;
    appData.moveModeConsiderEnemyBlockers = false;
    let reachablePositions = [];
    let acceleratedThreat;
    try {

        // 范围函数仍检查当前视图及移动预算；只省去解包、重复威胁计算。
        const options=environment.nativeCompute&&environment.movementRange
            ? {nativeRangeConsumer:packed=>consumeHardNativeThreat(packed,team,unitHasStandardAbility(cell.unit,'占领'),buildingType)} : {};
        reachablePositions = calculateMovementRange(row, col, null, options);
        if(typeof reachablePositions==='boolean'){
            acceleratedThreat=reachablePositions;
            if(!environment.verifyMovementBatch)return acceleratedThreat;
            reachablePositions=calculateMovementRange(row,col);
        }
    }
    finally {
        appData.demoEnemyMovementBlocking = previousDemoEnemyMovementBlocking;
        appData.moveModeConsiderEnemyBlockers = previousMoveModeConsiderEnemyBlockers;
    }

    if(environment.nativeCompute){
        // 上方移动范围刚检查过网格，至此只恢复阻挡开关，没有改动网格或元数据。
        const encoded=environment.movementRange&&hardNativeViewCache?hardNativeViewCache:readHardNativeView(),nativeTeam=team&&encoded.teams.get(team.id),positions=Float64Array.from(reachablePositions,p=>p.row*appData.cols+p.col);
        const result=environment.nativeCompute.threat(encoded.view,positions,nativeTeam?nativeTeam.id:0,unitHasStandardAbility(cell.unit,'占领')?1:0,!buildingType?0:buildingType==='房子'?1:buildingType==='城堡'?2:3);
        if(!environment.verifyMovementBatch)return result;
        // 验证阶段保留完整上游分支，任一返回点均核对结果。
        const expected=(() => {     for (let k = 0; k < reachablePositions.length; k++) {
        const position = reachablePositions[k];
        const moveRow = position.row;
        const moveCol = position.col;
        const moveCell = appData.gridData[moveRow][moveCol];
        if (!moveCell.terrain)
            continue;
        const moveTerrain = appData.terrains.find(t => t.id === moveCell.terrain);
        if (moveTerrain?.name !== "房子" && moveTerrain?.name !== "城堡")
            continue;
        if (buildingType && moveTerrain.name !== buildingType)
            continue;
        const terrainTeam = appData.teams.find(t => t.id === moveCell.terrainTeam);
        if (terrainTeam && team && terrainTeam.id === team.id) {
            if (moveTerrain?.name === "房子") {
                if (unitHasStandardAbility(cell.unit, "占领")) {
                    return true;
                }
            }
            else {
                if (moveCell.unit && moveCell.unitStandby === true)
                    continue;
                return true;
            }
        }
    }
    return false; })();
        if(result!==expected||acceleratedThreat!==undefined&&acceleratedThreat!==expected)throw Error('原生威胁过滤与原表达式不一致');
        return result;
    }
    for (let k = 0; k < reachablePositions.length; k++) {
        const position = reachablePositions[k];
        const moveRow = position.row;
        const moveCol = position.col;
        const moveCell = appData.gridData[moveRow][moveCol];
        if (!moveCell.terrain)
            continue;
        const moveTerrain = appData.terrains.find(t => t.id === moveCell.terrain);
        if (moveTerrain?.name !== "房子" && moveTerrain?.name !== "城堡")
            continue;
        if (buildingType && moveTerrain.name !== buildingType)
            continue;
        const terrainTeam = appData.teams.find(t => t.id === moveCell.terrainTeam);
        if (terrainTeam && team && terrainTeam.id === team.id) {
            if (moveTerrain?.name === "房子") {
                if (unitHasStandardAbility(cell.unit, "占领")) {
                    return true;
                }
            }
            else {
                if (moveCell.unit && moveCell.unitStandby === true)
                    continue;
                return true;
            }
        }
    }
    return false;
}
function getGuardPriority(unitId) {
    return {
        rock: 3,
        waterelement: 2,
        infantry: 1
    }[unitId] || 0;
}
function canAffordBetterCastleGuard(teamId, currentUnitId) {
    const currentPriority = getGuardPriority(currentUnitId);
    const gold = getTeamGold(teamId);
    return ['waterelement', 'infantry'].some(unitId => {
        if (getGuardPriority(unitId) < currentPriority)
            return false;
        return gold >= getRecruitCost(unitId, teamId);
    });
}
function isTeamBuildingThreatenedByEnemyMover(buildingRow, buildingCol, buildingType, defendingTeamId) {
    const defendingTeam = appData.teams.find(t => t.id === defendingTeamId);
    if (!defendingTeam)
        return false;
    const buildingCell = appData.gridData[buildingRow]?.[buildingCol];
    if (buildingType === 'castle') {
        if (!buildingCell || buildingCell.terrain !== 'castle' || buildingCell.terrainTeam !== defendingTeamId)
            return false;
        if (buildingCell.unit && buildingCell.unitStandby === true)
            return false;
    }
    const previousDemoEnemyMovementBlocking = appData.demoEnemyMovementBlocking;
    const previousMoveModeConsiderEnemyBlockers = appData.moveModeConsiderEnemyBlockers;
    appData.demoEnemyMovementBlocking = false;
    appData.moveModeConsiderEnemyBlockers = false;
    try {
        for (let i = 0; i < appData.rows; i++) {
            for (let j = 0; j < appData.cols; j++) {
                const enemyCell = appData.gridData[i][j];
                if (!enemyCell || !enemyCell.unit || !enemyCell.unitTeam)
                    continue;
                const enemyTeam = appData.teams.find(t => t.id === enemyCell.unitTeam);
                if (!enemyTeam || enemyTeam.alliance === defendingTeam.alliance)
                    continue;
                const enemyUnit = getUnitDefinition(enemyCell.unit);
                if (!enemyUnit)
                    continue;
                const abilities = enemyUnit.abilities || [];
                if (buildingType === 'house' && !abilities.includes('占领'))
                    continue;
                if (buildingType === 'castle' && !abilities.includes('城主'))
                    continue;
                const reachable = calculateMovementRange(i, j);
                if (reachable.some(pos => pos.row === buildingRow && pos.col === buildingCol)) {
                    return true;
                }
            }
        }
    }
    finally {
        appData.demoEnemyMovementBlocking = previousDemoEnemyMovementBlocking;
        appData.moveModeConsiderEnemyBlockers = previousMoveModeConsiderEnemyBlockers;
    }
    return false;
}
function isTeamOwnedBuildingThreatenedForSupport(row, col, teamId) {
    const defendingTeam = appData.teams.find(t => t.id === teamId);
    const buildingCell = appData.gridData[row]?.[col];
    if (!defendingTeam || !buildingCell || buildingCell.terrainTeam !== teamId)
        return false;
    const buildingTerrain = buildingCell.terrain ? appData.terrains.find(t => t.id === buildingCell.terrain) : null;
    if (!buildingTerrain || (buildingTerrain.name !== "房子" && buildingTerrain.name !== "城堡"))
        return false;
    const previousDemoEnemyMovementBlocking = appData.demoEnemyMovementBlocking;
    const previousMoveModeConsiderEnemyBlockers = appData.moveModeConsiderEnemyBlockers;
    appData.demoEnemyMovementBlocking = false;
    appData.moveModeConsiderEnemyBlockers = false;
    try {
        for (let i = 0; i < appData.rows; i++) {
            for (let j = 0; j < appData.cols; j++) {
                const enemyCell = appData.gridData[i][j];
                if (!enemyCell || !enemyCell.unit || !enemyCell.unitTeam)
                    continue;
                const enemyTeam = appData.teams.find(t => t.id === enemyCell.unitTeam);
                if (!enemyTeam || enemyTeam.alliance === defendingTeam.alliance)
                    continue;
                const enemyUnit = getUnitDefinition(enemyCell.unit);
                if (!enemyUnit)
                    continue;
                const enemyAbilities = enemyUnit.abilities || [];
                if (buildingTerrain.name === "房子" && !enemyAbilities.includes("占领"))
                    continue;
                if (buildingTerrain.name === "城堡" && !enemyAbilities.includes("城主"))
                    continue;
                if (calculateMovementRange(i, j).some(pos => pos.row === row && pos.col === col)) {
                    return true;
                }
            }
        }
    }
    finally {
        appData.demoEnemyMovementBlocking = previousDemoEnemyMovementBlocking;
        appData.moveModeConsiderEnemyBlockers = previousMoveModeConsiderEnemyBlockers;
    }
    return false;
}
function getThreatenedOwnCastles(teamId) {
    const threatened = [];
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i][j];
            if (!cell || cell.terrain !== 'castle' || cell.terrainTeam !== teamId)
                continue;
            if (isTeamBuildingThreatenedByEnemyMover(i, j, 'castle', teamId)) {
                threatened.push({ row: i, col: j });
            }
        }
    }
    return threatened;
}
function countThreatenedOwnCastleThreats(teamId) {
    const defendingTeam = appData.teams.find(t => t.id === teamId);
    if (!defendingTeam)
        return 0;
    const ownCastleKeys = new Set();
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i][j];
            if (!cell || cell.terrain !== 'castle' || cell.terrainTeam !== teamId)
                continue;
            if (cell.unit && cell.unitStandby === true)
                continue;
            ownCastleKeys.add(`${i},${j}`);
        }
    }
    if (ownCastleKeys.size === 0)
        return 0;
    let threatCount = 0;
    const previousDemoEnemyMovementBlocking = appData.demoEnemyMovementBlocking;
    const previousMoveModeConsiderEnemyBlockers = appData.moveModeConsiderEnemyBlockers;
    appData.demoEnemyMovementBlocking = false;
    appData.moveModeConsiderEnemyBlockers = false;
    try {
        for (let i = 0; i < appData.rows; i++) {
            for (let j = 0; j < appData.cols; j++) {
                const enemyCell = appData.gridData[i][j];
                if (!enemyCell || !enemyCell.unit || !enemyCell.unitTeam)
                    continue;
                const enemyTeam = appData.teams.find(t => t.id === enemyCell.unitTeam);
                if (!enemyTeam || enemyTeam.alliance === defendingTeam.alliance)
                    continue;
                const enemyUnit = getUnitDefinition(enemyCell.unit);
                if (!enemyUnit || !(enemyUnit.abilities || []).includes('城主'))
                    continue;
                const threatenedByThisUnit = new Set();
                calculateMovementRange(i, j).forEach(pos => {
                    const key = `${pos.row},${pos.col}`;
                    if (ownCastleKeys.has(key)) {
                        threatenedByThisUnit.add(key);
                    }
                });
                threatCount += threatenedByThisUnit.size;
            }
        }
    }
    finally {
        appData.demoEnemyMovementBlocking = previousDemoEnemyMovementBlocking;
        appData.moveModeConsiderEnemyBlockers = previousMoveModeConsiderEnemyBlockers;
    }
    return threatCount;
}
function hasReachableOperationalTarget(row, col, operationType, movementOptions = {}) {
    const targetCalculator = operationType === 'support'
        ? calculateSupportTargets
        : operationType === 'heal'
            ? calculateHealTargets
            : null;
    if (!targetCalculator)
        return false;
    const reachablePositions = calculateMovementRange(row, col, null, {
        movingCellOverride: movementOptions.scoringCellOverride || null
    });
    for (const position of reachablePositions) {
        if (!canStandOnMovementTarget(position.row, position.col, row, col))
            continue;
        let found = false;
        moveUnitForEvaluation(row, col, position.row, position.col, () => {
            found = targetCalculator(position.row, position.col).length > 0;
        }, {
            hiddenOriginCell: movementOptions.hiddenOriginCell || null
        });
        if (found)
            return true;
    }
    return false;
}
function collectHardAiEnemyBuildingPositions(teamId) {
    const actingTeam = appData.teams.find(team => team.id === teamId);
    const castles = [];
    const occupiedHouses = [];
    if (!actingTeam)
        return { castles, occupiedHouses };
    for (let row = 0; row < appData.rows; row++) {
        for (let col = 0; col < appData.cols; col++) {
            const cell = appData.gridData[row]?.[col];
            if (!cell?.terrainTeam)
                continue;
            const owner = appData.teams.find(team => team.id === cell.terrainTeam);
            if (!owner || owner.alliance === actingTeam.alliance)
                continue;
            if (cell.terrain === 'castle') {
                castles.push({ row, col });
            }
            else if (cell.terrain === 'house' && cell.unit && cell.unitTeam) {
                const occupant = appData.teams.find(team => team.id === cell.unitTeam);
                if (occupant && occupant.alliance !== actingTeam.alliance) {
                    occupiedHouses.push({ row, col });
                }
            }
        }
    }
    return { castles, occupiedHouses };
}
function calculateHardAiBuildingProximityPenalty(row, col, unitValue, enemyDistance, allyDistance, targets) {
    let highestPenalty = 0;
    if (targets.enemyUnitCount > 3 && enemyDistance < allyDistance - 1) {
        const castleDivisors = [null, 2, 3, 3, 4, 4, 5, 7, 10, 10];
        for (const castle of targets.castles) {
            const distance = Math.abs(row - castle.row) + Math.abs(col - castle.col);
            const divisor = castleDivisors[distance];
            if (divisor)
                highestPenalty = Math.max(highestPenalty, unitValue / divisor);
        }
    }
    if (enemyDistance < allyDistance - 0.5) {
        for (const house of targets.occupiedHouses) {
            const distance = Math.abs(row - house.row) + Math.abs(col - house.col);
            const divisor = distance === 1 ? 5 : distance === 2 ? 10 : null;
            if (divisor)
                highestPenalty = Math.max(highestPenalty, unitValue / divisor);
        }
    }
    return floorAiScoreToPointTwo(highestPenalty);
}
function hardAiHouseScoreFromDistanceDifference(difference) {
    const score = difference >= 0
        ? Math.max(150, 200 - difference * 5)
        : Math.max(-100, 200 + difference * 100);
    return roundHardAiDistance(score);
}
function getHardAiHouseBaseScore(row, col, teamId, actorOrigin = null) {
    const landing = { row, col };
    const nativeView=environment.nativeCompute?readHardNativeView():null;
    const enemyDistance = hardAiAverageDistance(row, col, teamId, true, null, null, nativeView);
    const allyDistance = actorOrigin
        ? hardAiAverageDistance(row, col, teamId, false, actorOrigin, landing, nativeView)
        : hardAiAverageDistance(row, col, teamId, false, null, null, nativeView);
    const difference = roundHardAiDistance(enemyDistance - allyDistance);
    return hardAiHouseScoreFromDistanceDifference(difference);
}
function getHardAiHouseGuardMultiplier(fromRow, fromCol, houseRow, houseCol) {
    const defenderCell = appData.gridData[fromRow]?.[fromCol];
    const houseCell = appData.gridData[houseRow]?.[houseCol];
    if (!defenderCell?.unit || !houseCell || (houseCell.unit
        && (fromRow !== houseRow || fromCol !== houseCol)))
        return 0;
    const defenderTeam = appData.teams.find(team => team.id === defenderCell.unitTeam);
    if (!defenderTeam)
        return 0;
    const defenderHealth = defenderCell.unitHealth || 0;
    if (defenderHealth <= 0)
        return 0;
    const enemies = [];
    for (let row = 0; row < appData.rows; row++) {
        for (let col = 0; col < appData.cols; col++) {
            const cell = appData.gridData[row][col];
            if (!cell.unit || !cell.unitTeam)
                continue;
            const team = appData.teams.find(item => item.id === cell.unitTeam);
            if (team && team.alliance !== defenderTeam.alliance)
                enemies.push({ row, col });
        }
    }
    const previousBlocking = appData.demoEnemyMovementBlocking;
    appData.demoEnemyMovementBlocking = true;
    try {
        return moveUnitForEvaluation(fromRow, fromCol, houseRow, houseCol, () => {
            let highestDamage = 0;
            let secondHighestDamage = 0;
            for (const enemy of enemies) {
                const enemyCell = appData.gridData[enemy.row][enemy.col];
                const enemyUnit = appData.units.find(unit => unit.id === enemyCell.unit);
                if (!enemyUnit)
                    continue;
                let enemyHighestDamage = 0;
                const reachable = calculateMovementRange(enemy.row, enemy.col);
                for (const position of reachable) {
                    if (!canStandOnMovementTarget(position.row, position.col, enemy.row, enemy.col))
                        continue;
                    const distance = Math.abs(position.row - houseRow) + Math.abs(position.col - houseCol);
                    if (distance < enemyUnit.minRange || distance > enemyUnit.maxRange)
                        continue;
                    const attack = moveUnitForEvaluation(enemy.row, enemy.col, position.row, position.col, () => calculateAttackTargets(position.row, position.col)
                        .find(target => target.row === houseRow && target.col === houseCol));
                    if (attack)
                        enemyHighestDamage = Math.max(enemyHighestDamage, attack.attackDamage);
                }
                if (enemyHighestDamage >= highestDamage) {
                    secondHighestDamage = highestDamage;
                    highestDamage = enemyHighestDamage;
                }
                else if (enemyHighestDamage > secondHighestDamage) {
                    secondHighestDamage = enemyHighestDamage;
                }
            }
            if (highestDamage >= defenderHealth)
                return 0;
            return highestDamage + secondHighestDamage >= defenderHealth ? 0.5 : 1;
        });
    }
    finally {
        appData.demoEnemyMovementBlocking = previousBlocking;
    }
}
function getHardAiAssignedBuildingMovementGoal(row, col, unit, team, options = {}) {
    if (!isHardAiTeam(team.id) || !(unit.abilities || []).includes('占领'))
        return null;
    if (!(Number(appData.gridData[row]?.[col]?.unitHealth) > 80))
        return null;
    const turn = appData.demoTeamTurn?.teamId === team.id ? appData.demoTeamTurn : null;
    const explicit = Object.prototype.hasOwnProperty.call(options, 'hardAiAssignedBuilding');
    if (options.scoringCellOverride && !explicit)
        return null;
    const actorTraceId = appData.gridData[row]?.[col]?.unitTraceId || null;
    const assignment = explicit ? options.hardAiAssignedBuilding
        : turn?.hardAiBuildingAssignments?.find(item => item.unit.row === row
            && item.unit.col === col && item.unit.unitId === unit.id
            && (!item.unit.unitTraceId || item.unit.unitTraceId === actorTraceId));
    const target = assignment?.house;
    const targetCell = target && appData.gridData[target.row]?.[target.col];
    if (!targetCell)
        return null;
    const owner = appData.teams.find(item => item.id === targetCell.terrainTeam);
    if (owner?.alliance === team.alliance)
        return null;
    const neutral = !owner || owner.playerType === 0;
    let bonus = 0;
    if (targetCell.terrain === 'castle' && unit.abilities.includes('城主')) {
        bonus = neutral ? 800 : 50;
    }
    else if (targetCell.terrain === 'house') {
        bonus = neutral ? 50 : 150;
    }
    else if (targetCell.terrain === 'rundown'
        && unit.abilities.includes('修复')) {
        bonus = 20;
    }
    if (!bonus)
        return null;
    if (unit.id === 'commander' && assignment.firstCommanderTarget) {
        const e = Number.isFinite(assignment.originalE) ? assignment.originalE : 0;
        bonus += 400 - e * 50;
    }
    const originTurns = Number.isFinite(assignment.route?.turnsToReach)
        ? assignment.route.turnsToReach
        : findHardAiDominantCaptureRoute(row, col, target.row, target.col).route?.turnsToReach;
    return Number.isFinite(originTurns) && originTurns > 0
        ? { row: target.row, col: target.col, originTurns, bonus } : null;
}
function getHardAiRegroupGoal(fromRow, fromCol, unit, team, reachablePositions, hiddenOriginCell = null) {
    const enemyPositions = collectEnemyUnitPositions(team.id);
    if (!enemyPositions.length)
        return null;
    const distance = (a, b) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
    const origin = { row: fromRow, col: fromCol };
    const nearestEnemy = enemyPositions.sort((a, b) => distance(origin, a) - distance(origin, b)
        || a.row - b.row || a.col - b.col)[0];
    const buildingTargets = calculateHardAiBuildingTargetSet(team.id);
    const legalLandings = reachablePositions.filter(position => canStandOnMovementTarget(position.row, position.col, fromRow, fromCol));
    const canActOnBuilding = legalLandings.some(position => {
        const key = `${position.row},${position.col}`;
        const terrain = appData.gridData[position.row][position.col].terrain;
        if (terrain === 'rundown')
            return buildingTargets.rundowns.has(key)
                && getRepairScoreForCell(position.row, position.col, unit, team.id) !== null;
        return ((terrain === 'castle' && buildingTargets.castles.has(key))
            || (terrain === 'house' && buildingTargets.houses.has(key)))
            && getOccupyScoreForCell(position.row, position.col, unit, team) !== null;
    });
    if (canActOnBuilding)
        return null;
    const actorCell = appData.gridData[fromRow][fromCol];
    const minRange = actorCell.unitStatus === '致盲' ? 0 : unit.minRange || 1;
    const maxRange = actorCell.unitStatus === '致盲' ? 0 : unit.maxRange || 1;
    const canAttackNearest = legalLandings.some(position => {
        const attackDistance = distance(position, nearestEnemy);
        if (attackDistance < minRange || attackDistance > maxRange)
            return false;
        return moveUnitForEvaluation(fromRow, fromCol, position.row, position.col, () => calculateAttackTargets(position.row, position.col).some(target => target.row === nearestEnemy.row && target.col === nearestEnemy.col
            && target.targetType !== 'terrainHouse'), { hiddenOriginCell });
    });
    if (canAttackNearest)
        return null;
    const allyPositions = collectAllyUnitPositions(team.id);
    const nearestAlly = allyPositions.sort((a, b) => distance(nearestEnemy, a)
        - distance(nearestEnemy, b) || distance(origin, a) - distance(origin, b)
        || a.row - b.row || a.col - b.col)[0];
    if (!nearestAlly)
        return null;
    const originDistance = distance(origin, nearestAlly);
    return originDistance > 0 ? { ...nearestAlly, originDistance } : null;
}
function calculateMovementScores(row, col, options = {}) {
    const cell = appData.gridData[row][col];
    const scoringCell = options.scoringCellOverride || cell;
    if (!cell.unit)
        return 1;
    const moveUnit = appData.units.find(u => u.id === (scoringCell.unit || cell.unit));
    const UnitLevel = scoringCell.unitLevel ?? cell.unitLevel;
    const scoringTeamId = scoringCell.unitTeam || cell.unitTeam;
    const UnitValue = getAiScoringUnitValue(moveUnit, UnitLevel, scoringTeamId, row, col, scoringTeamId);
    const UnitAbilities = moveUnit.abilities;
    const UnitMaxhp = 100 + moveUnit.hpUp * UnitLevel;
    const unitTeam = appData.teams.find(t => t.id === scoringTeamId);
    const unitAlliance = unitTeam.alliance;
    const results = [];
    const reachablePositions = calculateMovementRange(row, col, null, {
        movingCellOverride: options.scoringCellOverride || null
    });
    const originReachablePosition = reachablePositions.find(pos => pos.row === row && pos.col === col);
    const actualMaxMove = originReachablePosition ? originReachablePosition.remaining : moveUnit.move;
    const potentialTargetOrigin = options.potentialTargetOrigin || { row, col };
    const movementScoreOrigin = options.movementScoreOrigin || { row, col };
    const hiddenOriginCell = options.hiddenOriginCell || null;
    const hardAiAllyPositions = isHardAiTeam(scoringTeamId)
        ? (Array.isArray(options.allyDistancePositions)
            ? options.allyDistancePositions
            : getActiveAiAssaultSnapshot(scoringTeamId)?.assaultAllyPositions
                || collectAllyUnitPositions(scoringTeamId))
        : null;
    const hardAiSituation = hardAiAllyPositions
        ? calculateHardAiBattlePower(scoringTeamId)?.situation : null;
    const hardAiProximityTargets = isHardAiTeam(scoringTeamId)
        ? {
            ...collectHardAiEnemyBuildingPositions(scoringTeamId),
            enemyUnitCount: collectEnemyUnitPositions(scoringTeamId).length
        }
        : null;
    const assignedBuildingGoal = getHardAiAssignedBuildingMovementGoal(row, col, moveUnit, unitTeam, options);
    const fullHealthCanRegroup = isHardAiTeam(scoringTeamId)
        && moveUnit.id !== 'healer' && moveUnit.id !== 'druid'
        && Number(cell.unitHealth) >= UnitMaxhp;
    const hardAiRegroupGoal = fullHealthCanRegroup
        ? getHardAiRegroupGoal(row, col, moveUnit, unitTeam, reachablePositions, hiddenOriginCell) : null;
    const getMovementEffectCell = (effectRow, effectCol, landingRow, landingCol) => {
        const isOriginCell = effectRow === row && effectCol === col;
        const landingAtOrigin = landingRow === row && landingCol === col;
        if (isOriginCell && hiddenOriginCell && !landingAtOrigin)
            return hiddenOriginCell;
        return isOriginCell ? cell : appData.gridData[effectRow][effectCol];
    };
    const allPotentialTargets = calculatePotentialMoveTargets(row, col, { origin: potentialTargetOrigin });
    let potentialTargets = options.potentialTargetOverride
        ? { ...options.potentialTargetOverride }
        : null;
    if (!potentialTargets && allPotentialTargets.length > 0) {
        potentialTargets = choosePotentialAttackTarget(allPotentialTargets);
    }

    // 只在可选后端启用时收集输入；所有位置来源仍由原困难脚本决定。
    const acceleratedMovement = hardAiAllyPositions && environment.movementBatch
        ? (() => {
            const assault = getActiveAiAssaultSnapshot(scoringTeamId);
            const enemies = Array.isArray(options.enemyDistancePositions) ? options.enemyDistancePositions
                : assault && Array.isArray(assault.assaultEnemyPositions) ? assault.assaultEnemyPositions : collectEnemyUnitPositions(scoringTeamId);
            const allies = Array.isArray(options.allyDistancePositions) ? options.allyDistancePositions
                : assault && Array.isArray(assault.assaultAllyPositions) ? assault.assaultAllyPositions : collectAllyUnitPositions(scoringTeamId);
            const castles = collectHardAiCastleDistancePositions(scoringTeamId, false);
            let relocated = false;
            const landingPositions = hardAiAllyPositions.filter(p => {
                if (!relocated && p.row === movementScoreOrigin.row && p.col === movementScoreOrigin.col) { relocated = true; return false; }
                return true;
            });
            const coordinates = ps => ps.map(p => [p.row, p.col]);
            const result = environment.movementBatch({
                positions: coordinates(reachablePositions),
                enemyPositions: coordinates([...enemies, ...collectHardAiCastleDistancePositions(scoringTeamId, true)]),
                allyPositions: coordinates([...allies, ...castles]),
                landingPositions: coordinates([...landingPositions, ...castles]),
                landingCount: landingPositions.length + castles.length + 1,
                defenses: reachablePositions.map(p => hardAiTerrainDefense(p.row, p.col, moveUnit)),
                unitValue: UnitValue, maxRange: moveUnit.maxRange,
                situation: Number.isFinite(hardAiSituation) ? hardAiSituation : null
            });
            for (const key of ['enemy', 'ally', 'landing']) {
                if (!Array.isArray(result[key]) || result[key].length !== reachablePositions.length || !result[key].every(Number.isFinite)) throw Error('困难计算后端返回无效向量：' + key);
            }
            if (environment.verifyMovementBatch) reachablePositions.forEach((p, index) => {
                const enemy = calculateEnemyDistance(p.row, p.col, unitTeam.id, options.enemyDistancePositions || null);
                const ally = calculateAllyDistance(p.row, p.col, unitTeam.id, options.allyDistancePositions || null);
                const landing = calculateHardAiLandingPositionScore(calculateHardAiLandingAllyDistance(p.row, p.col, scoringTeamId, movementScoreOrigin, hardAiAllyPositions), enemy, hardAiTerrainDefense(p.row, p.col, moveUnit), UnitValue, moveUnit.maxRange, hardAiSituation);
                for (const [key, expected] of Object.entries({enemy, ally, landing})) {
                    if (Math.abs(result[key][index] - expected) > 1e-10) throw Error('困难GPU数值与原表达式不一致：' + key + '/' + index + '/' + result[key][index] + '/' + expected);
                }
            });
            return result;
        })() : null;
    for (let k = 0; k < reachablePositions.length; k++) {
        const position = reachablePositions[k];
        let i = position.row;
        let j = position.col;
        const moveCell = appData.gridData[i][j];
        const moveTerrain = moveCell.terrain ? appData.terrains.find(t => t.id === moveCell.terrain) : null;
        let terrainDefense = moveTerrain ? moveTerrain.defense : 5;
        if (UnitAbilities.includes("空军")) {
            terrainDefense = 0;
        }
        if (UnitAbilities.includes("森林之子") && moveTerrain.name === "树林") {
            terrainDefense += 10;
        }
        if (UnitAbilities.includes("水之子") && WaterTerrain.includes(moveTerrain.name)) {
            terrainDefense += 10;
        }
        if (UnitAbilities.includes("山之子") && MountainTerrain.includes(moveTerrain.name)) {
            terrainDefense += 10;
        }
        let score = Math.floor(terrainDefense);
        let distanceScore = 0;
        if (!isHardAiTeam(scoringTeamId) && potentialTargets) {
            const hasRelevantOperationalTarget = potentialTargets.targetType === 'unitSupport'
                ? hasReachableOperationalTarget(row, col, 'support', options)
                : potentialTargets.targetType === 'unitHeal'
                    ? hasReachableOperationalTarget(row, col, 'heal', options)
                    : hasAttackTarget(row, col);
            if (options.forcePotentialTargetDistance || !hasRelevantOperationalTarget) {
                const beforeDistance = Math.abs(potentialTargets.row - potentialTargetOrigin.row)
                    + Math.abs(potentialTargets.col - potentialTargetOrigin.col);
                const afterDistance = Math.abs(potentialTargets.row - i)
                    + Math.abs(potentialTargets.col - j);
                distanceScore = (beforeDistance - afterDistance) * 100;
            }
        }
        score += distanceScore;
        const enemyDistance = acceleratedMovement ? acceleratedMovement.enemy[k] : calculateEnemyDistance(i, j, unitTeam.id, options.enemyDistancePositions || null);
        const enemyAvgDistance = isHardAiTeam(scoringTeamId)
            ? enemyDistance : Math.floor(enemyDistance);
        const allyDistance = acceleratedMovement ? acceleratedMovement.ally[k] : calculateAllyDistance(i, j, unitTeam.id, options.allyDistancePositions || null);
        const allyAvgDistance = isHardAiTeam(scoringTeamId)
            ? allyDistance : Math.floor(allyDistance);
        const difference = enemyAvgDistance - allyAvgDistance;
        if (acceleratedMovement) {
            score += acceleratedMovement.landing[k];
        } else if (hardAiAllyPositions) {
            const landingAllyDistance = calculateHardAiLandingAllyDistance(i, j, scoringTeamId, movementScoreOrigin, hardAiAllyPositions);
            score += calculateHardAiLandingPositionScore(landingAllyDistance, enemyAvgDistance, terrainDefense, UnitValue, moveUnit.maxRange, hardAiSituation);
        }
        if (difference < 0 && !isHardAiTeam(scoringTeamId)) {
            score -= floorAiScoreToPointTwo(UnitValue / 5);
        }
        if (hardAiProximityTargets) {
            score -= calculateHardAiBuildingProximityPenalty(i, j, UnitValue, enemyAvgDistance, allyAvgDistance, hardAiProximityTargets);
        }
        const directions = getRangeRelativeCoordinates(0, 2, true);
        let abilityBonus = 0;
        if (UnitAbilities.includes("虚弱")) {
            for (const [dx, dy] of directions) {
                const nx = i + dx;
                const ny = j + dy;
                if (nx >= 0 && nx < appData.rows && ny >= 0 && ny < appData.cols) {
                    const nearCell = appData.gridData[nx][ny];
                    if (nearCell.unit) {
                        const nearUnit = appData.units.find(u => u.id === nearCell.unit);
                        const nearTeam = appData.teams.find(t => t.id === nearCell.unitTeam);
                        if (nearTeam && nearTeam.alliance !== unitAlliance && nearCell.unitStatus === '无' && !nearUnit.abilities.includes("虚弱")) {
                            const nearUnitValue = getAiScoringUnitValue(nearUnit, nearCell.unitLevel, nearCell.unitTeam, nx, ny, scoringTeamId);
                            abilityBonus += floorAiScoreToPointTwo(nearUnitValue / 20);
                        }
                    }
                }
            }
        }
        if (UnitAbilities.includes("鼓舞")) {
            for (const [dx, dy] of directions) {
                const nx = i + dx;
                const ny = j + dy;
                if (nx >= 0 && nx < appData.rows && ny >= 0 && ny < appData.cols) {
                    const nearCell = getMovementEffectCell(nx, ny, i, j);
                    if (nearCell.unit) {
                        const nearUnit = appData.units.find(u => u.id === nearCell.unit);
                        const nearTeam = appData.teams.find(t => t.id === nearCell.unitTeam);
                        if (nearTeam && nearTeam.alliance === unitAlliance && nearCell.unitStatus === '无') {
                            const nearUnitValue = getAiScoringUnitValue(nearUnit, nearCell.unitLevel, nearCell.unitTeam, nx, ny, scoringTeamId);
                            abilityBonus += floorAiScoreToPointTwo(nearUnitValue / 25);
                        }
                    }
                }
            }
        }
        if (UnitAbilities.includes("净化光环")) {
            const purifyDirections = getRangeRelativeCoordinates(0, 2, true);
            const negativeStatuses = ['中毒', '致盲', '虚弱'];
            for (const [dx, dy] of purifyDirections) {
                const nx = i + dx;
                const ny = j + dy;
                if (nx >= 0 && nx < appData.rows && ny >= 0 && ny < appData.cols) {
                    const isLandingCell = nx === i && ny === j;
                    const nearCell = isLandingCell ? cell : getMovementEffectCell(nx, ny, i, j);
                    if (nearCell.unit) {
                        const nearUnit = appData.units.find(u => u.id === nearCell.unit);
                        const nearTeam = appData.teams.find(t => t.id === nearCell.unitTeam);
                        if (!nearUnit || !nearTeam || nearCell.unitStatus === '死亡')
                            continue;
                        const isAlly = nearTeam.alliance === unitAlliance;
                        if (isAlly) {
                            const nearUnitValue = getAiScoringUnitValue(nearUnit, nearCell.unitLevel, nearCell.unitTeam, nx, ny, scoringTeamId);
                            const nearUnitMaxHp = 100 + nearUnit.hpUp * nearCell.unitLevel;
                            if (nearCell.unitHealth < nearUnitMaxHp) {
                                abilityBonus += Math.floor(nearUnitValue / 20) * (2 + UnitLevel) / 5;
                            }
                            if (negativeStatuses.includes(nearCell.unitStatus)) {
                                abilityBonus += floorAiScoreToPointTwo(nearUnitValue / 25);
                            }
                        }
                    }
                }
            }
        }
        score += abilityBonus;
        if (moveTerrain && moveTerrain.name === "城堡") {
            const terrainTeam = moveCell.terrainTeam ? appData.teams.find(t => t.id === moveCell.terrainTeam) : null;
            const isCommander = cell.unit === 'commander';
            if (terrainTeam && terrainTeam.id !== cell.unitTeam && terrainTeam.alliance === unitAlliance) {
                score -= 2000;
            }
            else if (terrainTeam && terrainTeam.alliance !== unitAlliance && !isCommander) {
                score -= floorAiScoreToPointTwo(UnitValue / 2);
            }
        }
        const healthRate = UnitMaxhp > 0 ? (cell.unitHealth || 0) / UnitMaxhp : 0;
        const isOwnCastle = moveTerrain && moveTerrain.name === "城堡" && moveCell.terrainTeam === cell.unitTeam;
        const isOwnVillage = moveTerrain && moveTerrain.name === "房子" && moveCell.terrainTeam === cell.unitTeam;
        const isHiddenCommanderOriginCastle = hiddenOriginCell
            && i === row
            && j === col
            && hiddenOriginCell.unit === 'commander'
            && hiddenOriginCell.unitTeam === cell.unitTeam
            && isOwnCastle;
        const isThreatenedPosition = (isOwnCastle && isTeamBuildingThreatenedByEnemyMover(i, j, 'castle', cell.unitTeam))
            || (isOwnVillage && isTeamBuildingThreatenedByEnemyMover(i, j, 'house', cell.unitTeam));
        const hardAiHouseGuardMultiplier = isOwnVillage && isThreatenedPosition
            && isHardAiTeam(scoringTeamId)
            ? getHardAiHouseGuardMultiplier(row, col, i, j) : 0;
        const canGuardThreatenedHouse = isOwnVillage && isThreatenedPosition
            && (isHardAiTeam(scoringTeamId)
                ? hardAiHouseGuardMultiplier > 0
                : healthRate >= 0.8);
        const canGuardThreatenedCastle = isOwnCastle && isThreatenedPosition && healthRate >= 0.8;
        if ((canGuardThreatenedHouse || canGuardThreatenedCastle) && !isHiddenCommanderOriginCastle) {
            if (isOwnCastle) {
                const threatenedCastleCount = isAiPlayerType(unitTeam.playerType)
                    ? countThreatenedOwnCastleThreats(cell.unitTeam)
                    : getThreatenedOwnCastles(cell.unitTeam).length;
                if (threatenedCastleCount > 1) {
                    score += 2000;
                }
                else {
                    if (cell.unit !== 'commander' && canAffordBetterCastleGuard(cell.unitTeam, cell.unit)) {
                        score -= 1000;
                    }
                    else {
                        score += 2000;
                    }
                }
            }
            if (canGuardThreatenedHouse) {
                score += isHardAiTeam(scoringTeamId)
                    ? getHardAiHouseBaseScore(i, j, scoringTeamId, { row, col })
                        * hardAiHouseGuardMultiplier
                    : 1000;
            }
        }
        else if (isOwnCastle && cell.unit !== 'commander') {
            score -= 1000;
        }
        if (i === movementScoreOrigin.row && j === movementScoreOrigin.col) {
        }
        else if (cell.unitHealth <= UnitMaxhp / 2 && moveTerrain.heal > 0) {
            const terrainTeam = appData.teams.find(t => t.id === moveCell.terrainTeam);
            const isOwnHouse = moveTerrain.name === "房子" && terrainTeam && terrainTeam.id === cell.unitTeam;
            const isOwnCastle = moveTerrain.name === "城堡" && terrainTeam && terrainTeam.id === cell.unitTeam;
            const isNeutralHeal = moveTerrain.name === "澡盆" || moveTerrain.name === "神庙" || moveTerrain.name === "水庙";
            if (isOwnHouse || isOwnCastle || isNeutralHeal) {
                const effectiveHeal = moveTerrain.heal + ((moveTerrain.name === "水庙" && UnitAbilities.includes("水之子")) ? 10 : 0);
                const healBonus = floorAiScoreToPointTwo(effectiveHeal * UnitValue / 50);
                score += healBonus;
            }
        }
        if (moveCell.tombstone) {
            const tombstoneScore = floorAiScoreToPointTwo(UnitValue / 50);
            score += UnitAbilities.includes("亡灵") ? tombstoneScore : -tombstoneScore;
        }
        let capturePotentialBonus = 0;
        if (assignedBuildingGoal && (i !== row || j !== col)
            && canStandOnMovementTarget(i, j, row, col)) {
            const landingTurns = moveUnitForEvaluation(row, col, i, j, () => findHardAiDominantCaptureRoute(i, j, assignedBuildingGoal.row, assignedBuildingGoal.col).route?.turnsToReach);
            if (Number.isFinite(landingTurns)
                && landingTurns < assignedBuildingGoal.originTurns) {
                capturePotentialBonus = assignedBuildingGoal.bonus;
                score += capturePotentialBonus;
            }
        }
        const regroupBonus = hardAiRegroupGoal && canStandOnMovementTarget(i, j, row, col)
            ? Math.max(0, hardAiRegroupGoal.originDistance
                - Math.abs(i - hardAiRegroupGoal.row)
                - Math.abs(j - hardAiRegroupGoal.col)) * 100 : 0;
        score += regroupBonus;
        const usedMove = actualMaxMove - position.remaining;
        const assaultFirstMoveThreshold = moveUnit.move / 2;
        if (!isHardAiTeam(scoringTeamId) && !options.skipAssaultFirstMoveReset && UnitAbilities.includes("突击部队") && usedMove <= assaultFirstMoveThreshold) {
            score = 0;
        }
        results.push({
            row: i,
            col: j,
            value: score,
            capturePotentialBonus,
            regroupBonus,
            usedMove,
            scoringTeamId,
            scoringUnitId: moveUnit.id,
            scoringUnitLevel: UnitLevel,
            potentialTarget: potentialTargets ? { ...potentialTargets } : null
        });
    }
    return results;
}
function calculateAttackDamage(row, col) {
    const attackercell = appData.gridData[row][col];
    if (!attackercell.unit)
        return [];
    const attackerTeam = appData.teams.find(t => t.id === attackercell.unitTeam);
    const attackerAlliance = attackerTeam.alliance;
    const attackerUnit = appData.units.find(u => u.id === attackercell.unit);
    const attackerLevel = attackercell.unitLevel;
    const attackerStatus = attackercell.unitStatus;
    const attackerAttack = attackerUnit.attack + attackerUnit.atkUp * attackerLevel;
    const attackerAbilities = attackerUnit.abilities;
    const attackerMaxhp = 100 + attackerUnit.hpUp * attackerLevel;
    const attackerHealth = (attackerUnit.name === "狂战") ? 100 : attackercell.unitHealth;
    const results = [];
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            if (i === row && j === col)
                continue;
            const defenseCell = appData.gridData[i][j];
            if (!defenseCell.unit)
                continue;
            const defenseUnit = appData.units.find(u => u.id === defenseCell.unit);
            const defenseAbilities = defenseUnit.abilities || [];
            const defenseDefense = (attackerUnit.type === "物理") ? defenseUnit.physDef : defenseUnit.magicDef;
            const defenseTerrain = defenseCell.terrain ? appData.terrains.find(t => t.id === defenseCell.terrain) : null;
            let terrainDefense = defenseTerrain ? defenseTerrain.defense : 5;
            if (defenseAbilities.includes("空军"))
                terrainDefense = 0;
            const defenseTeam = appData.teams.find(t => t.id === defenseCell.unitTeam);
            if (!defenseTeam || defenseTeam.alliance === attackerAlliance)
                continue;
            let xishu = 1;
            const damage = Math.floor(xishu * (attackerAttack - defenseDefense - terrainDefense) * attackerHealth / attackerMaxhp);
            results.push({
                row: i,
                col: j,
                value: damage
            });
        }
    }
    return results;
}
function calculateCounterAttackDamage(row, col) {
    const cell = appData.gridData[row][col];
    if (!cell.unit)
        return [];
    const currentTeam = appData.teams.find(t => t.id === cell.unitTeam);
    if (!currentTeam)
        return [];
    const currentAlliance = currentTeam.alliance;
    const results = [];
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            if (i === row && j === col)
                continue;
            const attackerCell = appData.gridData[i][j];
            if (!attackerCell.unit)
                continue;
            const attackerTeam = appData.teams.find(t => t.id === attackerCell.unitTeam);
            if (!attackerTeam || attackerTeam.alliance === currentAlliance)
                continue;
            let baseDamage = 8;
            if (cell.unit === 'infantry' && attackerCell.unit === 'cavalry') {
                baseDamage = 12;
            }
            else if (cell.unit === 'archer' && attackerCell.unit === 'infantry') {
                baseDamage = 12;
            }
            else if (cell.unit === 'cavalry' && attackerCell.unit === 'archer') {
                baseDamage = 12;
            }
            const levelFactor = cell.unitLevel * 0.4;
            const distance = Math.abs(row - i) + Math.abs(col - j);
            const distanceFactor = distance > 0 ? Math.max(0.3, 1 - (distance * 0.1)) : 1;
            const damage = Math.floor(baseDamage * (1 + levelFactor) * distanceFactor);
            results.push({
                row: i,
                col: j,
                value: damage
            });
        }
    }
    return results;
}
function calculateAttackScores(row, col) {
    const attackercell = appData.gridData[row][col];
    if (!attackercell.unit)
        return [];
    const attackerTeam = appData.teams.find(t => t.id === attackercell.unitTeam);
    const attackerAlliance = attackerTeam.alliance;
    const attackerUnit = appData.units.find(u => u.id === attackercell.unit);
    const attackerLevel = attackercell.unitLevel;
    const attackerStatus = attackercell.unitStatus;
    const attackerAttack = attackerUnit.attack + attackerUnit.atkUp * attackerLevel;
    const attackerAbilities = attackerUnit.abilities;
    const attackerMove = attackerUnit.move;
    const attackerMinRange = attackerStatus === "致盲" ? 0 : attackerUnit.minRange;
    const attackerMaxRange = attackerUnit.maxRange;
    const attackerMaxhp = 100 + attackerUnit.hpUp * attackerLevel;
    const attackerHealth = attackercell.unitHealth;
    const attackerValue = getAiScoringUnitValue(attackerUnit, attackerLevel, attackercell.unitTeam, row, col, attackercell.unitTeam);
    const results = [];
    const reachablePositions = calculateMovementRange(row, col);
    for (let k = 0; k < reachablePositions.length; k++) {
        const position = reachablePositions[k];
        let i = position.row;
        let j = position.col;
        const attackTargets = [];
        const Cell = appData.gridData[i][j];
        if (Cell.unit && (row !== i || col !== j))
            continue;
        const attackerTerrain = Cell.terrain ? appData.terrains.find(t => t.id === Cell.terrain) : null;
        let attackerTerrainDefense = attackerTerrain ? attackerTerrain.defense : 5;
        if (attackerAbilities.includes("空军"))
            attackerTerrainDefense = 0;
        let BestScore = 0;
        let BestTarget = null;
        const directions = getRangeRelativeCoordinates(attackerMinRange, attackerMaxRange, false);
        for (const [dx, dy] of directions) {
            const nx = i + dx;
            const ny = j + dy;
            if (nx >= 0 && nx < appData.rows && ny >= 0 && ny < appData.cols) {
                let attackDistance = Math.abs(nx - i) + Math.abs(ny - j);
                let attackMode = (attackDistance === 1) ? "近战" : "远程";
                let defenseCell = appData.gridData[nx][ny];
                if (!defenseCell.unit && attackerUnit.id === 'catapult' && defenseCell.terrain === 'house') {
                    const houseTeam = defenseCell.terrainTeam
                        ? appData.teams.find(t => t.id === defenseCell.terrainTeam)
                        : null;
                    if (!houseTeam || houseTeam.alliance !== attackerAlliance) {
                        const houseAttackScore = 200;
                        attackTargets.push({
                            row: nx,
                            col: ny,
                            score: houseAttackScore,
                            attackDamage: 0,
                            counterDamage: 0,
                            targetType: 'terrainHouse'
                        });
                        if (houseAttackScore > BestScore) {
                            BestScore = houseAttackScore;
                            BestTarget = { row: nx, col: ny };
                        }
                    }
                    continue;
                }
                let defenseTeam = appData.teams.find(t => t.id === defenseCell.unitTeam);
                if (!defenseTeam || defenseTeam.alliance === attackerAlliance)
                    continue;
                let defenseUnit = appData.units.find(u => u.id === defenseCell.unit);
                let defenseLevel = defenseCell.unitLevel;
                let defenseStatus = defenseCell.unitStatus;
                let defenseDefense = ((attackerUnit.type === "物理") ? defenseUnit.physDef : defenseUnit.magicDef) + 5 * defenseLevel;
                let attackerDefense = ((defenseUnit.type === "物理") ? attackerUnit.physDef : attackerUnit.magicDef) + 5 * attackerLevel;
                let defenseAttack = defenseUnit.attack + defenseUnit.atkUp * defenseLevel;
                let defenseAbilities = defenseUnit.abilities;
                let defenseMove = defenseUnit.move;
                let defenseMinRange = defenseUnit.minRange;
                let defenseMaxRange = defenseUnit.maxRange;
                let defenseMaxhp = 100 + defenseUnit.hpUp * defenseLevel;
                let defenseHealth = defenseCell.unitHealth;
                let defenseValue = getAiScoringUnitValue(defenseUnit, defenseLevel, defenseCell.unitTeam, nx, ny, attackercell.unitTeam);
                let defenseTerrain = defenseCell.terrain ? appData.terrains.find(t => t.id === defenseCell.terrain) : null;
                let defenseTerrainDefense = defenseTerrain ? defenseTerrain.defense : 5;
                if (defenseAbilities.includes("空军")) {
                    defenseTerrainDefense = 0;
                }
                let Correction = 0;
                let xishu = 1;
                if (attackerAbilities.includes("战意")) {
                    xishu = 1;
                }
                if (attackMode === "远程") {
                    if (attackerStatus === "鼓舞") {
                        Correction += 5;
                    }
                    if (defenseStatus === "虚弱") {
                        Correction += 5;
                    }
                    if (defenseAbilities.includes("远程减半")) {
                        xishu = xishu / 2;
                    }
                }
                if (attackMode === "近战") {
                    if (attackerStatus === "鼓舞") {
                        Correction += 10;
                    }
                    if (defenseStatus === "虚弱") {
                        Correction += 10;
                    }
                    if (!defenseAbilities.includes("近战大师") && attackerAbilities.includes("近战大师")) {
                        xishu = xishu * 1.5;
                    }
                }
                if (attackerAbilities.includes("空军") && !defenseAbilities.includes("空军") && WaterTerrain.includes(defenseTerrain.name)) {
                    Correction += 10;
                }
                if (attackerAbilities.includes("神射手") && defenseAbilities.includes("空军")) {
                    Correction += 10;
                }
                if (attackerAbilities.includes("森林之子") && attackerTerrain.name === "树林") {
                    Correction += 10;
                }
                if (attackerAbilities.includes("水之子") && WaterTerrain.includes(attackerTerrain.name)) {
                    Correction += 10;
                }
                if (attackerAbilities.includes("山之子") && MountainTerrain.includes(attackerTerrain.name)) {
                    Correction += 10;
                }
                if (defenseAbilities.includes("森林之子") && defenseTerrain.name === "树林") {
                    Correction -= 10;
                }
                if (defenseAbilities.includes("水之子") && WaterTerrain.includes(defenseTerrain.name)) {
                    Correction -= 10;
                }
                if (defenseAbilities.includes("山之子") && MountainTerrain.includes(defenseTerrain.name)) {
                    Correction -= 10;
                }
                if (attackerAbilities.includes("破坏者") && defenseTerrain.name === "房子") {
                    Correction += 10;
                }
                if (attackerAbilities.includes("死亡收割者") && debuff.includes(defenseStatus)) {
                    Correction += 20;
                }
                let baseDamage = Math.max(attackerAttack - defenseDefense - defenseTerrainDefense + Correction, 0);
                let midDamage = Math.floor(baseDamage * (attackerAbilities.includes("战意") ? attackerMaxhp : attackerHealth) / attackerMaxhp);
                const potentialAttackDamage = Math.floor(xishu * midDamage);
                let attackDamage = Math.min(potentialAttackDamage, defenseHealth);
                let Correction1 = 0;
                let xishu1 = 1;
                let counterDamage;
                let counterHealth;
                let KillScore = 0;
                if (defenseHealth > attackDamage) {
                    counterHealth = defenseHealth - attackDamage;
                }
                else {
                    counterHealth = 0;
                    KillScore = defenseValue / 2;
                    if (defenseUnit.name === "指挥官") {
                        KillScore += 200;
                    }
                    if (defenseAbilities.includes("治疗")) {
                        KillScore += 20 * defenseLevel;
                    }
                    if (defenseAbilities.includes("净化光环")) {
                        KillScore += 30 * defenseLevel;
                    }
                    if (defenseAbilities.includes("支援")) {
                        KillScore += 40 * defenseLevel;
                    }
                }
                if (defenseAbilities.includes("战意")) {
                    xishu1 = 1;
                }
                const stormCounter = defenseAbilities.includes("反击风暴") && attackDistance <= 2;
                const counterDefenseStatus = getCounterDefenseStatus(defenseStatus, defenseAbilities, attackerAbilities);
                const canCounter = canCounterAttackAtDistance(attackDistance, defenseMinRange, defenseAbilities, defenseStatus, attackerAbilities);
                if (!canCounter) {
                    counterHealth = 0;
                }
                else if (attackMode === "远程" || counterDefenseStatus === "致盲") {
                    if (!stormCounter) {
                        counterHealth = 0;
                    }
                    else {
                        if (counterDefenseStatus === "鼓舞") {
                            Correction1 += 5;
                        }
                        if (attackerStatus === "虚弱") {
                            Correction1 += 5;
                        }
                        if (attackerAbilities.includes("远程减半")) {
                            xishu1 = xishu1 / 2;
                        }
                    }
                }
                if (canCounter && attackMode === "近战") {
                    if (defenseMinRange > 1 && !stormCounter) {
                        counterHealth = 0;
                    }
                    else {
                        if (counterDefenseStatus === "鼓舞") {
                            Correction1 += 10;
                        }
                        if (attackerStatus === "虚弱") {
                            Correction1 += 10;
                        }
                        if (!attackerAbilities.includes("近战大师") && defenseAbilities.includes("近战大师")) {
                            xishu1 = xishu1 * 1.5;
                        }
                    }
                }
                if (defenseAbilities.includes("空军") && !attackerAbilities.includes("空军") && WaterTerrain.includes(attackerTerrain.name)) {
                    Correction1 += 10;
                }
                if (defenseAbilities.includes("神射手") && attackerAbilities.includes("空军")) {
                    Correction1 += 10;
                }
                if (defenseAbilities.includes("森林之子") && defenseTerrain.name === "树林") {
                    Correction1 += 10;
                }
                if (defenseAbilities.includes("水之子") && WaterTerrain.includes(defenseTerrain.name)) {
                    Correction1 += 10;
                }
                if (defenseAbilities.includes("山之子") && MountainTerrain.includes(defenseTerrain.name)) {
                    Correction1 += 10;
                }
                if (attackerAbilities.includes("森林之子") && attackerTerrain.name === "树林") {
                    Correction1 -= 10;
                }
                if (attackerAbilities.includes("水之子") && WaterTerrain.includes(attackerTerrain.name)) {
                    Correction1 -= 10;
                }
                if (attackerAbilities.includes("山之子") && MountainTerrain.includes(attackerTerrain.name)) {
                    Correction1 -= 10;
                }
                if (defenseAbilities.includes("死亡收割者") && debuff.includes(attackerStatus)) {
                    Correction1 += 20;
                }
                let baseCounterDamage = Math.max(defenseAttack - attackerDefense - attackerTerrainDefense + Correction1, 0);
                let midCounterDamage = Math.floor(baseCounterDamage * (defenseAbilities.includes("战意") ? defenseMaxhp : counterHealth) / defenseMaxhp);
                counterDamage = canCounter
                    ? Math.min(Math.floor(xishu1 * midCounterDamage), attackerHealth)
                    : 0;
                const scoringAttackDamage = isAiPlayerType(attackerTeam.playerType)
                    ? potentialAttackDamage
                    : attackDamage;
                let DamageScore = floorAiScoreToPointTwo(scoringAttackDamage * defenseValue / 100);
                if (attackerTeam.playerType === 3) {
                    const distanceDifference = hardAiDistanceDifference(nx, ny, attackercell.unitTeam, 2);
                    const distanceFactor = 1 + distanceDifference / 10;
                    const pseudoMissingHealth = Math.max(-50, 100 - defenseHealth);
                    const healthFactor = 1 + pseudoMissingHealth / 100;
                    const realDefense = defenseDefense + defenseTerrainDefense;
                    const defenseFactor = 1 + realDefense / 100;
                    const rawBase = Math.trunc(scoringAttackDamage * defenseValue / 20);
                    DamageScore = hardAiToPageScore(rawBase * distanceFactor * healthFactor * defenseFactor);
                }
                let MockeryCoefficient = getMockeryCoefficient(nx, ny, attackerTeam);
                let CorrectionScore = 0;
                if (defenseHealth > attackDamage) {
                    if (attackerAbilities.includes("中毒") && !defenseAbilities.includes("中毒") && canApplyUnitStatus(defenseStatus, "中毒")) {
                        if (defenseAbilities.includes("亡灵")) {
                            CorrectionScore -= defenseValue / 20;
                        }
                        else {
                            CorrectionScore += defenseValue / 20;
                        }
                    }
                    if (willInflictBlind(attackerAbilities, defenseAbilities, defenseStatus)) {
                        CorrectionScore += defenseValue / 10;
                    }
                    if (attackMode === "近战" && defenseStatus !== "致盲") {
                        if (defenseAbilities.includes("中毒") && !attackerAbilities.includes("中毒") && canApplyUnitStatus(attackerStatus, "中毒")) {
                            CorrectionScore -= attackerValue / 20;
                            if (attackerAbilities.includes("亡灵")) {
                                CorrectionScore += defenseValue / 20;
                            }
                            else {
                                CorrectionScore -= defenseValue / 20;
                            }
                        }
                        if (willInflictBlind(defenseAbilities, attackerAbilities, attackerStatus)) {
                            CorrectionScore -= attackerValue / 10;
                        }
                    }
                }
                if (attackerUnit.name === "指挥官") {
                    if (counterDamage < attackerHealth) {
                        CorrectionScore -= counterDamage * attackerValue / 50;
                    }
                    else {
                        CorrectionScore -= attackerValue * 4;
                    }
                }
                else {
                    if (counterDamage < attackerHealth) {
                        CorrectionScore -= counterDamage * attackerValue / 100;
                    }
                    else {
                        CorrectionScore -= attackerValue * 2;
                    }
                }
                const witchFailedToKill = attackerUnit.name === "女巫" && defenseHealth > attackDamage;
                let Score = witchFailedToKill && attackerTeam.playerType !== 3
                    ? floorAiScoreToPointTwo(defenseValue / 250 - 200)
                    : floorAiScoreToPointTwo((DamageScore + KillScore) * MockeryCoefficient + defenseValue / 250 + CorrectionScore);
                if (witchFailedToKill && attackerTeam.playerType === 3) {
                    Score -= 40;
                }
                attackTargets.push({
                    row: nx,
                    col: ny,
                    score: Score,
                    attackDamage: attackDamage,
                    counterDamage: counterDamage,
                });
                if (Score > BestScore) {
                    BestScore = Score;
                    BestTarget = { row: nx, col: ny };
                }
            }
        }
        results.push({
            row: i,
            col: j,
            value: BestScore,
            targets: attackTargets
        });
    }
    return results;
}
function moveUnitForEvaluation(fromRow, fromCol, toRow, toCol, callback, options = {}) {
    if (fromRow === toRow && fromCol === toCol)
        return callback();
    const fromSnapshot = snapshotCellForMove(fromRow, fromCol);
    const toSnapshot = snapshotCellForMove(toRow, toCol);
    const fromCell = appData.gridData[fromRow][fromCol];
    const toCell = appData.gridData[toRow][toCol];
    toCell.unit = fromCell.unit;
    toCell.unitTeam = fromCell.unitTeam;
    toCell.unitLevel = fromCell.unitLevel;
    toCell.unitHealth = fromCell.unitHealth;
    toCell.unitExp = fromCell.unitExp || 0;
    toCell.unitStatus = fromCell.unitStatus;
    toCell.unitStatusTurns = fromCell.unitStatusTurns || 0;
    toCell.unitStandby = fromCell.unitStandby;
    toCell.unitSupported = fromCell.unitSupported || false;
    toCell.unitRegisteredCommander = fromCell.unitRegisteredCommander || false;
    toCell.pendingTombstone = null;
    fromCell.unit = null;
    fromCell.unitTeam = null;
    fromCell.unitLevel = null;
    fromCell.unitHealth = null;
    fromCell.unitExp = 0;
    clearUnitStatus(fromCell);
    fromCell.unitStandby = false;
    fromCell.unitSupported = false;
    fromCell.unitRegisteredCommander = false;
    fromCell.pendingTombstone = null;
    if (options.hiddenOriginCell) {
        restoreCellFromMoveSnapshot(fromRow, fromCol, options.hiddenOriginCell);
    }
    try {
        return callback();
    }
    finally {
        restoreCellFromMoveSnapshot(fromRow, fromCol, fromSnapshot);
        restoreCellFromMoveSnapshot(toRow, toCol, toSnapshot);
    }
}
function chooseRandomBest(items, getValue) {
    if (!items || items.length === 0)
        return null;
    const values = items.map(item => getValue(item));
    const bestValue = Math.max(...values);
    const bestItems = items.filter((item, index) => values[index] === bestValue);
    return bestItems[Math.floor(Math.random() * bestItems.length)];
}
function getGridHash(row, col) {
    return row + col * 31 + 961;
}
function getTerrainCountByNames(terrainNames) {
    const names = Array.isArray(terrainNames) ? terrainNames : [terrainNames];
    let count = 0;
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const terrain = appData.gridData[i][j].terrain
                ? appData.terrains.find(t => t.id === appData.gridData[i][j].terrain)
                : null;
            if (terrain && names.includes(terrain.name))
                count++;
        }
    }
    return count;
}
function getBuildingTargetCapacity(target) {
    const terrainNamesByType = {
        terrainCastle: ['城堡'],
        terrainHouse: ['房子', '破房'],
        terrainRundown: ['房子', '破房']
    };
    const terrainNames = terrainNamesByType[target?.targetType];
    if (!terrainNames)
        return 64;
    return getActionOrderCapacity(getTerrainCountByNames(terrainNames));
}
function getBuildingTargetBucket(row, col, capacity = 64) {
    return getGridHash(row, col) % capacity;
}
function isPotentialBuildingTarget(target) {
    return !!(target && target.targetType && String(target.targetType).includes('terrain'));
}
function comparePotentialBuildingTargetsByHash(a, b) {
    const aCapacity = getBuildingTargetCapacity(a);
    const bCapacity = getBuildingTargetCapacity(b);
    const bucketDiff = getBuildingTargetBucket(a.row, a.col, aCapacity)
        - getBuildingTargetBucket(b.row, b.col, bCapacity);
    if (bucketDiff !== 0)
        return bucketDiff;
    if (a.col !== b.col)
        return a.col - b.col;
    return a.row - b.row;
}
function choosePotentialAttackTarget(targets) {
    if (!targets || targets.length === 0)
        return null;
    const buildingTargets = targets.filter(isPotentialBuildingTarget);
    if (buildingTargets.length > 0) {
        return buildingTargets.sort(comparePotentialBuildingTargetsByHash)[0];
    }
    return targets[Math.floor(Math.random() * targets.length)];
}
function buildScoreMap(scores) {
    const map = new Map();
    (scores || []).forEach(score => {
        map.set(score.row + ',' + score.col, score);
    });
    return map;
}
function safeCalculateScoreList(calculator, row, col, ...args) {
    try {
        const result = calculator(row, col, ...args);
        return Array.isArray(result) ? result : [];
    }
    catch (error) {
        console.warn('评分计算失败，已按0分继续:', error);
        return [];
    }
}
function getBestScoredTarget(legalTargets, scoreEntry, fallbackScore = 0) {
    if (!legalTargets || legalTargets.length === 0)
        return null;
    const scoredTargets = legalTargets.map(target => {
        const scored = scoreEntry && scoreEntry.targets
            ? scoreEntry.targets.find(item => item.row === target.row && item.col === target.col)
            : null;
        return {
            ...target,
            score: scored ? scored.score : fallbackScore
        };
    });
    return chooseRandomBest(scoredTargets, item => item.score);
}
function canStandOnMovementTarget(row, col, fromRow, fromCol) {
    const cell = appData.gridData[row]?.[col];
    if (!cell)
        return false;
    if (row === fromRow && col === fromCol)
        return true;
    return !cell.unit;
}
function getOccupyScoreForCell(row, col, unit, unitTeam) {
    const cell = appData.gridData[row]?.[col];
    if (!cell || !unit || !(unit.abilities || []).includes('占领'))
        return null;
    const terrain = cell.terrain ? appData.terrains.find(t => t.id === cell.terrain) : null;
    if (!terrain || (terrain.name !== '房子' && terrain.name !== '城堡'))
        return null;
    if (terrain.name === '城堡' && !(unit.abilities || []).includes('城主'))
        return null;
    const ownerTeam = cell.terrainTeam ? appData.teams.find(t => t.id === cell.terrainTeam) : null;
    if (ownerTeam && unitTeam && ownerTeam.alliance === unitTeam.alliance)
        return null;
    if (unitTeam && isHardAiTeam(unitTeam.id)) {
        if (terrain.name === '城堡')
            return ownerTeam ? 5000 : 2000;
        return ownerTeam ? 300 : 200;
    }
    return terrain.name === '城堡' ? 2000 : 1000;
}
function getRepairScoreForCell(row, col, unit, teamId = null) {
    const cell = appData.gridData[row]?.[col];
    if (!cell || !unit || !(unit.abilities || []).includes('修复'))
        return null;
    const terrain = cell.terrain ? appData.terrains.find(t => t.id === cell.terrain) : null;
    if (!terrain || terrain.name !== '破房')
        return null;
    return isHardAiTeam(teamId) ? 100 : 500;
}
function createDemoCandidate(row, col, moveScore, actionType, operationScore, target = null, extra = {}) {
    const actionTypeName = {
        wait: '待机',
        attack: '攻击',
        heal: '治疗',
        support: '支援',
        summon: '召唤',
        occupy: '占领',
        repair: '修复'
    }[actionType] || actionType;
    const cell = appData.gridData[row]?.[col];
    const teamId = moveScore.scoringTeamId || cell?.unitTeam;
    const unitId = moveScore.scoringUnitId || cell?.unit;
    const unit = unitId ? getUnitDefinition(unitId) : null;
    const hard = !!(teamId && isHardAiTeam(teamId));
    const assaultSkip = hard && (unit?.abilities || []).includes('突击部队')
        && Number.isFinite(moveScore.usedMove) && moveScore.usedMove >= unit.move / 2;
    const movementScore = assaultSkip ? 0 : moveScore.value;
    const scoredOperation = hard && actionType === 'wait' ? 0 : operationScore;
    const houseWaitPenalty = hard && actionType === 'wait'
        ? Number(extra.hardAiHouseWaitPenalty) || 0 : 0;
    const correctionScore = hard && actionType === 'wait' ? houseWaitPenalty
        : assaultSkip ? 0
            : hardAiCandidateCorrection(row, col, moveScore, unit, teamId);
    return {
        row: moveScore.row,
        col: moveScore.col,
        value: hard && actionType === 'wait' ? movementScore + houseWaitPenalty
            : floorAiScoreToPointTwo(movementScore + scoredOperation + correctionScore),
        actionType,
        actionTypeName,
        movementScore,
        operationScore: scoredOperation,
        correctionScore,
        target,
        potentialTarget: moveScore.potentialTarget ? { ...moveScore.potentialTarget } : null,
        preview: `移动到(${moveScore.row + 1},${moveScore.col + 1})后${actionTypeName}`,
        ...extra
    };
}
function calculateTotalScores(row, col, options = {}) {
    const cell = appData.gridData[row]?.[col];
    if (!cell || !cell.unit || cell.unitStandby)
        return [];
    const unit = appData.units.find(u => u.id === cell.unit);
    const unitTeam = appData.teams.find(t => t.id === cell.unitTeam);
    if (!unit || !unitTeam)
        return [];
    const movementOptions = options.movementOptions || {};
    const hiddenOriginCell = movementOptions.hiddenOriginCell || null;
    const movementScores = safeCalculateScoreList(calculateMovementScores, row, col, movementOptions);
    const hardAiBuildingTargets = isHardAiTeam(unitTeam.id)
        ? calculateHardAiBuildingTargetSet(unitTeam.id) : null;
    const captureReadyHouses = hardAiBuildingTargets
        && !(unit.abilities || []).includes('占领')
        ? getHardAiCaptureReadyHouseKeys(unitTeam.id) : null;
    const results = [];
    movementScores.forEach(moveScore => {
        if (!canStandOnMovementTarget(moveScore.row, moveScore.col, row, col))
            return;
        const houseWaitPenalty = captureReadyHouses?.has(`${moveScore.row},${moveScore.col}`)
            ? -100 : 0;
        results.push(createDemoCandidate(row, col, moveScore, 'wait', 0, null, { hardAiHouseWaitPenalty: houseWaitPenalty }));
        moveUnitForEvaluation(row, col, moveScore.row, moveScore.col, () => {
            const movedCell = appData.gridData[moveScore.row][moveScore.col];
            const movedUnit = appData.units.find(u => u.id === movedCell.unit);
            if (!movedUnit)
                return;
            const attackTargets = calculateAttackTargets(moveScore.row, moveScore.col)
                .filter(target => !hardAiBuildingTargets
                || target.targetType !== 'terrainHouse'
                || hardAiBuildingTargets.attackHouses.has(`${target.row},${target.col}`));
            if (attackTargets.length > 0) {
                const attackEntry = buildScoreMap(safeCalculateScoreList(calculateAttackScores, moveScore.row, moveScore.col))
                    .get(moveScore.row + ',' + moveScore.col);
                const targetsToScore = options.includeAllAttackTargets
                    ? attackTargets.map(target => ({
                        ...target,
                        score: attackEntry?.targets?.find(item => item.row === target.row
                            && item.col === target.col)?.score || 0
                    }))
                    : [getBestScoredTarget(attackTargets, attackEntry, 0)];
                targetsToScore.forEach(target => {
                    results.push(createDemoCandidate(row, col, moveScore, 'attack', target?.score || 0, target, {
                        targets: attackTargets
                    }));
                });
            }
            const healTargets = (movedUnit.abilities || []).includes('治疗') ? calculateHealTargets(moveScore.row, moveScore.col) : [];
            if (healTargets.length > 0) {
                const movedHealScoreMap = buildScoreMap(safeCalculateScoreList(calculateHealScores, moveScore.row, moveScore.col));
                const scoredTargets = healTargets.map(target => ({
                    ...target,
                    score: ((movedHealScoreMap.get(target.row + ',' + target.col)?.value) || 0)
                        + getSameTypeStationaryHealPenalty(unit.id, row, col, moveScore.row, moveScore.col, target.row, target.col)
                }));
                const target = chooseRandomBest(scoredTargets, item => item.score);
                results.push(createDemoCandidate(row, col, moveScore, 'heal', target ? target.score : 0, target, {
                    targets: healTargets
                }));
            }
            const supportTargets = (movedUnit.abilities || []).includes('支援') ? calculateSupportTargets(moveScore.row, moveScore.col) : [];
            if (supportTargets.length > 0) {
                const movedSupportScoreMap = buildScoreMap(safeCalculateScoreList(calculateSupportScores, moveScore.row, moveScore.col));
                const scoredTargets = supportTargets.map(target => ({
                    ...target,
                    score: (movedSupportScoreMap.get(target.row + ',' + target.col)?.value) || 0
                }));
                const target = chooseRandomBest(scoredTargets, item => item.score);
                results.push(createDemoCandidate(row, col, moveScore, 'support', target ? target.score : 0, target, {
                    targets: supportTargets
                }));
            }
            const summonTargets = (movedUnit.abilities || []).includes('召唤') ? calculateSummonTargets(moveScore.row, moveScore.col) : [];
            if (summonTargets.length > 0) {
                const target = summonTargets[Math.floor(Math.random() * summonTargets.length)];
                results.push(createDemoCandidate(row, col, moveScore, 'summon', 100, target, {
                    targets: summonTargets
                }));
            }
            const occupyScore = getOccupyScoreForCell(moveScore.row, moveScore.col, movedUnit, unitTeam);
            const buildingKey = `${moveScore.row},${moveScore.col}`;
            const buildingTerrain = movedCell.terrain;
            const canTargetBuilding = !hardAiBuildingTargets
                || buildingTerrain === 'castle'
                || (buildingTerrain === 'house' && hardAiBuildingTargets.houses.has(buildingKey));
            if (occupyScore !== null && canTargetBuilding) {
                results.push(createDemoCandidate(row, col, moveScore, 'occupy', occupyScore));
            }
            const repairScore = getRepairScoreForCell(moveScore.row, moveScore.col, movedUnit, unitTeam.id);
            if (repairScore !== null && (!hardAiBuildingTargets
                || hardAiBuildingTargets.rundowns.has(buildingKey))) {
                results.push(createDemoCandidate(row, col, moveScore, 'repair', repairScore));
            }
        }, {
            hiddenOriginCell
        });
    });
    return results;
}
function isBuildingDemoCandidate(candidate) {
    if (!candidate)
        return false;
    if (candidate.actionType === 'occupy' || candidate.actionType === 'repair')
        return true;
    return !!(candidate.target && candidate.target.targetType && String(candidate.target.targetType).includes('terrain'));
}
function chooseBestLandingCandidate(candidates, randomizeNonBuildingTies = false) {
    if (!candidates || candidates.length === 0)
        return null;
    const bestValue = Math.max(...candidates.map(candidate => candidate.value));
    const bestCandidates = candidates.filter(candidate => candidate.value === bestValue);
    if (!randomizeNonBuildingTies || bestCandidates.length <= 1)
        return bestCandidates[0];
    const nonBuildingCandidates = bestCandidates.filter(candidate => !isBuildingDemoCandidate(candidate));
    if (nonBuildingCandidates.length > 1) {
        return nonBuildingCandidates[Math.floor(Math.random() * nonBuildingCandidates.length)];
    }
    return bestCandidates[0];
}
function calculateSingleUnitTotalScores(row, col, randomizeNonBuildingTies = false, excludeOrigin = false, options = {}) {
    const candidates = safeCalculateScoreList(calculateTotalScores, row, col, options);
    const groupedByLanding = new Map();
    candidates.forEach(candidate => {
        if (excludeOrigin && candidate.row === row && candidate.col === col)
            return;
        const key = candidate.row + ',' + candidate.col;
        if (!groupedByLanding.has(key))
            groupedByLanding.set(key, []);
        groupedByLanding.get(key).push(candidate);
    });
    return [...groupedByLanding.values()]
        .map(group => chooseBestLandingCandidate(group, randomizeNonBuildingTies))
        .filter(Boolean)
        .map(candidate => ({ ...candidate }));
}
function calculateHardAiSupportScores(row, col) {
    const targets = calculateSupportTargets(row, col);
    return targets.map(target => {
        const cell = appData.gridData[target.row]?.[target.col];
        if (!cell?.unit)
            return { row: target.row, col: target.col, value: 0 };
        const snapshot = snapshotCellForMove(target.row, target.col);
        try {
            cell.unitStandby = false;
            cell.unitSupported = true;
            const candidates = calculateSingleUnitTotalScores(target.row, target.col, true);
            const best = chooseBestLandingCandidate(candidates, true);
            return { row: target.row, col: target.col, value: best ? best.value : 0 };
        }
        finally {
            restoreCellFromMoveSnapshot(target.row, target.col, snapshot);
        }
    });
}
function calculateSupportScores(row, col) {
    const selectCell = appData.gridData[row][col];
    if (!selectCell.unit)
        return [];
    const Team = appData.teams.find(t => t.id === selectCell.unitTeam);
    const Unit = appData.units.find(u => u.id === selectCell.unit);
    if (!Unit.abilities.includes("支援"))
        return [];
    if (isHardAiTeam(selectCell.unitTeam)) {
        return calculateHardAiSupportScores(row, col);
    }
    const results = [];
    const operationalTargets = getOperationalTargets(row, col, "支援");
    for (let k = 0; k < operationalTargets.length; k++) {
        const position = operationalTargets[k];
        let i = position.row;
        let j = position.col;
        const SupportCell = appData.gridData[i][j];
        if (!SupportCell.unit)
            continue;
        const SupportTeam = appData.teams.find(t => t.id === SupportCell.unitTeam);
        if (!SupportTeam || SupportTeam !== Team)
            continue;
        if (SupportCell.unitSupported === true)
            continue;
        let SupportUnit = appData.units.find(u => u.id === SupportCell.unit);
        if (SupportUnit.abilities.includes("突击部队"))
            continue;
        let SupportLevel = SupportCell.unitLevel;
        let SupportStatus = SupportCell.unitStatus;
        let SupportAttack = SupportUnit.attack + SupportUnit.atkUp * SupportLevel;
        let SupportAbilities = SupportUnit.abilities;
        let SupportMove = SupportUnit.move;
        if (SupportUnit.name === "指挥官" || SupportUnit.name === "幽灵" || SupportUnit.name === "德鲁伊") {
            SupportMove += SupportLevel;
        }
        if (SupportStatus === "虚弱") {
            SupportMove = 1;
        }
        let SupportMinRange = SupportUnit.minRange;
        let SupportMaxRange = SupportUnit.maxRange;
        let SupportMaxhp = 100 + SupportUnit.hpUp * SupportLevel;
        let SupportHealth = SupportCell.unitHealth;
        let Value = SupportAttack - 20;
        if (SupportAbilities.includes("战意")) {
            Value += 20 + 10 * SupportLevel;
        }
        if (SupportAbilities.includes("召唤")) {
            Value += 15 + 15 * SupportLevel;
        }
        if (SupportAbilities.includes("治疗") || SupportAbilities.includes("净化光环")) {
            Value += 15 + 5 * SupportLevel;
        }
        if (SupportAbilities.includes("近战大师")) {
            Value += 10 + 5 * SupportLevel;
        }
        if (SupportAbilities.includes("神射手") || SupportAbilities.includes("山之子") || SupportAbilities.includes("水之子") || SupportAbilities.includes("森林之子")) {
            Value += 5;
        }
        let SupportScore = Math.floor(Value * SupportHealth / SupportMaxhp);
        let correction = 0;
        if (SupportAbilities.includes("空军")) {
            correction = 2;
        }
        else if (SupportAbilities.includes("大地之子")) {
            correction = 1;
        }
        let rangeScore = SupportMaxRange + SupportMove - 2 + correction;
        let Score = (rangeScore + SupportScore) * 4;
        if (SupportAbilities.includes("治疗")) {
            Score -= 400;
        }
        if (isTeamOwnedBuildingThreatenedForSupport(i, j, SupportCell.unitTeam)) {
            Score = 0;
        }
        results.push({
            row: i,
            col: j,
            value: Score
        });
    }
    return results;
}
function getSameTypeStationaryHealPenalty(actorUnitId, startRow, startCol, endRow, endCol, targetRow, targetCol) {
    if (startRow !== endRow || startCol !== endCol)
        return 0;
    const targetCell = appData.gridData[targetRow]?.[targetCol];
    if (!actorUnitId || !targetCell || !targetCell.unit)
        return 0;
    return actorUnitId === targetCell.unit ? -400 : 0;
}
function calculateHealScores(row, col) {
    const selectCell = appData.gridData[row][col];
    if (!selectCell.unit)
        return [];
    const Team = appData.teams.find(t => t.id === selectCell.unitTeam);
    const Alliance = Team.alliance;
    const Unit = appData.units.find(u => u.id === selectCell.unit);
    if (!Unit.abilities.includes("治疗"))
        return [];
    let selectCellLevel = selectCell.unitLevel;
    const results = [];
    const operationalTargets = getOperationalTargets(row, col, "治疗");
    for (let k = 0; k < operationalTargets.length; k++) {
        const position = operationalTargets[k];
        let i = position.row;
        let j = position.col;
        const HealCell = appData.gridData[i][j];
        if (!HealCell.unit)
            continue;
        let HealUnit = appData.units.find(u => u.id === HealCell.unit);
        const HealTeam = appData.teams.find(t => t.id === HealCell.unitTeam);
        if (!HealTeam || (HealTeam.alliance !== Alliance && !HealUnit.abilities.includes("亡灵")))
            continue;
        const isHealTargetUndead = HealUnit.abilities.includes("亡灵");
        const isHealTargetEnemy = HealTeam.alliance !== Alliance;
        let HealLevel = HealCell.unitLevel;
        let HealStatus = HealCell.unitStatus;
        let HealAttack = HealUnit.attack + HealUnit.atkUp * HealLevel;
        let HealAbilities = HealUnit.abilities;
        let HealMove = HealUnit.move;
        if (HealUnit.name === "指挥官" || HealUnit.name === "幽灵" || HealUnit.name === "德鲁伊") {
            HealMove += HealLevel;
        }
        if (HealStatus === "虚弱") {
            HealMove = 1;
        }
        let HealMinRange = HealUnit.minRange;
        let HealMaxRange = HealUnit.maxRange;
        if (HealStatus === "致盲") {
            HealMaxRange = 0;
        }
        let HealMaxhp = 100 + HealUnit.hpUp * HealLevel;
        let HealHealth = HealCell.unitHealth;
        let HealValue = getAiScoringUnitValue(HealUnit, HealLevel, HealCell.unitTeam, i, j, selectCell.unitTeam);
        let correction = 0;
        if (HealAbilities.includes("空军")) {
            correction = 2;
        }
        else if (HealAbilities.includes("大地之子")) {
            correction = 1;
        }
        let rangeScore = HealMaxRange + HealMove - 2 + correction;
        let Score = 0;
        let Value = Math.floor((HealAttack * HealHealth / HealMaxhp) / 5 + rangeScore);
        if (HealUnit.name === "指挥官" && HealHealth < HealMaxhp / 2) {
            Value = Math.floor(Value * 1.5);
        }
        if (!HealAbilities.includes("治疗") || HealHealth <= HealMaxhp / 2) {
            const healAmountForScore = isHealTargetUndead
                ? -1.5 * (40 + 10 * selectCellLevel)
                : 40 + 10 * selectCellLevel;
            Score = floorAiScoreToPointTwo(healAmountForScore * Value / 5);
            if (HealCell.terrain === 'castle'
                && HealCell.terrainTeam === selectCell.unitTeam
                && isTeamBuildingThreatenedByEnemyMover(i, j, 'castle', selectCell.unitTeam)) {
                Score += 1000;
            }
        }
        let selfHealScoreAdjust = 0;
        if (i === row && j === col) {
            if (HealHealth <= HealMaxhp / 2) {
                selfHealScoreAdjust = 10;
            }
            else {
                selfHealScoreAdjust = -10;
            }
        }
        if (HealCell.unitStandby && HealCell.unitTeam === selectCell.unitTeam) {
            Score = floorAiScoreToPointTwo(Score * 1.2);
        }
        Score += selfHealScoreAdjust;
        Score += 10;
        if (isHealTargetUndead && isHealTargetEnemy) {
            Score = -Score;
        }
        results.push({
            row: i,
            col: j,
            value: Score
        });
    }
    return results;
}
function getTeamUnits() {
    const teamUnits = {};
    appData.teams.forEach(team => {
        teamUnits[team.id] = [];
    });
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i][j];
            if (cell.unit && cell.unitTeam && teamUnits[cell.unitTeam]) {
                teamUnits[cell.unitTeam].push({
                    row: i,
                    col: j
                });
            }
        }
    }
    return teamUnits;
}
function getOperationalTargets(row, col, operationType = "攻击") {
    const cell = appData.gridData[row][col];
    if (!cell.unit)
        return [];
    const sourceUnit = appData.units.find(u => u.id === cell.unit);
    const sourceTeam = appData.teams.find(t => t.id === cell.unitTeam);
    if (!sourceUnit || !sourceTeam)
        return [];
    let minRange = sourceUnit.minRange;
    let maxRange = sourceUnit.maxRange;
    if (cell.unitStatus === "致盲") {
        minRange = 0;
        maxRange = 0;
    }
    const operationalTargets = [];
    const reachablePositions = calculateMovementRange(row, col);
    let targetTeams = [];
    switch (operationType) {
        case '攻击':
            targetTeams = appData.teams.filter(team => team.alliance !== sourceTeam.alliance);
            break;
        case '支援':
            targetTeams = [sourceTeam];
            break;
        case '治疗':
            targetTeams = appData.teams;
            break;
    }
    const allTargetUnits = [];
    targetTeams.forEach(team => {
        const teamUnits = getTeamUnits()[team.id];
        allTargetUnits.push(...teamUnits);
    });
    allTargetUnits.forEach(targetUnit => {
        reachablePositions.forEach(position => {
            const distance = Math.abs(position.row - targetUnit.row) + Math.abs(position.col - targetUnit.col);
            if (operationType === '支援' && targetUnit.row === row && targetUnit.col === col)
                return;
            const isBlindSelfHeal = cell.unitStatus === "致盲"
                && operationType === '治疗'
                && targetUnit.row === row
                && targetUnit.col === col;
            if ((distance >= minRange && distance <= maxRange && maxRange !== 0) || isBlindSelfHeal) {
                operationalTargets.push({
                    row: targetUnit.row,
                    col: targetUnit.col,
                });
            }
        });
    });
    return operationalTargets;
}
function removeAllUnits() {
    if (confirm('确定要删除所有单位吗?此操作不可撤销。')) {
        for (let i = 0; i < appData.rows; i++) {
            for (let j = 0; j < appData.cols; j++) {
                const cell = appData.gridData[i][j];
                cell.unit = null;
                cell.unitTeam = null;
                cell.unitLevel = 1;
                cell.unitHealth = 100;
                cell.unitExp = 0;
                cell.unitRegisteredCommander = false;
                clearUnitStatus(cell);
            }
        }
        appData.calculationResults = null;
        renderGrid();
        alert('所有单位已删除');
    }
}
function clearUnitWithoutTombstone(cell) {
    cell.unit = null;
    cell.unitTeam = null;
    cell.unitLevel = 1;
    cell.unitHealth = 100;
    cell.unitExp = 0;
    cell.unitRegisteredCommander = false;
    cell.unitStandby = false;
    cell.unitSupported = false;
    cell.unitTraceId = null;
    cell.pendingTombstone = null;
    clearUnitStatus(cell);
}
function surrenderCurrentMoveTeam() {
    const teamId = ensureMoveModeCurrentTeam();
    const team = appData.teams.find(t => t.id === teamId);
    if (!team)
        return;
    if (!confirm(`确定让当前行动队伍${team.name}投降吗?该队所有单位会消失,城堡和房子变为无归属。`))
        return;
    saveMoveModeCompletedTurn();
    appendMoveModeAction(makeMoveModeAction('SURRENDER'));
    const nextTeamId = getNextMoveModeTeamId(teamId);
    const hasNextTeam = !!nextTeamId && nextTeamId !== teamId;
    const roundWrapped = hasNextTeam && isMoveModeRoundWrapped(teamId, nextTeamId);
    team.playerType = 0;
    let removedUnits = 0;
    let neutralizedBuildings = 0;
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i][j];
            if (!cell)
                continue;
            if (cell.unit && cell.unitTeam === teamId) {
                clearUnitWithoutTombstone(cell);
                removedUnits++;
            }
            if ((cell.terrain === 'castle' || cell.terrain === 'house') && cell.terrainTeam === teamId) {
                cell.terrainTeam = null;
                neutralizedBuildings++;
            }
        }
    }
    clearMoveModeInteractionState();
    appData.currentMoveTeam = hasNextTeam ? nextTeamId : null;
    let turnStart = null;
    if (hasNextTeam) {
        if (roundWrapped)
            incrementMoveModeRound();
        turnStart = settleDemoTeamTurnStart(nextTeamId);
    }
    resetMoveModeHistoryBaseline(true);
    renderTeamConfigs();
    renderGrid();
    renderMoveModeTeamStats();
    updateMoveModeCurrentTeamLabel(turnStart);
    updateSelectedUnitInfo();
    updateMoveModeRange();
    alert(`${team.name}已投降: 移除${removedUnits}个单位, ${neutralizedBuildings}个建筑变为无归属。`);
}
function applyTerrainToAllEmpty() {
    if (!appData.selectedTerrain) {
        alert('请先选择一种地形');
        return;
    }
    const teamValue = elements.terrainTeam.value;
    const team = teamValue === "" ? null : teamValue;
    let count = 0;
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            const cell = appData.gridData[i][j];
            if (!cell.terrain) {
                cell.terrain = appData.selectedTerrain;
                cell.terrainTeam = team;
                count++;
            }
        }
    }
    appData.calculationResults = null;
    renderGrid();
    alert(`已将地形应用到 ${count} 个空网格`);
}
function executeMirror() {
    const axis = parseInt(elements.mirrorAxis.value);
    const sourceSide = elements.mirrorSourceSide.value;
    const terrainTeam = document.getElementById('mirrorTerrainTeam').value;
    const unitTeam = document.getElementById('mirrorUnitTeam').value;
    const centerX = (appData.rows - 1) / 2;
    const centerY = (appData.cols - 1) / 2;
    for (let i = 0; i < appData.rows; i++) {
        for (let j = 0; j < appData.cols; j++) {
            let sourceRow = i, sourceCol = j;
            let targetRow = i, targetCol = j;
            switch (axis) {
                case 0:
                    if ((sourceSide === 'left' && j <= centerY) ||
                        (sourceSide === 'right' && j >= centerY)) {
                        targetCol = appData.cols - 1 - j;
                    }
                    else {
                        continue;
                    }
                    break;
                case 90:
                    if ((sourceSide === 'top' && i <= centerX) ||
                        (sourceSide === 'bottom' && i >= centerX)) {
                        targetRow = appData.rows - 1 - i;
                    }
                    else {
                        continue;
                    }
                    break;
                case 45:
                    if ((sourceSide === 'top' && i + j <= centerX + centerY) ||
                        (sourceSide === 'bottom' && i + j >= centerX + centerY)) {
                        targetRow = appData.cols - 1 - j;
                        targetCol = appData.rows - 1 - i;
                    }
                    else {
                        continue;
                    }
                    break;
                case 135:
                    if ((sourceSide === 'top' && i - j <= centerX - centerY) ||
                        (sourceSide === 'bottom' && i - j >= centerX - centerY)) {
                        targetRow = j;
                        targetCol = i;
                    }
                    else {
                        continue;
                    }
                    break;
            }
            if (targetRow >= 0 && targetRow < appData.rows &&
                targetCol >= 0 && targetCol < appData.cols) {
                const originalTerrain = appData.gridData[targetRow][targetCol].terrain;
                const originalTerrainTeam = appData.gridData[targetRow][targetCol].terrainTeam;
                const originalUnit = appData.gridData[targetRow][targetCol].unit;
                const originalUnitTeam = appData.gridData[targetRow][targetCol].unitTeam;
                const originalUnitLevel = appData.gridData[targetRow][targetCol].unitLevel;
                const originalUnitHealth = appData.gridData[targetRow][targetCol].unitHealth;
                const originalUnitExp = appData.gridData[targetRow][targetCol].unitExp || 0;
                const originalUnitStatus = appData.gridData[targetRow][targetCol].unitStatus;
                const originalUnitStatusTurns = appData.gridData[targetRow][targetCol].unitStatusTurns || 0;
                appData.gridData[targetRow][targetCol] = JSON.parse(JSON.stringify(appData.gridData[sourceRow][sourceCol]));
                if (terrainTeam === 'noCopy') {
                    appData.gridData[targetRow][targetCol].terrain = originalTerrain;
                    appData.gridData[targetRow][targetCol].terrainTeam = originalTerrainTeam;
                }
                else if (terrainTeam !== 'keep') {
                    appData.gridData[targetRow][targetCol].terrainTeam = terrainTeam === '' ? null : terrainTeam;
                }
                if (unitTeam === 'noCopy') {
                    appData.gridData[targetRow][targetCol].unit = originalUnit;
                    appData.gridData[targetRow][targetCol].unitTeam = originalUnitTeam;
                    appData.gridData[targetRow][targetCol].unitLevel = originalUnitLevel;
                    appData.gridData[targetRow][targetCol].unitHealth = originalUnitHealth;
                    appData.gridData[targetRow][targetCol].unitExp = originalUnitExp;
                    appData.gridData[targetRow][targetCol].unitStatus = originalUnitStatus;
                    appData.gridData[targetRow][targetCol].unitStatusTurns = originalUnitStatusTurns;
                }
                else if (unitTeam !== 'keep') {
                    appData.gridData[targetRow][targetCol].unitTeam = unitTeam;
                }
            }
        }
    }
    appData.calculationResults = null;
    renderGrid();
    alert('镜像操作完成');
}
function executeCopy() {
    const axis = elements.copyAxis.value;
    const sourceSide = elements.copySourceSide.value;
    const distance = parseInt(document.getElementById('copyDistance').value) || 1;
    const count = parseInt(document.getElementById('copyCount').value) || 1;
    const terrainTeam = document.getElementById('copyTerrainTeam').value;
    const unitTeam = document.getElementById('copyUnitTeam').value;
    const tempGridData = JSON.parse(JSON.stringify(appData.gridData));
    for (let copyIndex = 1; copyIndex <= count; copyIndex++) {
        const currentDistance = distance * copyIndex;
        for (let i = 0; i < appData.rows; i++) {
            for (let j = 0; j < appData.cols; j++) {
                let sourceRow = i, sourceCol = j;
                let targetRow = i, targetCol = j;
                if (axis === 'row') {
                    if (sourceSide === 'top' && i < appData.rows - currentDistance) {
                        targetRow = i + currentDistance;
                    }
                    else if (sourceSide === 'bottom' && i >= currentDistance) {
                        targetRow = i - currentDistance;
                    }
                    else {
                        continue;
                    }
                }
                else {
                    if (sourceSide === 'left' && j < appData.cols - currentDistance) {
                        targetCol = j + currentDistance;
                    }
                    else if (sourceSide === 'right' && j >= currentDistance) {
                        targetCol = j - currentDistance;
                    }
                    else {
                        continue;
                    }
                }
                if (targetRow >= 0 && targetRow < appData.rows &&
                    targetCol >= 0 && targetCol < appData.cols) {
                    const originalTerrain = tempGridData[targetRow][targetCol].terrain;
                    const originalTerrainTeam = tempGridData[targetRow][targetCol].terrainTeam;
                    const originalUnit = tempGridData[targetRow][targetCol].unit;
                    const originalUnitTeam = tempGridData[targetRow][targetCol].unitTeam;
                    const originalUnitLevel = tempGridData[targetRow][targetCol].unitLevel;
                    const originalUnitHealth = tempGridData[targetRow][targetCol].unitHealth;
                    const originalUnitExp = tempGridData[targetRow][targetCol].unitExp || 0;
                    const originalUnitStatus = tempGridData[targetRow][targetCol].unitStatus;
                    const originalUnitStatusTurns = tempGridData[targetRow][targetCol].unitStatusTurns || 0;
                    appData.gridData[targetRow][targetCol] = JSON.parse(JSON.stringify(tempGridData[sourceRow][sourceCol]));
                    if (terrainTeam === 'noCopy') {
                        appData.gridData[targetRow][targetCol].terrain = originalTerrain;
                        appData.gridData[targetRow][targetCol].terrainTeam = originalTerrainTeam;
                    }
                    else if (terrainTeam !== 'keep') {
                        appData.gridData[targetRow][targetCol].terrainTeam = terrainTeam === '' ? null : terrainTeam;
                    }
                    if (unitTeam === 'noCopy') {
                        appData.gridData[targetRow][targetCol].unit = originalUnit;
                        appData.gridData[targetRow][targetCol].unitTeam = originalUnitTeam;
                        appData.gridData[targetRow][targetCol].unitLevel = originalUnitLevel;
                        appData.gridData[targetRow][targetCol].unitHealth = originalUnitHealth;
                        appData.gridData[targetRow][targetCol].unitExp = originalUnitExp;
                        appData.gridData[targetRow][targetCol].unitStatus = originalUnitStatus;
                        appData.gridData[targetRow][targetCol].unitStatusTurns = originalUnitStatusTurns;
                    }
                    else if (unitTeam !== 'keep') {
                        appData.gridData[targetRow][targetCol].unitTeam = unitTeam;
                    }
                }
            }
        }
    }
    appData.calculationResults = null;
    renderGrid();
    alert(`复制操作完成,共复制 ${count} 次`);
}
function applyTerrainToRect() {
    if (!appData.selectedTerrain) {
        alert('请先选择一种地形');
        return;
    }
    const startRow = parseInt(document.getElementById('rectStartRow').value) - 1;
    const startCol = parseInt(document.getElementById('rectStartCol').value) - 1;
    const endRow = parseInt(document.getElementById('rectEndRow').value) - 1;
    const endCol = parseInt(document.getElementById('rectEndCol').value) - 1;
    if (isNaN(startRow) || isNaN(startCol) || isNaN(endRow) || isNaN(endCol) ||
        startRow < 0 || startCol < 0 || endRow < 0 || endCol < 0 ||
        startRow >= appData.rows || startCol >= appData.cols ||
        endRow >= appData.rows || endCol >= appData.cols) {
        alert('请输入有效的矩形区域坐标(1到' + appData.rows + '行,1到' + appData.cols + '列)');
        return;
    }
    const actualStartRow = Math.min(startRow, endRow);
    const actualEndRow = Math.max(startRow, endRow);
    const actualStartCol = Math.min(startCol, endCol);
    const actualEndCol = Math.max(startCol, endCol);
    const teamValue = elements.terrainTeam.value;
    const team = teamValue === "" ? null : teamValue;
    let count = 0;
    for (let i = actualStartRow; i <= actualEndRow; i++) {
        for (let j = actualStartCol; j <= actualEndCol; j++) {
            const cell = appData.gridData[i][j];
            cell.terrain = appData.selectedTerrain;
            cell.terrainTeam = team;
            count++;
        }
    }
    appData.calculationResults = null;
    renderGrid();
    alert(`已将地形应用到矩形区域 (${actualStartRow + 1},${actualStartCol + 1}) 到 (${actualEndRow + 1},${actualEndCol + 1}) 的 ${count} 个网格`);
}
function calculateAttackTargets(attackerRow, attackerCol) {
    const attackerCell = appData.gridData[attackerRow][attackerCol];
    if (!attackerCell.unit)
        return [];
    if (attackerCell.unitStandby)
        return [];
    const attackerUnitDef = appData.units.find(u => u.id === attackerCell.unit);
    if (!attackerUnitDef)
        return [];
    const attackerTeam = appData.teams.find(t => t.id === attackerCell.unitTeam);
    const attackerAlliance = attackerTeam ? attackerTeam.alliance : -1;
    const attackerLevel = attackerCell.unitLevel || 0;
    const attackerStatus = attackerCell.unitStatus || '无';
    const attackerAbilities = attackerUnitDef.abilities || [];
    let attackerMinRange = attackerUnitDef.minRange || 1;
    let attackerMaxRange = attackerUnitDef.maxRange || 1;
    if (attackerStatus === '致盲') {
        attackerMinRange = 0;
        attackerMaxRange = 0;
    }
    const attackerAttack = attackerUnitDef.attack + attackerUnitDef.atkUp * attackerLevel;
    const attackerMaxhp = 100 + attackerUnitDef.hpUp * attackerLevel;
    const attackerHealth = attackerCell.unitHealth;
    const attackerTerrain = attackerCell.terrain ? appData.terrains.find(t => t.id === attackerCell.terrain) : null;
    let attackerTerrainDefense = attackerTerrain ? attackerTerrain.defense : 5;
    if (attackerAbilities.includes('空军'))
        attackerTerrainDefense = 0;
    const targets = [];
    const directions = getRangeRelativeCoordinates(attackerMinRange, attackerMaxRange, false);
    for (const [dx, dy] of directions) {
        const nx = attackerRow + dx;
        const ny = attackerCol + dy;
        if (nx < 0 || nx >= appData.rows || ny < 0 || ny >= appData.cols)
            continue;
        const defenseCell = appData.gridData[nx][ny];
        const attackDistance = Math.abs(dx) + Math.abs(dy);
        const attackMode = (attackDistance === 1) ? '近战' : '远程';
        if (!defenseCell.unit) {
            const targetTerrain = defenseCell.terrain ? appData.terrains.find(t => t.id === defenseCell.terrain) : null;
            if (attackerUnitDef.id === 'catapult' && targetTerrain && targetTerrain.name === '房子') {
                targets.push({
                    row: nx,
                    col: ny,
                    targetType: 'terrainHouse',
                    attackDamage: 0,
                    counterDamage: 0,
                    didCounter: false,
                    attackMode
                });
            }
            continue;
        }
        const defenseTeam = appData.teams.find(t => t.id === defenseCell.unitTeam);
        if (!defenseTeam || defenseTeam.alliance === attackerAlliance)
            continue;
        const defenseUnitDef = appData.units.find(u => u.id === defenseCell.unit);
        if (!defenseUnitDef)
            continue;
        const defenseLevel = defenseCell.unitLevel || 0;
        const defenseStatus = defenseCell.unitStatus || '无';
        const defenseAbilities = defenseUnitDef.abilities || [];
        const defenseMinRange = defenseUnitDef.minRange || 1;
        const defenseMaxRange = defenseUnitDef.maxRange || 1;
        const defenseAttack = defenseUnitDef.attack + defenseUnitDef.atkUp * defenseLevel;
        const defenseMaxhp = 100 + defenseUnitDef.hpUp * defenseLevel;
        const defenseHealth = defenseCell.unitHealth;
        const defenseDefense = (attackerUnitDef.type === '物理')
            ? defenseUnitDef.physDef + 5 * defenseLevel
            : defenseUnitDef.magicDef + 5 * defenseLevel;
        const atkDefense = (defenseUnitDef.type === '物理')
            ? attackerUnitDef.physDef + 5 * attackerLevel
            : attackerUnitDef.magicDef + 5 * attackerLevel;
        const defenseTerrain = defenseCell.terrain ? appData.terrains.find(t => t.id === defenseCell.terrain) : null;
        let defenseTerrainDefense = defenseTerrain ? defenseTerrain.defense : 5;
        if (defenseAbilities.includes('空军'))
            defenseTerrainDefense = 0;
        let Correction = 0;
        let xishu = 1;
        if (attackerAbilities.includes('战意'))
            xishu = 1;
        if (attackMode === '远程') {
            if (attackerStatus === '鼓舞')
                Correction += 5;
            if (defenseStatus === '虚弱')
                Correction += 5;
            if (defenseAbilities.includes('远程减半'))
                xishu /= 2;
        }
        if (attackMode === '近战') {
            if (attackerStatus === '鼓舞')
                Correction += 10;
            if (defenseStatus === '虚弱')
                Correction += 10;
            if (!defenseAbilities.includes('近战大师') && attackerAbilities.includes('近战大师'))
                xishu *= 1.5;
        }
        if (attackerAbilities.includes('空军') && !defenseAbilities.includes('空军') && defenseTerrain && WaterTerrain.includes(defenseTerrain.name))
            Correction += 10;
        if (attackerAbilities.includes('神射手') && defenseAbilities.includes('空军'))
            Correction += 10;
        if (attackerAbilities.includes('森林之子') && attackerTerrain && attackerTerrain.name === '树林')
            Correction += 10;
        if (attackerAbilities.includes('水之子') && WaterTerrain.includes(attackerTerrain ? attackerTerrain.name : ''))
            Correction += 10;
        if (attackerAbilities.includes('山之子') && MountainTerrain.includes(attackerTerrain ? attackerTerrain.name : ''))
            Correction += 10;
        if (defenseAbilities.includes('森林之子') && defenseTerrain && defenseTerrain.name === '树林')
            Correction -= 10;
        if (defenseAbilities.includes('水之子') && WaterTerrain.includes(defenseTerrain ? defenseTerrain.name : ''))
            Correction -= 10;
        if (defenseAbilities.includes('山之子') && MountainTerrain.includes(defenseTerrain ? defenseTerrain.name : ''))
            Correction -= 10;
        if (attackerAbilities.includes('破坏者') && defenseTerrain && defenseTerrain.name === '房子')
            Correction += 10;
        if (attackerAbilities.includes('死亡收割者') && debuff.includes(defenseStatus))
            Correction += 20;
        let baseDamage = Math.max(attackerAttack - defenseDefense - defenseTerrainDefense + Correction, 0);
        let midDamage = Math.floor(baseDamage * (attackerAbilities.includes('战意') ? attackerMaxhp : attackerHealth) / attackerMaxhp);
        let attackDamage = Math.min(Math.floor(xishu * midDamage), defenseHealth);
        let counterDamage = 0;
        let counterHealth = Math.max(defenseHealth - attackDamage, 0);
        const counterDefenseStatus = getCounterDefenseStatus(defenseStatus, defenseAbilities, attackerAbilities);
        const canCounter = canCounterAttackAtDistance(attackDistance, defenseMinRange, defenseAbilities, defenseStatus, attackerAbilities);
        const didCounter = canCounter && counterHealth > 0;
        if (didCounter) {
            let Correction1 = 0;
            let xishu1 = 1;
            if (defenseAbilities.includes('战意'))
                xishu1 = 1;
            if (attackMode === '远程' || counterDefenseStatus === '致盲') {
                if (!defenseAbilities.includes('反击风暴') || attackDistance > 2) {
                    counterDamage = 0;
                }
                else {
                    if (counterDefenseStatus === '致盲') {
                        if (defenseStatus === '鼓舞')
                            Correction1 += 5;
                        if (attackerStatus === '虚弱')
                            Correction1 += 5;
                        if (attackerAbilities.includes('远程减半'))
                            xishu1 /= 2;
                    }
                }
            }
            if (attackMode === '近战' && defenseMinRange <= 1) {
                if (defenseStatus === '鼓舞')
                    Correction1 += 10;
                if (attackerStatus === '虚弱')
                    Correction1 += 10;
                if (!attackerAbilities.includes('近战大师') && defenseAbilities.includes('近战大师'))
                    xishu1 *= 1.5;
            }
            if (defenseAbilities.includes('空军') && !attackerAbilities.includes('空军') && attackerTerrain && WaterTerrain.includes(attackerTerrain.name))
                Correction1 += 10;
            if (defenseAbilities.includes('神射手') && attackerAbilities.includes('空军'))
                Correction1 += 10;
            if (defenseAbilities.includes('森林之子') && defenseTerrain && defenseTerrain.name === '树林')
                Correction1 += 10;
            if (defenseAbilities.includes('水之子') && WaterTerrain.includes(defenseTerrain ? defenseTerrain.name : ''))
                Correction1 += 10;
            if (defenseAbilities.includes('山之子') && MountainTerrain.includes(defenseTerrain ? defenseTerrain.name : ''))
                Correction1 += 10;
            if (attackerAbilities.includes('森林之子') && attackerTerrain && attackerTerrain.name === '树林')
                Correction1 -= 10;
            if (attackerAbilities.includes('水之子') && WaterTerrain.includes(attackerTerrain ? attackerTerrain.name : ''))
                Correction1 -= 10;
            if (attackerAbilities.includes('山之子') && MountainTerrain.includes(attackerTerrain ? attackerTerrain.name : ''))
                Correction1 -= 10;
            if (defenseAbilities.includes('死亡收割者') && debuff.includes(attackerStatus))
                Correction1 += 20;
            let baseCounterDamage = Math.max(defenseAttack - atkDefense - attackerTerrainDefense + Correction1, 0);
            let midCounterDamage = Math.floor(baseCounterDamage * (defenseAbilities.includes('战意') ? defenseMaxhp : counterHealth) / defenseMaxhp);
            counterDamage = Math.min(Math.floor(xishu1 * midCounterDamage), attackerHealth);
        }
        targets.push({
            row: nx,
            col: ny,
            attackDamage,
            counterDamage,
            didCounter,
            attackMode
        });
    }
    return targets;
}
function highlightAttackTargets() {
    clearAttackHighlight();
    appData.attackTargets = [];
    if (!appData.selectedCell)
        return;
    const attackerRow = appData.selectedCell.row;
    const attackerCol = appData.selectedCell.col;
    const attackerCell = appData.gridData[attackerRow][attackerCol];
    if (!attackerCell || attackerCell.unitStandby) {
        appData.attackMode = false;
        alert('该单位已待机，无法攻击');
        return;
    }
    appData.attackTargets = calculateAttackTargets(attackerRow, attackerCol);
    appData.attackTargets.forEach(target => {
        const cell = document.querySelector('.grid-cell[data-row="' + target.row + '"][data-col="' + target.col + '"]');
        if (cell) {
            cell.classList.add('attack-target-highlight');
        }
    });
    if (appData.attackTargets.length === 0) {
        alert('当前无可攻击目标');
    }
}
function calculateHealTargets(healerRow, healerCol) {
    const healerCell = appData.gridData[healerRow][healerCol];
    if (!healerCell || !healerCell.unit)
        return [];
    const healerUnitDef = appData.units.find(u => u.id === healerCell.unit);
    const healerTeam = appData.teams.find(t => t.id === healerCell.unitTeam);
    if (!healerUnitDef || !healerTeam)
        return [];
    if (!healerUnitDef.abilities || !healerUnitDef.abilities.includes('治疗'))
        return [];
    if (healerCell.unitStandby)
        return [];
    const healerAlliance = healerTeam.alliance;
    const healerLevel = healerCell.unitLevel || 0;
    const healAmount = 40 + 10 * healerLevel;
    const maxRange = healerCell.unitStatus === '致盲' ? 0 : 1;
    const directions = getRangeRelativeCoordinates(0, maxRange, true);
    const targets = [];
    for (const [dx, dy] of directions) {
        const nx = healerRow + dx;
        const ny = healerCol + dy;
        if (nx < 0 || nx >= appData.rows || ny < 0 || ny >= appData.cols)
            continue;
        const targetCell = appData.gridData[nx][ny];
        if (!targetCell || !targetCell.unit || targetCell.unitHealth <= 0 || targetCell.unitStatus === '死亡')
            continue;
        const targetUnitDef = appData.units.find(u => u.id === targetCell.unit);
        const targetTeam = appData.teams.find(t => t.id === targetCell.unitTeam);
        if (!targetUnitDef || !targetTeam)
            continue;
        const targetAbilities = targetUnitDef.abilities || [];
        const isUndead = targetAbilities.includes('亡灵');
        const isAlly = targetTeam.alliance === healerAlliance;
        if (isAlly && !isUndead && targetCell.unitStatus === '中毒')
            continue;
        if (isUndead) {
            targets.push({
                row: nx,
                col: ny,
                amount: Math.ceil(healAmount * 1.5),
                isDamage: true
            });
            continue;
        }
        if (isAlly) {
            const targetMaxHealth = 100 + targetUnitDef.hpUp * (targetCell.unitLevel || 0);
            if (targetCell.unitHealth <= targetMaxHealth) {
                targets.push({
                    row: nx,
                    col: ny,
                    amount: healAmount,
                    isDamage: false
                });
            }
        }
    }
    return targets;
}
function highlightHealTargets() {
    clearHealHighlight();
    appData.healTargets = [];
    if (!appData.selectedCell)
        return;
    const healerRow = appData.selectedCell.row;
    const healerCol = appData.selectedCell.col;
    appData.healTargets = calculateHealTargets(healerRow, healerCol);
    appData.healTargets.forEach(target => {
        const cell = document.querySelector('.grid-cell[data-row="' + target.row + '"][data-col="' + target.col + '"]');
        if (cell) {
            cell.classList.add('heal-target-highlight');
        }
    });
    if (appData.healTargets.length === 0) {
        alert('当前无可治疗目标');
    }
}
function clearHealHighlight() {
    document.querySelectorAll('.heal-target-highlight').forEach(cell => {
        cell.classList.remove('heal-target-highlight');
    });
}
function calculateSupportTargets(supporterRow, supporterCol) {
    const supporterCell = appData.gridData[supporterRow][supporterCol];
    if (!supporterCell || !supporterCell.unit || supporterCell.unitStandby)
        return [];
    const supporterUnitDef = appData.units.find(u => u.id === supporterCell.unit);
    if (!supporterUnitDef || !supporterUnitDef.abilities || !supporterUnitDef.abilities.includes('支援'))
        return [];
    if ((supporterCell.unitStatus || '无') === '致盲')
        return [];
    const supporterLevel = supporterCell.unitLevel || 0;
    const directions = getRangeRelativeCoordinates(0, 2, true);
    const targets = [];
    for (const [dx, dy] of directions) {
        const nx = supporterRow + dx;
        const ny = supporterCol + dy;
        if (nx < 0 || nx >= appData.rows || ny < 0 || ny >= appData.cols)
            continue;
        if (nx === supporterRow && ny === supporterCol)
            continue;
        const targetCell = appData.gridData[nx][ny];
        if (!targetCell || !targetCell.unit || targetCell.unitHealth <= 0 || targetCell.unitStatus === '死亡')
            continue;
        if (targetCell.unitTeam !== supporterCell.unitTeam)
            continue;
        if (targetCell.unitStandby !== true)
            continue;
        if (targetCell.unitSupported === true)
            continue;
        if ((targetCell.unitLevel || 0) > supporterLevel)
            continue;
        const targetUnitDef = appData.units.find(u => u.id === targetCell.unit);
        if (!targetUnitDef)
            continue;
        const targetAbilities = targetUnitDef.abilities || [];
        if (targetAbilities.includes('支援'))
            continue;
        if (targetAbilities.includes('城主'))
            continue;
        if (targetAbilities.includes('突击部队'))
            continue;
        targets.push({ row: nx, col: ny });
    }
    return targets;
}
function highlightSupportTargets() {
    clearSupportHighlight();
    appData.supportTargets = [];
    if (!appData.selectedCell)
        return;
    const supporterRow = appData.selectedCell.row;
    const supporterCol = appData.selectedCell.col;
    appData.supportTargets = calculateSupportTargets(supporterRow, supporterCol);
    appData.supportTargets.forEach(target => {
        const cell = document.querySelector('.grid-cell[data-row="' + target.row + '"][data-col="' + target.col + '"]');
        if (cell) {
            cell.classList.add('support-target-highlight');
        }
    });
    if (appData.supportTargets.length === 0) {
        alert('当前无可支援目标');
    }
}
function clearSupportHighlight() {
    document.querySelectorAll('.support-target-highlight').forEach(cell => cell.classList.remove('support-target-highlight'));
}
function calculateSummonTargets(summonerRow, summonerCol) {
    const summonerCell = appData.gridData[summonerRow][summonerCol];
    if (!summonerCell || !summonerCell.unit || summonerCell.unitStandby)
        return [];
    const summonerUnitDef = appData.units.find(u => u.id === summonerCell.unit);
    if (!summonerUnitDef || !summonerUnitDef.abilities || !summonerUnitDef.abilities.includes('召唤'))
        return [];
    if ((summonerCell.unitStatus || '无') === '致盲')
        return [];
    const directions = getRangeRelativeCoordinates(summonerUnitDef.minRange || 1, summonerUnitDef.maxRange || 1, false);
    const targets = [];
    for (const [dx, dy] of directions) {
        const nx = summonerRow + dx;
        const ny = summonerCol + dy;
        if (nx < 0 || nx >= appData.rows || ny < 0 || ny >= appData.cols)
            continue;
        const targetCell = appData.gridData[nx][ny];
        if (targetCell && targetCell.tombstone && !targetCell.unit)
            targets.push({ row: nx, col: ny });
    }
    return targets;
}
function highlightSummonTargets() {
    clearSummonHighlight();
    if (!appData.selectedCell)
        return;
    const { row, col } = appData.selectedCell;
    appData.summonTargets = calculateSummonTargets(row, col);
    if (appData.summonTargets.length === 0) {
        alert('当前攻击范围内无可召唤墓碑');
        appData.summonMode = false;
        return;
    }
    appData.summonTargets.forEach(target => {
        const cell = document.querySelector('.grid-cell[data-row="' + target.row + '"][data-col="' + target.col + '"]');
        if (cell)
            cell.classList.add('summon-target-highlight');
    });
}
function clearSummonHighlight() {
    document.querySelectorAll('.summon-target-highlight').forEach(cell => cell.classList.remove('summon-target-highlight'));
}
function executeSummon(targetRow, targetCol, targetInfo) {
    if (!appData.selectedCell)
        return;
    const summonerRow = appData.selectedCell.row;
    const summonerCol = appData.selectedCell.col;
    const summonerCell = appData.gridData[summonerRow][summonerCol];
    const targetCell = appData.gridData[targetRow][targetCol];
    if (!summonerCell || !summonerCell.unit || !targetCell || !targetCell.tombstone || targetCell.unit)
        return;
    const summonerUnitDef = appData.units.find(u => u.id === summonerCell.unit);
    if (!summonerUnitDef || !summonerUnitDef.abilities || !summonerUnitDef.abilities.includes('召唤'))
        return;
    if ((summonerCell.unitStatus || '无') === '致盲')
        return;
    queueMoveModeAction('SUMMON', summonerRow, summonerCol, targetRow, targetCol);
    targetCell.tombstone = null;
    targetCell.unit = 'skeleton';
    targetCell.unitTeam = summonerCell.unitTeam;
    targetCell.unitLevel = summonerCell.unitLevel || 0;
    targetCell.unitHealth = 100;
    targetCell.unitExp = 0;
    clearUnitStatus(targetCell);
    targetCell.unitStandby = false;
    targetCell.unitTraceId = createDemoUnitTraceId(summonerCell.unitTeam, 'skeleton', targetRow, targetCol);
    queueUnitExp(summonerRow, summonerCol, 10);
    const standbyHealthPopups = processUnitStandbyEffects(summonerRow, summonerCol);
    appData.summonMode = false;
    appData.summonTargets = [];
    clearSummonHighlight();
    appData.selectedCell = null;
    finishCurrentMoveAction();
    renderGrid();
    showStandbyHealthPopups(standbyHealthPopups);
    elements.moveModeActions.classList.add('hidden');
}
function clearAttackHighlight() {
    document.querySelectorAll('.attack-target-highlight').forEach(cell => {
        cell.classList.remove('attack-target-highlight');
    });
}
function showDamagePopup(row, col, damage, isHeal) {
    const cell = document.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
    if (!cell)
        return;
    const popup = document.createElement('div');
    popup.className = 'damage-popup' + (isHeal ? ' heal-popup' : '');
    popup.textContent = (isHeal ? '+' : '-') + damage;
    cell.appendChild(popup);
    setTimeout(() => {
        if (popup.parentNode)
            popup.parentNode.removeChild(popup);
    }, 1300);
}
function showHealActionPopup(row, col, text) {
    const cell = document.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
    if (!cell)
        return;
    const popup = document.createElement('div');
    popup.className = 'damage-popup heal-action-popup';
    popup.textContent = text;
    cell.appendChild(popup);
    setTimeout(() => {
        if (popup.parentNode)
            popup.parentNode.removeChild(popup);
    }, 1300);
}
function getUnitMaxHealthForExp(cell) {
    if (!cell || !cell.unit)
        return 100;
    const unitDef = appData.units.find(u => u.id === cell.unit);
    return unitDef ? 100 + (unitDef.hpUp || 0) * (cell.unitLevel || 0) : 100;
}
function queueUnitExp(row, col, amount) {
    if (!amount || amount <= 0)
        return;
    if (!appData.pendingExpEvents)
        appData.pendingExpEvents = [];
    const cell = appData.gridData[row]?.[col];
    if (!cell || !cell.unit)
        return;
    appData.pendingExpEvents.push({
        row,
        col,
        unit: cell.unit,
        unitTeam: cell.unitTeam,
        amount
    });
}
function applyUnitExpAndLevel(cell, amount, preserveOverMaxHealth = false) {
    if (!cell || !cell.unit || !amount || amount <= 0)
        return;
    const oldMaxHealth = getUnitMaxHealthForExp(cell);
    const oldHealth = cell.unitHealth || 0;
    const missingHealth = Math.max(0, oldMaxHealth - oldHealth);
    const overMaxHealth = preserveOverMaxHealth ? Math.max(0, oldHealth - oldMaxHealth) : 0;
    cell.unitExp = (cell.unitExp || 0) + amount;
    while (cell.unitExp >= ((cell.unitLevel || 0) + 1) * 100) {
        const required = ((cell.unitLevel || 0) + 1) * 100;
        cell.unitExp -= required;
        cell.unitLevel = (cell.unitLevel || 0) + 1;
    }
    const newMaxHealth = getUnitMaxHealthForExp(cell);
    cell.unitHealth = Math.max(0, newMaxHealth - missingHealth + overMaxHealth);
}
function processPendingExpEvents(preserveOverMaxHealth = false, preserveTarget = null) {
    const events = appData.pendingExpEvents || [];
    appData.pendingExpEvents = [];
    for (const event of events) {
        const cell = appData.gridData[event.row]?.[event.col];
        if (!cell || !cell.unit)
            continue;
        if (cell.unit !== event.unit || cell.unitTeam !== event.unitTeam)
            continue;
        const isPreserveTarget = preserveTarget
            && event.row === preserveTarget.row
            && event.col === preserveTarget.col;
        applyUnitExpAndLevel(cell, event.amount, isPreserveTarget ? preserveOverMaxHealth : true);
    }
}
function processUnitStandbyEffects(row, col) {
    const cellData = appData.gridData[row]?.[col];
    if (!cellData || !cellData.unit)
        return [];
    const wasStandby = cellData.unitStandby === true;
    cellData.unitStandby = true;
    const unit = appData.units.find(u => u.id === cellData.unit);
    if (unit && unit.abilities && unit.abilities.includes('鼓舞')) {
        const unitAlliance = appData.teams.find(t => t.id === cellData.unitTeam)?.alliance;
        const inspireArea = getRangeRelativeCoordinates(0, 2, true);
        for (const [dx, dy] of inspireArea) {
            const nx = row + dx;
            const ny = col + dy;
            if (nx >= 0 && nx < appData.rows && ny >= 0 && ny < appData.cols) {
                const nearCell = appData.gridData[nx][ny];
                if (nearCell.unit) {
                    const nearTeam = appData.teams.find(t => t.id === nearCell.unitTeam);
                    if (nearTeam && nearTeam.alliance === unitAlliance) {
                        applyUnitStatus(nearCell, '鼓舞');
                    }
                }
            }
        }
    }
    if (unit && unit.abilities && unit.abilities.includes('虚弱')) {
        const unitAlliance = appData.teams.find(t => t.id === cellData.unitTeam)?.alliance;
        const weakArea = getRangeRelativeCoordinates(0, 2, true);
        for (const [dx, dy] of weakArea) {
            const nx = row + dx;
            const ny = col + dy;
            if (nx >= 0 && nx < appData.rows && ny >= 0 && ny < appData.cols) {
                const nearCell = appData.gridData[nx][ny];
                if (nearCell.unit) {
                    const nearTeam = appData.teams.find(t => t.id === nearCell.unitTeam);
                    const nearUnit = appData.units.find(u => u.id === nearCell.unit);
                    const nearAbilities = nearUnit && nearUnit.abilities ? nearUnit.abilities : [];
                    if (nearTeam && nearTeam.alliance !== unitAlliance && !nearAbilities.includes('虚弱')) {
                        applyUnitStatus(nearCell, '虚弱');
                    }
                }
            }
        }
    }
    const healthChanges = new Map();
    const purifyUndeadDamageTargets = new Set();
    const healthChangeKey = (r, c) => r + ',' + c;
    const ensureHealthChange = (r, c) => {
        const key = healthChangeKey(r, c);
        const current = healthChanges.get(key) || { row: r, col: c, delta: 0 };
        healthChanges.set(key, current);
        return current;
    };
    const addHealthChange = (r, c, amount) => {
        if (!amount)
            return;
        const current = ensureHealthChange(r, c);
        current.delta += amount;
    };
    const getMaxHealthForCell = (targetCell) => {
        if (!targetCell || !targetCell.unit)
            return null;
        const targetUnit = appData.units.find(u => u.id === targetCell.unit);
        if (!targetUnit)
            return null;
        return 100 + targetUnit.hpUp * (targetCell.unitLevel || 0);
    };
    const getPendingHealthDelta = (r, c) => {
        const change = healthChanges.get(healthChangeKey(r, c));
        return change ? change.delta : 0;
    };
    const standbyTombstone = cellData.tombstone;
    if (standbyTombstone && cellData.unit) {
        const tombstoneUnit = appData.units.find(u => u.id === cellData.unit);
        const tombstoneAbilities = tombstoneUnit && tombstoneUnit.abilities ? tombstoneUnit.abilities : [];
        cellData.tombstone = null;
        cellData.pendingTombstone = null;
        if (tombstoneAbilities.includes('亡灵')) {
            addHealthChange(row, col, 10);
        }
        else if (!tombstoneAbilities.includes('召唤')) {
            addHealthChange(row, col, -10);
        }
    }
    if (unit && unit.abilities && unit.abilities.includes('净化光环')) {
        const unitAlliance2 = appData.teams.find(t => t.id === cellData.unitTeam)?.alliance ?? -1;
        const purifyArea = getRangeRelativeCoordinates(0, 2, true);
        const healAmt = 10 + 5 * cellData.unitLevel;
        for (const [pdx, pdy] of purifyArea) {
            const pnx = row + pdx;
            const pny = col + pdy;
            if (pnx >= 0 && pnx < appData.rows && pny >= 0 && pny < appData.cols) {
                const pCell = appData.gridData[pnx][pny];
                if (pCell && pCell.unit) {
                    const pTeam = appData.teams.find(t => t.id === pCell.unitTeam);
                    const pFullUnit = appData.units.find(u => u.id === pCell.unit);
                    if (!pFullUnit)
                        continue;
                    if (pCell.unitStatus === '死亡')
                        continue;
                    if (pTeam && pTeam.alliance === unitAlliance2) {
                        const negSt = ['中毒', '致盲', '虚弱'];
                        if (negSt.includes(pCell.unitStatus)) {
                            clearUnitStatus(pCell);
                        }
                        if (pFullUnit.abilities && pFullUnit.abilities.includes('亡灵')) {
                            purifyUndeadDamageTargets.add(healthChangeKey(pnx, pny));
                            addHealthChange(pnx, pny, -healAmt);
                        }
                        else {
                            const pMaxHealth = getMaxHealthForCell(pCell);
                            const projectedHealth = Math.max(0, (pCell.unitHealth || 0) + getPendingHealthDelta(pnx, pny));
                            if (pMaxHealth !== null && projectedHealth < pMaxHealth) {
                                addHealthChange(pnx, pny, Math.min(healAmt, pMaxHealth - projectedHealth));
                            }
                        }
                    }
                    else if (pTeam && pTeam.alliance !== unitAlliance2) {
                        if (pFullUnit.abilities && pFullUnit.abilities.includes('亡灵')) {
                            purifyUndeadDamageTargets.add(healthChangeKey(pnx, pny));
                            addHealthChange(pnx, pny, -healAmt);
                        }
                    }
                }
            }
        }
    }
    ensureHealthChange(row, col);
    for (const change of Array.from(healthChanges.values())) {
        if (change.row !== row || change.col !== col)
            continue;
        const targetCell = appData.gridData[change.row][change.col];
        if (!targetCell || !targetCell.unit || targetCell.unitStatus === '死亡')
            continue;
        const maxHealth = getMaxHealthForCell(targetCell);
        if (maxHealth === null)
            continue;
        const oldHealth = targetCell.unitHealth || 0;
        const projectedHealth = Math.max(0, oldHealth + change.delta);
        if (projectedHealth > maxHealth) {
            addHealthChange(change.row, change.col, maxHealth - projectedHealth);
        }
    }
    const healthPopups = [];
    for (const change of healthChanges.values()) {
        const targetCell = appData.gridData[change.row][change.col];
        if (!targetCell || !targetCell.unit || targetCell.unitStatus === '死亡')
            continue;
        const oldHealth = targetCell.unitHealth || 0;
        targetCell.unitHealth = Math.max(0, oldHealth + change.delta);
        const actualDelta = targetCell.unitHealth - oldHealth;
        if (actualDelta !== 0) {
            healthPopups.push({ row: change.row, col: change.col, delta: actualDelta });
        }
    }
    if (!wasStandby) {
        processPendingExpEvents(false, { row, col });
    }
    const deathTeam = cellData.unitTeam;
    let purifyUndeadKillCount = 0;
    for (const change of healthChanges.values()) {
        const targetCell = appData.gridData[change.row][change.col];
        if (targetCell && targetCell.unit && targetCell.unitHealth <= 0) {
            if (purifyUndeadDamageTargets.has(healthChangeKey(change.row, change.col))) {
                purifyUndeadKillCount++;
            }
            removeUnitAndMaybeCreateTombstone(change.row, change.col, deathTeam);
        }
    }
    if (purifyUndeadKillCount > 0 && cellData.unit) {
        applyUnitExpAndLevel(cellData, 60 * purifyUndeadKillCount);
    }
    return healthPopups;
}
function showStandbyHealthPopups(healthPopups) {
    for (const popup of healthPopups || []) {
        if (popup.delta > 0) {
            showDamagePopup(popup.row, popup.col, Math.abs(popup.delta), true);
        }
        else {
            showDamagePopup(popup.row, popup.col, Math.abs(popup.delta), false);
        }
    }
}
function clampOverMaxHealthOnStandby(cell) {
    if (!cell || !cell.unit || cell.unitHealth <= 0)
        return 0;
    const unitDef = appData.units.find(u => u.id === cell.unit);
    if (!unitDef)
        return 0;
    const maxHealth = 100 + unitDef.hpUp * (cell.unitLevel || 0);
    if (cell.unitHealth <= maxHealth)
        return 0;
    const overflow = cell.unitHealth - maxHealth;
    cell.unitHealth = maxHealth;
    return overflow;
}
function executeSupport(targetRow, targetCol, targetInfo) {
    if (!appData.selectedCell)
        return;
    const supporterRow = appData.selectedCell.row;
    const supporterCol = appData.selectedCell.col;
    const supporterCell = appData.gridData[supporterRow][supporterCol];
    const targetCell = appData.gridData[targetRow][targetCol];
    if (!supporterCell || !supporterCell.unit || !targetCell || !targetCell.unit)
        return;
    queueMoveModeAction('SUPPORT', supporterRow, supporterCol, targetRow, targetCol);
    targetCell.unitStandby = false;
    targetCell.unitSupported = true;
    queueUnitExp(supporterRow, supporterCol, 10);
    const standbyHealthPopups = processUnitStandbyEffects(supporterRow, supporterCol);
    appData.supportMode = false;
    appData.supportTargets = [];
    clearSupportHighlight();
    appData.healMode = false;
    appData.healTargets = [];
    clearHealHighlight();
    appData.attackMode = false;
    appData.attackTargets = [];
    clearAttackHighlight();
    appData.selectedCell = null;
    finishCurrentMoveAction();
    renderGrid();
    showStandbyHealthPopups(standbyHealthPopups);
    elements.moveModeActions.classList.add('hidden');
}
function executeHeal(targetRow, targetCol, targetInfo) {
    if (!appData.selectedCell)
        return;
    const healerRow = appData.selectedCell.row;
    const healerCol = appData.selectedCell.col;
    const healerCell = appData.gridData[healerRow][healerCol];
    const targetCell = appData.gridData[targetRow][targetCol];
    if (!healerCell || !healerCell.unit || !targetCell || !targetCell.unit)
        return;
    queueMoveModeAction('HEAL', healerRow, healerCol, targetRow, targetCol);
    const healerLevel = healerCell.unitLevel || 0;
    const healAmount = 40 + 10 * healerLevel;
    let popupText = '+' + healAmount;
    let healerExp = 30;
    if (targetInfo && targetInfo.isDamage) {
        const damageAmount = Math.ceil(healAmount * 1.5);
        const oldHealth = targetCell.unitHealth || 0;
        targetCell.unitHealth = Math.max(0, oldHealth - damageAmount);
        popupText = '-' + (oldHealth - targetCell.unitHealth);
        if (targetCell.unitHealth <= 0) {
            removeUnitAndMaybeCreateTombstone(targetRow, targetCol, healerCell.unitTeam);
            healerExp = 60;
        }
    }
    else {
        targetCell.unitHealth = (targetCell.unitHealth || 0) + healAmount;
    }
    let standbyHealthPopups = [];
    if (healerCell.unit) {
        queueUnitExp(healerRow, healerCol, healerExp);
        standbyHealthPopups = processUnitStandbyEffects(healerRow, healerCol);
    }
    appData.healMode = false;
    appData.healTargets = [];
    clearHealHighlight();
    appData.attackMode = false;
    appData.attackTargets = [];
    clearAttackHighlight();
    appData.selectedCell = null;
    finishCurrentMoveAction();
    renderGrid();
    showHealActionPopup(targetRow, targetCol, popupText);
    showStandbyHealthPopups(standbyHealthPopups);
    elements.moveModeActions.classList.add('hidden');
}
function calculateCounterDamageAfterAttack(attackerRow, attackerCol, targetRow, targetCol, attackDamage, attackMode, originalDefenseHealth) {
    const attackerCell = appData.gridData[attackerRow]?.[attackerCol];
    const defenseCell = appData.gridData[targetRow]?.[targetCol];
    if (!attackerCell || !attackerCell.unit || !defenseCell || !defenseCell.unit) {
        return { counterDamage: 0, didCounter: false };
    }
    const attackerUnitDef = appData.units.find(u => u.id === attackerCell.unit);
    const defenseUnitDef = appData.units.find(u => u.id === defenseCell.unit);
    if (!attackerUnitDef || !defenseUnitDef)
        return { counterDamage: 0, didCounter: false };
    const attackerLevel = attackerCell.unitLevel || 0;
    const attackerStatus = attackerCell.unitStatus || '无';
    const attackerAbilities = attackerUnitDef.abilities || [];
    const attackerHealth = attackerCell.unitHealth || 0;
    const defenseLevel = defenseCell.unitLevel || 0;
    const defenseStatus = defenseCell.unitStatus || '无';
    const defenseAbilities = defenseUnitDef.abilities || [];
    const defenseMinRange = defenseUnitDef.minRange || 1;
    const defenseAttack = defenseUnitDef.attack + defenseUnitDef.atkUp * defenseLevel;
    const defenseMaxhp = 100 + defenseUnitDef.hpUp * defenseLevel;
    const defenseHealth = Math.max(0, originalDefenseHealth || 0);
    const counterHealth = Math.max(defenseHealth - attackDamage, 0);
    const attackDistance = Math.abs(attackerRow - targetRow) + Math.abs(attackerCol - targetCol);
    const counterDefenseStatus = getCounterDefenseStatus(defenseStatus, defenseAbilities, attackerAbilities);
    const canCounter = canCounterAttackAtDistance(attackDistance, defenseMinRange, defenseAbilities, defenseStatus, attackerAbilities);
    const didCounter = canCounter && counterHealth > 0;
    if (!didCounter)
        return { counterDamage: 0, didCounter };
    const attackerTerrain = attackerCell.terrain ? appData.terrains.find(t => t.id === attackerCell.terrain) : null;
    let attackerTerrainDefense = attackerTerrain ? attackerTerrain.defense : 5;
    if (attackerAbilities.includes('空军'))
        attackerTerrainDefense = 0;
    const defenseTerrain = defenseCell.terrain ? appData.terrains.find(t => t.id === defenseCell.terrain) : null;
    const atkDefense = (defenseUnitDef.type === '物理')
        ? attackerUnitDef.physDef + 5 * attackerLevel
        : attackerUnitDef.magicDef + 5 * attackerLevel;
    let Correction1 = 0;
    let xishu1 = 1;
    if (defenseAbilities.includes('战意'))
        xishu1 = 1;
    if (attackMode === '远程' || counterDefenseStatus === '致盲') {
        if (!defenseAbilities.includes('反击风暴') || attackDistance > 2) {
            return { counterDamage: 0, didCounter };
        }
        else if (counterDefenseStatus === '致盲') {
            if (defenseStatus === '鼓舞')
                Correction1 += 5;
            if (attackerStatus === '虚弱')
                Correction1 += 5;
            if (attackerAbilities.includes('远程减半'))
                xishu1 /= 2;
        }
    }
    if (attackMode === '近战' && defenseMinRange <= 1) {
        if (defenseStatus === '鼓舞')
            Correction1 += 10;
        if (attackerStatus === '虚弱')
            Correction1 += 10;
        if (!attackerAbilities.includes('近战大师') && defenseAbilities.includes('近战大师'))
            xishu1 *= 1.5;
    }
    if (defenseAbilities.includes('空军') && !attackerAbilities.includes('空军') && attackerTerrain && WaterTerrain.includes(attackerTerrain.name))
        Correction1 += 10;
    if (defenseAbilities.includes('神射手') && attackerAbilities.includes('空军'))
        Correction1 += 10;
    if (defenseAbilities.includes('森林之子') && defenseTerrain && defenseTerrain.name === '树林')
        Correction1 += 10;
    if (defenseAbilities.includes('水之子') && WaterTerrain.includes(defenseTerrain ? defenseTerrain.name : ''))
        Correction1 += 10;
    if (defenseAbilities.includes('山之子') && MountainTerrain.includes(defenseTerrain ? defenseTerrain.name : ''))
        Correction1 += 10;
    if (attackerAbilities.includes('森林之子') && attackerTerrain && attackerTerrain.name === '树林')
        Correction1 -= 10;
    if (attackerAbilities.includes('水之子') && WaterTerrain.includes(attackerTerrain ? attackerTerrain.name : ''))
        Correction1 -= 10;
    if (attackerAbilities.includes('山之子') && MountainTerrain.includes(attackerTerrain ? attackerTerrain.name : ''))
        Correction1 -= 10;
    if (defenseAbilities.includes('死亡收割者') && debuff.includes(attackerStatus))
        Correction1 += 20;
    const baseCounterDamage = Math.max(defenseAttack - atkDefense - attackerTerrainDefense + Correction1, 0);
    const midCounterDamage = Math.floor(baseCounterDamage * (defenseAbilities.includes('战意') ? defenseMaxhp : counterHealth) / defenseMaxhp);
    return {
        counterDamage: Math.min(Math.floor(xishu1 * midCounterDamage), attackerHealth),
        didCounter
    };
}
function executeAttack(targetRow, targetCol, targetInfo) {
    const { attackDamage, attackMode } = targetInfo;
    const attackerRow = appData.selectedCell.row;
    const attackerCol = appData.selectedCell.col;
    const attackerCell = appData.gridData[attackerRow][attackerCol];
    const defenseCell = appData.gridData[targetRow][targetCol];
    if (!attackerCell || attackerCell.unitStandby) {
        appData.attackMode = false;
        appData.attackTargets = [];
        clearAttackHighlight();
        if (elements.moveModeActions)
            elements.moveModeActions.classList.add('hidden');
        return;
    }
    if (targetInfo && targetInfo.targetType === 'terrainHouse') {
        if (!defenseCell || defenseCell.unit || defenseCell.terrain !== 'house')
            return;
        queueMoveModeAction('ATTACK', attackerRow, attackerCol, targetRow, targetCol);
        defenseCell.terrain = 'rundown';
        defenseCell.terrainTeam = null;
        if (attackerCell.unit)
            applyUnitExpAndLevel(attackerCell, 30, true);
        const standbyHealthPopups = processUnitStandbyEffects(attackerRow, attackerCol);
        appData.attackMode = false;
        appData.attackTargets = [];
        clearAttackHighlight();
        finishCurrentMoveAction();
        renderGrid();
        showStandbyHealthPopups(standbyHealthPopups);
        elements.moveModeActions.classList.add('hidden');
        appData.selectedCell = null;
        return;
    }
    const attackerUnitDef = appData.units.find(u => u.id === attackerCell.unit);
    const defenseUnitDef = appData.units.find(u => u.id === defenseCell.unit);
    if (!attackerUnitDef || !defenseUnitDef)
        return;
    queueMoveModeAction('ATTACK', attackerRow, attackerCol, targetRow, targetCol);
    const attackerAbilities = attackerUnitDef.abilities || [];
    const defenseAbilities = defenseUnitDef.abilities || [];
    const attackerStatus = attackerCell.unitStatus || '无';
    const defenseStatus = defenseCell.unitStatus || '无';
    const attackerTeam = appData.teams.find(t => t.id === attackerCell.unitTeam);
    let assaultContext = null;
    if (attackerTeam && isAiPlayerType(attackerTeam.playerType) && attackerAbilities.includes('突击部队')) {
        const currentAction = appData.currentMoveAction;
        const origin = currentAction && currentAction.assaultOrigin
            ? currentAction.assaultOrigin
            : currentAction && currentAction.from
                ? currentAction.from
                : { row: attackerRow, col: attackerCol };
        let potentialTarget = currentAction && currentAction.assaultPotentialTarget
            ? { ...currentAction.assaultPotentialTarget }
            : null;
        if (!potentialTarget) {
            const potentialTargets = calculatePotentialMoveTargets(attackerRow, attackerCol, { origin });
            potentialTarget = choosePotentialAttackTarget(potentialTargets);
        }
        assaultContext = {
            origin: { row: origin.row, col: origin.col },
            potentialTarget: potentialTarget ? { ...potentialTarget } : null,
            unitSnapshot: currentAction && currentAction.assaultUnitSnapshot
                ? JSON.parse(JSON.stringify(currentAction.assaultUnitSnapshot))
                : currentAction && currentAction.fromSnapshot
                    ? JSON.parse(JSON.stringify(currentAction.fromSnapshot))
                    : snapshotCellForMove(attackerRow, attackerCol),
            enemyPositions: currentAction && Array.isArray(currentAction.assaultEnemyPositions)
                ? currentAction.assaultEnemyPositions.map(pos => ({ row: pos.row, col: pos.col }))
                : collectEnemyUnitPositions(attackerCell.unitTeam),
            allyPositions: currentAction && Array.isArray(currentAction.assaultAllyPositions)
                ? currentAction.assaultAllyPositions.map(pos => ({ row: pos.row, col: pos.col }))
                : collectAllyUnitPositions(attackerCell.unitTeam, {
                    replacePosition: { row: attackerRow, col: attackerCol },
                    withPosition: { row: origin.row, col: origin.col }
                }),
            killedPosition: null
        };
    }
    const originalDefenseHealth = defenseCell.unitHealth || 0;
    const newDefenderHealth = Math.max(defenseCell.unitHealth - attackDamage, 0);
    defenseCell.unitHealth = newDefenderHealth;
    if (assaultContext && newDefenderHealth <= 0) {
        assaultContext.killedPosition = {
            row: targetRow,
            col: targetCol,
            unit: defenseCell.unit,
            unitTeam: defenseCell.unitTeam,
            isAir: defenseAbilities.includes('空军')
        };
    }
    showDamagePopup(targetRow, targetCol, attackDamage, false);
    if (attackerCell.unit) {
        applyUnitExpAndLevel(attackerCell, newDefenderHealth <= 0 ? 60 : 30, true);
    }
    if (attackerAbilities.includes('中毒') && !defenseAbilities.includes('中毒')) {
        applyUnitStatus(defenseCell, '中毒');
    }
    if (willInflictBlind(attackerAbilities, defenseAbilities, defenseStatus)) {
        applyUnitStatus(defenseCell, '致盲');
    }
    const counterResult = calculateCounterDamageAfterAttack(attackerRow, attackerCol, targetRow, targetCol, attackDamage, attackMode, originalDefenseHealth);
    const counterDamage = counterResult.counterDamage;
    const didCounter = counterResult.didCounter;
    if (counterDamage > 0) {
        const newAttackerHealth = Math.max(attackerCell.unitHealth - counterDamage, 0);
        attackerCell.unitHealth = newAttackerHealth;
        showDamagePopup(attackerRow, attackerCol, counterDamage, false);
    }
    const attackerDiedFromCounter = didCounter && counterDamage > 0 && attackerCell.unitHealth <= 0;
    if (didCounter) {
        if (willInflictBlind(defenseAbilities, attackerAbilities, attackerStatus)) {
            applyUnitStatus(attackerCell, '致盲');
        }
        if (defenseAbilities.includes('中毒') && !attackerAbilities.includes('中毒')) {
            applyUnitStatus(attackerCell, '中毒');
        }
    }
    if (newDefenderHealth <= 0) {
        removeUnitAndMaybeCreateTombstone(targetRow, targetCol, attackerCell.unitTeam);
    }
    if (attackerCell.unitHealth <= 0) {
        removeUnitAndMaybeCreateTombstone(attackerRow, attackerCol, attackerCell.unitTeam);
    }
    if (didCounter && defenseCell.unit) {
        queueUnitExp(targetRow, targetCol, attackerDiedFromCounter ? 60 : 10);
    }
    appData.attackMode = false;
    appData.attackTargets = [];
    clearAttackHighlight();
    if (!attackerCell.unit) {
        processPendingExpEvents();
        finishCurrentMoveAction();
        renderGrid();
        elements.moveModeActions.classList.add('hidden');
        appData.selectedCell = null;
        return;
    }
    if (attackerCell.unit && attackerAbilities.includes('突击部队')) {
        const fullMovePosition = calculateMovementRange(attackerRow, attackerCol).find(pos => pos.row === attackerRow && pos.col === attackerCol);
        const remainingMove = appData.currentMoveAction && typeof appData.currentMoveAction.remainingMove === 'number'
            ? appData.currentMoveAction.remainingMove
            : (fullMovePosition ? fullMovePosition.remaining : attackerUnitDef.move);
        renderGrid();
        elements.moveModeActions.classList.add('hidden');
        prepareAssaultPostAttackMove(attackerRow, attackerCol, remainingMove, assaultContext);
        return;
    }
    let standbyHealthPopups = [];
    if (attackerCell.unit) {
        standbyHealthPopups = processUnitStandbyEffects(attackerRow, attackerCol);
    }
    finishCurrentMoveAction();
    renderGrid();
    showStandbyHealthPopups(standbyHealthPopups);
    elements.moveModeActions.classList.add('hidden');
    appData.selectedCell = null;
}
(function (scope) {
    'use strict';
    const teamIds = ['blue', 'red', 'green', 'black', 'purple', 'orange'];
    let turnKey = null;
    let pending = null;
    let pendingRecruit = null;
    function populate(snapshot) {
        const height = snapshot.map.rows;
        const width = snapshot.map.cols;
        appData.rows = height;
        appData.cols = width;
        appData.gridData = Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, col) => createEmptyCellWithTerrain(snapshot.terrain[row][col])));
        appData.teams = snapshot.teams.map((team, index) => ({
            ...appData.teams[index], ...team,
            id: team.id || teamIds[index],
            commanderPrice: normalizeCommanderRecruitPrice(team.commanderPrice),
            gold: Math.max(0, Number(team.gold) || 0)
        }));
        for (const item of snapshot.terrainOwners || []) {
            const cell = appData.gridData[item.r - 1]?.[item.c - 1];
            if (cell)
                cell.terrainTeam = item.owner || null;
        }
        for (const item of snapshot.units || []) {
            const cell = appData.gridData[item.r - 1]?.[item.c - 1];
            if (!cell)
                continue;
            cell.unit = item.type;
            cell.unitTeam = item.team;
            cell.unitLevel = Math.max(0, Number(item.level) || 0);
            cell.unitHealth = Math.max(0, Number(item.hp) || 0);
            cell.unitExp = Math.max(0, Number(item.exp) || 0);
            setUnitStatusDirect(cell, item.status || '无', item.statusTurns);
            cell.unitStandby = !!item.standby;
            cell.unitSupported = !!item.supported;
            cell.unitRegisteredCommander = item.type === 'commander'
                ? item.registeredCommander : false;
        }
        for (const item of snapshot.tombstones || []) {
            const cell = appData.gridData[item.r - 1]?.[item.c - 1];
            if (cell)
                cell.tombstone = { rounds: item.rounds, team: item.team };
        }
        normalizeGridData();
        appData.currentMoveTeam = snapshot.moveMode.currentTeam;
        appData.currentMoveAction = null;
        appData.selectedCell = null;
        appData.pendingExpEvents = [];
        appData.demoEnemyMovementBlocking = true;
        appData.moveModeConsiderEnemyBlockers = true;
        appData.fixedMockeryCoefficient = false;
        if (elements.demoRoundInput)
            elements.demoRoundInput.value = snapshot.moveMode.round || 1;
        if (elements.moveModeRoundInput)
            elements.moveModeRoundInput.value = snapshot.moveMode.round || 1;
    }
    function completePending() {
        if (!pending)
            return;
        const turn = appData.demoTeamTurn;
        const { unitAction, candidate } = pending;
        pending = null;
        const sourceCell = appData.gridData[unitAction.row]?.[unitAction.col];
        const unitActed = !(sourceCell && sourceCell.unit === unitAction.unit.id
            && sourceCell.unitTeam === turn.teamId && !sourceCell.unitStandby);
        if (!unitActed) {
            turn.actionQueue = null;
            return;
        }
        if (unitAction.hardAiBuildingAssignment) {
            const target = unitAction.hardAiBuildingAssignment.house;
            const key = `${target.row},${target.col}`;
            if (!turn.hardAiReservedBuildingTargets.includes(key)) {
                turn.hardAiReservedBuildingTargets.push(key);
            }
        }
        if (unitAction.hardAiPairNext
            && findDescribedHardAiPairCandidate([candidate], unitAction.hardAiPairFirstCandidate)) {
            const next = unitAction.hardAiPairNext;
            const required = next.requiredLanding;
            const targetCell = required ? appData.gridData[required.row]?.[required.col] : null;
            const nextCell = appData.gridData[next.row]?.[next.col];
            const secondCanAct = nextCell && nextCell.unit === next.unitId && !nextCell.unitStandby;
            const secondCanUseLanding = !required || (!!targetCell && !targetCell.unit
                && getHardAiPairCandidates(next, required)
                    .some(item => getHardAiPairOperationScore(item) > 0));
            turn.actionQueue = secondCanAct && secondCanUseLanding ? { ...next } : null;
        }
        else if (unitAction.hardAiPairPending) {
            turn.actionQueue = null;
        }
    }
    function predictAssaultSecondLanding(unitAction, candidate) {
        if (candidate.actionType !== 'attack'
            || !(unitAction.unit.abilities || []).includes('突击部队'))
            return null;
        let landing = null;
        const originalChooser = chooseAssaultMoveCandidate;
        try {
            chooseAssaultMoveCandidate = function (...args) {
                landing = originalChooser(...args);
                return landing;
            };
            withHardAiSimulatedPairAction(unitAction, candidate, () => null);
        }
        finally {
            chooseAssaultMoveCandidate = originalChooser;
        }
        return landing && (landing.row !== candidate.row || landing.col !== candidate.col)
            ? { row: landing.row, col: landing.col } : null;
    }
    function unitDecision(unitAction, candidate) {
        const second = predictAssaultSecondLanding(unitAction, candidate);
        pending = { unitAction, candidate };
        return {
            kind: 'unit', fromRow: unitAction.row, fromCol: unitAction.col,
            row: candidate.row, col: candidate.col,
            actionType: candidate.actionType,
            targetRow: candidate.target?.row ?? -1,
            targetCol: candidate.target?.col ?? -1,
            ...(second ? { secondRow: second.row, secondCol: second.col } : {}),
            score: candidate.value
        };
    }
    function choose(snapshot) {
        populate(snapshot);
        const teamId = snapshot.moveMode.currentTeam;
        const key = `${snapshot.matchKey || ''}:${snapshot.turnNumber}:${teamId}`;
        if (turnKey !== key) {
            turnKey = key;
            pending = null;
            pendingRecruit = null;
            appData.demoTeamTurn = {
                teamId, phase: 'unitActions', actionQueue: null,
                hardAiReservedBuildingTargets: [], hardAiBuildingAssignments: []
            };
        }
        else {
            if (snapshot.previousActionAccepted === false) {
                pending = null;
                pendingRecruit = null;
                appData.demoTeamTurn.actionQueue = null;
            }
            else {
                completePending();
            }
        }
        appData.demoTeamTurn.hardAiSituation = calculateHardAiSituation(teamId);
        if (pendingRecruit) {
            const plan = pendingRecruit;
            pendingRecruit = null;
            const row = plan.placement.row;
            const col = plan.placement.col;
            const cell = appData.gridData[row]?.[col];
            if (cell && cell.unit === plan.unitId && cell.unitTeam === teamId
                && !cell.unitStandby) {
                const unit = appData.units.find(item => item.id === plan.unitId);
                if (unit)
                    return unitDecision({ row, col, unit }, plan.placement.candidate);
            }
        }
        const unitAction = calculateNextTeamActionUnit(teamId);
        if (unitAction) {
            const candidate = chooseBestDemoCandidate(unitAction.row, unitAction.col, unitAction);
            if (!candidate)
                return { kind: 'error', reason: 'No legal unit candidate' };
            return unitDecision(unitAction, candidate);
        }
        const selection = chooseDemoRecruitPlan(teamId);
        if (!selection.plan)
            return { kind: 'end', reason: selection.reason };
        const plan = selection.plan;
        pendingRecruit = plan;
        return {
            kind: 'recruit', row: plan.castle.row, col: plan.castle.col,
            unitType: UNIT_ID_TO_AEM[plan.unitId], unitId: plan.unitId,
            score: plan.placement.candidate.value
        };
    }
    scope.hardAiDecide = function (snapshotJson) {
        try {
            return JSON.stringify(choose(JSON.parse(snapshotJson)));
        }
        catch (error) {
            return JSON.stringify({ kind: 'error', reason: String(error && error.stack || error) });
        }
    };
})(typeof window === 'undefined' ? globalThis : window);

return window.hardAiDecide;
}
