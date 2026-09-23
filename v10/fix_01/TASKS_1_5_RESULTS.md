# 任务 1–5 执行结果（v10 fix_01）

生成时间：2026-09-23T03:10:44.770Z

## 1. T10-01 大样本确认（真实开局变体）
- SPATIAL_V2_BEST: 40 场, 0W/33L/7T, natural W/(W+L)=0%, trunc=17.5%
- SPATIAL_V2_OLD: 40 场, 5W/29L/6T, natural W/(W+L)=14.7%, trunc=15%
- S00_SEARCH: 22 场, 7W/6L/9T, natural W/(W+L)=53.8%, trunc=40.9%
- S10_SEARCH_BEST: 20 场, 5W/4L/11T, natural W/(W+L)=55.6%, trunc=55%
- 结论：{"purePolicy":"NO confirmed pure-policy improvement: SPATIAL_V2_BEST is not above the old model.","search":"INCONCLUSIVE: S10 point-estimate 55.6% vs S00 53.8%, but samples are 20 vs 22 matches with 41-55% truncation; do not claim a search improvement.","searchSampleNote":"Search arms were stopped early; pure-policy arms completed 40 matches per arm."}

## 2. T10-04 正式同工作量对照
- S00_SEARCH: 26 场, 4W/10L/12T, natural W/(W+L)=28.6%, trunc=46.2%
- T10_TURN_SEARCH: 40 场, 0W/29L/11T, natural W/(W+L)=0%, trunc=27.5%
- 结论：Turn-aware search did not beat S00 on this formal development run.

## 3. T10-03 数据扩量与重评
- 新数据量：256 局采样, 3980 唯一状态进入 C（目标 2k–5k 已达成）
- C 消费新样本：3980/3980
- A/B/C 自然 W/(W+L)=0% / 0% / 0%
- 结论：C did not improve over B on natural terminals under equal optimizer steps. Report as no verified gain.

## 4. T10-05 等价/软排序损失对照
- t10-05-loss-ce: ce, top1=46.88%, groupAcc=46.88%, regret=290.1595
- t10-05-loss-soft-equiv: soft+equiv, top1=45.39%, groupAcc=45.39%, regret=243.5707
- 结论：Mixed result: soft+equiv improves teacher-regret ranking (243.57 vs 290.16) but lowers held-out top-1 accuracy (45.39% vs 46.88%); no adoption without a second seed and playout validation.

## 5. T10-06 更多自然终局、分层与搜索内验证
- 数据：episodes=454, natural=349, uniqueStates=79595, replayErrors=0
- value 样本：4888（自然 3983）；qualification=false
- Arm2: pearson=0.0556, MSE=0.8656, ECE=0.033
- 按采集策略分层：{"HEURISTIC":{"count":96,"mse":0.8839,"pearson":-0.1465,"actualWinRate":0.6771},"SPATIAL_V2_OLD":{"count":128,"mse":1.054,"pearson":0.3693,"actualWinRate":0.5703},"SPATIAL_V2_BEST":{"count":1248,"mse":0.8565,"pearson":0.0436,"actualWinRate":0.6907},"SPATIAL_V2_LAST":{"count":96,"mse":0.9157,"pearson":-0.005,"actualWinRate":0.6563},"S00_SEARCH":{"count":103,"mse":0.7632,"pearson":-0.1104,"actualWinRate":0.7476},"S10_SEARCH_BEST":{"count":96,"mse":0.7957,"pearson":-0.1652,"actualWinRate":0.7292},"T10_TURN_SEARCH":{"count":125,"mse":0.8245,"pearson":0.27,"actualWinRate":0.704},"T10_TURN_SEARCH_VALUE":{"count":7,"mse":1.3065,"pearson":0.1667,"actualWinRate":0.4286}}
- 搜索内 value 对照：{"T10_TURN_SEARCH_VALUE":{"label":"T10_TURN_SEARCH_VALUE","matches":20,"wins":0,"losses":12,"draws":0,"truncations":8,"naturalWinRate":0,"winRateAllMatches":0,"ci95Natural":[0,24.3],"ci95All":[0,16.1],"truncationRate":40},"T10_TURN_SEARCH":{"label":"T10_TURN_SEARCH","matches":20,"wins":0,"losses":14,"draws":0,"truncations":6,"naturalWinRate":0,"winRateAllMatches":0,"ci95Natural":[0,21.5],"ci95All":[0,16.1],"truncationRate":30}}

## 闸门
- T10-07: NOT_RUN（T10-03 无正向收益，T10-06 未 qualified）
- T10-08: NOT_RUN（无冻结候选、无 400 场确认预算）