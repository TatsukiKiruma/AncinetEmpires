# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-04T19:14:11.855Z
- 输入目录：`C:\code\AncinetEmpires\captures\mitm_replay`
- 规则模式：SD
- 抽样文件上限：全部
- 招募歧义处理：允许选第一个合法部署点继续
- 地形处理：未映射地形使用道路兜底并记录
- 文件数：7，唯一校验：7，重复跳过：0，通过：6，失败：1，解析错误：0

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
| game_get_20260704_132315_094.bin | 72d837b6333a | 17x12, P[0,2,3,4] | 819 | 通过 | 819/819 | - |
| game_get_20260704_132325_095.bin | 36b18d37f221 | 21x21, P[0,1,2,3,4,5] | 662 | 通过 | 662/662 | - |
| game_get_20260704_132329_096.bin | ded2b35e1078 | 21x21, P[0,1,2,3,4,5] | 548 | 通过 | 548/548 | - |
| game_get_20260704_132339_097.bin | 5619d6a85c7d | 25x25, P[0,1,2,3,4,5] | 3221 | 失败 | 3008/3221 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_132403_098.bin | 3f3903b3f828 | 21x21, P[0,1,2,3,4,5] | 4645 | 通过 | 4645/4645 | - |
| game_get_20260704_132410_099.bin | f65872ca3530 | 25x25, P[0,1,2,3,4,5] | 428 | 通过 | 428/428 | - |
| game_get_20260704_132412_100.bin | 723d92bcfc5c | 25x25, P[0,1,2,3,4,5] | 344 | 通过 | 344/344 | - |

## 明细

### game_get_20260704_132315_094.bin

- 状态：通过
- SHA256：`72d837b6333af898e4f1efe77318a3f5aafa4edeaa78d7d229826b86d64accac`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：819 条，remaining=0，事件=ATTACK=265, NEXT_TURN=86, NONE=83, OCCUPY=18, REPAIR=2, STANDBY=362, SUMMON=2, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 819 / 819 条 APK 记录，展开项目动作 1376 个
- 终局状态：turn=31，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_132325_095.bin

- 状态：通过
- SHA256：`36b18d37f221bbb097a6d7f8156c1762d28b0e28325fe4251ef68aefac9a06b8`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：662 条，remaining=0，事件=ATTACK=82, HEAL=23, NEXT_TURN=54, NONE=93, OCCUPY=34, STANDBY=358, SUMMON=2, SUPPORT=16
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 662 / 662 条 APK 记录，展开项目动作 1151 个
- 终局状态：turn=10，currentPlayer=0，winner=-
- 首个问题：无

### game_get_20260704_132329_096.bin

- 状态：通过
- SHA256：`ded2b35e107898f2092de52bb95f408bfeb111dde8e2433523883da28771c2fa`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：548 条，remaining=0，事件=ATTACK=62, HEAL=9, NEXT_TURN=48, NONE=83, OCCUPY=34, STANDBY=298, SUPPORT=14
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 548 / 548 条 APK 记录，展开项目动作 953 个
- 终局状态：turn=9，currentPlayer=0，winner=-
- 首个问题：无

### game_get_20260704_132339_097.bin

- 状态：失败
- SHA256：`5619d6a85c7d6c93bed5b4dab762927dca38b5b64c1d599a3ddcf54c67d650f8`
- 地图：25x25，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=700，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：3221 条，remaining=0，事件=ATTACK=982, HEAL=58, NEXT_TURN=240, NONE=366, OCCUPY=111, STANDBY=1332, SUMMON=44, SUPPORT=87, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 3008 / 3221 条 APK 记录，展开项目动作 5256 个
- 终局状态：turn=46，currentPlayer=0，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=OCCUPY，source=(5,5)，move=(5,2)，target=-，recruitId=-1
- 问题位置：record=3008, turn=46, currentPlayer=0, legalActions=881
- 项目动作：`move:u_267:5,2`
- 引擎信息：非法动作：当前玩家无法执行该动作

### game_get_20260704_132403_098.bin

- 状态：通过
- SHA256：`3f3903b3f8289fc922095b3482af36afc7cb00281e659d45b69a8e3933decf6b`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：4645 条，remaining=0，事件=ATTACK=898, HEAL=177, NEXT_TURN=206, NONE=336, OCCUPY=39, REPAIR=1, STANDBY=2851, SUMMON=13, SUPPORT=122, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 4645 / 4645 条 APK 记录，展开项目动作 7545 个
- 终局状态：turn=38，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_132410_099.bin

- 状态：通过
- SHA256：`f65872ca3530cdae3433c1d7ab796fe08b6dbdd7f3bbda482ce808366eed079b`
- 地图：25x25，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=700，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：428 条，remaining=0，事件=ATTACK=88, HEAL=6, NEXT_TURN=36, NONE=78, OCCUPY=45, STANDBY=159, SUMMON=4, SUPPORT=10, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 428 / 428 条 APK 记录，展开项目动作 708 个
- 终局状态：turn=7，currentPlayer=2，winner=4
- 首个问题：无

### game_get_20260704_132412_100.bin

- 状态：通过
- SHA256：`723d92bcfc5c51a426424aebfc12974e1f00f1e6c768197c2ba3266fe39a19ee`
- 地图：25x25，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=700，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：344 条，remaining=0，事件=ATTACK=51, HEAL=2, NEXT_TURN=30, NONE=66, OCCUPY=41, STANDBY=143, SUMMON=2, SUPPORT=7, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 344 / 344 条 APK 记录，展开项目动作 567 个
- 终局状态：turn=6，currentPlayer=2，winner=4
- 首个问题：无

## 结论说明

- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。
- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。
- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。
- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。