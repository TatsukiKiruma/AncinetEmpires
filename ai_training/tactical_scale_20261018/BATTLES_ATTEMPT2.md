# 阶段2最佳权重无损提速复测

固定五图双座位，每档10槽；2000原子 / 600秒 / 单决策30秒。首轮缓存故障调试轨迹单独保留在battles-attempt1；正式面板完整重跑，未挑选结果。

|对手|自然胜|自然负|动作截断|墙钟截断|错误|原墙钟转自然胜|第10轮收入差|strict动作|
|---|---:|---:|---:|---:|---:|---:|---:|---:|
|random|4|0|6|0|0|0|406.25|14464|
|apk_like|1|4|5|0|0|0|65.00|12537|
|heuristic|2|6|2|0|0|0|2.78|9111|

|固定槽|原分类|新分类|原子|秒|与阶段2动作前缀相同|
|---|---|---|---:|---:|---|
|random-best-group_mass-m0-s0|natural_win|natural_win|352|22.44|True|
|random-best-group_mass-m1-s0|natural_win|natural_win|139|11.79|True|
|random-best-group_mass-m2-s0|wall_truncation|action_truncation|2000|236.68|True|
|random-best-group_mass-m3-s0|wall_truncation|action_truncation|2000|208.94|True|
|random-best-group_mass-m4-s0|natural_win|natural_win|199|15.63|True|
|random-best-group_mass-m0-s1|natural_win|natural_win|1774|136.31|True|
|random-best-group_mass-m1-s1|wall_truncation|action_truncation|2000|208.29|True|
|random-best-group_mass-m2-s1|wall_truncation|action_truncation|2000|223.21|True|
|random-best-group_mass-m3-s1|wall_truncation|action_truncation|2000|160.82|True|
|random-best-group_mass-m4-s1|wall_truncation|action_truncation|2000|214.04|True|
|apk_like-best-group_mass-m0-s0|action_truncation|action_truncation|2000|97.31|True|
|apk_like-best-group_mass-m1-s0|natural_loss|natural_loss|409|12.96|True|
|apk_like-best-group_mass-m2-s0|natural_loss|natural_loss|701|17.17|True|
|apk_like-best-group_mass-m3-s0|natural_loss|natural_loss|857|11.90|True|
|apk_like-best-group_mass-m4-s0|wall_truncation|action_truncation|2000|137.10|True|
|apk_like-best-group_mass-m0-s1|natural_loss|natural_loss|194|4.18|True|
|apk_like-best-group_mass-m1-s1|wall_truncation|action_truncation|2000|210.76|True|
|apk_like-best-group_mass-m2-s1|action_truncation|action_truncation|2000|27.47|True|
|apk_like-best-group_mass-m3-s1|action_truncation|action_truncation|2000|98.87|True|
|apk_like-best-group_mass-m4-s1|natural_win|natural_win|376|32.24|True|
|heuristic-best-group_mass-m0-s0|natural_win|natural_win|606|42.55|True|
|heuristic-best-group_mass-m1-s0|natural_loss|natural_loss|761|56.76|True|
|heuristic-best-group_mass-m2-s0|natural_loss|natural_loss|626|37.52|True|
|heuristic-best-group_mass-m3-s0|natural_loss|natural_loss|717|28.04|True|
|heuristic-best-group_mass-m4-s0|wall_truncation|action_truncation|2000|169.16|True|
|heuristic-best-group_mass-m0-s1|natural_loss|natural_loss|175|6.65|True|
|heuristic-best-group_mass-m1-s1|natural_win|natural_win|1235|115.53|True|
|heuristic-best-group_mass-m2-s1|natural_loss|natural_loss|384|26.66|True|
|heuristic-best-group_mass-m3-s1|natural_loss|natural_loss|607|25.14|True|
|heuristic-best-group_mass-m4-s1|wall_truncation|action_truncation|2000|193.05|True|
