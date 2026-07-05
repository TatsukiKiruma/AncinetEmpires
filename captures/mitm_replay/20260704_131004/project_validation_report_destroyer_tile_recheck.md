# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-04T14:27:11.913Z
- 输入目录：`C:\code\AncinetEmpires\captures\mitm_replay`
- 规则模式：SD
- 抽样文件上限：全部
- 招募歧义处理：允许选第一个合法部署点继续
- 地形处理：未映射地形使用道路兜底并记录
- 文件数：5，唯一校验：5，重复跳过：0，通过：5，失败：0，解析错误：0

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
| game_get_20260704_131501_042.bin | 85f9f7d03e9d | 21x25, P[0,1,2,3,4,5] | 1708 | 通过 | 1708/1708 | - |
| game_get_20260704_132113_083.bin | ae698fd18822 | 21x21, P[0,1,2,3,4,5] | 3137 | 通过 | 3137/3137 | - |
| game_get_20260704_132207_088.bin | d59bd75aeb12 | 9x11, P[1,3] | 159 | 通过 | 159/159 | - |
| game_get_20260704_132403_098.bin | 3f3903b3f828 | 21x21, P[0,1,2,3,4,5] | 4645 | 通过 | 4645/4645 | - |
| game_get_20260704_132603_109.bin | 2aa07d934087 | 21x21, P[0,1,2,3,4,5] | 2931 | 通过 | 2931/2931 | - |

## 明细

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

## 结论说明

- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。
- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。
- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。
- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。