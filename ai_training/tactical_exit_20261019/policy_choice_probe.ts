import { GameEngine } from '../../src/game/engine';
import { decodeAction } from '../../src/game/env';
import { infer } from './policy_runtime';
import { read,hash } from './io';
const model=read('teacher-model.json'),old=read('old-schema.json');
console.log(JSON.stringify(read('browser-states.json').map((item:any)=>{const r=infer(new GameEngine(item.state),item.codes.map(decodeAction),model,old);return {inputHash:hash(r.x),outputHash:hash(r.out),argmax:r.out.best,prior:r.prior,jointPrior:r.jointPrior??r.prior};})));
