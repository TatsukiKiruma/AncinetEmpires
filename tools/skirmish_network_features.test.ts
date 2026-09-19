/**
 * T10 网格+实体编码特征模块测试（RED 先行）。
 *
 * 契约：
 *   ① 维度固定、值有限，跨地图尺寸可用（空间分箱天然 padding）；
 *   ② 置换不变：单位数组顺序、单位 ID 命名不影响状态编码（禁止 ID/文件名/seed 等泄漏身份）；
 *   ③ metadata/nextUnitId 等来源字段不参与编码；
 *   ④ 视角相对：金币差等特征随行动方视角翻转；
 *   ⑤ 动作编码：类型 one-hot 可区分，move 的推进特征方向正确。
 */
import { describe, expect, it } from 'vitest';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import type { Action, GameState } from '../src/game/types';
import {
    STATE_FEATURE_DIM,
    ACTION_FEATURE_DIM,
    encodeGameState,
    encodeGameAction
} from './skirmish_network_features';

void getApkSkirmishRuleConfig;

function demo(): GameState {
    // demo_map 自带 SD 规则；避免直接依赖 rule_config 的签名差异
    return createDemoState(getApkSkirmishRuleConfig('SD') as never);
}

describe('encodeGameState：结构与不变量', () => {
    it('维度固定、全部有限', () => {
        const v = encodeGameState(demo(), 0);
        expect(v.length).toBe(STATE_FEATURE_DIM);
        for (const x of v) expect(Number.isFinite(x)).toBe(true);
    });

    it('单位数组顺序置换后逐位一致', () => {
        const a = demo();
        const b = demo();
        b.units = [...b.units].reverse();
        const va = encodeGameState(a, 0);
        const vb = encodeGameState(b, 0);
        expect(Array.from(vb)).toEqual(Array.from(va));
    });

    it('单位 ID 重命名不改变编码（无身份泄漏）', () => {
        const a = demo();
        const b = demo();
        const map = new Map<string, string>();
        b.units = b.units.map((u, i) => {
            const nn = `renamed_${i}`;
            map.set(u.id, nn);
            return { ...u, id: nn };
        });
        const va = encodeGameState(a, 0);
        const vb = encodeGameState(b, 0);
        expect(Array.from(vb)).toEqual(Array.from(va));
    });

    it('metadata / nextUnitId / 地图对象引用不参与编码', () => {
        const a = demo();
        const b = structuredClone(a);
        b.nextUnitId = 987654;
        b.metadata = { source: 'apk_aem', apkVersion: '9.9.9' };
        expect(Array.from(encodeGameState(b, 0))).toEqual(Array.from(encodeGameState(a, 0)));
    });

    it('视角翻转：金币差特征随 playerId 交换反号', () => {
        const s = demo();
        s.players[0].gold = 900;
        s.players[1].gold = 100;
        const v0 = encodeGameState(s, 0);
        const v1 = encodeGameState(s, 1);
        const goldDiffIdx = 3; // 约定：全局段第 4 维 = (subject−bestEnemy)/1000
        expect(v0[goldDiffIdx]).toBeGreaterThan(0);
        expect(v1[goldDiffIdx]).toBeLessThan(0);
    });

    it('小地图（非 demo 尺寸）同样可用：分箱自适应', () => {
        const s = structuredClone(demo());
        s.map.width = 5; s.map.height = 4;
        s.map.tiles = s.map.tiles.slice(0, 4).map(row => row.slice(0, 5));
        s.units = s.units.map(u => ({ ...u, pos: { x: Math.min(u.pos.x, 4), y: Math.min(u.pos.y, 3) } }));
        const v = encodeGameState(s, 0);
        expect(v.length).toBe(STATE_FEATURE_DIM);
        for (const x of v) expect(Number.isFinite(x)).toBe(true);
    });
});

describe('encodeGameAction：动作语义', () => {
    it('不同动作类型 one-hot 段可区分', () => {
        const s = demo();
        const capture: Action = { type: 'capture', unitId: s.units[0].id };
        const endTurn: Action = { type: 'end_turn' };
        const vc = encodeGameAction(s, 0, capture);
        const ve = encodeGameAction(s, 0, endTurn);
        expect(vc.length).toBe(ACTION_FEATURE_DIM);
        expect(Array.from(vc)).not.toEqual(Array.from(ve));
    });

    it('move 推进特征：朝最近敌人/目标移动 vs 远离方向相反', () => {
        const s = demo();
        const scout = s.units.find(u => u.id === 'u3')!;
        scout.pos = { x: 1, y: 1 };
        const enemy = s.units.find(u => u.ownerId !== scout.ownerId && u.hp > 0)!;
        const toward: Action = { type: 'move', unitId: scout.id, to: { x: enemy.pos.x + 1 > s.map.width - 1 ? enemy.pos.x : enemy.pos.x + 1, y: enemy.pos.y } };
        const away: Action = { type: 'move', unitId: scout.id, to: { x: 0, y: s.map.height - 1 } };
        const progressIdx = 15 + 4; // 类型 one-hot(15) 段后第 5 个几何特征 = 推进收益
        const vt = encodeGameAction(s, scout.ownerId, toward);
        const va = encodeGameAction(s, scout.ownerId, away);
        expect(vt[progressIdx]).toBeGreaterThanOrEqual(va[progressIdx]);
    });

    it('不同落点的 move 必产生不同向量（策略可区分，不折叠）', () => {
        const s = demo();
        const actor = s.units.find(u => u.id === 'u3')!;
        actor.pos = { x: 3, y: 3 };
        const a1 = encodeGameAction(s, actor.ownerId, { type: 'move', unitId: actor.id, to: { x: 2, y: 3 } });
        const a2 = encodeGameAction(s, actor.ownerId, { type: 'move', unitId: actor.id, to: { x: 3, y: 2 } });
        const a3 = encodeGameAction(s, actor.ownerId, { type: 'move', unitId: actor.id, to: { x: 4, y: 3 } });
        expect(Array.from(a1)).not.toEqual(Array.from(a2));
        expect(Array.from(a1)).not.toEqual(Array.from(a3));
        expect(Array.from(a2)).not.toEqual(Array.from(a3));
    });

    it('同 ID 改名后动作编码一致（查表按引用而非字符串）', () => {
        const s = demo();
        const actor = s.units.find(u => u.id === 'u3')!;
        const action: Action = { type: 'move', unitId: actor.id, to: { x: 0, y: 0 } };
        const s2 = structuredClone(s);
        const actor2 = s2.units.find(u => u.id === 'u3')!;
        const v1 = encodeGameAction(s, actor.ownerId, action);
        actor2.id = 'zzz_renamed';
        const v2 = encodeGameAction(s2, actor2.ownerId, { type: 'move', unitId: 'zzz_renamed', to: { x: 0, y: 0 } });
        expect(Array.from(v2)).toEqual(Array.from(v1));
    });
});
