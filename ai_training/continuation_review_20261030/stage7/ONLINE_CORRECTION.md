> 最新推进授权：P1继承倍率门槛2.4；B-G4/P2明确豁免、不得启动；Phase C并发wire上限35ms。立即接C→D→条件式E。详见PHASE_C_ADVANCE.md。

# 用户在线纠偏：当前最高优先级接续要求

当前P1 PID460/4704及全部service_v2子树必须保留，禁止终止或重启。主聊天已经只替换外层等待器，未触碰P1。此前的阶段任务书和后台代理制定的方案如与下列要求冲突，以下列本次用户明确指令为准。

1. 并发合批wirePassed为0 < meanWireMs <= 35.0 ms，wireCoverage只保留覆盖说明，不否决。单请求小批仍由已有B-G1验证。
2. 当前固定12局P1完成、健康且继承根吞吐倍率>=2.5后，直接锁定其实际启动配置。取消其他8组P1扫描；禁止所有legacyV6/stage6-ref全量重跑。
3. 加速验收直接采用fullRootsPerHour/1200和stepsPerSecond/0.95，不再生成同工作负载G0基线。
4. P2缩为6局，2P/3P/4P各2局，fullRootFraction=.25，只用chosen配置。完成并通过步速倍率>=2.5、并发wire及健康门后，写PHASE_B_DECISION与GATES，run_stage7立即接C基线及D训练；E仍受Dev晋级门控。
5. 在途原版P1收据可能没有profile字段；用其chosen服务数/窗口加已核实的4worker×2局恢复配置，不修改原始收据。实测启动窗口是2ms，保留这一事实，不按文字示例0.5ms伪造历史身份。
6. 控制层保护：等待P1时不执行terminate_owned、不自动重跑。外层进程替换只按PID/创建时间操作，不使用树终止。原始进程身份对照见ONLINE_CORRECTION_PROCESS_HANDOFF.json。

本次修订由用户明确授权，后台执行者不得恢复旧扫描、旧12ms并发门或wireCoverage否决。主聊天的修复测试见online-correction-tests.log及online-correction-types.log。
