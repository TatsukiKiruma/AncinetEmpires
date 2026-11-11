# 困难 APK 原生采集预检

本报告是 **部分完成、安装受阻** 的预检，不能作为困难采集器通过证明。

2026-10-22 当前连接设备为 `c2357770`，型号 `MI 8 UD`。首次实测电量54%、温度31℃；游戏进程20376。数据分区可用约10.26 GiB，游戏files目录约22.37 GiB，其中包含旧采集数据，未删除或覆盖。

## APK 身份与安装

详见 `APK_IDENTITY.json`。当前安装原版 SHA-256 为 `51b00185f300dd8899284aa91986aee9a1cc73fa012262a0d9eebc97fad1aa7b`；指定困难包为 `a2adcc856384dea4ebac7434c78c2abbdcb1f428e502925fd4beb39c95cd6d48`，与用户指定完全一致。两者包名均为 `net.toyknight.aeii.android`，versionCode均1051、versionName均4.2.5.1。

- 原版签名证书 SHA-256：`eb9328df25abb09038faecb939c25457bf3d415fe1f333711d7614cb4f4ca1a6`。
- 困难版签名证书 SHA-256：`fb5f6135f0160b3a699053ba9ddea2be1b1044b39905700e596ab6e7ca5ba7c4`。
- 困难 HTML SHA-256：`6076f354362f89c0a0abbcb10ef4de04d321f96aa7de90e61f0fb33a2ea883eb`。

真人分页增量下载成功完成后，执行了唯一一次标准保留数据升级 `adb -s c2357770 install -r <hard-target.apk>`。系统拒绝，返回 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`，详见 `apk-install-preserve-data.log`。未卸载、未清数据、未改签名检查、未重签补丁、未修改包名。随后通过设备端 SHA 再次确认实际安装包仍为原版，进程仍为20376，见 `apk-after-rejected-upgrade.txt`。没有安装后困难入口的实机证明。

## 策略入口与隔离

静态分析见 `HARD_COLLECTOR_DESIGN.md`。旧采集器明确调用普通类 `c.a.b.c.j.a`。指定补丁的困难类为 `c.a.b.c.j.b`，优先调用 `ResourcePackHardAi.choose`，后者依赖 Activity、UI线程上的WebView和 `hardAiDecide`。主路径失败才回退到Java困难逻辑。

补丁UI的类型3是困难选择语义；实际UI调用`AiSelection.setSlot(slot, 3)`后，将原生配置`cfg.i`写回2。正确适配须同时设置困难slot、绑定对应状态并验证困难工厂，不能机械把原生配置字段改成3。本次冻结采样计划中的`playerType: 3`表示请求困难策略，不表示已经证实原生配置应写3；计划及jobs摘要保持不变，补充解释见`HARD_SAMPLING_SEMANTICS.json`。

`view/loaded/lastAccepted` 及 HTML 队列为共享状态，旧多线程采集器不能直接换类型后运行。每个父局必须隔离完整生命周期；静态上可先按整局串行和局前reset实现，但reset不销毁旧WebView，仍需补充安全销毁、晚到回调排空及实机压力验证。不能把Java回退或普通误调用计作困难JS主路径。

旧 `ai.e.setSeed` 只约束Java随机数，未证明影响HTML的 `Math.random()`。独立种子不等于独特棋谱。若注入可复现JS随机源，应单独登记采集器版本及随机行为变更，不称未干预原策略。

## 尚未通过的门禁

候选采集器代码已完成离线13组检查，见`HARD_COLLECTOR_SELFTEST.json`。主代理又独立运行一次`--identity-only`，只执行get-state、pm path、设备端sha256sum三项读取，确认当前仍是原版SHA并在pull/push/ADB转发/Frida会话/进程启动前拒绝。该回执为`HARD_COLLECTOR_IDENTITY_GATE.json`，不代表目标困难APK的运行验收。

单局冒烟0局；约20局多图验收0局；1/2/4并发实测均未执行；吞吐未知；原生逐动作重放、终态一致、项目strict转换均无新困难数据可验收。没有选择实测并发，也没有启动3000局。当前只有8张官方双人图各375局的种子与配额预登记，详见 `HARD_SAMPLING_PLAN.json`。

继续需要同包且与已安装版本签名兼容的困难APK，或者由用户另行明确允许并审核备份恢复及卸载方案。当前授权只覆盖保留数据升级，不能用破坏性替代方案绕过此门禁。新兼容APK的身份需重新登记，不能沿用本次目标SHA假装同一个包。
