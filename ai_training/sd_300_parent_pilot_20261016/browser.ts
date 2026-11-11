import { check } from './check_shared';
import { gradientCheck } from './check_gradient';
async function lines(name: string) {
  const response = await fetch('/' + name);
  const text = await new Response(response.body!.pipeThrough(new DecompressionStream('gzip'))).text();
  return text.trim().split('\n').map(x => JSON.parse(x));
}
async function main() {
  try {
    const data = await lines('encoded.jsonl.gz'), schema = await (await fetch('/schema.json')).json(), initial = await (await fetch('/initial.json')).json();
    const result = check(await lines('witnesses.jsonl.gz'), data, await lines('reference.jsonl.gz'), schema, initial);
    const gradient = gradientCheck(data[0], schema, initial, await (await fetch('/gradient.json')).json());
    await fetch('/complete', { method: 'POST', body: JSON.stringify({ ...result, gradient, userAgent: navigator.userAgent, browserPassed: true }) });
    document.body.textContent = '浏览器一致性验收通过';
  } catch (e) { await fetch('/complete', { method: 'POST', body: JSON.stringify({ browserPassed: false, error: String(e) }) }); }
}
main();
