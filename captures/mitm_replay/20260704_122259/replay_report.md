# AEII /api/game_get 回放响应分析



## game_get_20260704_122329_002.bin

- 文件：`C:\code\AncinetEmpires\captures\mitm_replay\20260704_122259\game_get_20260704_122329_002.bin`
- 响应加密：是（52328 -> 52325 bytes）
- 顶层对象：magic=365703, version=100, fields=g:object-bytes(52298)
- g 对象大小：52298 bytes
- 房间类型/状态：PRIVATE / CLOSED
- 截止时间字段：2026-07-04T14:21:34.846Z
- 玩家槽位：6 个，非空玩家 ID 计数 6，public 标记 2
- 旁观/附加字符串数：0
- 地图对象片段：offset=301, length=7254
- 嵌入地图摘要：size=21x21, players=[0,1,2,3,4,5], terrain=441, units=6, recommendedGold=300, defs=84/21, campaignLike=false
- 回放进度字段：currentStep=0, replaySplitIndex=0
- 动作数组：offset=7563, count=1065, remaining=0
- 事件分布：ATTACK=199, HEAL=26, NEXT_TURN=73, NONE=132, OCCUPY=34, STANDBY=565, SUMMON=1, SUPPORT=35
- 导出明文 ACT：`C:\code\AncinetEmpires\captures\mitm_replay\20260704_122259\game_get_20260704_122329_002.replay.plain.act`

| # | 事件 | 来源 | 移动 | 二段移动 | 目标 | 招募ID |
| ---: | --- | --- | --- | --- | --- | ---: |
| 0 | STANDBY | (19,19) | (18,17) | - | - | -1 |
| 1 | NEXT_TURN | - | - | - | - | -1 |
| 2 | STANDBY | (1,1) | (2,3) | - | - | -1 |

## game_get_20260704_122310_001.bin

- 文件：`C:\code\AncinetEmpires\captures\mitm_replay\20260704_122259\game_get_20260704_122310_001.bin`
- 响应加密：是（45528 -> 45523 bytes）
- 顶层对象：magic=365703, version=100, fields=g:object-bytes(45496)
- g 对象大小：45496 bytes
- 房间类型/状态：PRIVATE / CLOSED
- 截止时间字段：2026-07-04T16:25:31.545Z
- 玩家槽位：6 个，非空玩家 ID 计数 4，public 标记 2
- 旁观/附加字符串数：0
- 地图对象片段：offset=249, length=6258
- 嵌入地图摘要：size=17x12, players=[0,2,3,4], terrain=204, units=4, recommendedGold=300, defs=84/21, campaignLike=false
- 回放进度字段：currentStep=0, replaySplitIndex=0
- 动作数组：offset=6515, count=928, remaining=0
- 事件分布：ATTACK=294, NEXT_TURN=95, NONE=86, OCCUPY=16, REPAIR=2, STANDBY=431, SUMMON=3, SURRENDER=1
- 导出明文 ACT：`C:\code\AncinetEmpires\captures\mitm_replay\20260704_122259\game_get_20260704_122310_001.replay.plain.act`

| # | 事件 | 来源 | 移动 | 二段移动 | 目标 | 招募ID |
| ---: | --- | --- | --- | --- | --- | ---: |
| 0 | STANDBY | (15,9) | (13,8) | - | - | -1 |
| 1 | NONE | (15,9) | - | - | - | 0 |
| 2 | STANDBY | (15,9) | (15,7) | - | - | -1 |
