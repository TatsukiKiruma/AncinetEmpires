# Stage 7 K1 应用模型部署报告

日期：2026-11-09（Asia/Shanghai）。结论：应用默认模型替换与公共集成检查通过。

## 部署身份

- 默认策略：`dual_v3_stage7_k1`，架构 `dual-stream-v3-2m-v1`，参数 1,966,910。
- 权重：`public/models/dual_v3_stage7_k1/final.bin`，7,867,640 字节。
- SHA256：`81012a047520fe038ca93383a2620c4d89d87d4a825b79025c5dfd8fc121cb2e`。
- 原始 D 盘模型只读复制；public 与 dist 二进制哈希均匹配。资产未被 gitignore 忽略。
- 注册表编码器标签为 `dual-v3`；调用遥测按部署要求使用 `dual-v2-schema`。

## 应用行为

浏览器与 Worker 从静态资源异步加载、校验哈希并缓存单例；并发预热共用 Promise，失败后允许重试。Node 同步入口优先读取 public，仅文件缺失时读取指定 D 盘归档；损坏权重明确失败。

Worker 加载阶段独立限时 60 秒，就绪后启用默认 1,000ms 单步看门狗。端到端耗时保留加载开销；单步 deadlineMiss 按决策阶段计算。无 Worker 时先异步预热再决策。取消、过期、失败和超时结果不在界面落子。

应用采用既有 NeuralBeamSearchAI，按剩余预算预留 25% 余量、限制候选和节点，并使用运行时已有的评估成本预测停止扩展。冠军入口要求网络完成根评估，否则明确报错；根评估成功但深层扩展不足时使用真实网络排名动作，不冒充启发式或随机模型输出。唯一合法动作可直接兑现。

自动对局 P0 默认冠军模型；双方下拉框支持冠军与既有 APK Hard；沙盒新增“🏆 Stage 7 K1 走一步”和“⚔️ APK Hard 走一步”。保留历史模型、按钮及整体布局。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| npm run lint | 退出码 0 |
| npm test | 退出码 0；78 文件通过；580 通过、20 跳过、0 失败；31.37 秒 |
| npm run build | 退出码 0；23.19 秒 |
| 发布权重 | public 与 dist 哈希及字节数一致 |
| 加载合同 | 并发缓存、损坏拒绝、404 重试、浏览器同步未预热拒绝 |
| Worker 合同 | 加载独立计时、单步硬超时、取消、加载超时 |

20 项跳过不计作通过。构建有大 chunk 提示，不影响构建成功。

真实 Node 决策遥测（默认 1,000ms 预算）：

| 人数 | 官方地图 | 入口 | 决策 ms | 端到端 ms | 展开节点 |
| --- | --- | --- | ---: | ---: | ---: |
| 2 | (2) Icy Paths.aem | sync | 387.89 | 387.89 | 32 |
| 2 | (2) Icy Paths.aem | async | 288.74 | 290.01 | 32 |
| 3 | (3) Frozen fields.aem | sync | 252.41 | 252.41 | 32 |
| 3 | (3) Frozen fields.aem | async | 252.64 | 264.01 | 32 |
| 4 | (4) Crossroads.aem | sync | 287.18 | 287.18 | 32 |
| 4 | (4) Crossroads.aem | async | 294.88 | 295.85 | 32 |

全部为 OK、权威引擎合法、非投降、fallbackUsed=false、deadlineMiss=false，模型 SHA256 一致。同步首个调用包含冷加载。

浏览器加载和 Worker 使用 Vitest 协议验证；没有执行真实浏览器 UI 点击验收。历史 Stage 7 胜率对应既有验收搜索配置，本次短预算应用集成不重新声明该胜率，也未重跑封存评测。有限初态样本不保证所有硬件和中后盘时延；网络前向不可同步抢占，超时仍如实报告，Worker 可被硬终止。

## 改动清单

- `public/models/dual_v3_stage7_k1/final.json`
- `public/models/dual_v3_stage7_k1/final.bin`
- `src/game/ai/dual_v3_champion_adapter.ts`
- `src/game/ai/dual_v3_champion_adapter.test.ts`
- `src/game/ai/dual_v3_champion_loading.test.ts`
- `src/game/ai/dual_v3_champion_worker.test.ts`
- `src/ai_runtime/dual_v3/beam_search.ts`
- `src/game/ai/models/model_registry.ts`
- `src/game/ai/models/model_registry.json`
- `src/game/ai/neural_ai_adapter.ts`
- `src/game/ai/ai_worker.ts`
- `src/game/ai/cancellable_ai_runner.ts`
- `src/game/ai/play.ts`
- `src/App.tsx`

额外新增本报告与 APP_MODEL_PROMOTION.json。未修改历史 Stage 7 验收证据、封存令牌、公共源码锁、D 盘历史模型或数据库；未删除旧模型；未暂存、提交或推送。既有脏工作区原样保留。关键证据当前只读哈希见 JSON 收据。

全部本次启动的命令已退出；完成时 Get-Process node 返回空列表，无本次遗留后台进程。

