# 用户授权的Gen1评测恢复

已停止旧控制器13504及D进程8812所属Gen2采集子树；Gen2事务数据保留。Gen1采集、dataset、K1/K2 final文件及TRAIN/EXPORT_PARITY均保留，SHA见FALLBACK_FIX_ASSETS.json；不重采、不重训。

C/D/E均strictFallbacks=false，回退次数只作诊断，非法动作、运行错误、非自然终局与timeForfeits仍拦截。D与E共享promotion_gate.ts：快筛max(12,B18-2)，总胜场max(36,B)，3P≥11或总胜≥max(36,B+1)，原2P/4P底线保持。

5份实际存在的误判汇总原样归档到C/D对应fallback-fix-cache-before目录，活动缓存已清除；PHASE_D_DECISION原本不存在。3份自然完赛receipt原样保留，真实回退胜局复用测试已验证sourceIdentity不变，其他半局SQLite保留继续。没有修改arena/league worker bundle及训练代码。

恢复控制器后先完整评测Gen1 K1/K2。Gen1有晋级候选即交付条件式E，不用新模型混接旧H1身份的Gen2采集；若Gen1无候选则恢复原Gen2。封存只有通过全部晋级复核后才可开启一次。
