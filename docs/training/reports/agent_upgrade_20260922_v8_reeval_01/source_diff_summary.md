# V8 源码修复与接口契约差异摘要 (Source Diff Summary)

**Run ID**: `agent_upgrade_20260922_v8_reeval_01`  
**基准 Commit (HEAD)**: `28f0b847a0ac0147cdb8e096ac7ad9c132e85cb4`  
**远端核查提交**: `251412da8bc7f0733374f8f9b8ad1b5e27c5a241` (`origin/path-b-spatial-ai`)  
**Dirty Patch Hash (SHA256)**: `cd34f7e84598bf06a28645b06819ddaf6fcdb030d375a012222c5307ab1b7aca`  
**日期**: 2026-09-22  

---

## 1. 真实工作区与 Worktree 审计结论

经本地环境命令（`git rev-parse`, `git status`, `git worktree list`, `git diff`）核验：
1. **主工作区**: `C:/code/AncinetEmpires`，当前 HEAD 为 `28f0b84`，领先远端 `origin/path-b-spatial-ai`（`251412d`）6 次提交。
2. **辅助 Worktree**: `C:/code/AncinetEmpires/_work`，HEAD 为 `60e89a5`（分支 `codex-v8-work`），工作树完全 clean。
3. **修复状态判断**: 用户本地已完整包含 V8 所要求的全部工程修复（调用接口、有限性检查、随机流、停滞截断移除、评测协议）。本批次严格**复核并执行实测**，未进行任何覆盖或重复实现。
4. **编译与类型配置调整**:
   - `tsconfig.json`: 在 `"exclude"` 中增加 `"_work"`（辅助 worktree 目录，内部包含 unpacked APK 二进制文件），避免 `tsc --noEmit` 递归扫描外部 worktree。
   - `vite.config.ts`: 显式增加 `test.exclude: ['**/_work/**', '**/training_runs/**']`，避免 Vitest 重复扫描辅助 worktree 导致测试耗时翻倍。
   - `tools/v7_cross_language_parity.test.ts` 与 `tools/v8_p0_defect_exposure.test.ts`: 将子进程与深层博弈单测超时阈值适度放宽，避免 Windows 多进程争抢偶发超时。

---

## 2. 核心模块代码修改与契约对齐

### 2.1 空间卷积网络推理接口统一与非有限性防御 (`src/game/ai/spatial_conv_net.ts`)
- **接口二参数契约**: 彻底统一为 `predict(encodedState: SpatialEncodedState, candidateActions: SpatialActionFeatures[])`。
- **维度与类型断言**:
  - `spatialTensor.length === 24 * 20 * 20` (9600 元素)，严禁非法形状；
  - `globalFeatures.length >= 20` (v2)；
  - 输入张量、特征、候选语义向量必须全部为有限数（`Number.isFinite`），出现 NaN/Inf 即刻抛出异常；
  - 输出 `actionLogits` 与 `value` 进行有限性检验；
  - `actionLogits.length === candidateActions.length` 严格保证。
- **调用方全部统一**:
  - `tools/v7_unified_evaluation.ts / PolicyAgent`: `this.spatialPredictor.predict(encSpatial, candSpatial)`
  - `tools/v7_heuristic_bounded_search.ts / getFilteredCandidateActions`: `spatialPredictor.predict(encSpatial, candSpatial)`
  - `tools/v7_counterfactual_dagger.ts / predictStudentAction`: `predictor.predict(encSpatial, candSpatial)`

### 2.2 NET_A 决策索引与价值头反向传播数值安全 (`tools/skirmish_dual_head_net.ts`)
- **决策返回字段规范**: `predictDecision` 统一返回 `{ logits, probs, topIndex, bestActionIndex, value }`，其中 `bestActionIndex === topIndex === argmax(logits)`，且断言 `0 <= topIndex < candidates.length`。
- **NaN 防御与价值梯度门控**:
  - 严格校验 `sample.valueTarget !== null && sample.valueTarget !== undefined && (opts.valueWeight ?? 1) > 0` 才进入价值损失与梯度反向；
  - 当 `valueTarget` 缺失或 `valueWeight === 0` 时，绝对不产生 `0 * (pred - undefined)` 等算术操作，彻底杜绝 NaN 污染 trunk 权重；
  - 训练步返回报告包含有限数断言，异常时即刻阻断。
