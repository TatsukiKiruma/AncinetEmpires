# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-05T04:59:35.701Z
- 输入目录：`C:\code\AncinetEmpires\captures`
- 规则模式：SD
- 抽样跳过文件数：0
- 抽样文件上限：全部
- 唯一回放跳过数：80
- 唯一回放上限：20
- 招募歧义处理：允许选第一个合法部署点继续
- APK 强制执行：关闭，严格要求项目合法动作
- 地形处理：未映射地形使用道路兜底并记录
- 文件数：20，唯一校验：20，重复跳过：0，通过：19，失败：1，解析错误：0

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
| game_get_20260704_132101_081.bin | 8585960f19d7 | 17x12, P[0,2,3,4] | 372 | 通过 | 372/372 | - |
| game_get_20260704_132103_082.bin | 7e21d3c66796 | 17x12, P[0,2,3,4] | 716 | 通过 | 716/716 | - |
| game_get_20260704_132113_083.bin | ae698fd18822 | 21x21, P[0,1,2,3,4,5] | 3137 | 通过 | 3137/3137 | - |
| game_get_20260704_132124_084.bin | 06b265cbfc85 | 21x21, P[0,1,2,3,4,5] | 2995 | 通过 | 2995/2995 | - |
| game_get_20260704_132153_085.bin | 38c4c4b2aea8 | 21x21, P[0,1,2,3,4,5] | 4039 | 通过 | 4039/4039 | - |
| game_get_20260704_132156_086.bin | 0739c244c5ca | 15x15, P[0,1,2,3,4,5] | 1450 | 通过 | 1450/1450 | - |
| game_get_20260704_132201_087.bin | 3926858bd35a | 17x12, P[0,2,3,4] | 714 | 通过 | 714/714 | - |
| game_get_20260704_132207_088.bin | d59bd75aeb12 | 9x11, P[1,3] | 159 | 通过 | 159/159 | - |
| game_get_20260704_132232_089.bin | b9eb0c06ceca | 21x21, P[0,1,2,3,4,5] | 5675 | 通过 | 5675/5675 | - |
| game_get_20260704_132246_090.bin | d04de69792ee | 21x21, P[0,1,2,3,4,5] | 4478 | 通过 | 4478/4478 | - |
| game_get_20260704_132248_091.bin | d1fdb97ed4ee | 21x13, P[0,1,2,3,4,5] | 2028 | 通过 | 2028/2028 | - |
| game_get_20260704_132307_092.bin | f5d90b7debee | 21x21, P[0,1,2,3,4,5] | 3470 | 通过 | 3470/3470 | - |
| game_get_20260704_132309_093.bin | 0f5d717f86a4 | 21x21, P[0,1,2,3,4,5] | 764 | 通过 | 764/764 | - |
| game_get_20260704_132315_094.bin | 72d837b6333a | 17x12, P[0,2,3,4] | 819 | 通过 | 819/819 | - |
| game_get_20260704_132325_095.bin | 36b18d37f221 | 21x21, P[0,1,2,3,4,5] | 662 | 通过 | 662/662 | - |
| game_get_20260704_132329_096.bin | ded2b35e1078 | 21x21, P[0,1,2,3,4,5] | 548 | 通过 | 548/548 | - |
| game_get_20260704_132339_097.bin | 5619d6a85c7d | 25x25, P[0,1,2,3,4,5] | 3221 | 失败 | 3008/3221 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_132403_098.bin | 3f3903b3f828 | 21x21, P[0,1,2,3,4,5] | 4645 | 通过 | 4645/4645 | - |
| game_get_20260704_132410_099.bin | f65872ca3530 | 25x25, P[0,1,2,3,4,5] | 428 | 通过 | 428/428 | - |
| game_get_20260704_132412_100.bin | 723d92bcfc5c | 25x25, P[0,1,2,3,4,5] | 344 | 通过 | 344/344 | - |

## 明细

### game_get_20260704_132101_081.bin

- 状态：通过
- SHA256：`8585960f19d7f4df3d86bb38c8650fba89f609f2f136f56c426629f4c414328e`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：372 条，remaining=0，事件=ATTACK=90, NEXT_TURN=38, NONE=45, OCCUPY=7, REPAIR=2, STANDBY=187, SUMMON=2, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 372 / 372 条 APK 记录，展开项目动作 623 个
- 终局状态：turn=13，currentPlayer=3，winner=-
- 首个问题：无

