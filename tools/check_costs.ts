import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { getUnitCost } from '../src/game/rule_config';
const s = createAppApkSkirmishGameState('(2) Liberty Port.aem', 'SD');
console.log('P0 commander cost:', getUnitCost(s, 0, 'commander'));
console.log('P0 mermaid cost:', getUnitCost(s, 0, 'mermaid'));
console.log('P0 soldier cost:', getUnitCost(s, 0, 'soldier'));
