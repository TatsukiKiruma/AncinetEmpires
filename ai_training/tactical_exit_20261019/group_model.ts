import { offsets, stableBest, type Model, type ModelSchema } from '../tactical_scale_20261018/model';
import type { Encoded } from '../sd64x3_phone_20261016/model';

export function layout(schema: ModelSchema) {
    const o = offsets(schema), n2 = o.count, n3 = n2 + 2 * o.h, gw = n3 + 2 * o.h;
    return { ...o, n2, n3, gw, gb: gw + o.h, count: gw + o.h + 1 };
}
const relu = (a: number[]) => a.map(v => Math.max(0, v));
function linear(x: ArrayLike<number>, w: number[], start: number, bias: number, h: number) {
    const y = w.slice(bias, bias + h);
    for (let i = 0; i < x.length; i++) for (let j = 0; j < h; j++) y[j] += x[i] * w[start + i * h + j];
    return y;
}
function norm(x: number[], w: number[], start: number) {
    const h = x.length, mean = x.reduce((a,b)=>a+b,0) / h;
    const inverse = 1 / Math.sqrt(x.reduce((a,b)=>a+(b-mean)**2,0) / h + 1e-5);
    const normalized = x.map(v => (v - mean) * inverse);
    return { normalized, inverse, out: normalized.map((v,j)=>v*w[start+j]+w[start+h+j]) };
}

