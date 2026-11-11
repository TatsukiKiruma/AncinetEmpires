"""只记录并行APK困难入口变更及可核对的前后版本，不修改任何GUI源文件。"""
import difflib
from run_league import DIR, ROOT, read, save, sha


def main():
    target = DIR / 'phase54-audit/v5-deep-r2/external-gui-change'
    assert not target.exists(), '既有外部变更证据不得覆盖'
    original = read(DIR / 'phase54-audit/historical-manifest.json')['protected']
    records = []
    changes = []
    for name in ['src/App.tsx', 'src/game/ai/neural_ai_adapter.ts']:
        source = ROOT / name
        current = source.read_bytes()
        text = current.decode('utf-8')
        if name.endswith('App.tsx'):
            before = ''.join(line for line in text.splitlines(keepends=True) if '<option value="original_apk_like_hard"' not in line)
        else:
            before = ''.join(line for line in text.splitlines(keepends=True) if not any(token in line for token in [
                'import { OriginalApkLikeHardAI }', " | 'original_apk_like_hard'", 'const originalApkLikeHardAis', '// 按队伍隔离 APK 脚本',
            ]))
            start = before.index("    if (policy === 'original_apk_like_hard')")
            end = before.index("    if (policy === 'original_apk_like')", start)
            before = before[:start] + before[end:]
        import hashlib
        assert hashlib.sha256(before.encode('utf-8')).hexdigest() == original[name], '外部改动范围已变化，不能套用当前差异证明'
        for version, content in [('before-reconstructed', before.encode('utf-8')), ('observed-current', current)]:
            path = target / version / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        changes.extend(difflib.unified_diff(before.splitlines(keepends=True), text.splitlines(keepends=True), fromfile='开工记录/' + name, tofile='并行困难入口/' + name))
        records.append(dict(path=name, originalSha256=original[name], observedSha256=sha(source), originalReconstructedExactly=True, observedLastWriteTimeUnix=source.stat().st_mtime))
    (target / 'changes.patch').write_text(''.join(changes), encoding='utf-8', newline='')
    save(target / 'receipt.json', dict(scope='仅取证，未写GUI源文件；本任务工具未执行这些入口修改，来源责任人待用户确认。原始红线SHA仍保留，未自动豁免保护门禁。', authorizationPending=True, records=records))
    print(dict(recorded=True, files=len(records), sourceFilesChangedByThisScript=False))


if __name__ == '__main__':
    main()
