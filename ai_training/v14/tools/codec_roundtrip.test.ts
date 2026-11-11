/**
 * V14/T14-02：动作编解码回环与严格格式校验。
 *
 * 覆盖 Action 联合的全部 14 个类型：
 * 1. 对每个类型构造真实动作，检查 encode(decode(code)) === code；
 * 2. 检查解码出的字段语义（heal 的 healerId、support 的 supporterId、
 *    capture 的 unitId、招募的兵种与城堡坐标、召唤的墓碑与落点等）；
 * 3. 反例：字段缺失、坐标非整数、兵种名非法、多余字段、空串必须返回 null，
 *    不能静默产出 NaN 坐标。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/codec_roundtrip.test.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { decodeAction, encodeAction, ACTION_SPACE_SCHEMA } from '../../src/game/env';
import type { Action, UnitClass } from '../../src/game/types';

const RUN_ID = process.env.V14_RUN_ID ?? 'v14_20260924_t14';
const OUT_DIR = path.resolve('v14', 'out', RUN_ID, 'T14-02');

interface CaseResult {
    id: string;
    code: string;
    decoded: Action | null;
    reencoded: string | null;
    pass: boolean;
    check: string;
}

const results: CaseResult[] = [];
function check(id: string, code: string, predicate: (action: Action | null) => boolean, description: string): void {
    const decoded = decodeAction(code);
    const reencoded = decoded ? encodeAction(decoded) : null;
    results.push({
        id,
        code,
        decoded,
        reencoded,
        pass: predicate(decoded) && reencoded === code,
        check: description,
    });
}

function reject(id: string, code: string, description: string): void {
    const decoded = decodeAction(code);
    results.push({
        id,
        code,
        decoded,
        reencoded: decoded ? encodeAction(decoded) : null,
        pass: decoded === null,
        check: description,
    });
}

const unitClasses: UnitClass[] = [
    'soldier', 'ghost', 'mermaid', 'archer', 'slime', 'water_elemental', 'dark_mage', 'witch',
    'paladin', 'elf', 'berserker', 'wolf', 'golem', 'ice_elemental', 'druid', 'catapult',
    'wolf_archer', 'dragon', 'commander', 'skeleton', 'crystal',
];

// ---- 正例：全部 14 个动作类型 ----
check('move', 'move:u_1:3,7', (a) => a?.type === 'move' && a.unitId === 'u_1'
    && a.to.x === 3 && a.to.y === 7, 'move 的 unitId 与落点');
check('post_attack_move', 'post_attack_move:u_2:0,0', (a) => a?.type === 'post_attack_move'
    && a.unitId === 'u_2' && a.to.x === 0 && a.to.y === 0, 'post_attack_move 与 move 是不同动作类型');
check('attack', 'attack:u_1:u_9', (a) => a?.type === 'attack'
    && a.attackerId === 'u_1' && a.targetId === 'u_9', 'attack 的 attackerId/targetId');
check('heal', 'heal:h_1:t_2', (a) => a?.type === 'heal' && a.healerId === 'h_1'
    && a.targetId === 't_2', 'heal 使用 healerId（不是 unitId）');
check('support', 'support:s_1:t_2', (a) => a?.type === 'support' && a.supporterId === 's_1'
    && a.targetId === 't_2', 'support 使用 supporterId（不是 unitId）');
check('summon', 'summon:w_1:g_3:4,5', (a) => a?.type === 'summon' && a.summonerId === 'w_1'
    && a.graveId === 'g_3' && a.spawnPos.x === 4 && a.spawnPos.y === 5, 'summon 的墓碑与落点');
check('capture', 'capture:u_4', (a) => a?.type === 'capture' && a.unitId === 'u_4',
    'capture 只带 unitId（占领目标是单位所在格）');
check('repair', 'repair:u_5', (a) => a?.type === 'repair' && a.unitId === 'u_5', 'repair 只带 unitId');
check('destroy_town-with-target', 'destroy_town:u_6:2,3', (a) => a?.type === 'destroy_town'
    && a.unitId === 'u_6' && a.target?.x === 2 && a.target?.y === 3, 'destroy_town 显式目标');
check('destroy_town-default', 'destroy_town:u_6', (a) => a?.type === 'destroy_town'
    && a.unitId === 'u_6' && a.target === undefined, 'destroy_town 缺省目标（引擎语义为行动者所在格）');
check('wait', 'wait:u_7', (a) => a?.type === 'wait' && a.unitId === 'u_7', 'wait');
check('surrender', 'surrender', (a) => a?.type === 'surrender', 'surrender 无参数');
check('end_turn', 'end_turn', (a) => a?.type === 'end_turn', 'end_turn 无参数');

for (const cls of unitClasses) {
    check(`recruit_to_castle/${cls}`, `recruit_to_castle:${cls}:1,2`, (a) => a?.type === 'recruit_to_castle'
        && a.unitClass === cls && a.castlePos.x === 1 && a.castlePos.y === 2, `招募兵种 ${cls}`);
    check(`recruit_and_deploy/${cls}`, `recruit_and_deploy:${cls}:1,2:3,4`, (a) => a?.type === 'recruit_and_deploy'
        && a.unitClass === cls && a.castlePos.x === 1 && a.castlePos.y === 2
        && a.to.x === 3 && a.to.y === 4, `招募并部署 ${cls}`);
}

// ---- 反例：必须返回 null ----
reject('reject/empty', '', '空串');
reject('reject/unknown-type', 'fly:u_1:1,2', '未知动作类型');
reject('reject/move-missing-coord', 'move:u_1', 'move 缺坐标');
reject('reject/move-unparsable-coord', 'move:u_1:abc', 'move 坐标非数字');
reject('reject/move-non-integer', 'move:u_1:1.5,2', 'move 坐标非整数');
reject('reject/move-negative', 'move:u_1:-1,2', 'move 坐标为负');
reject('reject/move-extra-field', 'move:u_1:1,2:3', 'move 多余字段');
reject('reject/move-no-unit', 'move::1,2', 'move 缺单位 ID');
reject('reject/attack-missing-target', 'attack:u_1', 'attack 缺目标');
reject('reject/heal-wrong-arity', 'heal:h_1:t_2:x', 'heal 多余字段');
reject('reject/summon-missing-spawn', 'summon:w_1:g_1', 'summon 缺落点');
reject('reject/recruit-unknown-class', 'recruit_to_castle:unicorn:1,2', '招募兵种非法');
reject('reject/recruit-missing-castle', 'recruit_to_castle:soldier', '招募缺城堡坐标');
reject('reject/deploy-missing-to', 'recruit_and_deploy:soldier:1,2', '部署缺落点');
reject('reject/capture-missing-unit', 'capture:', 'capture 缺单位 ID');
reject('reject/end-turn-extra', 'end_turn:1', 'end_turn 多余字段');
reject('reject/surrender-extra', 'surrender:u_1', 'surrender 多余字段');
reject('reject/wait-missing-unit', 'wait:', 'wait 缺单位 ID');
reject('reject/destroy-town-empty-unit', 'destroy_town::1,2', 'destroy_town 缺单位 ID');

// ---- 引擎合法动作集全体回环 ----
const schemaCoverage = {
    declaredTemplates: [...ACTION_SPACE_SCHEMA],
    coveredTypes: [...new Set(results.filter((r) => r.pass).map((r) => r.code.split(':')[0]))].sort(),
};

const failed = results.filter((r) => !r.pass);
const report = {
    schema: 'v14_codec_roundtrip_1',
    task: 'T14-02',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    scope: 'Action 联合全部 14 个类型的编码-解码回环、字段语义与非法输入拒绝',
    cases: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    negatives: results.filter((r) => r.id.startsWith('reject/')).length,
    negativesPassed: results.filter((r) => r.id.startsWith('reject/') && r.pass).length,
    actionTypeCoverage: schemaCoverage,
    results,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'codec_roundtrip.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`[T14-02] codec cases=${report.cases} passed=${report.passed} failed=${report.failed} negatives=${report.negativesPassed}/${report.negatives}`);
for (const r of failed) console.log(`  FAIL ${r.id} code=${JSON.stringify(r.code)} check=${r.check}`);
if (failed.length > 0) process.exitCode = 1;
else console.log(`[T14-02] codec_roundtrip PASSED (${report.actionTypeCoverage.coveredTypes.length} action types covered)`);
