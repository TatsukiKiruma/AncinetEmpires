# 原始证据索引与可复核摘录
本索引服务于本次独立审计。源码路径均相对于原上传ZIP解压根目录；L表示原文件行号。JSON行号仅定位字段，不把汇总字段伪装成逐局日志。带`evidence/`的结果是本次只读审计生成，计算脚本位于`audit_tools/`。未复制全部用户源代码。
原上传ZIP SHA256：`6b475d64baeaf2bfd0dbbee71bcdeda9911ab911d6d5febb34aa50a2e380fc2a`。
证据强度：A=本次重算/重放/反例；B=原始汇总或日志；C=未证归因。10个回放之外的30局没有在本包中完整重放，旧权重没有重新训练或推理。

## E01 — 范围、规则身份与打包完整性
本次生成结果：`evidence/integrity_audit.json`；SHA256：`fcc366ccd1373602a4c3fe2fe0783cbefae5830e1632fc102e60c4b6e392a8d4`。

来源：`review_context/ENVIRONMENT_IDENTITY.json`，L1–L16；SHA256：`026401b02276a5704e17b656cf4cc63e26da00243a9cd73f22cab1c36324e344`。
```text
L1: {
L2:   "originalZipSha256": "323924ab76a8272322f4b122d64e4af4ff2574a85c6a4d996bf4cb9680bffea8",
L3:   "frozenEnvironmentComparisons": [
L4:     {
L5:       "stage": "r4_teacher_stage_20261013_121700",
L6:       "checkedEntries": 63,
L7:       "differences": []
L8:     },
L9:     {
L10:       "stage": "r5_eval_teacher_v2_20261014_023500",
L11:       "checkedEntries": 63,
L12:       "differences": []
L13:     }
L14:   ],
L15:   "note": "当前应用快照单独保存；本比较仅验证两个冻结环境与原始 ZIP 的字节身份"
L16: }
```

来源：`review_context/EVIDENCE_NOTES.md`，L1–L16；SHA256：`957c14821fc95ee256bbf9e3ca91ad3c828db6dd91ac89ce11967f571ea5e09b`。
```text
L1: # 阅读证据时需要注意的边界
L2: 
L3: 本次仅整理文件并检查打包身份，没有重新执行训练、正式对局、统计复算或全部测试。下面是文件间直接可见的差异，不构成新的完整代码审计，也不是后续任务书。
L4: 
L5: 1. **最新冻结协议与实际结果数量不同。** ai_training/r5_eval_teacher_v2_20261014_023500/artifacts/frozen_candidate_manifest.json 写明总计 80 局、每个对手 40 局、单局 300 秒；gate_b_verdict.json 记录每个对手 20 局、总计 40 局，STAGE_REPORT.md 描述 150 秒硬限。原文件均保留，实际原因需核查 scratch/evaluate_gate_b_v2.ts 与运行证据。
L6: 2. **战术成绩来自不同测量。** STAGE_REPORT.md 的 T09 表格提到旧题 23/32、新题 39/42；消融控图变体为 29/42；正式裁决为旧题 14/32、新题 23/42。不得选取最高数字作为最终冻结教师成绩。
L7: 3. **墙钟超时不是战略无解的证明。** 最新裁决中 wall_clock_timeout=40，endgame_loop_repeated=0。报告对守势陷阱、浅层教师上限或必须使用价值网络的解释，应视为待独立评估的解释。
L8: 4. **“单变量”标签需结合配置阅读。** EXPERIMENT_REPORT.md 中 depth2 变体同时改变深度、K 和模拟步数；其差异不宜直接归因于深度一个因素。
L9: 5. **冻结时间身份需要核对。** frozen_candidate_manifest.json 的 timestamp 为 2026-10-14T03:41:00Z，gate_b_verdict.json 为 2026-10-13T21:24:08.360Z。仅按字段时间排序，冻结清单晚于裁决；是否存在时区写入错误应由原始执行证据解释。
L10: 6. **历史状态不代表当前状态。** ai_training/status/CURRENT.md 是迁移时的入口，早于两轮新教师阶段；V19 coverage_fit 的 progress 与 closeout 状态也不同。均保持原文，导航以本包最新阶段目录为准。
L11: 7. **旧成绩不跨规则转移。** V10–V19 的模型、数据、schema、初始化收益、地图可信度和对手身份可能与 r4 不同；不能以旧 DEV20 结果替代新规则验收。
L12: 8. **复现脚本可能写回证据。** reproduce.ps1 会调用 finalize_stage.py，且脚本内可能引用本机绝对路径；分析时先阅读，不要把它当成完全只读的核验命令。
L13: 9. **原始文件保持字节不变。** 原报告存在的绝对路径、时间、哈希及表述不在打包时改写。新增 BUNDLE_MANIFEST.json 记录当前包内实际字节身份，不能替代原实验运行时身份。
L14: 10. **历史数据取舍透明。** 两个近期阶段包含全部现存文本研究文件和失败回放；更早历史保留报告、实现、配置及选择的记录，省略大量原始样本、权重与轨迹。详见 ASSET_INVENTORY.json。缺少的权重使本包不能复现所有历史训练，但不妨碍分析已做工作。
L15: 
L16: 原始战略方案与阶段任务书中的门槛、禁止项、预算及下一步均是历史方案内容。用户本次委托外部模型重新分析并制定方案；请评价其适用性，不要把它们当作无需论证的普遍研究结论。
```

## E02 — 最新Gate B原始汇总及冻结合同差异

来源：`ai_training/r5_eval_teacher_v2_20261014_023500/artifacts/gate_b_verdict.json`，L1–L190；SHA256：`24371d0c2d98ef66550aa554c9f886834b86984e726823aa62352f908d943c0f`。
```text
L1: {
L2:   "timestamp": "2026-10-13T21:24:08.360Z",
L3:   "rulesRevision": "apk-4.2.5.1-rules-20261013-r4",
L4:   "targetBaseline": "frozen_heuristic",
L5:   "secondaryBaseline": "frozen_apklike",
L6:   "teacherConfig": {
L7:     "targetK": 4,
L8:     "opponentPolicies": [
L9:       "heuristic",
L10:       "apk_like"
L11:     ],
L12:     "responseAggregation": "min",
L13:     "evaluatorWeights": {
L14:       "materialWeight": 1,
L15:       "goldWeight": 0.25,
L16:       "castleWeight": 150,
L17:       "townWeight": 75,
L18:       "pushWeight": 0,
L19:       "territoryWeight": 15,
L20:       "tanhScale": 2000,
L21:       "maxNonTerminalBound": 0.9
L22:     },
L23:     "useFullResponse": true,
L24:     "multiHandoffDepth": 1,
L25:     "maxSimulationSteps": 40,
L26:     "maxOwnSteps": 20,
L27:     "maxWallMs": 3000,
L28:     "seed": 42
L29:   },
L30:   "qualificationVerdict": "FAIL",
L31:   "gateBCriteria": {
L32:     "conservativeScoreMin60": false,
L33:     "ci95LowerMin50": false,
L34:     "truncationMax10Pct": false,
L35:     "errorsZero": true,
L36:     "noRegressionOnSecondary": false,
L37:     "tacticalSuitePass": false,
L38:     "oldTacticalSuitePass": false
L39:   },
L40:   "vsHeuristicSummary": {
L41:     "policyA": "frozen_teacher_v2",
L42:     "policyB": "frozen_heuristic",
L43:     "totalPairs": 10,
L44:     "totalGames": 20,
L45:     "winsA": 0,
L46:     "winsB": 0,
L47:     "draws": 0,
L48:     "truncations": 20,
L49:     "errors": 0,
L50:     "winRateA": 0,
L51:     "pairMeanScoreA": 0,
L52:     "conservativeScoreA": 0,
L53:     "ci95Lower": 0,
L54:     "ci95Upper": 0,
L55:     "seat0Wins": 0,
L56:     "seat1Wins": 0,
L57:     "seat0WinRate": 0,
L58:     "seat1WinRate": 0,
L59:     "policyAAsSeat0Wins": 0,
L60:     "policyAAsSeat1Wins": 0,
L61:     "uniqueTrajectoriesCount": 20,
L62:     "uniqueInitialStatesCount": 6,
L63:     "truncationBreakdown": {
L64:       "repeatedState": 0,
L65:       "plyLimit": 0,
L66:       "stepLimit": 0,
L67:       "wallSeconds": 20
L68:     },
L69:     "detailsByMap": {
L70:       "(2) Icy Paths.aem": {
L71:         "pairs": 5,
L72:         "winsA": 0,
L73:         "winsB": 0,
L74:         "draws": 0,
L75:         "truncations": 10,
L76:         "meanScoreA": 0,
L77:         "lower95": 0,
L78:         "upper95": 0
L79:       },
L80:       "(2) The Crossing.aem": {
L81:         "pairs": 5,
L82:         "winsA": 0,
L83:         "winsB": 0,
L84:         "draws": 0,
L85:         "truncations": 10,
L86:         "meanScoreA": 0,
L87:         "lower95": 0,
L88:         "upper95": 0
L89:       }
L90:     }
L91:   },
L92:   "vsApkLikeSummary": {
L93:     "policyA": "frozen_teacher_v2",
L94:     "policyB": "frozen_apklike",
L95:     "totalPairs": 10,
L96:     "totalGames": 20,
L97:     "winsA": 0,
L98:     "winsB": 0,
L99:     "draws": 0,
L100:     "truncations": 20,
L101:     "errors": 0,
L102:     "winRateA": 0,
L103:     "pairMeanScoreA": 0,
L104:     "conservativeScoreA": 0,
L105:     "ci95Lower": 0,
L106:     "ci95Upper": 0,
L107:     "seat0Wins": 0,
L108:     "seat1Wins": 0,
L109:     "seat0WinRate": 0,
L110:     "seat1WinRate": 0,
L111:     "policyAAsSeat0Wins": 0,
L112:     "policyAAsSeat1Wins": 0,
L113:     "uniqueTrajectoriesCount": 19,
L114:     "uniqueInitialStatesCount": 6,
L115:     "truncationBreakdown": {
L116:       "repeatedState": 0,
L117:       "plyLimit": 0,
L118:       "stepLimit": 0,
L119:       "wallSeconds": 20
L120:     },
L121:     "detailsByMap": {
L122:       "(2) Icy Paths.aem": {
L123:         "pairs": 5,
L124:         "winsA": 0,
L125:         "winsB": 0,
L126:         "draws": 0,
L127:         "truncations": 10,
L128:         "meanScoreA": 0,
L129:         "lower95": 0,
L130:         "upper95": 0
L131:       },
L132:       "(2) The Crossing.aem": {
L133:         "pairs": 5,
L134:         "winsA": 0,
L135:         "winsB": 0,
L136:         "draws": 0,
L137:         "truncations": 10,
L138:         "meanScoreA": 0,
L139:         "lower95": 0,
L140:         "upper95": 0
L141:       }
L142:     }
L143:   },
L144:   "tacticalSuiteResultsV2": {
L145:     "totalCases": 54,
L146:     "acceptanceCases": 42,
L147:     "diagnosticCases": 12,
L148:     "acceptanceSolved": 23,
L149:     "diagnosticSolved": 9,
L150:     "acceptanceRate": 0.5476190476190477,
L151:     "diagnosticRate": 0.75,
L152:     "results": [
L153:       {
L154:         "id": "tactical_lethal_cmd_1",
L155:         "category": "lethal_commander",
L156:         "solved": false,
L157:         "chosenCode": "move:u_p0_atk:6,3",
L158:         "expected": [
L159:           "attack:u_p0_atk:u_p1_cmd"
L160:         ],
L161:         "failureReason": "Chosen \"move:u_p0_atk:6,3\" not in expected [attack:u_p0_atk:u_p1_cmd]"
L162:       },
L163:       {
L164:         "id": "tactical_lethal_cmd_2",
L165:         "category": "lethal_commander",
L166:         "solved": false,
L167:         "chosenCode": "move:u_p0_atk:6,3",
L168:         "expected": [
L169:           "attack:u_p0_atk:u_p1_cmd"
L170:         ],
L171:         "failureReason": "Chosen \"move:u_p0_atk:6,3\" not in expected [attack:u_p0_atk:u_p1_cmd]"
L172:       },
L173:       {
L174:         "id": "tactical_lethal_cmd_3",
L175:         "category": "lethal_commander",
L176:         "solved": false,
L177:         "chosenCode": "move:u_p0_atk:6,3",
L178:         "expected": [
L179:           "attack:u_p0_atk:u_p1_cmd"
L180:         ],
L181:         "failureReason": "Chosen \"move:u_p0_atk:6,3\" not in expected [attack:u_p0_atk:u_p1_cmd]"
L182:       },
L183:       {
L184:         "id": "tactical_lethal_castle_1",
L185:         "category": "lethal_castle",
L186:         "solved": true,
L187:         "chosenCode": "capture:u_p0_cmd",
L188:         "expected": [
L189:           "capture:u_p0_cmd"
L190:         ]
```

来源：`ai_training/r5_eval_teacher_v2_20261014_023500/artifacts/frozen_candidate_manifest.json`，L1–L63；SHA256：`d84795b48c3ae536a072acb15aac8d44c41ab8ad510ed057d72260d95f0f2fe9`。
```text
L1: {
L2:   "timestamp": "2026-10-14T03:41:00Z",
L3:   "candidateId": "frozen_teacher_v2",
L4:   "rulesRevision": "apk-4.2.5.1-rules-20261013-r4",
L5:   "cleanEnvZipSha256": "323924ab76a8272322f4b122d64e4af4ff2574a85c6a4d996bf4cb9680bffea8",
L6:   "teacherConfig": {
L7:     "targetK": 4,
L8:     "opponentPolicies": [
L9:       "heuristic",
L10:       "apk_like"
L11:     ],
L12:     "responseAggregation": "min",
L13:     "useFullResponse": true,
L14:     "multiHandoffDepth": 1,
L15:     "maxSimulationSteps": 40,
L16:     "maxOwnSteps": 20,
L17:     "maxWallMs": 3000,
L18:     "seed": 42,
L19:     "evaluatorWeights": {
L20:       "materialWeight": 1.0,
L21:       "goldWeight": 0.25,
L22:       "castleWeight": 150.0,
L23:       "townWeight": 75.0,
L24:       "pushWeight": 0.0,
L25:       "territoryWeight": 15.0,
L26:       "tanhScale": 2000.0,
L27:       "maxNonTerminalBound": 0.90
L28:     }
L29:   },
L30:   "arenaProtocol": {
L31:     "devMaps": [
L32:       "(2) Icy Paths.aem",
L33:       "(2) The Crossing.aem"
L34:     ],
L35:     "pairsPerMapVsHeuristic": 10,
L36:     "pairsPerMapVsApkLike": 10,
L37:     "totalPairsPerOpponent": 20,
L38:     "totalGamesPerOpponent": 40,
L39:     "grandTotalGames": 80,
L40:     "openingFamilies": [
L41:       "0_handoff",
L42:       "4_handoff",
L43:       "8_handoff"
L44:     ],
L45:     "seedList": [
L46:       1042, 1142, 1242, 1342, 1442, 1542, 1642, 1742, 1842, 1942
L47:     ],
L48:     "matchLimits": {
L49:       "maxAtomicActions": 1000,
L50:       "maxHandoffs": 80,
L51:       "maxEpisodeWallSeconds": 300
L52:     },
L53:     "stoppingRule": "事先固定 40 局/对手，严格全量执行，严禁依据中途胜率动态追加或提前终止。"
L54:   },
L55:   "gateBCriteria": {
L56:     "conservativeScoreMin60": "保守得分 (95% CI 下界) >= 60.0%",
L57:     "ci95LowerMin50": "配对簇 95% CI 下界 > 50.0%",
L58:     "truncationMax10Pct": "截断率 <= 10.0%",
L59:     "errorsZero": "系统与规则执行错误数 == 0",
L60:     "noRegressionOnSecondary": "对次级基线胜率 >= 50.0%",
L61:     "tacticalSuitePass": "新题库验收率 >= 80.0% 且旧 32 题口径通过数 >= 26 题"
L62:   }
L63: }
```

## E03 — 已有回放重放及延迟重算
本次生成结果：`evidence/replay_audit.json`；SHA256：`0be20dd46cac03c73f95bc444e0ac961f73267396ea9ecfc2c1bbbfd5e72afc6`。
本次生成结果：`evidence/timing_summary.json`；SHA256：`561bb9f9b1cd1ad91ffb37c87179ba5f13b307d293d870a8be9246007173fae4`。

## E04 — 实际评测参数、选择调用与失败回放采样

