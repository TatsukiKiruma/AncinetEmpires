import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const once=(source:string,old:string,next:string)=>{assert.equal(source.split(old).length,2,'Worker接入点变化：'+old.slice(0,70));return source.replace(old,next);};

export function parallelRuntime(source:string){
    source=once(source,'export function decide(','export async function decide(');
    source=once(source,'const result=chooseBounded(engine,legal,model','const result=await chooseBounded(engine,legal,model');
    source=once(source,'export function decisionFixture(','export async function decisionFixture(');
    source=once(source,'const selected=decide(','const selected=await decide(');
    source=once(source,'JSON.stringify(decisionFixture(fixture.state,config.models[fixture.arm],config.old,fixture.arm))','JSON.stringify(await decisionFixture(fixture.state,config.models[fixture.arm],config.old,fixture.arm))');
    source=once(source,'const result=chooseBounded(borrowedEngine(engine),','const result=await chooseBounded(borrowedEngine(engine),');
    source=once(source,"side==='model'?decide(","side==='model'?await decide(");
    return source;
}
export function parallelParity(source:string){
    source=once(source,'export function collect(','export async function collect(');
    source=once(source,'root=infer(','root=await infer(');
    source=once(source,';ai.getAction(', ';await ai.getAction(');
    return source;
}
export function parallelPlugin(repo:string,target:string){
    const helper=path.join(repo,'ai_training/tactical_exit_20261019/phone/parallel_pool.ts');
    return {name:'手机单局独立计算Worker分担',setup(builder:any){
        const transforms:[RegExp,(source:string)=>string,string][]=[
            [/[\\/]tactical_exit_20261019[\\/]encode\.ts$/,source=>{
                source=once(source,'export function encodePolicy(','export async function encodePolicy(');
                source=once(source,'features=extractFeatures(engine,actions)','features=await parallelFeatures(engine,actions)');
                source=once(source,'export function encodeEngine(','export async function encodeEngine(');
                source=once(source,'const x=encodePolicy(','const x=await encodePolicy(');
                return `import {parallelFeatures} from ${JSON.stringify(helper)};\n`+source;
            },'encode.parallel.ts.snapshot'],
            [/[\\/]tactical_exit_20261019[\\/]policy_runtime\.ts$/,source=>{
                source=once(source,'export function infer(','export async function infer(');
                source=once(source,'const x=encodePolicy(','const x=await encodePolicy(');
                return once(source,'ReturnType<typeof infer>','Awaited<ReturnType<typeof infer>>');
            },'policy.parallel.ts.snapshot'],
            [/[\\/]tactical_exit_20261019[\\/]search\.ts$/,source=>{
                source=once(source,'export function chooseBounded(','export async function chooseBounded(');
                source=once(source,',action=ai.getAction(',',action=await ai.getAction(');
                source=once(source,'const root=infer(','const root=await infer(');
                return once(source,'const action=ai.getAction(','const action=await ai.getAction(');
            },'search.parallel.ts.snapshot'],
            [/[\\/]tactical_exit_20261019[\\/]model_battle_search_ai\.ts$/,source=>{
                source=once(source,'    public getAction(','    public async getAction(');
                source=once(source,'const root=prepared??infer(','const root=prepared??await infer(');
                const original='const evaluate=(a:Action,i:number)=>{const v=this.evaluateCandidate(engine,player,a,i);';
                const replacement=`let preparedEvaluations=await parallelEvaluations(engine,player,[{action:selected,index:primaryIndex}],this.model,this.oldSchema,this.options);
        const evaluate=(a:Action,i:number)=>{const v=preparedEvaluations.get(i);if(!v)throw Error('Worker缺少原根候选:'+i);this.nodes+=v.nodes;`;
                source=once(source,original,replacement);
                source=once(source,'        for(const i of indexes){if(i!==primaryIndex)traces.push(evaluate(root.x.actions[i],i));}',`        preparedEvaluations=await parallelEvaluations(engine,player,indexes.filter(i=>i!==primaryIndex).map(index=>({index,action:root.x.actions[index]})),this.model,this.oldSchema,this.options);
        for(const i of indexes){if(i!==primaryIndex)traces.push(evaluate(root.x.actions[i],i));}`);
                return `import {parallelEvaluations} from ${JSON.stringify(helper)};\n`+source;
            },'bounded-search.parallel.ts.snapshot'],
        ];
        for(const [filter,transform,name] of transforms)builder.onLoad({filter},(args:any)=>{
            const contents=transform(fs.readFileSync(args.path,'utf8').replace(/\r\n/g,'\n'));
            fs.writeFileSync(path.join(target,name),contents,{flag:'wx'});
            return {contents,loader:'ts',resolveDir:path.dirname(args.path)};
        });
    }};
}
