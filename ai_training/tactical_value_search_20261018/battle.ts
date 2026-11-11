import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { ApkLikeAI } from '../../src/game/ai/apk_like_ai';
import { getAllianceId, getRuleConfig, getTileIncome, isCommanderUnit } from '../../src/game/rule_config';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { extractFeatures, requiresAuraCorrection } from '../tactical_scale_20261018/complete_tactics';
import { choosePolicy } from '../tactical_scale_20261018/policy';
import { chooseBounded,type SearchMemory } from './search';
import { extendFeatures } from './features';
import { DIR, read, save, hash, quantiles } from './io';

function rngStream(seed: number) {
    let state = seed >>> 0, calls = 0;
    return { next() { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); calls++; return ((t ^ t >>> 14) >>> 0) / 4294967296; }, snapshot: () => ({ state, calls }) };
}
function economy(state: ReturnType<GameEngine['getState']>, id: number) {
    const rules = getRuleConfig(state);
    let towns = 0, castles = 0, income = 0;
    state.map.tiles.forEach(row => row.forEach(tile => {
        if (tile.ownerId !== id) return;
        const key = getTileTerrainKey(tile); towns += Number(key === 'town'); castles += Number(key === 'castle'); income += getTileIncome(state,tile);
    }));
    for (const unit of state.units) if (unit.ownerId === id && isCommanderUnit(state,unit,id)) income += rules.incomeCommanderBase + (unit.level ?? 0)*rules.incomeCommanderGrowth;
    return { towns, castles, recurringIncome: income, gold: state.players.find(p => p.id === id)?.gold ?? 0 };
}
const counters = () => ({ actions: 0, moveAttempts: 0, effectiveMoves: 0, unmovedWaits: 0, endWithRecruit: 0, lethalLandings: 0, knownMoveRisk: 0, focusLethalLandings:0,focusKnownMoveRisk:0,endTurns:0,recruitOpportunitySteps:0,searchTriggers:0,searchChanges:0,searchNodes:0,attackOpportunity:0,attackTaken:0,actualIncome: 0 });

