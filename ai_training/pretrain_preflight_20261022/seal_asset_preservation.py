"""保留原始严格回执，另外核对用户要求的CURRENT新增条目是唯一允许变化。"""
import hashlib
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
digest = lambda value: hashlib.sha256(value).hexdigest()


def main():
    manifest = json.loads((OUT / 'ASSET_MANIFEST.json').read_text(encoding='utf-8'))
    receipt = json.loads((OUT / 'asset-verification-after-cleanup.json').read_text(encoding='utf-8'))
    status = ROOT / 'ai_training/status/CURRENT.md'
    expected = next(item for item in manifest['files'] if item['path'] == str(status))
    content = status.read_bytes()
    begin = content.index(b'<!-- pretrain-preflight-20261022 -->')
    end = content.index(b'<!-- end-pretrain-preflight-20261022 -->') + len(b'<!-- end-pretrain-preflight-20261022 -->')
    # 本次唯一前插条目和额外空行去掉后，历史正文必须逐字节回到原摘要。
    original = content[:begin][:-2] + content[end:][1:]
    assert len(original) == expected['bytes'] and digest(original) == expected['sha256']
    before = OUT / 'CURRENT-before.md'
    if before.exists():
        assert before.read_bytes() == original
    else:
        before.write_bytes(original)
    assert receipt['changed'] == [str(status)] and not receipt['missing'] and not receipt['unsafe']
    result = {'passed': True, 'strictReceiptUnmodified': True,
              'strictReceiptSha256': digest((OUT / 'asset-verification-after-cleanup.json').read_bytes()),
              'manifestSha256': digest((OUT / 'ASSET_MANIFEST.json').read_bytes()),
              'retainedFilesChecked': receipt['checkedFiles'],
              'unchangedRetainedFiles': receipt['checkedFiles'] - 1,
              'authorizedDeletedFiles': receipt['allowedCleanedFiles'],
              'authorizedStatusUpdate': {'path': str(status), 'beforeSha256': expected['sha256'],
                  'afterSha256': digest(content), 'originalBytesPreservedAt': str(before),
                  'historicalContentByteIdenticalAfterRemovingOnlyTaskEntry': True},
              'unexpectedChanges': [],
              'note': '原始零变化strict回执为false，仅因用户明确要求更新CURRENT。其余模型、源码、证据文件均保持SHA；此收据单独解释这一授权变化。'}
    (OUT / 'ASSET_PRESERVATION_RESULT.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({key: result[key] for key in ['passed', 'retainedFilesChecked', 'unchangedRetainedFiles', 'authorizedDeletedFiles']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
