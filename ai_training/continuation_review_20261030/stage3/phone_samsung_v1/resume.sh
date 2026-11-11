#!/data/data/com.termux/files/usr/bin/bash
# 用户点击本地继续按钮才解除手动暂停，历史暂停标记保留。
PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin" HOME=/data/data/com.termux/files/home TMPDIR="$PREFIX/tmp"
ROOT="$(cd "$(dirname "$0")" && pwd)"
test ! -e "$ROOT/work/training/COMPLETE.json" || exit 0
test ! -e "$ROOT/work/training/BLOCKED.json" || exit 1
if test -e "$ROOT/work/STOP"; then mv "$ROOT/work/STOP" "$ROOT/work/STOP-cleared-$(date +%s)"; fi
sleep 3
setsid "$PREFIX/bin/bash" "$ROOT/controller.sh" </dev/null >>"$ROOT/logs/controller.log" 2>&1 &
