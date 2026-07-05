# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-04T19:12:02.749Z
- 输入目录：`C:\code\AncinetEmpires\captures\mitm_replay`
- 规则模式：SD
- 抽样文件上限：全部
- 招募歧义处理：允许选第一个合法部署点继续
- 地形处理：未映射地形使用道路兜底并记录
- 文件数：20，唯一校验：20，重复跳过：0，通过：20，失败：0，解析错误：0

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
| game_get_20260704_131151_014.bin | c3358fb41a8d | 21x13, P[0,1,2,3,4,5] | 502 | 通过 | 502/502 | - |
| game_get_20260704_131157_015.bin | 235b2c26b3f4 | 12x12, P[0,1,2,3,4,5] | 232 | 通过 | 232/232 | - |
| game_get_20260704_131211_016.bin | a0aa3f4c9007 | 21x21, P[0,1,2,3,4,5] | 2983 | 通过 | 2983/2983 | - |
| game_get_20260704_131212_017.bin | a2e8d7cc8d35 | 18x19, P[0,1,2,3,4,5] | 1 | 通过 | 1/1 | - |
| game_get_20260704_131221_018.bin | 022a8ed5f05c | 21x13, P[0,1,2,3,4,5] | 2154 | 通过 | 2154/2154 | - |
| game_get_20260704_131229_019.bin | 1fa374fe09d3 | 21x21, P[0,1,2,3,4,5] | 4868 | 通过 | 4868/4868 | - |
| game_get_20260704_131235_020.bin | a0f4b5dde4a1 | 21x13, P[0,1,2,3,4,5] | 1728 | 通过 | 1728/1728 | - |
| game_get_20260704_131256_021.bin | cfd8d0fadd57 | 11x19, P[0,1,2,3,5] | 1370 | 通过 | 1370/1370 | - |
| game_get_20260704_131304_022.bin | ea7eaf070647 | 17x12, P[0,2,3,4] | 881 | 通过 | 881/881 | - |
| game_get_20260704_131309_023.bin | c72987ab3319 | 19x20, P[0,1,2,3,4,5] | 4952 | 通过 | 4952/4952 | - |
| game_get_20260704_131316_024.bin | 5899b63571e1 | 17x12, P[0,2,3,4] | 1312 | 通过 | 1312/1312 | - |
| game_get_20260704_131318_025.bin | 5b0bf971c2bd | 12x12, P[0,1,2,3,4,5] | 69 | 通过 | 69/69 | - |
| game_get_20260704_131321_026.bin | ea66acda66a4 | 21x13, P[0,1,2,3,4,5] | 842 | 通过 | 842/842 | - |
| game_get_20260704_131324_027.bin | a68d4d267931 | 17x12, P[0,2,3,4] | 802 | 通过 | 802/802 | - |
| game_get_20260704_131328_028.bin | 3e4458c04835 | 17x12, P[0,2,3,4] | 790 | 通过 | 790/790 | - |
| game_get_20260704_131337_029.bin | 42f2ac258b2d | 21x13, P[0,1,2,3,4,5] | 2305 | 通过 | 2305/2305 | - |
| game_get_20260704_131343_030.bin | 47d22296f31a | 11x19, P[0,1,2,3,5] | 1387 | 通过 | 1387/1387 | - |
| game_get_20260704_131347_031.bin | 2f5872f43c59 | 15x12, P[0,1,2,3] | 1601 | 通过 | 1601/1601 | - |
| game_get_20260704_131350_032.bin | 608cd9e1c9a4 | 21x21, P[0,1,2,3,4,5] | 991 | 通过 | 991/991 | - |
| game_get_20260704_131352_033.bin | db26bbedcec2 | 12x12, P[0,1,2,3,4,5] | 286 | 通过 | 286/286 | - |

## 明细

### game_get_20260704_131151_014.bin

- 状态：通过
- SHA256：`c3358fb41a8d180bddbc0f41882aa0153eec66b0905b36e88ff9a24ee711a415`
- 地图：21x13，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：502 条，remaining=0，事件=ATTACK=121, HEAL=3, NEXT_TURN=45, NONE=79, OCCUPY=33, REPAIR=4, STANDBY=215, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
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
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 232 / 232 条 APK 记录，展开项目动作 370 个
- 终局状态：turn=7，currentPlayer=5，winner=-
- 首个问题：无

### game_get_20260704_131211_016.bin