async function play(slot: any) {
    const plan = read('battle-plan.json'), budget = plan.budgets;
    const name=slot.model==='hierarchical'?'../tactical_scale_20261018/group-best.json':'model-final.json';
    const model = read(name), oldSchema = read('old-schema.json');
    const initial = read(plan.maps[slot.mapIndex].path); assert.equal(hash(initial),plan.maps[slot.mapIndex].sha256);
    const engine = new GameEngine(initial);
    assert.ok(initial.players.some((p:any)=>p.id===slot.seat),'评测座位必须是实际玩家');
    const enemyId=initial.players.find((p:any)=>p.id!==slot.seat)!.id;
    const rng = rngStream(slot.opponentSeed), opponent = slot.opponent === 'apk_like' ? new ApkLikeAI(rng.next) : new HeuristicAI(rng.next);
    const prefix = `battles/slots/${slot.id}`;
    if (fs.existsSync(path.join(DIR,prefix,'result.json'))) return;
    fs.mkdirSync(path.join(DIR,prefix),{recursive:true});
    assert.ok(!fs.existsSync(path.join(DIR,prefix,'actions.jsonl')), '未完成对局需要显式核对，拒绝覆盖');
    const handle = fs.openSync(path.join(DIR,prefix,'actions.jsonl'),'wx');
    const started = performance.now(), samples = { model: [] as number[], opponent: [] as number[] };
    const metrics = { model: counters(), opponent: counters() };
    const searchMemory:SearchMemory={};
    let actions = 0, classification = 'error', error: unknown = null, round10: unknown = null;
    let activeDecision:{side:'model'|'opponent';start:number}|null=null;
    const repeats = new Map<string,number>();
    save(prefix+'/started.json',{ slot, initialHash: hash(initial), modelHash: hash(model), startedAt: new Date().toISOString(), budget });
    try {
        while (true) {
            const state = engine.getState();
            if (!round10 && state.turn >= 10) {
                const own = economy(state,slot.seat), other = economy(state,enemyId);
                round10 = { turn: state.turn, currentPlayer: state.currentPlayer, model: { ...own, actualIncome: metrics.model.actualIncome }, opponent: { ...other, actualIncome: metrics.opponent.actualIncome },
                    recurringIncomeDifference: own.recurringIncome-other.recurringIncome, actualIncomeDifference: metrics.model.actualIncome-metrics.opponent.actualIncome, goldBalanceDifference: own.gold-other.gold };
            }
            if (engine.isTerminal()) { classification = state.winner === -1 ? 'natural_draw' : state.winner === getAllianceId(state,slot.seat) ? 'natural_win' : 'natural_loss'; break; }
            if (actions >= budget.maxActions) { classification = 'action_truncation'; break; }
            if (performance.now()-started >= budget.maxWallMs) { classification = 'wall_truncation'; break; }
            const { turn: _turn, ...position } = state;
            const repeat = hash({ position, rng: rng.snapshot(),policyMemory:slot.model==='bounded'?searchMemory:null }); repeats.set(repeat,(repeats.get(repeat)??0)+1);
            if (repeats.get(repeat)! >= 3) { classification = 'loop'; break; }
            const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender').sort((a,b) => encodeAction(a)<encodeAction(b)?-1:encodeAction(a)>encodeAction(b)?1:0);
            assert.ok(legal.length);
            const side = state.currentPlayer === slot.seat ? 'model' : 'opponent';
            const counter = metrics[side], rngBefore = rng.snapshot(), t0 = performance.now();
            activeDecision={side,start:t0};
            const bounded=side==='model'&&slot.model!=='hierarchical'?chooseBounded(engine,legal,model,oldSchema,slot.model,Math.max(0,2400-counter.searchNodes),searchMemory):null;
            const selected = side === 'model' ? (bounded?{...bounded, inputHash:hash(bounded.input),logitsHash:hash(bounded.logits),decoder:slot.model,chosenLogit:bounded.logits[bounded.index],candidates:bounded.logits.length}:choosePolicy(engine,legal,model,oldSchema,'hierarchical',false)) : null;
            const action = selected?.action ?? (slot.opponent === 'random' ? legal[Math.floor(rng.next()*legal.length)] : opponent.getAction(engine,state.currentPlayer,legal));
            const ms = performance.now()-t0; samples[side].push(ms);activeDecision=null;
            assert.ok(legal.some(a => encodeAction(a) === encodeAction(action)));
            if (ms > budget.maxDecisionMs) { classification = 'decision_timeout'; break; }
            if (performance.now()-started >= budget.maxWallMs) { classification = 'wall_truncation'; break; }
            let movingExtra: number[] | null = null;
            if (action.type === 'move' || action.type === 'post_attack_move') {
                counter.moveAttempts++;
                const unit = state.units.find(u => u.id === action.unitId)!;
                counter.effectiveMoves += Number(unit.pos.x !== action.to.x || unit.pos.y !== action.to.y);
                movingExtra = selected?.extra ?? extractFeatures(engine,[action]).extra[0];
                counter.knownMoveRisk += Number(!!movingExtra[6]); counter.lethalLandings += Number(!!movingExtra[5]);
            }
            if (action.type === 'wait' && !state.units.find(u => u.id === action.unitId)!.hasMoved) counter.unmovedWaits++;
            if (action.type === 'end_turn' && legal.some(a => a.type.startsWith('recruit_'))) counter.endWithRecruit++;
            const result = engine.step(action); assert.ok(!result.info.includes('非法动作'));
            const after = result.state;
            for (const player of after.players) {
                const prior = state.players.find(p => p.id === player.id)!.gold;
                const target = player.id === slot.seat ? metrics.model : metrics.opponent;
                if (player.gold > prior) target.actualIncome += player.gold-prior;
            }
            counter.actions++;
            counter.endTurns+=Number(action.type==='end_turn');counter.recruitOpportunitySteps+=Number(legal.some(a=>a.type.startsWith('recruit_')));
            counter.attackOpportunity+=Number(legal.some(a=>a.type==='attack'));counter.attackTaken+=Number(action.type==='attack');
            if(bounded){counter.searchTriggers+=Number(bounded.search.triggered);counter.searchChanges+=Number(bounded.search.preferred!==bounded.search.selected);counter.searchNodes+=bounded.search.nodes;counter.focusLethalLandings+=Number((action.type==='move'||action.type==='post_attack_move')&&!!bounded.focus[1]);counter.focusKnownMoveRisk+=Number((action.type==='move'||action.type==='post_attack_move')&&!!bounded.focus[7]);}
            fs.writeSync(handle,JSON.stringify({ i: actions, player: state.currentPlayer, side, action, code: encodeAction(action), beforeHash: hash(state), afterHash: hash(after), legalHash: hash(legal.map(encodeAction)),
                ms, search:bounded?.search??null,focus:bounded?.focus??null,selected: selected ? { inputHash: selected.inputHash, logitsHash: selected.logitsHash, decoder: selected.decoder, chosenLogit: selected.chosenLogit, candidates: selected.candidates } : null,
                movingRisk: movingExtra ? { known: movingExtra[6], lethal: movingExtra[5], damage: movingExtra[4]*128 } : null, rngBefore, rngAfter: rng.snapshot() })+'\n');
            actions++;
            if (action.type === 'surrender') { classification = 'surrender'; break; }
            if (actions % 32 === 0) save(prefix+'/live.json',{ actions, turn: after.turn, seconds: (performance.now()-started)/1000, metrics });
        }
    } catch(e) { if(activeDecision)samples[activeDecision.side].push(performance.now()-activeDecision.start);error = { message:String(e), stack:e instanceof Error?e.stack:null }; classification = String(e).includes('墙钟预算耗尽')?'decision_timeout':'error'; }
    finally { fs.closeSync(handle); }
    const final = engine.getState();
    const rates = Object.fromEntries(Object.entries(metrics).map(([side,m]) => [side,{ ...m,effectiveMoveShare:m.effectiveMoves/Math.max(1,m.actions),unmovedWaitShare:m.unmovedWaits/Math.max(1,m.actions),lethalLandingRate:m.lethalLandings/Math.max(1,m.knownMoveRisk) }]));
    const text = fs.readFileSync(path.join(DIR,prefix,'actions.jsonl'));
    fs.writeFileSync(path.join(DIR,prefix,'actions.jsonl.gz'),gzipSync(text));
    // 保留本次原始日志，压缩副本仅便于交付与重放。
    save(prefix+'/final.json',final);
    save(prefix+'/result.json',{ slot,classification,error,actions,terminal:engine.isTerminal(),winner:final.winner,finalTurn:final.turn,wallSeconds:(performance.now()-started)/1000,finalHash:hash(final),
        round10:round10??{reached:false},metrics:rates,latency:{model:quantiles(samples.model),opponent:quantiles(samples.opponent)},latencySamples:samples,rngFinal:rng.snapshot(),modelHash:hash(model) });
    console.log(JSON.stringify({ id:slot.id,classification,actions,seconds:Math.round((performance.now()-started)/1000) }));
}

