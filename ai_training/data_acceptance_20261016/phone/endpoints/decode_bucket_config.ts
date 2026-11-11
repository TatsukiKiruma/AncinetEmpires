import readline from 'node:readline';
import crypto from 'node:crypto';
import { readNativeConfig } from '../../native_reader/reader';

for await (const line of readline.createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const request = JSON.parse(line);
  try {
    const bytes = Buffer.from(request.config, 'base64'), config = readNativeConfig(bytes);
    if (!config?.i || !config.j || !config.c?.d) throw Error('配置缺玩家或地图队伍数组');
    process.stdout.write(JSON.stringify({ id: request.id, ok: true, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), mode: config.f,
      sourceMapTeamIds: config.c.d, configuredTeamIds: config.i.flatMap((type, id) => type !== 0 && type !== 5 ? [id] : []),
      configTypes: config.i, configAlliances: config.j }) + '\n');
  } catch (error) { process.stdout.write(JSON.stringify({ id: request.id, ok: false, error: String(error) }) + '\n'); }
}
