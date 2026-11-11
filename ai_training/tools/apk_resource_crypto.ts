// 兼容旧训练路径，公共规则工具只有主项目一份实现。
export * from '../../tools/apk_resource_crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = fileURLToPath(new URL('../../tools/apk_resource_crypto.ts', import.meta.url));
  process.argv[1] = target;
  await import(pathToFileURL(target).href + '?cli');
}
