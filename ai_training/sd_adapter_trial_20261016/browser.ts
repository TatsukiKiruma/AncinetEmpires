import { check } from './check_shared';
async function lines(name: string) {
  const response = await fetch('/' + name);
  const text = await new Response(response.body!.pipeThrough(new DecompressionStream('gzip'))).text();
  return text.trim().split('\n').map(x => JSON.parse(x));
}
async function main() {
  try {
    const result = check(await lines('witnesses.jsonl.gz'), await lines('encoded.jsonl.gz'), await lines('reference.jsonl.gz'), await (await fetch('/schema.json')).json(), await (await fetch('/initial.json')).json());
    await fetch('/complete', { method: 'POST', body: JSON.stringify({ ...result, userAgent: navigator.userAgent, browserPassed: true }) });
    document.body.textContent = '浏览器一致性验收通过';
  } catch (e) { await fetch('/complete', { method: 'POST', body: JSON.stringify({ browserPassed: false, error: String(e) }) }); }
}
main();
