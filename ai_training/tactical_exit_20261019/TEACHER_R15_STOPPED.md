# teacher-r15停止新增槽位记录

计划150槽，实际105槽/62842动作及所有日志反扑见证strict通过。未运行槽不补全、不计为胜负。此版本未获得教师资格，不采样。

固定搜索最终22/30胜，低于pure24胜。停止新增扩展槽位，在途正常结束并全部strict。

|组|实际分类|p50/p95/p99 ms|
|---|---|---|
|fixed/apk_like/hierarchical|{"natural_loss": 3, "natural_win": 6, "action_truncation": 1}|34.31/136.20/353.54|
|fixed/apk_like/pure|{"natural_win": 6, "natural_loss": 4}|45.61/239.31/415.16|
|fixed/apk_like/teacher_search|{"natural_win": 7, "action_truncation": 1, "natural_loss": 2}|46.77/197.27/285.06|
|expanded/heuristic/hierarchical|{"natural_win": 4, "natural_loss": 1}|45.06/236.73/455.44|
|expanded/heuristic/pure|{"natural_win": 4, "natural_loss": 1}|61.75/288.21/429.41|
|expanded/heuristic/teacher_search|{"natural_win": 5}|55.29/284.80/405.16|
|fixed/heuristic/hierarchical|{"natural_loss": 4, "natural_win": 6}|33.48/159.33/407.82|
|fixed/heuristic/pure|{"natural_win": 8, "natural_loss": 2}|46.03/191.63/328.82|
|fixed/heuristic/teacher_search|{"natural_win": 5, "natural_loss": 5}|46.69/204.35/368.08|
|fixed/random/hierarchical|{"natural_win": 10}|34.56/131.11/218.03|
|fixed/random/pure|{"natural_win": 10}|42.91/145.98/208.19|
|fixed/random/teacher_search|{"natural_win": 10}|45.30/188.96/273.73|