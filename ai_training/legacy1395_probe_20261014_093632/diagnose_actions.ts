import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getLegalActions as oldLegal} from './diagnostic_rules';
import {getLegalActions as currentLegal} from '../legacy2500_recovery_20261014_090431/frozen/src/game/rules';
import {encodeAction} from '../legacy2500_recovery_20261014_090431/frozen/src/game/env';
import {readEpisode,makeEnv,clone} from '../legacy2500_recovery_20261014_090431/recovery_core';
const out=path.dirname(fileURLToPath(import.meta.url)),selection=JSON.parse(fs.readFileSync(path.join(out,'initial_probe.json'),'utf8')),replays=fs.readFileSync(path.join(out,'replay_results.jsonl'),'utf8').trim().split('\n').map(JSON.parse),rows=[];
for(const r of replays.filter((r:any)=>r.status==='STRICT_TRAJECTORY_FAIL')){const state=r.failureState,old=oldLegal(clone(state),state.currentPlayer),current=currentLegal(clone(state),state.currentPlayer),oldCodes=new Set(old.map(encodeAction)),newCodes=new Set(current.map(encodeAction));
 const e=readEpisode(selection.find((m:any)=>m.id===r.id)),expected=r.verifiedTransitions===0?e.initialLegalActionCount:e.steps[r.verifiedTransitions].legalActionCount;
 const removed=old.filter(a=>!newCodes.has(encodeAction(a))),added=current.filter(a=>!oldCodes.has(encodeAction(a)));
 rows.push({id:r.id,verifiedTransitions:r.verifiedTransitions,oldCount:old.length,currentCount:current.length,recordedCount:expected,oldRulesOnCurrentStateMatchRecordedCount:old.length===expected,removedByCurrent:removed.length,addedByCurrent:added.length,removedExamples:removed.slice(0,8),addedExamples:added.slice(0,8),affectedClasses:[...new Set([...removed,...added].map((a:any)=>state.units.find((u:any)=>u.id===a.unitId)?.unitClass??a.type))]});}
fs.writeFileSync(path.join(out,'action_differences.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify({failed:rows.length,oldCountMatches:rows.filter(r=>r.oldRulesOnCurrentStateMatchRecordedCount).length,affectedClasses:[...new Set(rows.flatMap(r=>r.affectedClasses))]}));