来源：`ai_training/r5_eval_teacher_v2_20261014_023500/scratch/evaluate_gate_b_v2.ts`，L40–L180；SHA256：`8fabb202e520e682f2fa031c999bad2ee5bf252ffd0a03549e94e5956df099f5`。
```text
L40:         step_limit_exhausted: number;
L41:         wall_clock_timeout: number;
L42:         rule_protocol_error: number;
L43:     };
L44:     recommendation: string;
L45: }
L46: 
L47: async function runGateB(pairsPerMapVsH: number = 5, pairsPerMapVsApk: number = 5) {
L48:     console.log(`=== [GATE B] 启动正式教师资格复验 (vs H: ${pairsPerMapVsH * 2} pairs, vs Apk: ${pairsPerMapVsApk * 2} pairs) ===`);
L49: 
L50:     const devMaps = ['(2) Icy Paths.aem', '(2) The Crossing.aem'];
L51:     const pOldSuite = path.resolve(__dirname, '../eval/tactical_suite_original.json');
L52:     const pNewSuite = path.resolve(__dirname, '../eval/tactical_suite_v2.json');
L53: 
L54:     // 冻结候选教师 frozen_teacher_v2 (支持轻量控图地缘估值)
L55:     const teacher = new SearchTeacherV2('frozen_teacher_v2', {
L56:         targetK: 4,
L57:         useFullResponse: true,
L58:         opponentPolicies: ['heuristic', 'apk_like'],
L59:         evaluatorWeights: ABLATION_CONFIGS_EVALUATOR.c_territory_only
L60:     });
L61: 
L62:     const hAI = new HeuristicAI();
L63:     const policyH: Policy = {
L64:         id: 'frozen_heuristic',
L65:         chooseAction: (ctx) => {
L66:             const act = hAI.getAction(ctx.engineClone, ctx.observerPlayerId);
L67:             return act ? encodeAction(act) : ctx.candidateCodes[0];
L68:         }
L69:     };
L70: 
L71:     const apkAI = new ApkLikeAI();
L72:     const policyApk: Policy = {
L73:         id: 'frozen_apklike',
L74:         chooseAction: (ctx) => {
L75:             const act = apkAI.getAction(ctx.engineClone, ctx.observerPlayerId);
L76:             return act ? encodeAction(act) : ctx.candidateCodes[0];
L77:         }
L78:     };
L79: 
L80:     const matchConfig = {
L81:         maxAtomicActions: 800,
L82:         maxHandoffs: 60,
L83:         maxEpisodeWallSeconds: 150
L84:     };
L85: 
L86:     // 1. 战术题套件评估 (同时核验旧题库与新修订题库)
L87:     console.log('>>> 正在进行战术题严格验收 (旧题库 44 题 & 新题库 54 题)...');
L88:     const tacResultsOld = await evaluateTacticalSuite(teacher, pOldSuite);
L89:     console.log(`[旧题库] 验收题解决率: ${(tacResultsOld.acceptanceRate * 100).toFixed(1)}% (${tacResultsOld.acceptanceSolved}/${tacResultsOld.acceptanceCases})`);
L90:     console.log(`[旧题库] 诊断题解决率: ${(tacResultsOld.diagnosticRate * 100).toFixed(1)}% (${tacResultsOld.diagnosticSolved}/${tacResultsOld.diagnosticCases})`);
L91: 
L92:     const tacResultsNew = await evaluateTacticalSuite(teacher, pNewSuite);
L93:     console.log(`[新题库] 验收题解决率: ${(tacResultsNew.acceptanceRate * 100).toFixed(1)}% (${tacResultsNew.acceptanceSolved}/${tacResultsNew.acceptanceCases})`);
L94:     console.log(`[新题库] 诊断题解决率: ${(tacResultsNew.diagnosticRate * 100).toFixed(1)}% (${tacResultsNew.diagnosticSolved}/${tacResultsNew.diagnosticCases})`);
L95: 
L96:     // 2. 对战最强冻结基线 (HeuristicAI)
L97:     console.log(`\n>>> 正在运行 Teacher vs Frozen Heuristic 配对对战 (${pairsPerMapVsH} 对/图 × 2 图 = ${pairsPerMapVsH * 2} 对 = ${pairsPerMapVsH * 4} 局)...`);
L98:     const arenaH = await runPairedArena(teacher, policyH, devMaps, pairsPerMapVsH, matchConfig, 1000);
L99: 
L100:     console.log(`vs Heuristic 结果: Wins=${arenaH.summary.winsA}, Loss=${arenaH.summary.winsB}, Draws=${arenaH.summary.draws}, Truncations=${arenaH.summary.truncations}, Errors=${arenaH.summary.errors}`);
L101:     console.log(`保守得分 (95% CI 下界): ${(arenaH.summary.conservativeScoreA * 100).toFixed(2)}%, 95% CI: [${(arenaH.summary.ci95Lower * 100).toFixed(2)}%, ${(arenaH.summary.ci95Upper * 100).toFixed(2)}%]`);
L102:     console.log(`截断分布: 重复状态=${arenaH.summary.truncationBreakdown.repeatedState}, 换手上限=${arenaH.summary.truncationBreakdown.plyLimit}, 步数上限=${arenaH.summary.truncationBreakdown.stepLimit}, 墙钟超时=${arenaH.summary.truncationBreakdown.wallSeconds}`);
L103: 
L104:     // 3. 对战次级基线 (ApkLikeAI)
L105:     console.log(`\n>>> 正在运行 Teacher vs Frozen ApkLike 配对对战 (${pairsPerMapVsApk} 对/图 × 2 图 = ${pairsPerMapVsApk * 2} 对 = ${pairsPerMapVsApk * 4} 局)...`);
L106:     const arenaApk = await runPairedArena(teacher, policyApk, devMaps, pairsPerMapVsApk, matchConfig, 2000);
L107: 
L108:     console.log(`vs ApkLike 结果: Wins=${arenaApk.summary.winsA}, Loss=${arenaApk.summary.winsB}, Draws=${arenaApk.summary.draws}, Truncations=${arenaApk.summary.truncations}, Errors=${arenaApk.summary.errors}`);
L109:     console.log(`保守得分 (95% CI 下界): ${(arenaApk.summary.conservativeScoreA * 100).toFixed(2)}%, 95% CI: [${(arenaApk.summary.ci95Lower * 100).toFixed(2)}%, ${(arenaApk.summary.ci95Upper * 100).toFixed(2)}%]`);
L110:     console.log(`截断分布: 重复状态=${arenaApk.summary.truncationBreakdown.repeatedState}, 换手上限=${arenaApk.summary.truncationBreakdown.plyLimit}, 步数上限=${arenaApk.summary.truncationBreakdown.stepLimit}, 墙钟超时=${arenaApk.summary.truncationBreakdown.wallSeconds}`);
L111: 
L112:     // 4. 精细归因统计与失败样本归档
L113:     const failureStats = {
L114:         natural_losses: 0,
L115:         endgame_loop_repeated: 0,
L116:         ply_limit_exhausted: 0,
L117:         step_limit_exhausted: 0,
L118:         wall_clock_timeout: 0,
L119:         rule_protocol_error: 0
L120:     };
L121: 
L122:     const failedRecords: MatchRecord[] = [];
L123:     const allRecords = [...arenaH.records, ...arenaApk.records];
L124: 
L125:     for (const rec of allRecords) {
L126:         const teacherSeat = rec.policies[0] === teacher.id ? 0 : 1;
L127:         const opponentSeat = 1 - teacherSeat;
L128: 
L129:         if (rec.outcome.isNaturalTerminal && rec.outcome.winnerAlliance === opponentSeat) {
L130:             failedRecords.push(rec);
L131:             failureStats.natural_losses++;
L132:         } else if (rec.outcome.terminationReason === 'truncated_repeated_state') {
L133:             failedRecords.push(rec);
L134:             failureStats.endgame_loop_repeated++;
L135:         } else if (rec.outcome.terminationReason === 'truncated_ply_limit') {
L136:             failedRecords.push(rec);
L137:             failureStats.ply_limit_exhausted++;
L138:         } else if (rec.outcome.terminationReason === 'truncated_step_limit') {
L139:             failedRecords.push(rec);
L140:             failureStats.step_limit_exhausted++;
L141:         } else if (rec.outcome.terminationReason === 'truncated_wall_seconds') {
L142:             failedRecords.push(rec);
L143:             failureStats.wall_clock_timeout++;
L144:         } else if (rec.outcome.isError) {
L145:             failedRecords.push(rec);
L146:             failureStats.rule_protocol_error++;
L147:         }
L148:     }
L149: 
L150:     const failDir = path.resolve(__dirname, '../artifacts/failed_replays');
L151:     fs.mkdirSync(failDir, { recursive: true });
L152:     const savedFailures: string[] = [];
L153:     for (let i = 0; i < Math.min(10, failedRecords.length); i++) {
L154:         const failRec = failedRecords[i];
L155:         const failPath = path.join(failDir, `gate_b_failure_${i + 1}.json`);
L156:         fs.writeFileSync(failPath, JSON.stringify(failRec, null, 2), 'utf-8');
L157:         savedFailures.push(failPath);
L158:     }
L159:     console.log(`保存了 ${savedFailures.length} 份代表性失败/截断回放至 artifacts/failed_replays/`);
L160: 
L161:     // 5. 严格门槛审核 (Gate B Criteria)
L162:     const conservativeScoreMin60 = arenaH.summary.conservativeScoreA >= 0.60;
L163:     const ci95LowerMin50 = arenaH.summary.ci95Lower > 0.50;
L164:     const truncationRateH = arenaH.summary.truncations / (arenaH.summary.totalGames || 1);
L165:     const truncationMax10Pct = truncationRateH <= 0.10;
L166:     const errorsZero = arenaH.summary.errors === 0 && arenaApk.summary.errors === 0;
L167:     const noRegressionOnSecondary = arenaApk.summary.winRateA >= 0.50;
L168:     const tacticalSuitePass = tacResultsNew.acceptanceRate >= 0.80;
L169:     const oldTacticalSuitePass = tacResultsOld.acceptanceSolved >= 26; // 32 题口径需至少 26 题 (81.25%)
L170: 
L171:     let verdict: 'PASS' | 'FAIL' | 'BLOCKED' | 'PARTIAL' = 'FAIL';
L172:     if (conservativeScoreMin60 && ci95LowerMin50 && truncationMax10Pct && errorsZero && noRegressionOnSecondary && tacticalSuitePass && oldTacticalSuitePass) {
L173:         verdict = 'PASS';
L174:     } else {
L175:         verdict = 'FAIL';
L176:     }
L177: 
L178:     const recommendation = verdict === 'PASS'
L179:         ? '搜索教师在冻结规则下展现出超越规则基线的显著优势，具备进入下一阶段数据生产和学生蒸馏的准入资格！'
L180:         : `Gate B 资格复验明确判定为 [FAIL]！核心原因：对最强基线保守得分=${(arenaH.summary.conservativeScoreA * 100).toFixed(1)}%（门槛>=60%），CI95下界=${(arenaH.summary.ci95Lower * 100).toFixed(1)}%（门槛>50%），截断率=${(truncationRateH * 100).toFixed(1)}%（门槛<=10%），旧 32 题验收通过数=${tacResultsOld.acceptanceSolved}/32（门槛>=26题）。依据任务书硬性边界，严禁进入学生网络蒸馏或大规模数据生产！`;
```

来源：`ai_training/r5_eval_teacher_v2_20261014_023500/research/match_runner.ts`，L170–L262；SHA256：`be4ab552171826dcfbed8ce7e273fff3c801d7d4ff6bf0a3b4a40aefa25bfd46`。
```text
L170:         const gameplayKeyCounts = new Map<string, number>();
L171:         let previousPlayer = engine.getState().currentPlayer;
L172:         let totalHandoffs = 0;
L173:         let terminationReason: EpisodeTerminationReason | null = null;
L174:         let errorDetail: string | undefined = undefined;
L175: 
L176:         while (true) {
L177:             const currentState = engine.getState();
L178:             const stateHashBefore = computeStateHash(currentState);
L179: 
L180:             // 1. 检查权威规则终局
L181:             const terminalCheck = inspectTerminalState(currentState);
L182:             if (terminalCheck.isTerminal) {
L183:                 terminationReason = terminalCheck.terminationReason;
L184:                 break;
L185:             }
L186: 
L187:             // 2. 检查全局截断边界
L188:             if (steps.length >= this.config.maxAtomicActions) {
L189:                 terminationReason = 'truncated_step_limit';
L190:                 break;
L191:             }
L192:             if (totalHandoffs >= this.config.maxHandoffs) {
L193:                 terminationReason = 'truncated_ply_limit';
L194:                 break;
L195:             }
L196:             const wallElapsedSec = (Date.now() - wallStart) / 1000;
L197:             if (wallElapsedSec >= this.config.maxEpisodeWallSeconds) {
L198:                 terminationReason = 'truncated_wall_seconds';
L199:                 break;
L200:             }
L201: 
L202:             // 3. 重复局面检测
L203:             const gpKey = computeGameplayStateKey(currentState);
L204:             const count = (gameplayKeyCounts.get(gpKey) ?? 0) + 1;
L205:             gameplayKeyCounts.set(gpKey, count);
L206:             if (count >= this.config.repeatedStateLimit) {
L207:                 terminationReason = 'truncated_repeated_state';
L208:                 break;
L209:             }
L210: 
L211:             // 4. 获取当前玩家与合法动作
L212:             const currentPlayer = currentState.currentPlayer;
L213:             if (currentPlayer !== previousPlayer) {
L214:                 totalHandoffs += 1;
L215:                 previousPlayer = currentPlayer;
L216:             }
L217: 
L218:             const legalActions = engine.getLegalActions(currentPlayer);
L219:             if (legalActions.length === 0) {
L220:                 // 无合法动作时检查是否已获胜或需强制换手
L221:                 if (engine.isTerminal()) {
L222:                     const check = inspectTerminalState(engine.getState());
L223:                     terminationReason = check.terminationReason ?? 'natural_draw';
L224:                 } else {
L225:                     terminationReason = 'error_illegal_action';
L226:                     errorDetail = `Player ${currentPlayer} has 0 legal actions but engine is not terminal`;
L227:                 }
L228:                 break;
L229:             }
L230: 
L231:             const policy = policies.get(currentPlayer);
L232:             if (!policy) {
L233:                 terminationReason = 'error_exception';
L234:                 errorDetail = `No policy registered for player ${currentPlayer}`;
L235:                 break;
L236:             }
L237: 
L238:             const candidateSet = buildCandidateSet(legalActions, this.config.allowSurrender);
L239:             const stepStart = Date.now();
L240:             let chosenCode: string;
L241: 
L242:             try {
L243:                 // 提供给策略的是安全克隆，策略无法修改裁判引擎内部数据
L244:                 const engineClone = engine.clone();
L245:                 chosenCode = await policy.chooseAction({
L246:                     engineClone,
L247:                     observerPlayerId: currentPlayer,
L248:                     legalActions: candidateSet.actions,
L249:                     candidateCodes: candidateSet.candidateCodes,
L250:                     stateHash: stateHashBefore,
L251:                     stepIndex: steps.length
L252:                 });
L253:             } catch (err: any) {
L254:                 const msg = err?.message || String(err);
L255:                 if (msg.includes('Worker timed out') || msg.includes('timed out')) {
L256:                     terminationReason = 'error_worker_timeout';
L257:                 } else {
L258:                     terminationReason = 'error_exception';
L259:                 }
L260:                 errorDetail = msg;
L261:                 break;
L262:             }
```

## E05 — 候选配额、随机性与字典序预算偏置

