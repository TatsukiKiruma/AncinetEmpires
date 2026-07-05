# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-04T08:45:26.485Z
- 输入目录：`C:\code\AncinetEmpires\captures\mitm_replay\20260704_131004`
- 规则模式：SD
- 抽样文件上限：30
- 招募歧义处理：允许选第一个合法部署点继续
- 地形处理：未映射地形使用道路兜底并记录
- 文件数：30，唯一校验：30，重复跳过：0，通过：16，失败：14，解析错误：0

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
| game_get_20260704_131018_001.bin | 0e1dd9c4c506 | 17x12, P[0,2,3,4] | 1028 | 通过 | 1028/1028 | - |
| game_get_20260704_131048_002.bin | 31b6ac6e56fb | 21x21, P[0,1,2,3,4,5] | 6932 | 失败 | 857/6932 | 找不到召唤目标墓碑: (19, 17) |
| game_get_20260704_131052_003.bin | bf67e73547fc | 15x12, P[0,1,2,3] | 1049 | 通过 | 1049/1049 | - |
| game_get_20260704_131100_004.bin | 8731fe932b23 | 18x19, P[0,1,2,3,4,5] | 1839 | 失败 | 875/1839 | 找不到攻击目标单位: (13, 17) |
| game_get_20260704_131113_005.bin | 8917e542b931 | 17x12, P[0,2,3,4] | 928 | 通过 | 928/928 | - |
| game_get_20260704_131118_006.bin | 7a0dda589803 | 21x13, P[0,1,2,3,4,5] | 1622 | 失败 | 971/1622 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_131123_007.bin | 205dd6b03de1 | 17x12, P[0,2,3,4] | 52 | 通过 | 52/52 | - |
| game_get_20260704_131130_008.bin | a706d70a4e6e | 21x21, P[0,1,2,3,4,5] | 1065 | 通过 | 1065/1065 | - |
| game_get_20260704_131132_009.bin | 55d597d21443 | 21x21, P[0,1,2,3,4,5] | 1652 | 通过 | 1652/1652 | - |
| game_get_20260704_131135_010.bin | c1e6247384bb | 17x12, P[0,2,3,4] | 785 | 通过 | 785/785 | - |
| game_get_20260704_131141_011.bin | e99b550fbb09 | 21x21, P[0,1,2,3,4,5] | 1297 | 失败 | 910/1297 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_131143_012.bin | ab67b766355c | 21x21, P[0,1,2,3,4,5] | 545 | 通过 | 545/545 | - |
| game_get_20260704_131146_013.bin | 59e88482f04e | 21x13, P[0,1,2,3,4,5] | 337 | 通过 | 337/337 | - |
| game_get_20260704_131151_014.bin | c3358fb41a8d | 21x13, P[0,1,2,3,4,5] | 502 | 通过 | 502/502 | - |
| game_get_20260704_131157_015.bin | 235b2c26b3f4 | 12x12, P[0,1,2,3,4,5] | 232 | 通过 | 232/232 | - |
| game_get_20260704_131211_016.bin | a0aa3f4c9007 | 21x21, P[0,1,2,3,4,5] | 2983 | 失败 | 1114/2983 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_131212_017.bin | a2e8d7cc8d35 | 18x19, P[0,1,2,3,4,5] | 1 | 通过 | 1/1 | - |
| game_get_20260704_131221_018.bin | 022a8ed5f05c | 21x13, P[0,1,2,3,4,5] | 2154 | 失败 | 1845/2154 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_131229_019.bin | 1fa374fe09d3 | 21x21, P[0,1,2,3,4,5] | 4868 | 失败 | 565/4868 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_131235_020.bin | a0f4b5dde4a1 | 21x13, P[0,1,2,3,4,5] | 1728 | 失败 | 780/1728 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_131256_021.bin | cfd8d0fadd57 | 11x19, P[0,1,2,3,5] | 1370 | 失败 | 975/1370 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_131304_022.bin | ea7eaf070647 | 17x12, P[0,2,3,4] | 881 | 通过 | 881/881 | - |
| game_get_20260704_131309_023.bin | c72987ab3319 | 19x20, P[0,1,2,3,4,5] | 4952 | 失败 | 1246/4952 | 找不到召唤目标墓碑: (6, 18) |
| game_get_20260704_131316_024.bin | 5899b63571e1 | 17x12, P[0,2,3,4] | 1312 | 失败 | 785/1312 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_131318_025.bin | 5b0bf971c2bd | 12x12, P[0,1,2,3,4,5] | 69 | 通过 | 69/69 | - |
| game_get_20260704_131321_026.bin | ea66acda66a4 | 21x13, P[0,1,2,3,4,5] | 842 | 失败 | 751/842 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_131324_027.bin | a68d4d267931 | 17x12, P[0,2,3,4] | 802 | 通过 | 802/802 | - |
| game_get_20260704_131328_028.bin | 3e4458c04835 | 17x12, P[0,2,3,4] | 790 | 通过 | 790/790 | - |
| game_get_20260704_131337_029.bin | 42f2ac258b2d | 21x13, P[0,1,2,3,4,5] | 2305 | 失败 | 869/2305 | 找不到来源单位: (18, 7) |
| game_get_20260704_131343_030.bin | 47d22296f31a | 11x19, P[0,1,2,3,5] | 1387 | 失败 | 1148/1387 | 当前局面没有合法招募动作: commander @ (9, 3) |

