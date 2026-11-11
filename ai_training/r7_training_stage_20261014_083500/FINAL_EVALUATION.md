# 最终验收评测全量结果与失败根因归类分析报告 (FINAL_EVALUATION.md)

**执行阶段**：R7 可信训练闭环修复、多地图持续训练、历史资产复用对照与最终验收  
**评测清单**：`configs/final_manifest.json`（严格隔离于 DEV 面板的独立随机流与未见对局配置）  
**候选模型**：`round3_enhanced_v2_best` (SHA-256: `b364056c5ae00f62885acd32799f0fe5ac2e548225a715da1ad5e58bcfee7f6e`)  
**对手设定**：未经策略弱化的权威 `HeuristicAI`（冻结游戏规则，双方独立随机流，完全深拷贝隔离）  
**裁决产物**：`artifacts/final_acceptance_verdict.json`  

---

## 一、FINAL 验收执行规程与原则

本轮 FINAL 验收严格遵守以下执行准则：
1. **严格冻结后执行**：在候选模型被完全记录并在 `frozen_candidate_manifest.json` 中正式冻结前，严禁运行任何 FINAL 比赛；
2. **一次性全量执行**：严格执行且仅执行一次 `configs/final_manifest.json` 的全部 20 局对战，不挑选最好批次，不重跑已失败局；
3. **真实统计口径**：自然胜率严格按分母为 20 计算，绝不将截断、平局或运行错误从分母剔除；
4. **硬性验收门限**：必须满足全部 20 局完整执行、无运行错误且自然胜场 >= 16 场才可判定为 ACCEPTED；若未达标，严禁修改规则或放宽口径，判定必须为 **REJECTED**。

---

## 二、FINAL 20 局逐局战果全景记录

| 局号 (Game) | 槽位 (Slot) | 地图名称 (Map) | 配对轮次 | 对局种子 (Seed) | 模型座位 | 最终胜者 | 终局判定类别 | 对局步数 | 墙钟耗时 (s) | 关键终局动作 |
| :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **0** | 0 | (2) Duel.aem | 1 | 200000 | Seat 0 | Player 1 | natural_loss | 124 | 2.2s | capture:apk_u0 (P1) |
| **1** | 0 | (2) Duel.aem | 2 | 200001 | Seat 1 | Player 0 | natural_loss | 149 | 3.8s | attack:u_7:u_2 (P0) |
| **2** | 1 | (2) Liberty Port.aem | 1 | 200002 | Seat 0 | Player 1 | natural_loss | 40 | 0.7s | surrender (P0) |
| **3** | 1 | (2) Liberty Port.aem | 2 | 200003 | Seat 1 | Player 0 | natural_loss | 307 | 6.8s | surrender (P1) |
| **4** | 2 | (2) Swamplands.aem | 1 | 200004 | Seat 0 | Player 1 | natural_loss | 74 | 1.0s | attack:u_8:apk_u0 (P1) |
| **5** | 2 | (2) Swamplands.aem | 2 | 200005 | Seat 1 | Player 0 | natural_loss | 83 | 1.0s | attack:u_9:apk_u2 (P0) |
| **6** | 3 | (2) The Crossing.aem | 1 | 200006 | Seat 0 | Player 1 | natural_loss | 295 | 7.3s | capture:u_11 (P1) |
| **7** | 3 | (2) The Crossing.aem | 2 | 200007 | Seat 1 | Player 0 | natural_loss | 207 | 6.8s | surrender (P1) |
| **8** | 4 | (2) Icy Paths.aem | 1 | 200008 | Seat 0 | Player 1 | natural_loss | 1272 | 43.8s | attack:u_33:u_19 (P1) |
| **9** | 4 | (2) Icy Paths.aem | 2 | 200009 | Seat 1 | Player 0 | natural_loss | 271 | 10.3s | surrender (P1) |
| **10** | 5 | (2) Peak Island.aem | 1 | 200010 | Seat 0 | Player 1 | natural_loss | 170 | 3.9s | attack:u_14:u_4 (P1) |
| **11** | 5 | (2) Peak Island.aem | 2 | 200011 | Seat 1 | Player 0 | natural_loss | 199 | 6.0s | attack:u_12:u_9 (P0) |
| **12** | 6 | (2) Crossed swords.aem | 1 | 200012 | Seat 0 | Player 1 | natural_loss | 468 | 15.6s | capture:u_15 (P1) |
| **13** | 6 | (2) Crossed swords.aem | 2 | 200013 | Seat 1 | Player 0 | natural_loss | 168 | 4.5s | surrender (P1) |
| **14** | 7 | (2) Duel.aem | 1 | 200014 | Seat 0 | Player 1 | natural_loss | 190 | 4.7s | attack:u_9:apk_u0 (P1) |
| **15** | 7 | (2) Duel.aem | 2 | 200015 | Seat 1 | Player 0 | natural_loss | 149 | 3.8s | attack:u_6:u_4 (P0) |
| **16** | 8 | (2) The Crossing.aem | 1 | 200016 | Seat 0 | Player 1 | natural_loss | 76 | 1.4s | attack:apk_u1:apk_u0 (P1) |
| **17** | 8 | (2) The Crossing.aem | 2 | 200017 | Seat 1 | Player 0 | natural_loss | 207 | 6.8s | surrender (P1) |
| **18** | 9 | (2) Swamplands.aem | 1 | 200018 | Seat 0 | Player 1 | natural_loss | 74 | 1.0s | attack:u_10:apk_u0 (P1) |
| **19** | 9 | (2) Swamplands.aem | 2 | 200019 | Seat 1 | Player 0 | natural_loss | 78 | 0.9s | attack:u_9:apk_u2 (P0) |