来源：`ai_training/r5_eval_teacher_v2_20261014_023500/research/candidate_selector.ts`，L28–L172；SHA256：`647578b742fd31cb171e204738a6a15f2139c2ba4dbd1a046e93e5dee8da0462`。
```text
L28: }
L29: 
L30: /**
L31:  * 根候选选择器 (修正版)
L32:  * 严格保证探索配额真正生效，固定确定性排序与种子，杜绝 Math.random 漂移。
L33:  */
L34: export function selectRootCandidates(
L35:     engine: GameEngine,
L36:     playerId: number,
L37:     legalActions: readonly Action[],
L38:     options: CandidateSelectionOptions,
L39:     externalRng?: () => number
L40: ): CandidateSelectionResult {
L41:     const K = Math.max(1, options.targetK);
L42:     const A = legalActions.length;
L43:     const rng = externalRng ?? createDeterministicRng(options.seed ?? 42);
L44: 
L45:     if (A <= K) {
L46:         const codes = legalActions.map(encodeAction);
L47:         const reasons: Record<string, string> = {};
L48:         codes.forEach(c => (reasons[c] = 'all_legal_within_k'));
L49:         return {
L50:             selectedActions: [...legalActions],
L51:             selectedCodes: codes,
L52:             selectedIndicesInLegal: legalActions.map((_, i) => i),
L53:             selectionReasons: reasons
L54:         };
L55:     }
L56: 
L57:     const state = engine.getState();
L58:     const hAI = new HeuristicAI();
L59: 
L60:     // 1. 获取 HeuristicAI 启发式推荐的 topAction
L61:     const topAction = hAI.getAction(engine, playerId);
L62:     const topCode = topAction ? encodeAction(topAction) : null;
L63: 
L64:     const chosenIndices = new Set<number>();
L65:     const selectionReasons: Record<string, string> = {};
L66: 
L67:     // 槽位配额分配：
L68:     // explorationQuota: 预留给探索的槽位数
L69:     const nonTopFrac = options.nonTopPriorFraction ?? 0.20;
L70:     const explorationQuota = Math.max(0, Math.floor(K * nonTopFrac));
L71:     const exploitationCapacity = K - explorationQuota; // 启发式与关键战术可用槽位
L72: 
L73:     // A. 启发式 top-1
L74:     if (topCode) {
L75:         const topIdx = legalActions.findIndex(a => encodeAction(a) === topCode);
L76:         if (topIdx >= 0) {
L77:             chosenIndices.add(topIdx);
L78:             selectionReasons[topCode] = 'heuristic_top1';
L79:         }
L80:     }
L81:     if (chosenIndices.size === 0) {
L82:         chosenIndices.add(0);
L83:         selectionReasons[encodeAction(legalActions[0])] = 'fallback_first_legal';
L84:     }
L85: 
L86:     // B. 若存在 pending 单位，优先保留其部署动作
L87:     if (state.pendingUnitId && chosenIndices.size < exploitationCapacity) {
L88:         for (let i = 0; i < A; i++) {
L89:             const act = legalActions[i];
L90:             if ('unitId' in act && act.unitId === state.pendingUnitId) {
L91:                 const code = encodeAction(act);
L92:                 if (!chosenIndices.has(i)) {
L93:                     chosenIndices.add(i);
L94:                     selectionReasons[code] = 'resolve_pending';
L95:                     if (chosenIndices.size >= exploitationCapacity) break;
L96:                 }
L97:             }
L98:         }
L99:     }
L100: 
L101:     // C. 覆盖关键战术类别：attack, capture, heal, summon, repair
L102:     // 注意：除非在特定防守/招募情境，不过度提前用 recruit_to_castle 占满战术槽位
L103:     const keyTypes = ['attack', 'capture', 'heal', 'summon', 'repair'];
L104:     for (const kt of keyTypes) {
L105:         if (chosenIndices.size >= exploitationCapacity) break;
L106:         for (let i = 0; i < A; i++) {
L107:             if (!chosenIndices.has(i) && legalActions[i].type === kt) {
L108:                 const code = encodeAction(legalActions[i]);
L109:                 chosenIndices.add(i);
L110:                 selectionReasons[code] = `tactical_type_${kt}`;
L111:                 break;
L112:             }
L113:         }
L114:     }
L115: 
L116:     // D. 覆盖不同单位的行动多样性
L117:     const coveredUnits = new Set<string>();
L118:     for (const idx of chosenIndices) {
L119:         const a = legalActions[idx];
L120:         if ('unitId' in a) coveredUnits.add((a as any).unitId);
L121:         else if ('attackerId' in a) coveredUnits.add((a as any).attackerId);
L122:     }
L123: 
L124:     for (let i = 0; i < A && chosenIndices.size < exploitationCapacity; i++) {
L125:         const a = legalActions[i];
L126:         let uid: string | undefined;
L127:         if ('unitId' in a) uid = (a as any).unitId;
L128:         else if ('attackerId' in a) uid = (a as any).attackerId;
L129: 
L130:         if (uid && !coveredUnits.has(uid) && !chosenIndices.has(i)) {
L131:             const code = encodeAction(a);
L132:             chosenIndices.add(i);
L133:             coveredUnits.add(uid);
L134:             selectionReasons[code] = 'unit_diversity';
L135:         }
L136:     }
L137: 
L138:     // E. 保证探索配额真正生效：从未选动作中用确定性种子抽取
L139:     const remainingSlots = K - chosenIndices.size;
L140:     if (remainingSlots > 0) {
L141:         const unchosen: number[] = [];
L142:         for (let i = 0; i < A; i++) {
L143:             if (!chosenIndices.has(i)) unchosen.push(i);
L144:         }
L145: 
L146:         // Fisher-Yates 确定性洗牌
L147:         for (let i = unchosen.length - 1; i > 0; i--) {
L148:             const j = Math.floor(rng() * (i + 1));
L149:             [unchosen[i], unchosen[j]] = [unchosen[j], unchosen[i]];
L150:         }
L151: 
L152:         for (let i = 0; i < remainingSlots && i < unchosen.length; i++) {
L153:             const pick = unchosen[i];
L154:             const code = encodeAction(legalActions[pick]);
L155:             chosenIndices.add(pick);
L156:             selectionReasons[code] = 'exploration_quota';
L157:         }
L158:     }
L159: 
L160:     // 最终候选按动作编码确定性排序，消除遍历顺序波动
L161:     const finalIndices = [...chosenIndices].sort((a, b) => {
L162:         const codeA = encodeAction(legalActions[a]);
L163:         const codeB = encodeAction(legalActions[b]);
L164:         return codeA.localeCompare(codeB);
L165:     });
L166: 
L167:     return {
L168:         selectedActions: finalIndices.map(i => legalActions[i]),
L169:         selectedCodes: finalIndices.map(i => encodeAction(legalActions[i])),
L170:         selectedIndicesInLegal: finalIndices,
L171:         selectionReasons
L172:     };
```

来源：`src/game/ai/heuristic_ai.ts`，L10–L30；SHA256：`304d6e6b67d60d4363c02e377630c16eaa36d28d2b2bcf387193e60db39eb94e`。
```text
L10: 
L11: export type Rng = () => number;
L12: 
L13: export class HeuristicAI {
L14:     private rng: Rng;
L15: 
L16:     constructor(rng?: Rng) {
L17:         this.rng = rng ?? Math.random;
L18:     }
L19: 
L20:     public getAction(
L21:         engine: GameEngine,
L22:         playerId: number,
L23:         preparedActions?: readonly Action[]
L24:     ): Action {
L25:         const actions = preparedActions ?? engine.getLegalActions(playerId);
L26:         if (actions.length === 0) return { type: 'end_turn' };
L27: 
L28:         const state = engine.getState();
L29:         const tactics = new RuleTacticalEvaluator(state, playerId);
L30:         const scoredActions = actions.map(action => ({
```

来源：`src/game/ai/apk_like_ai.ts`，L20–L38；SHA256：`98756bd917e8dc308aa0cb61c38d29e7af286884864bdb23b6d789f81b496929`。
```text
L20:     'village_capturer'
L21: ] as const;
L22: 
L23: const GRIM_REAPER_ABILITIES = ['death_reaper'] as const;
L24: 
L25: export class ApkLikeAI {
L26:     private rng: Rng;
L27:     private heuristic: HeuristicAI;
L28: 
L29:     constructor(rng?: Rng) {
L30:         this.rng = rng ?? Math.random;
L31:         this.heuristic = new HeuristicAI(() => this.rng());
L32:     }
L33: 
L34:     public getAction(
L35:         engine: GameEngine,
L36:         playerId: number,
L37:         preparedActions?: readonly Action[]
L38:     ): Action {
```

## E06 — 教师相位、不完整候选与预算检查
本次生成结果：`evidence/fixture_audit.json`；SHA256：`427639f6233e81fb38bfbf0aa29edb4057b7754831b2a250ee35e5fe33302e89`。

来源：`ai_training/r5_eval_teacher_v2_20261014_023500/research/search_teacher_v2.ts`，L48–L62；SHA256：`c4dd96dba5651a437dab0c7043f725b707c13a1b6a6042f0177d4c18c964181d`。
```text
L48:  * 根候选统一相位搜索教师 v2 (支持推进势场、控图激励与多轮对抗)
L49:  */
L50: export class SearchTeacherV2 implements Policy {
L51:     public id: string;
L52:     protected config: Required<SearchTeacherConfigV2>;
L53:     protected hAI: HeuristicAI;
L54:     protected apkAI: ApkLikeAI;
L55: 
L56:     constructor(id: string = 'search_teacher_v2', config: SearchTeacherConfigV2 = {}) {
L57:         this.id = id;
L58:         this.config = { ...DEFAULT_TEACHER_CONFIG_V2, ...config };
L59:         this.hAI = new HeuristicAI();
L60:         this.apkAI = new ApkLikeAI();
L61:     }
L62: 
```

来源：`ai_training/r5_eval_teacher_v2_20261014_023500/research/search_teacher_v2.ts`，L126–L145；SHA256：`c4dd96dba5651a437dab0c7043f725b707c13a1b6a6042f0177d4c18c964181d`。
```text
L126: 
L127:         const candidateTraces: Record<string, CandidateEvaluationTrace> = {};
L128:         let stepCallsTotal = 0;
L129:         let bestCode = selection.selectedCodes[0];
L130:         let bestQ = -Infinity;
L131:         let fallbackReason: string | null = null;
L132:         let completedCandidatesCount = 0;
L133: 
L134:         for (let i = 0; i < selection.selectedActions.length; i++) {
L135:             if (performance.now() - startTime > this.config.maxWallMs) {
L136:                 fallbackReason = completedCandidatesCount > 0
L137:                     ? 'completed_partial_budget'
L138:                     : 'budget_exceeded_before_any_completion';
L139:                 break;
L140:             }
L141: 
L142:             const rootAction = selection.selectedActions[i];
L143:             const rootCode = selection.selectedCodes[i];
L144:             const selReason = selection.selectionReasons[rootCode] || 'unknown';
L145: 
```

来源：`ai_training/r5_eval_teacher_v2_20261014_023500/research/search_teacher_v2.ts`，L198–L343；SHA256：`c4dd96dba5651a437dab0c7043f725b707c13a1b6a6042f0177d4c18c964181d`。
```text
L198:             // 完成本方剩余行动
L199:             let ownSteps = 0;
L200:             let ownCompletedToHandoff = false;
L201:             while (!simEngine.isTerminal() &&
L202:                    simEngine.getState().currentPlayer === rootPlayerId &&
L203:                    ownSteps < this.config.maxOwnSteps) {
L204:                 const act = this.hAI.getAction(simEngine, rootPlayerId);
L205:                 if (!act) break;
L206:                 simEngine.step(act);
L207:                 candidateStepCalls++;
L208:                 stepCallsTotal++;
L209:                 ownSteps++;
L210:             }
L211: 
L212:             if (simEngine.getState().currentPlayer !== rootPlayerId) {
L213:                 ownCompletedToHandoff = true;
L214:                 actualHandoffs++;
L215:             }
L216: 
L217:             if (simEngine.isTerminal()) {
L218:                 const q = evaluateStateValueV2(simEngine.getState(), rootAllianceId, this.config.evaluatorWeights);
L219:                 candidateTraces[rootCode] = {
L220:                     actionCode: rootCode,
L221:                     selectionReason: selReason,
L222:                     engineStepCalls: candidateStepCalls,
L223:                     actualHandoffs,
L224:                     leafPhase: 'direct_terminal',
L225:                     opponentPolicy: 'none',
L226:                     isCompleted: true,
L227:                     stopReason: 'natural_terminal',
L228:                     valueComponents: { rawScore: q, leafQ: q },
L229:                     finalQ: q
L230:                 };
L231:                 completedCandidatesCount++;
L232:                 if (q > bestQ) {
L233:                     bestQ = q;
L234:                     bestCode = rootCode;
L235:                 }
L236:                 continue;
L237:             }
L238: 
L239:             if (!ownCompletedToHandoff) {
L240:                 const q = evaluateStateValueV2(simEngine.getState(), rootAllianceId, this.config.evaluatorWeights);
L241:                 const penalizedQ = q - 0.20;
L242:                 candidateTraces[rootCode] = {
L243:                     actionCode: rootCode,
L244:                     selectionReason: selReason,
L245:                     engineStepCalls: candidateStepCalls,
L246:                     actualHandoffs,
L247:                     leafPhase: 'incomplete_own_limit',
L248:                     opponentPolicy: 'own_baseline',
L249:                     isCompleted: false,
L250:                     stopReason: 'own_steps_exceeded',
L251:                     valueComponents: { rawScore: q, leafQ: penalizedQ },
L252:                     finalQ: penalizedQ
L253:                 };
L254:                 if (penalizedQ > bestQ) {
L255:                     bestQ = penalizedQ;
L256:                     bestCode = rootCode;
L257:                 }
L258:                 continue;
L259:             }
L260: 
L261:             // 模拟对手回应，支持多策略对抗与多轮对抗深度
L262:             const oppValues: number[] = [];
L263:             let allOpponentsCompleted = true;
L264:             let primaryOppStopReason: CandidateStopReason = 'reached_unified_phase';
L265: 
L266:             for (const oppPolicy of this.config.opponentPolicies) {
L267:                 const oppEngine = simEngine.clone();
L268:                 let oppSteps = 0;
L269:                 let reachedUnifiedPhase = false;
L270: 
L271:                 // 推进一轮或多轮换手
L272:                 const targetCycles = this.config.multiHandoffDepth;
L273:                 let cyclesCompleted = 0;
L274: 
L275:                 while (!oppEngine.isTerminal() && oppSteps < this.config.maxSimulationSteps) {
L276:                     const currState = oppEngine.getState();
L277:                     const currAlliance = getAllianceId(currState, currState.currentPlayer);
L278:                     if (currAlliance === rootAllianceId) {
L279:                         cyclesCompleted++;
L280:                         if (cyclesCompleted >= targetCycles) {
L281:                             reachedUnifiedPhase = true;
L282:                             break;
L283:                         }
L284:                     }
L285:                     const policyToUse = (currAlliance === rootAllianceId) ? 'heuristic' : oppPolicy;
L286:                     const act = this.getPolicyAction(policyToUse, oppEngine, currState.currentPlayer);
L287:                     if (!act) break;
L288:                     oppEngine.step(act);
L289:                     candidateStepCalls++;
L290:                     stepCallsTotal++;
L291:                     oppSteps++;
L292:                 }
L293: 
L294:                 if (oppEngine.isTerminal() || reachedUnifiedPhase) {
L295:                     actualHandoffs += cyclesCompleted;
L296:                 } else {
L297:                     allOpponentsCompleted = false;
L298:                     primaryOppStopReason = 'opp_steps_exceeded';
L299:                 }
L300: 
L301:                 const v = evaluateStateValueV2(oppEngine.getState(), rootAllianceId, this.config.evaluatorWeights);
L302:                 oppValues.push(v);
L303:             }
L304: 
L305:             let aggregatedQ = this.config.responseAggregation === 'min'
L306:                 ? Math.min(...oppValues)
L307:                 : oppValues.reduce((a, b) => a + b, 0) / (oppValues.length || 1);
L308: 
L309:             let leafPhase: LeafPhaseStatus = 'completed_unified_phase';
L310:             let stopReason: CandidateStopReason = 'reached_unified_phase';
L311: 
L312:             if (!allOpponentsCompleted) {
L313:                 leafPhase = 'incomplete_opp_limit';
L314:                 stopReason = primaryOppStopReason;
L315:                 aggregatedQ -= 0.15;
L316:             } else {
L317:                 completedCandidatesCount++;
L318:             }
L319: 
L320:             candidateTraces[rootCode] = {
L321:                 actionCode: rootCode,
L322:                 selectionReason: selReason,
L323:                 engineStepCalls: candidateStepCalls,
L324:                 actualHandoffs,
L325:                 leafPhase,
L326:                 opponentPolicy: this.config.opponentPolicies.join('+'),
L327:                 isCompleted: allOpponentsCompleted,
L328:                 stopReason,
L329:                 valueComponents: { rawScore: aggregatedQ, leafQ: aggregatedQ },
L330:                 finalQ: aggregatedQ
L331:             };
L332: 
L333:             if (aggregatedQ > bestQ) {
L334:                 bestQ = aggregatedQ;
L335:                 bestCode = rootCode;
L336:             }
L337:         }
L338: 
L339:         if (completedCandidatesCount === 0 && Object.keys(candidateTraces).length === 0) {
L340:             const fallbackAction = this.hAI.getAction(rootEngine, rootPlayerId);
L341:             bestCode = fallbackAction ? encodeAction(fallbackAction) : encodeAction(legalActions[0]);
L342:             fallbackReason = 'heuristic_top1';
L343:         }
```

## E07 — 开局seed参数与随机流接线

