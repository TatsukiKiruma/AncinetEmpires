# teacher-r12停止新增槽位记录

计划150槽，实际87槽/53115动作及所有日志反扑见证strict通过。未运行槽不补全、不计为胜负。此版本未获得教师资格，不采样。

固定搜索已完成28槽、21自然胜，余2槽全胜也仅23胜，低于pure24胜。停止新增，在途正常结束并全部strict。

|组|实际分类|p50/p95/p99 ms|
|---|---|---|
|fixed/apk_like/hierarchical|{"natural_loss": 3, "natural_win": 6, "action_truncation": 1}|34.54/136.64/355.98|
|fixed/apk_like/pure|{"natural_win": 6, "natural_loss": 4}|46.22/236.16/420.52|
|fixed/apk_like/teacher_search|{"natural_win": 7, "natural_loss": 3}|50.69/225.58/352.02|
|fixed/heuristic/hierarchical|{"natural_loss": 4, "natural_win": 5}|34.53/160.48/354.71|
|fixed/heuristic/pure|{"natural_win": 7, "natural_loss": 2}|47.74/205.63/373.05|
|fixed/heuristic/teacher_search|{"natural_win": 6, "natural_loss": 3}|46.62/204.09/344.03|
|fixed/random/hierarchical|{"natural_win": 10}|34.73/133.54/224.77|
|fixed/random/pure|{"natural_win": 10}|43.93/146.64/206.39|
|fixed/random/teacher_search|{"natural_win": 9, "action_truncation": 1}|53.76/186.70/263.56|