/** 审核 V14b 的教师重放与结束回合证据，只写新的审查产物。 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { encodeAction } from '../../src/game/env';
import { GameEngine } from '../../src/game/engine';
import { getAllianceId } from '../../src/game/rule_config';
import { streamFor } from '../../v13/tools/eval_v3_core';
import { SpatialResNetPredictor, loadSpatialResNetFromJson } from '../../src/game/ai/spatial_conv_net';
import { predictSpatialAction } from '../../src/game/ai/shared_spatial_policy';
import type { GameState } from '../../src/game/types';

const root = 'v14/out/v14_20260925_t14b';
const hash = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function main() {
    const windows = fs.readFileSync(`${root}/T14-06/failure_windows_duel2p.jsonl`, 'utf8')
        .trim().split('\n').map(line => JSON.parse(line));
    const first40 = windows.slice(0, 40);
    const seed = 1;
    const wanted = new Set<number>([...first40.filter(row => row.seed === seed).map(row => row.step), 114]);
    const factory = await createDefaultEnvFactory('APK/_analysis/unpack', 'training_configs/sd_training_plan_20260705.json');
    const checkpoint = `${root}/T14-06/c1_s42/c1_s42_best.json`;
    const bytes = fs.readFileSync(checkpoint);
    const predictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(bytes.toString('utf8')));

    async function replay(useStudent: boolean) {
        const env = await factory.createEnv({ kind: 'skirmish_episode', version: 1,
            scenario: { id: 'SDPLAN:sd-normal:(2) Duel.aem', mode: 'SD', mapName: '(2) Duel.aem', resourcePath: '' },
            seed, maxPlies: 1200, maxSteps: 20000, initialObservationHash: '', initialLegalActionCount: 0,
            fixedActionSpaceSize: 0, players: [], policyByPlayer: {}, steps: [], summary: {} } as any);
        env.reset(seed);
        const engine = env.getEngine();
        const seats = engine.getState().players.map(p => p.id).sort((a,b) => a-b);
        const ais = new Map(seats.map(p => [p, new HeuristicAI(streamFor(seed,p))]));
        const snapshots = new Map<number, GameState>();
        const studentChoices = new Map<number, string>();
        for (let step=0; step<=Math.max(...wanted);step++) {
            if(engine.isTerminal())break;
            const state=engine.getState();
            const legal=engine.getLegalActions(state.currentPlayer).filter(a=>a.type!=='surrender');
            if(!legal.length)break;
            if(wanted.has(step)) snapshots.set(step,state);
            const action=useStudent && state.currentPlayer===seats[0]
                ? predictSpatialAction(predictor,state,state.currentPlayer,legal).action
                : ais.get(state.currentPlayer)!.getAction(engine,state.currentPlayer,undefined);
            studentChoices.set(step,encodeAction(action));
            if(step<Math.max(...wanted))engine.step(action);
        }
        return {snapshots,studentChoices};
    }
    const actual=await replay(true);
    const mirror=await replay(false);
    const compared=first40.filter(row=>row.seed===seed).map(row=>({
        step:row.step,
        sameState:hash(actual.snapshots.get(row.step))===hash(mirror.snapshots.get(row.step)),
        recordedAction:row.chosenAction,
        actualReplayedAction:actual.studentChoices.get(row.step),
        matchesRecordedAction:row.chosenAction===actual.studentChoices.get(row.step),
        actualActor:actual.snapshots.get(row.step)?.currentPlayer,
        mirrorActor:mirror.snapshots.get(row.step)?.currentPlayer,
    }));
    function teacherRepeats(state: GameState, variedSeeds:boolean) {
        return [0,1,2].map(rep=>{
            const engine=new GameEngine(state);
            const ai=new HeuristicAI(streamFor(seed+(variedSeeds?rep*7919:0),state.currentPlayer));
            return encodeAction(ai.getAction(engine,state.currentPlayer,undefined));
        });
    }
    const at37=mirror.snapshots.get(37)!;
    const actual37=actual.snapshots.get(37)!;
    const at114=actual.snapshots.get(114)!;
    const legal114=new GameEngine(at114).getLegalActions(at114.currentPlayer).filter(a=>a.type!=='surrender');
    const result={schema:'v14b_review_windows_1',generatedAt:new Date().toISOString(),
        checkpoint,checkpointSha256:crypto.createHash('sha256').update(bytes).digest('hex'),
        comparedWindows:compared.length,
        replayedStudentActionMismatches:compared.filter(r=>!r.matchesRecordedAction).length,
        studentVsMirrorStateMismatches:compared.filter(r=>!r.sameState).length,
        step37:{actualStateHash:hash(actual37),mirrorStateHash:hash(at37),
            mirrorSameSeedRuns:teacherRepeats(at37,false),mirrorVariedSeedRuns:teacherRepeats(at37,true),
            studentStateSameSeedRuns:teacherRepeats(actual37,false)},
        endTurnStep114:{turn:at114.turn,currentPlayer:at114.currentPlayer,alliance:getAllianceId(at114,at114.currentPlayer),
            gold:at114.players.find(p=>p.id===at114.currentPlayer)?.gold,
            actualChosenAction:actual.studentChoices.get(114),
            legalActionCodes:legal114.map(encodeAction),
            units:at114.units.filter(u=>u.ownerId===at114.currentPlayer).map(u=>({id:u.id,unitClass:u.unitClass,hp:u.hp,
                hasMoved:u.hasMoved,hasActed:u.hasActed,pos:u.pos})),
            note:'合法动作列表只证明存在其他选择，不证明结束回合更差；本探针没有做长期反事实。'},
        comparisons:compared};
    fs.mkdirSync('v14/review/v14b_audit_20260925',{recursive:true});
    fs.writeFileSync('v14/review/v14b_audit_20260925/window_probe.json',JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({...result,comparisons:undefined},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