来源：`ai_training/r5_eval_teacher_v2_20261014_023500/research/openings.ts`，L22–L105；SHA256：`158751d18269e0b88a89520919560dd982ca1d1d464eb7c0d591b8c44fbbc0d8`。
```text
L22: /**
L23:  * 真实换手开局生成器
L24:  * 严格以玩家轮替 (currentPlayer 改变) 计数换手数，
L25:  * 若策略产生非法动作必须显式抛出异常，严禁静默回退！
L26:  */
L27: export function generateRealHandoffOpening(
L28:     mapName: string,
L29:     family: OpeningFamily,
L30:     baselinePolicy: Policy,
L31:     stepSeed: number = 42
L32: ): OpeningStateResult {
L33:     const rawState = createAppApkSkirmishGameState(mapName, 'SD');
L34:     const initialBoardHash = computeStateHash(rawState);
L35: 
L36:     if (family === '0_handoff') {
L37:         return {
L38:             family,
L39:             mapName,
L40:             targetHandoffs: 0,
L41:             actualHandoffs: 0,
L42:             initialBoardHash,
L43:             openingState: rawState,
L44:             openingStateHash: initialBoardHash,
L45:             openingActionCodes: [],
L46:             isTerminalDuringOpening: false
L47:         };
L48:     }
L49: 
L50:     const targetHandoffs = family === '4_handoff' ? 4 : 8;
L51:     const engine = new GameEngine(JSON.parse(JSON.stringify(rawState)));
L52:     const openingActionCodes: string[] = [];
L53: 
L54:     let currentHandoffs = 0;
L55:     let previousPlayer = engine.getState().currentPlayer;
L56:     let atomicStepLimit = 500; // 安全上限，防止单一回合死循环
L57:     let stepCount = 0;
L58: 
L59:     while (currentHandoffs < targetHandoffs && !engine.isTerminal() && stepCount < atomicStepLimit) {
L60:         stepCount++;
L61:         const curr = engine.getState();
L62:         const currPlayer = curr.currentPlayer;
L63: 
L64:         const legal = engine.getLegalActions(currPlayer);
L65:         if (legal.length === 0) {
L66:             break;
L67:         }
L68: 
L69:         const candidateCodes = legal.map(encodeAction);
L70:         const chosenCode = baselinePolicy.chooseAction({
L71:             engineClone: engine.clone(),
L72:             observerPlayerId: currPlayer,
L73:             legalActions: legal,
L74:             candidateCodes,
L75:             stateHash: computeStateHash(curr),
L76:             stepIndex: stepCount
L77:         });
L78: 
L79:         // 处理 Promise 或 string
L80:         const chosenStr = typeof chosenCode === 'string' ? chosenCode : '';
L81:         if (!chosenStr) {
L82:             throw new Error(`[OpeningGenerator] Policy returned empty action code at step ${stepCount}`);
L83:         }
L84: 
L85:         const matchedIdx = candidateCodes.indexOf(chosenStr);
L86:         if (matchedIdx === -1) {
L87:             throw new Error(
L88:                 `[OpeningGenerator] Illegal action chosen by baseline policy: "${chosenStr}". ` +
L89:                 `Legal actions count: ${candidateCodes.length}. Silent fallback is strictly forbidden.`
L90:             );
L91:         }
L92: 
L93:         const res = engine.step(legal[matchedIdx]);
L94:         if (res.info.includes('非法动作')) {
L95:             throw new Error(`[OpeningGenerator] Engine rejected action "${chosenStr}": ${res.info}`);
L96:         }
L97: 
L98:         openingActionCodes.push(chosenStr);
L99: 
L100:         const nextPlayer = engine.getState().currentPlayer;
L101:         if (nextPlayer !== previousPlayer) {
L102:             currentHandoffs++;
L103:             previousPlayer = nextPlayer;
L104:         }
L105:     }
```

## E08 — 重复局面key的真实字段遗漏
本次生成结果：`evidence/replay_audit.json`；SHA256：`0be20dd46cac03c73f95bc444e0ac961f73267396ea9ecfc2c1bbbfd5e72afc6`。

来源：`ai_training/r5_eval_teacher_v2_20261014_023500/research/state_hash.ts`，L1–L77；SHA256：`560000a2480a21c73c5f4e43e66121f1e59b559c7ccec514dcdb35a08e66ea77`。
```text
L1: import crypto from 'crypto';
L2: import { GameState } from '../env/src/game/types';
L3: 
L4: /**
L5:  * 递归将对象的键按字母顺序排序，用于生成稳定的规范 JSON
L6:  */
L7: function canonicalize(value: any): any {
L8:     if (value === null || typeof value !== 'object') {
L9:         return value;
L10:     }
L11:     if (Array.isArray(value)) {
L12:         return value.map(canonicalize);
L13:     }
L14:     const keys = Object.keys(value).sort();
L15:     const result: Record<string, any> = {};
L16:     for (const key of keys) {
L17:         result[key] = canonicalize(value[key]);
L18:     }
L19:     return result;
L20: }
L21: 
L22: /**
L23:  * 计算游戏状态的规范 JSON 字符串
L24:  */
L25: export function canonicalStateString(state: GameState): string {
L26:     // 保持原始数据完整性，按字母序对字段序列化
L27:     return JSON.stringify(canonicalize(state));
L28: }
L29: 
L30: /**
L31:  * 计算游戏状态的 SHA-256 哈希值
L32:  */
L33: export function computeStateHash(state: GameState): string {
L34:     const canonical = canonicalStateString(state);
L35:     return crypto.createHash('sha256').update(canonical).digest('hex');
L36: }
L37: 
L38: /**
L39:  * 玩法状态指纹（排除装饰性元数据，用于重复局面检测）
L40:  */
L41: export function computeGameplayStateKey(state: GameState): string {
L42:     const gameplayCore = {
L43:         currentPlayer: state.currentPlayer,
L44:         pendingUnitId: state.pendingUnitId ?? null,
L45:         graves: (state.graves ?? []).map(g => ({
L46:             id: g.id,
L47:             x: g.pos.x,
L48:             y: g.pos.y,
L49:             remainingTurns: g.remainingTurns,
L50:             ownerId: g.ownerId
L51:         })),
L52:         units: state.units.map(u => ({
L53:             id: u.id,
L54:             playerId: u.playerId,
L55:             unitClass: u.unitClass,
L56:             x: u.pos.x,
L57:             y: u.pos.y,
L58:             hp: u.hp,
L59:             level: u.level,
L60:             hasActed: u.hasActed,
L61:             hasMoved: u.hasMoved,
L62:             status: u.status
L63:         })),
L64:         tiles: state.map.tiles.map(row => row.map(t => ({
L65:             terrainId: t.terrainId,
L66:             ownerId: t.ownerId ?? null,
L67:             hp: t.hp ?? null
L68:         }))),
L69:         players: state.players.map(p => ({
L70:             id: p.id,
L71:             isAlive: p.isAlive,
L72:             commanderId: p.commanderId ?? null
L73:         }))
L74:     };
L75:     const str = JSON.stringify(canonicalize(gameplayCore));
L76:     return crypto.createHash('sha256').update(str).digest('hex');
L77: }
```

来源：`src/game/types.ts`，L1–L52；SHA256：`c8cd0abd460f70789a4b672aa3e0b33cf683058e4e7a13bbe0f4445430cee8ee`。
```text
L1: import { Tile } from './terrain';
L2: export interface Position {
L3:     x: number;
L4:     y: number;
L5: }
L6: export type UnitClass = 'soldier' | 'ghost' | 'mermaid' | 'archer' | 'slime' | 'water_elemental' | 'dark_mage' | 'witch' | 'paladin' | 'elf' | 'berserker' | 'wolf' | 'golem' | 'ice_elemental' | 'druid' | 'catapult' | 'wolf_archer' | 'dragon' | 'commander' | 'skeleton' | 'crystal';
L7: export type Ability = 'village_capturer' | 'castle_capturer' | 'repairer' | 'flying' | 'undead' | 'death_reaper' | 'water_child' | 'sharpshooter' | 'self_repair' | 'blinder' | 'summoner' | 'healer' | 'cleansing_aura' | 'fighting_spirit' | 'counter_storm' | 'earth_child' | 'poisoner' | 'ranged_defense' | 'mountain_child' | 'weakness_aura' | 'attack_aura' | 'supporter' | 'destroyer' | 'forest_child' | 'assault_troop' | 'melee_master';
L8: export type StatusType = "poisoned" | "inspired" | "blinded" | "weakened";
L9: export interface UnitStatus {
L10:     type: StatusType;
L11:     remainingTicks?: number;
L12:     remainingTurns?: number;
L13: }
L14: export interface Grave {
L15:     id: string;
L16:     pos: Position;
L17:     remainingTurns: number;
L18:     ownerId?: number;
L19: }
L20: export interface Unit {
L21:     id: string;
L22:     ownerId: number;
L23:     unitClass: UnitClass;
L24:     pos: Position;
L25:     hp: number;
L26:     maxHp: number;
L27:     hasMoved: boolean;
L28:     hasActed: boolean;
L29:     status?: UnitStatus;
L30:     level?: UnitLevel;
L31:     exp?: number;
L32:     movementRemaining?: number;
L33:     hasPostAttackMoved?: boolean;
L34:     hasBeenHealedThisTurn?: boolean;
L35:     hasBeenSupportedThisTurn?: boolean;
L36:     apkPendingRecruitSource?: 'empty_castle' | 'commander_castle';
L37:     apkUnitId?: number;
L38:     apkUnitExtra?: number;
L39:     apkUnitCode?: string;
L40:     apkStatic?: boolean;
L41:     apkTargeted?: boolean;
L42:     apkUnitHead?: number;
L43:     apkMoveOverrides?: Record<number, number>;
L44: }
L45: export interface PlayerState {
L46:     id: number;
L47:     gold: number;
L48:     isAlive: boolean;
L49:     commanderDeathCount: number;
L50:     commanderReserveLevel?: UnitLevel;
L51:     commanderReserveExp?: number;
L52: }
```

## E09 — 新特征编码及历史可复用推理合同
本次生成结果：`evidence/fixture_audit.json`；SHA256：`427639f6233e81fb38bfbf0aa29edb4057b7754831b2a250ee35e5fe33302e89`。

来源：`ai_training/r5_eval_teacher_v2_20261014_023500/research/features.ts`，L88–L155；SHA256：`1ef59364ff7cbd49191912cad6d3c94c430b0971452fb56cc51e903e55ebfabb`。
```text
L88: /**
L89:  * 编码实体表特征：[48, 16]
L90:  * 核心保证：同格 pending 单位作为独立实体完整保留在表中，绝不丢失！
L91:  */
L92: export function encodeEntities(
L93:     state: GameState,
L94:     observerPlayerId: number
L95: ): { entityBuffer: number[]; entityIdMap: Map<string, number> } {
L96:     const { maxEntities, featuresPerEntity } = FEATURE_SCHEMA_V1.entities;
L97:     const buf = new Array(maxEntities * featuresPerEntity).fill(0);
L98:     const entityIdMap = new Map<string, number>();
L99: 
L100:     const allUnits: Unit[] = [...state.units];
L101:     // 如果有 pendingUnitId，检查是否已在 units 中；若在，标出 is_pending_recruit
L102:     const pendingId = state.pendingUnitId;
L103: 
L104:     const count = Math.min(allUnits.length, maxEntities);
L105:     for (let i = 0; i < count; i++) {
L106:         const u = allUnits[i];
L107:         entityIdMap.set(u.id, i);
L108:         const offset = i * featuresPerEntity;
L109: 
L110:         // 0: valid_entity
L111:         buf[offset + 0] = 1.0;
L112:         // 1: norm_pos_x
L113:         buf[offset + 1] = u.pos.x / FEATURE_SCHEMA_V1.constants.maxCoord;
L114:         // 2: norm_pos_y
L115:         buf[offset + 2] = u.pos.y / FEATURE_SCHEMA_V1.constants.maxCoord;
L116: 
L117:         // 3: is_friendly, 4: is_enemy
L118:         const isFriend = areAlliedPlayers(state, u.ownerId, observerPlayerId);
L119:         buf[offset + 3] = isFriend ? 1.0 : 0.0;
L120:         buf[offset + 4] = isFriend ? 0.0 : 1.0;
L121: 
L122:         // 5: hp_norm (支持超额生命，缩放到 200)
L123:         buf[offset + 5] = u.hp / FEATURE_SCHEMA_V1.constants.maxHpScale;
L124:         // 6: max_hp_norm
L125:         buf[offset + 6] = u.maxHp / FEATURE_SCHEMA_V1.constants.maxHpScale;
L126:         // 7: level_norm (0..3 -> 0..1.0)
L127:         buf[offset + 7] = (u.level ?? 0) / 3.0;
L128:         // 8: exp_norm (0..600 -> 0..1.0)
L129:         buf[offset + 8] = (u.exp ?? 0) / 600.0;
L130:         // 9: has_acted
L131:         buf[offset + 9] = u.hasActed ? 1.0 : 0.0;
L132:         // 10: has_moved
L133:         buf[offset + 10] = u.hasMoved ? 1.0 : 0.0;
L134:         // 11: is_commander
L135:         buf[offset + 11] = u.unitClass === 'commander' ? 1.0 : 0.0;
L136:         // 12: is_pending_recruit
L137:         buf[offset + 12] = u.id === pendingId ? 1.0 : 0.0;
L138:         // 13: status_blinded
L139:         buf[offset + 13] = u.status?.type === 'blinded' ? 1.0 : 0.0;
L140:         // 14: status_poisoned
L141:         buf[offset + 14] = u.status?.type === 'poisoned' ? 1.0 : 0.0;
L142:         // 15: unit_class_index_norm
L143:         const cIdx = UNIT_CLASS_VOCAB.indexOf(u.unitClass);
L144:         buf[offset + 15] = cIdx >= 0 ? cIdx / 25.0 : 0.0;
L145:     }
L146: 
L147:     return { entityBuffer: buf, entityIdMap };
L148: }
L149: 
L150: /**
L151:  * 编码全局特征：[12]
L152:  */
L153: export function encodeGlobal(state: GameState, observerPlayerId: number): number[] {
L154:     const G = FEATURE_SCHEMA_V1.global.featureDim;
L155:     const buf = new Array(G).fill(0);
```

来源：`ai_training/r5_eval_teacher_v2_20261014_023500/research/features.ts`，L220–L294；SHA256：`1ef59364ff7cbd49191912cad6d3c94c430b0971452fb56cc51e903e55ebfabb`。
```text
L220: export function encodeActions(
L221:     legalActions: readonly Action[],
L222:     entityIdMap: Map<string, number>
L223: ): { actionBuffer: number[]; candidateCodes: string[] } {
L224:     const vocab = FEATURE_SCHEMA_V1.action.actionTypeVocabulary;
L225:     const FA = FEATURE_SCHEMA_V1.action.actionFeatureDim;
L226:     const A = legalActions.length;
L227:     const buf = new Array(A * FA).fill(0);
L228:     const candidateCodes: string[] = [];
L229: 
L230:     for (let i = 0; i < A; i++) {
L231:         const act = legalActions[i];
L232:         candidateCodes.push(encodeAction(act));
L233:         const offset = i * FA;
L234: 
L235:         // One-hot action type (0..13)
L236:         const typeIdx = vocab.indexOf(act.type);
L237:         if (typeIdx >= 0 && typeIdx < 14) {
L238:             buf[offset + typeIdx] = 1.0;
L239:         }
L240: 
L241:         // 14: actor_entity_index_norm
L242:         let actorId: string | undefined;
L243:         let targetId: string | undefined;
L244:         let targetPos: { x: number; y: number } | undefined;
L245:         let unitClassRecruit: string | undefined;
L246: 
L247:         if ('unitId' in act) actorId = act.unitId;
L248:         else if ('attackerId' in act) actorId = act.attackerId;
L249:         else if ('healerId' in act) actorId = act.healerId;
L250:         else if ('supporterId' in act) actorId = act.supporterId;
L251:         else if ('summonerId' in act) actorId = act.summonerId;
L252: 
L253:         if ('targetId' in act) targetId = act.targetId;
L254:         if ('to' in act) targetPos = act.to;
L255:         else if ('target' in act) targetPos = act.target;
L256:         else if ('spawnPos' in act) targetPos = act.spawnPos;
L257:         else if ('castlePos' in act) targetPos = act.castlePos;
L258: 
L259:         if ('unitClass' in act) unitClassRecruit = act.unitClass;
L260: 
L261:         if (actorId && entityIdMap.has(actorId)) {
L262:             buf[offset + 14] = (entityIdMap.get(actorId)! + 1) / 48.0;
L263:         }
L264:         if (targetId && entityIdMap.has(targetId)) {
L265:             buf[offset + 15] = (entityIdMap.get(targetId)! + 1) / 48.0;
L266:         }
L267:         if (targetPos) {
L268:             buf[offset + 16] = targetPos.x / FEATURE_SCHEMA_V1.constants.maxCoord;
L269:             buf[offset + 17] = targetPos.y / FEATURE_SCHEMA_V1.constants.maxCoord;
L270:             buf[offset + 19] = 1.0; // has_target
L271:         }
L272:         if (unitClassRecruit) {
L273:             const uIdx = UNIT_CLASS_VOCAB.indexOf(unitClassRecruit);
L274:             buf[offset + 18] = uIdx >= 0 ? uIdx / 25.0 : 0.0;
L275:         }
L276:     }
L277: 
L278:     return { actionBuffer: buf, candidateCodes };
L279: }
L280: 
L281: /**
L282:  * 完整编码一个决策状态与合法候选
L283:  */
L284: export function encodeStateAndActions(
L285:     state: GameState,
L286:     legalActions: readonly Action[],
L287:     observerPlayerId: number,
L288:     stateHash: string,
L289:     allowSurrender: boolean = false
L290: ): EncodedStateFeatures {
L291:     const spatialBuffer = encodeSpatial(state, observerPlayerId);
L292:     const { entityBuffer, entityIdMap } = encodeEntities(state, observerPlayerId);
L293:     const globalBuffer = encodeGlobal(state, observerPlayerId);
L294:     const { actionBuffer, candidateCodes } = encodeActions(legalActions, entityIdMap);
```