- **评测入口适配**: `PolicyAgent` 支持 Float64Array / Array 特征规范化，正确读取 `bestActionIndex ?? topIndex`。

### 2.3 评测协议与对战规范修复 (`tools/v7_unified_evaluation.ts`)
- **移除错误停滞截断**:
  - 彻底删除了旧协议中“单位总数连续 25 个底层动作不变即判停滞退出”的逻辑（移动、占点、削血、治疗均不改变单位数，导致长线博弈被腰斩）；
  - 胜负仅由规则自然判定（`NATURAL_WIN` / `NATURAL_LOSS` / `NATURAL_DRAW`），轮次或步数超限如实记录为 `TRUNCATION_MAX_TURNS` 与 `TRUNCATION_MAX_STEPS`。
- **确定性独立随机流**:
  - 每场对局由主种子 `seed` 独立派生候选策略种子 `candidateSeed`、对手种子 `opponentSeed` 和搜索模拟种子 `searchSeed`；
  - 搜索内部模拟不再污染主对战环境与对手的 RNG，确保同预算下复核可重现。
- **重招募统计口径修正**:
  - 机会数 `decisionOpportunityCount` 严格由引擎当前合法动作列表判断；
  - 成功数 `rehireSuccesses` 严格在 `engine.step()` 执行后校验玩家金币扣减与单位产生；
  - 区分单次决策机会数与连续死亡恢复窗口数 `recoveryWindowCount`。
- **模型身份与缺失拒绝**:
  - 模型文件不存在时严格标记为 `NOT_RUN`；加载失败标记为 `MODEL_LOAD_ERROR`；
  - 绝不静默回退到 `legal[0]` 或将其他模型伪装为参赛模型；
  - 无论胜负错误，每场对局均落盘完整轨迹日志（包含每步耗时、双方动作、初态 hash 与终止原因）。

---

## 3. 涉及文件清单与修改统计

| 文件路径 | 性质 | 关键变更内容 |
|---|---|---|
| `src/game/ai/spatial_conv_net.ts` | 核心推理 | 二参数 predict 接口、输入输出维度及有限性断言、4残差块支持 |
| `src/game/ai/spatial_neural_adapter.ts` | 生产适配 | 二参数 predict 调用与看门狗封装 |
| `tools/skirmish_dual_head_net.ts` | 核心网络 | NET_A 缺失目标与 valueWeight=0 数值保护、topIndex/bestActionIndex 规范化 |
| `tools/v7_unified_evaluation.ts` | 评测主干 | 移除单位不变截断、独立 PRNG、严格重招募口径、NOT_RUN 拒绝、遥测统计 |
| `tools/v7_heuristic_bounded_search.ts` | 搜索策略 | 二参数 predict 调用、软硬耗时门控 (200ms/900ms)、搜索统计采集 |
| `tools/v7_counterfactual_dagger.ts` | DAgger | 二参数 predict 调用、两座位回放、严格候选编码 |
| `tsconfig.json` | 编译配置 | 排除 `_work` 外部 worktree，确保 `npm run lint` 纯净通过 |
| `vite.config.ts` | 测试配置 | 排除 `_work` 避免测试重复运行与双倍耗时 |
| `tools/v8_run_reeval_benchmark.ts` | 评测工具 | 本轮 V8 冻结权重复评启动脚本（120 场矩阵） |

---

## 4. 验证命令与结果

1. **类型检查**: `npm run lint` (`tsc --noEmit`) -> **Exit Code 0**（0 错误，0 警告，未排除任何业务文件，未使用 any 掩盖）。
2. **策略契约测试**: `npx vitest run tools/v8_p0_defect_exposure.test.ts tools/v7_cross_language_parity.test.ts tools/v7_unified_evaluation.test.ts` -> **Exit Code 0**（17/17 测试全数通过）。
3. **冻结权重基准复评**: `node --openssl-legacy-provider --import tsx tools/v8_run_reeval_benchmark.ts` -> **Exit Code 0**（120 场全部落盘完成）。
