import fs from 'node:fs';
import {GameEngine} from '../../src/game/engine';
const folder='deliverables/trained_vs_apk_hard_20261022/phase54-search/0-_2_Duel_aem-seat1';
const engine=new GameEngine(JSON.parse(fs.readFileSync(folder+'/initial.json','utf8')));
for(const line of fs.readFileSync(folder+'/actions.jsonl','utf8').trim().split('\n')){
 const row=JSON.parse(line);
 if(row.step===18){fs.mkdirSync('src/ai_runtime/dual_v2/fixtures',{recursive:true});fs.writeFileSync('src/ai_runtime/dual_v2/fixtures/duel-last-garrison.json',JSON.stringify(engine.getState()));break;}
 engine.step(row.action);
}
