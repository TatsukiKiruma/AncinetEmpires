import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const trainingRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(trainingRoot);

// 保留历史脚本的相对路径；这些链接只指向公共源代码、资源和依赖，不复制规则。
export function prepareTrainingWorkspace() {
  for (const name of ['src', 'APK', 'captures', 'node_modules']) {
    const target = path.join(repositoryRoot, name);
    const link = path.join(trainingRoot, name);
    if (!fs.existsSync(target)) continue;
    if (fs.existsSync(link)) {
      if (fs.realpathSync(link) !== fs.realpathSync(target)) throw new Error(`训练支持路径已被其他内容占用：${link}`);
    } else {
      fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    }
  }
  const evidence = path.join(trainingRoot, 'docs', 'apk-analysis');
  const publicEvidence = path.join(repositoryRoot, 'docs', 'apk-analysis');
  if (fs.existsSync(publicEvidence)) {
    if (fs.existsSync(evidence)) {
      if (fs.realpathSync(evidence) !== fs.realpathSync(publicEvidence)) throw new Error(`规则证据路径已被其他内容占用：${evidence}`);
    } else {
      fs.mkdirSync(path.dirname(evidence), {recursive: true});
      fs.symlinkSync(publicEvidence, evidence, process.platform === 'win32' ? 'junction' : 'dir');
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareTrainingWorkspace();
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--prepare') console.log('训练工作区已准备；未启动训练。');
  else {
    const result = spawnSync(command === 'node' ? process.execPath : command, args, {
      cwd: trainingRoot, stdio: 'inherit', shell: false,
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
}
