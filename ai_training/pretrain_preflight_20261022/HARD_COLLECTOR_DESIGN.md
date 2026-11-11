# 原生困难 APK 采集器静态设计

日期：2026-10-22。状态：**静态设计完成；目标 APK 尚未装入手机；本文代码均未在目标 APK 实机执行。**

本文只核验本地 APK、既有 Androguard 反编译与 HTML，并提出采集适配。没有安装、卸载、清数据、重签、改包名、修改 APK 或启动 3000 父局。手机安装身份与保留数据升级的阻塞，以同目录 [APK_IDENTITY.json](APK_IDENTITY.json) 为准。

## 1. 目标身份、证据与工具限制

- APK：`C:/Users/SHIINA/Downloads/aer-4.2.5.1-patch.apk.1`。
- 本次重新计算 APK SHA-256：`a2adcc856384dea4ebac7434c78c2abbdcb1f428e502925fd4beb39c95cd6d48`，与指定目标一致。
- APK 成员 `assets/hard-ai/runtime.html` SHA-256：`6076f354362f89c0a0abbcb10ef4de04d321f96aa7de90e61f0fb33a2ea883eb`；本次逐字节核对，其与 `deliverables/original_apk_hard_20261021/static/hard-ai-runtime.html` 相同。
- 既有证据生成器：[inspect_apk_hard_patch.py](../../tools/inspect_apk_hard_patch.py:29)。证据身份在 [inventory.json](../../deliverables/original_apk_hard_20261021/static/inventory.json:2) 明确写为本地 Androguard 静态分析，非 REA Evidence、非运行轨迹。
- 本会话不存在已连接的 REA Android 工具。本地 `rea doctor --client codex --json` 返回 CLI 6.4.0、Codex 注册缺失及 Node 22.18.0 未达 CLI 要求。既有 [REA Android 诊断](../../deliverables/original_apk_hard_20261021/rea-android-diagnostic-apk.json:1) 另记录缺少调用方提供的 `jadx-headless-mcp 0.7.1` JAR。本次没有修复配置或安装依赖。
- 本次另使用已安装的 Androguard 4.1.4，对同一 SHA 的 APK `classes.dex` 只读打印下述四处缺失方法的指令；没有另写反编译文件。对应定位为类描述符、方法签名及指令偏移，不冒称 REA Evidence。

## 2. 当前 worker 必定调用普通策略

[worker.rhino.js:60](../../tools/phone_training/worker.rhino.js:60) 每步构造 `new Packages.c.a.b.c.j.a(engine)`；第 63 行执行 `ai.call()`。该类是普通 AI，不能仅修改日志标签就称为困难 AI。

目标困难类为 `c.a.b.c.j.b`。其 [DEX call 方法](../../deliverables/original_apk_hard_20261021/static/patch-b.dex.txt:2838) 的顺序为：

1. 偏移 `0000`：调用 `aer.extension.ResourcePackHardAi.choose(this)`。
2. 返回值是 `c.a.b.a.b` 时，偏移 `0014` 直接返回该动作。
3. 否则从 `0016` 开始执行本类 Java 困难策略；偏移 `00c2` 调用私有 `e()V`，之后还有 `k/m/l/n/d/o/p` 等方法。

因此必须分开记录 `hard_js_primary`、`hard_java_fallback` 和 `ordinary_ai`。Java 回退仍是困难类自身的规则，不能写成普通 AI；普通类误调用也不能写成困难回退。

[AiStrategyFactory.create](../../deliverables/original_apk_hard_20261021/static/patch-AiStrategyFactory.dex.txt:2) 只有在 `AiSelection.isHard(engine)` 为真时构造 `b`，否则构造 `a`。[isHard](../../deliverables/original_apk_hard_20261021/static/patch-AiSelection.dex.txt:23) 要求 `engine.e.f === boundState`，并且当前玩家对应 `hardSlots` 为真。独立 worker 可以直接构造 `b(engine)`，无需改界面槽位或经过该工厂。

