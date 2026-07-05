# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-04T14:38:23.963Z
- 输入目录：`C:\code\AncinetEmpires\captures\mitm_replay`
- 规则模式：SD
- 抽样文件上限：全部
- 招募歧义处理：允许选第一个合法部署点继续
- 地形处理：未映射地形使用道路兜底并记录
- 文件数：16，唯一校验：16，重复跳过：0，通过：6，失败：10，解析错误：0

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
| game_get_20260704_131421_039.bin | 544233d74082 | 21x21, P[0,1,2,3,4,5] | 2923 | 失败 | 1068/2923 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_131501_042.bin | 85f9f7d03e9d | 21x25, P[0,1,2,3,4,5] | 1708 | 通过 | 1708/1708 | - |
| game_get_20260704_131611_053.bin | ff19829e2243 | 25x17, P[0,1,2,3,4,5] | 3826 | 失败 | 1596/3826 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_132008_065.bin | 1269141a5313 | 13x13, P[4,1,0,5,2,3] | 1182 | 失败 | 37/1182 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_132013_067.bin | e84f62fe505c | 9x13, P[0,1,2,3,5] | 721 | 通过 | 721/721 | - |
| game_get_20260704_132050_078.bin | 72d58b04ba9f | 13x13, P[4,1,0,5,2,3] | 250 | 失败 | 48/250 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_132113_083.bin | ae698fd18822 | 21x21, P[0,1,2,3,4,5] | 3137 | 通过 | 3137/3137 | - |
| game_get_20260704_132124_084.bin | 06b265cbfc85 | 21x21, P[0,1,2,3,4,5] | 2995 | 失败 | 1541/2995 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_132153_085.bin | 38c4c4b2aea8 | 21x21, P[0,1,2,3,4,5] | 4039 | 失败 | 1535/4039 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_132207_088.bin | d59bd75aeb12 | 9x11, P[1,3] | 159 | 通过 | 159/159 | - |
| game_get_20260704_132307_092.bin | f5d90b7debee | 21x21, P[0,1,2,3,4,5] | 3470 | 失败 | 1645/3470 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_132339_097.bin | 5619d6a85c7d | 25x25, P[0,1,2,3,4,5] | 3221 | 失败 | 3008/3221 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_132403_098.bin | 3f3903b3f828 | 21x21, P[0,1,2,3,4,5] | 4645 | 通过 | 4645/4645 | - |
| game_get_20260704_132512_102.bin | 93fe39b5da21 | 21x21, P[0,1,2,3,4,5] | 4405 | 失败 | 1637/4405 | 非法动作：当前玩家无法执行该动作 |
| game_get_20260704_132603_109.bin | 2aa07d934087 | 21x21, P[0,1,2,3,4,5] | 2931 | 通过 | 2931/2931 | - |
| game_get_20260704_132710_112.bin | b28bd9a436ea | 21x21, P[0,1,2,3,4,5] | 2057 | 失败 | 1273/2057 | 非法动作：当前玩家无法执行该动作 |

## 明细

### game_get_20260704_131421_039.bin

- 状态：失败
- SHA256：`544233d74082486be6e146e9cc7cc17672f4a0ba80646a5d952540a1972c3ed9`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=10，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2923 条，remaining=0，事件=ATTACK=912, HEAL=71, NEXT_TURN=168, NONE=300, OCCUPY=34, STANDBY=1285, SUMMON=24, SUPPORT=129
- 校验进度：已执行 1068 / 2923 条 APK 记录，展开项目动作 1765 个
- 终局状态：turn=13，currentPlayer=3，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=STANDBY，source=(18,15)，move=(19,17)，target=-，recruitId=-1
- 问题位置：record=1068, turn=13, currentPlayer=3, legalActions=193
- 项目动作：`move:u_88:19,17`
- 引擎信息：非法动作：当前玩家无法执行该动作

### game_get_20260704_131501_042.bin

