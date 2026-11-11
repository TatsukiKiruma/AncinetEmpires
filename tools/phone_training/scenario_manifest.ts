import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readApkSkirmishTrainingMap } from '../../ai_training/tools/skirmish_training_runner';
import { getApkSkirmishTrainingScenarios } from '../../src/game/apk_skirmish';
import { APK_UNIT_CLASS_TO_ID } from '../../src/game/apk_compat';
import { createSdTrainingGameState, type SdTrainingPlanConfig } from '../../ai_training/tools/sd_training_state_generator';

// 按已讨论的3000局课程配额，以最大余数法分配1000局；复用历史场景生成器。
const cfg = JSON.parse(readFileSync('ai_training/training_configs/sd_training_plan_20260705.json', 'utf8')) as SdTrainingPlanConfig;
const quotas = [480,120,120,120,120,192,72,72,96,48,160,160,120,140,120,260,200,200,200];
const counts = quotas.map(n => Math.floor(n / 3));
const ranking = quotas.map((n,i)=>({i,remainder:n%3})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
const deficit=1000-counts.reduce((a,b)=>a+b,0);
for(let n=0;n<deficit;n++) counts[ranking[n].i]++;
const remaining=process.argv.includes('--remaining');
const outputDir=remaining?'captures/phone-compressed-2000-20261015':'captures/phone-storage-1000-20261015';
const scenarios = getApkSkirmishTrainingScenarios({modes:['SD']});
const jobs=[];
for(const [pi,plan] of cfg.plans.entries()) {
 const maps=cfg.mapNames.filter(m=>!plan.mapPlayerCounts||plan.mapPlayerCounts.includes(Number(m[1])));
 for(let n=remaining?counts[pi]:0;n<(remaining?quotas[pi]:counts[pi]);n++) {
  const mapName=maps[n%maps.length],seed=2026101500+pi*100000+n;
  const scenario=scenarios.find(s=>s.mapName===mapName)!;
  const map=await readApkSkirmishTrainingMap('APK/_analysis/unpack',scenario);
  const state=createSdTrainingGameState(map,scenario,cfg,plan,seed);
  const occupied=new Set<string>();
  // 旧建筑专项可能把队长放到已占用格；明确拒绝，不隐式吞掉单位。
  for(const u of state.units){const k=`${u.pos.x},${u.pos.y}`;if(occupied.has(k))throw new Error(`派生占位冲突 ${plan.id} ${mapName} ${seed} ${k}`);occupied.add(k);}
  const derived=plan.kind!=='normal'&&plan.kind!=='parameter_variant';
  jobs.push({id:`s${String(jobs.length+(remaining?1001:1)).padStart(4,'0')}`,map:mapName,seed,maxActions:20000,compressStreams:remaining,planId:plan.id,planKind:plan.kind,setup:plan.setup,
   state:derived?{turn:state.turn,currentPlayer:state.currentPlayer,players:state.players,units:state.units.map(u=>({...u,type:APK_UNIT_CLASS_TO_ID[u.unitClass]})),graves:state.graves,
    buildings:state.map.tiles.flatMap((row,y)=>row.flatMap((t,x)=>[8,9,10].includes(t.terrainId)?[{x,y,owner:t.ownerId??4094}]:[]))}:null});
 }
}
mkdirSync(outputDir,{recursive:true});
const path=outputDir+'/manifest.json';
if(remaining){const old=JSON.parse(readFileSync('captures/phone-storage-1000-20261015/manifest.json','utf8'));if(JSON.stringify(old.counts1000)!==JSON.stringify(counts))throw new Error('既有配额不一致');const oldSeeds=new Set(old.jobs.map((j:{seed:number})=>j.seed));if(jobs.some(j=>oldSeeds.has(j.seed)))throw new Error('种子与旧数据重复');}
writeFileSync(path,JSON.stringify({quotas3000:quotas,counts1000:counts,counts2000:quotas.map((q,i)=>q-counts[i]),plans:cfg.plans,jobs},null,2));
console.log(JSON.stringify({games:jobs.length,counts}));
