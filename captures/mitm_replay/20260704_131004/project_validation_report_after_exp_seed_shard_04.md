# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-04T15:58:54.641Z
- 输入目录：`C:\code\AncinetEmpires\captures\mitm_replay`
- 规则模式：SD
- 抽样文件上限：全部
- 招募歧义处理：允许选第一个合法部署点继续
- 地形处理：未映射地形使用道路兜底并记录
- 文件数：20，唯一校验：20，重复跳过：0，通过：18，失败：2，解析错误：0

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
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
| game_get_20260704_132030_074.bin | eac2dc895fae | 9x13, P[0,1,2,3,5] | 385 | 通过 | 385/385 | - |
| game_get_20260704_132033_075.bin | 13c620f118b2 | 9x13, P[0,1,2,3,5] | 184 | 通过 | 184/184 | - |
| game_get_20260704_132035_076.bin | ced80ac4fcc3 | 13x13, P[4,1,0,5,2,3] | 23 | 通过 | 23/23 | - |
| game_get_20260704_132042_077.bin | 1f99596b6f21 | 9x13, P[0,1,2,3,5] | 257 | 通过 | 257/257 | - |
| game_get_20260704_132050_078.bin | 72d58b04ba9f | 13x13, P[4,1,0,5,2,3] | 250 | 失败 | 48/250 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_132053_079.bin | 9955f5ec484e | 15x15, P[0,1,2,3,4,5] | 230 | 通过 | 230/230 | - |
| game_get_20260704_132058_080.bin | a152374741c9 | 17x12, P[0,2,3,4] | 838 | 通过 | 838/838 | - |

## 明细

### game_get_20260704_131946_061.bin

- 状态：通过
- SHA256：`7b290a83da36e26b7f81947a79f398cad86fbcd5c6ad941eab2e4ca23698f068`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：6887 条，remaining=0，事件=ATTACK=1031, HEAL=583, NEXT_TURN=288, NONE=413, OCCUPY=46, STANDBY=4341, SUMMON=15, SUPPORT=170
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
- 校验进度：已执行 710 / 710 条 APK 记录，展开项目动作 1103 个
- 终局状态：turn=14，currentPlayer=3，winner=6
- 首个问题：无

### game_get_20260704_132030_074.bin

- 状态：通过
- SHA256：`eac2dc895faef99c814c205ee1ccbb9a54fa8f609498939700691af8b34792fb`
- 地图：9x13，玩家=[0,1,2,3,5]，初始单位=5，推荐金币=200
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,5]，initialGold=200，unitLimit=50，levelCap=6
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：385 条，remaining=0，事件=ATTACK=126, HEAL=6, NEXT_TURN=40, NONE=57, OCCUPY=27, STANDBY=122, SUMMON=5, SURRENDER=2
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
- 校验进度：已执行 838 / 838 条 APK 记录，展开项目动作 1397 个
- 终局状态：turn=31，currentPlayer=3，winner=4
- 首个问题：无

## 结论说明

- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。
- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。
- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。
- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。