来源：`source_snapshot/src/game/ai/shared_spatial_policy.ts`，L56–L128；SHA256：`19c2388f23d027357598d84ac36e45286782fc4a19df05f24fae72387c6fbb8c`。
```text
L56:         super(message);
L57:         this.name = 'EmptyActionSetError';
L58:     }
L59: }
L60: 
L61: /**
L62:  * Shared deterministic predictor execution.
L63:  * Ensures the exact same encoding, candidate extraction, and index selection logic.
L64:  */
L65: export function predictSpatialAction(
L66:     predictor: SpatialResNetPredictor,
L67:     state: GameState,
L68:     playerId: number,
L69:     legalActions: readonly Action[],
L70:     version?: 'v1' | 'v2'
L71: ): SpatialPredictionResult {
L72:     if (legalActions.length === 0) {
L73:         // V15/T15-02：空候选集不得凭空生成 end_turn。
L74:         // 任务书 §6 明确要求：空候选的 shared policy 必须「明确拒绝或返回类型化无动作结果」，
L75:         // 调用方处理；输出一个不在合法集中的 end_turn 会让上层把非法动作当成模型决策。
L76:         throw new EmptyActionSetError(
L77:             'predictSpatialAction: 合法动作集为空，拒绝构造 end_turn。'
L78:             + '这是无动作（例如该玩家没有任何可行动单位且不能结束）的诊断情形，'
L79:             + '必须由调用方按 NoAction 处理，不能当成模型选择了 end_turn。'
L80:         );
L81:     }
L82: 
L83:     // Auto-detect version from predictor if not explicitly specified
L84:     const encVersion = version ?? (predictor.isV2 ? 'v2' : 'v1');
L85: 
L86:     if (predictor.isV2 && encVersion !== 'v2') {
L87:         throw new Error('Contract mismatch: Predictor is v2 but v1 encoding requested');
L88:     }
L89: 
L90:     // V14/T14-03：通道数必须与已加载权重的 stem 输入通道数一致。
L91:     // 历史 24 通道权重继续用 24 通道编码（v13 语义），v14/v15 权重用 26 通道，
L92:     // V19/T19-01 权重用 34 通道；不允许把任一通道数的张量喂给另一种权重。
L93:     const predictorChannels = predictor.spatialChannels;
L94:     const supportedChannels = [24, 26, 34];
L95:     if (encVersion === 'v2' && !supportedChannels.includes(predictorChannels)) {
L96:         throw new Error(
L97:             `Unsupported predictor spatial channel count: ${predictorChannels}`
L98:             + `（已登记的 schema 通道数为 ${supportedChannels.join(' / ')}）`,
L99:         );
L100:     }
L101: 
L102:     // V15/T15-02：候选与状态编码一律按权重**声明的 schema**分派语义变体。
L103:     // 不能只按通道数/语义维度判断：v14 与 v15 形状相同而语义不同，
L104:     // 旧做法会让历史权重收到修好后的反击语义（V14b 审核 G1 反例）。
L105:     const encSpatial = encodeGameStateSpatial(state, playerId, encVersion, { channels: predictorChannels });
L106:     // 中文（V16/T16-02 §4.1）：先按 actionCode 的 Unicode 代码点字典序排成规范顺序，
L107:     // 再编码与打分。这样 exact tie 时 stableArgmax 取到的一定是**最小 actionCode**，
L108:     // 与引擎产生顺序、localeCompare、来源数组顺序都无关。
L109:     const ordered = canonicalActionOrderV16(legalActions);
L110:     const candSpatial: SpatialActionFeatures[] = encodeCandidateActionsSpatialForSchema(
L111:         state, playerId, ordered.map((item) => item.action), encVersion, predictor.encoderSchemaId,
L112:     );
L113: 
L114:     const pred = predictor.predict(encSpatial, candSpatial);
L115:     // 中文：predict 内部已是严格大于才换，索引即规范顺序下标；这里再用 stableArgmaxV16
L116:     // 复核一次，保证「精确并列取最小 actionCode」这条合同在任何 predictor 实现下都成立。
L117:     const bestIdx = stableArgmaxV16(pred.actionLogits);
L118:     if (bestIdx !== pred.bestActionIndex) {
L119:         throw new Error(
L120:             `[T16-02] predict 返回的 bestActionIndex=${pred.bestActionIndex} 与稳定 argmax=${bestIdx} 不一致；`
L121:             + '两者必须都按规范顺序、精确并列取最小下标，否则说明 predictor 实现被改过。'
L122:         );
L123:     }
L124: 
L125:     if (bestIdx === undefined || bestIdx < 0 || bestIdx >= ordered.length) {
L126:         throw new Error(
L127:             `Spatial predictor returned invalid bestActionIndex ${bestIdx} for ${ordered.length} legal actions`
L128:         );
```

来源：`source_snapshot/src/game/ai/spatial_tensor_encoder.ts`，L38–L105；SHA256：`a036ef0d771f1fb426ad18c8a586380e6f0d4926cb6a8fa781f242fdb9106424`。
```text
L38:  *   但“两个同名目标谁的等级更高”这类状态差异在策略输入上不可见。
L39:  *
L40:  * 通道编号是编码器语义的一部分：24 通道检查点不得被 26 通道编码器加载，反之亦然
L41:  * （见 spatial_conv_net.loadSpatialResNetFromJson 的 channels 校验）。
L42:  */
L43: export const SPATIAL_TENSOR_CHANNELS = 26;
L44: /**
L45:  * V19/T19-01：新增 8 个通道，总 34。
L46:  *
L47:  * 为什么必须加（不是「加大容量」，而是修已复现的信息缺失，见 `V18_REVIEW_AND_RULES.md` §2.4）：
L48:  * - 26 通道下，棋盘上的敌军只有粗兵种类别（`categorizeUnitClass/7`），
L49:  *   slime 与 water_elemental 同属「1/7」，交换两者位置后**空间张量、全局特征与全部 39 个
L50:  *   候选输入完全相同**，但引擎实际伤害是 20 对 45。
L51:  * - 26 通道的 Ch21 威胁用 `u.hasMoved ? 0 : move` 计算。我方行动期间敌军常保留上一回合
L52:  *   已经移动的标记，编码认为威胁为 0；交出回合后同一敌军恢复行动，威胁变成 1。
L53:  *   因此该通道不能当作「下一敌方行动阶段的危险图」。
L54:  *
L55:  * 新通道（编号 26..33）只承载**可核验的规则派生量**，不复用也不改写旧通道语义：
L56:  * | 通道 | 含义 | 归一化 |
L57:  * |---|---|---|
L58:  * | 26 | 敌方单位兵种身份索引 | / 21 |
L59:  * | 27 | 己方单位兵种身份索引 | / 21 |
L60:  * | 28 | 敌方有效物理防御 | / 60 |
L61:  * | 29 | 敌方有效魔法防御 | / 60 |
L62:  * | 30 | 敌方有效攻击 | / 200 |
L63:  * | 31 | **下一敌方行动阶段**威胁半径（按回合开始状态重置行动标记后重算） | 0/1 |
L64:  * | 32 | 己方剩余移动力（未移动则为有效移动力，已移动则为 0） | / 8 |
L65:  * | 33 | 己方有效物理防御 | / 60 |
L66:  *
L67:  * 明确不声称的东西：Ch31 是按曼哈顿半径与射程上界涂布的**上界**，不含地形路径、
L68:  * 最小射程空洞与多敌军相互作用的精确必杀概率；它只修正「时间语义」这一项已证实的缺陷。
L69:  */
L70: export const SPATIAL_TENSOR_CHANNELS_V19 = 34;
L71: /** 历史 24 通道语义，仅用于识别旧权重并给出明确拒绝信息。 */
L72: export const SPATIAL_TENSOR_CHANNELS_LEGACY = 24;
L73: export const SPATIAL_TENSOR_MAX_H = 20;
L74: export const SPATIAL_TENSOR_MAX_W = 20;
L75: export const GLOBAL_FEATURE_DIM_V1 = 16;
L76: export const GLOBAL_FEATURE_DIM_V2 = 20;
L77: export const GLOBAL_FEATURE_DIM = GLOBAL_FEATURE_DIM_V2;
L78: 
L79: export const ACTION_SEMANTIC_DIM_V1 = 24;
L80: export const ACTION_SEMANTIC_DIM_V2 = 32;
L81: /**
L82:  * V14：53 = 32 维基础语义 + 槽 32..52 的 21 维兵种 one-hot。
L83:  * one-hot 放在 32 维基础语义之后，因此 v2 原有槽位（含语义槽 15 的预计反击）含义不变。
L84:  */
L85: export const ACTION_SEMANTIC_DIM_V3 = 53;
L86: /** Path-3 在冻结的 53 维语义末尾追加三个纯规则路径事实。 */
L87: export const ACTION_SEMANTIC_DIM_PATH3 = 56;
L88: export const ACTION_SEMANTIC_DIM = ACTION_SEMANTIC_DIM_V3;
L89: 
L90: /**
L91:  * V14/T14-03：编码器输入语义版本。
L92:  *
L93:  * 权重必须声明它所解释的输入语义；旧权重不得静默加载到新语义上。
L94:  * - `spatial24_global20_actionSemantics32_v13`：历史语义。24 通道；攻击语义槽 15
L95:  *   在原状态上无条件反算反击，把 3 格外远程攻击也标成会反击（v13 复核反例）。
L96:  * - `spatial26_global20_actionSemantics32_v14`：本版本。26 通道（+hasMoved、+有效攻击力）；
L97:  *   反击判定改用 rules.canCounterAttack / estimateCounterDamage，与 engine.step 共用实现。
L98:  */
L99: export const ENCODER_SCHEMA_ID_V13 = 'spatial24_global20_actionSemantics32_v13';
L100: export const ENCODER_SCHEMA_ID_V14 = 'spatial26_global20_actionSemantics53_v14';
L101: /**
L102:  * V15/T15-02：本轮正式 schema。
L103:  *
L104:  * 与 V14 的**形状完全相同**（26 空间通道 / 20 全局 / 53 动作语义），差别只在语义：
L105:  * 攻击语义槽 15「预计反击」与槽 17「自杀风险」改用**完整引擎结算顺序**的投影，
```

## E10 — 战术题构造、非单变量消融和统计口径
本次生成结果：`evidence/fixture_audit.json`；SHA256：`427639f6233e81fb38bfbf0aa29edb4057b7754831b2a250ee35e5fe33302e89`。

来源：`ai_training/r5_eval_teacher_v2_20261014_023500/scratch/build_tactical_suite_v2.ts`，L20–L120；SHA256：`de6a40754f4b10a229f5983967233433d448a5527e2622ac082cc35786beacaf`。
```text
L20:     stateHash: string;
L21:     expectedActionCodes: string[];
L22:     explanation: string;
L23:     provenOptimal: boolean;
L24: }
L25: 
L26: function cloneState(s: GameState): GameState {
L27:     return JSON.parse(JSON.stringify(s));
L28: }
L29: 
L30: function setupCleanBoard(mapName: string = '(2) Duel.aem'): GameState {
L31:     const s = createAppApkSkirmishGameState(mapName, 'SD');
L32:     s.units = [];
L33:     s.graves = [];
L34:     s.pendingUnitId = undefined;
L35:     return s;
L36: }
L37: 
L38: function addUnit(
L39:     state: GameState,
L40:     id: string,
L41:     ownerId: number,
L42:     unitClass: any,
L43:     x: number,
L44:     y: number,
L45:     hp: number = 100,
L46:     hasActed: boolean = false,
L47:     level: any = 0
L48: ): Unit {
L49:     const u: Unit = {
L50:         id,
L51:         ownerId,
L52:         unitClass,
L53:         pos: { x, y },
L54:         hp,
L55:         maxHp: 100,
L56:         level,
L57:         exp: 0,
L58:         hasActed,
L59:         hasMoved: hasActed
L60:     };
L61:     state.units.push(u);
L62:     return u;
L63: }
L64: 
L65: export function buildSuiteV2(): TacticalCaseV2[] {
L66:     const cases: TacticalCaseV2[] = [];
L67: 
L68:     // =========================================================
L69:     // 类别 1: lethal_commander (斩首指挥官) - 3 题 (验收题)
L70:     // =========================================================
L71:     for (let i = 1; i <= 3; i++) {
L72:         const s = setupCleanBoard();
L73:         s.currentPlayer = 0;
L74:         const uAtk = addUnit(s, 'u_p0_atk', 0, 'archer', 4, 4, 100, false);
L75:         const uTgt = addUnit(s, 'u_p1_cmd', 1, 'commander', 4, 6, 15, false);
L76:         s.players[1].commanderId = 'u_p1_cmd';
L77: 
L78:         const atkCode = encodeAction({ type: 'attack', attackerId: uAtk.id, targetId: uTgt.id });
L79:         cases.push({
L80:             id: `tactical_lethal_cmd_${i}`,
L81:             category: 'lethal_commander',
L82:             title: `斩首指挥官案例 ${i}`,
L83:             description: '敌方指挥官仅存微量生命，我方弓手应优先实施致命斩首',
L84:             isDiagnostic: false,
L85:             state: s,
L86:             stateHash: computeStateHash(s),
L87:             expectedActionCodes: [atkCode],
L88:             explanation: '击杀敌方指挥官触发直接淘汰或大幅削弱',
L89:             provenOptimal: true
L90:         });
L91:     }
L92: 
L93:     // =========================================================
L94:     // 类别 2: lethal_castle (指挥官占领敌方城堡) - 3 题 (验收题)
L95:     // =========================================================
L96:     for (let i = 1; i <= 3; i++) {
L97:         const s = setupCleanBoard();
L98:         s.currentPlayer = 0;
L99:         const cPos = { x: 8, y: 8 };
L100:         const uCmd = addUnit(s, 'u_p0_cmd', 0, 'commander', cPos.x, cPos.y, 100, false);
L101:         s.players[0].commanderId = 'u_p0_cmd';
L102:         const capCode = encodeAction({ type: 'capture', unitId: uCmd.id });
L103: 
L104:         cases.push({
L105:             id: `tactical_lethal_castle_${i}`,
L106:             category: 'lethal_castle',
L107:             title: `城堡占领案例 ${i}`,
L108:             description: '我方指挥官已踏入敌方城堡，应立即执行 capture 占领城堡',
L109:             isDiagnostic: false,
L110:             state: s,
L111:             stateHash: computeStateHash(s),
L112:             expectedActionCodes: [capCode],
L113:             explanation: '占领城堡直接剥夺敌军基地招募',
L114:             provenOptimal: true
L115:         });
L116:     }
L117: 
L118:     // =========================================================
L119:     // 类别 3: heal_priority (圣骑士治疗核心) - 3 题 (验收题)
L120:     // 消除城堡招募干扰：残局情境下金币设为 0，专注治疗抉择
```

来源：`ai_training/r5_eval_teacher_v2_20261014_023500/scratch/run_t10_experiments.ts`，L20–L103；SHA256：`97b5a38df067749f43bdd254efcb62fe240058ef7cc4908640d17a2e4d706dae`。
```text
L20:     const pNewSuite = path.resolve(__dirname, '../eval/tactical_suite_v2.json');
L21: 
L22:     const hAI = new HeuristicAI();
L23:     const policyH: Policy = {
L24:         id: 'frozen_heuristic',
L25:         chooseAction: (ctx) => {
L26:             const act = hAI.getAction(ctx.engineClone, ctx.observerPlayerId);
L27:             return act ? encodeAction(act) : ctx.candidateCodes[0];
L28:         }
L29:     };
L30: 
L31:     const matchConfig = {
L32:         maxAtomicActions: 500,
L33:         maxHandoffs: 40,
L34:         maxEpisodeWallSeconds: 120
L35:     };
L36: 
L37:     // 定义 6 组对比实验变体：
L38:     const variants: Array<{
L39:         name: string;
L40:         tag: string;
L41:         teacher: any;
L42:     }> = [
L43:         {
L44:             name: '修复版基准 v1 (对照组)',
L45:             tag: 'v1_corrected_control',
L46:             teacher: new CorrectedSearchTeacherV1('v1_corrected_control', { targetK: 4 })
L47:         },
L48:         {
L49:             name: '变体 A: 候选精简覆盖 (K=3)',
L50:             tag: 'v2_varA_k3',
L51:             teacher: new CorrectedSearchTeacherV1('v2_varA_k3', { targetK: 3 })
L52:         },
L53:         {
L54:             name: '变体 B: 目标推进估值 (真实地形通行成本+控险)',
L55:             tag: 'v2_varB_push_only',
L56:             teacher: new SearchTeacherV2('v2_varB_push_only', {
L57:                 targetK: 4,
L58:                 evaluatorWeights: ABLATION_CONFIGS_EVALUATOR.b_push_only
L59:             })
L60:         },
L61:         {
L62:             name: '变体 C: 控图地缘估值',
L63:             tag: 'v2_varC_territory_only',
L64:             teacher: new SearchTeacherV2('v2_varC_territory_only', {
L65:                 targetK: 4,
L66:                 evaluatorWeights: ABLATION_CONFIGS_EVALUATOR.c_territory_only
L67:             })
L68:         },
L69:         {
L70:             name: '变体 D: 2 轮对抗换手推演',
L71:             tag: 'v2_varD_depth2',
L72:             teacher: new SearchTeacherV2('v2_varD_depth2', {
L73:                 targetK: 3,
L74:                 multiHandoffDepth: 2,
L75:                 maxSimulationSteps: 60
L76:             })
L77:         },
L78:         {
L79:             name: '变体 E: 综合改进 Teacher v2 (推进+控图+精选候选)',
L80:             tag: 'v2_combined_final',
L81:             teacher: new SearchTeacherV2('v2_combined_final', {
L82:                 targetK: 4,
L83:                 evaluatorWeights: ABLATION_CONFIGS_EVALUATOR.combined_push_territory
L84:             })
L85:         }
L86:     ];
L87: 
L88:     const results: any[] = [];
L89: 
L90:     for (const v of variants) {
L91:         console.log(`\n--------------------------------------------------`);
L92:         console.log(`>>> 正在评估: [${v.name}] (${v.tag})`);
L93:         const startTime = Date.now();
L94: 
L95:         // 1. 战术题评估 (新题库 54 题)
L96:         const tacRes = await evaluateTacticalSuite(v.teacher, pNewSuite);
L97:         console.log(`  战术验收题解决率: ${(tacRes.acceptanceRate * 100).toFixed(1)}% (${tacRes.acceptanceSolved}/${tacRes.acceptanceCases})`);
L98: 
L99:         // 2. 配对 Arena Pilot (对战 Heuristic, 2 地图 × 1 对 = 2 对 = 4 局)
L100:         const arenaRes = await runPairedArena(v.teacher, policyH, devMaps, 1, matchConfig);
L101:         const summ = arenaRes.summary;
L102: 
L103:         console.log(`  Pilot vs Heuristic: 胜=${summ.winsA}, 负=${summ.winsB}, 平=${summ.draws}, 截断=${summ.truncations}`);
```

