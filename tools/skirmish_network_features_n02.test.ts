import { describe, expect, it } from 'vitest';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import type { Action, GameState, Unit } from '../src/game/types';
import { encodeGameAction } from './skirmish_network_features';

function demo(): GameState {
    return createDemoState(getApkSkirmishRuleConfig('SD') as never);
}

describe('N02 动作编码碰撞曝光测试（F01 反例）', () => {
    it('碰撞反例1：两城堡同兵种招募必产生不同向量', () => {
        const s = demo();
        const r1: Action = { type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 0, y: 0 } };
        const r2: Action = { type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 5, y: 5 } };
        const v1 = encodeGameAction(s, 0, r1);
        const v2 = encodeGameAction(s, 0, r2);
        expect(Array.from(v1)).not.toEqual(Array.from(v2));
    });

    it('碰撞反例2：同城堡不同部署格招募必产生不同向量', () => {
        const s = demo();
        const d1: Action = { type: 'recruit_and_deploy', unitClass: 'soldier', castlePos: { x: 0, y: 0 }, to: { x: 0, y: 1 } };
        const d2: Action = { type: 'recruit_and_deploy', unitClass: 'soldier', castlePos: { x: 0, y: 0 }, to: { x: 1, y: 0 } };
        const v1 = encodeGameAction(s, 0, d1);
        const v2 = encodeGameAction(s, 0, d2);
        expect(Array.from(v1)).not.toEqual(Array.from(v2));
    });

    it('碰撞反例3：destroy_town 作用于不同目标城镇必产生不同向量', () => {
        const s = demo();
        const actor = s.units[0];
        const dt1: Action = { type: 'destroy_town', unitId: actor.id, target: { x: 1, y: 1 } };
        const dt2: Action = { type: 'destroy_town', unitId: actor.id, target: { x: 2, y: 2 } };
        const v1 = encodeGameAction(s, actor.ownerId, dt1);
        const v2 = encodeGameAction(s, actor.ownerId, dt2);
        expect(Array.from(v1)).not.toEqual(Array.from(v2));
    });

    it('碰撞反例4：相同属性但不同位置的敌方目标攻击必产生不同向量', () => {
        const s = demo();
        const attacker = s.units.find(u => u.ownerId === 0)!;
        // 构造两个相同属性、不同位置的敌方单位
        const enemy1: Unit = {
            id: 'mock_enemy_1',
            unitClass: 'soldier',
            ownerId: 1,
            pos: { x: 2, y: 2 },
            hp: 100,
            maxHp: 100,
            hasMoved: false,
            hasActed: false
        };
        const enemy2: Unit = {
            id: 'mock_enemy_2',
            unitClass: 'soldier',
            ownerId: 1,
            pos: { x: 5, y: 5 },
            hp: 100,
            maxHp: 100,
            hasMoved: false,
            hasActed: false
        };
        s.units.push(enemy1, enemy2);
        const a1: Action = { type: 'attack', attackerId: attacker.id, targetId: 'mock_enemy_1' };
        const a2: Action = { type: 'attack', attackerId: attacker.id, targetId: 'mock_enemy_2' };
        const v1 = encodeGameAction(s, attacker.ownerId, a1);
        const v2 = encodeGameAction(s, attacker.ownerId, a2);
        expect(Array.from(v1)).not.toEqual(Array.from(v2));
    });

    it('碰撞反例5：相同属性单位从不同起点移动到同一落点必产生不同向量', () => {
        const s = demo();
        const u1: Unit = {
            id: 'mock_u1',
            unitClass: 'archer',
            ownerId: 0,
            pos: { x: 1, y: 1 },
            hp: 100,
            maxHp: 100,
            hasMoved: false,
            hasActed: false
        };
        const u2: Unit = {
            id: 'mock_u2',
            unitClass: 'archer',
            ownerId: 0,
            pos: { x: 3, y: 3 },
            hp: 100,
            maxHp: 100,
            hasMoved: false,
            hasActed: false
        };
        s.units.push(u1, u2);
        const m1: Action = { type: 'move', unitId: 'mock_u1', to: { x: 2, y: 2 } };
        const m2: Action = { type: 'move', unitId: 'mock_u2', to: { x: 2, y: 2 } };
        const v1 = encodeGameAction(s, 0, m1);
        const v2 = encodeGameAction(s, 0, m2);
        expect(Array.from(v1)).not.toEqual(Array.from(v2));
    });
});
