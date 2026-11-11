import path from 'node:path';
import { HERE, S3, read, save, fileSha } from './io';
const file = path.join(S3, 'OMNI_ARENA_DEV_PANEL.json'), panel = read(file);
const match = panel.matches.find((m: any) => m.slot === 12 && m.seat === 0);
await save(path.join(HERE, 'SMOKE_SUBSET.json'), { panelSha256: fileSha(file), ids: [match.id] }, true);
