# 阶段2最佳权重无损提速复测

固定五图双座位，每档10槽；2000原子 / 600秒 / 单决策30秒。两轮调试轨迹单独保留在battles-attempt1/2；补齐缓存兵种与城堡光环阈值后完整重跑，未挑选结果。

|对手|自然胜|自然负|动作截断|墙钟截断|错误|原墙钟转自然胜|第10轮收入差|strict动作|
|---|---:|---:|---:|---:|---:|---:|---:|---:|
|random|4|0|6|0|0|0|406.25|14464|
|apk_like|1|4|5|0|0|0|65.00|12537|
|heuristic|2|6|2|0|0|0|2.78|9111|

|固定槽|原分类|新分类|原子|秒|与阶段2动作前缀相同|
|---|---|---|---:|---:|---|
|random-best-group_mass-m0-s0|natural_win|natural_win|352|25.41|True|
|random-best-group_mass-m1-s0|natural_win|natural_win|139|13.11|True|
|random-best-group_mass-m2-s0|wall_truncation|action_truncation|2000|247.61|True|
|random-best-group_mass-m3-s0|wall_truncation|action_truncation|2000|217.95|True|
|random-best-group_mass-m4-s0|natural_win|natural_win|199|18.31|True|
|random-best-group_mass-m0-s1|natural_win|natural_win|1774|141.60|True|
|random-best-group_mass-m1-s1|wall_truncation|action_truncation|2000|215.22|True|
|random-best-group_mass-m2-s1|wall_truncation|action_truncation|2000|232.69|True|
|random-best-group_mass-m3-s1|wall_truncation|action_truncation|2000|165.01|True|
|random-best-group_mass-m4-s1|wall_truncation|action_truncation|2000|222.95|True|
|apk_like-best-group_mass-m0-s0|action_truncation|action_truncation|2000|112.82|True|
|apk_like-best-group_mass-m1-s0|natural_loss|natural_loss|409|14.89|True|
|apk_like-best-group_mass-m2-s0|natural_loss|natural_loss|701|17.89|True|
|apk_like-best-group_mass-m3-s0|natural_loss|natural_loss|857|12.74|True|
|apk_like-best-group_mass-m4-s0|wall_truncation|action_truncation|2000|160.96|True|
|apk_like-best-group_mass-m0-s1|natural_loss|natural_loss|194|4.44|True|
|apk_like-best-group_mass-m1-s1|wall_truncation|action_truncation|2000|244.72|True|
|apk_like-best-group_mass-m2-s1|action_truncation|action_truncation|2000|31.18|True|
|apk_like-best-group_mass-m3-s1|action_truncation|action_truncation|2000|112.49|True|
|apk_like-best-group_mass-m4-s1|natural_win|natural_win|376|36.88|True|
|heuristic-best-group_mass-m0-s0|natural_win|natural_win|606|43.66|True|
|heuristic-best-group_mass-m1-s0|natural_loss|natural_loss|761|57.76|True|
|heuristic-best-group_mass-m2-s0|natural_loss|natural_loss|626|45.34|True|
|heuristic-best-group_mass-m3-s0|natural_loss|natural_loss|717|31.17|True|
|heuristic-best-group_mass-m4-s0|wall_truncation|action_truncation|2000|168.36|True|
|heuristic-best-group_mass-m0-s1|natural_loss|natural_loss|175|8.21|True|
|heuristic-best-group_mass-m1-s1|natural_win|natural_win|1235|112.54|True|
|heuristic-best-group_mass-m2-s1|natural_loss|natural_loss|384|32.21|True|
|heuristic-best-group_mass-m3-s1|natural_loss|natural_loss|607|27.14|True|
|heuristic-best-group_mass-m4-s1|wall_truncation|action_truncation|2000|227.44|True|
