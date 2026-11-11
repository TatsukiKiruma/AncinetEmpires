/** 已消费五图换边只作开发回归，始终对Original-APKlikeAI-Hard。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppApkSkirmishGameState } from '../../src/game/apk_skirmish_map_assets';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';
const dir=path.dirname(fileURLToPath(import.meta.url)),target=path.join(dir,'regression-plan.json');if(fs.existsSync(target))throw Error('拒绝覆盖回归计划');
const maps=['(2) Duel.aem','(2) Crossed swords.aem','(2) Mourningstar.aem','(2) Liberty Port.aem','(2) The Crossing.aem'];
const jobs=maps.flatMap((map,index)=>{const initial=createAppApkSkirmishGameState(map);return [0,1].map(seat=>({id:`regression-${index}-${seat}`,split:'regression',map,seat,seed:22199000+index,initial,openingLineage:`consumed:${ruleStateHash(initial)}`,budgetMs:4000,opponent:'Original-APKlikeAI-Hard'}));});
fs.writeFileSync(target,JSON.stringify(jobs));
