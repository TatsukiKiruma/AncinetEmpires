# 开局回合收益修复对训练的影响（2026-09-25）

## 规则与入口

`createApkSkirmishGameState` 现在将 AEM 地图和 `initialGold` 视为开局配置，创建新对局时立即调用引擎现有的回合开始逻辑。先手玩家获得所拥有城镇、城堡和存活指挥官的收入，其他玩家要等各自回合开始。应用普通对局、沙盒、自动对局、`createApkSkirmishTrainingGameState` 和 `createApkSkirmishTrainingEnv` 都经过这一入口。已有 `GameState` 快照交给 `GameEngine` 或训练环境时不再重复结算。

`initialGold` 设置及 SD/SO 收入配置未变。默认规则下，每座城镇每回合 50G、每座城堡 100G、存活的 0 级指挥官 50G。示例：蓝方先手、基础资金 300G、两座城镇、一座城堡、存活的 0 级指挥官，首步为 550G；没有指挥官则为 500G。

APK 回放报告仍传入未结算的初始配置，让 `validateApkReplay` 在首条录像动作前结算一次。若其他调用方也先用 `createApkSkirmishGameState` 构造回放输入，需显式设 `applyInitialTurnStart: false`，避免重复结算。

## 已核对的训练影响

- 20 张内置 skirmish 地图、默认 300G 的先手增量为 50G～250G；`(2) Duel.aem` 为 300G → 450G，`(2) Icy Paths.aem` 为 300G → 550G，`(2) Swamplands.aem` 为 300G → 350G。未轮到的队伍仍为 300G。
- `initialGold`、`unitLimit`、`levelCap`、SD/SO 模式、地图与训练计划的参数没有调整。资金特征、可招募动作、教师决策及由它们产生的轨迹可能改变。
- SD 训练计划里的 `normal` 与 `parameter_variant` 使用地图开局，受首回合结算影响；`advantage_endgame` 等派生局面会重新设置回合、单位和双方金币。以 Duel 图和同一 seed 构造的 `advantage_endgame` 对照，修复前后派生状态逐字段相同。
- 既有数据集、回放、checkpoint 和训练进度文件不会被代码修改；它们反映旧开局规则，仍可用于历史复现。重新用同一地图、setup、seed 生成初态时，状态哈希可能不同。含历史初态哈希的回放必须以保存的快照为准，不能用新工厂重建后假称等价。
- 后续按修正规则采样、训练或评测时应使用新运行标识和独立输出目录，记录源码与初态哈希，并重新评估历史 checkpoint。旧数据不能直接混入修正规则的同一个可精确续训数据流；如需沿用历史权重，应作为新运行的权重初始化并明确标记。

## 验证

`src/game/tests/initial_turn_income.test.ts` 覆盖蓝方先手、后续回合不漏算、应用与训练工厂、环境重置不重复结算，以及回放所需原始配置入口。相关遭遇战、训练导出和回放测试通过。
