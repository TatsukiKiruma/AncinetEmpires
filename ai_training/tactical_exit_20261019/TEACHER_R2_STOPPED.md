# teacher-r2停止新增槽位记录

计划150槽，实际106槽/64614动作及所有日志反扑见证strict通过。未运行槽不补全、不计为胜负。此版本未获得教师资格，不采样。

固定30槽已完整结束：搜索20胜/阶段3 22胜/纯策略24胜，固定质量门禁失败，停止尚未启动槽位；所有在途对局完成后strict保留。R3基于战斗净值不回退、原风险目标复核和新兵合法部署保护修正守卫，不改任何数值参数。

|组|实际分类|p50/p95/p99 ms|
|---|---|---|
|fixed/apk_like/hierarchical|{"natural_loss": 3, "natural_win": 6, "action_truncation": 1}|43.41/189.19/605.81|
|fixed/apk_like/pure|{"natural_win": 6, "natural_loss": 4}|63.74/400.27/1157.54|
|fixed/apk_like/teacher_search|{"natural_win": 5, "natural_loss": 4, "action_truncation": 1}|59.01/319.44/561.32|
|expanded/heuristic/hierarchical|{"natural_win": 5, "natural_loss": 1}|77.90/627.54/2070.94|
|expanded/heuristic/pure|{"natural_win": 4, "natural_loss": 1}|115.68/617.39/1914.98|
|expanded/heuristic/teacher_search|{"natural_win": 4, "natural_loss": 1}|117.61/870.67/1709.98|
|fixed/heuristic/hierarchical|{"natural_loss": 4, "natural_win": 6}|43.26/223.26/741.15|
|fixed/heuristic/pure|{"natural_win": 8, "natural_loss": 2}|65.16/296.17/661.35|
|fixed/heuristic/teacher_search|{"natural_loss": 5, "natural_win": 5}|66.32/293.44/576.63|
|fixed/random/hierarchical|{"natural_win": 10}|41.81/169.77/291.06|
|fixed/random/pure|{"natural_win": 10}|55.22/180.28/251.54|
|fixed/random/teacher_search|{"natural_win": 10}|61.07/212.38/317.46|