### game_get_20260704_132103_082.bin

- 状态：通过
- SHA256：`7e21d3c6679637d8f3005b0aeba236d4f3387c2cc45ac1e29879a4fac1bd095c`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：716 条，remaining=0，事件=ATTACK=223, NEXT_TURN=78, NONE=76, OCCUPY=13, REPAIR=2, STANDBY=319, SUMMON=4, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 716 / 716 条 APK 记录，展开项目动作 1203 个
- 终局状态：turn=28，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_132113_083.bin

- 状态：通过
- SHA256：`ae698fd18822b2b62f3b4366d549fcfce2c171cb3e181e8c929999a920078801`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：3137 条，remaining=0，事件=ATTACK=769, HEAL=170, NEXT_TURN=162, NONE=268, OCCUPY=35, REPAIR=1, STANDBY=1632, SUMMON=12, SUPPORT=86, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 3137 / 3137 条 APK 记录，展开项目动作 5069 个
- 终局状态：turn=28，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_132124_084.bin

- 状态：通过
- SHA256：`06b265cbfc8583510f9e1d75431f351e7f479e356ccbd3d8be99c635179a75b2`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=12，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2995 条，remaining=0，事件=ATTACK=854, HEAL=104, NEXT_TURN=169, NONE=316, OCCUPY=34, STANDBY=1368, SUMMON=23, SUPPORT=127
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 2995 / 2995 条 APK 记录，展开项目动作 4972 个
- 终局状态：turn=29，currentPlayer=1，winner=-
- 首个问题：无

### game_get_20260704_132153_085.bin

- 状态：通过
- SHA256：`38c4c4b2aea8d154f3b9ce0c0b114d7035a12e5643ec065d7c2a03a8e9cef78b`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=12，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：4039 条，remaining=0，事件=ATTACK=1238, HEAL=112, NEXT_TURN=204, NONE=432, OCCUPY=34, STANDBY=1830, SUMMON=25, SUPPORT=164
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 4039 / 4039 条 APK 记录，展开项目动作 6597 个
- 终局状态：turn=35，currentPlayer=0，winner=-
- 首个问题：无

### game_get_20260704_132156_086.bin

- 状态：通过
- SHA256：`0739c244c5cac78d04decf9c2c5843ff4de2f91d25f8954bea3f1cc404a8d031`
- 地图：15x15，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=70，levelCap=7
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1450 条，remaining=0，事件=ATTACK=555, HEAL=10, NEXT_TURN=127, NONE=164, OCCUPY=27, REPAIR=8, STANDBY=521, SUMMON=28, SUPPORT=10
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 1450 / 1450 条 APK 记录，展开项目动作 2349 个
- 终局状态：turn=23，currentPlayer=0，winner=1
- 首个问题：无

### game_get_20260704_132201_087.bin

- 状态：通过
- SHA256：`3926858bd35aacb3a4ace62a3f9b8b62ee51d2c6416bc899c3181a9d66e7f0b0`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：714 条，remaining=0，事件=ATTACK=220, NEXT_TURN=79, NONE=75, OCCUPY=13, REPAIR=2, STANDBY=324, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 714 / 714 条 APK 记录，展开项目动作 1174 个
- 终局状态：turn=28，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_132207_088.bin

- 状态：通过
- SHA256：`d59bd75aeb125231860b9aa57518bb58cf3b97c4821887c81548e9908dfd1e4b`
- 地图：9x11，玩家=[1,3]，初始单位=2，推荐金币=250
- 项目开局：currentPlayer=1，activeTeams=[1,3]，initialGold=250，unitLimit=30，levelCap=3
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：159 条，remaining=0，事件=ATTACK=51, NEXT_TURN=19, NONE=26, OCCUPY=19, REPAIR=3, STANDBY=37, SUMMON=3, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 159 / 159 条 APK 记录，展开项目动作 264 个
- 终局状态：turn=11，currentPlayer=1，winner=1
- 首个问题：无

### game_get_20260704_132232_089.bin

