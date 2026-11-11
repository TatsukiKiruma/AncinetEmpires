"""比较原版与困难补丁的 DEX 指令，保留可复核的本地静态证据。"""

import difflib
import hashlib
import json
from pathlib import Path
import zipfile

from loguru import logger

logger.remove()
from androguard.core.dex import DEX
from androguard.core.analysis.analysis import Analysis
from androguard.decompiler.decompiler import DecompilerDAD

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'deliverables/original_apk_hard_20261021/static'
ORIGINAL = ROOT / 'APK/aer-release-4.2.5.1.apk'
PATCH = Path(r'C:\Users\SHIINA\Downloads\aer-4.2.5.1-patch.apk.1')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def instructions(method):
    return [f'{i.get_name()} {i.get_output()}' for i in method.get_instructions()]


def inventory(apk):
    data = apk.read_bytes()
    archive = zipfile.ZipFile(apk)
    dex_bytes = archive.read('classes.dex')
    dex = DEX(dex_bytes)
    methods = {}
    for cls in dex.get_classes():
        for method in cls.get_methods():
            key = f'{cls.get_name()}->{method.get_name()}{method.get_descriptor()}'
            methods[key] = instructions(method)
    return dex, methods, {
        'path': str(apk), 'sha256': digest(data), 'dexSha256': digest(dex_bytes),
        'classes': len(list(dex.get_classes())), 'methods': len(methods),
        'members': {name: digest(archive.read(name)) for name in archive.namelist()},
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    original_dex, before, original_meta = inventory(ORIGINAL)
    patch_dex, after, patch_meta = inventory(PATCH)
    added = sorted(after.keys() - before.keys())
    removed = sorted(before.keys() - after.keys())
    changed = sorted(key for key in before.keys() & after.keys() if before[key] != after[key])
    report = {
        'evidenceType': '本地 Androguard 静态 DEX 指令分析，非 REA Evidence、非 APK 运行轨迹',
        'original': original_meta, 'patch': patch_meta,
        'addedMethods': added, 'removedMethods': removed, 'changedMethods': changed,
        'changedMembers': sorted(name for name in original_meta['members'].keys() & patch_meta['members'].keys()
                                 if original_meta['members'][name] != patch_meta['members'][name]),
        'addedMembers': sorted(patch_meta['members'].keys() - original_meta['members'].keys()),
        'removedMembers': sorted(original_meta['members'].keys() - patch_meta['members'].keys()),
    }
    (OUT / 'inventory.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    diffs = []
    for key in changed:
        diffs.extend(difflib.unified_diff(before[key], after[key], fromfile=f'原版 {key}', tofile=f'补丁 {key}', lineterm=''))
    (OUT / 'changed-methods.diff').write_text('\n'.join(diffs), encoding='utf-8')
    native_delta = {'addedMethods': [], 'changedMethods': [], 'unchangedMethods': []}
    native_diff = []
    for key, code in after.items():
        if not key.startswith('Lc/a/b/c/j/b;->'):
            continue
        original_key = key.replace('Lc/a/b/c/j/b;', 'Lc/a/b/c/j/a;')
        normalized = [line.replace('Lc/a/b/c/j/b', 'Lc/a/b/c/j/a') for line in code]
        if original_key not in before:
            native_delta['addedMethods'].append(key)
        elif before[original_key] != normalized:
            native_delta['changedMethods'].append(key)
            native_diff.extend(difflib.unified_diff(before[original_key], normalized,
                fromfile=original_key, tofile=key, lineterm=''))
        else:
            native_delta['unchangedMethods'].append(key)
    (OUT / 'native-hard-delta.json').write_text(json.dumps(native_delta, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'native-hard-methods.diff').write_text('\n'.join(native_diff), encoding='utf-8')
    for label, dex in [('original', original_dex), ('patch', patch_dex)]:
        analysis = Analysis(dex)
        analysis.create_xref()
        dex.set_decompiler(DecompilerDAD(dex, analysis))
        for cls in dex.get_classes():
            if cls.get_name().startswith('Lc/a/b/c/j/') or cls.get_name() in {
                'Laer/extension/AiStrategyFactory;', 'Laer/extension/AiSelection;',
                'Laer/extension/FeatureGate;', 'Laer/extension/ResourcePackHardAi;',
                'Laer/extension/ResourcePackHardAi$1;', 'Laer/extension/ResourcePackHardAi$2;',
            }:
                name = cls.get_name().split('/')[-1].removesuffix(';')
                lines = []
                for method in cls.get_methods():
                    lines.append(f'\n{method.get_name()}{method.get_descriptor()}')
                    offset = 0
                    for instruction in method.get_instructions():
                        lines.append(f'{offset:04x}: {instruction.get_name()} {instruction.get_output()}')
                        offset += instruction.get_length()
                (OUT / f'{label}-{name}.dex.txt').write_text('\n'.join(lines), encoding='utf-8')
                try:
                    (OUT / f'{label}-{name}.dad.java').write_text(cls.get_source(), encoding='utf-8')
                except Exception as error:
                    (OUT / f'{label}-{name}.decompiler-error.txt').write_text(repr(error), encoding='utf-8')
    runtime = zipfile.ZipFile(PATCH).read('assets/hard-ai/runtime.html')
    (OUT / 'hard-ai-runtime.html').write_bytes(runtime)
    print(json.dumps({key: report[key] for key in ['addedMethods', 'removedMethods', 'changedMethods', 'changedMembers', 'addedMembers', 'removedMembers']}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
