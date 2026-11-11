import { augment } from './spatial';
import { forward } from './model';
async function lines(n: string) { const r = await fetch('/' + n); return (await new Response(r.body!.pipeThrough(new DecompressionStream('gzip'))).text()).trim().split('\n').map(v => JSON.parse(v)); }
async function main() {
  try {
    const model = await (await fetch('/candidate.json')).json(), base = await lines('probe-base.jsonl.gz'), refs = await lines('trained-reference.jsonl.gz');
    if (base.length !== 1024 || refs.length !== 1024) throw Error('探针数量不符');
    let logitsMaxError = 0, valueMaxError = 0, candidates = 0;
    for (let i = 0; i < base.length; i++) {
      const actual = forward(augment(base[i], model.schema), model.schema, model.weights), expected = refs[i];
      if (actual.best !== expected.best || actual.logits.length !== expected.logits.length) throw Error('训练后候选或argmax不一致');
      actual.logits.forEach((z, j) => { logitsMaxError = Math.max(logitsMaxError, Math.abs(z - expected.logits[j])); });
      valueMaxError = Math.max(valueMaxError, Math.abs(actual.value - expected.value)); candidates += actual.logits.length;
    }
    if (logitsMaxError > 1e-8 || valueMaxError > 1e-8) throw Error('训练后前向误差越界');
    await fetch('/complete', { method: 'POST', body: JSON.stringify({ passed: true, browserPassed: true, trainedCheckpointBrowserPassed: true, rows: 1024, candidates, logitsMaxError, valueMaxError, bestEpoch: model.bestEpoch, stableArgmaxAllEqual: true, optimizerUpdates: 0, userAgent: navigator.userAgent }) });
  } catch (e) { await fetch('/complete', { method: 'POST', body: JSON.stringify({ browserPassed: false, error: String(e) }) }); }
}
main();
