"""V17 收尾：把**字节完全相同**的数据集副本换成 NTFS 硬链接，释放磁盘但不丢任何字节。

背景：为了单因素对照，若干训练臂的 `*_trainval.jsonl` 是同一份数据的字节级副本
（B0_16k/B0_4b 复制 B0；B1c/B1d 复制 B1b；B1e_m 复制 B1e）。每个副本 0.5–1.2 GB，
本机剩余空间已经紧张。硬链接让这些路径仍然可读、SHA 不变、训练可复现，但不重复占空间。

安全前提（本脚本强制检查）：
  * 两个文件 SHA256 必须完全相同，否则**拒绝替换**并报错；
  * 只在同一卷内做硬链接；
  * 结果写进 `experiments/_data/hardlink_manifest.json` 供交接核对。
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DATA = REPO / "v17" / "out" / "v17_20260926_r2" / "experiments" / "_data"

PAIRS = [
    ("B0_trainval.jsonl", "B0_16k_trainval.jsonl"),
    ("B0_trainval.jsonl", "B0_4b_trainval.jsonl"),
    ("B1b_trainval.jsonl", "B1c_trainval.jsonl"),
    ("B1b_trainval.jsonl", "B1d_trainval.jsonl"),
    ("B1e_trainval.jsonl", "B1e_m_trainval.jsonl"),
]


def sha256(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            block = fh.read(chunk)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def main() -> int:
    manifest = []
    freed = 0
    for src_name, dst_name in PAIRS:
        src, dst = DATA / src_name, DATA / dst_name
        if not src.exists() or not dst.exists():
            print(f"SKIP {dst_name}: missing ({src.exists()=}, {dst.exists()=})")
            continue
        if os.stat(src).st_ino and os.stat(src).st_ino == os.stat(dst).st_ino and os.stat(src).st_dev == os.stat(dst).st_dev:
            print(f"SKIP {dst_name}: already the same file (hard link)")
            manifest.append({"src": src_name, "dst": dst_name, "status": "already-linked"})
            continue
        h_src, h_dst = sha256(src), sha256(dst)
        if h_src != h_dst:
            print(f"REFUSE {dst_name}: SHA differs ({h_src[:12]} != {h_dst[:12]})")
            manifest.append({"src": src_name, "dst": dst_name, "status": "refused-sha-differs"})
            continue
        size = dst.stat().st_size
        tmp = dst.with_suffix(dst.suffix + ".relink")
        if tmp.exists():
            tmp.unlink()
        dst.unlink()
        # PowerShell 的 New-Item -ItemType HardLink 在受限语言模式下不可用时会失败，改用 os.link
        os.link(src, dst)
        new_hash = sha256(dst)
        ok = new_hash == h_src
        freed += size if ok else 0
        print(f"{'LINKED' if ok else 'FAILED'} {dst_name}: {size / 1e9:.2f} GB, sha {new_hash[:12]} == {h_src[:12]}: {ok}")
        manifest.append({"src": src_name, "dst": dst_name, "status": "hardlinked" if ok else "failed",
                         "sha256": h_src, "bytes": size})

    out = DATA / "hardlink_manifest.json"
    out.write_text(json.dumps({
        "schema": "v17_hardlink_manifest_1",
        "note": "字节完全相同的数据集副本已改为硬链接；路径、内容与 SHA 不变，训练可原样复现，但不重复占用磁盘。",
        "pairs": manifest,
        "bytesFreed": freed,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nfreed ~{freed / 1e9:.2f} GB; wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())