# 部署与交付检查清单 (N10)

**执行轮次:** `agent_upgrade_20260920_01`  
**候选模型:** `NET_B` (`training_runs/models/net_b_checkpoint.json`)  
**策略标识:** `S10_NeuralPriorSearch`  

---

## 1. 依赖边界审计 (Node vs 浏览器)
- [x] **纯数学推理核心:** `skirmish_dual_head_net.ts` 中的 `predictDecision` 和 `forwardDenseInference` 为纯数学矩阵运算，零外部运行时依赖，零 Node 原生 API 导入。
- [x] **无文件系统副作用:** 推理路径绝不执行 `fs.readFileSync`、`fs.writeFileSync` 或目录遍历。模型通过 JSON 字符串严格解析。
- [x] **零内存分配:** `forwardDenseInference` 路径只分配决策结果数组，不分配反向传播梯度数组 (`dW`, `db`)。

---

## 2. 安全降级与回退机制
- [x] **模型缺失/损坏回退:** 严格加载器若遇到权重长度不符或 NaN，抛出受检异常，上层策略自动回退至 `HeuristicAI` 原启发式基线。
- [x] **在线超时硬保护:** 
  - 850ms 停止波束展开
  - 950ms 启动候选格式化
  - 1000ms 强制返回最佳候选或首个合法动作
- [x] **非法动作拦截:** 即使模型给出奇异预测，输出必须严格通过当前游戏环境的合法动作列表筛选，非法动作率为 0.0%。

---

## 3. 部署状态
- **默认 AI 状态:** **保持未翻转**。默认 AI 仍为项目原本的 `HeuristicAI`。
- **候选启用方式:** 显式指定策略工厂 `createSearchTeacherPolicyFactory({ modelScorer: createNetworkModelScorer(netB) })`。
