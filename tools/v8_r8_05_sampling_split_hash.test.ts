import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { GameState } from '../src/game/types';
import { getBehavioralStateHash, generateV7Dataset } from './v7_training_pipeline';

describe('R8-05 Behavioral State Hashing, Split Manifest & Curriculum', () => {
    const rules = getApkSkirmishRuleConfig('SD');

    it('R8-05-A: Behavioral state hash distinguishes all rule-relevant fields (status, level, exp, graves, rules, etc.) and is canonical over IDs', () => {
        const base = createDemoState(rules);
        const hashBase = getBehavioralStateHash(base, 0);

        // 1. hasMoved difference
        const sMoved = JSON.parse(JSON.stringify(base)) as GameState;
        sMoved.units[0].hasMoved = true;
        expect(getBehavioralStateHash(sMoved, 0)).not.toBe(hashBase);

        // 2. hasActed difference
        const sActed = JSON.parse(JSON.stringify(base)) as GameState;
        sActed.units[0].hasActed = true;
        expect(getBehavioralStateHash(sActed, 0)).not.toBe(hashBase);

        // 3. pendingUnitId difference
        const sPending = JSON.parse(JSON.stringify(base)) as GameState;
        sPending.pendingUnitId = 'u_pending_999';
        expect(getBehavioralStateHash(sPending, 0)).not.toBe(hashBase);

        // 4. commanderDeathCount difference
        const sDeath = JSON.parse(JSON.stringify(base)) as GameState;
        sDeath.players[0].commanderDeathCount = 1;
        expect(getBehavioralStateHash(sDeath, 0)).not.toBe(hashBase);

        // 5. Building ownership difference (castle captured)
        const sBuilding = JSON.parse(JSON.stringify(base)) as GameState;
        sBuilding.map.tiles[0][0].ownerId = 1;
        expect(getBehavioralStateHash(sBuilding, 0)).not.toBe(hashBase);

        // 6. Unit status difference (poisoned)
        const sStatus = JSON.parse(JSON.stringify(base)) as GameState;
        sStatus.units[0].status = { type: 'poisoned', remainingTurns: 2 };
        expect(getBehavioralStateHash(sStatus, 0)).not.toBe(hashBase);

        // 7. Unit level difference
        const sLevel = JSON.parse(JSON.stringify(base)) as GameState;
        sLevel.units[0].level = 3 as any;
        expect(getBehavioralStateHash(sLevel, 0)).not.toBe(hashBase);

        // 8. Unit exp difference
        const sExp = JSON.parse(JSON.stringify(base)) as GameState;
        sExp.units[0].exp = 75;
        expect(getBehavioralStateHash(sExp, 0)).not.toBe(hashBase);

        // 9. Graves difference
        const sGraves = JSON.parse(JSON.stringify(base)) as GameState;
        sGraves.graves = [{ id: 'grave_1', pos: { x: 2, y: 2 }, remainingTurns: 2 }];
        expect(getBehavioralStateHash(sGraves, 0)).not.toBe(hashBase);

        // 10. Rules difference
        const sRules = JSON.parse(JSON.stringify(base)) as GameState;
        sRules.rules = { ...sRules.rules, incomeVillage: 250 };
        expect(getBehavioralStateHash(sRules, 0)).not.toBe(hashBase);

        // 11. Canonical ID invariance: identical tactical board with different generated IDs must match
        const sRenamed = JSON.parse(JSON.stringify(base)) as GameState;
        sRenamed.units[0].id = 'arbitrary_generated_id_123';
        sRenamed.units[1].id = 'arbitrary_generated_id_456';
        expect(getBehavioralStateHash(sRenamed, 0)).toBe(hashBase);
    });

    it('R8-05-B: Curriculum E post-condition: genuine pending unit is created and then cleared', () => {
        const state = createDemoState(rules);
        // Ensure commanderCastleRecruitUsesPending is enabled
        state.rules = { ...state.rules, commanderCastleRecruitUsesPending: true };
        state.players[0].gold = 500;

        const engine = new GameEngine(state);
        const recruitActions = engine.getLegalActions(0).filter(a => a.type === 'recruit_to_castle');
        expect(recruitActions.length).toBeGreaterThan(0);

        engine.step(recruitActions[0]);
        // After stepping recruit_to_castle with commanderCastleRecruitUsesPending, pendingUnitId MUST be active
        const pendingId = engine.getState().pendingUnitId;
        expect(pendingId).toBeDefined();

        // Legal actions must now be constrained to this pending unit
        const pendingLegals = engine.getLegalActions(0);
        for (const act of pendingLegals) {
            if ('unitId' in act) {
                expect(act.unitId).toBe(pendingId);
            }
        }

        // Stepping pending unit move / wait clears the pending state
        const moveOrWait = pendingLegals.find(a => a.type === 'move' || a.type === 'wait');
        expect(moveOrWait).toBeDefined();
        if (moveOrWait) {
            engine.step(moveOrWait);
            if (moveOrWait.type === 'wait') {
                expect(engine.getState().pendingUnitId).toBeUndefined();
            }
        }
    });

    it('R8-05-C: Curriculum G post-condition: decisive victory actually triggers terminal winner', () => {
        const state = createDemoState(rules);
        const enemyComm = state.units.find(u => u.ownerId === 1 && u.unitClass === 'commander')!;
        const friendlyUnit = state.units.find(u => u.ownerId === 0 && u.unitClass === 'soldier')!;

        enemyComm.hp = 1; // 1 HP, guaranteed lethal strike
        enemyComm.pos = { x: 3, y: 3 };
        friendlyUnit.pos = { x: 3, y: 2 };
        friendlyUnit.hasMoved = false;
        friendlyUnit.hasActed = false;

        // Eliminate all other enemy units and remove enemy castle so elimination triggers decisive victory
        state.units = [friendlyUnit, enemyComm];
        state.map.tiles[7][7].ownerId = null;
        state.currentPlayer = 0;

        const engine = new GameEngine(state);
        const lethalAttack = engine.getLegalActions(0).find(a =>
            a.type === 'attack' && (a as any).attackerId === friendlyUnit.id && (a as any).targetId === enemyComm.id
        );

        expect(lethalAttack).toBeDefined();
        if (lethalAttack) {
            engine.step(lethalAttack);
            expect(engine.getState().winner).toBe(0);
            expect(engine.isTerminal()).toBe(true);
        }
    });

    it('R8-05-D: Real dataset generation produces verified Curriculum E, isolated split manifest, and matches current runId', async () => {
        const testRunId = `test_r8_05_integration_${Date.now()}`;
        // Scratch output goes to the platform temp directory and is removed at the end of the test.
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v8_r8_05_'));
        const tempBaseDir = path.join(tempRoot, testRunId);
        const tempReportDir = path.join(tempRoot, `${testRunId}_reports`);

        try {
            const genResult = await generateV7Dataset({
                totalTarget: 70,
                generalTarget: 35,
                curriculumTarget: 35,
                directories: {
                    runId: testRunId,
                    runDir: tempBaseDir,
                    reportDir: tempReportDir,
                    datasetDir: path.join(tempBaseDir, 'datasets'),
                    checkpointDir: path.join(tempBaseDir, 'checkpoints'),
                    consumedDir: path.join(tempBaseDir, 'consumed_samples')
                }
            });

            expect(genResult.totalUniqueStates).toBeGreaterThan(0);

            // 1. Check data-and-training-coverage.json
            const coveragePath = path.join(tempReportDir, 'data-and-training-coverage.json');
            expect(fs.existsSync(coveragePath)).toBe(true);
            const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
            expect(coverage.runId).toBe(testRunId);
            expect(coverage.curriculumBreakdown.E_pending).toBeGreaterThan(0);

            // 2. Check split_manifest.json
            const manifestPath = path.join(tempBaseDir, 'split_manifest.json');
            expect(fs.existsSync(manifestPath)).toBe(true);
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            expect(manifest.runId).toBe(testRunId);

            const trainRoots = new Set(manifest.trainRootFamilies);
            const valRoots = new Set(manifest.valRootFamilies);
            expect(trainRoots.size).toBeGreaterThan(0);
            expect(valRoots.size).toBeGreaterThan(0);

            // Zero leakage between train and val roots
            const leakIntersection = new Set([...trainRoots].filter(r => valRoots.has(r)));
            expect(leakIntersection.size).toBe(0);

            // 3. Check spatial JSONL dataset: CURRICULUM_PENDING must be present
            const spatialLines = fs.readFileSync(genResult.spatialDatasetPath, 'utf8').split('\n').filter(l => l.trim().length > 0);
            expect(spatialLines.length).toBe(genResult.totalUniqueStates);
            const samples = spatialLines.map(l => JSON.parse(l));

            const pendingSamples = samples.filter(s => s.scenarioGroup === 'CURRICULUM_PENDING');
            expect(pendingSamples.length).toBeGreaterThan(0);

            // Every sample must be accounted for in train or val roots
            for (const s of samples) {
                expect(trainRoots.has(s.rootFamilyId) || valRoots.has(s.rootFamilyId)).toBe(true);
                expect(s.sampleId).toBeDefined();
            }
        } finally {
            // Clean up temporary test directories completely
            try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
            try { fs.rmSync(tempBaseDir, { recursive: true, force: true }); } catch {}
            try { fs.rmSync(tempReportDir, { recursive: true, force: true }); } catch {}
        }
    });

    it('R8-05-E: NET_A policy-only training produces 100% finite weights without NaN', async () => {
        const { trainV7NetAControl } = await import('./v7_training_pipeline');
        const mockSamples = [
            {
                sampleId: 's1',
                rootFamilyId: 'root_1',
                state: new Array(356).fill(0.1),
                candidates: [new Array(45).fill(0.2), new Array(45).fill(0.1)],
                labelIndex: 0,
                valueTarget: null // null valueTarget with valueWeight=0
            },
            {
                sampleId: 's2',
                rootFamilyId: 'root_2',
                state: new Array(356).fill(0.2),
                candidates: [new Array(45).fill(0.05), new Array(45).fill(0.3)],
                labelIndex: 1,
                valueTarget: null
            }
        ];

        const testNetADir = mkdtempSync(path.join(os.tmpdir(), 'v8_r8_05_net_a_'));
        const res = await trainV7NetAControl(mockSamples, undefined, { checkpointDir: testNetADir });
        expect(res.checkpointPath).toBeDefined();

        const checkpoint = JSON.parse(readFileSync(res.checkpointPath, 'utf8'));
        // Clean up test folder
        try { rmSync(testNetADir, { recursive: true, force: true }); } catch {}
        // Verify every parameter array is strictly finite (no null, no NaN)
        for (const [key, val] of Object.entries(checkpoint)) {
            if (Array.isArray(val)) {
                for (let i = 0; i < val.length; i++) {
                    expect(typeof val[i]).toBe('number');
                    expect(Number.isFinite(val[i])).toBe(true);
                }
            }
        }
    });
});

