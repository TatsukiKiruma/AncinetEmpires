import { describe, expect, it } from 'vitest';
import {
    createApkReplayRecord,
    encodeDecryptedApkReplayActions,
    expandApkReplayRecordToProjectActions,
    parseDecryptedApkReplayActions,
    validateApkReplay
} from './apk_replay';
import { createDemoState } from './demo_map';

describe('APK 回放解析与校验', () => {
    it('按 C0601r/C0578b[] 格式解析解密后的动作数组', () => {
        const records = [
            createApkReplayRecord({ eventType: 'NEXT_TURN' }),
            createApkReplayRecord({
                source: { x: 1, y: 2 },
                moveTo: { x: 3, y: 4 },
                target: { x: 5, y: 6 },
                eventType: 'ATTACK'
            })
        ];

        const encoded = encodeDecryptedApkReplayActions(records);
        const parsed = parseDecryptedApkReplayActions(encoded);

        expect(parsed.magic).toBe(365703);
        expect(parsed.remainingBytes).toBe(0);
        expect(parsed.actions).toEqual(records);
    });

    it('把 APK 坐标动作展开为项目动作并执行校验', () => {
        const state = createDemoState();
        const enemy = state.units.find(unit => unit.id === 'u4')!;
        enemy.pos = { x: 2, y: 0 };

        const attackRecord = createApkReplayRecord({
            source: { x: 1, y: 0 },
            moveTo: { x: 1, y: 0 },
            target: { x: 2, y: 0 },
            eventType: 'ATTACK'
        });

        expect(expandApkReplayRecordToProjectActions(attackRecord, state)).toEqual([
            { type: 'attack', attackerId: 'u3', targetId: 'u4' }
        ]);

        const result = validateApkReplay(state, [attackRecord]);
        expect(result.success).toBe(true);
        expect(result.firstError).toBeNull();
        expect(result.expandedActionCount).toBe(1);
        expect(result.steps[0]).toEqual(expect.objectContaining({
            eventType: 'ATTACK',
            actionCode: 'attack:u3:u4',
            error: null
        }));
    });

    it('APK 回放校验不结算 APK 事件门槛不通过的远程攻击', () => {
        const state = createDemoState();
        const soldier = state.units.find(unit => unit.id === 'u3')!;
        const enemy = state.units.find(unit => unit.id === 'u4')!;
        soldier.unitClass = 'soldier';
        soldier.pos = { x: 1, y: 0 };
        enemy.pos = { x: 4, y: 0 };

        const outOfRangeAttackRecord = createApkReplayRecord({
            source: { x: 1, y: 0 },
            moveTo: { x: 1, y: 0 },
            target: { x: 4, y: 0 },
            eventType: 'ATTACK'
        });

        const strictResult = validateApkReplay(state, [outOfRangeAttackRecord]);
        expect(strictResult.success).toBe(true);
        expect(strictResult.firstError).toBeNull();
        expect(strictResult.executedRecordCount).toBe(1);
        expect(strictResult.expandedActionCount).toBe(0);

        const forcedResult = validateApkReplay(state, [outOfRangeAttackRecord], {
            forceExecuteReplayActions: true
        });
        expect(forcedResult.success).toBe(true);
        expect(forcedResult.firstError).toBeNull();
        expect(forcedResult.executedRecordCount).toBe(1);
        expect(forcedResult.expandedActionCount).toBe(0);
    });

    it('APK 回放越界攻击带 postMove 时折叠为直接移动并待机', () => {
        const state = createDemoState();
        const soldier = state.units.find(unit => unit.id === 'u3')!;
        const enemy = state.units.find(unit => unit.id === 'u4')!;
        soldier.unitClass = 'soldier';
        soldier.pos = { x: 1, y: 0 };
        enemy.pos = { x: 5, y: 0 };

        const movedOutOfRangeAttackRecord = createApkReplayRecord({
            source: { x: 1, y: 0 },
            moveTo: { x: 2, y: 0 },
            postMoveTo: { x: 3, y: 0 },
            target: { x: 5, y: 0 },
            eventType: 'ATTACK'
        });

        const result = validateApkReplay(state, [movedOutOfRangeAttackRecord]);
        expect(result.success).toBe(true);
        expect(result.firstError).toBeNull();
        expect(result.expandedActionCount).toBe(2);
        expect(result.steps.map(step => step.actionCode)).toEqual([
            'move:u3:3,0',
            'wait:u3'
        ]);
        expect(result.finalState.units.find(unit => unit.id === soldier.id)).toEqual(expect.objectContaining({
            pos: { x: 3, y: 0 },
            hasActed: true
        }));
        expect(result.finalState.units.find(unit => unit.id === enemy.id)?.hp).toBe(enemy.hp);
    });

    it('APK 强制执行模式对普通单位 ATTACK 空格不生成 standby 副作用', () => {
        const state = createDemoState();
        const soldier = state.units.find(unit => unit.id === 'u3')!;
        soldier.unitClass = 'soldier';
        soldier.pos = { x: 1, y: 0 };
        state.units = state.units.filter(unit => unit.pos.x !== 2 || unit.pos.y !== 0);

        const emptyAttackRecord = createApkReplayRecord({
            source: { x: 1, y: 0 },
            moveTo: { x: 1, y: 0 },
            target: { x: 2, y: 0 },
            eventType: 'ATTACK'
        });

        const strictResult = validateApkReplay(state, [emptyAttackRecord]);
        expect(strictResult.success).toBe(false);
        expect(strictResult.firstError).toContain('找不到攻击目标单位');

        const forcedResult = validateApkReplay(state, [emptyAttackRecord], {
            forceExecuteReplayActions: true
        });
        expect(forcedResult.success).toBe(true);
        expect(forcedResult.executedRecordCount).toBe(1);
        expect(forcedResult.expandedActionCount).toBe(0);
    });

    it('APK 强制执行模式保留前置移动，但跳过移动后仍越界的攻击结算', () => {
        const state = createDemoState();
        const soldier = state.units.find(unit => unit.id === 'u3')!;
        const enemy = state.units.find(unit => unit.id === 'u4')!;
        soldier.unitClass = 'soldier';
        soldier.pos = { x: 1, y: 0 };
        enemy.pos = { x: 5, y: 0 };

        const movedOutOfRangeAttackRecord = createApkReplayRecord({
            source: { x: 1, y: 0 },
            moveTo: { x: 2, y: 0 },
            target: { x: 5, y: 0 },
            eventType: 'ATTACK'
        });

        const forcedResult = validateApkReplay(state, [movedOutOfRangeAttackRecord], {
            forceExecuteReplayActions: true
        });
        expect(forcedResult.success).toBe(true);
        expect(forcedResult.expandedActionCount).toBe(1);
        expect(forcedResult.steps[0]).toEqual(expect.objectContaining({
            actionCode: 'move:u3:2,0',
            error: null
        }));
        expect(forcedResult.finalState.units.find(unit => unit.id === enemy.id)?.hp).toBe(enemy.hp);
    });

    it('APK 强制执行模式按 UI 异常路径跳过来源为空的过期回放记录', () => {
        const state = createDemoState();
        const emptySourceRecord = createApkReplayRecord({
            source: { x: 4, y: 4 },
            moveTo: { x: 4, y: 4 },
            target: { x: 2, y: 0 },
            eventType: 'ATTACK'
        });

        const strictResult = validateApkReplay(state, [emptySourceRecord]);
        expect(strictResult.success).toBe(false);
        expect(strictResult.firstError).toContain('找不到来源单位');

        const forcedResult = validateApkReplay(state, [emptySourceRecord], {
            forceExecuteReplayActions: true
        });
        expect(forcedResult.success).toBe(true);
        expect(forcedResult.executedRecordCount).toBe(1);
        expect(forcedResult.expandedActionCount).toBe(0);
    });

    it('APK 强制执行模式按 UI 异常路径跳过当前金币不足的招募记录', () => {
        const state = createDemoState();
        state.currentPlayer = 0;
        state.players[0].gold = 0;
        state.map.tiles[0][0].terrainId = 10;
        state.map.tiles[0][0].ownerId = 0;
        state.units = state.units.filter(unit => unit.pos.x !== 0 || unit.pos.y !== 0);

        const recruitRecord = createApkReplayRecord({
            source: { x: 0, y: 0 },
            recruitUnitId: 0,
            eventType: 'NONE'
        });

        const strictResult = validateApkReplay(state, [recruitRecord], {
            applyInitialTurnStart: false
        });
        expect(strictResult.success).toBe(false);
        expect(strictResult.firstError).toContain('当前局面没有合法招募动作');

        const forcedResult = validateApkReplay(state, [recruitRecord], {
            forceExecuteReplayActions: true,
            applyInitialTurnStart: false
        });
        expect(forcedResult.success).toBe(true);
        expect(forcedResult.executedRecordCount).toBe(1);
        expect(forcedResult.expandedActionCount).toBe(0);
    });

    it('APK 强制执行模式不结算缺少召唤门槛的 SUMMON 事件', () => {
        const state = createDemoState();
        const soldier = state.units.find(unit => unit.id === 'u3')!;
        soldier.unitClass = 'soldier';
        soldier.pos = { x: 1, y: 0 };
        state.graves = [{ id: 'g1', pos: { x: 2, y: 0 }, remainingTurns: 1 }];

        const summonRecord = createApkReplayRecord({
            source: { x: 1, y: 0 },
            moveTo: { x: 1, y: 0 },
            target: { x: 2, y: 0 },
            eventType: 'SUMMON'
        });

        const strictResult = validateApkReplay(state, [summonRecord]);
        expect(strictResult.success).toBe(false);
        expect(strictResult.firstError).toContain('非法动作');

        const forcedResult = validateApkReplay(state, [summonRecord], {
            forceExecuteReplayActions: true
        });
        expect(forcedResult.success).toBe(true);
        expect(forcedResult.executedRecordCount).toBe(1);
        expect(forcedResult.expandedActionCount).toBe(0);
    });

    it('APK 强制执行模式不结算缺少支援门槛的 SUPPORT 事件', () => {
        const state = createDemoState();
        const soldier = state.units.find(unit => unit.id === 'u3')!;
        soldier.unitClass = 'soldier';
        soldier.pos = { x: 1, y: 0 };

        const supportRecord = createApkReplayRecord({
            source: { x: 1, y: 0 },
            moveTo: { x: 1, y: 0 },
            target: { x: 2, y: 0 },
            eventType: 'SUPPORT'
        });

        const strictResult = validateApkReplay(state, [supportRecord]);
        expect(strictResult.success).toBe(false);
        expect(strictResult.firstError).toContain('找不到支援目标单位');

        const forcedResult = validateApkReplay(state, [supportRecord], {
            forceExecuteReplayActions: true
        });
        expect(forcedResult.success).toBe(true);
        expect(forcedResult.executedRecordCount).toBe(1);
        expect(forcedResult.expandedActionCount).toBe(0);
    });

    it('移动后自我治疗时用移动后坐标解析为 actor 自身', () => {
        const state = createDemoState();
        const paladin = state.units.find(unit => unit.id === 'u1')!;
        paladin.unitClass = 'paladin';
        paladin.pos = { x: 0, y: 0 };
        paladin.hp = 60;

        const healRecord = createApkReplayRecord({
            source: { x: 0, y: 0 },
            moveTo: { x: 1, y: 0 },
            target: { x: 1, y: 0 },
            eventType: 'HEAL'
        });

        expect(expandApkReplayRecordToProjectActions(healRecord, state)).toEqual([
            { type: 'move', unitId: paladin.id, to: { x: 1, y: 0 } },
            { type: 'heal', healerId: paladin.id, targetId: paladin.id }
        ]);
    });

    it('pending 单位移动后治疗原格时解析到下层单位', () => {
        const state = createDemoState();
        state.currentPlayer = 0;
        state.pendingUnitId = 'pending_paladin';
        state.units = [
            {
                id: 'commander',
                ownerId: 0,
                unitClass: 'commander',
                pos: { x: 1, y: 1 },
                hp: 65,
                maxHp: 100,
                hasMoved: false,
                hasActed: false,
                level: 0,
                exp: 0
            },
            {
                id: 'pending_paladin',
                ownerId: 0,
                unitClass: 'paladin',
                pos: { x: 1, y: 1 },
                hp: 100,
                maxHp: 100,
                hasMoved: false,
                hasActed: false,
                level: 0,
                exp: 0,
                apkPendingRecruitSource: 'commander_castle'
            }
        ];

        const healRecord = createApkReplayRecord({
            source: { x: 1, y: 1 },
            moveTo: { x: 1, y: 2 },
            target: { x: 1, y: 1 },
            eventType: 'HEAL'
        });

        expect(expandApkReplayRecordToProjectActions(healRecord, state)).toEqual([
            { type: 'move', unitId: 'pending_paladin', to: { x: 1, y: 2 } },
            { type: 'heal', healerId: 'pending_paladin', targetId: 'commander' }
        ]);
    });

    it('ATTACK 指向空可破坏地形时展开为远程破坏城镇', () => {
        const state = createDemoState();
        const catapult = state.units.find(unit => unit.id === 'u3')!;
        catapult.unitClass = 'catapult';
        catapult.pos = { x: 1, y: 0 };
        state.map.tiles[0][4] = {
            terrainId: 9,
            ownerId: 1,
            apkTerrainId: 36,
            apkTerrainRaw: (36 << 12) | 1,
            apkOwnerCode: 1
        };
        state.units = state.units.filter(unit => unit.pos.x !== 4 || unit.pos.y !== 0);

        const attackTileRecord = createApkReplayRecord({
            source: { x: 1, y: 0 },
            moveTo: { x: 1, y: 0 },
            target: { x: 4, y: 0 },
            eventType: 'ATTACK'
        });

        expect(expandApkReplayRecordToProjectActions(attackTileRecord, state)).toEqual([
            { type: 'destroy_town', unitId: catapult.id, target: { x: 4, y: 0 } }
        ]);

        const result = validateApkReplay(state, [attackTileRecord]);
        expect(result.success).toBe(true);
        expect(result.steps[0]).toEqual(expect.objectContaining({
            actionCode: `destroy_town:${catapult.id}:4,0`,
            error: null
        }));
    });

    it('OCCUPY 对非己方同盟建筑仍展开为占领', () => {
        const state = createDemoState({
            alliances: { 0: 2, 1: 2 }
        });
        const unit = state.units.find(candidate => candidate.id === 'u3')!;
        unit.pos = { x: 3, y: 3 };
        state.map.tiles[3][3] = { terrainId: 9, ownerId: 1 };

        const occupyRecord = createApkReplayRecord({
            source: { x: 3, y: 3 },
            moveTo: { x: 3, y: 3 },
            eventType: 'OCCUPY'
        });

        expect(expandApkReplayRecordToProjectActions(occupyRecord, state)).toEqual([
            { type: 'capture', unitId: unit.id }
        ]);
    });

    it('非法或缺失坐标会在校验报告中返回首个错误', () => {
        const state = createDemoState();
        const invalidRecord = createApkReplayRecord({
            source: { x: 6, y: 6 },
            eventType: 'STANDBY'
        });

        const result = validateApkReplay(state, [invalidRecord]);

        expect(result.success).toBe(false);
        expect(result.firstError).toContain('找不到来源单位');
        expect(result.steps[0].error).toContain('找不到来源单位');
    });

    it('非法移动诊断包含目标格 APK 地形信息', () => {
        const state = createDemoState();
        state.map.tiles[0][7] = {
            terrainId: 3,
            ownerId: null,
            apkTerrainId: 17,
            apkTerrainRaw: (17 << 12) | 0xff,
            apkOwnerCode: 0xff,
            apkTerrainKind: 1,
            apkTerrainIsLand: true,
            apkMoveCost: 3
        };

        const unreachableMoveRecord = createApkReplayRecord({
            source: { x: 1, y: 0 },
            moveTo: { x: 7, y: 0 },
            eventType: 'STANDBY'
        });

        const result = validateApkReplay(state, [unreachableMoveRecord]);

        expect(result.success).toBe(false);
        expect(result.steps[0].diagnostic?.moveDestinationTile).toEqual(expect.objectContaining({
            terrainId: 3,
            apkTerrainId: 17,
            apkTerrainKind: 1,
            apkTerrainIsLand: true,
            apkMoveCost: 3
        }));
    });
});
