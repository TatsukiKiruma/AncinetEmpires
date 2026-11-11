import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGunzip, gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getLegalActions } from '../../src/game/rules';
import { createRecordExpansionOptions, expandApkReplayRecordToProjectActions } from '../../src/game/apk_replay';
import { readNativeConfig, readNativeSnapshot } from '../data_acceptance_20261016/native_reader/reader';
import { json, nativeRecord, projectSnapshot } from '../data_acceptance_20261016/phone/projection';
import { canonicalProjection, compareProjectedStates, sha, type NativeAction } from '../../tools/phone_training_hard/verification/project_strict';
import type { GameState } from '../../src/game/types';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
interface Parent { parentId: string; attemptId: string; directory: string; map: string; seed: number; actions: number; files: Record<string, { sha256: string }> }
const load = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
function save(p: string, value: unknown) {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p + '.tmp', JSON.stringify(value, null, 2) + '\n'); renameSync(p + '.tmp', p);
}

// 解压状态流只保留当前帧和上游小块；不把整局状态展开到内存。
async function* frames(file: string) {
  const source = createReadStream(file), unzip = createGunzip();
  source.on('error', error => unzip.destroy(error)); source.pipe(unzip);
  let pending = Buffer.alloc(0), size: number | null = null;
  try {
    for await (const chunk of unzip) {
      pending = Buffer.concat([pending, chunk]);
      while (true) {
        if (size === null) {
          if (pending.length < 4) break;
          size = pending.readInt32BE(0); pending = pending.subarray(4);
          if (size <= 0 || size > 67108864) throw Error('状态帧长度无效');
        }
        if (pending.length < size) break;
        const frame = Buffer.from(pending.subarray(0, size)); pending = pending.subarray(size); size = null;
        yield frame;
      }
    }
    if (size !== null || pending.length) throw Error('状态流截断');
  } finally { source.destroy(); unzip.destroy(); }
}

