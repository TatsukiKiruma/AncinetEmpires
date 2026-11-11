# teacher-r14停止新增槽位记录

计划150槽，实际90槽/55730动作及所有日志反扑见证strict通过。未运行槽不补全、不计为胜负。此版本未获得教师资格，不采样。

固定搜索已完成28槽、21胜，剩余全胜最多23，低于pure24胜。停止新增，在途正常结束并全部strict；绝对同单位Veto优先未获棋力支持。

|组|实际分类|p50/p95/p99 ms|
|---|---|---|
|fixed/apk_like/hierarchical|{"natural_loss": 3, "natural_win": 6, "action_truncation": 1}|34.24/139.95/365.50|
|fixed/apk_like/pure|{"natural_win": 6, "natural_loss": 4}|46.76/240.38/415.79|
|fixed/apk_like/teacher_search|{"natural_win": 7, "action_truncation": 1, "natural_loss": 2}|46.22/204.94/324.89|
|fixed/heuristic/hierarchical|{"natural_loss": 4, "natural_win": 6}|35.41/165.86/399.54|
|fixed/heuristic/pure|{"natural_win": 8, "natural_loss": 2}|47.64/198.85/356.92|
|fixed/heuristic/teacher_search|{"natural_win": 5, "natural_loss": 5}|52.93/235.55/370.70|
|fixed/random/hierarchical|{"natural_win": 10}|35.14/131.34/232.29|
|fixed/random/pure|{"natural_win": 10}|43.49/147.76/206.75|
|fixed/random/teacher_search|{"natural_win": 10}|50.40/189.44/261.55|