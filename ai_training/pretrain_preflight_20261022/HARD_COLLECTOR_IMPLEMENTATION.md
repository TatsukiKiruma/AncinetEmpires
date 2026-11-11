# 原生困难 APK 单局候选采集器实施记录

日期：2026-10-22。状态：**候选代码已冻结，13 组离线检查通过；目标 APK 实机未测，原生困难采集 0 局，3000 父局未启动，采集器验收未通过。**

本实施记录对应独立目录 [tools/phone_training_hard](../../tools/phone_training_hard/README.md)。本子任务没有连接或操作手机，没有安装、重签、改包、卸载、清数据、force-stop、启动训练或修改旧 worker。主代理可能另行记录一次只读身份门禁；该记录必须与本文的离线检查分开，也不能称为困难运行验证。

## 1. 已冻结的代码与证据

代码 7 件：`contract.py`、`launch_smoke.py`、`audit_contract.js`、`resident.frida.js`、`native_engine.rhino.js`、`worker.rhino.js`、`selftest.py`。每个文件的 SHA-256 见 [HARD_COLLECTOR_SELFTEST.json](HARD_COLLECTOR_SELFTEST.json) 的 `sourceSha256`；该记录同时明确 `deviceCommandsExecuted=0`、`fridaSessionsStarted=0`、`apkRuntimeTested=false`、`collectorAcceptancePassed=false`。

原始 [静态设计](HARD_COLLECTOR_DESIGN.md) 与 [APK 身份](APK_IDENTITY.json) 保留。固定目标 SHA 为 `a2adcc856384dea4ebac7434c78c2abbdcb1f428e502925fd4beb39c95cd6d48`，HTML SHA 为 `6076f354362f89c0a0abbcb10ef4de04d321f96aa7de90e61f0fb33a2ea883eb`。现有 REA 注册/Node/JADX 限制不改变证据等级：设计依据为本地 APK 和 Androguard 指令，非 REA Evidence、非实机轨迹。

## 2. 实现范围

### 身份门禁

[identity_gate](../../tools/phone_training_hard/launch_smoke.py:75) 首先执行明确设备的 `get-state`、`pm path`、设备端 `sha256sum`。设备摘要与目标不符即拒绝，尚未 pull、push、建立转发或 spawn。摘要相符后才拉取安装包，以 Androguard 检查包名、版本、证书、入口及 HTML 摘要；应用进程启动后再次读取自身 `sourceDir` 并比较 APK 摘要。

只支持一个明确的 `/data/app` APK，不支持分包或未知路径。没有安装和签名冲突替代路径。当前已知手机原版 SHA `51b00185f300dd8899284aa91986aee9a1cc73fa012262a0d9eebc97fad1aa7b` 会在第一道摘要门禁被拒绝；此结论已用伪 ADB 测试，尚未由本子任务向设备执行该命令。

### 单局、type3 与原生引擎

[validate_job](../../tools/phone_training_hard/contract.py:67) 只允许一个父局和一个尝试，不接受 batch、派生局面或 RNG 注入。原子动作上限 200，默认 50；墙钟上限最多 600 秒，默认 180 秒。达到上限单独记截断，不能计为自然结束。

按 APK 实际界面契约，活动玩家经 `AiSelection.setSlot(slot,3)` 设置困难语义，原生 `cfg.i` 写入 2，记录同时保存 `requestedPlayerType=3/nativeConfigPlayerType=2`。[worker](../../tools/phone_training_hard/worker.rhino.js:22) 每步新建 `c.a.b.c.j.b(engine)`，读取原生动作、使用原 APK 引擎提交和结算，不复制游戏规则或评分公式。原生配置、SD 控制器、状态序列化及 gzip 格式来自旧采集方式的独立封装，旧文件未被修改。

只使用 SD 控制器，从明确的原生配置ZIP载入配置并替换地图、seed、玩家类型和联盟。其他配置字段沿用输入ZIP；是否与默认开局一致须另行核验，不能据当前候选代码宣称已匹配冻结采样默认初态。未提供 SO、任意派生preset局面、多人并发或 3000 局调度入口。默认原始 WebView `Math.random()` 未改写，明确保存 `jsSeedControlled=false/rngModified=false`；Java `ai.e.setSeed` 不能宣称控制 HTML 决策随机性。

### 可证明的首次启动与独占租约

为避免对未知前台困难任务作假设，采集入口拒绝已有应用进程，只支持 Frida spawn 的新进程。在恢复该进程前安装 `Application.attach` 入口，由应用类加载器安装完整 hook，并观察首次 `ResourcePackUi.attach`。后台 Gdx 入口未初始化、选择静态状态已被使用、已有困难栈或旧采集线程时拒绝。

租约使用应用私有文件锁和进程内唯一 Guard 类，并保存 `boundState/hardSlots/pending`。采集引擎绑定后每次决策前与动作准入时校验 Activity 及选择状态，提交返回后登记提交事件；外部普通或困难 AI、界面槽位变更、重复 Activity 绑定、未知页面/回调会使本次停止。正常收尾恢复保存的原对象及值；外部干扰后无法证明恢复安全时，拒绝覆盖并标记 `restart_required`。

这些均是待实机验证的防护实现，不是已经证明 Frida/Android 全部接口可用。现有前台进程附加不支持，不能用 `workers=1` 绕过独占门禁。

### 逐决策证据与禁止降级

[resident.frida.js](../../tools/phone_training_hard/resident.frida.js:83) 按 `parentId/attemptId/actionIndex` 记录原生动作返回类型的 `b.call`、`choose`、`decideInBrowser`、`createAction`、回退入口、普通 `a.call` 和桥错误。`Object` 桥方法不重复计数。

