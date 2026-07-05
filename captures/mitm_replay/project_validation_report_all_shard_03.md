# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-04T19:04:46.001Z
- 输入目录：`C:\code\AncinetEmpires\captures\mitm_replay`
- 规则模式：SD
- 抽样文件上限：全部
- 招募歧义处理：允许选第一个合法部署点继续
- 地形处理：未映射地形使用道路兜底并记录
- 文件数：20，唯一校验：20，重复跳过：0，通过：20，失败：0，解析错误：0

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
| game_get_20260704_131354_034.bin | fe56b1da2975 | 21x13, P[0,1,2,3,4,5] | 1105 | 通过 | 1105/1105 | - |
| game_get_20260704_131406_035.bin | f67ab981e561 | 21x21, P[0,1,2,3,4,5] | 3474 | 通过 | 3474/3474 | - |
| game_get_20260704_131408_036.bin | 2d00110ee597 | 21x13, P[0,1,2,3,4,5] | 420 | 通过 | 420/420 | - |
| game_get_20260704_131410_037.bin | 12a4c44de944 | 17x12, P[0,2,3,4] | 926 | 通过 | 926/926 | - |
| game_get_20260704_131412_038.bin | 3f238386c50e | 17x12, P[0,2,3,4] | 840 | 通过 | 840/840 | - |
| game_get_20260704_131421_039.bin | 544233d74082 | 21x21, P[0,1,2,3,4,5] | 2923 | 通过 | 2923/2923 | - |
| game_get_20260704_131425_040.bin | 89a01b2a2e97 | 13x19, P[0,1,2,3] | 1228 | 通过 | 1228/1228 | - |
| game_get_20260704_131454_041.bin | a0b823ff7921 | 13x19, P[0,1,2] | 660 | 通过 | 660/660 | - |
| game_get_20260704_131501_042.bin | 85f9f7d03e9d | 21x25, P[0,1,2,3,4,5] | 1708 | 通过 | 1708/1708 | - |
| game_get_20260704_131505_043.bin | 07173e5fe079 | 21x21, P[0,1,2,3,4,5] | 3187 | 通过 | 3187/3187 | - |
| game_get_20260704_131516_044.bin | 6c0f7adb9593 | 21x25, P[0,1,2,3,4,5] | 6476 | 通过 | 6476/6476 | - |
| game_get_20260704_131520_045.bin | 2e80d20bb8c9 | 21x21, P[0,1,2,3,4,5] | 455 | 通过 | 455/455 | - |
| game_get_20260704_131527_046.bin | fdd930816f17 | 21x21, P[0,1,2,3,4,5] | 2524 | 通过 | 2524/2524 | - |
| game_get_20260704_131533_047.bin | 8d6fb6d24278 | 13x19, P[0,1,2,3] | 849 | 通过 | 849/849 | - |
| game_get_20260704_131544_048.bin | 6a48ded5ed13 | 15x15, P[0,1,2,3,4,5] | 1928 | 通过 | 1928/1928 | - |
| game_get_20260704_131546_049.bin | 2cf4fc701197 | 25x21, P[0,1,2,3,4,5] | 228 | 通过 | 228/228 | - |
| game_get_20260704_131550_050.bin | ce00f36184c2 | 11x19, P[0,1,2,3,5] | 1493 | 通过 | 1493/1493 | - |
| game_get_20260704_131553_051.bin | ae7f357c5f36 | 21x25, P[0,1,2,3,4,5] | 748 | 通过 | 748/748 | - |
| game_get_20260704_131557_052.bin | 3098127ae0b0 | 17x12, P[0,2,3,4] | 875 | 通过 | 875/875 | - |
| game_get_20260704_131611_053.bin | ff19829e2243 | 25x17, P[0,1,2,3,4,5] | 3826 | 通过 | 3826/3826 | - |

## 明细

### game_get_20260704_131354_034.bin

- 状态：通过
- SHA256：`fe56b1da297510f8740621f80e69eedb567b4fc42908d4228267e64af44d03f7`
- 地图：21x13，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=70，levelCap=6
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1105 条，remaining=0，事件=ATTACK=237, HEAL=8, NEXT_TURN=75, NONE=129, OCCUPY=33, REPAIR=4, STANDBY=595, SUMMON=7, SUPPORT=15, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 1105 / 1105 条 APK 记录，展开项目动作 1718 个
- 终局状态：turn=15，currentPlayer=0，winner=6
- 首个问题：无

### game_get_20260704_131406_035.bin

- 状态：通过
- SHA256：`f67ab981e5617a520bfa662c6ecf05d045f517e926dfda170660cbb6f4d57501`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=8，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：3474 条，remaining=0，事件=ATTACK=1094, HEAL=132, NEXT_TURN=187, NONE=325, OCCUPY=34, STANDBY=1538, SUMMON=25, SUPPORT=139
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 3474 / 3474 条 APK 记录，展开项目动作 5486 个
- 终局状态：turn=32，currentPlayer=1，winner=-
- 首个问题：无

### game_get_20260704_131408_036.bin

