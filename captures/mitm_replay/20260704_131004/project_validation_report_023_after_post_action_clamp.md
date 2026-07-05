# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-04T12:35:55.222Z
- 输入目录：`C:\code\AncinetEmpires\captures\mitm_replay`
- 规则模式：SD
- 抽样文件上限：全部
- 招募歧义处理：允许选第一个合法部署点继续
- 地形处理：未映射地形使用道路兜底并记录
- 文件数：1，唯一校验：1，重复跳过：0，通过：0，失败：1，解析错误：0

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
| game_get_20260704_131309_023.bin | c72987ab3319 | 19x20, P[0,1,2,3,4,5] | 4952 | 失败 | 1635/4952 | 非法动作：当前玩家无法执行该动作 |

## 明细

### game_get_20260704_131309_023.bin

- 状态：失败
- SHA256：`c72987ab331977bdb826a5f81defe3dd91b7737c856291cc2a9f426d95531c93`
- 地图：19x20，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=500
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：4952 条，remaining=0，事件=ATTACK=652, HEAL=423, NEXT_TURN=176, NONE=316, OCCUPY=42, STANDBY=3192, SUMMON=14, SUPPORT=135, SURRENDER=2
- 校验进度：已执行 1635 / 4952 条 APK 记录，展开项目动作 2610 个
- 终局状态：turn=15，currentPlayer=5，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=STANDBY，source=(9,19)，move=(8,18)，target=-，recruitId=-1
- 问题位置：record=1635, turn=15, currentPlayer=5, legalActions=115
- 项目动作：`move:u_83:8,18`
- 引擎信息：非法动作：当前玩家无法执行该动作

## 结论说明

- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。
- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。
- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。
- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。