## 明细

### game_get_20260704_131018_001.bin

- 状态：通过
- SHA256：`0e1dd9c4c506943925c8426ef801716deaed09906128d3b258fb71840330e2b2`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1028 条，remaining=0，事件=ATTACK=342, NEXT_TURN=100, NONE=98, OCCUPY=15, REPAIR=2, STANDBY=468, SUMMON=2, SURRENDER=1
- 校验进度：已执行 1028 / 1028 条 APK 记录，展开项目动作 1701 个
- 终局状态：turn=35，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_131048_002.bin

- 状态：失败
- SHA256：`31b6ac6e56fb29a682d6716b74cca95993476aaf2b72156c1623484f887b2c7c`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=8
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：6932 条，remaining=0，事件=ATTACK=1079, HEAL=453, NEXT_TURN=247, NONE=429, OCCUPY=38, STANDBY=4485, SUMMON=25, SUPPORT=174, SURRENDER=2
- 校验进度：已执行 857 / 6932 条 APK 记录，展开项目动作 1434 个
- 终局状态：turn=11，currentPlayer=3，winner=-
- 首个问题：找不到召唤目标墓碑: (19, 17)
- APK 记录：event=SUMMON，source=(18,15)，move=(19,15)，target=(19,17)，recruitId=-1
- 问题位置：record=857, turn=11, currentPlayer=3, legalActions=138
- 项目动作：`-`
- 引擎信息：-

### game_get_20260704_131052_003.bin

- 状态：通过
- SHA256：`bf67e73547fcca11a4904c7b821c563163278ba8472ec35ba3f6b9e22511dd1d`
- 地图：15x12，玩家=[0,1,2,3]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1049 条，remaining=0，事件=ATTACK=305, HEAL=24, NEXT_TURN=104, NONE=90, OCCUPY=18, REPAIR=3, STANDBY=481, SUMMON=2, SUPPORT=21, SURRENDER=1
- 校验进度：已执行 1049 / 1049 条 APK 记录，展开项目动作 1622 个
- 终局状态：turn=37，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_131100_004.bin

- 状态：失败
- SHA256：`8731fe932b239f4af5065b25cbf38d9b9d700b432558ba6e144a0166ddb0d3d9`
- 地图：18x19，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1839 条，remaining=0，事件=ATTACK=351, HEAL=110, NEXT_TURN=118, NONE=157, OCCUPY=45, REPAIR=2, STANDBY=993, SUMMON=4, SUPPORT=57, SURRENDER=2
- 校验进度：已执行 875 / 1839 条 APK 记录，展开项目动作 1463 个
- 终局状态：turn=13，currentPlayer=1，winner=-
- 首个问题：找不到攻击目标单位: (13, 17)
- APK 记录：event=ATTACK，source=(13,18)，move=(13,18)，target=(13,17)，recruitId=-1
- 问题位置：record=875, turn=13, currentPlayer=1, legalActions=99
- 项目动作：`-`
- 引擎信息：-

### game_get_20260704_131113_005.bin

- 状态：通过
- SHA256：`8917e542b93108ff5f04e37750dfd6dfc45b62c02b2f856e8bd8183161e74758`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：928 条，remaining=0，事件=ATTACK=294, NEXT_TURN=95, NONE=86, OCCUPY=16, REPAIR=2, STANDBY=431, SUMMON=3, SURRENDER=1
- 校验进度：已执行 928 / 928 条 APK 记录，展开项目动作 1559 个
- 终局状态：turn=34，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_131118_006.bin

