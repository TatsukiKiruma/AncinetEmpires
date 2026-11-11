import { forward, decode, type Decoder } from './model';
import { GameEngine } from '../../src/game/engine';
import { decodeAction } from '../../src/game/env';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { extractFeatures } from './complete_tactics';
import { observationState, encodeFeatures } from './encoding';

const target = document.getElementById('result')!;
try {
    const name = new URL(location.href).searchParams.get('model') ?? 'initial';
    if (!/^(initial|legacy|new|conditional|best)$/.test(name)) throw Error('模型名称非法');
    const load = async (path: string) => {
        const r = await fetch(path); if (!r.ok) throw Error('读取失败:'+path);
        const text = await r.text(), bytes = new TextEncoder().encode(text);
        const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
        return { data: JSON.parse(text), sha256 };
    };
    const [modelFile,inputFile,referenceFile,stateFile,oldSchemaFile] = await Promise.all([load(`model-${name}.json`),load('parity-inputs.json'),load(`python-parity-${name}.json`),load('browser-states.json'),load('old-schema.json')]);
    const model=modelFile.data,inputs=inputFile.data,reference=referenceFile.data,states=stateFile.data,oldSchema=oldSchemaFile.data;
    let maxLogitError = 0, maxValueError = 0, argmax = true, decoderParity = true;
    let encodingMismatches = 0;
    const started = performance.now();
    inputs.forEach((x: any,i: number) => {
        const item = states[i], engine = new GameEngine(item.state), actions = item.codes.map(decodeAction);
        const packet = observe(observationState(item.state),actions);
        const actualInput = encodeFeatures(packet,oldSchema,extractFeatures(engine,packet.codes.map(decodeAction)));
        for (const key of ['tokens','groups','candidates','refs','codes'] as const) if (JSON.stringify(actualInput[key])!==JSON.stringify(x[key])) encodingMismatches++;
        const actual = forward(actualInput,model), expected = reference.out[i];
        actual.logits.forEach((z,j) => maxLogitError = Math.max(maxLogitError,Math.abs(z-expected.logits[j])));
        maxValueError = Math.max(maxValueError,Math.abs(actual.value-expected.value));
        argmax &&= actual.best===expected.best;
        for(const decoder of ['direct','group_mass','group_max'] as Decoder[])decoderParity &&= decode(actual.logits,x.actionGroups,decoder)===expected.decoded[decoder];
    });
    const passed = maxLogitError<1e-8 && maxValueError<1e-8 && argmax && decoderParity && encodingMismatches===0;
    target.textContent = JSON.stringify({ passed,name,probes:inputs.length,maxLogitError,maxValueError,stableArgmax:argmax,decoderParity,encodingMismatches,rawStateFeaturesRecomputed:true,
        modelFileSha256:modelFile.sha256,inputFileSha256:inputFile.sha256,stateFileSha256:stateFile.sha256,ms:performance.now()-started,userAgent:navigator.userAgent },null,2);
    document.title = passed ? '浏览器前向一致性通过' : '浏览器前向一致性失败';
} catch (e) { target.textContent=JSON.stringify({passed:false,error:String(e)}); document.title='浏览器校验错误'; }
