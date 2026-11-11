# teacher-r8停止新增槽位记录

计划150槽，实际87槽/54237动作及所有日志反扑见证strict通过。未运行槽不补全、不计为胜负。此版本未获得教师资格，不采样。

固定30槽自然胜场最大可能值已低于pure的24，禁止不合格教师采样

|组|实际分类|p50/p95/p99 ms|
|---|---|---|
|fixed/apk_like/hierarchical|{"natural_loss": 3, "natural_win": 6, "action_truncation": 1}|34.28/139.04/377.73|
|fixed/apk_like/pure|{"natural_win": 6, "natural_loss": 4}|46.26/243.43/415.46|
|fixed/apk_like/teacher_search|{"natural_win": 5, "natural_loss": 4, "action_truncation": 1}|54.42/268.60/456.02|
|fixed/heuristic/hierarchical|{"natural_loss": 4, "natural_win": 5}|35.14/162.29/356.91|
|fixed/heuristic/pure|{"natural_win": 7, "natural_loss": 2}|48.08/204.27/365.97|
|fixed/heuristic/teacher_search|{"natural_win": 6, "natural_loss": 3}|54.50/262.54/536.25|
|fixed/random/hierarchical|{"natural_win": 10}|34.77/128.94/223.36|
|fixed/random/pure|{"natural_win": 10}|43.84/145.96/213.18|
|fixed/random/teacher_search|{"natural_win": 10}|50.03/220.07/307.46|