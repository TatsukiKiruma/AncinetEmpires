# 游戏结果与终止原因契约规范 (Outcome Contract v4)

**规范版本：** v4.0  
**审计基点：** `85a87a0edb64de18a8b8eced9226ffb1cd1b48e9`  
**遵循原则：** 游戏引擎自然结果与外部执行中止严格分离；杜绝将截断或未知伪装为自然平局或自然胜负。

---

## 1. 结果状态与终止原因分类定义

### 1.1 自然结果状态 (`naturalOutcome`)
| 状态枚举 | 判定条件 | 说明 |
|---|---|---|
| `WIN` | 引擎判定终局 (`engineTerminal == true`)，且胜者联盟等于待评测阵营 (`winnerAlliance == candidateAllianceId`) | 规则自然胜利（如歼灭敌方或占领首都） |
| `LOSS` | 引擎判定终局 (`engineTerminal == true`)，且胜者联盟不等于待评测阵营 | 规则自然失败 |
| `DRAW` | 引擎判定终局 (`engineTerminal == true`)，且规则宣告平局 (`winnerAlliance == null` 且非截断) | 规则自然平局 |
| `UNRESOLVED` | 达到最大步数、最大 Ply、墙钟超时、执行异常或非自然终局 | **未决截断**。不得记为 0.5 分，不得记为自然平局 |

### 1.2 执行终止原因 (`terminationCause`)
| 原因枚举 | 定义与触发条件 |
|---|---|
| `RULE_TERMINAL` | 游戏规则引擎正常触发终局状态 |
| `MAX_STEPS` | 达到评测器配置的每局最大步数限制（例如 150 或 200 步） |
| `PLY_LIMIT` | 达到单回合最大 Ply 上限截断 |
| `WALL_BUDGET` | 达到全局对局墙钟耗时上限截断 |
| `ABORT` | 用户或上层调度主动取消/终止 |
| `ERROR` | 执行过程中抛出未捕获异常或非法状态 |
| `UNKNOWN` | 缺少终止原因元数据的历史遗留记录 |

---

## 2. 严禁的反模式编码 (Prohibited Patterns)

严禁在任何对局聚合、教师筛选、价值监督或门禁测试中出现以下逻辑：

```ts
// 错误 1：将裁定胜者混充自然胜者
const effectiveWinner = ep.summary.winnerAlliance ?? ep.summary.adjudicatedWinnerAlliance;

// 错误 2：将缺失胜者直接等同于平局
const draw = (effectiveWinner === null || effectiveWinner === -1);

// 错误 3：将截断对局按 0.5 得分率计算胜率
const winRate = (wins + 0.5 * draws) / totalGames;
```

---

## 3. 正式指标计算口径

设启动总对局数为 $N$，自然胜 $W$，自然负 $L$，自然平 $D$，截断未决 $T$，异常 $E$：

1. **自然胜率 (Natural Win Rate):**  
   $$R_{\text{win}} = \frac{W}{N}$$
   必须以全部启动局数 $N$ 为分母，严禁在分母中剔除 $T$ 后冒充全盘胜率。

2. **已解决局得分率 (Resolved Score Rate, 条件描述):**  
   $$S_{\text{resolved}} = \frac{W + 0.5D}{W + L + D} \quad (\text{当 } W + L + D > 0)$$
   仅作为条件性诊断参考，不得单独据此晋级（因可能存在截断的选择性偏差）。

3. **保守不确定性区间 (Conservative Score Bounds):**  
   $$S \in \left[ \frac{W + 0.5D}{N}, \frac{W + 0.5D + T}{N} \right]$$
   在存在截断时，保守下界将所有截断视作最劣，保守上界将所有截断视作最优。门禁晋级必须基于预注册的保守下界。

4. **材料优势裁定 (Material Adjudication):**  
   若存在规则外的人工材料计分裁定，必须以 `adjudicatedWins` 字段单独报告，严禁并入自然胜或作为自然价值监督标签。
