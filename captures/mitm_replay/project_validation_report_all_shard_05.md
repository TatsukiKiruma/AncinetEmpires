# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-04T19:02:25.258Z
- 输入目录：`C:\code\AncinetEmpires\captures\mitm_replay`
- 规则模式：SD
- 抽样文件上限：全部
- 招募歧义处理：允许选第一个合法部署点继续
- 地形处理：未映射地形使用道路兜底并记录
- 文件数：20，唯一校验：20，重复跳过：0，通过：19，失败：1，解析错误：0

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
| game_get_20260704_132030_074.bin | eac2dc895fae | 9x13, P[0,1,2,3,5] | 385 | 通过 | 385/385 | - |
| game_get_20260704_132033_075.bin | 13c620f118b2 | 9x13, P[0,1,2,3,5] | 184 | 通过 | 184/184 | - |
| game_get_20260704_132035_076.bin | ced80ac4fcc3 | 13x13, P[4,1,0,5,2,3] | 23 | 通过 | 23/23 | - |
| game_get_20260704_132042_077.bin | 1f99596b6f21 | 9x13, P[0,1,2,3,5] | 257 | 通过 | 257/257 | - |
| game_get_20260704_132050_078.bin | 72d58b04ba9f | 13x13, P[4,1,0,5,2,3] | 250 | 失败 | 48/250 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_132053_079.bin | 9955f5ec484e | 15x15, P[0,1,2,3,4,5] | 230 | 通过 | 230/230 | - |
| game_get_20260704_132058_080.bin | a152374741c9 | 17x12, P[0,2,3,4] | 838 | 通过 | 838/838 | - |
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

## 明细

### game_get_20260704_132030_074.bin

- 状态：通过
- SHA256：`eac2dc895faef99c814c205ee1ccbb9a54fa8f609498939700691af8b34792fb`
- 地图：9x13，玩家=[0,1,2,3,5]，初始单位=5，推荐金币=200
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,5]，initialGold=200，unitLimit=50，levelCap=6
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：385 条，remaining=0，事件=ATTACK=126, HEAL=6, NEXT_TURN=40, NONE=57, OCCUPY=27, STANDBY=122, SUMMON=5, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 385 / 385 条 APK 记录，展开项目动作 602 个
- 终局状态：turn=10，currentPlayer=0，winner=1
- 首个问题：无

### game_get_20260704_132033_075.bin

- 状态：通过
- SHA256：`13c620f118b2e736c7d9dfeaa32f80bfd09906a9713141d80b04d35ae61b7b49`
- 地图：9x13，玩家=[0,1,2,3,5]，初始单位=5，推荐金币=200
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,5]，initialGold=200，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：184 条，remaining=0，事件=ATTACK=53, NEXT_TURN=23, NONE=36, OCCUPY=20, STANDBY=50, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 184 / 184 条 APK 记录，展开项目动作 277 个
- 终局状态：turn=6，currentPlayer=0，winner=1
- 首个问题：无

### game_get_20260704_132035_076.bin

- 状态：通过
- SHA256：`ced80ac4fcc355722762b82fc38bb444bfd7d13f4e265c352441e06e7c794588`
- 地图：13x13，玩家=[4,1,0,5,2,3]，初始单位=10，推荐金币=250
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=0，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：23 条，remaining=0，事件=NEXT_TURN=6, NONE=4, OCCUPY=4, STANDBY=9
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 23 / 23 条 APK 记录，展开项目动作 32 个
- 终局状态：turn=2，currentPlayer=0，winner=-
- 首个问题：无

### game_get_20260704_132042_077.bin

- 状态：通过
- SHA256：`1f99596b6f21b8d225f09d52e74c9c2096a9b3f818986914ded9fb04785c96df`
- 地图：9x13，玩家=[0,1,2,3,5]，初始单位=5，推荐金币=200
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,5]，initialGold=200，unitLimit=90，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：257 条，remaining=0，事件=ATTACK=94, NEXT_TURN=28, NONE=44, OCCUPY=17, STANDBY=63, SUMMON=8, SUPPORT=1, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 257 / 257 条 APK 记录，展开项目动作 394 个
- 终局状态：turn=7，currentPlayer=0，winner=1
- 首个问题：无

### game_get_20260704_132050_078.bin

- 状态：失败
- SHA256：`72d58b04ba9f2e5d885e36a57d0dfaa608618916fa9d2cb38e2ece15d9312d4d`
- 地图：13x13，玩家=[4,1,0,5,2,3]，初始单位=10，推荐金币=250
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=250，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：250 条，remaining=0，事件=ATTACK=35, HEAL=7, NEXT_TURN=24, NONE=58, OCCUPY=4, STANDBY=119, SUPPORT=1, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 48 / 250 条 APK 记录，展开项目动作 72 个
- 终局状态：turn=2，currentPlayer=1，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=ATTACK，source=(10,8)，move=(9,8)，target=(7,7)，recruitId=-1
- 问题位置：record=48, turn=2, currentPlayer=1, legalActions=71
- 项目动作：`attack:u_13:apk_remote_u2`
- 引擎信息：非法动作：当前玩家无法执行该动作

### game_get_20260704_132053_079.bin

- 状态：通过
- SHA256：`9955f5ec484e329f101f28465b76b22c02eb5be5d6983ff3a1bcae467aa3fac0`
- 地图：15x15，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=70，levelCap=7
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：230 条，remaining=0，事件=ATTACK=44, HEAL=4, NEXT_TURN=29, NONE=44, OCCUPY=26, REPAIR=8, STANDBY=73, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 230 / 230 条 APK 记录，展开项目动作 367 个
- 终局状态：turn=6，currentPlayer=2，winner=6
- 首个问题：无

### game_get_20260704_132058_080.bin

- 状态：通过
- SHA256：`a152374741c90e42294aae89876195d291e28b85d8ba1ce17b70602bcd3b4d37`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：838 条，remaining=0，事件=ATTACK=248, NEXT_TURN=87, NONE=87, OCCUPY=15, REPAIR=2, STANDBY=397, SUMMON=1, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 838 / 838 条 APK 记录，展开项目动作 1397 个
- 终局状态：turn=31，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_132101_081.bin

- 状态：通过
- SHA256：`8585960f19d7f4df3d86bb38c8650fba89f609f2f136f56c426629f4c414328e`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
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
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
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
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
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
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
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
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
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
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
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
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
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
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
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
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
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
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
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
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
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
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
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
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：764 条，remaining=0，事件=ATTACK=116, HEAL=19, NEXT_TURN=60, NONE=102, OCCUPY=34, STANDBY=408, SUMMON=2, SUPPORT=23
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 764 / 764 条 APK 记录，展开项目动作 1320 个
- 终局状态：turn=11，currentPlayer=0，winner=-
- 首个问题：无

## 结论说明

- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。
- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。
- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。
- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。