/** 显式组头对组内隐藏向量取均值；相同候选重复不会增加组分数。 */
export function forwardGroup(x: Encoded & { actionGroups: string[] }, model: Model, gradient = false) {
    const o = layout(model.schema), h = o.h, w = model.weights;
    if (!['sd-value-search-v4'].includes(model.schema.version) || w.length !== o.count) throw Error('分层模型形状错误');
    const embedding = x.tokens.map(token => {
        const e = w.slice(o.eb, o.pw);
        for (const [i,v] of token) for (let j=0;j<h;j++) e[j] += v*w[i*h+j];
        return relu(e);
    });
    const ctx = Array(o.k).fill(0), counts = [0,0,0,0];
    embedding.forEach((e,i)=>{ const g=x.groups[i]; counts[g]++; for(let j=0;j<h;j++)ctx[g*h+j]+=e[j]; });
    for(let g=0;g<4;g++){ for(let j=0;j<h;j++)ctx[g*h+j]/=Math.max(1,counts[g]);ctx[4*h+g]=counts[g]/1024; }
    const common=linear(ctx,w,o.pw,o.pb,h),roles=new Map<string,number[]>();
    const cache = x.candidates.map((candidate,a)=>{
        const input = gradient ? [...ctx, ...x.refs[a].flatMap(ref => ref < 0 ? Array(h).fill(0) : embedding[ref]), ...Array(o.c).fill(0)] : [];
        if(gradient)for(const [i,v] of candidate) input[o.k+3*h+i]=v;
        let projected:number[];
        if(gradient)projected=linear(input,w,o.pw,o.pb,h);
        else{
            projected=[...common];
            x.refs[a].forEach((ref,role)=>{
                if(ref<0)return;const key=`${role}:${ref}`;let values=roles.get(key);
                if(!values){values=Array(h).fill(0);for(let i=0;i<h;i++)for(let j=0;j<h;j++)values[j]+=embedding[ref][i]*w[o.pw+(o.k+role*h+i)*h+j];roles.set(key,values);}
                for(let j=0;j<h;j++)projected[j]+=values[j];
            });
            for(const [i,v] of candidate)for(let j=0;j<h;j++)projected[j]+=v*w[o.pw+(o.k+3*h+i)*h+j];
        }
        const first=relu(projected);
        const z2=linear(first,w,o.w2,o.b2,h), ln2=norm(z2,w,o.n2), second=relu(first.map((v,j)=>v+ln2.out[j]));
        const z3=linear(second,w,o.w3,o.b3,h), ln3=norm(z3,w,o.n3), third=relu(second.map((v,j)=>v+ln3.out[j]));
        return { input, first, second, third, ln2, ln3 };
    });
    const logits=cache.map(c=>c.third.reduce((s,v,j)=>s+v*w[o.ow+j],w[o.ob]));
    const names=[...new Set(x.actionGroups)], groupIndexes=x.actionGroups.map(g=>names.indexOf(g)), sizes=names.map(g=>x.actionGroups.filter(k=>k===g).length);
    const groupLogits=names.map((_,g)=>cache.reduce((s,c,i)=>s+(groupIndexes[i]===g?c.third.reduce((t,v,j)=>t+v*w[o.gw+j],0)/sizes[g]:0),w[o.gb]));
    const types=['wait','end_turn','attack','recruit','capture'];
    const groupType=(name:string)=>name.split('|')[1].startsWith('recruit_')?'recruit':name.split('|')[1];
    const biases=(model.schema as any).groupTypeBias??[0,0,0,0,0];
    names.forEach((name,g)=>{const t=types.indexOf(groupType(name));if(t>=0)groupLogits[g]+=biases[t];});
    const chosenGroup=stableBest(groupLogits), members=logits.map((_,i)=>i).filter(i=>groupIndexes[i]===chosenGroup);
    const best=members[stableBest(members.map(i=>logits[i]))];
    let value=w[o.vw+o.k];for(let i=0;i<o.k;i++)value+=ctx[i]*w[o.vw+i];
    const out={logits,groupLogits,groupNames:names,best,context:ctx,value:Math.tanh(value)};
    if(!gradient)return {...out,loss:0,gradient:[] as number[]};
    const target=(x as typeof x & {target:number}).target, targetGroup=groupIndexes[target];
    const softmax=(z:number[])=>{const m=Math.max(...z),p=z.map(v=>Math.exp(v-m)),s=p.reduce((a,b)=>a+b,0);return p.map(v=>v/s);};
    const gp=softmax(groupLogits), within=logits.map((v,i)=>groupIndexes[i]===targetGroup?v:-Infinity), wp=softmax(within);
    const loss=-Math.log(gp[targetGroup])-Math.log(wp[target]);gp[targetGroup]--;wp[target]--;
    const dw=Array(w.length).fill(0), dctx=Array(o.k).fill(0), de=embedding.map(()=>Array(h).fill(0));
    function backwardLinear(input:number[],dy:number[],start:number,bias:number){
        const dx=Array(input.length).fill(0);
        for(let j=0;j<h;j++)dw[bias+j]+=dy[j];
        for(let i=0;i<input.length;i++)for(let j=0;j<h;j++){dw[start+i*h+j]+=input[i]*dy[j];dx[i]+=w[start+i*h+j]*dy[j];}
        return dx;
    }
    function backwardNorm(ln:ReturnType<typeof norm>,dy:number[],start:number){
        const dz=dy.map((v,j)=>v*w[start+j]), mean=dz.reduce((a,b)=>a+b,0)/h, dot=dz.reduce((a,b,j)=>a+b*ln.normalized[j],0)/h;
        for(let j=0;j<h;j++){dw[start+j]+=dy[j]*ln.normalized[j];dw[start+h+j]+=dy[j];}
        return dz.map((v,j)=>ln.inverse*(v-mean-ln.normalized[j]*dot));
    }
    cache.forEach((c,a)=>{
        const groupDerivative=gp[groupIndexes[a]]/sizes[groupIndexes[a]], atomDerivative=wp[a];
        dw[o.gb]+=groupDerivative;dw[o.ob]+=atomDerivative;
        let dh=c.third.map((v,j)=>{dw[o.ow+j]+=atomDerivative*v;dw[o.gw+j]+=groupDerivative*v;return (atomDerivative*w[o.ow+j]+groupDerivative*w[o.gw+j])*Number(v>0);});
        const second=backwardLinear(c.second,backwardNorm(c.ln3,dh,o.n3),o.w3,o.b3).map((v,j)=>(v+dh[j])*Number(c.second[j]>0));
        dh=backwardLinear(c.first,backwardNorm(c.ln2,second,o.n2),o.w2,o.b2).map((v,j)=>(v+second[j])*Number(c.first[j]>0));
        const di=backwardLinear(c.input,dh,o.pw,o.pb);
        for(let i=0;i<o.k;i++)dctx[i]+=di[i];
        x.refs[a].forEach((ref,role)=>{if(ref>=0)for(let j=0;j<h;j++)de[ref][j]+=di[o.k+role*h+j];});
    });
    embedding.forEach((e,t)=>{
        const g=x.groups[t];
        for(let j=0;j<h;j++){
            const dz=(de[t][j]+dctx[g*h+j]/Math.max(1,counts[g]))*Number(e[j]>0);dw[o.eb+j]+=dz;
            for(const [i,v] of x.tokens[t])dw[i*h+j]+=v*dz;
        }
    });
    for(const type of types)dw.push(gp.reduce((sum,v,g)=>sum+(groupType(names[g])===type?v:0),0));
    return {...out,loss,gradient:dw};
}