function replay(slot:any) {
    const plan = read('battle-plan.json'), prefix = `battles/slots/${slot.id}`, result = read(prefix+'/result.json');
    const engine = new GameEngine(read(plan.maps[slot.mapIndex].path));
    const rows = gunzipSync(fs.readFileSync(path.join(DIR,prefix,'actions.jsonl.gz'))).toString().trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
    const corrected=structuredClone(result.metrics);let correctedRiskActions=0;
    for (const row of rows) {
        assert.equal(hash(engine.getState()),row.beforeHash);
        const legal = engine.getLegalActions(engine.getState().currentPlayer).filter(a=>a.type!=='surrender').map(encodeAction).sort();
        assert.equal(hash(legal),row.legalHash); assert.ok(legal.includes(row.code));
        if(row.action.type==='move'||row.action.type==='post_attack_move'){
            if(!row.focus){const focus=extendFeatures(engine,[row.action])[0];corrected[row.side].focusLethalLandings=(corrected[row.side].focusLethalLandings??0)+Number(!!focus[1]);corrected[row.side].focusKnownMoveRisk=(corrected[row.side].focusKnownMoveRisk??0)+Number(!!focus[7]);}
        }
        if ((row.action.type==='move'||row.action.type==='post_attack_move')&&requiresAuraCorrection(engine.getState())) {
            const extra=extractFeatures(engine,[row.action]).extra[0],counter=corrected[row.side];
            counter.knownMoveRisk+=Number(!!extra[6])-Number(!!row.movingRisk?.known);
            counter.lethalLandings+=Number(!!extra[5])-Number(!!row.movingRisk?.lethal);
            correctedRiskActions++;
        }
        assert.ok(!engine.step(row.action).info.includes('非法动作'));
        assert.equal(hash(engine.getState()),row.afterHash);
    }
    assert.equal(rows.length,result.actions); assert.equal(hash(engine.getState()),result.finalHash);
    for(const side of ['model','opponent'])corrected[side].lethalLandingRate=corrected[side].lethalLandings/Math.max(1,corrected[side].knownMoveRisk);
    save(prefix+'/strict-replay.json',{ passed:true,actions:rows.length,finalHash:result.finalHash,policyRecomputed:false,correctedMetrics:corrected,correctedRiskActions,featureRevision:'v3-aura-complete' });
}

const mode = process.argv[2]??'play', lane = Number(process.argv[3]??0), lanes=Number(process.argv[4]??1), filter=process.argv[5];
const plan = read('battle-plan.json');
for (const [index,slot] of plan.slots.entries()) {
    if (index%lanes!==lane || filter && slot.model!==filter) continue;
    if (mode==='replay') replay(slot); else await play(slot);
}