- 状态：失败
- SHA256：`7a0dda5898039782af4e035b6a10628a7073c372d4dda827362db6e1d9b331c1`
- 地图：21x13，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1622 条，remaining=0，事件=ATTACK=661, HEAL=48, NEXT_TURN=116, NONE=177, OCCUPY=48, REPAIR=4, STANDBY=532, SUMMON=14, SUPPORT=22
- 校验进度：已执行 971 / 1622 条 APK 记录，展开项目动作 1516 个
- 终局状态：turn=13，currentPlayer=4，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=ATTACK，source=(4,9)，move=(5,9)，target=(5,8)，recruitId=-1
- 问题位置：record=971, turn=13, currentPlayer=4, legalActions=145
- 项目动作：`attack:u_48:u_132`
- 引擎信息：非法动作：当前玩家无法执行该动作

### game_get_20260704_131123_007.bin

- 状态：通过
- SHA256：`205dd6b03de13f3ff2d878eaad18b680ab3c877de59c3270ef9cecd439e00b6d`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：52 条，remaining=0，事件=ATTACK=1, NEXT_TURN=8, NONE=11, OCCUPY=4, REPAIR=2, STANDBY=25, SURRENDER=1
- 校验进度：已执行 52 / 52 条 APK 记录，展开项目动作 84 个
- 终局状态：turn=3，currentPlayer=3，winner=-
- 首个问题：无

### game_get_20260704_131130_008.bin

- 状态：通过
- SHA256：`a706d70a4e6e75918b599011c17bea27e81a13f7519b368847436a3c4747a48e`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1065 条，remaining=0，事件=ATTACK=199, HEAL=26, NEXT_TURN=73, NONE=132, OCCUPY=34, STANDBY=565, SUMMON=1, SUPPORT=35
- 校验进度：已执行 1065 / 1065 条 APK 记录，展开项目动作 1770 个
- 终局状态：turn=13，currentPlayer=1，winner=-
- 首个问题：无

### game_get_20260704_131132_009.bin

- 状态：通过
- SHA256：`55d597d2144349f82cb2d6c51b376aff7da2706d42c927ef7ec00ed422525e17`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1652 条，remaining=0，事件=ATTACK=368, HEAL=59, NEXT_TURN=101, NONE=164, OCCUPY=37, STANDBY=862, SUMMON=3, SUPPORT=56, SURRENDER=2
- 校验进度：已执行 1652 / 1652 条 APK 记录，展开项目动作 2705 个
- 终局状态：turn=18，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_131135_010.bin

- 状态：通过
- SHA256：`c1e6247384bbfef7ee373ae1505a5518b7ab588e48aa8edb4477970fc50d7e62`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：785 条，remaining=0，事件=ATTACK=234, NEXT_TURN=83, NONE=82, OCCUPY=12, REPAIR=2, STANDBY=368, SUMMON=3, SURRENDER=1
- 校验进度：已执行 785 / 785 条 APK 记录，展开项目动作 1332 个
- 终局状态：turn=30，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_131141_011.bin

- 状态：失败
- SHA256：`e99b550fbb093d32014aafb8f66fbc59b5f99976a1e182411ffd45e074233702`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1297 条，remaining=0，事件=ATTACK=280, HEAL=33, NEXT_TURN=84, NONE=140, OCCUPY=34, STANDBY=676, SUMMON=2, SUPPORT=48
- 校验进度：已执行 910 / 1297 条 APK 记录，展开项目动作 1525 个
- 终局状态：turn=12，currentPlayer=1，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=ATTACK，source=(2,0)，move=(0,2)，target=(1,3)，recruitId=-1
- 问题位置：record=910, turn=12, currentPlayer=1, legalActions=60
- 项目动作：`move:u_102:0,2`
- 引擎信息：非法动作：当前玩家无法执行该动作

### game_get_20260704_131143_012.bin

- 状态：通过
- SHA256：`ab67b766355ca64a8219c23043680d4b5d7f10bf22227fa196960c6c0319af00`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：545 条，remaining=0，事件=ATTACK=70, HEAL=21, NEXT_TURN=48, NONE=81, OCCUPY=33, STANDBY=279, SUMMON=1, SUPPORT=12
- 校验进度：已执行 545 / 545 条 APK 记录，展开项目动作 940 个
- 终局状态：turn=9，currentPlayer=0，winner=-
- 首个问题：无

### game_get_20260704_131146_013.bin

