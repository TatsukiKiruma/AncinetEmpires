# 开局收益与快照

`createApkSkirmishGameState` 将 AEM 地图与 `initialGold` 视为开局配置，新对局立即调用回合开始结算。先手获得所拥有城镇、城堡和存活指挥官的收入，其他玩家在自己的回合开始时获得收入。

默认 SD 规则下，每座城镇每回合 50G、每座城堡 100G、存活的零级指挥官 50G；数值服从当前 `RuleConfig`。默认 Duel 图、基础资金 300G 的先手初始可用金币为 450G。

应用、自动对局与环境工厂共用此规则。已有快照交给引擎或环境时不能重复入账。APK 回放需要未结算开局配置时，显式传入 `applyInitialTurnStart: false`，由回放入口结算一次。

历史快照按保存状态解释，不能用新工厂重建后声称状态完全相同。测试位于 `src/game/tests/initial_turn_income.test.ts`。
