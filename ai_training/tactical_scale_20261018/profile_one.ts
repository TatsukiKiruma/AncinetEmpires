import {GameEngine} from '../../src/game/engine';
import {decodeAction} from '../../src/game/env';
import {extractFeatures} from './complete_tactics';
import {read} from './io';
const p=read('probes/8.json'); for(let i=0;i<4;i++){const t=performance.now();const f=extractFeatures(new GameEngine(p.state),p.codes.map(decodeAction));console.log(performance.now()-t,f.stats);}
