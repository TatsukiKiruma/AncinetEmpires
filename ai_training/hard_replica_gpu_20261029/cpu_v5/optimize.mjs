import fs from 'node:fs';
const file='tools/apk_hard_native_transform.mjs';let s=fs.readFileSync(file,'utf8');
const replace=(a,b)=>{if(s.split(a).length!==2)throw Error('锚点不唯一：'+a);s=s.replace(a,b);};
replace('version:0,positionsVersion:-1','version:0,terrainVersion:0,positionsVersion:-1');
replace('graphs:createHardNativeCache(128*1024)','unblockedGraphs:createHardNativeCache(64*1024),graphs:createHardNativeCache(128*1024)');
replace('let changed=reset;','let changed=reset,terrainChanged=reset,movementChanged=reset;');
replace('changed=true;raw[j]=cell.terrain;',`changed=true;terrainChanged=terrainChanged||raw[j]!==cell.terrain;
        // 建筑归属和待命影响威胁／距离，但不改变移动代价与阻挡。
        movementChanged=movementChanged||raw[j]!==cell.terrain||raw[j+2]!==cell.unit||raw[j+3]!==cell.unitTeam;
        raw[j]=cell.terrain;`);
replace('if(changed){cache.version++;cache.graphs.clear();cache.distances.clear();cache.ranges.clear();cache.fields.clear();cache.fieldQueries.clear();hardNativeThreatCache=new WeakMap();}',`if(terrainChanged){cache.terrainVersion++;cache.unblockedGraphs.clear();}
    if(movementChanged){cache.graphs.clear();cache.ranges.clear();}
    if(changed){cache.version++;cache.distances.clear();cache.fields.clear();cache.fieldQueries.clear();hardNativeThreatCache=new WeakMap();}`);
s=s.replaceAll('encoded.positionsVersion!==encoded.version','encoded.positionsVersion!==encoded.terrainVersion').replaceAll('encoded.positionsVersion=encoded.version','encoded.positionsVersion=encoded.terrainVersion');
replace('let prepared=encoded.graphs.get(key);','const graphs=blocked?encoded.graphs:encoded.unblockedGraphs;\n    let prepared=graphs.get(key);');
replace('encoded.graphs.set(key,prepared,values.byteLength+64);','graphs.set(key,prepared,values.byteLength+64);');
fs.writeFileSync(file,s);
