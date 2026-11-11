# 阶段4配对实战

全部槽位为已消费开发面板；自然胜负、动作截断、墙钟和决策超时分别统计。每臂56槽，共112槽。

|模型|面板|槽数|自然胜/负|动作/墙钟/超时|整体p50/p95/p99 ms|根p50/p95/p99 ms|漏招募/end|第10轮收入差|实际集火受击/死亡|strict实际/反扑动作|
|---|---|---:|---|---|---|---|---|---:|---|---|
|dual_v2_stage4_pure|fixed|20|11/8|1/0/0|7.514/16.039/20.142|-/-/-|0/0|-5.88|206/110|13304/0|
|dual_v2_stage4_pure|expanded|20|8/10|2/0/0|9.684/29.144/42.884|-/-/-|0/1|14.71|195/107|11529/0|
|dual_v2_stage4_pure|3ffa|4|1/3|0/0/0|7.998/16.179/20.339|-/-/-|0/0|-218.75|87/46|5828/0|
|dual_v2_stage4_pure|4ffa|8|0/1|7/0/0|6.722/12.716/16.313|-/-/-|0/0|-706.25|33/10|15260/0|
|dual_v2_stage4_pure|2v2|4|0/4|0/0/0|6.709/13.650/17.534|-/-/-|0/0|-650.00|39/14|1610/0|
|dual_v2_stage4_turn_search|fixed|20|8/12|0/0/0|0.116/333.318/446.616|242.006/440.902/524.463|0/5|20.59|200/108|13324/39204|
|dual_v2_stage4_turn_search|expanded|20|14/5|1/0/0|0.205/468.898/805.958|290.616/781.272/906.278|0/6|442.19|120/56|12984/46880|
|dual_v2_stage4_turn_search|3ffa|4|1/1|2/0/0|0.129/376.902/482.657|295.576/478.614/556.623|0/5|-250.00|56/27|6622/29016|
|dual_v2_stage4_turn_search|4ffa|8|1/4|3/0/0|0.125/403.192/499.683|302.136/482.151/560.592|0/2|-500.00|45/20|11860/17469|
|dual_v2_stage4_turn_search|2v2|4|0/4|0/0/0|0.135/356.727/416.646|286.637/404.119/450.536|0/0|-506.25|54/23|1982/9598|

配对检验：`{"fixed": {"pairs": 20, "searchOnlyWins": 3, "pureOnlyWins": 6, "pValue": 0.5078125, "significant": false}, "expanded": {"pairs": 20, "searchOnlyWins": 6, "pureOnlyWins": 0, "pValue": 0.03125, "significant": true}}`。

未移动wait变化：`{"oldUnmovedWaits": 9262, "searchUnmovedWaits": 188, "pureUnmovedWaits": 214, "unmovedWaitReduction": 0.9797020082055712, "pureUnmovedWaitReduction": 0.9768948391276182}`。

门禁：`{"complete112Slots": true, "strict": false, "noTimeoutOrWall": true, "searchP95": true, "queueStepsBelow1ms": true, "missedRecruit": true, "unmovedWaits": true, "significantFixed": false, "significantExpanded": true, "historicalFixed": false, "historicalExpanded": true, "multiplayer": false, "strictFinalPanels": true, "strictAllAttempts": false}`。

逐局全部动作、耗时和反扑见证保存在battles/；strict独立重放核验完整前后态、合法动作和过程指标。截断不计自然胜利。

## 对手分层

|模型|面板|对手|槽数|自然胜/负/动作截断|
|---|---|---|---:|---|
|dual_v2_stage4_pure|2v2|heuristic|4|0/4/0|
|dual_v2_stage4_pure|3ffa|apk_like|2|1/1/0|
|dual_v2_stage4_pure|3ffa|heuristic|2|0/2/0|
|dual_v2_stage4_pure|4ffa|apk_like|4|0/0/4|
|dual_v2_stage4_pure|4ffa|heuristic|4|0/1/3|
|dual_v2_stage4_pure|expanded|heuristic|20|8/10/2|
|dual_v2_stage4_pure|fixed|apk_like|10|5/4/1|
|dual_v2_stage4_pure|fixed|heuristic|10|6/4/0|
|dual_v2_stage4_turn_search|2v2|heuristic|4|0/4/0|
|dual_v2_stage4_turn_search|3ffa|apk_like|2|0/0/2|
|dual_v2_stage4_turn_search|3ffa|heuristic|2|1/1/0|
|dual_v2_stage4_turn_search|4ffa|apk_like|4|1/0/3|
|dual_v2_stage4_turn_search|4ffa|heuristic|4|0/4/0|
|dual_v2_stage4_turn_search|expanded|heuristic|20|14/5/1|
|dual_v2_stage4_turn_search|fixed|apk_like|10|4/6/0|
|dual_v2_stage4_turn_search|fixed|heuristic|10|4/6/0|