补充静态指令：`Lc/a/b/a/m;-><init>(Lc/a/b/a/a;)V` 的 `0006–0014` 用 `new q(engine.e)` 初始化自身字段 `a`，`0018–0040` 缓存当前玩家及配置。因此应继续**每个决策新建 `b(engine)`**，不能把同一个 AI 实例跨行动复用。桥的 [createSnapshot](../../deliverables/original_apk_hard_20261021/static/patch-ResourcePackHardAi.dex.txt:417) 则通过传入对象的直接父类读取 `a` 字段；传入对象应是原始 `b` 实例，而不是 engine 或额外继承包装类。

## 3. Activity、WebView 与超时

[ResourcePackHardAi.choose](../../deliverables/original_apk_hard_20261021/static/patch-ResourcePackHardAi.dex.txt:66) 是静态同步方法：

- 必须在非 Android 主线程调用；主线程会抛出 `AI decision ran on UI thread`，由桥捕获后返回 null。
- 调用 `ResourcePackUi.currentActivity()`；为空时直接返回 null。此分支甚至不会执行 JavaScript，也不会把 `lastAccepted` 置为 false。
- [decideInBrowser](../../deliverables/original_apk_hard_20261021/static/patch-ResourcePackHardAi.dex.txt:1081) 把 WebView 创建及 `evaluateJavascript` 投递到 Activity 的 UI 线程；加载最多等待 20 秒，决策结果最多等待 60 秒。异常、null、`kind:error` 或原生动作转换失败均令 `b.call()` 使用 Java 困难回退。
- [ResourcePackHardAi$1.run](../../deliverables/original_apk_hard_20261021/static/patch-ResourcePackHardAi$1.dad.java:11) 创建一个静态 WebView，启用 JavaScript、文件访问并加载 `file:///android_asset/hard-ai/runtime.html`。
- `Laer/extension/ResourcePackHardAi$1$1;->onPageFinished(WebView,String)V` 的 `0000–0008` 对**当前全局 loaded** 倒数；页面完成不等于已验证 `hardAiDecide` 存在。
- [ResourcePackHardAi$2.run](../../deliverables/original_apk_hard_20261021/static/patch-ResourcePackHardAi$2.dad.java:14) 执行固定形式 `hardAiDecide(JSON字符串)`。`$2$1.onReceiveValue(String)` 的 `0000–0026` 用 `JSONTokener.nextValue()` 解开 WebView 返回字符串，`0042–004a` 释放本次结果 latch；解析异常会记 `Invalid JavaScript response`。
- `Laer/extension/ResourcePackUi;->attach(Activity)V` 的 `0000` 保存静态强引用 `activity`，`0004` 调用 `HardAi.reset()`；`currentActivity()` 的 `0000–0004` 只是返回该字段。`AndroidLauncher.onCreate(Bundle)` 调用 attach。桥自身不检查 Activity 是否正在结束或已销毁。

现有 worker 的独立 `java.lang.Thread` 满足非主线程条件；不能把 `b.call()` 移到 `Java.scheduleOnMainThread`。局前应检查 Activity 非空、未结束/销毁，并保持主线程可处理消息。Activity 重建会自动 reset，应将父局标为异常并重跑，不能在中途无声恢复采集。

## 4. 单例缓存与最小安全调度

Java 静态单例为 `view/loaded/lastAccepted`。[matchKey()](../../deliverables/original_apk_hard_20261021/static/patch-ResourcePackHardAi.dex.txt:1147) 返回 `identityHashCode(AiSelection.boundState)` 的十进制字符串，反射异常才返回 `local`；boundState 为 null 时得到 `0`。它不读取传入 AI 的独立引擎。

HTML [26083 行](../../deliverables/original_apk_hard_20261021/static/hard-ai-runtime.html:26083) 只保留一组 `turnKey/pending/pendingRecruit`；[26205 行](../../deliverables/original_apk_hard_20261021/static/hard-ai-runtime.html:26205) 使用 `matchKey:turnNumber:teamId` 作为键。键改变时重置该回合的行动队列、建筑分配及招募衔接；键不变时才完成上次 pending。切换多个训练引擎会丢失衔接，键相撞则可能复用另一棋盘的衔接。因此 `choose()` 自带的逐次锁不能提供多局隔离。

