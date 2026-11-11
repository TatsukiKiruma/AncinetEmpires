/** 冻结开发与封存测试面板；测试仅保存身份，第一阶段不读取推理结果。 */
import fs from 'node:fs';
import path from 'node:path';
import { HERE, read, save, fileSha, sha, initialState, encode, decisions, tally } from './io';

const manifest = read(path.join(HERE, 'PARTITIONS.json')), parents = manifest.parents;
if (fs.existsSync(path.join(HERE, 'OFFLINE_PANEL.json'))) throw Error('面板已冻结');
const order = (a: any, b: any) => sha('panel-v1/' + a.parentId).localeCompare(sha('panel-v1/' + b.parentId));
const selected: any[] = [];
for (const corpus of ['old', 'new']) for (const split of ['train', 'dev']) {
    const groups = new Map<string, any[]>();
    for (const p of parents.filter((p: any) => p.corpus === corpus && p.split === split && p.admitted)) {
        const key = corpus === 'old' ? p.map : `${p.category}/${p.players}/${p.source}`;
        const rows = groups.get(key) ?? []; rows.push(p); groups.set(key, rows);
    }
    for (const [, rows] of groups) {
        for (const p of rows.sort(order).slice(0, corpus === 'old' ? 16 : 3)) {
            const macros = corpus === 'old' ? [0, Math.floor(p.actions / 2), p.actions - 1] : [...new Set([0, 1, 2].flatMap(phase => { const positions = p.positions.filter((r: any) => r[2] === phase); return positions.length ? [positions[Math.floor(positions.length / 2)][0]] : []; }))];
            for (const macro of macros) selected.push({ parentId: p.parentId, macro, sub: 0, choice: 0, split, corpus, players: p.players, category: p.category, source: p.source, map: p.map });
        }
    }
}
save(path.join(HERE, 'OFFLINE_PANEL.json'), { schema: 'frozen-independent-prestate-panel-v1', partitionsSha256: fileSha(path.join(HERE, 'PARTITIONS.json')), seed: 20261030, requests: selected, counts: tally(selected, r => `${r.corpus}/${r.split}/${r.players}/${r.category}/${r.source}`), finalTestEvaluated: false, scope: '每父局最多三个独立宏首态；按父局汇总与分层，不能称未知地图泛化' });
for (const split of ['dev', 'test']) {
    const maps = ['(2) Crossed swords.aem', '(2) Duel.aem', '(2) Icy Paths.aem', '(2) Liberty Port.aem', '(2) Mourningstar.aem', '(2) Peak Island.aem', '(2) Swamplands.aem', '(2) The Crossing.aem'];
    const pool = parents.filter((p: any) => p.corpus === 'new' && p.split === split && p.players === 2 && p.admitted).sort(order);
    const slots: any[] = [], used = new Set<string>();
    for (let i = 0; i < 10; i++) {
        const p = pool.find((p: any) => !used.has(p.groupId) && (i >= 8 || p.map === maps[i]));
        if (!p) throw Error(`无法冻结八图开发覆盖：${split}/${i}`); used.add(p.groupId);
        const initial = initialState(p), name = `${split}-initial/slot-${i}.json`; save(path.join(HERE, name), initial);
        slots.push({ slot: i, parentId: p.parentId, groupId: p.groupId, category: p.category, map: p.map, file: name, sha256: fileSha(path.join(HERE, name)), seed: (split === 'dev' ? 2026103000 : 2026103100) + i * 101 });
    }
    save(path.join(HERE, split === 'dev' ? 'ARENA_PANEL.json' : 'SEALED_FINAL_PANEL.json'), { schema: 'continuation-paired40-v1', split, slots, matches: ['hard', 'simple'].flatMap(opponent => slots.flatMap(s => [0, 1].map(seat => ({ id: `${opponent}-${s.slot}-s${seat}`, opponent, slot: s.slot, seat, seed: s.seed })))), gamesPerOpponent: 20, total: 40, modelPolicy: '完整2414/候选模型logits+现有softPriors稳定argmax，无搜索，单GPU单请求FP32', applyInitialTurnStart: false, engineOptions: { applyInitialTurnStart: false }, maxActions: 10000, maxRounds: 200, maxWallMs: 1800000, maxDecisionMs: 120000, opponents: { hard: 'OriginalApkLikeHardAI，项目已验证APK困难脚本复刻；记录Java移植回退', simple: 'HeuristicAI，项目简单启发式基线' }, finalTest: split === 'test', uncertainty: '40局为开发筛选；地图均为旧双人图，不证明多人或未知地图泛化' });
}
save(path.join(HERE, 'STAGE2_CONFIG.json'), { schema: 'continuation-stage2-candidate-v1', stage: 2, requiresCoordinatorApproval: true, checkpointSha256: manifest.checkpointSha256, partitionsSha256: fileSha(path.join(HERE, 'PARTITIONS.json')), offlinePanelSha256: fileSha(path.join(HERE, 'OFFLINE_PANEL.json')), arenaPanelSha256: fileSha(path.join(HERE, 'ARENA_PANEL.json')), seed: 20261030, peakLearningRate: 1e-4, learningRateArms: [5e-5, 1e-4, .00024495], sampleBudget: 80000, effectiveBatch: 8, microbatch: 1, warmupUpdates: 200, endLearningRateRatio: .1, newRatio: .6, duelRatio: .75, sampleWeight: 1, policyWeight: 1, valueWeight: 1, gradientClip: 1, weightDecay: 1e-4, optimizer: '完整继承AdamW，独立阶段日程', diagnosticEveryUpdates: 2500, checkpointEveryUpdates: 100, stop: { nonfinite: true, invalidLabel: true, devNllRelativeDeteriorationTwoChecks: .05, oldDevBrierIncreaseTwoChecks: .02, perArmWallSeconds: 14400, lowFreeDiskBytes: 10737418240 }, comparisons: ['旧/新开发NLL与top1，按父局等权', '价值CE/Brier与校准，按人数和场景', '困难20+简单20同面板换边，逐局配对变化', '旧能力遗忘与新场景适应分别报告'], finalTestForbidden: true, extraSeeds: { maxFinalists: 2, allowedOnlyIfClose: true, sampleBudgetPerArm: 80000 }, scope: '本文件仅供第二阶段审核配置；第一阶段不启动正式试训' });
console.log(JSON.stringify({ offlineSamples: selected.length, arenaGames: 40, testSealed: true }));
