# 云端对局获取记录

检查日期：2026-09-07（北京时间）。APK：`APK/aer-release-4.2.5.1.apk`。

## 当前结果

本次尚未下载到新的云端对局，不能声称已获得最新或全量数据。

| APK 服务入口 | 匿名只读检查结果 |
| --- | --- |
| https://ae-multiplayer-na.toyknight.net/api/game_list | TLS 证书已过期，未取得接口响应 |
| https://aer.augix.me/api/game_list | TLS 证书已过期，未取得接口响应 |

原始检查结果见 `connection_probe.json`。检查保留 TLS 证书校验，不携带账号令牌。ADB 当前未发现已连接设备。

## APK 接口依据

- `APK/_analysis/jadx_output/java/p036c/p037a/p039b/p049b/p056x/p058q/EnumC1159e.java`：服务地址。
- `APK/_analysis/jadx_output/java/p036c/p037a/p039b/p049b/p054v/C0956c.java`：`C0991r` 列表请求字段 `s3`、`f4`、`p`；公共请求层附加 `a1` 账号令牌。
- 同文件 `C0981m`：`/api/game_get` 使用 `v1=100`、`v2=400`、`i=对局ID`，公共请求层附加 `a1`。
- `APK/_analysis/jadx_output/java/p036c/p037a/p039b/p049b/p055w/C1065f.java`：列表结果读取 `s2`。

## 训练筛选口径

本次从头执行 forced/strict 重放耗时较长，已主动中止；最终复用已有 SD 双重校验报告，重新核对原文件及复制文件 SHA-256、动作完整性和终局条件，排除既有黑名单 065、078、097。结果另存至 `training_runs/replay_cleaning/sd_20260907_existing`，不作为本次云端新增数据，也不声称已完成当前引擎重放复验。

本地 125 份响应对应 112 个唯一哈希，全部由历史校验报告覆盖。完整候选 78 局（117884 条记录），局部候选 31 局（47049 条记录），黑名单排除 3 局，额外完整性检查拒绝 0 局。完整清单为 `training_full.jsonl`，局部清单为 `training_partial.jsonl`，源文件覆盖清单为 `source_inventory.json`。

完整样本还应检查动作数大于零、全部动作执行完毕、房间已结束且存在胜者。无胜者的通过校验回放只作为局部模仿学习候选，不提供终局胜负标签。回放通过只说明与当前引擎兼容，不代表玩家策略质量高。

后续全量获取须先恢复可信的服务连接并取得已登录会话，再遍历账号可见列表全部分页、按服务和对局 ID 去重、下载详情并记录失败项。接口可见全集不等于服务端全部私有或已删除对局。

## 复现命令

```powershell
node --openssl-legacy-provider --import tsx tools/apk_cloud_probe.ts
node --openssl-legacy-provider --import tsx tools/sd_replay_cleaner.ts --root captures --out training_runs/replay_cleaning/sd_20260907_existing --json
python tools/apk_training_selection.py training_runs/replay_cleaning/sd_20260907_existing
```

需要当前引擎重新重放时，可为清洗命令添加 `--validate-live`，但这不是本次最终报告的校验来源。
