"""检查暂存文件的大小和不应上传的本机资产，不读取或输出密钥内容。"""
import pathlib
import re
import subprocess
import sys


def git(*args):
    return subprocess.check_output(['git', *args])


def main():
    names = list(filter(None, git('diff', '--cached', '--no-renames', '--name-only', '--diff-filter=ACM', '-z').decode('utf-8').split('\0')))
    # 一次读取对象大小与内容，避免每个文件启动多个 Git 子进程。
    request = ''.join(':' + name + '\n' for name in names).encode('utf-8')
    batch = subprocess.run(['git', 'cat-file', '--batch'], input=request, stdout=subprocess.PIPE, check=True).stdout
    offset = 0
    errors = []
    for name in names:
        path = pathlib.PurePosixPath(name)
        end = batch.index(b'\n', offset)
        size = int(batch[offset:end].split()[-1])
        content = batch[end + 1:end + 1 + size]
        offset = end + 2 + size
        if size > 10 * 1024 * 1024:
            errors.append((name, '超过普通 Git 单文件 10 MiB 管理上限，请使用独立资产归档'))
        if path.name.startswith('.env') and path.name != '.env.example':
            errors.append((name, '本机环境配置不得提交'))
        if any(part in {'node_modules', 'site-packages', 'rootfs', '.venv-rocm', '__pycache__'} for part in path.parts):
            errors.append((name, '依赖环境或缓存不得提交'))
        if name.startswith('ai_training/') and path.suffix in {'.pt', '.bin', '.f32', '.tar', '.zip', '.gz', '.whl', '.sqlite3', '.apk', '.dex'}:
            errors.append((name, '研究产物应留在独立归档'))
        if size <= 10 * 1024 * 1024 and path.suffix not in {'.png', '.bin'}:
            if re.search(rb'-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}', content):
                errors.append((name, '疑似凭据，请人工检查；未输出匹配内容'))
    for name, reason in errors:
        print(f'{name}: {reason}')
    print(f'检查 {len(names)} 个暂存文件，发现 {len(errors)} 个问题。')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