- 状态：通过
- SHA256：`59e88482f04e72f7b63eae05a8b9bb01d1d291ff0f92460db734746939b2a72e`
- 地图：21x13，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：337 条，remaining=0，事件=ATTACK=73, NEXT_TURN=34, NONE=61, OCCUPY=29, REPAIR=4, STANDBY=136
- 校验进度：已执行 337 / 337 条 APK 记录，展开项目动作 540 个
- 终局状态：turn=6，currentPlayer=4，winner=-
- 首个问题：无

### game_get_20260704_131151_014.bin

- 状态：通过
- SHA256：`c3358fb41a8d180bddbc0f41882aa0153eec66b0905b36e88ff9a24ee711a415`
- 地图：21x13，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：502 条，remaining=0，事件=ATTACK=121, HEAL=3, NEXT_TURN=45, NONE=79, OCCUPY=33, REPAIR=4, STANDBY=215, SURRENDER=2
- 校验进度：已执行 502 / 502 条 APK 记录，展开项目动作 802 个
- 终局状态：turn=9，currentPlayer=0，winner=6
- 首个问题：无

### game_get_20260704_131157_015.bin

- 状态：通过
- SHA256：`235b2c26b3f45cb4b62530079cabb6f997906316e741246f2b6ffe6213a25a67`
- 地图：12x12，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=150
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=150，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：232 条，remaining=0，事件=ATTACK=39, HEAL=2, NEXT_TURN=41, NONE=34, OCCUPY=3, REPAIR=3, STANDBY=109, SUMMON=1
- 校验进度：已执行 232 / 232 条 APK 记录，展开项目动作 370 个
- 终局状态：turn=7，currentPlayer=5，winner=-
- 首个问题：无

### game_get_20260704_131211_016.bin

- 状态：失败
- SHA256：`a0aa3f4c900774d6979927748beee909a18ce405297cead0b352282064397211`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2983 条，remaining=0，事件=ATTACK=739, HEAL=100, NEXT_TURN=156, NONE=264, OCCUPY=34, STANDBY=1588, SUMMON=11, SUPPORT=89, SURRENDER=2
- 校验进度：已执行 1114 / 2983 条 APK 记录，展开项目动作 1846 个
- 终局状态：turn=13，currentPlayer=4，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=ATTACK，source=(13,19)，move=(16,20)，target=(17,19)，recruitId=-1
- 问题位置：record=1114, turn=13, currentPlayer=4, legalActions=343
- 项目动作：`move:u_96:16,20`
- 引擎信息：非法动作：当前玩家无法执行该动作

### game_get_20260704_131212_017.bin

- 状态：通过
- SHA256：`a2e8d7cc8d35ce0d09dfeceb26a7ec21060e0c90c9ddf19bc3d26c88273fcc1d`
- 地图：18x19，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=80，levelCap=7
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1 条，remaining=0，事件=NEXT_TURN=1
- 校验进度：已执行 1 / 1 条 APK 记录，展开项目动作 1 个
- 终局状态：turn=1，currentPlayer=1，winner=-
- 首个问题：无

### game_get_20260704_131221_018.bin

- 状态：失败
- SHA256：`022a8ed5f05cc9e87ec0f3e7f6d1a02b147db68392945b37fac1a1c0c313b423`
- 地图：21x13，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2154 条，remaining=0，事件=ATTACK=897, HEAL=31, NEXT_TURN=140, NONE=220, OCCUPY=36, REPAIR=4, STANDBY=768, SUMMON=37, SUPPORT=20, SURRENDER=1
- 校验进度：已执行 1845 / 2154 条 APK 记录，展开项目动作 2921 个
- 终局状态：turn=21，currentPlayer=2，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=STANDBY，source=(14,5)，move=(11,4)，target=-，recruitId=-1
- 问题位置：record=1845, turn=21, currentPlayer=2, legalActions=109
- 项目动作：`move:u_176:11,4`
- 引擎信息：非法动作：当前玩家无法执行该动作

### game_get_20260704_131229_019.bin

- 状态：失败
- SHA256：`1fa374fe09d3ba5ca7ade09166bbdc5e179f1e302353ad986297854718e3e5a4`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：4868 条，remaining=0，事件=ATTACK=1337, HEAL=241, NEXT_TURN=252, NONE=410, OCCUPY=34, STANDBY=2412, SUMMON=26, SUPPORT=154, SURRENDER=2
- 校验进度：已执行 565 / 4868 条 APK 记录，展开项目动作 975 个
- 终局状态：turn=9，currentPlayer=0，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=STANDBY，source=(19,19)，move=(20,17)，target=-，recruitId=-1
- 问题位置：record=565, turn=9, currentPlayer=0, legalActions=17
- 项目动作：`move:u_88:20,17`
- 引擎信息：非法动作：当前玩家无法执行该动作