- 状态：通过
- SHA256：`85f9f7d03e9d3651c9740b7b22f3f63f2870d9d7fbee714adb78cc357f3583a0`
- 地图：21x25，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=700，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1708 条，remaining=0，事件=ATTACK=659, HEAL=32, NEXT_TURN=125, NONE=187, OCCUPY=65, REPAIR=1, STANDBY=560, SUMMON=36, SUPPORT=42, SURRENDER=1
- 校验进度：已执行 1708 / 1708 条 APK 记录，展开项目动作 2950 个
- 终局状态：turn=25，currentPlayer=0，winner=1
- 首个问题：无

### game_get_20260704_131611_053.bin

- 状态：失败
- SHA256：`ff19829e224309967f17723707ee41da961fc610066c79ca264960018aaa877f`
- 地图：25x17，玩家=[0,1,2,3,4,5]，初始单位=10，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=600，unitLimit=80，levelCap=8
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：3826 条，remaining=0，事件=ATTACK=1441, HEAL=45, NEXT_TURN=191, NONE=399, OCCUPY=115, REPAIR=30, STANDBY=1487, SUMMON=46, SUPPORT=72
- 校验进度：已执行 1596 / 3826 条 APK 记录，展开项目动作 2717 个
- 终局状态：turn=15，currentPlayer=2，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=OCCUPY，source=(10,14)，move=(12,13)，target=-，recruitId=-1
- 问题位置：record=1596, turn=15, currentPlayer=2, legalActions=61
- 项目动作：`move:apk_remote_u1:12,13`
- 引擎信息：非法动作：当前玩家无法执行该动作

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

### game_get_20260704_132113_083.bin

- 状态：通过
- SHA256：`ae698fd18822b2b62f3b4366d549fcfce2c171cb3e181e8c929999a920078801`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：3137 条，remaining=0，事件=ATTACK=769, HEAL=170, NEXT_TURN=162, NONE=268, OCCUPY=35, REPAIR=1, STANDBY=1632, SUMMON=12, SUPPORT=86, SURRENDER=2
- 校验进度：已执行 3137 / 3137 条 APK 记录，展开项目动作 5069 个
- 终局状态：turn=28，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_132124_084.bin

- 状态：失败
- SHA256：`06b265cbfc8583510f9e1d75431f351e7f479e356ccbd3d8be99c635179a75b2`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=12，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2995 条，remaining=0，事件=ATTACK=854, HEAL=104, NEXT_TURN=169, NONE=316, OCCUPY=34, STANDBY=1368, SUMMON=23, SUPPORT=127
- 校验进度：已执行 1541 / 2995 条 APK 记录，展开项目动作 2589 个
- 终局状态：turn=17，currentPlayer=1，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=ATTACK，source=(1,2)，move=(0,4)，target=(1,4)，recruitId=-1
- 问题位置：record=1541, turn=17, currentPlayer=1, legalActions=47
- 项目动作：`move:u_54:0,4`
- 引擎信息：非法动作：当前玩家无法执行该动作

### game_get_20260704_132153_085.bin

- 状态：失败
- SHA256：`38c4c4b2aea8d154f3b9ce0c0b114d7035a12e5643ec065d7c2a03a8e9cef78b`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=12，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：4039 条，remaining=0，事件=ATTACK=1238, HEAL=112, NEXT_TURN=204, NONE=432, OCCUPY=34, STANDBY=1830, SUMMON=25, SUPPORT=164
- 校验进度：已执行 1535 / 4039 条 APK 记录，展开项目动作 2554 个
- 终局状态：turn=16，currentPlayer=0，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=ATTACK，source=(20,18)，move=(18,17)，target=(18,16)，recruitId=-1
- 问题位置：record=1535, turn=16, currentPlayer=0, legalActions=42
- 项目动作：`move:u_46:18,17`
- 引擎信息：非法动作：当前玩家无法执行该动作

### game_get_20260704_132207_088.bin

- 状态：通过
- SHA256：`d59bd75aeb125231860b9aa57518bb58cf3b97c4821887c81548e9908dfd1e4b`
- 地图：9x11，玩家=[1,3]，初始单位=2，推荐金币=250
- 项目开局：currentPlayer=1，activeTeams=[1,3]，initialGold=250，unitLimit=30，levelCap=3
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：159 条，remaining=0，事件=ATTACK=51, NEXT_TURN=19, NONE=26, OCCUPY=19, REPAIR=3, STANDBY=37, SUMMON=3, SURRENDER=1
- 校验进度：已执行 159 / 159 条 APK 记录，展开项目动作 264 个
- 终局状态：turn=11，currentPlayer=1，winner=1
- 首个问题：无

