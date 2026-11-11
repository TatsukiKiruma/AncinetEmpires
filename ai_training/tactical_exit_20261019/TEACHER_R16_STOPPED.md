# teacher-r16停止新增槽位记录

计划150槽，实际88槽/53800动作及所有日志反扑见证strict通过。未运行槽不补全、不计为胜负。此版本未获得教师资格，不采样。

固定搜索已完成28槽21胜，即使剩余2槽全胜也仅23胜，低于pure24。停止新增槽位，在途正常结束并全部strict。

|组|实际分类|p50/p95/p99 ms|
|---|---|---|
|fixed/apk_like/hierarchical|{"natural_loss": 3, "natural_win": 6, "action_truncation": 1}|33.19/130.59/351.86|
|fixed/apk_like/pure|{"natural_win": 6, "natural_loss": 4}|43.80/231.64/393.55|
|fixed/apk_like/teacher_search|{"natural_win": 7, "action_truncation": 1, "natural_loss": 2}|49.83/198.73/284.27|
|fixed/heuristic/hierarchical|{"natural_loss": 4, "natural_win": 6}|33.74/160.23/377.56|
|fixed/heuristic/pure|{"natural_win": 7, "natural_loss": 2}|45.24/196.66/348.52|
|fixed/heuristic/teacher_search|{"natural_win": 5, "natural_loss": 4}|50.44/213.59/380.24|
|fixed/random/hierarchical|{"natural_win": 10}|33.52/126.82/212.96|
|fixed/random/pure|{"natural_win": 10}|40.88/138.44/195.34|
|fixed/random/teacher_search|{"natural_win": 10}|46.95/195.66/273.31|