最小方案：

1. 一台设备的同一应用进程只启动一个困难采集 worker，按**整局**串行完成；队列可以保留，但消费者仅一个。采集期间不得有界面困难 AI 或另一 Frida 脚本并行调用桥。
2. 每局开头、首个困难决策前调用 `ResourcePackHardAi.reset()` 一次；局内不 reset。即使 boundState 仍是旧界面值或 null，新页面初始 `turnKey=null` 也会清空跨局状态。直接调用 `b` 时，无需改变 `hardSlots/arm/boundState`。
3. 若要使 matchKey 与训练父局一致，可在整个独占批次开始时保存 `AiSelection.boundState`，每局初始化 engine 后用反射将其设为 `engine.e.f`，结束后恢复。该步骤只增加匹配身份，不解除单例约束；不要在共享界面进程并发使用，也不要为此调用 `arm()` 去改变未来界面的绑定行为。
4. 保留每步 `new b(engine)` 和原有权威引擎结算。仅将原第 60 行构造器从 `a` 换为 `b`，不足以完成上述隔离与准入。
5. 真正多实例并发应使用独立应用进程/独立设备或模拟器，每个进程各一套 WebView 静态字段。不得在同一进程以多个 `b` 实例冒充独立策略。此处没有授权改包、重签或绕过安装身份门禁。

`reset()` [1167 行](../../deliverables/original_apk_hard_20261021/static/patch-ResourcePackHardAi.dex.txt:1167) 只把 view 置空、创建新 loaded、把 lastAccepted 置 false；它没有同步修饰，也不 destroy 旧 WebView。应在无困难调用、无待执行 UI 任务时调用。大批次可由采集适配器保存旧 view，在 UI 线程 destroy 后用 latch 等待完成，再调用 reset；这一生命周期补充尚待实测。发生 20/60 秒超时后可能仍有 UI 工作在途，不能立即 reset 并继续下一局。先停止该进程的采集，确认排空或完成受授权的进程恢复；原失败局保留，不计成功。

候选 Rhino 片段如下，仅说明放置位置，未修改公共 worker：

```javascript
// 每局开始执行；前提是训练进程已独占且前一局已完全结束。
var hardBridge = Packages.aer.extension.ResourcePackHardAi;
var activity = Packages.aer.extension.ResourcePackUi.currentActivity();
if (activity === null || activity.isFinishing() || activity.isDestroyed()) {
 throw new Error('困难采集缺少有效 Activity');
}
Thread.currentThread().setName('aeii-' + job.id);
hardBridge.reset();

// 每步沿用新建策略对象、权威结算和原始动作/状态落盘。
var ai = new Packages.c.a.b.c.j.b(engine);
get(ai, 'e').setSeed(aiSeed);
var action = ai.call();
```

`lastAccepted=true` 仅表示 `createAction` 造出了非 null 动作，发生在引擎结算之前；不能据此宣称实际动作严格合法或已被原生结算接受。需要继续保留前后原生状态、实际动作及独立重放验证。

## 5. Frida 逐决策路径标记

候选观察点均在目标补丁中存在；下表为待实机安装后执行的方案。