### game_get_20260704_132307_092.bin

- 状态：失败
- SHA256：`f5d90b7debee52db2bd93a279cd7ee1aeb762e747d9a9261fff66f9d1f8e1aef`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=10，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：3470 条，remaining=0，事件=ATTACK=1076, HEAL=111, NEXT_TURN=192, NONE=334, OCCUPY=34, STANDBY=1549, SUMMON=21, SUPPORT=153
- 校验进度：已执行 1645 / 3470 条 APK 记录，展开项目动作 2692 个
- 终局状态：turn=18，currentPlayer=2，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=ATTACK，source=(3,5)，move=(1,4)，target=(1,2)，recruitId=-1
- 问题位置：record=1645, turn=18, currentPlayer=2, legalActions=430
- 项目动作：`move:u_168:1,4`
- 引擎信息：非法动作：当前玩家无法执行该动作

### game_get_20260704_132339_097.bin

- 状态：失败
- SHA256：`5619d6a85c7d6c93bed5b4dab762927dca38b5b64c1d599a3ddcf54c67d650f8`
- 地图：25x25，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=700，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：3221 条，remaining=0，事件=ATTACK=982, HEAL=58, NEXT_TURN=240, NONE=366, OCCUPY=111, STANDBY=1332, SUMMON=44, SUPPORT=87, SURRENDER=1
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
- 校验进度：已执行 4645 / 4645 条 APK 记录，展开项目动作 7545 个
- 终局状态：turn=38，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_132512_102.bin

- 状态：失败
- SHA256：`93fe39b5da21aeec48d4162ab27f5918352e5a9f2f99afa430e2edd9d4675b67`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=10，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：4405 条，remaining=0，事件=ATTACK=1381, HEAL=173, NEXT_TURN=258, NONE=446, OCCUPY=34, STANDBY=1872, SUMMON=43, SUPPORT=198
- 校验进度：已执行 1637 / 4405 条 APK 记录，展开项目动作 2648 个
- 终局状态：turn=18，currentPlayer=4，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=ATTACK，source=(14,15)，move=(15,18)，target=(17,18)，recruitId=-1
- 问题位置：record=1637, turn=18, currentPlayer=4, legalActions=368
- 项目动作：`move:u_176:15,18`
- 引擎信息：非法动作：当前玩家无法执行该动作

### game_get_20260704_132603_109.bin

- 状态：通过
- SHA256：`2aa07d93408778ac684ffc678c5901e17cdb3b49fd9616e0638ba0d580980c44`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2931 条，remaining=0，事件=ATTACK=510, HEAL=123, NEXT_TURN=135, NONE=231, OCCUPY=38, REPAIR=1, STANDBY=1811, SUPPORT=80, SURRENDER=2
- 校验进度：已执行 2931 / 2931 条 APK 记录，展开项目动作 4687 个
- 终局状态：turn=25，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_132710_112.bin

- 状态：失败
- SHA256：`b28bd9a436ea6ef2298d33ac6ba76d9bf83ed700f38424cea5fb5c2ad488a92e`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=12，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2057 条，remaining=0，事件=ATTACK=550, HEAL=38, NEXT_TURN=121, NONE=237, OCCUPY=34, STANDBY=978, SUMMON=12, SUPPORT=87
- 校验进度：已执行 1273 / 2057 条 APK 记录，展开项目动作 2133 个
- 终局状态：turn=14，currentPlayer=3，winner=-
- 首个问题：非法动作：当前玩家无法执行该动作
- APK 记录：event=ATTACK，source=(16,16)，move=(19,16)，target=(19,17)，recruitId=-1
- 问题位置：record=1273, turn=14, currentPlayer=3, legalActions=296
- 项目动作：`move:u_158:19,16`
- 引擎信息：非法动作：当前玩家无法执行该动作

## 结论说明

- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。
- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。
- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。
- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。