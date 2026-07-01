# 远古帝国 AI 训练启动与新对话交接文档

本文档用于开启新的 Codex/开发对话，目标是让新对话可以直接开始训练准备、训练脚本设计、战役二次训练规划和后续代码实现。当前结论基于项目现状、APK 4.2.5.1 反编译资料、已实现规则门禁和最近提交。

## 1. 当前项目状态

- 项目路径：`C:\code\AncinetEmpires`
- 当前主分支：`main`
- 最近关键提交：
  - `c61bcae feat(campaign): add static event hooks for training`
  - `1efcc45 fix(apk): apply opencode skirmish mechanics`
  - `ad5b2d1 fix(apk): align counterattack status rules`
- 不要修改 `demo` 下的文档。
- 根目录有多份未跟踪分析文档，主要作为规则证据和后续实现参考，不应默认提交。

当前可以认为：

- **skirmish/对战规则层面已经达到已知 APK 证据范围内一致。**
- **可以开始通用对战 AI 训练准备和训练。**
- **完整战役打榜训练还不应直接开始**，因为 AEI/AEII/AEIII 每关脚本尚未逐关转换成 `RuleConfig.campaignEvents` 配置。
- 当前已经具备“战役式训练场景”的代码入口，可以先挑 1-2 张战役图做单图事件配置和二次训练验证。

## 2. 必跑验证命令

在开始训练或改训练代码前，先跑以下命令确认环境没有回退：

```bash
npm test -- --run
npm run build
npm run apk:training-report -- --check
npm run apk:skirmish-rule-report -- --check
```

当前通过基线：

- `npm test -- --run`：289 个测试通过。
- `npm run build`：通过。
- `npm run apk:training-report -- --check`：40/40 skirmish 训练场景通过。
- `npm run apk:skirmish-rule-report -- --check`：30/30 规则检查通过。

可选规则报告：

```bash
npm run apk:map-report -- --check
npm run apk:script-report -- --check
npm run apk:dex-report -- --check
npm run apk:terrain-report -- --check
npm run apk:unit-report -- --check
npm run apk:language-rule-report -- --check
```

## 3. 训练入口

核心训练环境是 `AncientEmpiresEnv`：

```ts
import { AncientEmpiresEnv } from './src/game/env';
import {
  createApkSkirmishTrainingEnv,
  getApkSkirmishTrainingScenarios
} from './src/game/apk_skirmish';
```

推荐优先使用官方 skirmish 训练场景：

```ts
const scenarios = getApkSkirmishTrainingScenarios();
const env = createApkSkirmishTrainingEnv(
  scenarios[0].mapName,
  scenarios[0].id,
  { maxPlies: 1000 }
);

let result = env.reset();
while (!result.done) {
  const legalIndexes = result.fixedLegalActionIndexes;
  const actionIndex = legalIndexes[Math.floor(Math.random() * legalIndexes.length)];
  result = env.stepFixedAction(actionIndex);
}
```

训练端应优先消费 `EnvStepResult`：

- `observation`：完整公开状态，当前没有战争迷雾。
- `legalActions`：结构化合法动作。
- `legalActionCodes`：字符串形式动作，方便日志。
- `legalActionEntries`：动作、编码、mask、固定索引聚合。
- `fixedActionSpaceDescriptor`：固定稀疏动作空间描述。
- `fixedLegalActionIndexes`：当前合法固定动作索引。
- `actionMask`：动态合法动作 mask。
- `reward`：训练环境层稀疏奖励。
- `done`：是否终局。

奖励语义：

- 非法动作：`-0.01`
- 胜利：`+1`
- 失败：`-1`
- 平局：`0`
- 超时：按金币和剩余军力价值估算胜负联盟。

注意：`GameEngine` 内部有局部奖励，但 `AncientEmpiresEnv` 会覆盖为稀疏奖励；强化学习优先用 `EnvStepResult.reward`。

## 4. 固定动作空间

当前固定动作空间由地图尺寸和单位类型列表决定，默认覆盖所有项目单位：

- `move`
- `post_attack_move`
- `attack`
- `heal`
- `support`
- `summon`
- `recruit_to_castle`
- `recruit_and_deploy`
- `capture`
- `repair`
- `destroy_town`
- `wait`
- `surrender`
- `end_turn`

推荐训练策略：

- 模型输出固定动作空间 logits。
- 用 `fixedLegalActionIndexes` 或 `getFixedActionMask()` 屏蔽非法动作。
- 执行时使用 `env.stepFixedAction(index)`。
- 调试和复盘时记录 `legalActionCodes` 或 `legalActionEntries[].code`。

不要让模型直接输出可变参数动作，除非训练框架已经能稳定处理结构化 action。

## 5. 当前可训练数据集

默认训练集来自 APK 官方 skirmish 地图：

- 20 张官方 skirmish 地图。
- SD/SO 两种模式。
- 共 40 个训练场景。
- metadata、manifest、动作空间、招募经济、模式规则均有门禁。

