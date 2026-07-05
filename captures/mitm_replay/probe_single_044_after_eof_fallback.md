# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-05T06:23:59.310Z
- 输入目录：`C:\code\AncinetEmpires\captures\mitm_replay`
- 规则模式：SD
- 抽样跳过文件数：0
- 抽样文件上限：全部
- 唯一回放跳过数：未启用
- 唯一回放上限：未启用
- 招募歧义处理：允许选第一个合法部署点继续
- APK 强制执行：开启，跳过项目合法动作枚举
- 地形处理：未映射地形使用道路兜底并记录
- 文件数：1，唯一校验：1，重复跳过：0，通过：1，失败：0，解析错误：0

## 分歧分类汇总

- 无失败分歧。

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
| game_get_20260704_131516_044.bin | 6c0f7adb9593 | 21x25, P[0,1,2,3,4,5] | 6476 | 通过 | 6476/6476 | - |

## 明细

### game_get_20260704_131516_044.bin

- 状态：通过
- SHA256：`6c0f7adb95931e5ba5ef625fd8c1f0e91fb0d82ac7845e849a4a3bc2610d3e89`
- 地图：21x25，玩家=[0,1,2,3,4,5]，初始单位=157，推荐金币=2000
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=2000，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：6476 条，remaining=0，事件=ATTACK=1662, HEAL=450, NEXT_TURN=179, NONE=492, OCCUPY=128, REPAIR=10, STANDBY=3308, SUMMON=96, SUPPORT=150, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 6476 / 6476 条 APK 记录，展开项目动作 11047 个
- 终局状态：turn=31，currentPlayer=2，winner=1
- 首个问题：无

## 结论说明

- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。
- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。
- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。
- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。