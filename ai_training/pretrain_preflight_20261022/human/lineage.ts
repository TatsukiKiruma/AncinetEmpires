import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { digest } from '../../data_acceptance_20261016/replay/core';
import { ROOT, readJson, relative, sha, walk } from './io';

export interface Binding { host: string; apiIdHash: string; parentKey: string; metadataPath: string; metadataSha256: string }
export interface Response { sha256: string; bytes: number; paths: string[]; bindings: Binding[] }
export interface Fingerprint { initialStateHash: string; macroHashes: string[]; rawActionIdentity: string; fullContentIdentity: string }

export const validResponseName = (name: string, id: string, responseSha: string) =>
  [ `game_get_${sha(id).slice(0, 24)}.bin`, `game_get_${sha(id).slice(0, 24)}_${responseSha.slice(0, 24)}.bin` ].includes(name);

export function parentBinding(host: string, id: string, metadataPath: string, metadataSha256: string): Binding {
  const apiIdHash = sha(id);
  return { host: host.toLowerCase(), apiIdHash, parentKey: digest({ host: host.toLowerCase(), apiIdHash }), metadataPath, metadataSha256 };
}

export function macroRelation(left: Fingerprint, right: Fingerprint) {
  if (left.initialStateHash !== right.initialStateHash) return { relation: 'different_initial_state', commonMacroPrefix: 0 };
  let common = 0;
  while (common < Math.min(left.macroHashes.length, right.macroHashes.length) && left.macroHashes[common] === right.macroHashes[common]) common++;
  const relation = common === left.macroHashes.length && common === right.macroHashes.length ? 'identical_macro_stream'
    : common === left.macroHashes.length ? 'left_prefix_of_right'
      : common === right.macroHashes.length ? 'right_prefix_of_left' : 'divergent_macro_stream';
  return { relation, commonMacroPrefix: common };
}

export async function inventory(roots: string[], reportPaths?: string[]) {
  const files = (await Promise.all(roots.map(root => walk(root, name => /^game_get_.*\.bin$/i.test(name))))).flat().sort();
  const reports = reportPaths ?? (await Promise.all(roots.map(root => walk(root, name => name === 'download_report.json')))).flat().sort();
  const responses = new Map<string, Response>(), byPath = new Map<string, Response>();
  for (const file of files) {
    const bytes = await readFile(file), hash = sha(bytes), old = responses.get(hash);
    const response = old ?? { sha256: hash, bytes: bytes.length, paths: [], bindings: [] };
    response.paths.push(relative(file)); responses.set(hash, response); byPath.set(path.resolve(file), response);
  }
  const reportIdentities: Array<{ path: string; sha256: string; downloads: number; host: string | null }> = [];
  const invalidBindings: Array<{ report: string; file: string | null; reason: string }> = [];
  for (const file of reports) {
    const raw = await readFile(file), metadataSha256 = sha(raw), report = await readJson(file);
    reportIdentities.push({ path: relative(file), sha256: metadataSha256, downloads: report.downloads?.length ?? 0, host: report.host ?? null });
    for (const entry of report.downloads ?? []) {
      const source = typeof entry.file === 'string' ? path.resolve(path.dirname(file), entry.file) : '';
      const response = byPath.get(source);
      const valid = typeof report.host === 'string' && typeof entry.id === 'string' && typeof entry.sha256 === 'string'
        && validResponseName(entry.file, entry.id, entry.sha256)
        && response?.sha256 === entry.sha256 && response.bytes === entry.bytes;
      if (!valid) { invalidBindings.push({ report: relative(file), file: entry.file ?? null, reason: 'API ID、文件命名、实存响应SHA或字节数核对失败' }); continue; }
      const binding = parentBinding(report.host, entry.id, relative(file), metadataSha256);
      if (!response.bindings.some(b => b.parentKey === binding.parentKey && b.metadataPath === binding.metadataPath)) response.bindings.push(binding);
    }
  }
  return { files: files.length, responses: [...responses.values()], reports: reportIdentities, invalidBindings,
    identity: digest({ responses: [...responses.values()], reports: reportIdentities }) };
}

export function historicalRelations(response: Response, history: Response[]) {
  return {
    exactResponse: history.filter(old => old.sha256 === response.sha256).map(old => old.sha256),
    sameHostApiParent: history.filter(old => old.bindings.some(b => response.bindings.some(n => n.parentKey === b.parentKey))).map(old => old.sha256),
    // 同一API标识跨域名也保守隔离，防止迁移服务器后重复计数。
    sameApiIdAcrossHosts: history.filter(old => old.bindings.some(b => response.bindings.some(n => n.apiIdHash === b.apiIdHash && n.host !== b.host))).map(old => old.sha256)
  };
}

export const historicalRoots = () => ['captures/cloud', 'captures/mitm_replay'].map(name => path.join(ROOT, name));
