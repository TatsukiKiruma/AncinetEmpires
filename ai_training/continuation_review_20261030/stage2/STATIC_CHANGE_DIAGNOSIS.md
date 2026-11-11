# 三原臂胜负变化静态诊断

共19个臂×局结果变化，覆盖11个不同面板局ID。原有三臂未通过结论保持；没有重放、前向或新增对局。

| 臂 | 局ID | 地图/类别 | 实际手序 | 基线→候选 | 相同原子前缀 | 首次分支 | 困难回退基线→候选 |
|---|---|---|---|---|---:|---|---|
| lr-1e-4 | hard-2-s1 | (2) Icy Paths.aem/skill | first | natural_win→natural_loss | 17 | 第17步/model，同前态=True | 0→0 |
| lr-1e-4 | hard-9-s1 | (2) Mourningstar.aem/preset_units | second | natural_loss→natural_win | 41 | 第41步/model，同前态=True | 0→0 |
| lr-1e-4 | simple-4-s0 | (2) Mourningstar.aem/advantage_endgame | first | natural_win→natural_loss | 0 | 第0步/model，同前态=True | 无→无 |
| lr-1e-4 | simple-5-s1 | (2) Peak Island.aem/preset_units | first | natural_loss→natural_win | 0 | 第0步/model，同前态=True | 无→无 |
| lr-1e-4 | simple-9-s0 | (2) Mourningstar.aem/preset_units | first | natural_win→natural_loss | 0 | 第0步/model，同前态=True | 无→无 |
| lr-5e-5 | hard-0-s1 | (2) Crossed swords.aem/advantage_endgame | second | natural_win→natural_loss | 17 | 第17步/model，同前态=True | 0→1 |
| lr-5e-5 | simple-0-s0 | (2) Crossed swords.aem/advantage_endgame | first | natural_win→natural_loss | 4 | 第4步/model，同前态=True | 无→无 |
| lr-5e-5 | simple-1-s0 | (2) Duel.aem/preset_units | second | natural_loss→natural_win | 19 | 第19步/model，同前态=True | 无→无 |
| lr-5e-5 | simple-3-s0 | (2) Liberty Port.aem/advantage_endgame | first | natural_win→natural_loss | 0 | 第0步/model，同前态=True | 无→无 |
| lr-5e-5 | simple-4-s0 | (2) Mourningstar.aem/advantage_endgame | first | natural_win→natural_loss | 0 | 第0步/model，同前态=True | 无→无 |
| lr-5e-5 | simple-5-s1 | (2) Peak Island.aem/preset_units | first | natural_loss→natural_win | 0 | 第0步/model，同前态=True | 无→无 |
| lr-2.4495e-4 | hard-0-s1 | (2) Crossed swords.aem/advantage_endgame | second | natural_win→natural_loss | 17 | 第17步/model，同前态=True | 0→0 |
| lr-2.4495e-4 | hard-2-s1 | (2) Icy Paths.aem/skill | first | natural_win→natural_loss | 9 | 第9步/model，同前态=True | 0→5 |
| lr-2.4495e-4 | hard-4-s1 | (2) Mourningstar.aem/advantage_endgame | second | natural_win→natural_loss | 22 | 第22步/model，同前态=True | 0→0 |
| lr-2.4495e-4 | hard-9-s1 | (2) Mourningstar.aem/preset_units | second | natural_loss→natural_win | 41 | 第41步/model，同前态=True | 0→0 |
| lr-2.4495e-4 | simple-1-s0 | (2) Duel.aem/preset_units | second | natural_loss→natural_win | 19 | 第19步/model，同前态=True | 无→无 |
| lr-2.4495e-4 | simple-2-s0 | (2) Icy Paths.aem/skill | second | natural_loss→natural_win | 26 | 第26步/model，同前态=True | 无→无 |
| lr-2.4495e-4 | simple-4-s0 | (2) Mourningstar.aem/advantage_endgame | first | natural_win→natural_loss | 0 | 第0步/model，同前态=True | 无→无 |
| lr-2.4495e-4 | simple-5-s1 | (2) Peak Island.aem/preset_units | first | natural_loss→natural_win | 0 | 第0步/model，同前态=True | 无→无 |

完整首个不同动作编码、候选数量、延迟和回退/拒绝计划/错误计数见同名JSON；不把不同分支后局面直接对齐解释为某步导致输赢。

三原臂离线旧保留和新适应均通过，但困难得分10/9/8；高学习率简单18胜与困难8胜并存。新dev标签一致率提高而困难胜率未改善是本面板观测，不能确定是学习率、技能、建筑、先验或某个动作造成。多人仅离线，双人正常新数据格缺失和同图开发面板限制继续存在。

只授权一次1e-4抽样seed复验；不据这些变化修改先验、搜索、loss权重或对手规则，不追加第三seed。
