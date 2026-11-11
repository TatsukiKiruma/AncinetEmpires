> 最新决胜授权：Gen1 K1按4P≥11审定晋级，跳过Gen2，执行唯一一次Phase E。先读 FINAL_ADVANCE.md；不得恢复Gen2或重启已打开的封存会话。

> 最新紧急纠偏：先读 FALLBACK_FIX.md。Gen1 K1/K2复用训练资产恢复评测；C/D/E回退只记诊断，Dev18门槛13；Dev54至少39胜且3P≥11或总胜≥40，保留2P/4P及健康门。

# 用户最新推进授权

已完成P1原始收据不改写、不重采。B-G3继承根吞吐门槛由2.5改为2.4；保留健康检查、wire上限35ms。B-G4由用户明确豁免，passed=true、waived=true、executed=false；P2不执行，不能报告实测吞吐通过。

锁定chosen={"tag":"","workers":4,"games":2,"services":2,"window":2}。phase_c.ts Dev-18物理meanWireMs门槛35ms。

run_stage7.py顺序执行C并发审计与Dev18/54基线、D混合联赛候选训练与晋级；仅候选通过Dev54全部门禁后开启一次Sealed54，否则sealedAccess=0。保持防休眠、事务检查点与原隔离规则。禁止额外P1或legacyV6重跑。

旧代码与B失败记录完整保存在phase-c-advance-before/；最新验收复用B_P1.json与有效教师复核结果。5项定向回归测试、tsc --noEmit通过。
