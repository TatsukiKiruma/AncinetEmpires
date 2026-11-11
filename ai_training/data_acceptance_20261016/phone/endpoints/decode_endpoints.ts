import readline from 'node:readline';
import crypto from 'node:crypto';
import { readNativeConfig, readNativeSnapshot } from '../../native_reader/reader';

const digest = (data: Uint8Array) => crypto.createHash('sha256').update(data).digest('hex');
const json = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v);
const configs = new Map<string, { bytes: Buffer; decoded: NonNullable<ReturnType<typeof readNativeConfig>> }>();
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  const request = JSON.parse(line);
  try {
    if (request.config) {
      const bytes = Buffer.from(request.config, 'base64'), decoded = readNativeConfig(bytes);
      if (!decoded || !decoded.i || !decoded.j) throw Error('配置或队伍数组为空');
      const prior = configs.get(request.parentId);
      if (prior && !prior.bytes.equals(bytes)) throw Error('同父局配置字节变化');
      configs.set(request.parentId, { bytes, decoded });
    }
    const config = configs.get(request.parentId);
    if (!config) throw Error('父配置尚未载入');
    const summarize = (base64: string) => {
      const bytes = Buffer.from(base64, 'base64'), snapshot = readNativeSnapshot(bytes), p = snapshot.components.e;
      if (!p || !p.i || !p.j || !p.k) throw Error('端点玩家数组为空');
      if (p.i.length !== 6 || p.j.length !== 6 || p.k.length !== 6) throw Error('玩家数组不是六队');
      const active = p.i.map((type, team) => ({ type, team })).filter(row => row.type !== 0 && row.type !== 5).map(row => ({ team: row.team, alliance: p.k![row.team] }));
      const aliveAlliances = [...new Set(active.map(row => row.alliance))].sort((a, b) => a - b);
      return {
        sha256: digest(bytes), bytes: bytes.length, header: [snapshot.header.a, snapshot.header.b],
        h: p.h, team: p.e, turn: p.f, round: p.g, types: p.i, originalTypes: p.j, alliances: p.k,
        active, aliveAlliances,
        naturalEndpointValid: p.h >= 0 ? aliveAlliances.length === 1 && aliveAlliances[0] === p.h : null,
        configOriginalTypesEqual: json(p.j) === json(config.decoded.i),
        configAlliancesEqual: json(p.k) === json(config.decoded.j),
        configDefinitionsEqual: json(snapshot.components.c) === json(config.decoded.b),
        configRulesEqual: json(p.c) === json(config.decoded.d),
        boardSha256: snapshot.raw.d === null ? null : digest(snapshot.raw.d),
        runtimeState: snapshot.components.f ? [snapshot.components.f.a, snapshot.components.f.b] : null,
      };
    };
    process.stdout.write(json({ id: request.id, ok: true, config: { sha256: digest(config.bytes), seed: config.decoded.e.toString(), types: config.decoded.i, alliances: config.decoded.j }, initial: summarize(request.initial), final: summarize(request.final) }) + '\n');
  } catch (error) {
    process.stdout.write(json({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) }) + '\n');
  }
}
