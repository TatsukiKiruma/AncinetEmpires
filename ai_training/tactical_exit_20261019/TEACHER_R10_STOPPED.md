# teacher-r10停止新增槽位记录

计划150槽，实际114槽/67442动作及所有日志反扑见证strict通过。未运行槽不补全、不计为胜负。此版本未获得教师资格，不采样。

固定自然胜上限低于pure24，保留在途正常完成

|组|实际分类|p50/p95/p99 ms|
|---|---|---|
|fixed/apk_like/hierarchical|{"natural_loss": 3, "natural_win": 6, "action_truncation": 1}|34.03/139.24/356.29|
|fixed/apk_like/pure|{"natural_win": 6, "natural_loss": 4}|46.47/240.18/415.67|
|fixed/apk_like/teacher_search|{"natural_win": 6, "action_truncation": 1, "natural_loss": 3}|48.76/271.60/391.58|
|expanded/heuristic/hierarchical|{"natural_win": 7, "natural_loss": 1}|44.14/206.40/435.18|
|expanded/heuristic/pure|{"natural_win": 7, "natural_loss": 1}|61.09/287.49/429.31|
|expanded/heuristic/teacher_search|{"natural_loss": 3, "natural_win": 5}|57.54/284.84/475.00|
|fixed/heuristic/hierarchical|{"natural_loss": 4, "natural_win": 6}|34.88/161.00/396.50|
|fixed/heuristic/pure|{"natural_win": 8, "natural_loss": 2}|47.13/200.19/349.36|
|fixed/heuristic/teacher_search|{"natural_win": 6, "natural_loss": 4}|46.02/239.48/381.32|
|fixed/random/hierarchical|{"natural_win": 10}|34.48/129.21/230.45|
|fixed/random/pure|{"natural_win": 10}|43.27/143.58/209.99|
|fixed/random/teacher_search|{"natural_win": 10}|47.75/205.11/308.82|