- 状态：通过
- SHA256：`2d00110ee5974d88fbdea5dd37e8060b21a773cf055c79f5f73cfb1af4e57217`
- 地图：21x13，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：420 条，remaining=0，事件=ATTACK=117, HEAL=1, NEXT_TURN=40, NONE=73, OCCUPY=28, REPAIR=4, STANDBY=152, SUMMON=5
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 420 / 420 条 APK 记录，展开项目动作 671 个
- 终局状态：turn=7，currentPlayer=4，winner=-
- 首个问题：无

### game_get_20260704_131410_037.bin

- 状态：通过
- SHA256：`12a4c44de944904cdf62ec272c45d72e2f17aeb0a440b8e296326f6ea0a46121`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：926 条，remaining=0，事件=ATTACK=288, NEXT_TURN=95, NONE=89, OCCUPY=12, REPAIR=2, STANDBY=434, SUMMON=5, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 926 / 926 条 APK 记录，展开项目动作 1520 个
- 终局状态：turn=33，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_131412_038.bin

- 状态：通过
- SHA256：`3f238386c50e8b3f066a01a2cb46fc87d57be8a9b2d6c983ae9b590126ea61de`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：840 条，remaining=0，事件=ATTACK=275, NEXT_TURN=87, NONE=86, OCCUPY=15, REPAIR=2, STANDBY=372, SUMMON=2, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 840 / 840 条 APK 记录，展开项目动作 1391 个
- 终局状态：turn=31，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_131421_039.bin

- 状态：通过
- SHA256：`544233d74082486be6e146e9cc7cc17672f4a0ba80646a5d952540a1972c3ed9`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=10，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2923 条，remaining=0，事件=ATTACK=912, HEAL=71, NEXT_TURN=168, NONE=300, OCCUPY=34, STANDBY=1285, SUMMON=24, SUPPORT=129
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 2923 / 2923 条 APK 记录，展开项目动作 4747 个
- 终局状态：turn=29，currentPlayer=0，winner=-
- 首个问题：无

### game_get_20260704_131425_040.bin

- 状态：通过
- SHA256：`89a01b2a2e97312f141387b9763f6a2b54e5571a76bcc42e2282fc704e137564`
- 地图：13x19，玩家=[0,1,2,3]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1228 条，remaining=0，事件=ATTACK=401, NEXT_TURN=124, NONE=118, OCCUPY=8, STANDBY=565, SUMMON=11, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 1228 / 1228 条 APK 记录，展开项目动作 1896 个
- 终局状态：turn=42，currentPlayer=1，winner=-
- 首个问题：无

### game_get_20260704_131454_041.bin

- 状态：通过
- SHA256：`a0b823ff792100b6c5a257cd473398eec68bc0634c720f8c7db4767ae2cdb9f8`
- 地图：13x19，玩家=[0,1,2]，初始单位=3，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2]，initialGold=300，unitLimit=30，levelCap=3
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：660 条，remaining=0，事件=ATTACK=344, NEXT_TURN=83, NONE=79, OCCUPY=16, STANDBY=118, SUMMON=20
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 660 / 660 条 APK 记录，展开项目动作 1024 个
- 终局状态：turn=29，currentPlayer=1，winner=2
- 首个问题：无

### game_get_20260704_131501_042.bin

- 状态：通过
- SHA256：`85f9f7d03e9d3651c9740b7b22f3f63f2870d9d7fbee714adb78cc357f3583a0`
- 地图：21x25，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=700，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1708 条，remaining=0，事件=ATTACK=659, HEAL=32, NEXT_TURN=125, NONE=187, OCCUPY=65, REPAIR=1, STANDBY=560, SUMMON=36, SUPPORT=42, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 1708 / 1708 条 APK 记录，展开项目动作 2950 个
- 终局状态：turn=25，currentPlayer=0，winner=1
- 首个问题：无

### game_get_20260704_131505_043.bin

- 状态：通过
- SHA256：`07173e5fe07924be14987ef50cd67c8aac7996392a79519e7d406d96250eb642`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：3187 条，remaining=0，事件=ATTACK=856, HEAL=74, NEXT_TURN=168, NONE=282, OCCUPY=34, STANDBY=1660, SUMMON=13, SUPPORT=98, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 3187 / 3187 条 APK 记录，展开项目动作 5145 个
- 终局状态：turn=29，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_131516_044.bin

- 状态：通过
- SHA256：`6c0f7adb95931e5ba5ef625fd8c1f0e91fb0d82ac7845e849a4a3bc2610d3e89`
- 地图：21x25，玩家=[0,1,2,3,4,5]，初始单位=157，推荐金币=2000
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=2000，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：6476 条，remaining=0，事件=ATTACK=1662, HEAL=450, NEXT_TURN=179, NONE=492, OCCUPY=128, REPAIR=10, STANDBY=3308, SUMMON=96, SUPPORT=150, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 6476 / 6476 条 APK 记录，展开项目动作 11047 个
- 终局状态：turn=31，currentPlayer=2，winner=1
- 首个问题：无

### game_get_20260704_131520_045.bin

