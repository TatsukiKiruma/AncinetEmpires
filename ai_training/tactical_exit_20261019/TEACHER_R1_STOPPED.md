# 教师R1停止新增槽位记录

计划150槽，实际完成76槽/49865动作，全部strict及反扑见证核验通过。其余槽未提交动作。没有完整资格结论，不允许作为在线纠错教师。

定位到默认保底缺陷：未触发Veto/Takeover仍提交轻量plan队列，普通空城新兵被wait覆盖真实移动。停止新槽位后在途对局均完成，原始数据完整保留。

|组|实际分类|
|---|---|
|fixed/apk_like/hierarchical|{"natural_loss": 3, "natural_win": 6, "action_truncation": 1}|
|fixed/apk_like/pure|{"natural_win": 6, "natural_loss": 4}|
|fixed/apk_like/teacher_search|{"action_truncation": 3, "natural_loss": 3, "natural_win": 4}|
|fixed/heuristic/hierarchical|{"natural_loss": 3, "natural_win": 3}|
|fixed/heuristic/pure|{"natural_win": 4, "natural_loss": 1}|
|fixed/heuristic/teacher_search|{"natural_loss": 4, "natural_win": 1}|
|fixed/random/hierarchical|{"natural_win": 10}|
|fixed/random/pure|{"natural_win": 10}|
|fixed/random/teacher_search|{"natural_win": 10}|

首处分歧的状态hash、默认动作和干预标志见teacher-r1-stopped-summary.json。修订不改变模型、评分系数或候选预算。