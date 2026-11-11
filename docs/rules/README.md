# 当前规则入口

规则事实以公共 TypeScript 引擎、已核实 APK 证据及回归测试共同确认。旧文档中的“目标规则”“待实现”不能自动当作现状。

| 内容 | 实现入口 |
| --- | --- |
| 状态、动作、pending 招募 | `src/game/types.ts` |
| 合法动作、战斗与技能条件 | `src/game/rules.ts` |
| 动作执行、回合开始、终局 | `src/game/engine.ts` |
| SD/SO 模式与新对局设置 | `src/game/apk_skirmish.ts` |
| 兵种与能力 | `src/game/units.ts`、`abilities.ts` |
| 地形语义与可信度 | `src/game/terrain_rules.ts`、`apk_terrain.ts` |
| 官方地图 | `src/game/apk_manifest.ts`、`apk_skirmish_map_assets.ts` |

当前已包含 `pendingUnitId`、`recruit_to_castle` 和 `recruit_and_deploy`。招募占位、开局收益和回放初态按现行实现判断。

- [开局收益与快照](initial-turn-income.md)
- [环境接口与终止语义](../environment/interface.md)
- [APK 规则及回放证据](../apk-analysis/APK_RULE_ALIGNMENT_HANDOFF.md)

forced 检查记录动作能否按记录执行；strict 另外要求项目合法动作生成器接受这些动作。两者结论不能互换。历史报告的通过数量表示当时覆盖，不代表本次重新验证。
