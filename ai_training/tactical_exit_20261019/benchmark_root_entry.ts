import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { auditSearchRisks } from './audit_search_risks';
export function run(state:any,model:any,old:any){
    const engine=new GameEngine(state),ai=new ModelBattleSearchAI(model,old),start=performance.now(),action=ai.getAction(engine,state.currentPlayer);
    return {ms:performance.now()-start,code:encodeAction(action),decision:ai.lastDecision};
}
export function runProof(state:any,model:any,old:any){
    const engine=new GameEngine(state),ai=new ModelBattleSearchAI(model,old),action=ai.getAction(engine,state.currentPlayer);
    return {code:encodeAction(action),decision:ai.lastDecision,audit:auditSearchRisks(engine,ai.lastDecision)};
}