训练场景特点：

- 适合训练通用战术底座。
- 包含 SD 正常模式和 SO 原版模式。
- 默认不包含未验证 approximate/unmapped 地图。
- 当前不含完整战役脚本事件。

建议第一阶段只训练这 40 个场景，先把基础战术学稳：

- 行军和站位
- 集火和反击规避
- 城镇/城堡争夺
- 招募和经济
- 指挥官保护
- 支援、治疗、召唤、突击后移动
- 地形防御和地形回血

## 6. 战役训练入口

最近已新增 `RuleConfig.campaignEvents`，用于把 APK Rhino JavaScript 战役脚本静态化，不直接嵌入 JS 运行时。

支持触发器：

- `turn_start`：某队回合开始、指定回合、周期回合。
- `unit_standby`：单位结束行动，支持按队伍、坐标、区域、code、兵种、指挥官筛选。
- `unit_destroyed`：单位死亡，支持按 code、兵种、队伍、指挥官筛选。
- `tile_occupied`：占领指定地块，支持旧归属/新归属筛选。

支持效果：

- `create_unit` / `reinforce`：刷兵。
- `damage_units` / `change_unit_hp`：直接伤害或回血。
- `change_unit_team`：改变单位阵营。
- `destroy_units` / `remove_units`：摧毁或移除单位。
- `move_unit`：脚本移动单位。
- `set_tile`：改变地形或归属。
- `restore_team` / `disable_team` / `destroy_team`：启用、禁用、摧毁队伍。
- `set_alliance`：改变联盟。
- `game_over`：设置胜利联盟。
- `set_boolean` / `set_integer`：脚本变量。
- `change_gold` / `set_current_team`：金币和当前队伍控制。

事件触发状态会记录在：

```ts
state.apkScriptState.booleans["#campaignEvent:<eventId>"]
```

训练 observation 会暴露摘要：

```ts
observation.rules.campaignEvents = [
  { id, triggerType, once, fired }
]
```

## 7. 战役事件配置示例

回合刷兵：

```ts
const rules = {
  campaignEvents: [{
    id: 'wave_p1_t1',
    trigger: { type: 'turn_start', playerId: 1, turn: 1 },
    effects: [{
      type: 'create_unit',
      unit: {
        unitClass: 'skeleton',
        teamId: 1,
        pos: { x: 3, y: 3 },
        level: 2,
        code: 'wave_skeleton'
      }
    }]
  }]
};
```

区域伏兵：

```ts
const rules = {
  disabledTeams: [1],
  campaignEvents: [{
    id: 'ambush_zone',
    trigger: {
      type: 'unit_standby',
      selector: {
        teamId: 0,
        area: { minX: 1, maxX: 4, minY: 5, maxY: 7 }
      }
    },
    effects: [
      { type: 'restore_team', teamId: 1 },
      {
        type: 'reinforce',
        units: [
          { unitClass: 'skeleton', teamId: 1, pos: { x: 3, y: 3 }, code: 'ambusher_a' },
          { unitClass: 'skeleton', teamId: 1, pos: { x: 4, y: 3 }, code: 'ambusher_b' }
        ]
      }
    ]
  }]
};
```

击杀 boss 胜利：

```ts
const rules = {
  campaignEvents: [{
    id: 'boss_defeated',
    trigger: { type: 'unit_destroyed', selector: { unitCode: 'saeth' } },
    effects: [{ type: 'game_over', allianceId: 0 }]
  }]
};
```

占领目标胜利：

```ts
const rules = {
  campaignEvents: [{
    id: 'occupy_target',
    trigger: { type: 'tile_occupied', pos: { x: 12, y: 4 }, ownerId: 0 },
    effects: [{ type: 'game_over', allianceId: 0 }]
  }]
};
```

## 8. 推荐训练路线

### 阶段 A：训练准备

目标：确保训练管线能稳定跑完整 episode。

任务：

- 写一个最小训练 runner，循环 40 个 skirmish 场景。
- 保存每局：
  - 场景 ID
  - seed
  - 初始 observation hash
  - 每步 action code
  - reward
  - done
  - winner
  - 终局回合/ply 数
- 先用 RandomAI 和 HeuristicAI 做 baseline。
- 确认固定动作 mask 无非法动作。

### 阶段 B：通用 skirmish AI

目标：训练稳定基础策略。

建议：

- 先用 self-play 或 opponent pool。
- 先只训练 SD，再加入 SO。
- 每 N 步保存 checkpoint。
- 每个 checkpoint 固定 seed 评估 40 个场景。
- 主要指标：
  - 胜率
  - 平均 ply
  - 非法动作率
  - 超时率
  - 平均军力价值差
  - 指挥官死亡率

### 阶段 C：战役式二次训练

目标：让 AI 适应伏兵、刷兵、boss、保护目标、限回合等脚本事件。

建议：

