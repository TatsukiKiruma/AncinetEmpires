# teacher-r9停止新增槽位记录

计划150槽，实际118槽/69948动作及所有日志反扑见证strict通过。未运行槽不补全、不计为胜负。此版本未获得教师资格，不采样。

固定自然胜最大可能值已低于pure24，停止新增并等待在途正常结束

|组|实际分类|p50/p95/p99 ms|
|---|---|---|
|fixed/apk_like/hierarchical|{"natural_loss": 3, "natural_win": 6, "action_truncation": 1}|34.25/137.89/367.68|
|fixed/apk_like/pure|{"natural_win": 6, "natural_loss": 4}|46.94/241.91/429.02|
|fixed/apk_like/teacher_search|{"natural_win": 6, "action_truncation": 1, "natural_loss": 3}|53.29/271.06/384.83|
|expanded/heuristic/hierarchical|{"natural_win": 9, "natural_loss": 1}|49.10/249.25/506.49|
|expanded/heuristic/pure|{"natural_win": 8, "natural_loss": 1}|66.14/358.79/578.66|
|expanded/heuristic/teacher_search|{"natural_loss": 4, "natural_win": 5}|67.13/314.50/488.37|
|fixed/heuristic/hierarchical|{"natural_loss": 4, "natural_win": 6}|34.68/166.76/393.25|
|fixed/heuristic/pure|{"natural_win": 8, "natural_loss": 2}|46.93/194.52/352.63|
|fixed/heuristic/teacher_search|{"natural_win": 6, "natural_loss": 4}|53.64/266.51/387.57|
|fixed/random/hierarchical|{"natural_win": 10}|34.81/134.14/226.20|
|fixed/random/pure|{"natural_win": 10}|43.26/144.56/202.71|
|fixed/random/teacher_search|{"natural_win": 10}|51.65/217.81/315.09|