import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';import {STAGE} from './supervisor.mjs';
// 仅白名单读取实际执行器与构建依赖，不遍历node_modules支持链接。
const require=createRequire(import.meta.url),p=require.resolve('esbuild/package.json');const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.writeFileSync(path.join(STAGE,'identity/node_runtime.json'),JSON.stringify({execPath:process.execPath,nodeBinarySha256:sha(process.execPath),versions:process.versions,esbuild:{packagePath:p,realPath:fs.realpathSync(p),version:JSON.parse(fs.readFileSync(p)).version,packageSha256:sha(p)}},null,2),{flag:'wx'});