### game_get_20260704_131235_020.bin

- 状态：失败
- SHA256：`a0f4b5dde4a1c7fbd92aeaf4a24ff3cae34ed292ee2a472049c85936e669cc0b`
- 地图：21x13，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1728 条，remaining=0，事件=ATTACK=436, HEAL=15, NEXT_TURN=109, NONE=175, OCCUPY=33, REPAIR=4, STANDBY=910, SUMMON=10, SUPPORT=34, SURRENDER=2
- 校验进度：已执行 780 / 1728 条 APK 记录，展开项目动作 1222 个
- 终局状态：turn=11，currentPlayer=3，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=ATTACK，source=(4,5)，move=(2,4)，target=(1,4)，recruitId=-1
- 问题位置：record=780, turn=11, currentPlayer=3, legalActions=109
- 项目动作：`move:apk_remote_u0:2,4`
- 引擎信息：非法动作：当前玩家无法执行该动作

### game_get_20260704_131256_021.bin

- 状态：失败
- SHA256：`cfd8d0fadd578adb2ce3529591d3de40709fe63d08139523b5635ae82813df11`
- 地图：11x19，玩家=[0,1,2,3,5]，初始单位=5，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1370 条，remaining=0，事件=ATTACK=368, HEAL=29, NEXT_TURN=146, NONE=111, OCCUPY=11, REPAIR=4, STANDBY=698, SUMMON=2, SURRENDER=1
- 校验进度：已执行 975 / 1370 条 APK 记录，展开项目动作 1519 个
- 终局状态：turn=24，currentPlayer=3，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=ATTACK，source=(7,14)，move=(8,15)，target=(9,15)，recruitId=-1
- 问题位置：record=975, turn=24, currentPlayer=3, legalActions=158
- 项目动作：`move:apk_remote_u4:8,15`
- 引擎信息：非法动作：当前玩家无法执行该动作

### game_get_20260704_131304_022.bin

- 状态：通过
- SHA256：`ea7eaf070647f1e6c8120bed0fdca988bcd6c386ce39b2901347c1f2a39e62ec`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：881 条，remaining=0，事件=ATTACK=292, NEXT_TURN=92, NONE=93, OCCUPY=13, REPAIR=2, STANDBY=387, SUMMON=1, SURRENDER=1
- 校验进度：已执行 881 / 881 条 APK 记录，展开项目动作 1476 个
- 终局状态：turn=33，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_131309_023.bin

- 状态：失败
- SHA256：`c72987ab331977bdb826a5f81defe3dd91b7737c856291cc2a9f426d95531c93`
- 地图：19x20，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=500
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：4952 条，remaining=0，事件=ATTACK=652, HEAL=423, NEXT_TURN=176, NONE=316, OCCUPY=42, STANDBY=3192, SUMMON=14, SUPPORT=135, SURRENDER=2
- 校验进度：已执行 1246 / 4952 条 APK 记录，展开项目动作 1989 个
- 终局状态：turn=13，currentPlayer=1，winner=-
- 首个问题：找不到召唤目标墓碑: (6, 18)
- APK 记录：event=SUMMON，source=(5,17)，move=(5,18)，target=(6,18)，recruitId=-1
- 问题位置：record=1246, turn=13, currentPlayer=1, legalActions=125
- 项目动作：`-`
- 引擎信息：-

### game_get_20260704_131316_024.bin

- 状态：失败
- SHA256：`5899b63571e1fc9894c99ab14bed94e53b6ce42a3db5383a29f2d20aefd9bf0c`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1312 条，remaining=0，事件=ATTACK=394, NEXT_TURN=117, NONE=115, OCCUPY=15, REPAIR=2, STANDBY=662, SUMMON=6, SURRENDER=1
- 校验进度：已执行 785 / 1312 条 APK 记录，展开项目动作 1314 个
- 终局状态：turn=23，currentPlayer=0，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=STANDBY，source=(10,6)，move=(9,6)，target=-，recruitId=-1
- 问题位置：record=785, turn=23, currentPlayer=0, legalActions=16
- 项目动作：`move:u_41:9,6`
- 引擎信息：非法动作：当前玩家无法执行该动作

