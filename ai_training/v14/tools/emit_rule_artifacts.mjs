/**
 * V14/T14-01：从规则套件的真实运行结果生成交付工件。
 *
 * 只做“读结果 -> 写清单/报告”，不重新求值、不改写读数；
 * 因此无法运行套件时本脚本会明确失败，而不是造出空清单。
 *
 * 用法：
 *   node v14/tools/emit_rule_artifacts.mjs --run-id v14_20260924_t14
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, ensureDir, fileIdentity, gitInfo, realSha256, rel, writeJson } from './identity_lib.mjs';

const args = process.argv.slice(2);
function argOf(name, fallback) {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const runId = argOf('--run-id', 'v14_20260924_t14');
const t01 = ensureDir(path.join('v14', 'out', runId, 'T14-01'));
const resultsPath = path.join(t01, 'rule_suite_results.json');
if (!fs.existsSync(resultsPath)) {
    console.error(`[T14-01] 缺少 ${rel(resultsPath)}；先运行 rule_suite.test.ts，不能凭空生成清单。`);
    process.exit(1);
}
const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const git = gitInfo();

const fixtures = results.results.map((r) => ({
    fixtureId: r.fixtureId,
    scenario: r.scenario,
    verified: r.verified,
    actionCodes: r.actionCodes,
    predicateCount: r.predicates.length,
    failedPredicates: r.predicates.filter((p) => !p.pass).map((p) => p.label),
    pass: r.pass,
    unknownReasons: r.unknownReasons,
    readings: r.predicates.map((p) => ({
        kind: p.kind,
        label: p.label,
        pass: p.pass,
        reading: p.reading,
        expected: p.expected,
        note: p.note ?? null,
    })),
}));

const manifest = {
    schema: 'v14_fixture_manifest_1',
    task: 'T14-01',
    runId,
    generatedAt: new Date().toISOString(),
    head: git.head,
    sourceIdentity: [
        'v14/tools/rule_fixtures.ts',
        'v14/tools/rule_oracle.ts',
        'v14/tools/rule_suite.test.ts',
        'src/game/engine.ts',
        'src/game/rules.ts',
        'src/game/rule_config.ts',
        'src/game/abilities.ts',
        'src/game/map.ts',
    ].map((p) => fileIdentity(p)),
    resultsFile: fileIdentity(rel(resultsPath)),
    counts: results.counts,
    acceptanceRule: '只有 verified=true 的夹具谓词计入通过率；UNKNOWN 与未验证夹具单独列出，不计入分子与分母。',
    scenarios: results.scenarios,
    fixtures: fixtures.map(({ readings, ...rest }) => rest),
    fixturesWithReadings: fixtures,
};

const failedVerified = fixtures.filter((f) => f.verified && !f.pass);
const unknown = fixtures.filter((f) => !f.verified);

const contract = `# V14/T14-01 规则契约

- 运行根目录：\`v14/out/${runId}/T14-01/\`
- 源码 HEAD：\`${git.head}\`（分支 \`${git.branch}\`）
- 生成时间：${manifest.generatedAt}
- 夹具结果：${results.counts.fixtures} 个夹具 / ${results.counts.predicates} 条已验证谓词 / 失败 ${results.counts.failedFixtures} / UNKNOWN ${results.counts.unknownFixtures}

## 1. oracle 的证据规则

1. 所有读数来自真实 \`GameEngine.step\`（未开启 \`unsafeBypassValidationForTests\`）与真实 \`getLegalActions\`。
2. 每个谓词返回 PASS/FAIL 加可复核读数（引擎回执、HP、坐标、归属、winner、合法动作码集合）。
3. 禁止用“动作类别”代替结果：不存在“执行了 move 就算解围成功”这类谓词。
4. \`verified=false\` 的夹具只输出读数，不计入通过率；本轮 ${unknown.length} 个 UNKNOWN。
5. 一步终局用引擎一步执行判定；不把启发式 rollout 的胜利称为强制胜利（\`forced_win\` 只枚举第一层合法动作）。

## 2. 覆盖的场景与性质

| 场景 | 关键性质 | 反例 |
|---|---|---|
| 移动后攻击/占领 | 第一步不结束玩家回合；同一单位先移动再攻击 | 距离 3 时攻击不在合法集 |
| 普通远程反击 | 投石车距离 3 攻击士兵：引擎实际反击 0 | 相邻近战必须反击；击杀则不反击 |
| 最小射程/致盲/反击风暴 | 弓箭手 minRange 2 不能打相邻；致盲阻止普通反击 | 被打上致盲的目标不反击；反击风暴要求距离 ≤2 |
| 击杀、淘汰与联盟终局 | 最后一兵死亡但仍有城堡 ⇒ 不淘汰 | 主帅阵亡开关两种取值；联盟 ID 终局 |
| 占领机会 | 一步占领终局 vs 同样 capture 不终局（对手仍有单位） | 站上城堡却不占领；有紧急威胁时允许先做别的 |
| 城堡经济与伤害 | 拥有者回合开始结算收入与敌军占城伤害 | 敌方无建筑时收入为 0 |
| 招募与 pending | 空城 pending 锁定单位动作；指挥官堆叠 pending 来源 | 禁止 pending 期间结束回合；地面兵种被敌对单位封锁时无落点 |
| 指挥官重招 | 价格随死亡次数增长、保留等级经验、禁用时不出现 | 金币不足时不可招募 |
| 支援/治疗/召唤 | 支援重置目标行动；亡灵治疗变伤害；墓碑被消耗 | 未行动过的友军不能被支援 |
| 突击后移动 | 专用动作类型、落点、\`hasPostAttackMoved\` | 无 \`assault_troop\` 的单位没有该动作 |
| 地形与路径 | 曼哈顿近不等于可达；移动消耗按地形 | 飞行越水、非飞行不可 |
| 多人行动顺序 | 跳过死亡/禁用玩家；盟友不算敌人；四人顺序 | 下家是盟友时仍按 ID 顺序 |
| 结束回合 | 换回合与 \`turn\` 递增时机 | 存在一步致胜动作时提早 end_turn 是可证明损失 |
| 真平局与截断 | \`winner=-1\` 是规则平局 | 未终局的 \`winner=null\` 必须与平局区分 |

## 3. 本轮由规则测试定位并修复的缺陷

### 3.1 反击语义（v13 复核反例的修复证据）

- v13 编码器在“目标预计不死”时直接在原状态上反算反击，于是把 3 格外投石车攻击标成会反击。
- 修复：\`src/game/rules.ts\` 提供 \`canCounterAttack\` / \`estimateCounterDamage\` /
  \`counterDamageOnResolvedState\`；\`engine.step\` 的 attack 分支与编码器共用同一实现
  （\`engine.ts\` 的攻击分支改为调用 \`counterDamageOnResolvedState\`）。
- 夹具读数：\`counter/ranged-min-range-no-counter\` 断言引擎实际失血 0 且语义槽 15 为 0；
  \`counter/melee-does-counter\` 同时断言引擎失血 25 与语义槽 15 = 0.25。
- 回归：\`src/game/tests/engine.test.ts\` 199/199 通过（其中 6.4.1b 正是“反击伤害按受击后剩余 HP 缩放”）。

### 3.2 历史假设被夹具修正的地方（不是引擎缺陷）

| 历史假设 | 实测 | 处置 |
|---|---|---|
| 被致盲的单位仍能攻击、只是不反击 | 被致盲的单位攻击不在合法动作集里 | 拆成 \`range/blinded-unit-cannot-attack\` 与 \`range/blind-applied-before-counter-check\` |
| 双方互相击杀会形成平局 | 攻击者先结算，被击杀方不再反击；只有双方都无单位/城堡才 \`winner=-1\` | 改用引擎实际可达的平局构造 |
| 存在合法 capture 即可宣告获胜 | 对手仍有存活单位时占领不终局 | 增加同局面终局/非终局对照夹具 |
| 贴住城堡的单位环或山脉/深水可以封锁部署 | 部署位置是按移动力的可达集合；本引擎没有不可通行地形 | 改用敌对单位占据正交邻格，并区分飞行单位仍可越过 |

## 4. 未覆盖模式（如实记录）

- 32×32 以上棋盘、战役模式事件链、APK 脚本层 \`SyncSetUnitStatus\` 全量回归不在本轮夹具内。
- 4 人以上（>4）人数、联盟重组（\`set_alliance\`）、\`restore_team\`/\`disable_team\` 事件只在部分夹具覆盖。
- 伤害数值只验证了 road 地形下的若干兵种组合；其余地形/等级/状态组合以谓词形式可扩展，但本轮未逐一枚举。

## 5. 复现命令

\`\`\`powershell
node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/rule_suite.test.ts
node v14/tools/emit_rule_artifacts.mjs --run-id ${runId}
\`\`\`

## 6. 验收状态

- 已验证谓词通过率：${results.counts.predicates - results.counts.failedPredicates}/${results.counts.predicates}
- 失败夹具（verified）：${failedVerified.length}
- UNKNOWN 夹具：${unknown.length}
- 结论：${failedVerified.length === 0 ? 'T14-01 验收通过（G1 的规则部分满足）' : 'T14-01 验收未通过，见 rule_suite_results.json'}
`;

writeJson(path.join(t01, 'fixture_manifest.json'), manifest);
fs.writeFileSync(path.join(t01, 'rule_contract.md'), contract);
writeJson(path.join(t01, 'artifact_identity.json'), {
    schema: 'v14_t01_artifact_identity_1',
    task: 'T14-01',
    runId,
    generatedAt: new Date().toISOString(),
    head: git.head,
    artifacts: [
        fileIdentity('v14/out/' + runId + '/T14-01/rule_suite_results.json'),
        fileIdentity('v14/out/' + runId + '/T14-01/fixture_manifest.json'),
        fileIdentity('v14/out/' + runId + '/T14-01/rule_contract.md'),
    ],
    sourceHashes: Object.fromEntries(manifest.sourceIdentity.map((f) => [f.path, f.sha256])),
    resultsFileSha256: realSha256(resultsPath),
});

console.log(`[T14-01] fixture_manifest.json / rule_contract.md / artifact_identity.json -> ${rel(t01)}`);
console.log(`[T14-01] fixtures=${results.counts.fixtures} verified=${results.counts.verifiedFixtures} unknown=${results.counts.unknownFixtures} failed=${results.counts.failedFixtures}`);
console.log(`[T14-01] acceptance=${failedVerified.length === 0 ? 'PASS' : 'FAIL'}`);
if (failedVerified.length > 0) process.exitCode = 1;