- 状态：通过
- SHA256：`a0aa3f4c900774d6979927748beee909a18ce405297cead0b352282064397211`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2983 条，remaining=0，事件=ATTACK=739, HEAL=100, NEXT_TURN=156, NONE=264, OCCUPY=34, STANDBY=1588, SUMMON=11, SUPPORT=89, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 2983 / 2983 条 APK 记录，展开项目动作 4775 个
- 终局状态：turn=27，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_131212_017.bin

- 状态：通过
- SHA256：`a2e8d7cc8d35ce0d09dfeceb26a7ec21060e0c90c9ddf19bc3d26c88273fcc1d`
- 地图：18x19，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=80，levelCap=7
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1 条，remaining=0，事件=NEXT_TURN=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 1 / 1 条 APK 记录，展开项目动作 1 个
- 终局状态：turn=1，currentPlayer=1，winner=-
- 首个问题：无

### game_get_20260704_131221_018.bin

- 状态：通过
- SHA256：`022a8ed5f05cc9e87ec0f3e7f6d1a02b147db68392945b37fac1a1c0c313b423`
- 地图：21x13，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2154 条，remaining=0，事件=ATTACK=897, HEAL=31, NEXT_TURN=140, NONE=220, OCCUPY=36, REPAIR=4, STANDBY=768, SUMMON=37, SUPPORT=20, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 2154 / 2154 条 APK 记录，展开项目动作 3443 个
- 终局状态：turn=24，currentPlayer=5，winner=1
- 首个问题：无

### game_get_20260704_131229_019.bin

- 状态：通过
- SHA256：`1fa374fe09d3ba5ca7ade09166bbdc5e179f1e302353ad986297854718e3e5a4`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：4868 条，remaining=0，事件=ATTACK=1337, HEAL=241, NEXT_TURN=252, NONE=410, OCCUPY=34, STANDBY=2412, SUMMON=26, SUPPORT=154, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 4868 / 4868 条 APK 记录，展开项目动作 7710 个
- 终局状态：turn=43，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_131235_020.bin

- 状态：通过
- SHA256：`a0f4b5dde4a1c7fbd92aeaf4a24ff3cae34ed292ee2a472049c85936e669cc0b`
- 地图：21x13，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1728 条，remaining=0，事件=ATTACK=436, HEAL=15, NEXT_TURN=109, NONE=175, OCCUPY=33, REPAIR=4, STANDBY=910, SUMMON=10, SUPPORT=34, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 1728 / 1728 条 APK 记录，展开项目动作 2724 个
- 终局状态：turn=21，currentPlayer=0，winner=6
- 首个问题：无

### game_get_20260704_131256_021.bin

- 状态：通过
- SHA256：`cfd8d0fadd578adb2ce3529591d3de40709fe63d08139523b5635ae82813df11`
- 地图：11x19，玩家=[0,1,2,3,5]，初始单位=5，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1370 条，remaining=0，事件=ATTACK=368, HEAL=29, NEXT_TURN=146, NONE=111, OCCUPY=11, REPAIR=4, STANDBY=698, SUMMON=2, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 1370 / 1370 条 APK 记录，展开项目动作 2154 个
- 终局状态：turn=41，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_131304_022.bin

- 状态：通过
- SHA256：`ea7eaf070647f1e6c8120bed0fdca988bcd6c386ce39b2901347c1f2a39e62ec`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：881 条，remaining=0，事件=ATTACK=292, NEXT_TURN=92, NONE=93, OCCUPY=13, REPAIR=2, STANDBY=387, SUMMON=1, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 881 / 881 条 APK 记录，展开项目动作 1476 个
- 终局状态：turn=33，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_131309_023.bin

- 状态：通过
- SHA256：`c72987ab331977bdb826a5f81defe3dd91b7737c856291cc2a9f426d95531c93`
- 地图：19x20，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=500
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：4952 条，remaining=0，事件=ATTACK=652, HEAL=423, NEXT_TURN=176, NONE=316, OCCUPY=42, STANDBY=3192, SUMMON=14, SUPPORT=135, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 4952 / 4952 条 APK 记录，展开项目动作 7294 个
- 终局状态：turn=34，currentPlayer=1，winner=6
- 首个问题：无

### game_get_20260704_131316_024.bin

- 状态：通过
- SHA256：`5899b63571e1fc9894c99ab14bed94e53b6ce42a3db5383a29f2d20aefd9bf0c`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1312 条，remaining=0，事件=ATTACK=394, NEXT_TURN=117, NONE=115, OCCUPY=15, REPAIR=2, STANDBY=662, SUMMON=6, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 1312 / 1312 条 APK 记录，展开项目动作 2213 个
- 终局状态：turn=41，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_131318_025.bin

