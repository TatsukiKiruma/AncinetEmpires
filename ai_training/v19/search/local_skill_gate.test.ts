import { describe, expect, it } from 'vitest';
import { evaluateLocalSkillGate, type LocalSkillEnvelope } from './local_skill_gate';

function record(options: {
    id: string;
    group: 'dev' | 'sealed';
    root: string;
    map: number;
    ownHpGain?: number;
    ownUnitsDelta?: number;
    selectedTurn?: number;
}): LocalSkillEnvelope {
    const ownHpGain = options.ownHpGain ?? 10;
    const ownUnitsDelta = options.ownUnitsDelta ?? 0;
    const selectedTurn = options.selectedTurn ?? 5;
    const boundary = (selected: boolean) => ({
        stateJson: '{}',
        steps: 10,
        terminal: false,
        tactical: {
            ownCommanderHp: selected ? 50 + ownHpGain : 50,
            enemyCommanderHp: selected ? 40 : 40,
            ownUnitCount: selected ? 5 + ownUnitsDelta : 5,
            enemyUnitCount: selected ? 4 : 4,
            ownGold: selected ? 20 : 20,
            enemyGold: selected ? 15 : 15,
            turn: selected ? selectedTurn : 5,
        },
    });
    return {
        status: 'success',
        entry: {
            windowId: options.id,
            familyId: options.id,
            mapIndex: options.map,
            rootStateHash: options.root,
            group: options.group,
        },
        result: {
            selected: { ownActions: ['a'] },
            baseline: { error: null },
            branches: [],
            validation: {
                budgetFair: true,
                baseline: { outcomeKind: 'NATURAL_LOSS', error: null, firstOwnBoundary: boundary(false) },
                selected: { outcomeKind: 'NATURAL_WIN', error: null, firstOwnBoundary: boundary(true) },
            },
        },
    };
}

describe('独立局部技能门槛', () => {
    it('生命增加但丢兵时不算严格局部改进', () => {
        const item = record({ id: 'd1', group: 'dev', root: 'root-d1', map: 0, ownHpGain: 20, ownUnitsDelta: -1 });
        const report = evaluateLocalSkillGate([item], []);
        expect(report.windows[0].qualifies).toBe(false);
        expect(report.windows[0].failureReasons).toContain('己方单位数减少');
        expect(report.devDistillationIds).toEqual([]);
    });

    it('两臂首个边界回合不同则排除', () => {
        const item = record({ id: 'd1', group: 'dev', root: 'root-d1', map: 0, selectedTurn: 6 });
        const report = evaluateLocalSkillGate([item], []);
        expect(report.windows[0].qualifies).toBe(false);
        expect(report.windows[0].failureReasons).toContain('两臂首个边界回合不同');
    });

    it('指挥官HP为null时按0参与精确比较', () => {
        const item = record({ id: 'd1', group: 'dev', root: 'root-d1', map: 0 });
        const validation = item.result!.validation!;
        validation.baseline!.firstOwnBoundary!.tactical.ownCommanderHp = null;
        validation.selected!.firstOwnBoundary!.tactical.ownCommanderHp = 10;
        const report = evaluateLocalSkillGate([item], []);
        expect(report.windows[0].commanderHpGain).toBe(10);
        expect(report.windows[0].qualifies).toBe(true);
    });

    it('开发与封存根重合时排除封存证据并阻断门槛', () => {
        const dev = record({ id: 'd1', group: 'dev', root: 'shared-root', map: 0 });
        const sealed = record({ id: 's1', group: 'sealed', root: 'shared-root', map: 1 });
        const report = evaluateLocalSkillGate([dev], [sealed]);
        expect(report.rootIsolation.overlapRoots).toEqual(['shared-root']);
        expect(report.checks.sealedRootsDisjointFromDev).toBe(false);
        expect(report.sealedValidationIds).toEqual([]);
        expect(report.windows.find((item) => item.windowId === 's1')?.failureReasons)
            .toContain('封存根状态与开发组重合');
    });

    it('数组组别与entry.group不一致时作为输入错误拒绝', () => {
        const item = record({ id: 'wrong-group', group: 'sealed', root: 'root-1', map: 0 });
        const report = evaluateLocalSkillGate([item], []);
        expect(report.denominators.totalErrors).toBe(1);
        expect(report.windows[0].failureReasons).toContain('记录组别不是dev');
        expect(report.windows[0].qualifies).toBe(false);
    });

    it('budgetFair缺失或不是true时作为输入错误拒绝', () => {
        const item = record({ id: 'missing-budget-fair', group: 'dev', root: 'root-1', map: 0 });
        delete item.result!.validation!.budgetFair;
        const report = evaluateLocalSkillGate([item], []);
        expect(report.denominators.totalErrors).toBe(1);
        expect(report.windows[0].failureReasons).toContain('验证预算公平字段不是true');
        expect(report.windows[0].qualifies).toBe(false);
    });

    it('满足保守条件和家族覆盖时通过，并严格分离开发与封存ID', () => {
        const dev = Array.from({ length: 4 }, (_, index) => record({
            id: `d${index}`, group: 'dev', root: `dev-root-${index}`, map: index % 2,
        }));
        const sealed = Array.from({ length: 2 }, (_, index) => record({
            id: `s${index}`, group: 'sealed', root: `sealed-root-${index}`, map: index % 2,
        }));
        const report = evaluateLocalSkillGate(dev, sealed);
        expect(report.passed).toBe(true);
        expect(report.denominators.dev.qualifyingDistinctRoots).toBe(4);
        expect(report.denominators.sealed.qualifyingDistinctRoots).toBe(2);
        expect(report.devDistillationIds).toEqual(['d0', 'd1', 'd2', 'd3']);
        expect(report.sealedValidationIds).toEqual(['s0', 's1']);
    });
});

