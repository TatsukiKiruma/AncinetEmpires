import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {AncientEmpiresEnv as OldView} from './env';
import {readEpisode,makeEnv,sha,clone} from '../legacy2500_recovery_20261014_090431/recovery_core';
const out=path.dirname(fileURLToPath(import.meta.url)),selected=JSON.parse(fs.readFileSync(path.join(out,'initial_probe.json'),'utf8'));
const results=[];
for(const meta of selected){const e=readEpisode(meta),r=makeEnv(e,true).reset(e.seed),old=new OldView({initialState:clone(r.state),seed:e.seed,maxPlies:e.maxPlies}).getObservation();const changes:any[]=[];
 function diff(a:any,b:any,p:string){if(JSON.stringify(a)===JSON.stringify(b))return;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[k],b[k],p?p+'.'+k:k);}else changes.push({path:p,historical:a,current:b});}
 diff(old,r.observation,'');const schemaOnly=clone(r.observation);for(const t of schemaOnly.tiles)if(t.apkTerrainConfig)for(const k of ['isLand','capturable','variants','graphicsType'])delete t.apkTerrainConfig[k];for(const u of schemaOnly.units)if(u.tileApkTerrainConfig)for(const k of ['isLand','capturable','variants','graphicsType'])delete u.tileApkTerrainConfig[k];
 const pathCounts:any={};for(const c of changes){const p=c.path.replace(/\.\d+\./g,'.*.');pathCounts[p]=(pathCounts[p]??0)+1;}
 results.push({id:meta.id,oldCodecMatches:sha(old)===e.initialObservationHash,onlyRemovingNewFieldsMatches:sha(schemaOnly)===e.initialObservationHash,changedPaths:pathCounts,examples:changes.slice(0,30)});
}
fs.writeFileSync(path.join(out,'observation_differences.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({episodes:results.length,exactOldCodec:results.filter(r=>r.oldCodecMatches).length,onlyRemovingFields:results.filter(r=>r.onlyRemovingNewFieldsMatches).length}));
