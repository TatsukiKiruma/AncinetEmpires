# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-04T19:01:28.642Z
- 输入目录：`C:\code\AncinetEmpires\captures\mitm_replay`
- 规则模式：SD
- 抽样文件上限：全部
- 招募歧义处理：允许选第一个合法部署点继续
- 地形处理：未映射地形使用道路兜底并记录
- 文件数：20，唯一校验：20，重复跳过：0，通过：19，失败：1，解析错误：0

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
| game_get_20260704_131614_054.bin | fee0fbc4bb4c | 15x12, P[0,1,2,3] | 1212 | 通过 | 1212/1212 | - |
| game_get_20260704_131619_055.bin | d31cedae1332 | 17x12, P[0,2,3,4] | 874 | 通过 | 874/874 | - |
| game_get_20260704_131621_056.bin | 3f59fff3dd1d | 21x13, P[0,1,2,3,4,5] | 326 | 通过 | 326/326 | - |
| game_get_20260704_131627_057.bin | c3fa6b30880d | 21x21, P[0,1,2,3,4,5] | 1154 | 通过 | 1154/1154 | - |
| game_get_20260704_131630_058.bin | 33c0730721eb | 21x21, P[0,1,2,3,4,5] | 984 | 通过 | 984/984 | - |
| game_get_20260704_131634_059.bin | 81ca1179d3a4 | 15x12, P[0,1,2,3] | 1580 | 通过 | 1580/1580 | - |
| game_get_20260704_131641_060.bin | b33c5c245055 | 17x12, P[0,2,3,4] | 744 | 通过 | 744/744 | - |
| game_get_20260704_131946_061.bin | 7b290a83da36 | 21x21, P[0,1,2,3,4,5] | 6887 | 通过 | 6887/6887 | - |
| game_get_20260704_131949_062.bin | 5236a3848a31 | 25x21, P[0,1,2,3,4,5] | 416 | 通过 | 416/416 | - |
| game_get_20260704_132000_063.bin | b3aded7d5ded | 21x21, P[0,1,2,3,4,5] | 2804 | 通过 | 2804/2804 | - |
| game_get_20260704_132004_064.bin | 9e154cfaa4f9 | 11x19, P[0,1,2,3,5] | 1385 | 通过 | 1385/1385 | - |
| game_get_20260704_132008_065.bin | 1269141a5313 | 13x13, P[4,1,0,5,2,3] | 1182 | 失败 | 37/1182 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_132011_066.bin | 2b1581930ede | 17x12, P[0,2,3,4] | 782 | 通过 | 782/782 | - |
| game_get_20260704_132013_067.bin | e84f62fe505c | 9x13, P[0,1,2,3,5] | 721 | 通过 | 721/721 | - |
| game_get_20260704_132016_068.bin | 6a814640aada | 21x25, P[0,1,2,3,4,5] | 6 | 通过 | 6/6 | - |
| game_get_20260704_132017_069.bin | fc00b51de957 | 25x21, P[0,1,2,3,4,5] | 49 | 通过 | 49/49 | - |
| game_get_20260704_132019_070.bin | f21cd5b527a9 | 25x25, P[0,1,2,3,4,5] | 2 | 通过 | 2/2 | - |
| game_get_20260704_132021_071.bin | e7b1f6f047ef | 9x13, P[0,1,2,3,5] | 849 | 通过 | 849/849 | - |
| game_get_20260704_132024_072.bin | 5319a42c7cc1 | 13x13, P[4,1,0,5,2,3] | 1027 | 通过 | 1027/1027 | - |
| game_get_20260704_132027_073.bin | 1741789b010b | 9x13, P[0,1,2,3,5] | 710 | 通过 | 710/710 | - |

## 明细

### game_get_20260704_131614_054.bin

- 状态：通过
- SHA256：`fee0fbc4bb4c11e379e9e72d77283f4ab719748c4ae78cfa9da6fe7847e88559`
- 地图：15x12，玩家=[0,1,2,3]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1212 条，remaining=0，事件=ATTACK=336, HEAL=35, NEXT_TURN=144, NONE=105, OCCUPY=20, REPAIR=3, STANDBY=534, SUMMON=4, SUPPORT=30, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 1212 / 1212 条 APK 记录，展开项目动作 1854 个
- 终局状态：turn=56，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_131619_055.bin

- 状态：通过
- SHA256：`d31cedae1332d3fe109e98ab8b55d01ae24a6a865cfa382793396ef5d7551e7a`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：874 条，remaining=0，事件=ATTACK=238, NEXT_TURN=87, NONE=86, OCCUPY=15, REPAIR=2, STANDBY=444, SUMMON=1, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 874 / 874 条 APK 记录，展开项目动作 1448 个
- 终局状态：turn=31，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_131621_056.bin

- 状态：通过
- SHA256：`3f59fff3dd1dbf644b2309e98b8c57bb1088500ff92e102a06fd1858e9d6ae92`
- 地图：21x13，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：326 条，remaining=0，事件=ATTACK=62, HEAL=1, NEXT_TURN=33, NONE=60, OCCUPY=31, REPAIR=4, STANDBY=133, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 326 / 326 条 APK 记录，展开项目动作 519 个
- 终局状态：turn=7，currentPlayer=0，winner=6
- 首个问题：无

