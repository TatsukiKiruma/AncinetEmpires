# teacher-r5停止新增槽位记录

计划150槽，实际89槽/58123动作及所有日志反扑见证strict通过。未运行槽不补全、不计为胜负。此版本未获得教师资格，不采样。

源码审查发现既有风险延后守卫未检查默认行动者是否本身具有已验证的防守连动；停止新槽，待现有对局及strict结束后核验回归

|组|实际分类|p50/p95/p99 ms|
|---|---|---|
|fixed/apk_like/hierarchical|{"natural_loss": 3, "natural_win": 6, "action_truncation": 1}|34.35/136.22/366.74|
|fixed/apk_like/pure|{"natural_win": 6, "natural_loss": 4}|46.01/238.82/433.54|
|fixed/apk_like/teacher_search|{"natural_win": 5, "natural_loss": 4, "action_truncation": 1}|55.35/297.92/493.92|
|fixed/heuristic/hierarchical|{"natural_loss": 4, "natural_win": 6}|34.87/163.85/405.08|
|fixed/heuristic/pure|{"natural_win": 8, "natural_loss": 2}|47.31/197.49/356.13|
|fixed/heuristic/teacher_search|{"natural_win": 7, "natural_loss": 2}|60.14/254.20/409.77|
|fixed/random/hierarchical|{"natural_win": 10}|35.01/129.60/214.75|
|fixed/random/pure|{"natural_win": 10}|43.87/146.08/209.44|
|fixed/random/teacher_search|{"natural_win": 10}|50.01/221.48/332.78|