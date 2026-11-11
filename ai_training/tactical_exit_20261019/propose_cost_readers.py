"""生成招募热路径只读字段提案，不修改公共源码。"""
from pathlib import Path
import hashlib,json
HERE=Path(__file__).resolve().parent;OUT=HERE/'performance_query_cache';p=HERE.parent.parent/'src/game/rule_config.ts'
before=p.read_text(encoding='utf-8');after=before
anchor='export function getRuleConfig(state: GameState): Required<RuleConfig> {'
helper='''/** 标量字段保留完整展开的自有可枚举覆盖语义；不缓存脚本可原位修改的值。 */
function getScalarRule<K extends keyof RuleConfig>(state: GameState, key: K): Required<RuleConfig>[K] {
    return state.rules && Object.prototype.propertyIsEnumerable.call(state.rules, key)
        ? state.rules[key] as Required<RuleConfig>[K]
        : DEFAULT_RULE_CONFIG[key] as Required<RuleConfig>[K];
}

'''
assert after.count(anchor)==1;after=after.replace(anchor,helper+anchor)
old='''    const rules = getRuleConfig(state);
    const priceOverride = rules.prices[unitClass];'''
new='''    // prices在完整对象中独立展开：只接受价格表的自有可枚举条目，null和undefined照旧保留。
    const prices = state.rules?.prices, defaults = DEFAULT_RULE_CONFIG.prices as Partial<Record<UnitClass, number | null>>;
    const priceOverride = prices && Object.prototype.propertyIsEnumerable.call(prices, unitClass)
        ? prices[unitClass]
        : defaults[unitClass];'''
assert after.count(old)==1;after=after.replace(old,new)
after=after.replace("priceOverride === undefined && rules.commanderRecruitBaseCost === null","priceOverride === undefined && getScalarRule(state, 'commanderRecruitBaseCost') === null")
after=after.replace("const baseCost = priceOverride ?? rules.commanderRecruitBaseCost;","const baseCost = priceOverride ?? getScalarRule(state, 'commanderRecruitBaseCost');")
after=after.replace("baseCost + deathCount * rules.commanderRecruitCostGrowth","baseCost + deathCount * getScalarRule(state, 'commanderRecruitCostGrowth')")
old='''export function getRecruitableUnits(state: GameState, playerId: number): UnitClass[] {
    const rules = getRuleConfig(state);'''
new='''export function getRecruitableUnits(state: GameState, playerId: number): UnitClass[] {'''
assert after.count(old)==1;after=after.replace(old,new).replace('?? rules.recruitableUnits',"?? getScalarRule(state, 'recruitableUnits')")
old='''    const rules = getRuleConfig(state);
    const teamRules = getTeamRuleConfig(state, playerId);
    const unitLimit = teamRules.unitLimit ?? rules.unitLimit;'''
new='''    const teamRules = getTeamRuleConfig(state, playerId);
    const unitLimit = teamRules.unitLimit ?? getScalarRule(state, 'unitLimit');'''
assert after.count(old)==1;after=after.replace(old,new).replace('teamRules.populationLimit ?? rules.populationLimit',"teamRules.populationLimit ?? getScalarRule(state, 'populationLimit')")
# 原文件以CRLF保存，保持已有换行以便审阅。
newbytes=after.replace('\n','\r\n').encode('utf-8');beforebytes=p.read_bytes()
assert after!=before
for name,data in [('cost-readers.before.ts',beforebytes),('cost-readers.proposed.ts',newbytes)]: (OUT/name).write_bytes(data)
sha=lambda b:hashlib.sha256(b).hexdigest()
(OUT/'cost-readers-proposal.json').write_text(json.dumps(dict(beforeSha256=sha(beforebytes),proposedSha256=sha(newbytes),applied=False)),encoding='utf-8')
print('只读字段提案已生成')