只在 browser 非错误响应、createAction/choose/b.call 返回动作身份一致时准入 JS 主路径。`choose=null` 会记录 `hard_fallback_required` 并抛出停止异常，不执行 Java 困难回退动作；兜底 hook 若看到回退分支入口则记录 `hard_java_fallback_started` 并阻断。这个计数表示进入/尝试回退分支，不表示完整执行并提交了 Java 回退策略。普通误调用同样阻断，不自动切换策略。

桥 `Log.e` 的两参和三参接口都会把当前决策标为错误。汇总独立统计 JS 主路径、普通误调用、回退需求、Java 回退分支、动作转换拒绝、APK 桥错误、browser 错误、Frida 脚本错误、bootstrap 错误、生命周期与选择变化。已观察到的桥错误不能因表面动作链闭合而显示为零。

宿主和设备证据逐条 flush/sync。提交前后的原生文件与事件链相互关联。`action_committed` 只表示提交函数与结算调用返回；当前没有独立检查该动作实际合法及预期状态变化，因此不等于原生 strict 重放。

### 驻留、排空与故障边界

Rhino 线程先注册再启动。宿主以真实 `Thread.isAlive()` 判断完成，不复用旧脚本 `done` 即 detach 的行为。墙钟上限或 Ctrl+C 只请求停止后续决策，保持 Frida 驻留至在途调用和线程退出。

回调按原始 result latch 关联动作，在释放原 countDown 前登记回调到达，避免观察计数与工作线程被唤醒之间的竞争。正常线程退出后，在 UI 线程排空、destroy WebView、reset、恢复选择状态，再释放租约。桥超时、未知回调、未排空或 UI 收尾失败均标 `restart_required`，不在同一进程重新开始。

若真实线程仍活着且 RPC 无法确认状态，宿主保留会话等待进程退出，不通过提前卸钩冒称完成。若还有在途 UI 回调，拒绝生成稳定导出集合；设备原件和宿主事件保留，正式准入失败。程序不自动停止应用或恢复设备环境。Frida 导入/连接失败以及后续会话清理异常，都由外层 finally 清理本次拥有的 ADB forward，不删除其他转发和任何尝试数据。

### 产物完整性

[verify_success_artifacts](../../tools/phone_training_hard/launch_smoke.py:165) 要求七件完整成功证据：`config.bin`、`initial.bin`、`final.bin`、`actions.jsonl.gz`、`states.bin.gz`、`result.json`、`decision-evidence.jsonl`。检查宿主与原生 result 逐字段相同、传输文件集合、非空文件、字节数、SHA、gzip 尾部、原生长度帧、动作索引与父局身份。

`transferHashesVerified`、`completeSuccessSet` 与 `nativeStrictReplayVerified` 分开登记。前两者成立不把最后一项置为 true。`collectorAcceptancePassed=false` 固定保留；本候选只提供运行证据门禁，尚未取得采集器资格。

## 3. 已执行的轻量检查

实际离线命令：

```powershell
python tools/phone_training_hard/selftest.py --output ai_training/pretrain_preflight_20261022/HARD_COLLECTOR_SELFTEST.json
python tools/phone_training_hard/launch_smoke.py --help
```

结果 13 组通过：全部 Python AST、4 个 JavaScript 文件的 `node --check`、固定身份各字段拒绝、缺失身份拒绝、APK 路径/分包/摘要格式、唯一父局/type3/原始 RNG 参数、已知原版摘要提前拒绝、动作链缺失/重复/逆序拒绝、独立错误计数、七件证据及 host/native result、gzip/长度帧完整性、Frida 导入/连接失败清理 owned forward、路径分类与在途回调排空门禁。

这 13 组使用伪 ADB、合成事件和临时合成文件；没有执行 ADB、Frida attach/spawn 或 APK。临时测试目录限定在新采集器目录内部，测试结束仅清理这些新建夹具。没有运行全量训练或 CPU 重载检查；未改公共应用/规则源码，不以公共 npm 检查代替本采集器实机验收。

## 4. 尚未通过的实机接口与恢复方式

以下全部未测：真实 Frida server 的 spawn、`Application.attach` 拦截时机、Java bridge 类加载与 `Java.registerClass`、Rhino 调用 Guard、反射静态数组恢复、Gdx 初始资源可用时机、应用能否读取 `/data/local/tmp` 配置、目标 WebView 文件页与异步回调、真实 Activity 生命周期、UI destroy/排空、文件锁、长驻会话与产物分块导出、实际原生状态变化和自然胜负。任何不兼容接口会拒绝或失败，不应通过删门禁使其“通过”。

当前设备目标 APK 身份仍受既有签名冲突阻塞，见 [HARD_APK_PREFLIGHT.md](HARD_APK_PREFLIGHT.md)。只读身份核验可以由主代理在授权范围内另记证据：

```powershell
python tools/phone_training_hard/launch_smoke.py --identity-only --adb "实际adb.exe完整路径" --device "设备序列号" --parent-id identity-only-current-original
```

预期现有原版 SHA 被拒绝；这不代表困难运行验收。后续目标身份与环境问题解决后，完整单局候选命令见 [README 的设备入口](../../tools/phone_training_hard/README.md)。原生配置 ZIP 和条目必须事先明确，工具不选择旧用户存档作为默认输入。

本实现不支持断点续局。失败目录保留，需有授权的操作者确认旧进程已退出及生命周期恢复后，再以相同 parentId、新 attemptId 运行一个新尝试；默认未控制 HTML RNG，不能保证旧/新轨迹相同。没有自动重试、同进程下一局、批量调度或训练触发。只读拒绝可直接重复运行，每次产生新证据目录；实机 smoke 与最终采集器资格仍保持未通过。