- 状态：通过
- SHA256：`5b0bf971c2bd1f628115fbb116fddfd55dc897144830d5783ffb93d5f57e2400`
- 地图：12x12，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=150
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=150，unitLimit=50，levelCap=4
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：69 条，remaining=0，事件=ATTACK=5, NEXT_TURN=17, NONE=13, OCCUPY=2, REPAIR=3, STANDBY=29
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 69 / 69 条 APK 记录，展开项目动作 105 个
- 终局状态：turn=3，currentPlayer=5，winner=-
- 首个问题：无

### game_get_20260704_131321_026.bin

- 状态：通过
- SHA256：`ea66acda66a4944e469a3978c094bf6b5fe9bed8ed625759dc732190ee53ae1b`
- 地图：21x13，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：842 条，remaining=0，事件=ATTACK=294, HEAL=18, NEXT_TURN=64, NONE=110, OCCUPY=29, REPAIR=4, STANDBY=304, SUMMON=14, SUPPORT=3, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 842 / 842 条 APK 记录，展开项目动作 1353 个
- 终局状态：turn=12，currentPlayer=0，winner=6
- 首个问题：无

### game_get_20260704_131324_027.bin

- 状态：通过
- SHA256：`a68d4d267931f7c06efe5c70180e0333367d395d3616cc5f1e7b217fa3838239`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：802 条，remaining=0，事件=ATTACK=263, NEXT_TURN=86, NONE=85, OCCUPY=14, REPAIR=2, STANDBY=348, SUMMON=3, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
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
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 790 / 790 条 APK 记录，展开项目动作 1305 个
- 终局状态：turn=31，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_131337_029.bin

- 状态：通过
- SHA256：`42f2ac258b2d553738adef894869f75de174edf1d3c52844a4eab6761288ecd4`
- 地图：21x13，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2305 条，remaining=0，事件=ATTACK=960, HEAL=41, NEXT_TURN=143, NONE=224, OCCUPY=38, REPAIR=4, STANDBY=803, SUMMON=58, SUPPORT=34
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 2305 / 2305 条 APK 记录，展开项目动作 3580 个
- 终局状态：turn=24，currentPlayer=5，winner=1
- 首个问题：无

### game_get_20260704_131343_030.bin

- 状态：通过
- SHA256：`47d22296f31a9e9354cb28a2f4c5750f6661af1d999c827f8f8b27268e1ad8ba`
- 地图：11x19，玩家=[0,1,2,3,5]，初始单位=5，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1387 条，remaining=0，事件=ATTACK=386, HEAL=27, NEXT_TURN=142, NONE=108, OCCUPY=13, REPAIR=4, STANDBY=699, SUMMON=7, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 1387 / 1387 条 APK 记录，展开项目动作 2169 个
- 终局状态：turn=40，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_131347_031.bin

- 状态：通过
- SHA256：`2f5872f43c59165f8a636c0594c85938d950236fc55b82a6b96773bf70831706`
- 地图：15x12，玩家=[0,1,2,3]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1601 条，remaining=0，事件=ATTACK=419, HEAL=74, NEXT_TURN=151, NONE=121, OCCUPY=18, REPAIR=3, STANDBY=776, SUMMON=10, SUPPORT=28, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 1601 / 1601 条 APK 记录，展开项目动作 2458 个
- 终局状态：turn=55，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_131350_032.bin

- 状态：通过
- SHA256：`608cd9e1c9a4f714c29df68940d63837dfa9192440a971ad678d8ff57c3a4fa2`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：991 条，remaining=0，事件=ATTACK=169, HEAL=14, NEXT_TURN=73, NONE=123, OCCUPY=35, STANDBY=552, SUMMON=1, SUPPORT=24
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 991 / 991 条 APK 记录，展开项目动作 1685 个
- 终局状态：turn=13，currentPlayer=1，winner=-
- 首个问题：无

### game_get_20260704_131352_033.bin

- 状态：通过
- SHA256：`db26bbedcec2cbc8dc211c0a6461f1ca4075149c6a428f71b12d78e8a49bcbe2`
- 地图：12x12，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=150
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=150，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：286 条，remaining=0，事件=ATTACK=57, HEAL=7, NEXT_TURN=45, NONE=40, OCCUPY=7, REPAIR=3, STANDBY=122, SUPPORT=3, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 286 / 286 条 APK 记录，展开项目动作 453 个
- 终局状态：turn=9，currentPlayer=1，winner=2
- 首个问题：无

## 结论说明

- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。
- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。
- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。
- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。