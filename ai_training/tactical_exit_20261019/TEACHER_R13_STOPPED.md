# teacher-r13停止新增槽位记录

计划150槽，实际100槽/59751动作及所有日志反扑见证strict通过。未运行槽不补全、不计为胜负。此版本未获得教师资格，不采样。

固定搜索30槽最终23胜，低于pure24胜，质量资格失败。停止新增扩展槽位，在途正常结束并全部strict。

|组|实际分类|p50/p95/p99 ms|
|---|---|---|
|fixed/apk_like/hierarchical|{"natural_loss": 3, "natural_win": 6, "action_truncation": 1}|34.86/140.51/380.43|
|fixed/apk_like/pure|{"natural_win": 6, "natural_loss": 4}|46.78/241.67/431.24|
|fixed/apk_like/teacher_search|{"natural_win": 7, "action_truncation": 1, "natural_loss": 2}|47.89/219.15/330.02|
|expanded/heuristic/hierarchical|{"natural_win": 3, "natural_loss": 1}|50.32/255.27/517.56|
|expanded/heuristic/pure|{"natural_win": 2, "natural_loss": 1}|67.89/292.20/401.29|
|expanded/heuristic/teacher_search|{"natural_loss": 2, "natural_win": 1}|79.10/380.95/471.39|
|fixed/heuristic/hierarchical|{"natural_loss": 4, "natural_win": 6}|35.15/166.59/403.44|
|fixed/heuristic/pure|{"natural_win": 8, "natural_loss": 2}|47.28/199.47/344.07|
|fixed/heuristic/teacher_search|{"natural_win": 6, "natural_loss": 4}|48.19/215.24/367.22|
|fixed/random/hierarchical|{"natural_win": 10}|34.91/134.02/223.72|
|fixed/random/pure|{"natural_win": 10}|42.93/147.99/207.72|
|fixed/random/teacher_search|{"natural_win": 10}|46.40/224.20/304.08|