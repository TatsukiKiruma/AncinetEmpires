import {panel,STAGE} from './supervisor.mjs';
import fs from 'node:fs';import path from 'node:path';
if(!JSON.parse(fs.readFileSync(path.join(STAGE,'evidence/gate_g1.json'))).passed)throw Error('G1未通过');
for(const name of ['old_p1','old_theta1','r6_a','r6_b','r7','b100_q','b100_r'])await panel(path.join(STAGE,'configs',`dev_${name}.json`));