| 观察点 | 应记录内容 | 用途 |
| --- | --- | --- |
| `c.a.b.c.j.b.call() : c.a.b.a.b` | 父局 ID、线程、步号、实例类、耗时、最终动作身份/字段 | 困难决策外层 |
| `ResourcePackHardAi.choose(Object)` | 进入/返回 null、返回动作 identity、reset epoch | 确认进入桥与结果 |
| `ResourcePackHardAi.decideInBrowser(Activity,String)` | snapshot 的 matchKey/turnNumber/team/previousActionAccepted；返回 JSON kind、异常 | 证明 JS 决策实际被调用并产生响应 |
| `ResourcePackHardAi.createAction(Object,JSONObject)` | 输入 kind、返回动作 identity 或 null | 区分脚本错误与原生动作转换拒绝 |
| `c.a.b.c.j.b.e()V` | 在对应 b.call 作用域内是否进入 | 确认进入 Java 困难回退主体 |
| `c.a.b.c.j.a.call() : c.a.b.a.b` | 同样的父局/步号与类名 | 捕捉普通策略误调用 |
| `ResourcePackHardAi.reset()`、`ResourcePackUi.attach(Activity)` | 时间、线程、Activity identity、reset epoch | 发现局中重置或生命周期变化 |

`call()` 同时有原生动作返回类型与 `Object` 桥方法。Frida 必须按**返回类型**选中前者，避免一决策计两次：

```javascript
// 这是待实机使用的签名选择方式，不是已执行结果。
function actionCall(clazz) {
 const found = clazz.call.overloads.filter(overload =>
  overload.argumentTypes.length === 0 &&
  overload.returnType.className === 'c.a.b.a.b');
 if (found.length !== 1) throw new Error('原生动作 call 签名不唯一');
 return found[0];
}
const B = Java.use('c.a.b.c.j.b');
const originalCall = actionCall(B);
// implementation 中通过 originalCall.call(this) 调原实现，其他 hook 同理。
```

判定顺序：

1. 目标采集线程进入 `a.call`：`ordinary_ai`，困难身份门禁失败。
2. `b.call` 进入回退主体，或 choose 返回 null 后最终返回动作：`hard_java_fallback`；额外记无 Activity、JS 错误、转换拒绝或超时原因。
3. 只有 browser 返回非 error JSON、createAction/choose/最终返回动作身份一致且未进入回退时，才记 `hard_js_primary`。
4. 异常、缺失 hook 事件、动作身份不一致、局中 reset 或 Activity 改变：`decision_error/unknown`，不得默认算主路径。

建议 hook 在设备内缓冲逐决策记录，局末或有界批次拉取；短冒烟可逐条 send，不能把其时延当无观察开销的正式采集性能。所有记录按 `parentId/attemptId/decisionIndex` 关联，worker 在每个 batch 子局开始更新线程名，不依赖线程首次启动时的 worker 桶名。日志中的 `AER-HardAI` 字符串或仅看 `b` 构造次数都不足以证明主路径。

## 6. 不改 APK 文件时的随机种子入口

观察：worker 的 `get(ai,'e').setSeed(aiSeed)` 只控制 Java 困难回退类字段 `e:java.util.Random`。HTML 在 [7968](../../deliverables/original_apk_hard_20261021/static/hard-ai-runtime.html:7968)、[22686](../../deliverables/original_apk_hard_20261021/static/hard-ai-runtime.html:22686)、[22742](../../deliverables/original_apk_hard_20261021/static/hard-ai-runtime.html:22742)、[22935](../../deliverables/original_apk_hard_20261021/static/hard-ai-runtime.html:22935)、[22978](../../deliverables/original_apk_hard_20261021/static/hard-ai-runtime.html:22978) 使用 `Math.random()`。本次在完整提取 HTML 搜索未发现 `setSeed/seedrandom/randomSeed` 接口；cfg.seed 不构成 HTML RNG 已播种的证据。

推断：可以通过 Frida 在 `ResourcePackHardAi$2` 构造器入口，把原 invocation 改成返回同样字符串的 IIFE，在**新父局首次决策时**替换该页面的 `Math.random`。构造器签名已由 [DEX](../../deliverables/original_apk_hard_20261021/static/patch-ResourcePackHardAi$2.dex.txt:2) 确认：`(String,AtomicReference,CountDownLatch)`。该点在工作线程创建 Runnable 时执行，容易关联父局 ID；不必在 UI 线程通过全局“当前局”猜测归属。也可以在对应 WebView 的 evaluateJavascript 做相同包装，但必须同时核验 view identity 与 invocation 前缀，避免改到其它页面。

