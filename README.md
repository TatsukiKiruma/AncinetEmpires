# 战棋核心规则演练场 (Gym Env)

这是一个用于 AI 训练（如 MCTS、强化学习）的最小化回合制战棋游戏引擎。
设计上完全解耦了游戏核心逻辑和 UI 展示，保证 `engine.ts` 是一个纯粹的状态机引擎，可以直接用于后端训练或无头模拟。

## 特性

- **Gym-like 接口**: 提供 `getLegalActions`, `step`, `clone`, `reset` 等结构化接口。
- **纯函数状态转换**: 不依赖外部可变状态，`clone` 提供深拷贝功能，完美适配 MCTS 或并行 MCTS 搜索。
- **模块化架构**: 将地形、规则、参数、状态分别拆解。
- **UI 只读解耦**: UI 只接收 `GameState` 进行只读渲染，不会主动修改游戏状态。

## 项目结构

```text
src/
  game/
    types.ts            # 全局接口、类型定义与动作结构
    constants.ts        # 数值表：兵种属性、地形消耗等
    map.ts              # 地图寻路、可达性算法
    rules.ts            # 战斗结算、行动合法性算法
    engine.ts           # 核心 Gym Engine, 实现状态转移与回合管理
    demo_map.ts         # 测试用地图配置
    ai/
      random_ai.ts      # 随机抽取合法动作的 AI
      heuristic_ai.ts   # 带简单评估函数的贪心 AI
      play.ts           # 无头自动对局脚本器
    tests/
      engine.test.ts    # Vitest 单元测试
```

## 如何运行与测试

### 本地启动预览 UI
```bash
npm run dev
```
打开网页后，可在界面上直接观看 `Heuristic AI` 与 `Random AI` 的自动博弈对局，右侧有完整的引擎实时日志。

### 运行单元测试
本项目配置了 `vitest`。
```bash
npm run test
```

包含的基础测试覆盖：
- 环境初始与克隆 (`clone`) 完全独立。
- 单位合法路径与攻击距离判断。
- 扣血、反击和受伤结算。
- 回合结算机制（包括经济收入）。
- 死亡胜负判断。

## 待补充规则清单 (TODO List)

为防止过度设计，部分战棋进阶机制在当前最小版本（v1.0）中暂未实现。后续扩展或训练高级模型时可逐步加入：

1. ~~基础招募~~ 已实现：消耗金币在对应的 BASE 建筑招募。
2. **地形闪避机制**：当前 `rules.ts` 中的地形影响是固定减伤，未实现百分比闪避机制。 
3. **迷雾系统 (Fog of War)**：当前棋局对双方完全公开 (Perfect Information Game)。如果要将其变为不完全信息博弈 (POMDP)，需要实现在 `GameState` 中基于玩家 ID 模糊处理未探测区域，并增加视野 (Vision) 属性。
4. **兵种克制 (Weapon Triangle)**：缺少类似“剑克斧、斧克枪”的补正公式（当前是纯攻防加减）。可以在 `constants.ts` 新增乘区表。
5. **占领进度持久化**：目前 `capture` 动作可一步占领建筑，没有针对“部分占领（需要多回合）”的具体规则。
6. **地形移动惩罚动态计算**：一些高级能力（例如飞行兵种 ignoring terrain cost）目前需单独在 `rules.ts` 中特判扩展。
7. **行动撤销 (Undo)**：引擎未实现局内单步回档能力。仅允许完整 clone () 保存存档点。这对于 AI 演练足够，如果是人工操作可记录 step history。