- 状态：通过
- SHA256：`b9eb0c06ceca1a34c4653096b06a6c111c1db926709f2bc1a7537095f300e525`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：5675 条，remaining=0，事件=ATTACK=1432, HEAL=203, NEXT_TURN=300, NONE=512, OCCUPY=34, STANDBY=2965, SUMMON=48, SUPPORT=179, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 5675 / 5675 条 APK 记录，展开项目动作 9386 个
- 终局状态：turn=51，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_132246_090.bin

- 状态：通过
- SHA256：`d04de69792eeac987bdb4c9714ab7ca6887ca6e4c6fd62d983031f6e005ff5e8`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：4478 条，remaining=0，事件=ATTACK=1119, HEAL=243, NEXT_TURN=246, NONE=396, OCCUPY=34, STANDBY=2253, SUMMON=36, SUPPORT=149, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 4478 / 4478 条 APK 记录，展开项目动作 7405 个
- 终局状态：turn=42，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_132248_091.bin

- 状态：通过
- SHA256：`d1fdb97ed4ee48a3578c4d8fe89a373a2f621a1dd245a1a0c5d43c7f3a0041e6`
- 地图：21x13，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2028 条，remaining=0，事件=ATTACK=838, HEAL=42, NEXT_TURN=133, NONE=197, OCCUPY=44, REPAIR=4, STANDBY=692, SUMMON=50, SUPPORT=28
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 2028 / 2028 条 APK 记录，展开项目动作 3217 个
- 终局状态：turn=23，currentPlayer=5，winner=1
- 首个问题：无

### game_get_20260704_132307_092.bin

- 状态：通过
- SHA256：`f5d90b7debee52db2bd93a279cd7ee1aeb762e747d9a9261fff66f9d1f8e1aef`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=10，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：3470 条，remaining=0，事件=ATTACK=1076, HEAL=111, NEXT_TURN=192, NONE=334, OCCUPY=34, STANDBY=1549, SUMMON=21, SUPPORT=153
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 3470 / 3470 条 APK 记录，展开项目动作 5581 个
- 终局状态：turn=33，currentPlayer=0，winner=-
- 首个问题：无

### game_get_20260704_132309_093.bin

- 状态：通过
- SHA256：`0f5d717f86a4ee463cc9d061dadc15839209fd93bb40b4f01a8ddd9d8fb055e2`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：764 条，remaining=0，事件=ATTACK=116, HEAL=19, NEXT_TURN=60, NONE=102, OCCUPY=34, STANDBY=408, SUMMON=2, SUPPORT=23
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 764 / 764 条 APK 记录，展开项目动作 1320 个
- 终局状态：turn=11，currentPlayer=0，winner=-
- 首个问题：无

### game_get_20260704_132315_094.bin

- 状态：通过
- SHA256：`72d837b6333af898e4f1efe77318a3f5aafa4edeaa78d7d229826b86d64accac`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
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
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
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
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
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
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：3221 条，remaining=0，事件=ATTACK=982, HEAL=58, NEXT_TURN=240, NONE=366, OCCUPY=111, STANDBY=1332, SUMMON=44, SUPPORT=87, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 3008 / 3221 条 APK 记录，展开项目动作 5256 个
- 终局状态：turn=46，currentPlayer=0，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- 分歧分类：strict 目的格被项目状态占用（strict_move_destination_occupied）：APK 记录要求移动到 (5,2)；但项目状态中该格被 u_374/soldier/P4 占用；hp=6/100；terrainId=9, owner=4, apkTerrainId=36, apkKind=4, apkIsLand=true, apkMoveCost=1
- APK 记录：event=OCCUPY，source=(5,5)，move=(5,2)，target=-，recruitId=-1
- 问题位置：record=3008, turn=46, currentPlayer=0, legalActions=881
- 项目动作：`move:u_267:5,2`
- 失败诊断：actor=u_267/mermaid/P0@(5,5) hp=100/100 lv=0 exp=60 range=1-2 status=none；target=-；move占位=u_374/soldier/P4@(5,2) hp=6/100 lv=0 exp=30 range=1-1 status=none；move地形=terrain=9 owner=4 apkTerrainId=36 apkKind=4 apkIsLand=true apkMoveCost=1；sourceTargetDist=-；moveTargetDist=-
- 引擎信息：非法动作：当前玩家无法执行该动作

### game_get_20260704_132403_098.bin

- 状态：通过
- SHA256：`3f3903b3f8289fc922095b3482af36afc7cb00281e659d45b69a8e3933decf6b`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
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
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
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
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
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