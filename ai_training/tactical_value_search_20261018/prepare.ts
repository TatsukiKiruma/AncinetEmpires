import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
import { inspectAndRead } from '../data_acceptance_20261016/phone/compact_reader';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { extractFeatures } from '../tactical_scale_20261018/complete_tactics';
import { encodeFeatures, observationState } from '../tactical_scale_20261018/encoding';
import { groupKey } from '../tactical_scale_20261018/sources';
import { gunzipSync } from 'node:zlib';
import { extendFeatures,valueSummary } from './features';
import { DIR, read, save, hash, sha } from './io';

const lane = Number(process.argv[2] ?? 0), lanes = Number(process.argv[3] ?? 1);
const startIndex = Number(process.argv[4] ?? 0), endIndex = Number(process.argv[5] ?? 600);
const source = path.resolve(DIR, '../data_acceptance_20261016/phone');
const selection = read('selection.json'), oldSchema = read('../tactical_scale_20261018/old-schema.json');
const assignment=process.argv[6]?read(process.argv[6]):null;
const generationSourceBinding=Object.fromEntries(['prepare.ts','features.ts','focus_threat.ts','../../src/game/engine.ts','../../src/game/rules.ts'].map(name=>[name,sha(fs.readFileSync(path.resolve(DIR,name)))]));
assert.ok(read('../tactical_scale_20261018/feature-parity-speed.json').passed);
assert.ok(read('../tactical_scale_20261018/clone-trajectory-parity.json').passed);
for (const [pi, parent] of selection.parents.entries()) {
    if ((assignment?assignment.parentLane[parent.parentId]!==lane:pi%lanes!==lane) || pi < startIndex || pi >= endIndex) continue;
    const prefix = `data/${parent.parentId}`;
    if (fs.existsSync(path.join(DIR, prefix + '.receipt.json'))) continue;
    const cachedReceipt=path.resolve(DIR,'../tactical_scale_20261018/data-final',parent.parentId+'.receipt.json');
    const cached=new Map<string,any>();
    if(fs.existsSync(cachedReceipt)){
        const receipt=JSON.parse(fs.readFileSync(cachedReceipt,'utf8'));
        assert.equal(sha(fs.readFileSync(receipt.path)),receipt.sha256);
        for(const line of gunzipSync(fs.readFileSync(receipt.path)).toString().trim().split('\n')){
            const row=JSON.parse(line);cached.set(`${row.macro}|${row.subAction}`,row);
        }
    }
    const outputName = path.join(DIR, prefix + '.jsonl.gz');
    fs.mkdirSync(path.dirname(outputName), { recursive: true });
    assert.ok(!fs.existsSync(outputName), '拒绝覆盖已有完整分片');
    if (fs.existsSync(outputName + '.partial')) fs.renameSync(outputName + '.partial', outputName + '.interrupted-' + Date.now());
    const zip = createGzip({ level: 3 }), output = fs.createWriteStream(outputName + '.partial', { flags: 'wx' }); zip.pipe(output);
    let rows = 0, trivial = 0, weight = 0, changedSourceHashes = 0;
    const started = performance.now();
    try {
        for (const entry of parent.segments) {
            if (!entry.policyLabelEligible || !entry.admittedAtoms) continue;
            const checked = await inspectAndRead(source, entry);
            const initial = structuredClone(checked.header.initialState);
            const rules = initial.rules;
            if (rules.unitLimit !== undefined) { rules.populationLimit = rules.unitLimit; delete rules.unitLimit; }
            rules.allowZeroPopulationRecruitAtLimit = true;
            for (const team of Object.values(rules.teams ?? {}) as any[]) if (team.unitLimit !== undefined) { team.populationLimit = team.unitLimit; delete team.unitLimit; }
            const sourceEngine = new GameEngine(initial, { disableAutoAdvanceWhenNoMeaningfulAction: true });
            const engine = new GameEngine(initial);
            await inspectAndRead(source, entry, async row => {
                const state = sourceEngine.getState(), all = sourceEngine.getLegalActions(state.currentPlayer);
                const action = all.find(a => encodeAction(a) === row.code);
                assert.ok(action, `当前权威标签非法:${parent.parentId}/${row.macro}/${row.code}`);
                if (!all.some(a => a.type !== 'end_turn' && a.type !== 'surrender')) {
                    assert.equal(action.type, 'end_turn'); trivial++;
                } else {
                    assert.equal(hash(engine.getState()), hash(state), '自动换手前态必须一致');
                    const legal = all.filter(a => a.type !== 'surrender'), byCode = new Map(legal.map(a => [encodeAction(a), a]));
                    const packet = observe(observationState(state), legal), ordered = packet.codes.map(code => byCode.get(code)!);
                    const prior=cached.get(`${row.macro}|${row.subAction}`);
                    if(prior){assert.equal(prior.beforeHash,hash(state));assert.deepEqual(prior.codes,packet.codes);}
                    const encoded=prior??encodeFeatures(packet,oldSchema,extractFeatures(engine,ordered));
                    const focus=extendFeatures(engine,ordered),offset=141;
                    const candidates=encoded.candidates.map((c:any,j:number)=>[...c,...focus[j].map((v,k)=>[offset+k,v])]);
                    const target = packet.codes.indexOf(row.code); assert.ok(target >= 0);
                    const record = { ...encoded, candidates, turn:state.turn,valueSummary:valueSummary(state,focus),valueMask:row.valueMask,valueTarget:row.outcomeTarget, target, weight: row.weight, actionGroups: ordered.map(groupKey), parent: parent.parentId,
                        macro: row.macro, subAction: row.subAction, macroLength: row.macroAtoms, type: action.type, beforeHash: hash(state), legalHash: hash(packet.codes),
                        sourceBeforeHash: row.beforeHash, sourceLegalHash: row.legalHash, featuresSchema: 'tactics-value-focus-v4', automaticHandoff: true };
                    changedSourceHashes += Number(record.beforeHash !== row.beforeHash);
                    if (!zip.write(JSON.stringify(record) + '\n')) await once(zip, 'drain');
                    rows++; weight += row.weight;
                    assert.ok(!engine.step(action).info.includes('非法动作'));
                }
                assert.ok(!sourceEngine.step(action).info.includes('非法动作'));
                if ((rows + trivial) % 32 === 0) save(`prepare${startIndex ? '-tail' : ''}-${lane}.live.json`, { parent: parent.parentId, rows, trivial, seconds: (performance.now() - started) / 1000 });
            });
        }
        zip.end(); await once(output, 'finish'); fs.renameSync(outputName + '.partial', outputName);
        save(prefix + '.receipt.json', { parent: parent.parentId, split: parent.split, path: outputName, rows, trivial, weight, changedSourceHashes,
            sha256: sha(fs.readFileSync(outputName)), seconds: (performance.now() - started) / 1000, currentStrictLabels: true, reusedBaseRows:cached.size,generationSourceBinding });
        console.log(JSON.stringify({ parent: parent.parentId, rows, trivial, seconds: (performance.now() - started) / 1000 }));
    } catch (error) {
        zip.destroy(); output.destroy(); save(prefix + '.failure.json', { parent: parent.parentId, rows, trivial, error: String(error) });
        throw error;
    }
}