来源：`ai_training/r5_eval_teacher_v2_20261014_023500/research/statistics.ts`，L25–L120；SHA256：`b9119e20482483eb20e36da81422184a0fc344cef6a9860fff0b2edd8b3e2a89`。
```text
L25:         return s / 4294967296;
L26:     };
L27: }
L28: 
L29: /**
L30:  * 按地图分层的 Bootstrap 95% 置信区间计算
L31:  * 保留配对为最小抽样单元，在每个地图层内部独立进行有放回重抽样，
L32:  * 避免小地图样本量偏差，并正确保持地图权重。
L33:  */
L34: export function computeStratifiedBootstrapCI(
L35:     samples: StratifiedClusterSample[],
L36:     iterations: number = 2000,
L37:     seed: number = 42
L38: ): BootstrapCIResult {
L39:     if (samples.length === 0) {
L40:         return {
L41:             sampleCount: 0,
L42:             mean: 0,
L43:             ci95Lower: 0,
L44:             ci95Upper: 0,
L45:             mapBreakdown: {}
L46:         };
L47:     }
L48: 
L49:     // 1. 按地图分层
L50:     const mapGroups = new Map<string, StratifiedClusterSample[]>();
L51:     for (const item of samples) {
L52:         if (!mapGroups.has(item.mapName)) {
L53:             mapGroups.set(item.mapName, []);
L54:         }
L55:         mapGroups.get(item.mapName)!.push(item);
L56:     }
L57: 
L58:     const rng = createLcgRng(seed);
L59:     const bootstrapMeans: number[] = [];
L60: 
L61:     for (let iter = 0; iter < iterations; iter++) {
L62:         let grandSum = 0;
L63:         let totalN = 0;
L64: 
L65:         for (const [_, itemsInMap] of mapGroups.entries()) {
L66:             const nMap = itemsInMap.length;
L67:             for (let j = 0; j < nMap; j++) {
L68:                 const pickIdx = Math.floor(rng() * nMap);
L69:                 grandSum += itemsInMap[pickIdx].pairScoreA;
L70:             }
L71:             totalN += nMap;
L72:         }
L73: 
L74:         bootstrapMeans.push(grandSum / (totalN || 1));
L75:     }
L76: 
L77:     bootstrapMeans.sort((a, b) => a - b);
L78:     const lowIdx = Math.floor(iterations * 0.025);
L79:     const highIdx = Math.floor(iterations * 0.975);
L80: 
L81:     const actualGrandMean = samples.reduce((acc, s) => acc + s.pairScoreA, 0) / samples.length;
L82: 
L83:     // 计算分地图指标
L84:     const mapBreakdown: Record<string, { count: number; mean: number; lower95: number; upper95: number }> = {};
L85:     for (const [mapName, itemsInMap] of mapGroups.entries()) {
L86:         const nMap = itemsInMap.length;
L87:         const mapActualMean = itemsInMap.reduce((acc, s) => acc + s.pairScoreA, 0) / nMap;
L88:         const mapBootMeans: number[] = [];
L89:         for (let iter = 0; iter < iterations; iter++) {
L90:             let sum = 0;
L91:             for (let j = 0; j < nMap; j++) {
L92:                 const pickIdx = Math.floor(rng() * nMap);
L93:                 sum += itemsInMap[pickIdx].pairScoreA;
L94:             }
L95:             mapBootMeans.push(sum / nMap);
L96:         }
L97:         mapBootMeans.sort((a, b) => a - b);
L98:         mapBreakdown[mapName] = {
L99:             count: nMap,
L100:             mean: mapActualMean,
L101:             lower95: mapBootMeans[lowIdx],
L102:             upper95: mapBootMeans[highIdx]
L103:         };
L104:     }
L105: 
L106:     return {
L107:         sampleCount: samples.length,
L108:         mean: actualGrandMean,
L109:         ci95Lower: bootstrapMeans[lowIdx],
L110:         ci95Upper: bootstrapMeans[highIdx],
L111:         mapBreakdown
L112:     };
L113: }
L114: 
L115: /**
L116:  * 计算完整轨迹的确定性 SHA-256 哈希
L117:  * 由初始状态哈希与全部动作代码序列组成，杜绝以单一终态哈希冒充轨迹唯一性！
L118:  */
L119: export function computeTrajectoryHash(initialStateHash: string, actionCodes: string[]): string {
L120:     const content = `${initialStateHash}::${actionCodes.join(';')}`;
```

## E11 — 本次固定状态/容量/回退反例
本次生成结果：`evidence/fixture_audit.json`；SHA256：`427639f6233e81fb38bfbf0aa29edb4057b7754831b2a250ee35e5fe33302e89`。

## E12 — V19覆盖训练的真实逐局结果
本次生成结果：`evidence/historical_raw_counts.json`；SHA256：`869b31cc179fa17d1022dc2e379808195710141e05ef33b5aa0a361bc4d63bd5`。

来源：`ai_training/v19/COVERAGE_ROUND_REPORT_20261004.md`，L1–L69；SHA256：`5191bb9376997510c68086c2a44c8b7514a592f06daea23e36ee9849f20400ef`。
```text
L1: # 现行规则覆盖扩量实验报告
L2: 
L3: 日期：2026-10-04。状态：四臂训练与两个固定DEV20面板已完成；16/20目标未达到，持续目标保持active。
L4: 
L5: ## 结论
L6: 
L7: 本轮把可用独特训练输入从上一轮751扩到5295，完成4次训练、2236次优化更新、71552次样本曝光，并评估初始模型加15个固定检查点。最终实际对局：全档主干CE模型4/20自然胜，策略头KL模型3/20自然胜。40场全部自然结束，无错误、截断或推理回退；两份面板完整性核验均通过。现有模型不替换，CONFIRM未运行。
L8: 
L9: 这轮不能支持“按现配方扩大数据就能显著提高胜率”。同时，它也没有证明增加数据或参数无效：扩大的是同75个家族内的状态覆盖，每个样本仅约4次曝光，训练样本自身尚未充分拟合，网络规模没有变化。
L10: 
L11: ## 数据与真实训练消费
L12: 
L13: 从已有现行规则轨迹选择11987个状态记录，重编码后只有5521种模型输入。隔离3种硬目标冲突、移除223种验证重叠输入，再去掉同目标重复，得到5295个独特训练输入，覆盖75家族。计划中的6000档与全档字节完全相同，故跳过重复训练。
L14: 
L15: 固定验证仍是885个已消费的内部回归输入：568个现行规则、317个历史课程。已逐行核验其与上一轮内容一致，没有混入训练。它们不是独立泛化或最终验收证据。
L16: 
L17: | 训练臂 | 独特输入 | 优化更新 | 实际曝光 | 现行规则宏Top1 | 现行CE | 相对θ1纠正/退步 |
L18: |---|---:|---:|---:|---:|---:|---:|
L19: | 初始θ1 | — | — | — | 69.27% | 2.468 | — |
L20: | 小档主干+策略CE | 2000 | 250 | 8000 | 65.59% | 1.865 | 14 / 35 |
L21: | 全档主干+策略CE | 5295 | 662 | 21184 | 67.42% | 1.535 | 31 / 42 |
L22: | 全档仅策略头CE | 5295 | 662 | 21184 | 67.42% | 1.756 | 12 / 23 |
L23: | 全档仅策略头CE+KL | 5295 | 662 | 21184 | 68.44% | 1.796 | 13 / 18 |
L24: 
L25: 表中Top1是模仿教师的动作准确率，不是胜率。宏Top1按家族等权，纠正/退步是568个现行验证输入的行数，分母口径不同。
L26: 
L27: 三组全档使用完全相同的batch计划。两组策略头实验的主干与value参数和θ1逐项相同；KL为0.5×KL(current||θ1)，在冻结主干时参考分布才确实固定。全部训练样本都进入了优化。小档每个样本4次，全档每个样本4或5次。
L28: 
L29: 历史课程宏Top1由θ1的34.77%上升到全档主干模型42.35%，但现行规则Top1和实际胜率下降，说明某一来源的离线改善不能替代部署场景的对局结果。
L30: 
L31: ## 固定20局结果
L32: 
L33: | 地图 | θ1历史DEV | 全档主干CE | 策略头KL |
L34: |---|---:|---:|---:|
L35: | Duel | 2/4 | 2/4 | 2/4 |
L36: | Icy Paths | 1/4 | 0/4 | 0/4 |
L37: | Liberty Port | 2/4 | 1/4 | 1/4 |
L38: | Mourningstar | 0/4 | 0/4 | 0/4 |
L39: | Crossed swords | 1/4 | 1/4 | 0/4 |
L40: | 合计 | 6/20 | 4/20 | 3/20 |
L41: 
L42: 两个新模型都使用原baseSeed=2609260100、五图每图两个seed换座、12000步/900秒上限，不换seed追分。模型是纯网络策略。规则、H0、推理策略和runner源码摘要与上一轮冻结身份一致。每个候选先通过20个根状态的TS/Python一致性核验，argmax分歧为0，最大logit误差分别约7.63e-6、1.05e-5。
L43: 
L44: θ1列为既有历史记录，没有重新跑一份基线；DEV已经多轮消费，不能把本轮差异包装成独立统计结论。当前正式冠军P1仍保持不变。
L45: 
L46: ## 为什么CE下降却没有更强
L47: 
L48: 1. **移动决策存在实质退步。** 全档模型在现行验证中移动动作纠正10个、退步23个，净减13；Mourningstar净减10个正确动作，Crossed swords净减6个。KL减少了退步，但也压制了纠错。
L49: 2. **不只是随机抖动。** 全档42个退步中33个启发式分差超过500，13个超过5000，仅4个不超过30。23个移动退步没有一个分差不超过30。KL的18个退步中13个超过500。该分差只是H0启发式评分，不是真实Q值或自然收益。
L50: 3. **数据行数高估了有效规模。** 11987条记录仅5521种输入，去重和验证隔离后5295；重复行不等于新知识。同75家族内扩状态也不等于增加新的起始局面分布。
L51: 4. **仍不能排除优化不足或容量限制。** θ1在5295训练输入上的一致率为59.94%，全档CE升至66.76%，KL为61.19%。训练集自身仍有大量错误；目前没有“训练几乎全对、验证很差”的强过拟合证据。仅靠这一轮不能认定必须扩大参数，也不能认定扩大参数无用。
L52: 5. **模仿H0不直接优化战胜H0。** 即使动作拟合继续提高，也需要真实自然胜率验证；达到80%胜率通常需要比当前监督来源更好的长程决策。本轮没有提供这样的新教师收益证据。
L53: 
L54: ## 后续执行顺序
L55: 
L56: 第一步先检验优化预算。保持5295训练输入、θ1初始化、前662次batch及学习率逐项一致，延长至约16次曝光（2648更新），662之后学习率保持1e-5。保存662/1324/2648；核验662点参数与本轮全档最终点完全一致，保证这是同一训练轨迹的延长。先看训练拟合、现行回归、移动纠正/退步，不预先宣称步数更多必然有效。
L57: 
L58: 第二步根据预算实验判断保持约束。已从训练池生成3174个θ1与H0一致的锚点，明确排除885验证输入。可用全局KL与只在一致训练行施加约束做配对，保持初始化、数据顺序与预算一致。锚点不能从验证集抽取，不能按DEV结果反复回选超参数。
L59: 
L60: 第三步才扩大新家族或模型容量。若训练拟合随预算继续改善、验证保持差，则优先改数据分布和保持损失；若训练拟合明显停滞，再做可控的容量/表示对照。任何分支最终仍需同一冻结模型通过原固定对局协议，不把离线指标当作16/20达标。
L61: 
L62: ## 证据与工程边界
L63: 
L64: - [本轮closeout](out/coverage_20261004/closeout.json)：完整消费、两面板和证据SHA。
L65: - [训练审计](out/coverage_20261004/training_audit.json)、[离线曲线](out/coverage_20261004/checkpoint_curve.json)、[分差诊断](out/coverage_20261004/teacher_regret.json)。
L66: - [训练池诊断](out/coverage_20261004/train_agreement.json)、[逐样本锚点](out/coverage_20261004/train_agreement_samples.jsonl)。
L67: - [全档面板](out/coverage_20261004/trunk_full_dev20_evidence.json)、[KL面板](out/coverage_20261004/head_kl_dev20_evidence.json)。
L68: 
L69: 初版导出在数据完整落盘后因动态导入生命周期导致manifest收尾失败。保留原exit1证据，修复工具后逐行复算来源、候选和选择集合，并每图固定8行重新编码，恢复manifest；没有重复整批标注或改数据过关。parity首次因缺少父目录失败，补齐目录后两个候选均通过。训练台账字段maxExampleExposures错误地记录总曝光数，本报告采用逐更新ledger重算的真实4至5次曝光，不把该字段当单样本次数。所有历史产物和未提交改动保留。
```

## E13 — V19延长训练的完成状态与曝光口径

来源：`ai_training/v19/out/coverage_fit_20261004/closeout.json`，L1–L70；SHA256：`b55400d09e72bdaa8eb13be2aa65053f0beb75601290bbd718a53810f24c7728`。
```text
L1: {
L2:   "schema": "v19_coverage_fit_closeout_1",
L3:   "date": "2026-10-04",
L4:   "classification": "progress",
L5:   "goalStatus": "active",
L6:   "objectiveAchieved": false,
L7:   "phaseCompleted": true,
L8:   "actualUpdates": 2648,
L9:   "actualExposures": 84736,
L10:   "uniqueOptimizedInputs": 5295,
L11:   "perSampleExposures": [
L12:     16,
L13:     17
L14:   ],
L15:   "prefixModelByteIdentical": true,
L16:   "prefixLedgerIdenticalExcludingDuration": true,
L17:   "prefixReplayedUpdates": 662,
L18:   "incrementalTrajectoryUpdates": 1986,
L19:   "trainingBefore": {
L20:     "agreed": 3535,
L21:     "agreementRate": 0.667610953729934,
L22:     "rows": 5295
L23:   },
L24:   "trainingAfter": {
L25:     "agreed": 3679,
L26:     "agreementRate": 0.6948064211520302,
L27:     "rows": 5295
L28:   },
L29:   "currentFinal": {
L30:     "families": 50,
L31:     "macroFamily": {
L32:       "crossEntropy": 1.4517175555047825,
L33:       "top1Accuracy": 0.6690808080808082
L34:     },
L35:     "rowWeighted": {
L36:       "crossEntropy": 1.4620891077307614,
L37:       "top1Accuracy": 0.6690140845070423
L38:     },
L39:     "rows": 568,
L40:     "uniqueInputs": 568
L41:   },
L42:   "changesAgainstTheta1": {
L43:     "bothWrongChanged": 54,
L44:     "changedArgmax": 128,
L45:     "sameArgmax": 440,
L46:     "teacherCorrected": 30,
L47:     "teacherRegressed": 44
L48:   },
L49:   "arenaGate": {
L50:     "currentMacroAtLeastTheta1": false,
L51:     "correctedAtLeastRegressed": false,
L52:     "trainingFitImproved": true
L53:   },
L54:   "arenaGatePassed": false,
L55:   "newArenaGames": 0,
L56:   "championChanged": false,
L57:   "nextTask": "用已冻结3174训练一致锚点，配对检验全局KL与选择性保持约束；不扩大同配方预算，不回灌885验证输入",
L58:   "interpretation": "继续低学习率训练提高训练拟合，却降低现行验证Top1；该预算配方失败，不能据此证明任何更大数据或模型都无效",
L59:   "evidenceSha256": {
L60:     "v19/out/coverage_fit_20261004/trunk_ce16/experiment_identity.json": "def9159d43eda360111a977a6f19f4a83545fcf7f3fb56c8b5b173e0cdc2f017",
L61:     "v19/out/coverage_fit_20261004/trunk_ce16/process_result.json": "0bbb3d93671eef34d9e99c335a553412c5f9fffcd7469a1560f7db15ca8a70f4",
L62:     "v19/out/coverage_fit_20261004/trunk_ce16/best.optimizer_update_ledger.jsonl": "a0632ce4193c0ff89c4afbe8b29f984e0a47177fd04ad05c5f54958a358095d9",
L63:     "v19/out/coverage_fit_20261004/trunk_ce16/final.json": "370e6595fe5763a33447a08ba003cdfc8865a90fb4ce48e96bdef1aef2649d23",
L64:     "v19/out/coverage_fit_20261004/trunk_ce16/best.u662.json": "aed96cc62b9fcb1f295516c9aa57b02cd20c184c5b219777734ad4340549bd45",
L65:     "v19/out/coverage_fit_20261004/checkpoint_curve.json": "78a71e8c2b1bf9f1d8cedbaf8eb23a065950dba6e5a30252f9d09a9ba6f26f38",
L66:     "v19/out/coverage_fit_20261004/fit16_final_train_diagnostic.json": "cdec616150af81a9ebfc934b30b14651e40f105e4cfa165d51ba727c091bff66",
L67:     "v19/out/coverage_fit_20261004/fit16_final_train_samples.jsonl": "86f5bd8e629c96a9898cb6ee819866f38af03b787244c6037e8030072af9f38c"
L68:   },
L69:   "builderSha256": "73c64573f5b95cc9d920e1a6d77c1d0720a7ec466a2f2bd46e3a5c10f9b5aff9"
L70: }
```

