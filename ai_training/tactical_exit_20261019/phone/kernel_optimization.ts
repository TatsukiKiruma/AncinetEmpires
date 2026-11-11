import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const once=(source:string,old:string,next:string)=>{assert.equal(source.split(old).length,2,'零输入内核接入点变化：'+old.slice(0,60));return source.replace(old,next);};

/** 冻结模型全部权重有限；省去零项，其他累加次序严格不变。 */
export function kernelPlugin(target:string){
    return {name:'Chrome87有限权重零输入内核',setup(builder:any){
        builder.onLoad({filter:/[\\/]tactical_exit_20261019[\\/]group_model\.ts$/},(args:any)=>{
            let contents=fs.readFileSync(args.path,'utf8').replace(/\r\n/g,'\n');
            contents=once(contents,'for (let i = 0; i < x.length; i++) for (let j = 0; j < h; j++) y[j] += x[i] * w[start + i * h + j];','for (let i = 0; i < x.length; i++) { const value=x[i];if(value===0)continue;const offset=start+i*h;for(let j=0;j<h;j++)y[j]+=value*w[offset+j]; }');
            contents=once(contents,'for (const [i,v] of token) for (let j=0;j<h;j++) e[j] += v*w[i*h+j];','for (const [i,v] of token) {if(v===0)continue;const offset=i*h;for(let j=0;j<h;j++)e[j]+=v*w[offset+j];}');
            contents=once(contents,'for(let i=0;i<h;i++)for(let j=0;j<h;j++)values[j]+=embedding[ref][i]*w[o.pw+(o.k+role*h+i)*h+j];','for(let i=0;i<h;i++){const value=embedding[ref][i];if(value===0)continue;const offset=o.pw+(o.k+role*h+i)*h;for(let j=0;j<h;j++)values[j]+=value*w[offset+j];}');
            contents=once(contents,'for(const [i,v] of candidate)for(let j=0;j<h;j++)projected[j]+=v*w[o.pw+(o.k+3*h+i)*h+j];','for(const [i,v] of candidate){if(v===0)continue;const offset=o.pw+(o.k+3*h+i)*h;for(let j=0;j<h;j++)projected[j]+=v*w[offset+j];}');
            fs.writeFileSync(path.join(target,'group-model.zero-input.ts.snapshot'),contents,{flag:'wx'});
            return {contents,loader:'ts',resolveDir:path.dirname(args.path)};
        });
        builder.onLoad({filter:/[\\/]tactical_value_search_20261018[\\/]value_model\.ts$/},(args:any)=>{
            let contents=fs.readFileSync(args.path,'utf8').replace(/\r\n/g,'\n');
            contents=once(contents,'for(let i=0;i<input.length;i++)for(let j=0;j<h;j++)z[j]+=input[i]*w[i*h+j];','for(let i=0;i<input.length;i++){const value=input[i];if(value===0)continue;const offset=i*h;for(let j=0;j<h;j++)z[j]+=value*w[offset+j];}');
            fs.writeFileSync(path.join(target,'value-model.zero-input.ts.snapshot'),contents,{flag:'wx'});
            return {contents,loader:'ts',resolveDir:path.dirname(args.path)};
        });
    }};
}
