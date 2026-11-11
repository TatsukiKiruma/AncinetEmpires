# teacher-r11停止新增槽位记录

计划150槽，实际89槽/56681动作及所有日志反扑见证strict通过。未运行槽不补全、不计为胜负。此版本未获得教师资格，不采样。

固定搜索已完成28槽、21自然胜，余2槽全胜也仅23胜，低于pure24胜，质量门禁已不可能达到。停止新增槽位，在途正常结束并全部strict。

|组|实际分类|p50/p95/p99 ms|
|---|---|---|
|fixed/apk_like/hierarchical|{"natural_loss": 3, "natural_win": 6, "action_truncation": 1}|35.82/145.92/364.23|
|fixed/apk_like/pure|{"natural_win": 6, "natural_loss": 4}|47.32/244.61/436.60|
|fixed/apk_like/teacher_search|{"natural_win": 7, "action_truncation": 2, "natural_loss": 1}|51.34/226.02/342.56|
|fixed/heuristic/hierarchical|{"natural_loss": 4, "natural_win": 6}|35.64/169.49/405.98|
|fixed/heuristic/pure|{"natural_win": 8, "natural_loss": 2}|48.94/203.10/360.50|
|fixed/heuristic/teacher_search|{"natural_win": 6, "natural_loss": 3}|50.81/213.45/397.30|
|fixed/random/hierarchical|{"natural_win": 10}|35.11/132.12/217.35|
|fixed/random/pure|{"natural_win": 10}|44.34/148.91/207.53|
|fixed/random/teacher_search|{"natural_win": 9, "action_truncation": 1}|53.76/193.46/261.87|