来源：`ai_training/v19/out/coverage_fit_20261004/trunk_ce16/optimized.json`，L1–L28；SHA256：`2e4fd6b457fa6bec03a0542755e924805cadd24fbeeaa238186e412bb56c4cc3`。
```text
L1: {
L2:   "schema": "v15_optimizer_consumption_2",
L3:   "measured": true,
L4:   "method": "accumulated only after a successful optimizer.step()",
L5:   "plannedTrainRows": 5295,
L6:   "batchSize": 32,
L7:   "updates": 2648,
L8:   "maxExampleExposures": 84736,
L9:   "totalExposures": 84736,
L10:   "optimizedUniqueSamples": 5295,
L11:   "plannedButNeverOptimized": 0,
L12:   "policyMaskedExposures": 0,
L13:   "valueSupervisedExposures": 0,
L14:   "valueMaskedExposures": 0,
L15:   "uniquePolicyInputKeys": 0,
L16:   "uniqueSourceStateKeys": 5295,
L17:   "uniqueRootFamilies": 75,
L18:   "exposuresBySource": {
L19:     "current_rules_coverage": 84736
L20:   },
L21:   "exposuresByPartition": {},
L22:   "updatesByEpoch": {
L23:     "1": 64,
L24:     "2": 64,
L25:     "3": 64,
L26:     "4": 64,
L27:     "5": 64,
L28:     "6": 64,
```

来源：`ai_training/v19/out/coverage_fit_20261004/trunk_ce16/process_result.json`，L1–L7；SHA256：`0bbb3d93671eef34d9e99c335a553412c5f9fffcd7469a1560f7db15ca8a70f4`。
```text
L1: {
L2:   "returnCode": 0,
L3:   "elapsedSeconds": 96.79699999996228,
L4:   "level": "full",
L5:   "arm": "trunk_ce16",
L6:   "identity": "offline_fit_diagnostic"
L7: }
```

## E14 — 历史方法、真实训练与发布身份

来源：`review_context/TRAINING_HISTORY.md`，L1–L39；SHA256：`764e889563ec4dfd20d9ba7dedaf67d90a85d3071eb75cf6fa7f999178a9b61c`。
```text
L1: # 截至本次交付的训练与研究历史导读
L2: 
L3: 以下是已有材料的导航与事实摘录，不是新的研究计划。计划书中的目标不等于实际完成，报告中的解释不等于已证明因果；详情须结合原始结果、代码和审计。更早历史规则不等同于最新冻结 r4。
L4: 
L5: ## 历史范围
L6: 
L7: | 阶段 | 已有工作与材料入口 |
L8: |---|---|
L9: | 早期 BC / 哈希动作模型、V1–V9 相关记录 | ai_training/training_runs/、training_configs/、docs/training/reports/；包括数据采样、行为克隆、空间模型、DAgger、专家迭代与评测记录。各 run 的完成程度依对应报告和结果判断 |
L10: | V10–V12 | ai_training/v10/V10_TASK_COMPLETION_REPORT.md、v11/V11_BATCH1_REPORT.md、v11/V11_BATCH2_REPORT.md、v12/V12_EXECUTION_REPORT.md、v12/V12_FOLLOWUP_REPORT.md；工程修复、受控学习、监督与评测协议 |
L11: | V13–V15 | v13/out/、v14/V14B_AUDIT_REVIEW.md、v15/V15_TASK_BRIEF.md；编码/前向/梯度一致性、数据身份与清洗、教师纠错、三 seed 与 D0/D1/D2 受控实验。V15 简报记录 NO_PROMOTION |
L12: | V16–V17 | 版本任务书、review/ 和 out/；完整回合教师、BattleSearch/B100 教师、策略/价值模型、蒸馏与开发对战；结合后续审核看待早期正面结论 |
L13: | V18 | v18/out/run_20260927_v18_01/final_report.md：记录训练/验证输入泄漏复核、监督修正、结构与价值实验；Arm A 5/20、Arm B 4/20，未超过当时起点 P1 5/20，最终独立验收未运行 |
L14: | V19 结果驱动训练 | v19/V19_PROGRESS_REVIEW_20260929.md、V19_RUN02_REVIEW_AND_NEXT.md、V19_R123_REVIEW_AND_SEARCH_20260930.md；PPO、连续波次、价值预热、反事实与搜索窗口诊断。审核记录 θ1 的开发面板 6/20，随后波次 4/20、4/20，正式冠军仍 P1 |
L15: | V19 表示与数据扩量 | v19/PATH3_ROUND_REPORT_20261003.md、review/data_scale_20261003/FOLLOWUP_REPORT.md、COVERAGE_ROUND_REPORT_20261004.md；Path3 两臂训练/80 局 DEV、旧数据恢复、数据规模对照与覆盖扩量 |
L16: | V19 延长拟合 | v19/out/coverage_fit_20261004/closeout.json；记录阶段完成、2648 次更新、84736 次曝光、5295 个独特输入；arenaGatePassed=false、newArenaGames=0、championChanged=false。相邻 progress.json 仍写 TRAINING_RUNNING，应视为状态文档不同步，不推断当前有进程 |
L17: | 2026-10-13 项目拆分与规则冻结 | ai_training/migration/REPORT.md、manifest.json，以及 source_snapshot/docs/rules/、docs/apk-analysis/；训练资料从公共项目拆分，APK 对齐后形成干净 r4 环境 |
L18: | T00–T06 | ai_training/r4_teacher_stage_20261013_121700/；构建环境、严格裁判、特征契约、Golden 样本、战术题和根候选搜索教师；Gate B FAIL |
L19: | T07–T12 | ai_training/r5_eval_teacher_v2_20261014_023500/；审计前阶段缺陷、修正评测与搜索、修改题库、6 组变体实验、冻结候选及 Gate B 复验；原始裁决仍 FAIL |
L20: 
L21: ## 历史数据规模与结果边界
L22: 
L23: V19 的 FOLLOWUP_REPORT.md 记录：旧哈希特征归档 2500 局、977737 条特征样本；本地旧原始动作轨迹 1395 局；现行规则 V17 状态轨迹 54622 行、140 家族。不能从哈希特征逆推出完整棋盘，也不能把这些总量视为全部适合当前规则与目标的有效监督输入。
L24: 
L25: 该报告记录了 50 局旧轨迹恢复验证、267063 步检查，以及独特训练输入从 271 增至 751 的六组监督训练。后续 COVERAGE_ROUND_REPORT 记录扩至 5295 个输入，4 次训练、2236 次更新；全档 CE 与策略头 KL 的开发对局分别为 4/20、3/20，40 局均自然结束。上述是当时环境/协议下的历史结果，不与新教师的墙钟截断率直接比较。
L26: 
L27: ## 最新两阶段的原始裁决读数
L28: 
L29: | 指标 | T00–T06 | T07–T12 |
L30: |---|---:|---:|
L31: | 对 Heuristic 胜 / 负 / 截断 | 0 / 0 / 20 | 0 / 0 / 20 |
L32: | 对 ApkLike 胜 / 负 / 截断 | 1 / 0 / 19 | 0 / 0 / 20 |
L33: | 旧 32 题验收 | 17/32 | 14/32 |
L34: | 新题库验收 | 无 | 23/42 |
L35: | 原始 Gate B 裁决 | FAIL | FAIL |
L36: 
L37: T07–T12 原始 JSON 将全部 40 局截断标为墙钟超时；不是已证实的 40 局重复状态死锁。消融中控图变体记录 29/42，正式冻结候选记录 23/42；需对照配置、随机性与预算，不能混用两轮数字。
L38: 
L39: 两个最新阶段主要研究搜索教师资格；历史 V10–V19 已有真实神经网络训练，不能把“最新阶段未开展学生训练”表述为“项目从未训练过模型”。
```

来源：`ai_training/v15/V15_TASK_BRIEF.md`，L1–L105；SHA256：`179cb44c7b92068b0f46f9aff90bf62da6538b641e653a5a1bc59008d57201e3`。
```text
L1: # V15 任务简报
L2: 
L3: 版本：1.0；编写日期：2026-09-25
L4: runId：`v15_20260925_core`（全部产物在 `v15/out/v15_20260925_core/`）
L5: 
L6: 本文件是**执行后的简报**，回答「这一轮到底做完了什么、结论是什么、下一步做什么」。
L7: 任务文档（要做什么）见 [`README.md`](README.md)；原始证据与逐条验收见 `v15/out/v15_20260925_core/`。
L8: 
L9: **本简报只写已实测的读数。** 每条结论都给出可复算的产物路径；没做到的写 NOT_STARTED / DEFERRED。
L10: 
L11: ---
L12: 
L13: ## 1. 结论摘要
L14: 
L15: | 项目 | 结论 |
L16: |---|---|
L17: | **发布裁决** | **`NO_PROMOTION`** |
L18: | 生产默认策略 | **保持 H0；本轮未替换任何模型，也未执行 `--deploy-to-src`** |
L19: | 独立确认集 | **未消耗**（按协议 §7.1 无合格组，这是要求的处置） |
L20: | 可拟合性 | **已达成**：与 V14 同任务构成的 128 状态回归 **128/128、CE=1.9e-06，TS 同样 128/128** |
L21: | 纠错实验 | **明确的负结果**：`D1−D0` 与 `D2−D1` 三 seed 平均各 **−0.0833**，**0/3 seed 为正** |
L22: | 对 H0 的相对强度 | 12 个模型（3 C2 + 9 D）的全计划差值点估计**全部 ≤ 0**，最好 −0.1250 |
L23: | 任务状态 | `DONE=10 / INCONCLUSIVE=1 / DEFERRED=2 / NOT_STARTED=1` |
L24: | Gate | `G0 GL GR GO GD GC GE GI` **PASS**；`GP` **4/5 PASS**；`GT` 未启动 |
L25: 
L26: **一句话**：证据链的三处硬缺陷已修好并可复算，干净 C2 基线与 D0/D1/D2 受控对照**都已跑完且有明确结论**；
L27: 结论是负面的——修复后的新基线仍弱于 H0，补充新访问数据没有优于继续重复旧池。
L28: 
L29: ---
L30: 
L31: ## 2. 入口文档（按阅读顺序）
L32: 
L33: | 文档 | 用途 |
L34: |---|---|
L35: | [`V15_TASK_BRIEF.md`](V15_TASK_BRIEF.md) | **本文件**：执行后的简报与下一步 |
L36: | [`README.md`](README.md) | 任务交接包总览与阅读顺序 |
L37: | [`V15_AGENT_TASKBOOK.md`](V15_AGENT_TASKBOOK.md) | T15-00~T15-11 的任务、依赖、所有权、验收、产物 |
L38: | [`V15_DATA_CONTRACT.md`](V15_DATA_CONTRACT.md) | 身份分层、状态恢复、三种随机流、schema、去重、训练消费 |
L39: | [`V15_EXPERIMENT_PROTOCOL.md`](V15_EXPERIMENT_PROTOCOL.md) | 预算、对照、统计定义、停止条件、选择门槛 |
L40: | [`V15_AGENT_START.md`](V15_AGENT_START.md) | 可直接复制的派发指令 |
L41: 
L42: 执行后的结果文档（在 run 目录里）：
L43: 
L44: | 文档 | 用途 |
L45: |---|---|
L46: | `final_report.md` | 自包含中文最终报告（已修好什么 / 差距变化 / D 组能支持什么 / 尚不确定 / 下一笔资源） |
L47: | `next_agent_handoff.md` | 下一 agent 交接：环境事实、沙箱陷阱、三个可立即执行事项（含完整命令与真实 SHA） |
L48: | `claim_ledger.json` | 14 条结论账本（PROVEN / FAILED / NOT_EXECUTED）+ 总体裁决 |
L49: | `package_manifest.json` | 证据链：50 个证据文件 + 15 个模型 + 22 个源码/工具的字节 SHA256 |
L50: | `task_status.json` | 14 个任务与 10 个 gate 的真实状态 |
L51: | `T15-00/protocol.json` | **冻结的**实验配置（seeds、roots、预算、caps、统计与选择门槛） |
L52: | `T15-00/v14b_errata.md` | 对 V14b 审核八条结论的逐条更正 |
L53: 
L54: ---
L55: 
L56: ## 3. 已修好的三处硬缺陷（都有正反例）
L57: 
L58: | 缺陷 | 修复与证据 |
L59: |---|---|
L60: | **教师探针无效**：原探针换 seed + 用全启发式轨迹冒充学生窗口 | 正确重放学生检查点 **40/40 动作一致**；原探针 **37/40 状态不一致**。T-label 的失败理由改为 `INVALID_PROBE` |
L61: | **反击投影漏掉攻击者升级** | 引擎顺序是「伤害→状态→攻击者 addExp→反击资格→反击伤害」。修复后审核反例 **预测 22 / 引擎 22**（旧预测 25）。18/18 战斗案例与引擎逐位一致、状态无污染 |
L62: | **schema 只按维度判断** | 新增显式语义变体分派（`v1_legacy` / `v13_legacy` / `v14_no_exp_projection` / `v15_current`）。形状相同的 v14 与 v15 不再互认；未知 schema fail-fast |
L63: 
L64: 另外修好：
L65: 
L66: - **训练生命周期**：跑满总更新后正常退出（`GLOBAL_UPDATE_LIMIT`），零消费 epoch=0，假「崩塌」根因消除；10 项针对性回归通过。
L67: - **训练器 plan 行号映射**：`PlanBatchSampler` 曾把 plan 的**绝对文件行号**当 `Subset` 位置。C2 因 train 恰好在前而恒等、从未暴露；D1/D2 抛 `IndexError`。已加显式映射。
L68: - **导出 schema 声明**：权重被误标成 v14，TS 端 fail-fast 拒载（这正说明分派生效）。已修并保留失败产物为证据。
L69: 
L70: ---
L71: 
L72: ## 4. 关键读数
L73: 
L74: ### 4.1 C2 三 seed 基线（新 schema、干净 split、L1 标签）
L75: 
L76: | seed | 更新 | 曝光 | 零消费 epoch | best val | best ep | 末 epoch train | 末 epoch val | final sha256 |
L77: |---:|---:|---:|---:|---:|---:|---:|---:|---|
L78: | 42 | 3,000 | 96,000 | 0 | 36.25% | 6 | 58.94% | 35.08% | `b406c50ba5e6df7a…` |
L79: | 1337 | 3,000 | 96,000 | 0 | 36.44% | 3 | 57.64% | 34.95% | `ecb5635532ce74da…` |
L80: | 2026 | 3,000 | 96,000 | 0 | 36.96% | 6 | 58.19% | 34.89% | `1c1d413b5f1e1880…` |
L81: 
L82: 全部由 `optimizer_update_ledger.jsonl` 独立复算；`plannedButNeverOptimized=0`；500/1500/3000 中间权重齐全。
L83: 
L84: **训练-验证差距（约 23 个百分点）与 V14b 审核一致**：训练集继续上升、验证停滞。
L85: 这支持「优先调查独立数据与分布」，**不支持**直接把正式训练改成零正则/更长更新/更大网络。
L86: 
L87: ### 4.2 数据（去污染）
L88: 
L89: | 项目 | 读数 |
L90: |---|---|
L91: | 复用原始状态快照 | 9,547 条（V14 归档，含完整 state） |
L92: | 状态摘要与归档一致 | 9,547 / 9,547 |
L93: | `policyInputKey` 唯一数 | **9,103**（合并 444 行） |
L94: | train / clean val | **6,140（32 家族）/ 1,545（8 家族）** |
L95: | root 家族交集 | **0** |
L96: | 去重前跨分区重复 | `train∩val=55`、`train∩test=109`、`val∩test=51` 个 key |
L97: | 标签冲突 key | 9（单列，未删除未改写） |
L98: 
L99: 历史 V14 的「150 组重复」用的是含目标动作与候选次序的旧 key，**两者不可互证**。
L100: 
L101: ### 4.3 纠错实验（本轮核心问题）
L102: 
L103: **受控侧：9/9 组核验通过（`problems=0`）**
L104: 
L105: | 因素 | 实测 |
```

