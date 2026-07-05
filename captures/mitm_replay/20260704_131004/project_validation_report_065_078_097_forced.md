# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-04T19:48:26.453Z
- 输入目录：`C:\code\AncinetEmpires\captures\mitm_replay`
- 规则模式：SD
- 抽样文件上限：全部
- 招募歧义处理：严格模式，缺少部署坐标即失败
- APK 强制执行：开启，跳过项目合法动作枚举
- 地形处理：未映射地形使用道路兜底并记录
- 文件数：3，唯一校验：3，重复跳过：0，通过：1，失败：2，解析错误：0

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
| game_get_20260704_132008_065.bin | 1269141a5313 | 13x13, P[4,1,0,5,2,3] | 1182 | 失败 | 217/1182 | 找不到攻击目标单位: (5, 9) |
| game_get_20260704_132050_078.bin | 72d58b04ba9f | 13x13, P[4,1,0,5,2,3] | 250 | 失败 | 171/250 | 找不到攻击目标单位: (5, 10) |
| game_get_20260704_132339_097.bin | 5619d6a85c7d | 25x25, P[0,1,2,3,4,5] | 3221 | 通过 | 3221/3221 | - |

## 明细

### game_get_20260704_132008_065.bin

- 状态：失败
- SHA256：`1269141a53135f4db64bcb35e1a8490431708306fd26a33e0a287f28a2361856`
- 地图：13x13，玩家=[4,1,0,5,2,3]，初始单位=10，推荐金币=250
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=0，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1182 条，remaining=0，事件=ATTACK=396, HEAL=37, NEXT_TURN=87, NONE=168, OCCUPY=22, REPAIR=6, STANDBY=399, SUMMON=26, SUPPORT=40, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 217 / 1182 条 APK 记录，展开项目动作 352 个
- 终局状态：turn=5，currentPlayer=0，winner=-
- 首个问题：找不到攻击目标单位: (5, 9)
- APK 记录：event=ATTACK，source=(7,11)，move=(5,11)，target=(5,9)，recruitId=-1
- 问题位置：record=217, turn=5, currentPlayer=0, legalActions=44
- 项目动作：`-`
- 失败诊断：actor=u_41/soldier/P0@(7,11) hp=100/100 lv=0 exp=0 range=1-1 status=none；target=-；move占位=-；sourceTargetDist=4；moveTargetDist=2
- 引擎信息：-

### game_get_20260704_132050_078.bin

- 状态：失败
- SHA256：`72d58b04ba9f2e5d885e36a57d0dfaa608618916fa9d2cb38e2ece15d9312d4d`
- 地图：13x13，玩家=[4,1,0,5,2,3]，初始单位=10，推荐金币=250
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=250，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：250 条，remaining=0，事件=ATTACK=35, HEAL=7, NEXT_TURN=24, NONE=58, OCCUPY=4, STANDBY=119, SUPPORT=1, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 171 / 250 条 APK 记录，展开项目动作 283 个
- 终局状态：turn=4，currentPlayer=0，winner=-
- 首个问题：找不到攻击目标单位: (5, 10)
- APK 记录：event=ATTACK，source=(7,12)，move=(6,10)，target=(5,10)，recruitId=-1
- 问题位置：record=171, turn=4, currentPlayer=0, legalActions=61
- 项目动作：`-`
- 失败诊断：actor=u_43/soldier/P0@(7,12) hp=100/100 lv=0 exp=0 range=1-1 status=none；target=-；move占位=u_36/soldier/P0@(6,10) hp=40/100 lv=0 exp=10 range=1-1 status=none；sourceTargetDist=4；moveTargetDist=1
- 引擎信息：-

### game_get_20260704_132339_097.bin

- 状态：通过
- SHA256：`5619d6a85c7d6c93bed5b4dab762927dca38b5b64c1d599a3ddcf54c67d650f8`
- 地图：25x25，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=700，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：3221 条，remaining=0，事件=ATTACK=982, HEAL=58, NEXT_TURN=240, NONE=366, OCCUPY=111, STANDBY=1332, SUMMON=44, SUPPORT=87, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 3221 / 3221 条 APK 记录，展开项目动作 5576 个
- 终局状态：turn=63，currentPlayer=0，winner=-
- 首个问题：无

## 结论说明

- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。
- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。
- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。
- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。