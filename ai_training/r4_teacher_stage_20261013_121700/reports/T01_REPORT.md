# T01: 严格对局执行器与裁判协议报告

- **执行日期**：2026-10-13
- **工作区绝对路径**：`C:\code\AncinetEmpires\ai_training\r4_teacher_stage_20261013_121700`
- **规则版本**：`apk-4.2.5.1-rules-20261013-r4`
- **状态判定**：**PASS**

---

## 1. 裁判执行器与协议设计

1. **核心文件交付**：
   - `research/state_hash.ts`：规范化 JSON 序列化、确定性 SHA-256 哈希计算与 `computeGameplayStateKey` 重复局面指纹；
   - `research/action_protocol.ts`：语义动作编解码（`encodeAction`/`decodeAction`）、`eligibleMask`、`searchCompletedMask`、`paddingMask` 及 `legalMask` 四种屏蔽协议；
   - `research/outcomes.ts`：终局严格分类（`natural_win`, `natural_draw`, 各种截断, 各种错误），绝对区分自然终局与截断代理，价值标签 `valueTarget`（自然胜负赋 ±1.0/0.0，截断或错误赋 `null`）；
   - `research/match_runner.ts`：权威对局执行器 `MatchRunner` 与无损逐步回放器 `replayMatch`；
   - `research/policy_worker.ts`：独立子进程策略执行器。

2. **硬边界与保护实现**：
   - **真实引擎保护**：策略仅接收 `engine.clone()` 与只读观测，无法篡改裁判真实引擎状态；
   - **真硬超时监管**：通过 `child_process.spawn` 启动独立进程执行策略决策，并在主线程设置超时计时器。一旦超时直接发起操作系统级 `SIGKILL` 强杀，彻底阻断死循环阻塞，杜绝同线程 `setTimeout` 假装硬超时；
   - **禁止代理伪胜**：仅当规则状态存在 `winner !== null` 时判定自然胜负，步数截断仅标记为 `truncated_*` 且 `valueTarget=null`。

## 2. 单元测试与 1000+ 次合法转移回放验收

在 `research/match_runner.test.ts` 中完成了全套 12 项严格验收测试，全部通过（12/12 passed）：

| 测试项 | 验证内容 | 结果 |
|---|---|---|
| 1. 动作语义编解码与 roundtrip | 全部合法动作转为语义字符串再解码回动作对象 100% 幂等一致 | PASS |
| 2. 状态克隆隔离性 | 策略篡改克隆对象的数据，裁判主引擎状态和哈希完全不受影响 | PASS |
| 3. 初始收入不重复结算 | 首回合收入只结算一次，克隆与推进不产生重复发放 | PASS |
| 4. 同方连续行动 | 普通 move 动作执行后不机械切换 currentPlayer，保持同方行动 | PASS |
| 5. 待招募同格一致性 | `recruit_to_castle` 产生的 pending 临时同格状态在克隆和回放中完全一致 | PASS |
| 6. 非法动作阻断 | 策略返回伪造或越界动作时，裁判准确拒绝并归类为 `error_illegal_action` | PASS |
| 7. 重复局面截断 | 达到 `repeatedStateLimit: 2` 时准确阻断并归类为 `truncated_repeated_state` | PASS |
| 8. 步数与换手上限截断 | 超过设定原子动作上限时准确归类为 `truncated_step_limit` | PASS |
| 9. 精确回放验证 | 录制的真实完整对局经 `replayMatch` 逐动作重放，前后哈希 100% 吻合 | PASS |
| 10. 真实价值标签提取 | 仅自然终局按联盟归属计算 ±1.0/0.0，截断局严格保持 `valueTarget=null` | PASS |
| 11. Worker 硬超时监管 | 500ms 超时下死循环策略被主进程强制杀死，准确归类 `error_worker_timeout` | PASS |
| 12. 1,000+ 次合法转移回放 | 在 3 张训练地图上连续执行 1157 次合法转移，逐步状态哈希重放 100% 匹配 | PASS |

- **总转移记录数**：1,157 / 1,157 成功回放
- **状态分歧数**：0
- **非法动作或回退数**：0