来源：`ai_training/v19/V19_R123_REVIEW_AND_SEARCH_20260930.md`，L1–L58；SHA256：`efac0e4e07f87a5616d4823cce69b031659942766ba124c98d901f13076c8eab`。
```text
L1: # V19 R1 R2 R3 审核与搜索试验任务
L2: 
L3: 审核日期：2026年9月30日。本文接续既有 V19，不重新立一个训练版本。R1/R2/R3 已执行；当前 PPO 配方停止追加波次，进入 T19-07 的有限搜索试验。总目标未达成，正式冠军仍是 P1，DEV20 为 5/20。
L4: 
L5: ## 1 审核结论与证据范围
L6: 
L7: 独立重算 R2 的40条、R3的80条逐局记录，检查模型实际 SHA、双方配对身份、初始状态和评测上限；重算反事实有效性及同模型动作分差。另扫描 V14–V18 的200份 arena 对局文件，未发现与本次 FRESH40 的 map×seed×seat 重叠。这不代表穷尽了仓库外的评测。
L8: 
L9: 证据：`review/r123_20260930/audit.py`、`audit.json`。另外运行 `probe_icy_order.ts`，从真实 θ2 轨迹恢复 Icy 分歧状态，执行两条合法的两步攻击序列，结果在 `icy_order.json`。本审核没有独立重跑全部长局反事实，没有重跑完整测试套件，也没有启动新训练。
L10: 
L11: | 项目 | 核实结果 | 可以得出的结论 |
L12: |---|---|---|
L13: | R1 原轨迹 | 8/8 actionDigest 一致 | 基线重放成立 |
L14: | R1 干预 | 8次中5次自然结束，3次 POLICY_ERROR；有效5次里2次改变胜负 | 存在动作级可改变结果的样例，不代表8次都有效 |
L15: | R2 control | 4胜、13负、3截断 | 本次实际控制模型，不是历史 θ1 |
L16: | R2 fix | 6胜、14负、0截断 | 对控制多2胜，全部变化来自原先3次截断变自然结果 |
L17: | R3 θ1 | 9胜、31负 | 与冠军独立胜场持平 |
L18: | R3 P1 | 9胜、29负、2截断 | 冠军不变；35/40结果相同 |
L19: 
L20: θ1 为 `0089afe67e14462819bcc80601180e690327c40400b1aa9bd0bad03f19a30b47`。R2 control 为 `a161269e6750b0bd1981bd06ff0e4e61398ce2e75b034d131456a0fa9f96c395`，fix 为 `833d0ff754e62c29cba9fed99e61e36095fd6e25bd6247649d29b4edf971aba0`。历史 uniform 复现校验确实得到 θ1 SHA，但那是另外一次代码保行为验证，不能与生产 R2 control 混称。
L21: 
L22: ## 2 当前模型差在哪里
L23: 
L24: ### 已复现的具体缺陷是战斗次序判断
L25: 
L26: Icy 决策156，当前己方指挥官63 HP，远程精灵100 HP，敌方指挥官100 HP。两者都能合法攻击同一目标。按现行引擎实算：
L27: 
L28: | 攻击次序 | 精灵造成伤害 | 指挥官造成伤害 | 己方指挥官受到反击 | 最终敌方指挥官HP | 最终己方指挥官HP |
L29: |---|---:|---:|---:|---:|---:|
L30: | 精灵→指挥官 | 45 | 28 | 13 | 27 | 50 |
L31: | 指挥官→精灵 | 45 | 28 | 36 | 27 | 27 |
L32: 
L33: 精灵在距离2攻击，此处不受反击；先压低敌方HP会降低后续近战反击。相同进攻效果，仅次序不同就相差23点己方指挥官HP。原执行记录的单动作干预使 θ2 从负变胜；本审核独立验证的是上述局部规则后果，未重新跑完该7799步反事实整局。
L34: 
L35: 这说明至少一个真实失败涉及“远程削血→近战交换→保护重要单位”的组合决策。只学单动作分数、靠很长的终局轨迹间接归因，容易更新很多动作而仍错过这类组合。后一句是与证据相符的解释，不是已经证明所有败局都有相同原因。Mourningstar 的移动干预改变胜负，但路线、地形和后续经济机制尚未像 Icy 一样核算；Liberty 的两个首窗口未证明决定性。
L36: 
L37: ### 原报告的三处解释需要修正
L38: 
L39: 1. **logit 分差混用了两个模型。** 同一状态、同一模型内，Icy 的 θ1 差约0.0445，θ2差约0.0294；Mourningstar 分别约0.2823和0.2810。0.25/0.64不是所称的同模型动作差。小分差说明选择容易翻转，不能单独证明动作价值接近或导致训练失败。Icy第10回合按现有分桶属于中期，也不能把两个案例都归于开局。
L40: 2. **33.3%是数据总权重，不是实测梯度占比。** `training/ppo.py` 的 `effectiveGradientShareByPhase` 由样本数乘权重再归一计算；实际梯度还受优势、导数、方向、混合批次归一化及早停影响。梯度探针又在各阶段分别归一优势，与生产混合批次口径不同。因此“开局只拿18%梯度”“已经三等分梯度”的强因果结论不成立。
L41: 3. **预算上限相同，实际更新不同。** 两臂同 θ1 起点、同80局数据、同43369条入训决策，但 control 执行1356次更新，fix因KL早停只执行750次。可以比较这两套完整配置的实际结果，不能把差异完全归于阶段权重。现在不要求额外重跑一轮长对照来拖延搜索。
L42: 
L43: 干预工具还把 `POLICY_ERROR != 原结果` 写成 `changedOutcome=true`。后续只按真实自然结果判断改善；错误和截断保留为独立类别。分叉后的 A/B 状态不能冒充同一根状态比较动作。
L44: 
L45: 综合判断：数据记录和训练链已较过去可靠，但目前没有独立胜场收益；模型在已证实的组合战术上仍犯错，关键阶段 critic 又缺乏可靠排序证据。停止当前配方符合既定预算条件，并不等于证明 PPO 普遍无效。搜索路线的价值需要实测，不能保证它必然带来18/20。
L46: 
L47: ## 3 下一执行窗口的具体合同
L48: 
L49: 起点固定 θ1；P1继续作为冠军。fix保留，不同时开多套搜索/多起点网格。建议下一执行窗口以24小时为预算规划，先测吞吐再分配；准备工作尽量不超过2小时。预算用尽必须记录实际完成量和恢复位置，不能把计划量写成完成量。
L50: 
L51: ### S0 最小搜索正确性
L52: 
L53: 复用权威引擎及现有模型，不改规则、H0、合法动作过滤或评测caps。验证：同一完整根状态及H0 RNG可克隆恢复；恢复时不重复发初始收入；搜索按真实 currentPlayer 切换判断回合边界，兼容引擎自动换手；同一根的基线序列始终保留；自然胜负、截断、错误严格区分。使用本次 Icy 两步顺序作为回归例，但不把该 DEV 根状态加入训练集。
L54: 
L55: 修正新报告的分差、权重命名和反事实统计口径，保留旧原始证据。不要为了补“实测梯度图”再占满一个训练窗口。
L56: 
L57: ### S1 固定40窗口的整回合搜索试验
L58: 
```

来源：`source_snapshot/src/game/ai/models/model_registry.json`，L1–L45；SHA256：`f4635487db6b3428e774e52af391ffb120f3a20ef2dd016ad380051c23f598ff`。
```text
L1: {
L2:   "registryVersion": "v9",
L3:   "updatedAt": "2026-09-22T07:58:35+08:00",
L4:   "defaultProductionPolicy": "heuristic",
L5:   "policies": {
L6:     "heuristic": {
L7:       "policyId": "heuristic",
L8:       "title": "Heuristic AI (原生启发式)",
L9:       "isProductionDefault": true,
L10:       "isExperimental": false,
L11:       "architecture": "rule-based-expert",
L12:       "checkpoint": null,
L13:       "qualification": "PRODUCTION_DEFAULT",
L14:       "description": "Production default AI based on tactical heuristics and expert scoring"
L15:     },
L16:     "spatial_v2_experimental": {
L17:       "policyId": "spatial_v2_experimental",
L18:       "title": "Spatial ResNet v2 (实验性 7.8k 基础模型)",
L19:       "isProductionDefault": false,
L20:       "isExperimental": true,
L21:       "checkpoint": {
L22:         "relativePath": "training_runs/agent_upgrade_20260921_v8_final_01/checkpoints/spatial_resnet/spatial_resnet_v2_best.json",
L23:         "sha256": "1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92",
L24:         "architecture": "spatial-resnet-32ch-2blocks",
L25:         "encoderVersion": "v2",
L26:         "featureSchema": "spatial24_global20_actionSemantics32",
L27:         "objective": "policy-only",
L28:         "valueHeadQualified": false
L29:       },
L30:       "training": {
L31:         "runId": "agent_upgrade_20260921_v8_final_01",
L32:         "datasetSha256": "fd6b0b12b9f80697dbc2b666d79dafc84529e433bea8745f1e3a906b5dfcf5dd",
L33:         "splitManifestSha256": "ea1cbfb2c9afe2d65d2652e276e2178d4e120c4d910fbcf843197e73c698f688",
L34:         "consumedManifestSha256": "3361445889ce54feb2ad0e7488aa3d5b24429d55c3f95d6332aa794d006450fc",
L35:         "trainUniqueStates": 6528,
L36:         "valUniqueStates": 1304,
L37:         "totalUniqueStates": 7832,
L38:         "trainRootFamilies": 80,
L39:         "valRootFamilies": 13
L40:       },
L41:       "qualification": "QUALIFIED_DEV_BASELINE",
L42:       "description": "7,832 unique state v2 baseline with full 32-dim action semantics distinguishing recruit classes"
L43:     },
L44:     "spatial_dagger_experimental": {
L45:       "policyId": "spatial_dagger_experimental",
```

## E15 — 场景范围、污染风险与设备记录
本次生成结果：`evidence/historical_raw_counts.json`；SHA256：`869b31cc179fa17d1022dc2e379808195710141e05ef33b5aa0a361bc4d63bd5`。

来源：`ai_training/r5_eval_teacher_v2_20261014_023500/configs/scenario_split.json`，L1–L81；SHA256：`83db55acccb655df0f7e695b1aafd5fdf2a89f37717e49b07d8b4a7bcdb0d6eb`。
```text
L1: {
L2:   "schemaVersion": "ae-scenario-split-v1",
L3:   "rulesRevision": "apk-4.2.5.1-rules-20261013-r4",
L4:   "scope": {
L5:     "playerCount": 2,
L6:     "allianceCount": 2,
L7:     "mode": "SD",
L8:     "initialSetup": {
L9:       "initialGold": 300,
L10:       "unitLimit": 30,
L11:       "levelCap": 3
L12:     }
L13:   },
L14:   "splits": {
L15:     "train": [
L16:       {
L17:         "name": "(2) Duel.aem",
L18:         "width": 13,
L19:         "height": 13,
L20:         "historicalRole": "历史默认测试与回归主地图，开发集已知来源",
L21:         "approximateTileCount": 0
L22:       },
L23:       {
L24:         "name": "(2) Liberty Port.aem",
L25:         "width": 13,
L26:         "height": 13,
L27:         "historicalRole": "港口水陆混合图，训练来源",
L28:         "approximateTileCount": 0
L29:       },
L30:       {
L31:         "name": "(2) Swamplands.aem",
L32:         "width": 10,
L33:         "height": 10,
L34:         "historicalRole": "沼泽低速水草图，训练来源",
L35:         "approximateTileCount": 0
L36:       }
L37:     ],
L38:     "dev": [
L39:       {
L40:         "name": "(2) Icy Paths.aem",
L41:         "width": 15,
L42:         "height": 15,
L43:         "historicalRole": "冰雪地形独立评测图，用于搜索教师开发与 Gate B 资格验证",
L44:         "approximateTileCount": 0
L45:       },
L46:       {
L47:         "name": "(2) The Crossing.aem",
L48:         "width": 15,
L49:         "height": 10,
L50:         "historicalRole": "桥梁狭窄走廊图，用于搜索教师开发与 Gate B 资格验证",
L51:         "approximateTileCount": 0
L52:       }
L53:     ],
L54:     "test": [
L55:       {
L56:         "name": "(2) Peak Island.aem",
L57:         "width": 15,
L58:         "height": 15,
L59:         "historicalRole": "离岛孤峰封存地图，T12 最终发布前严禁消费与调参",
L60:         "approximateTileCount": 0
L61:       },
L62:       {
L63:         "name": "(2) Crossed swords.aem",
L64:         "width": 11,
L65:         "height": 18,
L66:         "historicalRole": "双剑狭长封存地图，T12 最终发布前严禁消费与调参",
L67:         "approximateTileCount": 0
L68:       }
L69:     ],
L70:     "quarantine": [
L71:       {
L72:         "name": "(2) Mourningstar.aem",
L73:         "width": 11,
L74:         "height": 11,
L75:         "historicalRole": "含 2 处 APK terrain 30 近似地块，按策略严格隔离",
L76:         "approximateTileCount": 2,
L77:         "quarantineReason": "approximate_terrain_policy"
L78:       }
L79:     ]
L80:   }
L81: }
```

来源：`ai_training/r4_teacher_stage_20261013_121700/artifacts/environment.json`，L1–L12；SHA256：`8002cc3afb0e8498c0251b66fbc2cc56c3ec0eecd393f2391f2a920121fed88e`。
```text
L1: {
L2:   "platform": "Windows-11-10.0.26340-SP0",
L3:   "processor": "AMD64 Family 26 Model 68 Stepping 0, AuthenticAMD",
L4:   "cpu_count_logical": 16,
L5:   "memory_total_gb": 47.1,
L6:   "python_version": "3.12.10 (tags/v3.12.10:0cc8128, Apr  8 2025, 12:21:36) [MSC v.1943 64 bit (AMD64)]",
L7:   "node_version": "v22.18.0",
L8:   "npm_version": "[WinError 2] 系统找不到指定的文件。",
L9:   "torch_version": "2.14.0+cpu",
L10:   "cuda_available": false,
L11:   "cuda_device_name": null
L12: }
```

### E12 原始逐局文件列表
- `ai_training/v19/out/coverage_20261004/arena/dev/head_kl.m0.games.jsonl`；SHA256：`6d822167bbc882cfabc8d3c2e910e87c030cf8fa0cb54a8fe24fa315fc2822e5`。
- `ai_training/v19/out/coverage_20261004/arena/dev/head_kl.m1.games.jsonl`；SHA256：`e932a8f0628ddb3e876ac00fba12e10878b8ef5d85b12d4141652cfae26a2d7c`。
- `ai_training/v19/out/coverage_20261004/arena/dev/head_kl.m2.games.jsonl`；SHA256：`33ffbc1fc631d526f33821c988cb975c0ac42f51e17cf03ea3718246e893b0ea`。
- `ai_training/v19/out/coverage_20261004/arena/dev/head_kl.m3.games.jsonl`；SHA256：`1a4e7ee043583212ff5372b48ef2d9e49494bf4f51762f490c8f4a42d86ac4d4`。
- `ai_training/v19/out/coverage_20261004/arena/dev/head_kl.m4.games.jsonl`；SHA256：`5b7242aed2eb7a6c9f9dcad6d452dec997b1feae2f6a05de0f2ba6e3e46a56a8`。
- `ai_training/v19/out/coverage_20261004/arena/dev/trunk_full.m0.games.jsonl`；SHA256：`ecf66f93c79c7c42d3e007fc50de9b710ec945c7c8ce59919e28cc9f29ea43eb`。
- `ai_training/v19/out/coverage_20261004/arena/dev/trunk_full.m1.games.jsonl`；SHA256：`0b14c3e1011086ce94cc5395e44dcc21343c2ef4f205111f2ffdacec01d479f0`。
- `ai_training/v19/out/coverage_20261004/arena/dev/trunk_full.m2.games.jsonl`；SHA256：`0e5386dca06735a6a286b4423cc556fa888303f888a2516c9fd97c9feb1367e4`。
- `ai_training/v19/out/coverage_20261004/arena/dev/trunk_full.m3.games.jsonl`；SHA256：`5d9a49c5372675b1286c68363b975fc706efcb9cf419a9b60363a9ad3f5de064`。
- `ai_training/v19/out/coverage_20261004/arena/dev/trunk_full.m4.games.jsonl`；SHA256：`6492668177bcce5b28ebbf37e19372b78cc179644765d1ae17de872e7582da1a`。
