import { performance } from 'node:perf_hooks';
import { save } from './io';
const results=[];
for(const [rows,input,output] of [[105,128,384],[11025,16,16],[1024,306,48],[105,128,256]]){
const x=Float32Array.from({length:rows*input},(_,i)=>Math.sin(i));
for(const block of [1,2,4,8,16]){
const w=Float32Array.from({length:input*output},(_,i)=>Math.cos(i));
const vars=Array.from({length:block},(_,i)=>`s${i}`);
const fn=new Function('x','w',`const y=new Float32Array(${rows*output});for(let r=0;r<${rows};r++){for(let o=0;o<${output};o+=${block}){let ${vars.map(v=>v+'=0').join(',')};let wi=o*${input};for(let k=0;k<${input};k++,wi+=${block}){const v=x[r*${input}+k];${vars.map((v,i)=>`${v}+=v*w[wi+${i}];`).join('')}}${vars.map((v,i)=>`y[r*${output}+o+${i}]=${v};`).join('')}}}return y`);
for(let i=0;i<30;i++)fn(x,w);
const start=performance.now();for(let i=0;i<50;i++)fn(x,w);
results.push({rows,input,output,block,ms:(performance.now()-start)/50});
}
}
save('kernel-bench.json',results);console.log(JSON.stringify(results));
