# N02 特征表示升级说明（representation-v2.md）

**版本：** `state-v2` / `action-v2`  
**Run ID：** `agent_upgrade_20260920_01`  

## 1. 升级背景与核心动因（F01 解决）

在原有动作编码（`action-v1`，32 维）中，存在严重的语义折叠与碰撞缺陷：
1. **招募动作坐标缺失：** 几何段仅在 `actor && dest` 时写入，而两类招募动作无 `actor`，导致城堡坐标与落地坐标均未写入。同兵种在不同城堡、不同部署格的动作产生完全相同的特征向量。
2. **城镇破坏目标缺失：** `destroy_town` 未读取显式 `action.target`，退回行动者所在格。
3. **目标单位位置缺失：** 攻击/治疗/支援目标仅编码了少量数值属性，未包含目标坐标。相同属性的不同敌方目标获得相同向量。
4. **行动者起点缺失：** 相同属性单位从不同起点移动到同一落点时，向量完全相同。

在共享状态嵌入的评分网络中，若两个动作的编码相同（`phi(a) == phi(b)`），确定性网络必然输出相同的 logit。加深网络无法解开输入完全不可分的动作。

## 2. V2 动作编码布局（`action-v2`，45 维）

统一接入共享语义层 `getActionSemantics()`，全面消除有害歧义：

| 索引范围 | 长度 | 语义块 | 说明 |
|---|---|---|---|
| `[0..14]` | 15 | 动作类型 one-hot | 15 种动作类型独热编码 |
| `[15..18]` | 4 | 行动者属性 | `[presence, hp/maxHp, attack/20, move/10]` |
| `[19..22]` | 4 | 战术推进与敌距 | `[progress/10, nearestEnemyDist/10, stepDist/10, inRange]` |
| `[23..25]` | 3 | 行动者格 `actorPos` | `[presence, normX, normY]` |
| `[26..28]` | 3 | 落地/部署格 `landingPos` | `[presence, normX, normY]`（处理 move、summon、recruit_and_deploy） |
| `[29..31]` | 3 | 目标格 `targetPos` | `[presence, normX, normY]`（处理 attack/heal/support、destroy_town target） |
| `[32..34]` | 3 | 来源城堡格 `sourceCastlePos`| `[presence, normX, normY]`（处理 recruit_to_castle/recruit_and_deploy） |
| `[35..38]` | 4 | 招募经济段 | `[isRecruit, classOrder, price/1000, remainingGoldAfter/1000]` |
| `[39..42]` | 4 | 目标单位段 | `[hasTarget, isEnemy, targetHp/maxHp, targetAttack/20]` |
| `[43]` | 1 | 指挥官身份 | `isCommanderUnit(state, actor)` |
| `[44]` | 1 | 阵营轮次标记 | 行动者所属阵营是否为当前轮次阵营 |

## 3. 状态编码（`state-v2`，356 维）优化

保持 356 维紧凑布局（全局 20 + 网格分箱 96 + 实体表 240）：
- 强化实体表稳定排序：威胁度 -> 相对阵营 -> 坐标 -> 兵种顺序 -> 等级 -> 经验 -> 血量 -> ID 兜底。
- 彻底消除同格单位（如城堡上堆叠招募/pending）因 ID 重命名导致的排序波动。
- 绝无 seed、文件名、标签位置、玩家 ID 等泄漏身份字段。
