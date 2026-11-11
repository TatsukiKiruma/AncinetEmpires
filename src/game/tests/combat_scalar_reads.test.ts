import { describe,expect,it } from 'vitest';
import { createDemoState } from '../demo_map';
import { getNumericRule,getRuleConfig,type NumericRuleKey } from '../rule_config';

describe('战斗与收入标量读取',()=>{
    it('缺省、显式覆盖和原位修改均与完整配置相同',()=>{
        const s=createDemoState(),keys:NumericRuleKey[]=['incomeVillage','incomeCastle','incomeCommanderBase','incomeCommanderGrowth','destroyerAttackBonus','flyingWaterAttackBonus','deathReaperAttackBonus','inspiredAttackBonus','sharpshooterAttackBonus','terrainChildCombatBonus','weakenedDefensePenalty'];
        for(let i=0;i<20;i++){
            s.rules={};for(const k of keys)if(i%2)s.rules[k]=i;
            for(const k of keys)expect(getNumericRule(s,k)).toBe(getRuleConfig(s)[k]);
            s.rules.weakenedDefensePenalty=23;expect(getNumericRule(s,'weakenedDefensePenalty')).toBe(23);
        }
        delete s.rules;for(const k of keys)expect(getNumericRule(s,k)).toBe(getRuleConfig(s)[k]);
    });
    it('保留显式undefined、非枚举和继承字段的对象展开语义',()=>{
        const s=createDemoState();s.rules={terrainChildCombatBonus:undefined};expect(getNumericRule(s,'terrainChildCombatBonus')).toBe(getRuleConfig(s).terrainChildCombatBonus);
        s.rules=Object.create({terrainChildCombatBonus:99});expect(getNumericRule(s,'terrainChildCombatBonus')).toBe(getRuleConfig(s).terrainChildCombatBonus);
        Object.defineProperty(s.rules,'terrainChildCombatBonus',{value:77,enumerable:false});expect(getNumericRule(s,'terrainChildCombatBonus')).toBe(getRuleConfig(s).terrainChildCombatBonus);
    });
});
