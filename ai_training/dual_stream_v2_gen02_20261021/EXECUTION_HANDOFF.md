> 第2代已完整结束并按用户要求停下；以下为执行中历史交接记录，最终状态请读REPORT.md及STOP_RECEIPT.json。

# 当前执行接手（未完成，不可当验收交付）

用户要求实际执行第2代到电脑实战验收，保持第0代冠军如不合格，不自动第3代。全中文，不动GUI/保护入口/规则，不连接手机，不删旧证据。根与训练AGENTS均已读。

## 当前运行

- 新独立目录：本目录；旧阶段5目录只读保留（236475071字节）。本目录295MB/系统12GiB守卫，最后检查约93MB。
- 唯一协调器终端会话：`48222`；命令为根目录 `node ai_training/run.mjs C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -B -X utf8 dual_stream_v2_gen02_20261021/run_league.py --target-gen 2`。
- `pipeline-status.json`为实际进度，`run.lease`为Windows独占锁。不要并发启动。当前正在gen2-plan.log：先做全部历史/开发/新冠军基准完整及规则等价态排重，登记60局，然后4通道采样、extract、distill、retained_calibration、89三端、候选112槽、promote。
- 当前RUN_CONTRACT为v2.2，SHA `01e18d9551fee1e11e638f0b5872eeb48e764fecc8900d1b4ccfc2a1aa3ba62a`。采样前已冻结，不要编辑其中sourceIdentity绑定的生产文件；变化必须版本化保留且不得绕过断言。可继续编辑后加的独立报告/诊断脚本（未列入合同、未导入生产路径）。

## 已完成

- START_SNAPSHOT保存旧合同、旧晋升AST及90文件。旧gen00/gen01未覆写；保护入口按本次开工SHA。
- 原反扑i<3真实展开、后排静态导致普通单位惩罚归零的红灯与预算耗尽假完成均复现，修复后置换/预算回归通过。当前runtime turn_search_ai.ts SHA `f4fc8aa1e1f3205f82c2b15ac8f45e90dc6a1416f600ceda94a8a26533bcbf4e`。
- 所有候选最多3案、相同两条敌方单位链和墙钟机会；真实/静态完成分列，不完整禁止接管，保持指挥官/致死守卫，不调用敌方网络。
- 诊断23621旧专家、加权37106.25、6064纠错/4325队列纠错；118条独立复算一致，队列根标签复用/权重/根值抄录失配0。旧基础阶段未保存独立权重，不声称已证明遗忘因果。旧专家池隔离，不进入新代。
- v2.2精确源计数后按累计样本比例调度，8局专家轮转、128样本/64MB洗牌。冻结共享骨干和价值，只训练策略指针头；AdamW1e-4/1轮/冠军KL0.5/专家权重乘0.5/根标量优化权重0。原子纠错合同atomic-takeover-v2保留。
- 新晋升五面板分别比较pure/search，包含候选全部质量门禁及60局采样双方超时、错误/未知、真实反扑、根最大/队列最大。Python回归8项通过，本代tsc通过。
- 公共lint/build通过；最终测试431通过、20跳过。训练区总检查12项历史类型错误、448通过/63失败，单列不伪装通过。APK原资源没重验。
- gen00完整开发新价值5482样本/16切片通过；89状态PyTorch/Node/真实Chrome最大误差全0。Chrome沙箱Crashpad失败原件保留；同冻结脚本在沙箱外成功，Profile清理。
- 新同运行时pure56：固定14、扩展13、3FFA4、4FFA2、2v2 1，共34胜。search56：11/15/3/5/2，共36胜。所有实际/反扑strict，双方超时/错误0；根最大740.5516ms、队列最大0.8181ms。
- search真实反扑32581/32917，staticComplete32913，100%门禁失败如实保留。不能把静态完成当真实完成。
- 首次零动作Python同名calibrate遮蔽已显式本地导入修复，v2→v2.1快照/合同保留。v2.2因发现按批调度长尾及补齐采样质量门禁：原守卫真实拒绝，随后白名单仅4份训练/门禁文件变更，新计数/审计工具加入身份；推理SHA逐项不变，原112槽/89收据SHA保全关联。证据在training-revisions/v2_2/。

## 仍须实际完成

1. 持续监督当前会话直至60局、训练和候选验收完成。每次等待最多45～50秒，中文有意义更新不超过60秒。
2. gen02真实Chrome预计仍会在沙箱失败。先复制失败 `model-browser-parity.json` 为attempt失败收据，再按下列命令以require_escalated运行同脚本（此动作已获自动批准，不必问用户），然后重启原协调器继续：
   `$env:LEAGUE_FOLDER='C:/code/AncinetEmpires/ai_training/dual_stream_v2_gen02_20261021/generations/gen_02'` 后 `node ai_training/dual_stream_v2_gen02_20261021/browser_runner.mjs model`。不要改脚本或假收据。
3. 训练阶段可运行 `base_distribution_diagnostic.ts` 复核旧基础精确19127和加权分布；它只读旧数据，写新诊断。避免在正式根时延测量期间跑重检查。
4. 全面板结束后运行新增独立诊断 `arena_phase_diagnosis.ts` 和 `post_training_isolation_v2.ts`，后者按真实训练样本与224新评测槽完整/规则态核验。它们未绑定生产合同，可修复自身问题但不改生产输入。
5. `deliver_gen02.py`是待完善的报告生成器，**尚未运行**。需补入新 `generations/gen_02/league-quality.json` 的全部采样性能/错误归属和质量门禁；把7项回归文字更新为8；接入post-evaluation-isolation-v2.json；修正BATTLES表格切片写法、补自然平局列；从实际结果生成，不硬写通过。`arena_phase_diagnosis.ts`有未使用的commanderHp:0字段，应删掉以免误导。
6. 正式结束检查保护入口及旧阶段5快照SHA、全尝试strict和所有失败/超时归属，报告根p95/p99/最大和队列最大，不拿总体p95掩盖。必要时相关检查，避免重复无关测试。
7. 运行完善后的交付脚本更新REPORT/BATTLES/gate-summary/RESUME/CURRENT/DELIVERY_MANIFEST。若gen2不合格保持冠军0，不能自动3。全部是开发验收，未盲测、未证明强人类100%或5～6人64×64百子全覆盖。

不要把本接手文件当作最终报告；目标尚未完成。