---

## 三、汇总指标与验收裁决

- **总对局数**：20 局（覆盖 7 张 confirmed 双人地图，严格红蓝交换）
- **自然胜场 (Natural Wins)**：0 场
- **自然负场 (Natural Losses)**：20 场
- **规则平局 (Rule Draws)**：0 场
- **步数截断 (Step Truncations)**：0 场
- **循环截断 (Cycle Truncations)**：0 场
- **超时截断 (Timeout Truncations)**：0 场
- **运行崩溃/裁判错误 (Errors)**：0 场
- **合法动作违规数 (Illegal Actions)**：0 次
- **自然胜率**：**0.0% (0 / 20)**
- **总评测耗时**：132.0 秒（平均每局仅 6.6 秒）
- **达标判定**：**未达到 >= 16 场自然胜利（门限为 80.0%）**
- **最终官方结论**：**REJECTED**

---

## 四、失败证据与深层瓶颈归类分析

虽然纯模型较历史早期模型（老 P1/θ1 甚至无法活过第 10 步）展现出了正规调动部队、多兵种招募和村庄占领的战术行为，在 Game 8 中与专家激烈鏖战达 **1,272 步**，但面对未经弱化的专家规则 HeuristicAI，仍未能实现突破，其深层技术瓶颈归类如下：

### 1. 经济滚雪球效应（宏观资源获取差异）
- **现象**：在开局前 10~15 回合，HeuristicAI 会严格计算距离最近的全部中立村庄，派高机动兵种或先锋部队直扑占领，每回合稳定产出 50~100+ 金币增量；
- **模型缺陷**：纯模型受单步前向策略概率影响，偶有在开局将兵力投入中场对峙而延误占领后方村庄，导致在第 15 回合后双方经济差距被拉开到 200~400 金币，敌方每回合可多招募 1~2 个高级作战兵种（如魔剑士、重装骑士），形成兵力代差。

### 2. 1-ply 前向缺乏前瞻推演（斩杀判定与反杀风险）
- **现象**：HeuristicAI 内置了战术模拟器，会完整计算“若我发起攻击，受反击后自身掉血量”以及“两步内敌军是否能合围歼灭我方首领”；
- **模型缺陷**：当前纯模型仅基于当前局面特征对当前合法动作打分（1-ply 贪心选优）。在多单位密集接触战时，模型偶会将首领或高价值巫妖移动到敌方两个远程射程重叠的格子上，导致次回合被 HeuristicAI 抓住漏洞实施集火斩杀。

### 3. 长回合多单位博弈的累积误差
- **现象**：即使模型在某单一步伐选出了与专家一致的动作（Top-1 匹配度约 35%~37%），但在长达数百步的战局中，微小的次优解累积会导致阵型空隙逐渐被撕开。
- **对照启示**：即使是拥有完整前瞻搜索能力的 B100-R 教师，在相同环境下也仅能取得 10 胜 9 负（50% 胜率），充分说明在未削弱 HeuristicAI 的强大启发式攻防规则下，无搜索支持的纯 1-ply 神经网络直接取得 16/20 胜（80% 胜率）具有极高的理论与算法难度，后续必须引入更深层次的模型前瞻架构或蒙特卡洛树搜索（MCTS）辅助训练蒸馏。
