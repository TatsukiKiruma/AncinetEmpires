import { check } from './check_shared';
async function lines(name: string) {
  const response = await fetch('/' + name);
  const text = await new Response(response.body!.pipeThrough(new DecompressionStream('gzip'))).text();
  return text.trim().split('\n').map(x => JSON.parse(x));
}
async function main() {
  try {
    const candidate = await (await fetch('/candidate.json')).json();
    const result = check(await lines('witnesses.jsonl.gz'), await lines('encoded.jsonl.gz'), await lines('trained-reference.jsonl.gz'), candidate.schema, candidate.weights);
    await fetch('/complete', { method: 'POST', body: JSON.stringify({ ...result, userAgent: navigator.userAgent, trainedCheckpointBrowserPassed: true }) });
  } catch (e) { await fetch('/complete', { method: 'POST', body: JSON.stringify({ trainedCheckpointBrowserPassed: false, error: String(e) }) }); }
}
main();
