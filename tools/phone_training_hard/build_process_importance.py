"""使用已有JRE和封存ECJ/dx离线编译定向保活辅助，不访问设备。"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent
DEPS = Path('C:/Users/SHIINA/.codex/visualizations/2026/10/17/01a14755-acbf-7251-be32-9616bde062c8/phone-posttraining/teacher-art/deps')
EXPECTED = {'ecj.jar': 'ac0ba5876eaf7ebb47749a0d1be179c51f194b9dd0b875d1c09e1b530f5a2db5',
            'dx.jar': '923302e666d76e126e4cdf7129318532b258b1a66e435b92ccc29e91a60357bf'}


def sha(path):
    with Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--java', default='C:/Program Files/Java/jre1.8.0_491/bin/java.exe')
    parser.add_argument('--deps', type=Path, default=DEPS)
    parser.add_argument('--output', type=Path, default=ROOT / 'process-importance.jar')
    parser.add_argument('--evidence-dir', type=Path, default=Path('ai_training/hard_native_1000_20261022/concurrency-20261022/importance-tools'))
    args = parser.parse_args()
    for name, digest in EXPECTED.items():
        if sha(args.deps / name) != digest:
            raise RuntimeError('封存编译依赖SHA不符：' + name)
    args.evidence_dir.mkdir(parents=True, exist_ok=True)
    source = ROOT / 'ProcessImportance.java'
    receipt = {'sourceSha256': sha(source), 'dependencies': EXPECTED, 'runtimeVerified': False, 'commands': []}
    with tempfile.TemporaryDirectory(prefix='importance-build-', dir=args.evidence_dir) as directory:
        work = Path(directory); classes = work / 'classes'; classes.mkdir(); dex = work / 'classes.dex'
        commands = [[args.java, '-Xmx256m', '-jar', str(args.deps / 'ecj.jar'), '-source', '1.6', '-target', '1.6', '-encoding', 'UTF-8', '-d', str(classes), str(source)],
                    [args.java, '-Xmx256m', '-cp', str(args.deps / 'dx.jar'), 'com.android.dx.command.Main', '--dex', '--output=' + str(dex), str(classes)]]
        for command in commands:
            p = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60)
            receipt['commands'].append({'command': command, 'returncode': p.returncode, 'stdout': p.stdout, 'stderr': p.stderr})
            if p.returncode:
                raise RuntimeError('编译失败：' + p.stdout + p.stderr)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(args.output, 'w', compression=zipfile.ZIP_STORED) as jar:
            info = zipfile.ZipInfo('classes.dex', (2026, 10, 22, 0, 0, 0)); info.external_attr = 0o100644 << 16
            jar.writestr(info, dex.read_bytes())
    receipt.update({'jar': str(args.output.resolve()), 'jarSha256': sha(args.output), 'bytes': args.output.stat().st_size})
    (args.evidence_dir / 'build-receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: receipt[k] for k in ('jar', 'jarSha256', 'sourceSha256', 'bytes')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