候选包装生成器：

```javascript
// parentId、seed32 和 rawInvocation 来自已冻结清单及原始构造器入参。
function seededInvocation(parentId, seed32, rawInvocation) {
 const parent = JSON.stringify(String(parentId));
 const seed = Number(seed32) >>> 0;
 if (!String(rawInvocation).startsWith('hardAiDecide(')) {
  throw new Error('困难 JS 调用形式发生变化');
 }
 return '(function(){' +
  'var id=' + parent + ';' +
  'if(window.__aeHardRng && window.__aeHardRng.parent!==id)' +
   'throw new Error("父局随机源未重置");' +
  'if(!window.__aeHardRng){' +
   'var r=window.__aeHardRng={parent:id,state:(' + seed + '||1831565813)>>>0,draws:0};' +
   'Math.random=function(){var x=r.state>>>0;' +
    'x^=x<<13;x^=x>>>17;x^=x<<5;r.state=x>>>0;r.draws++;' +
    'return r.state/4294967296;};' +
  '}' +
  'return ' + String(rawInvocation) + ';})()';
}
```

本次将三段 JavaScript 用 Node `vm.Script` 做语法检查；包装生成器还在独立 Node VM 页面替身中验证了字符串返回类型保持、同种子连续两次抽样一致、draws 连续递增以及拒绝跨父局复用。所有本地文档链接均存在。这些检查只覆盖候选包装代码，不是 Frida/WebView 或 APK 验证。

这只说明静态可实现性，不是经过 Frida/WebView 验证的补丁。应先在目标 APK 做少量完整父局重跑，核对每步 JS 响应、原生动作、状态、RNG state/draws 和自然结果，再评价确定性。页面初始化之前是否存在其它会影响策略的非确定性、WebView 版本差异、原生结算随机性及异步时序仍须实测。不能仅用相同 seed 就宣称原生全轨迹可复现。

约束：

- 每父局只初始化一次 RNG，保持连续抽样；不每步重播种，不因回合/玩家变化重置。界面或页面中途重建应失败退出，不允许静默重建 RNG。
- 冻结 seed32 推导，例如 `SHA256(UTF8("apk-hard-js-rng-v1:" + parentId + ":" + baseSeed))` 的前四字节按大端取 uint32；零值映射固定非零值。清单保存 baseSeed、推导版本、seed32、字节序、零值处理和 RNG 算法源码 SHA。
- 保留 cfg.seed 和 Java fallback 的 aiSeed，分别记录，不把三个随机源合为一个字段。
- 中途恢复仅恢复原生棋盘不够：HTML 有 pending/招募队列，RNG 有 state/draws。优先从父局初态按冻结动作序列重放至断点；没有恢复全部状态的证据前，不拼接为同一条确定性父局。
- 原始 `Math.random` 模式与注入模式分开登记。建议 `strategy_family=apk_hard_js`、`runtime_variant=original_webview_rng` 或 `frida_seeded_math_random_xorshift32_v1`；后者标 `rng_modified=true`，并记录 APK SHA、原 HTML SHA、Frida 脚本 SHA、采集器 SHA、WebView/Android/Frida 版本及路径计数。
- 即使 APK 文件与评分/排序函数字节未改，替换 Math.random 也改变随机行为。只能称“原生困难 APK＋确定性随机源适配”，不能称“完全未干预的原 APK 行为”或与原始随机源数据混用身份。本文没有实施该注入；是否采用由正式采集协议另行冻结。

## 7. 实机准入仍未通过的项目

目标补丁安装身份、有效 Activity、加载完成后的真实 JS 调用、逐决策主路径比例、回退/普通误调用为零、局间 reset 生命周期、完整父局确定性与权威结算重放，均仍待目标补丁实机验证。静态报告和项目移植版竞技场胜率不能代替这些检查。现有签名冲突阻塞解除前，不启动原生困难 3000 父局，也不把普通手机样本改名为困难样本。
