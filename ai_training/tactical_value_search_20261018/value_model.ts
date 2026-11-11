export function valueLayout(input:number,hidden=64){const b=input*hidden,n=b+hidden,o=n+2*hidden;return {input,hidden,b,n,o,ob:o+hidden,count:o+hidden+1};}

/** 独立价值MLP及解析反向；策略上下文冻结，价值梯度只更新本头。 */
export function forwardValue(input:number[],weights:number[],target=0,gradient=false){
    const l=valueLayout(input.length),h=l.hidden,w=weights;
    const residual=w.length===l.count+6;if(w.length!==l.count&&!residual)throw Error('价值头形状不符');
    const z=w.slice(l.b,l.n);for(let i=0;i<input.length;i++)for(let j=0;j<h;j++)z[j]+=input[i]*w[i*h+j];
    const mean=z.reduce((a,b)=>a+b,0)/h,inverse=1/Math.sqrt(z.reduce((a,b)=>a+(b-mean)**2,0)/h+1e-5);
    const norm=z.map(v=>(v-mean)*inverse),a=norm.map((v,j)=>Math.max(0,v*w[l.n+j]+w[l.n+h+j]));
    const phase=input.slice(input.length-8,input.length-5),army=input.at(-1)!,skip=residual?[...phase.map(v=>v*army),...phase]:[];
    const logit=a.reduce((s,v,j)=>s+v*w[l.o+j],w[l.ob])+skip.reduce((s,v,j)=>s+v*w[l.count+j],0);
    const value=Math.tanh(logit),loss=(value-target)**2;
    const dw=gradient?Array(w.length).fill(0):[];
    if(gradient){
        const dv=2*(value-target)*(1-value*value);dw[l.ob]=dv;
        skip.forEach((v,j)=>dw[l.count+j]=dv*v);
        const dn=a.map((v,j)=>{dw[l.o+j]=dv*v;const d=dv*w[l.o+j]*Number(v>0);dw[l.n+j]=d*norm[j];dw[l.n+h+j]=d;return d*w[l.n+j];});
        const avg=dn.reduce((s,v)=>s+v,0)/h,dot=dn.reduce((s,v,j)=>s+v*norm[j],0)/h;
        const dz=dn.map((v,j)=>inverse*(v-avg-norm[j]*dot));
        for(let j=0;j<h;j++){dw[l.b+j]=dz[j];for(let i=0;i<input.length;i++)dw[i*h+j]=input[i]*dz[j];}
    }
    return {value,loss,gradient:dw};
}
