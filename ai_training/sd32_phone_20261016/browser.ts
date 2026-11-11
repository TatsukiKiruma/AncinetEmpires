import { check } from './check_shared';
async function lines(n: string) { const r = await fetch('/' + n); return (await new Response(r.body!.pipeThrough(new DecompressionStream('gzip'))).text()).trim().split('\n').map(v => JSON.parse(v)); }
async function main() {
  try { const json = async (n: string) => (await fetch('/' + n)).json();
    const result = check(await lines('probe-base.jsonl.gz'), await lines('probe-encoded.jsonl.gz'), await lines('reference.jsonl.gz'), await json('schema.json'), await json('initial.json'), await json('reference-gradient.json'));
    await fetch('/complete', { method: 'POST', body: JSON.stringify({ ...result, browserPassed: true, userAgent: navigator.userAgent }) });
  } catch (e) { await fetch('/complete', { method: 'POST', body: JSON.stringify({ browserPassed: false, error: String(e) }) }); }
}
main();
