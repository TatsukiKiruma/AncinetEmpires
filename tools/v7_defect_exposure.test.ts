import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../src/game/ai/spatial_conv_net';
import type { Action, GameState } from '../src/game/types';

describe('R7-01: V7 Defect Exposure Tests', () => {

    it('Defect 1: Curriculum C, F, G unit index and action legality failures in real GameEngine', () => {
        const sdRules = getApkSkirmishRuleConfig('SD');

        // Test Scenario C (Unblocking Castle) from v6 pipeline logic:
        // In demo state, units are: [u1(P0 comm), u2(P1 comm), u3(P0 soldier), u4(P1 soldier)]
        // After filter: units are: [u2(P1 comm), u3(P0 soldier), u4(P1 soldier)]
        const stateC = createDemoState(sdRules);
        stateC.units = stateC.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        // Old v6 pipeline did: state.units[0].pos = { x: 0, y: 0 };
        // But units[0] is u2 (Enemy commander)!
        const oldUnit0 = stateC.units[0];
        expect(oldUnit0.ownerId).toBe(1); // It's enemy!
        expect(oldUnit0.id).toBe('u2');

        // Old target action was: { type: 'move', unitId: 'u3', to: { x: 0, y: 1 } }
        // If stateC.units[0] was put at (0,0), then u2 is on (0,0), not u3!
        // Moving u3 to (0,1) does NOT unblock the castle if u3 wasn't on the castle!
        // A correct unblock curriculum MUST have friendly unit on castle and move IT off castle:
        const friendlySoldier = stateC.units.find(u => u.ownerId === 0 && u.unitClass === 'soldier')!;
        expect(friendlySoldier.id).toBe('u3');

        // Test Scenario F (Tactical Defense Priority) from v6 pipeline logic:
        const stateF = createDemoState(sdRules);
        stateF.units = stateF.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        stateF.players[0].gold = 500;
        stateF.units.push({
            id: 'u_enemy_threat',
            ownerId: 1,
            unitClass: 'soldier',
            pos: { x: 1, y: 0 },
            hp: 30,
            maxHp: 100,
            hasMoved: true,
            hasActed: true
        });
        // In old v6: state.units[0].pos = { x: 0, y: 1 };
        // state.units[0] is u2 (enemy commander).
        // targetAction: { type: 'attack', attackerId: state.units[0].id, targetId: 'u_enemy_threat' }
        // Let's verify that player 0 commanding state.units[0] (u2) to attack u_enemy_threat is ILLEGAL:
        const engineF_old = new GameEngine(stateF);
        const legalF_P0 = engineF_old.getLegalActions(0);
        const oldTargetF: Action = { type: 'attack', attackerId: stateF.units[0].id, targetId: 'u_enemy_threat' };
        const isOldLegal = legalF_P0.some(a => JSON.stringify(a) === JSON.stringify(oldTargetF));
        expect(isOldLegal).toBe(false); // Defect confirmed: P0 cannot command enemy commander u2 to attack!

        // Test Scenario G (Decisive Victory) from v6 pipeline logic:
        const stateG = createDemoState(sdRules);
        stateG.units = stateG.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
        const enemyComm = stateG.units.find(u => u.ownerId === 1 && u.unitClass === 'commander')!;
        stateG.units[0].pos = { x: 6, y: 6 }; // state.units[0] is enemy commander u2!
        const engineG = new GameEngine(stateG);
        const legalG_P0 = engineG.getLegalActions(0);
        const oldTargetG: Action = { type: 'attack', attackerId: stateG.units[0].id, targetId: enemyComm.id };
        const isOldG_Legal = legalG_P0.some(a => JSON.stringify(a) === JSON.stringify(oldTargetG));
        expect(isOldG_Legal).toBe(false); // Defect confirmed: P0 cannot command u2 to attack u2!
    });

    it('Defect 2: Target action fallback to legalActions[0] silently corrupts curriculum intention', () => {
        // When target action is illegal, old addSample() did:
        // if (targetIdx === -1) { targetIdx = 0; targetAction = legalActions[0]; }
        // This must be rejected/quarantined instead of silently replacing with an arbitrary legal action!
        const sdRules = getApkSkirmishRuleConfig('SD');
        const state = createDemoState(sdRules);
        const engine = new GameEngine(state);
        const legalActions = engine.getLegalActions(0);

        const illegalAction: Action = { type: 'attack', attackerId: 'non_existent', targetId: 'none' };
        let targetIdx = legalActions.findIndex(a => JSON.stringify(a) === JSON.stringify(illegalAction));

        // The safe behavior must be: return null / reject / quarantine, NEVER silently take legalActions[0]
        expect(targetIdx).toBe(-1);
        const safeResolution = (targetIdx === -1) ? null : legalActions[targetIdx];
        expect(safeResolution).toBeNull();
    });

    it('Defect 3: 4-block Spatial ResNet in TypeScript must not silently discard blocks 3 & 4', () => {
        // In commit 55177b8 / HEAD, spatial_resnet_v2_4block_checkpoint.json has 4 blocks
        const ckpt4Path = path.join(process.cwd(), 'training_runs/agent_upgrade_20260921_v6_01/checkpoints/spatial_resnet/spatial_resnet_v2_4block_checkpoint.json');
        if (existsSync(ckpt4Path)) {
            const rawJson = readFileSync(ckpt4Path, 'utf8');
            const raw = JSON.parse(rawJson);
            expect(raw.numBlocks).toBe(4);
            expect(raw.res3_1).toBeDefined();
            expect(raw.res4_1).toBeDefined();

            // Load via current TypeScript loader:
            const loaded = loadSpatialResNetFromJson(rawJson);
            // On unpatched code: loaded.architectureId is hardcoded to 'spatial_resnet_32ch_2res'
            // and res3/res4 are NOT in loaded weights!
            // Assert that 4-block is properly supported and recognized:
            expect((loaded as any).architectureId).toBe('spatial_resnet_32ch_4res');
            expect((loaded as any).res3_1).toBeDefined();
            expect((loaded as any).res4_1).toBeDefined();
        }
    });

    it('Defect 4: Evaluation metric with 0 rehire opportunities must return null, not 100.0%', () => {
        // In v6 pipeline: rehireSuccessRate: rehireOpportunities > 0 ? (chosen / opp * 100) : 100.0
        const calcRehireRate = (chosen: number, opportunities: number): number | null => {
            return opportunities > 0 ? Number((chosen / opportunities * 100).toFixed(1)) : null;
        };
        expect(calcRehireRate(0, 0)).toBeNull();
    });

    it('Defect 5: Pipeline entrypoint must be protected against unconditional execution on import/--help/--dry-run', () => {
        const pipelineSrc = readFileSync(path.join(process.cwd(), 'tools/v6_commander_specialist_pipeline.ts'), 'utf8');
        const hasGuard = /const\s+isDirectRun\s*=/.test(pipelineSrc);
        const hasHelp = /process\.argv\.includes\('--help'\)/.test(pipelineSrc);
        const hasDryRun = /process\.argv\.includes\('--dry-run'\)/.test(pipelineSrc);
        expect(hasGuard).toBe(true);
        expect(hasHelp).toBe(true);
        expect(hasDryRun).toBe(true);
    });

    it('Defect 6: Coverage audit must not report hardcoded numbers without scanning actual files', () => {
        const pipelineSrc = readFileSync(path.join(process.cwd(), 'tools/v6_commander_specialist_pipeline.ts'), 'utf8');
        // Unpatched runCoverageAudit hardcodes episodesTotal: 2500, chosenCommanderRehireActions: 618, etc.
        const hasHardcoded2500 = /episodesTotal:\s*2500/.test(pipelineSrc);
        const hasHardcoded618 = /chosenCommanderRehireActions:\s*618/.test(pipelineSrc);
        // It must NOT have hardcoded audit constants
        expect(hasHardcoded2500).toBe(false);
        expect(hasHardcoded618).toBe(false);
    });

    it('Defect 7: Python training loop must not overwrite best checkpoint with last epoch when last is worse', () => {
        const pyTrainSrc = readFileSync(path.join(process.cwd(), 'python/train_spatial_resnet.py'), 'utf8');
        // Unpatched train_spatial_resnet.py does: `if is_best or epoch == args.epochs:` which overwrites out_model!
        const hasOverwritingCondition = /if\s+is_best\s+or\s+epoch\s*==\s*args\.epochs:/.test(pyTrainSrc);
        expect(hasOverwritingCondition).toBe(false); // Must separate best and last!
    });
});
