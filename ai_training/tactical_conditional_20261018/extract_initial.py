"""仅抽取冻结80父局的原生初态与config；不复制states或动作大文件。"""
import json
import hashlib
from pathlib import Path
import tarfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PHONE = Path('C:/Users/SHIINA/.codex/visualizations/2026/10/18/01a14c51-a6eb-7493-800e-4df86d9f18d7/phone-ab')
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
selection = read(PHONE / 'selection.json')
assert len(selection['parents']) == 80
groups = {}
for parent in selection['parents']:
    assert len(parent['segments']) == 1
    ident = parent['parentId']
    receipt = read(PHONE / 'release-pilot/receipts' / (ident + '.json'))
    groups.setdefault(receipt['archive'], {})[ident] = receipt
manifest = []
for archive, group in groups.items():
    pending = set(group)
    with tarfile.open(archive, 'r|gz') as tar:
        for member in tar:
            ident, _, name = member.name.removeprefix('./').partition('/')
            if ident in pending and name in ('initial.bin', 'config.bin') and member.isfile():
                target = HERE / 'initial-native' / ident / name
                target.parent.mkdir(parents=True, exist_ok=True)
                data = tar.extractfile(member).read()
                digest = hashlib.sha256(data).hexdigest()
                assert digest == group[ident]['initialHash' if name == 'initial.bin' else 'configHash']
                if target.exists():
                    assert target.read_bytes() == data
                else:
                    target.write_bytes(data)
                manifest.append(dict(path=str(target.relative_to(HERE)), sha256=digest, bytes=len(data)))
                if all((target.parent / n).exists() for n in ('initial.bin', 'config.bin')):
                    pending.remove(ident)
            if not pending:
                break
    assert not pending
    print(json.dumps(dict(archive=Path(archive).name, parents=len(group)), ensure_ascii=False), flush=True)
(HERE / 'initial-native-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