- 不要一开始做全部 25 个战役关卡。
- 先挑 1-2 张代表图：
  - AEII s8：周期 AoE/boss 战。
  - AEIII s6：64 回合限制 + 周期刷兵 + 多 boss。
  - AEIII s7：区域触发刷兵 + boss。
- 把该关脚本转成 `campaignEvents`。
- 用通用 skirmish AI 初始化，再二次训练。
- 每张图可以保留一个特化 checkpoint。

### 阶段 D：单图优化

目标：针对某一关最短回合/最稳通关优化。

建议：

- 先固定地图、固定 seed、固定事件配置。
- 用通用模型做 rollout。
- 对高分轨迹做 imitation 或 replay buffer 加权。
- 再用 RL 或搜索做局部优化。
- 如果要追求最短回合，reward 需要从纯胜负改为：
  - 胜利：`+1`
  - 每 ply 小惩罚：例如 `-0.001`
  - 关键目标进展奖励
  - 失败：`-1`

当前项目默认 reward 是稀疏胜负奖励；如果要打榜式最短回合，需要新增 reward 配置，不建议直接改默认 env 行为。

## 9. 是否可以开始训练

可以开始：

- 通用 skirmish/对战 AI 训练。
- 训练 runner、日志、评估脚本、checkpoint 管理。
- RandomAI/HeuristicAI baseline。
- 固定动作空间 PPO/DQN/MCTS 接入。

暂不建议开始：

- 完整战役打榜训练。
- 直接把全部战役混入训练集。
- 依赖排行榜数据训练。

原因：

- 战役事件执行系统已有，但每关还没完成事件配置。
- 排行榜核实已明确不做，不作为当前训练依赖。
- 战役最优解更接近单图规划/路线优化，需要先有准确事件配置。

## 10. 下一步代码任务

优先级建议：

1. 新增训练 runner：
   - 批量加载 40 个 skirmish 场景。
   - 支持随机策略、启发式策略、外部模型策略。
   - 输出 episode JSONL。

2. 新增评估脚本：
   - 固定 seed。
   - 输出胜率、平均回合、超时率、非法动作率。

3. 新增 reward 配置：
   - 保持默认稀疏奖励不变。
   - 增加可选 shaped reward，用于更快训练和单图优化。

4. 新增战役场景配置层：
   - 选择 AEII s8 或 AEIII s6 作为第一张战役样例。
   - 从 `OPENCODE_APK_Campaign_Structure.md` 和 `OPENCODE_APK_Campaign_AI_Alignment.md` 提取脚本事件。
   - 生成 `RuleConfig.campaignEvents`。

5. 新增战役 smoke test：
   - 事件触发正确。
   - 胜负条件正确。
   - 刷兵位置占用时行为符合当前配置预期。

## 11. 新对话建议开场提示

可以用下面这段开启新对话：

```text
请阅读 C:\code\AncinetEmpires\TRAINING_HANDOFF_GUIDE.md，并基于当前 main 分支继续推进 AI 训练准备。

目标：
1. 不修改 demo 下文档。
2. 先实现通用 skirmish 训练 runner 和评估脚本，不做排行榜相关功能。
3. 使用 AncientEmpiresEnv、createApkSkirmishTrainingScenarios/createApkSkirmishTrainingEnv、fixedLegalActionIndexes/stepFixedAction。
4. 保持现有规则门禁通过：npm test -- --run、npm run build、npm run apk:training-report -- --check、npm run apk:skirmish-rule-report -- --check。
5. 训练 runner 先支持 RandomAI 和 HeuristicAI baseline，再预留外部模型策略接口。
6. 后续再挑 AEII s8 或 AEIII s6 做 campaignEvents 单图特化。
```

## 12. 关键文件索引

- `src/game/env.ts`：训练环境、observation、动作编码、固定动作空间。
- `src/game/engine.ts`：核心回合制规则执行。
- `src/game/rules.ts`：合法动作生成。
- `src/game/types.ts`：状态、动作、规则、战役事件类型。
- `src/game/campaign_events.ts`：静态战役事件触发与效果应用。
- `src/game/apk_skirmish.ts`：APK skirmish 训练场景生成。
- `src/game/apk_stage.ts`：APK Stage 同步 API 子集。
- `src/game/apk_script_config.ts`：APK 脚本字面量规则转 RuleConfig。
- `tools/apk_training_report.ts`：训练场景门禁。
- `tools/apk_skirmish_rule_report.ts`：skirmish 规则门禁。
- `OPENCODE_APK_Campaign_Structure.md`：战役结构和脚本 API 证据。
- `OPENCODE_APK_Campaign_AI_Alignment.md`：战役训练差距和建议。

## 13. 当前边界

- 没有战争迷雾。
- 没有 APK Rhino JS 运行时。
- 没有完整战役 replay 数据。
- 没有排行榜相关实现，且当前明确不做排行榜核实。
- 完整战役复刻需要逐关把脚本转成 `campaignEvents`。
- UI/动画表现不是训练目标，训练以规则层状态转移为准。
