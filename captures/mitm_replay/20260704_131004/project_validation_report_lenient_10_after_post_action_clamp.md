# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-04T12:41:19.434Z
- 输入目录：`C:\code\AncinetEmpires\captures\mitm_replay\20260704_131004`
- 规则模式：SD
- 抽样文件上限：10
- 招募歧义处理：允许选第一个合法部署点继续
- 地形处理：未映射地形使用道路兜底并记录
- 文件数：10，唯一校验：10，重复跳过：0，通过：8，失败：2，解析错误：0

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
| game_get_20260704_131018_001.bin | 0e1dd9c4c506 | 17x12, P[0,2,3,4] | 1028 | 通过 | 1028/1028 | - |
| game_get_20260704_131048_002.bin | 31b6ac6e56fb | 21x21, P[0,1,2,3,4,5] | 6932 | 失败 | 1590/6932 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_131052_003.bin | bf67e73547fc | 15x12, P[0,1,2,3] | 1049 | 通过 | 1049/1049 | - |
| game_get_20260704_131100_004.bin | 8731fe932b23 | 18x19, P[0,1,2,3,4,5] | 1839 | 通过 | 1839/1839 | - |
| game_get_20260704_131113_005.bin | 8917e542b931 | 17x12, P[0,2,3,4] | 928 | 通过 | 928/928 | - |
| game_get_20260704_131118_006.bin | 7a0dda589803 | 21x13, P[0,1,2,3,4,5] | 1622 | 失败 | 1551/1622 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_131123_007.bin | 205dd6b03de1 | 17x12, P[0,2,3,4] | 52 | 通过 | 52/52 | - |
| game_get_20260704_131130_008.bin | a706d70a4e6e | 21x21, P[0,1,2,3,4,5] | 1065 | 通过 | 1065/1065 | - |
| game_get_20260704_131132_009.bin | 55d597d21443 | 21x21, P[0,1,2,3,4,5] | 1652 | 通过 | 1652/1652 | - |
| game_get_20260704_131135_010.bin | c1e6247384bb | 17x12, P[0,2,3,4] | 785 | 通过 | 785/785 | - |

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
- 校验进度：已执行 1590 / 6932 条 APK 记录，展开项目动作 2569 个
- 终局状态：turn=17，currentPlayer=0，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=ATTACK，source=(19,19)，move=(19,17)，target=(19,16)，recruitId=-1
- 问题位置：record=1590, turn=17, currentPlayer=0, legalActions=40
- 项目动作：`move:u_174:19,17`
- 引擎信息：非法动作：当前玩家无法执行该动作

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

- 状态：通过
- SHA256：`8731fe932b239f4af5065b25cbf38d9b9d700b432558ba6e144a0166ddb0d3d9`
- 地图：18x19，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1839 条，remaining=0，事件=ATTACK=351, HEAL=110, NEXT_TURN=118, NONE=157, OCCUPY=45, REPAIR=2, STANDBY=993, SUMMON=4, SUPPORT=57, SURRENDER=2
- 校验进度：已执行 1839 / 1839 条 APK 记录，展开项目动作 3035 个
- 终局状态：turn=21，currentPlayer=2，winner=2
- 首个问题：无

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
- 校验进度：已执行 1551 / 1622 条 APK 记录，展开项目动作 2449 个
- 终局状态：turn=19，currentPlayer=4，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=ATTACK，source=(11,9)，move=(10,11)，target=(10,10)，recruitId=-1
- 问题位置：record=1551, turn=19, currentPlayer=4, legalActions=88
- 项目动作：`move:u_48:10,11`
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

## 结论说明

- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。
- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。
- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。
- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。