- 状态：通过
- SHA256：`2e80d20bb8c915bd2ef8eb4d98b1e7b7d38b49857b41c9fd9e796427fe70c169`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=10，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：455 条，remaining=0，事件=ATTACK=44, NEXT_TURN=43, NONE=70, OCCUPY=34, STANDBY=239, SUMMON=1, SUPPORT=24
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 455 / 455 条 APK 记录，展开项目动作 764 个
- 终局状态：turn=8，currentPlayer=1，winner=-
- 首个问题：无

### game_get_20260704_131527_046.bin

- 状态：通过
- SHA256：`fdd930816f175bac6da1bc95e7ebf5deba19f3e64152c2725944dff42fd8bef5`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=8，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2524 条，remaining=0，事件=ATTACK=730, HEAL=49, NEXT_TURN=144, NONE=237, OCCUPY=38, STANDBY=1236, SUMMON=9, SUPPORT=81
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 2524 / 2524 条 APK 记录，展开项目动作 3989 个
- 终局状态：turn=25，currentPlayer=0，winner=-
- 首个问题：无

### game_get_20260704_131533_047.bin

- 状态：通过
- SHA256：`8d6fb6d24278b5f1ecc55fbd5c88ba838d29dca835b1608d5748423c68c123f6`
- 地图：13x19，玩家=[0,1,2,3]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：849 条，remaining=0，事件=ATTACK=307, NEXT_TURN=134, NONE=99, OCCUPY=14, STANDBY=294, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 849 / 849 条 APK 记录，展开项目动作 1256 个
- 终局状态：turn=49，currentPlayer=2，winner=3
- 首个问题：无

### game_get_20260704_131544_048.bin

- 状态：通过
- SHA256：`6a48ded5ed13b5b4366b1399b2346d9d5eeccea609f48de4199fd52366f3c8e9`
- 地图：15x15，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=90，levelCap=8
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1928 条，remaining=0，事件=ATTACK=685, HEAL=29, NEXT_TURN=158, NONE=204, OCCUPY=25, REPAIR=8, STANDBY=793, SUMMON=11, SUPPORT=15
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 1928 / 1928 条 APK 记录，展开项目动作 3078 个
- 终局状态：turn=28，currentPlayer=1，winner=1
- 首个问题：无

### game_get_20260704_131546_049.bin

- 状态：通过
- SHA256：`2cf4fc701197769efbdf0bc135ccaa8357d9449922200810e5562e288c9953dd`
- 地图：25x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=700，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：228 条，remaining=0，事件=ATTACK=17, NEXT_TURN=23, NONE=45, OCCUPY=29, STANDBY=108, SUMMON=1, SUPPORT=3, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 228 / 228 条 APK 记录，展开项目动作 383 个
- 终局状态：turn=5，currentPlayer=2，winner=4
- 首个问题：无

### game_get_20260704_131550_050.bin

- 状态：通过
- SHA256：`ce00f36184c219c2f82dddc06cf7b606c34883785c6499a122dc398770b03ecf`
- 地图：11x19，玩家=[0,1,2,3,5]，初始单位=5，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1493 条，remaining=0，事件=ATTACK=382, HEAL=25, NEXT_TURN=145, NONE=106, OCCUPY=12, REPAIR=4, STANDBY=811, SUMMON=7, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 1493 / 1493 条 APK 记录，展开项目动作 2297 个
- 终局状态：turn=40，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_131553_051.bin

- 状态：通过
- SHA256：`ae7f357c5f3672c4037aa0c5940dc871473cadf4db273505d6062a31a9df83bc`
- 地图：21x25，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=700，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：748 条，remaining=0，事件=ATTACK=216, HEAL=11, NEXT_TURN=66, NONE=97, OCCUPY=33, STANDBY=291, SUMMON=10, SUPPORT=22, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 748 / 748 条 APK 记录，展开项目动作 1265 个
- 终局状态：turn=12，currentPlayer=2，winner=4
- 首个问题：无

### game_get_20260704_131557_052.bin

- 状态：通过
- SHA256：`3098127ae0b0276d66a4d39299990e2a3a2505aab32105e271330ce9d59742a7`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：875 条，remaining=0，事件=ATTACK=297, NEXT_TURN=86, NONE=85, OCCUPY=12, REPAIR=2, STANDBY=389, SUMMON=3, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 875 / 875 条 APK 记录，展开项目动作 1478 个
- 终局状态：turn=31，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_131611_053.bin

- 状态：通过
- SHA256：`ff19829e224309967f17723707ee41da961fc610066c79ca264960018aaa877f`
- 地图：25x17，玩家=[0,1,2,3,4,5]，初始单位=10，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=600，unitLimit=80，levelCap=8
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：3826 条，remaining=0，事件=ATTACK=1441, HEAL=45, NEXT_TURN=191, NONE=399, OCCUPY=115, REPAIR=30, STANDBY=1487, SUMMON=46, SUPPORT=72
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 3826 / 3826 条 APK 记录，展开项目动作 6540 个
- 终局状态：turn=36，currentPlayer=0，winner=1
- 首个问题：无

## 结论说明

- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。
- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。
- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。
- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。