export async function verify(p: Parent, plan: { starts: { map: string; state: GameState }[] }) {
  const progress = { macrosChecked: 0, atomicActions: 0, stage: 'input', macroIndex: -1 };
  const base = { schema: 'hard-production-project-strict-v1', parentId: p.parentId, attemptId: p.attemptId,
    projectStrictVerified: false, initialPlanMatched: false, forced: false, validationBypassed: false,
    skippedActions: 0, replacedActions: 0, ambiguousRecruitAllowed: false, verifierSha256: sha(readFileSync(new URL(import.meta.url))),
    sourceArtifactHashes: Object.fromEntries(Object.entries(p.files).map(([k,v]) => [k,v.sha256])),
    pathCounts: { hard_js_primary: 0, hard_java_fallback: 0 }, progress };
  try {
    const input = (name: string) => {
      const bytes = readFileSync(path.join(p.directory, name));
      if (sha(bytes) !== p.files[name].sha256) throw Error('冻结输入变化：' + name);
      return bytes;
    };
    const configBytes = input('config.bin'), config = readNativeConfig(configBytes);
    const result = JSON.parse(input('result.json').toString('utf8'));
    for (const key of ['parentId', 'attemptId', 'map', 'seed', 'actions'] as const) if (result[key] !== p[key]) throw Error('结果身份不符：' + key);
    if (!config || config.e !== BigInt(p.seed) || config.f !== 'SD') throw Error('配置seed或模式不符');
    const initialBytes = input('initial.bin'), finalBytes = input('final.bin');
    const initial = readNativeSnapshot(initialBytes), final = readNativeSnapshot(finalBytes);
    const initialState = projectSnapshot(initial, configBytes, p.map);
    const planned = plan.starts.find(s => s.map === p.map);
    if (!planned) throw Error('冻结开局缺失');
    progress.stage = 'initial_plan'; compareProjectedStates(initialState, planned.state, '原生初态与冻结计划不同');
    base.initialPlanMatched = true;
    const raw = gunzipSync(input('actions.jsonl.gz'), { maxOutputLength: 33554432 }).toString('utf8');
    const actions: NativeAction[] = raw.trim().split('\n').map(line => JSON.parse(line));
    if (actions.length !== p.actions || !actions.length || actions.length > 20000) throw Error('动作数无效');
    for (const [i,row] of actions.entries()) {
      if (row.parentId !== p.parentId || row.attemptId !== p.attemptId || row.index !== i || row.ai_seed !== p.seed+i*104729) throw Error('动作身份或Java seed合同不符：' + i);
      if (row.path !== 'hard_js_primary' && row.path !== 'hard_java_fallback') throw Error('未知来源路径：' + i);
      base.pathCounts[row.path]++;
      if (!row.fields || Object.keys(row.fields).sort().join('') !== 'abcdefghij' || ![...'abcdefghi'].every(k => Number.isInteger(row.fields[k]))) throw Error('动作完整字段无效：'+i);
    }
    const records = actions.map(a => nativeRecord(a.fields));
    const engine = new GameEngine(initialState, { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true });
    compareProjectedStates(engine.getState(), initialState, '构造器改变初态');
    const iterator = frames(path.join(p.directory, 'states.bin.gz'));
    try {
      let before = await iterator.next();
      if (before.done || sha(before.value) !== sha(initialBytes)) throw Error('initial与frame0完整快照字节不同');
      for (let i=0;i<records.length;i++) {
        progress.macroIndex=i; progress.stage='before';
        if (before.done) throw Error('缺少动作前态');
        compareProjectedStates(engine.getState(), projectSnapshot(readNativeSnapshot(before.value),configBytes,p.map), `第${i}步前态`);
        const expanded = expandApkReplayRecordToProjectActions(records[i], engine.getState(), createRecordExpansionOptions(records,i,{
          allowAmbiguousRecruitDeployFirstMatch:false,
          onNotice: notice => { throw Error('严格拒绝跳过/替换/歧义：'+json(notice)); },
        }));
        if (!expanded.length) throw Error('没有可执行原子动作：'+i);
        progress.stage='action';
        for (const action of expanded) {
          const state=engine.getState(), code=encodeAction(action);
          if (engine.isTerminal() || !getLegalActions(state,state.currentPlayer).some(a=>encodeAction(a)===code)) throw Error(`第${i}步不在权威合法集合：${code}`);
          const stepped=engine.step(action);
          if (stepped.info.includes('非法动作') || stepped.info==='Game already ended') throw Error('执行拒绝：'+stepped.info);
          progress.atomicActions++;
        }
        const after=await iterator.next();
        if (i+1<records.length && after.done) throw Error('状态流提前结束');
        if (i+1===records.length && !after.done) throw Error('存在额外状态帧');
        progress.stage='after';
        compareProjectedStates(engine.getState(),projectSnapshot(after.done?final:readNativeSnapshot(after.value),configBytes,p.map),`第${i}步后态`);
        progress.macrosChecked++; before=after;
      }
    } finally { await iterator.return(undefined); }
    progress.stage='final';
    const expectedFinal=projectSnapshot(final,configBytes,p.map);
    compareProjectedStates(engine.getState(),expectedFinal,'最终态');
    const players=final.components.e;
    if (!players?.i || !players.k || result.winnerMask!==players.h || result.naturalEnd!==(players.h>=0)) throw Error('原生自然终态合同不符');
    const survivors=players.i.flatMap((type,i)=>type!==0&&type!==5?[i]:[]), alliances=[...new Set(survivors.map(i=>players.k![i]))];
    const reliable=players.h>=0&&alliances.length===1&&alliances[0]===players.h&&!result.truncationReason;
    if (result.naturalEnd&&!reliable) throw Error('自然赢家与唯一存活联盟不符');
    progress.stage='complete';
    return {...base,projectStrictVerified:true,reliableNaturalOutcome:reliable,winnerAlliance:players.h,survivorTeams:survivors,
      initialProjectionSha256:sha(json(canonicalProjection(initialState))),finalProjectionSha256:sha(json(canonicalProjection(expectedFinal))),
      coverage:{allBeforeAfterStates:true,projectedLegalSets:true,nativeCandidateOracle:false,nativeFullSnapshotReplayRequiredSeparately:true}};
  } catch(error) { return {...base,error:String(error)}; }
}

async function main() {
  if(existsSync(path.join(here,'USER_STOP_RECEIPT.json')))throw Error('用户已停止本轮重放，不允许自动继续。');
  const manifest=load(path.join(here,'SOURCE_MANIFEST.json'));
  if(sha(readFileSync(manifest.planPath))!==manifest.planSha256) throw Error('冻结计划变化');
  const plan=load(manifest.planPath), mode=process.argv[2]||'smoke';
  const shard=Number(process.argv[3]||0), shards=Number(process.argv[4]||1);
  if(!Number.isInteger(shard)||!Number.isInteger(shards)||shard<0||shard>=shards||shards>16)throw Error('分片参数无效');
  const parents:Parent[]=(mode==='all'?manifest.parents:load(path.join(here,'SMOKE.json'))).filter((_:Parent,i:number)=>i%shards===shard);
  let done=0,passed=0;
  for(const p of parents){
    const target=path.join(here,'project',p.parentId+'.json');
    const report=existsSync(target)?load(target):await verify(p,plan);
    if(!existsSync(target)) save(target,report);
    done++;if(report.projectStrictVerified)passed++;
    if(mode!=='all'||done%100===0) console.log(JSON.stringify({mode,done,passed,parentId:p.parentId,error:report.error,progress:report.progress}));
  }
  save(path.join(here,`PROJECT_${mode.toUpperCase()}_${shard}OF${shards}_SUMMARY.json`),{done,passed,failed:done-passed,trainingStarted:false});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error);process.exitCode=1;});
