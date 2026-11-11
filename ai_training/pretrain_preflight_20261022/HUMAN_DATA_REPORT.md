# 真人新增数据验收

初次回放验收生成时间：2026-10-21T20:26:08.560Z，原状态为`new_responses_audited`。最终全集排重已完成，准入结果见文末及`HUMAN_DATA_INDEX_FINAL.json`。

本次下载声明3份响应；实存3份文件、3份唯一SHA；可核对host/API ID的父局标识3个。下载完成=true，TLS验证=false。

历史实存唯一响应302份；同SHA重复0，同host/API父局重复0，跨host同API标识0，初态与宏流内容相同0。

forced通过2/3，strict完整无损通过0/3，完整回放准入0组。独立重建核验后的前缀准入3组、2151个原子；相对既有阶段3排重的前缀策略候选2077，完整回放合格策略动作0，合计2077（真人控制者615）。前缀策略已剔除end_turn、surrender、平凡决策和阶段3已消费评测状态。

| 响应SHA前12位 | forced | strict首个隔离边界（0起） | 已验证前缀原子 | 前缀合格策略 | 原因 |
|---|---:|---|---:|---:|---|
| 881ca86baa81 | false | macro=723, sub=0, atomic=1328 | 1328 | 1310 | 当前局面没有合法招募动作: slime @ (1, 5) |
| d588e84e3903 | true | macro=132, sub=0, atomic=210 | 210 | 192 | 严格合法动作缺失:move:apk_remote_u2:14,2 |
| b34400e7bf3e | true | macro=375, sub=0, atomic=613 | 613 | 575 | 严格合法动作缺失:move:u_49:14,2 |

可证明与全部历史独立的新增父局数：未知。历史112份响应缺少API父局证明；解码失败0份。可证API父局分组与统计独立完整对局不能互换。

完整回放准入范围内，项目规则非投降终局0组、投降终局0组；3份已核验策略前缀均在自然终局前停止。可信APK自然终局父局0；Value合格动作0。所有Value/return mask=false。

逐响应结果、源码/资源/输入SHA、历史身份和隔离原因见[索引](HUMAN_DATA_INDEX.json)及本次[runs证据](human/runs/2026-10-21T20-25-12-770Z/source-identity.json)。

命令（项目根目录）：

```powershell
node ai_training/run.mjs node --openssl-legacy-provider --import tsx pretrain_preflight_20261022/human/accept.ts
node ai_training/run.mjs node --openssl-legacy-provider --import tsx --test pretrain_preflight_20261022/human/acceptance.test.ts
```

- strict只证明保存的动作前缀兼容当前权威规则，不能证明APK逐状态等价或不存在运行时MOD。
- forced单独执行并记录，不替代strict策略准入；不通过放宽全局规则接纳分歧样本。
- CLOSED不证明自然胜负；项目规则终局与可信APK自然终局分别计数，本次没有原生终局见证，Value始终关闭。
- 早期无API元数据的历史响应无法全量证明跨批父局独立；不能用唯一SHA、内嵌不透明ID或内容差异替代父局证明。
- 只验收本次独立目录的新增数据，没有启动训练或改写历史目录。

初次验收的2077仅为已登记阶段3排重后的前缀策略候选；其后已按DATA_SPLITS.exclusionIndexes完成全部已登记永久排重，结果见下节。不能仅凭早期候选数认定最终准入。逐条canonical哈希、旧stateHash及证据压缩包行号见[候选清单](human/PREFIX_CANDIDATE_MANIFEST.json)；二次过滤命令见[说明](human/README.zh-CN.md)。

## 完整永久排重后的最终策略准入

最终保留2077条策略动作，其中真人控制615条；候选2077条中排除0条。本次实际绑定并核验的永久排重全集共有4222726个唯一状态摘要。

最终索引为`HUMAN_DATA_INDEX_FINAL.json`，包含逐行来源、过滤收据和DATA_SPLITS摘要。早期`HUMAN_DATA_INDEX.json`及运行收据按原样保留，其候选数不单独作为最终训练准入。可靠自然终局父局仍为0，Value/return仍关闭；未证明相对全部历史统计独立。
