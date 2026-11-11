import { forward, decode, type Decoder, type Model } from './model';
import { read, save, hash } from './io';
const name = process.argv[2] ?? 'initial';
const model: Model = read('model-'+name+'.json');
const inputs = read('parity-inputs.json');
const out = inputs.map((x: any) => {
    const result=forward(x,model);
    return {...result,decoded:Object.fromEntries((['direct','group_mass','group_max'] as Decoder[]).map(d=>[d,decode(result.logits,x.actionGroups,d)]))};
});
save('ts-parity-'+name+'.json', { modelSha256: hash(model), inputSha256: hash(inputs), out });
console.log(JSON.stringify({ name, probes: out.length }));
