/**
 * 窗口覆盖度核对：统计 40 个冻结窗口里各类战术动作的分布。
 *
 * 目的：核对清单是否满足合同要求的覆盖（优先攻击次序/指挥官安全，同时保留占城、
 * 出兵与普通状态）。本工具**只读清单**，不改变任何窗口，也不依赖搜索结果。
 *
 * 用法：node --openssl-legacy-provider v12/tools/run-tool.mjs v19/search/window_coverage.ts
 */

import fs from 'node:fs';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import type { GameState } from '../../src/game/types';

const MANIFEST_PATH = 'v19/out/s0s1_20260930/search/window_manifest.json';
const OUT_PATH = 'v19/out/s0s1_20260930/search/window_coverage.json';

interface Entry {
    windowId: string;
    familyId: string;
    mapIndex: number;
    mapName: string;
    seed: number;
    ownSeat: number;
    group: 'dev' | 'sealed';
    engineStepIndex: number;
    phaseTurn: number;
    rootStateJson: string;
}

function actionType(action: unknown): string {
    return String((action as { type?: string }).type ?? '');
}

function main(): void {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const rows: Array<Record<string, unknown>> = [];
    for (const entry of manifest.entries as Entry[]) {
        const state = JSON.parse(entry.rootStateJson) as GameState;
        const engine = new GameEngine(state);
        const legal = engine.getLegalActions(state.currentPlayer).filter((a) => actionType(a) !== 'surrender');
        const byType: Record<string, number> = {};
        for (const action of legal) {
            const type = actionType(action);
            byType[type] = (byType[type] ?? 0) + 1;
        }
        const attackTargets = new Map<string, number>();
        for (const action of legal) {
            if (actionType(action) !== 'attack') continue;
            const code = encodeAction(action);
            const target = code.split(':')[2] ?? '';
            attackTargets.set(target, (attackTargets.get(target) ?? 0) + 1);
        }
        const multiAttackerTargets = [...attackTargets.values()].filter((count) => count >= 2).length;
        rows.push({
            windowId: entry.windowId,
            mapIndex: entry.mapIndex,
            mapName: entry.mapName,
            group: entry.group,
            phaseTurn: entry.phaseTurn,
            legalTotal: legal.length,
            byType,
            attackCount: byType.attack ?? 0,
            /** 同一目标可被 ≥2 个单位攻击 = 存在攻击次序选择。 */
            multiAttackerTargets,
            hasAttackOrderChoice: multiAttackerTargets >= 1,
            hasCapture: (byType.capture ?? 0) > 0,
            hasRecruit: (byType.recruit_to_castle ?? 0) > 0 || (byType.recruit_and_deploy ?? 0) > 0,
        });
    }

    const orderWindows = rows.filter((r) => r.hasAttackOrderChoice === true);
    const byMap = new Map<number, { total: number; order: number }>();
    for (const row of rows) {
        const key = row.mapIndex as number;
        const current = byMap.get(key) ?? { total: 0, order: 0 };
        current.total += 1;
        if (row.hasAttackOrderChoice === true) current.order += 1;
        byMap.set(key, current);
    }
    const summary = {
        schema: 'v19_s1_window_coverage_1',
        generatedAt: new Date().toISOString(),
        note:
            '窗口覆盖度核对：只读清单，不改变窗口。hasAttackOrderChoice 表示同一目标可被 ≥2 个单位攻击，' +
            '即存在本次审核暴露的「攻击次序」选择；这是清单属性，与搜索结果无关。',
        total: rows.length,
        attackOrderWindows: orderWindows.length,
        captureWindows: rows.filter((r) => r.hasCapture === true).length,
        recruitWindows: rows.filter((r) => r.hasRecruit === true).length,
        noAttackWindows: rows.filter((r) => (r.attackCount as number) === 0).length,
        perMap: Object.fromEntries([...byMap.entries()].map(([k, v]) => [String(k), v])),
        rows,
    };
    fs.writeFileSync(OUT_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(
        `[覆盖] 窗口 ${summary.total}；存在攻击次序选择 ${summary.attackOrderWindows}；` +
            `有占城 ${summary.captureWindows}；有招募 ${summary.recruitWindows}；无攻击 ${summary.noAttackWindows}`,
    );
    console.log(`[覆盖] 逐图（总数/有次序）：${JSON.stringify(summary.perMap)}`);
    console.log(`[覆盖] 已写出 ${OUT_PATH}`);
}

main();
