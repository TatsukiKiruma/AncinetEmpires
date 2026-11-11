import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { bootstrapConfidenceInterval, runPairedArena, evaluateTacticalSuite } from './evaluate';
import { Policy } from './match_runner';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('T02: 固定赛场、开局和战术题', () => {

    it('1. 赛场划分配置文件结构与隔离规则验证', () => {
        const splitFile = path.resolve(__dirname, '../configs/scenario_split.json');
        expect(fs.existsSync(splitFile)).toBe(true);
        const split = JSON.parse(fs.readFileSync(splitFile, 'utf-8'));

        expect(split.splits.train.length).toBe(3);
        expect(split.splits.dev.length).toBe(2);
        expect(split.splits.test.length).toBe(2);
        expect(split.splits.quarantine.length).toBe(1);

        // 验证封存地图与隔离地图
        expect(split.splits.quarantine[0].name).toBe('(2) Mourningstar.aem');
        expect(split.splits.quarantine[0].approximateTileCount).toBe(2);
    });

    it('2. 战术题套件数量 >= 40 且验收题与诊断题明确区分', () => {
        const suiteFile = path.resolve(__dirname, '../eval/tactical_suite.json');
        expect(fs.existsSync(suiteFile)).toBe(true);
        const suite = JSON.parse(fs.readFileSync(suiteFile, 'utf-8'));

        expect(suite.length).toBeGreaterThanOrEqual(40);
        const acceptance = suite.filter((c: any) => !c.isDiagnostic);
        const diagnostic = suite.filter((c: any) => c.isDiagnostic);

        expect(acceptance.length).toBeGreaterThan(20);
        expect(diagnostic.length).toBeGreaterThan(10);

        // 验证覆盖类别数 >= 10
        const categories = new Set(suite.map((c: any) => c.category));
        expect(categories.size).toBeGreaterThanOrEqual(12);
    });

    it('3. Bootstrap 置信区间计算与统计守恒验证', () => {
        // 构造人工得分分布：10 局全胜 (得分为 1.0)
        const allWins = new Array(10).fill(1.0);
        const ciWin = bootstrapConfidenceInterval(allWins);
        expect(ciWin.mean).toBe(1.0);
        expect(ciWin.lower95).toBe(1.0);
        expect(ciWin.upper95).toBe(1.0);

        // 构造胜负各半分布
        const halfHalf = [1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0];
        const ciHalf = bootstrapConfidenceInterval(halfHalf);
        expect(ciHalf.mean).toBe(0.5);
        expect(ciHalf.lower95).toBeLessThan(0.5);
        expect(ciHalf.upper95).toBeGreaterThan(0.5);
    });

    it('4. 战术题套件评估执行器验证', async () => {
        const suiteFile = path.resolve(__dirname, '../eval/tactical_suite.json');
        // 构造一个只选第一合法动作的 Dummy Policy
        const firstPolicy: Policy = {
            id: 'first_dummy',
            chooseAction: (ctx) => ctx.candidateCodes[0]
        };

        const evalRes = await evaluateTacticalSuite(firstPolicy, suiteFile);
        expect(evalRes.totalCases).toBeGreaterThanOrEqual(40);
        expect(evalRes.acceptanceCases + evalRes.diagnosticCases).toBe(evalRes.totalCases);
        expect(evalRes.results.length).toBe(evalRes.totalCases);
    });

    it('5. 微型配对竞技场运行与控制侧交换验证', async () => {
        // 使用简单的 FirstLegal 策略进行 1 对配对赛（共 2 局，交换控制侧）
        const pA: Policy = {
            id: 'agent_A',
            chooseAction: (ctx) => ctx.candidateCodes[0]
        };
        const pB: Policy = {
            id: 'agent_B',
            chooseAction: (ctx) => ctx.candidateCodes[ctx.candidateCodes.length - 1]
        };

        const res = await runPairedArena(pA, pB, ['(2) Duel.aem'], 1, { maxAtomicActions: 5 });
        expect(res.pairs.length).toBe(1);
        expect(res.records.length).toBe(2);
        // 第一局 A 执 P0，第二局 A 执 P1
        expect(res.pairs[0].game1.p0Policy).toBe('agent_A');
        expect(res.pairs[0].game2.p0Policy).toBe('agent_B');
    });
});
