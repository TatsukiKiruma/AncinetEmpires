import { describe,it,expect } from 'vitest';
import { createDemoState } from '../demo_map';
import { getRuleConfig,getUnitCost,getRecruitableUnits,canRecruitUnitClass } from '../rule_config';
import { UNIT_CONFIGS } from '../constants';
import type { RuleConfig,UnitClass } from '../types';

describe('招募热路径的直接只读字段',()=>{
    it('与完整展开保持价格的零值、null、undefined及可枚举语义',()=>{
        const state=createDemoState();
        const variants:(RuleConfig|undefined)[]=[undefined,{}, {prices:{soldier:0,ghost:null,commander:200},commanderRecruitCostGrowth:17},{prices:{soldier:undefined},commanderRecruitBaseCost:undefined},Object.create({prices:{soldier:2},commanderRecruitBaseCost:4}),{prices:Object.defineProperty({},'soldier',{value:10,enumerable:false})}];
        for(const rules of variants){
            state.rules=rules;const full=getRuleConfig(state);
            for(const player of state.players)for(const kind of Object.keys(UNIT_CONFIGS) as UnitClass[]){
                const override=full.prices[kind],expected=kind==='commander'
                    ? override===null||override===undefined&&full.commanderRecruitBaseCost===null?null:(override??full.commanderRecruitBaseCost)+(player.commanderDeathCount??0)*full.commanderRecruitCostGrowth
                    : override===undefined?UNIT_CONFIGS[kind].cost:override;
                expect(getUnitCost(state,player.id,kind)).toEqual(expected);
            }
        }
    });
    it('价格、招募集合与人口限制原位修改后立即生效',()=>{
        const state=createDemoState(),player=state.players[0];player.gold=1000;
        state.rules={prices:{soldier:150},teams:{[player.id]:{recruitableUnits:['soldier'],populationLimit:100}}};
        expect(canRecruitUnitClass(state,player.id,'soldier')).toBe(true);
        state.rules.prices!.soldier=null;expect(getRecruitableUnits(state,player.id)).not.toContain('soldier');
        state.rules.prices!.soldier=0;expect(canRecruitUnitClass(state,player.id,'soldier')).toBe(true);
        state.rules.teams![player.id].populationLimit=0;expect(canRecruitUnitClass(state,player.id,'soldier')).toBe(false);
    });
});
