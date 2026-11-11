/** 不导入策略或网络，独立核验实际动作与全部已记录反扑见证。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
const dir=path.dirname(fileURLToPath(import.meta.url)), output=path.resolve(dir,process.argv[2]??'probe-old-new');
let actual=0,response=0; const files=[];
for(const name of fs.readdirSync(output).filter(n=>n.endsWith('.json.gz'))) {
    const data=JSON.parse(gunzipSync(fs.readFileSync(path.join(output,name))).toString());
    const verify=(w:any)=>{
        const engine=new GameEngine(w.initial,{applyInitialTurnStart:false});
        for(const action of w.actions) {
            assert.ok(engine.getLegalActions(engine.getState().currentPlayer).some(a=>encodeAction(a)===encodeAction(action)),`${name} 非法动作`);
            assert.ok(!engine.step(action).info.includes('非法动作'));
        }
        if(w.final) assert.deepEqual(engine.getState(),w.final);
        else if(w.finalHash) assert.equal(JSON.stringify(engine.getState()),w.finalHash);
        return w.actions.length;
    };
    actual+=verify(data); for(const w of data.witnesses) response+=verify(w); files.push(name);
}
const receipt={passed:true,files:files.length,actualActions:actual,responseActions:response,qualification:'strict仅证明记录轨迹规则一致，不证明反扑完整或策略最优'};
fs.writeFileSync(path.join(output,'strict.json'),JSON.stringify(receipt,null,2)); console.log(JSON.stringify(receipt));