### game_get_20260704_131318_025.bin

- 状态：通过
- SHA256：`5b0bf971c2bd1f628115fbb116fddfd55dc897144830d5783ffb93d5f57e2400`
- 地图：12x12，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=150
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=150，unitLimit=50，levelCap=4
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：69 条，remaining=0，事件=ATTACK=5, NEXT_TURN=17, NONE=13, OCCUPY=2, REPAIR=3, STANDBY=29
- 校验进度：已执行 69 / 69 条 APK 记录，展开项目动作 105 个
- 终局状态：turn=3，currentPlayer=5，winner=-
- 首个问题：无

### game_get_20260704_131321_026.bin

- 状态：失败
- SHA256：`ea66acda66a4944e469a3978c094bf6b5fe9bed8ed625759dc732190ee53ae1b`
- 地图：21x13，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：842 条，remaining=0，事件=ATTACK=294, HEAL=18, NEXT_TURN=64, NONE=110, OCCUPY=29, REPAIR=4, STANDBY=304, SUMMON=14, SUPPORT=3, SURRENDER=2
- 校验进度：已执行 751 / 842 条 APK 记录，展开项目动作 1204 个
- 终局状态：turn=11，currentPlayer=1，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=ATTACK，source=(17,3)，move=(18,3)，target=(18,4)，recruitId=-1
- 问题位置：record=751, turn=11, currentPlayer=1, legalActions=246
- 项目动作：`move:u_108:18,3`
- 引擎信息：非法动作：当前玩家无法执行该动作

### game_get_20260704_131324_027.bin

- 状态：通过
- SHA256：`a68d4d267931f7c06efe5c70180e0333367d395d3616cc5f1e7b217fa3838239`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：802 条，remaining=0，事件=ATTACK=263, NEXT_TURN=86, NONE=85, OCCUPY=14, REPAIR=2, STANDBY=348, SUMMON=3, SURRENDER=1
- 校验进度：已执行 802 / 802 条 APK 记录，展开项目动作 1323 个
- 终局状态：turn=31，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_131328_028.bin

- 状态：通过
- SHA256：`3e4458c04835e340cd5fd0ec2c9eb932f1ff12c7a0d7acf5b93e1544db758a31`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：790 条，remaining=0，事件=ATTACK=236, NEXT_TURN=85, NONE=81, OCCUPY=15, REPAIR=2, STANDBY=368, SUMMON=2, SURRENDER=1
- 校验进度：已执行 790 / 790 条 APK 记录，展开项目动作 1305 个
- 终局状态：turn=31，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_131337_029.bin

- 状态：失败
- SHA256：`42f2ac258b2d553738adef894869f75de174edf1d3c52844a4eab6761288ecd4`
- 地图：21x13，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2305 条，remaining=0，事件=ATTACK=960, HEAL=41, NEXT_TURN=143, NONE=224, OCCUPY=38, REPAIR=4, STANDBY=803, SUMMON=58, SUPPORT=34
- 校验进度：已执行 869 / 2305 条 APK 记录，展开项目动作 1372 个
- 终局状态：turn=12，currentPlayer=1，winner=-
- 首个问题：找不到来源单位: (18, 7)
- APK 记录：event=ATTACK，source=(18,7)，move=(18,7)，target=(19,6)，recruitId=-1
- 问题位置：record=869, turn=12, currentPlayer=1, legalActions=73
- 项目动作：`-`
- 引擎信息：-

### game_get_20260704_131343_030.bin

- 状态：失败
- SHA256：`47d22296f31a9e9354cb28a2f4c5750f6661af1d999c827f8f8b27268e1ad8ba`
- 地图：11x19，玩家=[0,1,2,3,5]，初始单位=5，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1387 条，remaining=0，事件=ATTACK=386, HEAL=27, NEXT_TURN=142, NONE=108, OCCUPY=13, REPAIR=4, STANDBY=699, SUMMON=7, SURRENDER=1
- 校验进度：已执行 1148 / 1387 条 APK 记录，展开项目动作 1776 个
- 终局状态：turn=29，currentPlayer=2，winner=-
- 首个问题：当前局面没有合法招募动作: commander @ (9, 3)
- APK 记录：event=NONE，source=(9,3)，move=-，target=-，recruitId=9
- 问题位置：record=1148, turn=29, currentPlayer=2, legalActions=11
- 项目动作：`-`
- 引擎信息：-

## 结论说明

- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。
- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。
- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。
- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。