### game_get_20260704_131627_057.bin

- 状态：通过
- SHA256：`c3fa6b30880d065cf36034b19079bdd846e67a9b92c5d6b6d4037d3f36da0961`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=8，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1154 条，remaining=0，事件=ATTACK=245, HEAL=17, NEXT_TURN=79, NONE=136, OCCUPY=36, STANDBY=594, SUMMON=4, SUPPORT=43
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 1154 / 1154 条 APK 记录，展开项目动作 1901 个
- 终局状态：turn=14，currentPlayer=1，winner=-
- 首个问题：无

### game_get_20260704_131630_058.bin

- 状态：通过
- SHA256：`33c0730721ebf6df2e233d6b764c482bf84780005e13d33937ae921dfc06037f`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=8，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：984 条，remaining=0，事件=ATTACK=192, HEAL=28, NEXT_TURN=72, NONE=118, OCCUPY=34, STANDBY=498, SUMMON=7, SUPPORT=35
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 984 / 984 条 APK 记录，展开项目动作 1675 个
- 终局状态：turn=13，currentPlayer=0，winner=-
- 首个问题：无

### game_get_20260704_131634_059.bin

- 状态：通过
- SHA256：`81ca1179d3a4e5a995773c8e989f1f2f4e026c40453c2e4cc006bdf2d33026cc`
- 地图：15x12，玩家=[0,1,2,3]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1580 条，remaining=0，事件=ATTACK=431, HEAL=40, NEXT_TURN=141, NONE=131, OCCUPY=18, REPAIR=3, STANDBY=763, SUMMON=12, SUPPORT=40, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 1580 / 1580 条 APK 记录，展开项目动作 2399 个
- 终局状态：turn=49，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_131641_060.bin

- 状态：通过
- SHA256：`b33c5c2450555d841e27fa7e0e65a7a560d636484f6d1b3f35a1323f0ae5f3d3`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：744 条，remaining=0，事件=ATTACK=231, NEXT_TURN=83, NONE=82, OCCUPY=13, REPAIR=2, STANDBY=330, SUMMON=2, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 744 / 744 条 APK 记录，展开项目动作 1249 个
- 终局状态：turn=30，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_131946_061.bin

- 状态：通过
- SHA256：`7b290a83da36e26b7f81947a79f398cad86fbcd5c6ad941eab2e4ca23698f068`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：6887 条，remaining=0，事件=ATTACK=1031, HEAL=583, NEXT_TURN=288, NONE=413, OCCUPY=46, STANDBY=4341, SUMMON=15, SUPPORT=170
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 6887 / 6887 条 APK 记录，展开项目动作 10835 个
- 终局状态：turn=49，currentPlayer=0，winner=-
- 首个问题：无

### game_get_20260704_131949_062.bin

- 状态：通过
- SHA256：`5236a3848a3189ee7148196376a0658bdc6b439a38d88288d95709b381df32d0`
- 地图：25x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=700，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：416 条，remaining=0，事件=ATTACK=65, HEAL=2, NEXT_TURN=36, NONE=69, OCCUPY=29, STANDBY=194, SUMMON=6, SUPPORT=13, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 416 / 416 条 APK 记录，展开项目动作 690 个
- 终局状态：turn=7，currentPlayer=2，winner=4
- 首个问题：无

### game_get_20260704_132000_063.bin

- 状态：通过
- SHA256：`b3aded7d5ded0f236ee6ea1ae7bab8060ea68e7008260df8f4628a02e35f16d3`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2804 条，remaining=0，事件=ATTACK=707, HEAL=67, NEXT_TURN=145, NONE=238, OCCUPY=34, STANDBY=1509, SUMMON=10, SUPPORT=94
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 2804 / 2804 条 APK 记录，展开项目动作 4292 个
- 终局状态：turn=25，currentPlayer=1，winner=-
- 首个问题：无

### game_get_20260704_132004_064.bin

- 状态：通过
- SHA256：`9e154cfaa4f9531a50dcc7b9f463965b9fbdffea1d696f5db5d69dc93d82bfbb`
- 地图：11x19，玩家=[0,1,2,3,5]，初始单位=5，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1385 条，remaining=0，事件=ATTACK=347, HEAL=28, NEXT_TURN=146, NONE=115, OCCUPY=10, REPAIR=4, STANDBY=733, SUMMON=1, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 1385 / 1385 条 APK 记录，展开项目动作 2194 个
- 终局状态：turn=40，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_132008_065.bin

- 状态：失败
- SHA256：`1269141a53135f4db64bcb35e1a8490431708306fd26a33e0a287f28a2361856`
- 地图：13x13，玩家=[4,1,0,5,2,3]，初始单位=10，推荐金币=250
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=0，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1182 条，remaining=0，事件=ATTACK=396, HEAL=37, NEXT_TURN=87, NONE=168, OCCUPY=22, REPAIR=6, STANDBY=399, SUMMON=26, SUPPORT=40, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 37 / 1182 条 APK 记录，展开项目动作 55 个
- 终局状态：turn=2，currentPlayer=1，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=ATTACK，source=(10,7)，move=(9,8)，target=(9,5)，recruitId=-1
- 问题位置：record=37, turn=2, currentPlayer=1, legalActions=44
- 项目动作：`attack:u_11:apk_remote_u1`
- 引擎信息：非法动作：当前玩家无法执行该动作

