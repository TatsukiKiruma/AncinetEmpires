import fs from 'node:fs';
import assert from 'node:assert/strict';
import { optimizeTilePackets } from './tile_observation';

/** 仅替换同源观察器的分配方式，完整保存变换后的源码供审计。 */
export function optimizeObservation(source:string){
    const original="const push = (kind: string, data: unknown, group: number) => { const i = tokens.length; tokens.push({ kind, ...flatten(data) }); groups.push(group); return i; };";
    assert.equal(source.split(original).length,2,'观察器源码已改变，拒绝猜测替换');
    const replacement=`const push = (kind: string, data: unknown, group: number) => {
    const finite = phoneFiniteObservation(data);
    const key = kind + '|' + JSON.stringify(data);
    let token = finite ? phoneObservationCache.get(key) : undefined;
    if (!token) {
      token = Object.freeze({ kind, ...flatten(data) });
      if (finite) { if (phoneObservationCache.size >= 16000) phoneObservationCache.clear(); phoneObservationCache.set(key, token); }
    }
    const i = tokens.length; tokens.push(token); groups.push(group); return i;
  };`;
    return source.replace(original,replacement)+`\n// 观察记录只读共享；身份包含归属重映射后的全部模型可见字段。\nconst phoneObservationCache = new Map<string, RecordToken>();
function phoneFiniteObservation(value:any):boolean{
  if(typeof value==='number')return Number.isFinite(value);
  if(!value||typeof value!=='object')return true;
  for(const key of Object.keys(value))if(!phoneFiniteObservation(value[key]))return false;
  return true;
}\n`;
}
export function optimizeProjection(source:string){
    const original='const copy = structuredClone(state), rules = copy.rules!';
    assert.equal(source.split(original).length,2,'旧schema投影源码已改变');
    return source.replace(original,'const copy = { ...state, rules: structuredClone(state.rules) }, rules = copy.rules!');
}
export function optimizationPlugin(repo:string,target:string,tilePackets=false){
    return {name:'手机同源观察分配优化',setup(builder:any){
        builder.onLoad({filter:/[\\/]src[\\/]ai_runtime[\\/]sd_v1[\\/]observation\.ts$/},(args:any)=>{
            let contents=optimizeObservation(fs.readFileSync(args.path,'utf8'));
            if(tilePackets)contents=optimizeTilePackets(contents,repo+'/ai_training/tactical_exit_20261019/phone/cow_geometry.ts');
            fs.writeFileSync(target+'/observation.optimized.ts.snapshot',contents,{flag:'wx'});
            return {contents,loader:'ts',resolveDir:repo+'/src/ai_runtime/sd_v1'};
        });
        builder.onLoad({filter:/[\\/]tactical_scale_20261018[\\/]encoding\.ts$/},(args:any)=>{
            const contents=optimizeProjection(fs.readFileSync(args.path,'utf8'));
            fs.writeFileSync(target+'/projection.optimized.ts.snapshot',contents,{flag:'wx'});
            return {contents,loader:'ts',resolveDir:repo+'/ai_training/tactical_scale_20261018'};
        });
    }};
}