### game_get_20260704_132011_066.bin

- 状态：通过
- SHA256：`2b1581930ede32c0ace4fc23ca5158b660e9afa97c6eedd5ee5635ffa3a76460`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：782 条，remaining=0，事件=ATTACK=225, NEXT_TURN=83, NONE=79, OCCUPY=16, REPAIR=2, STANDBY=373, SUMMON=3, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 782 / 782 条 APK 记录，展开项目动作 1296 个
- 终局状态：turn=30，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_132013_067.bin

- 状态：通过
- SHA256：`e84f62fe505cc76d693f801babdd016a66d8e21607e47ea00e1483ce2021d0c2`
- 地图：9x13，玩家=[0,1,2,3,5]，初始单位=5，推荐金币=200
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,5]，initialGold=200，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：721 条，remaining=0，事件=ATTACK=322, HEAL=31, NEXT_TURN=66, NONE=92, OCCUPY=27, STANDBY=151, SUMMON=20, SUPPORT=11, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 721 / 721 条 APK 记录，展开项目动作 1134 个
- 终局状态：turn=14，currentPlayer=5，winner=6
- 首个问题：无

### game_get_20260704_132016_068.bin

- 状态：通过
- SHA256：`6a814640aadafb7f2816ec21cfbda084ce9a674c25f3563f8c368a6fbc71f346`
- 地图：21x25，玩家=[0,1,2,3,4,5]，初始单位=0，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=700，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：6 条，remaining=0，事件=NONE=2, OCCUPY=2, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 6 / 6 条 APK 记录，展开项目动作 8 个
- 终局状态：turn=1，currentPlayer=2，winner=4
- 首个问题：无

### game_get_20260704_132017_069.bin

- 状态：通过
- SHA256：`fc00b51de957581ba002a0a5176805877930a0c9461e3e8ae10a9d4873c2057b`
- 地图：25x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=700，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：49 条，remaining=0，事件=NEXT_TURN=5, NONE=18, OCCUPY=17, STANDBY=6, SUPPORT=1, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 49 / 49 条 APK 记录，展开项目动作 73 个
- 终局状态：turn=2，currentPlayer=2，winner=4
- 首个问题：无

### game_get_20260704_132019_070.bin

- 状态：通过
- SHA256：`f21cd5b527a9ff167ef62d0bb5229228514eba31bdeee2a91b76852ddb543e87`
- 地图：25x25，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=1300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=700，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2 条，remaining=0，事件=SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 2 / 2 条 APK 记录，展开项目动作 2 个
- 终局状态：turn=1，currentPlayer=2，winner=4
- 首个问题：无

### game_get_20260704_132021_071.bin

- 状态：通过
- SHA256：`e7b1f6f047ef7f50e1f468be97fd4539a7b45af39c603d211341a87a3a67121e`
- 地图：9x13，玩家=[0,1,2,3,5]，初始单位=5，推荐金币=200
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,5]，initialGold=200，unitLimit=80，levelCap=8
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：849 条，remaining=0，事件=ATTACK=374, HEAL=21, NEXT_TURN=77, NONE=106, OCCUPY=28, STANDBY=216, SUMMON=18, SUPPORT=8, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 849 / 849 条 APK 记录，展开项目动作 1316 个
- 终局状态：turn=17，currentPlayer=3，winner=6
- 首个问题：无

### game_get_20260704_132024_072.bin

- 状态：通过
- SHA256：`5319a42c7cc16dc202fe3ce351014fbc37e30d5e5d22b743b493a68f4150bf91`
- 地图：13x13，玩家=[4,1,0,5,2,3]，初始单位=10，推荐金币=250
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=250，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1027 条，remaining=0，事件=ATTACK=372, HEAL=19, NEXT_TURN=117, NONE=129, OCCUPY=17, REPAIR=6, STANDBY=366, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 1027 / 1027 条 APK 记录，展开项目动作 1769 个
- 终局状态：turn=21，currentPlayer=0，winner=1
- 首个问题：无

### game_get_20260704_132027_073.bin

- 状态：通过
- SHA256：`1741789b010b706c89f94a4166e8c7e41d6405a699fe53015e22b0118c50e930`
- 地图：9x13，玩家=[0,1,2,3,5]，初始单位=5，推荐金币=200
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,5]，initialGold=200，unitLimit=50，levelCap=5
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：710 条，remaining=0，事件=ATTACK=294, HEAL=25, NEXT_TURN=64, NONE=92, OCCUPY=28, STANDBY=174, SUMMON=22, SUPPORT=10, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 710 / 710 条 APK 记录，展开项目动作 1103 个
- 终局状态：turn=14，currentPlayer=3，winner=6
- 首个问题：无

## 结论说明

- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。
- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。
- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。
- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。