#!/data/data/com.termux/files/usr/bin/bash
# 通知只在手机本地显示，不向电脑或网络发送数据。
PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin" HOME=/data/data/com.termux/files/home TMPDIR="$PREFIX/tmp"
ROOT="$(cd "$(dirname "$0")" && pwd)"
TRAINER="$1"
while kill -0 "$TRAINER" 2>/dev/null; do
  P="$ROOT/work/training/PROGRESS.json"
  U=$(sed -n 's/^[[:space:]]*"update": \([0-9]*\),.*/\1/p' "$P" 2>/dev/null | head -1)
  U=${U:-2761}
  if grep -q '"phase": "waiting_resources"' "$P" 2>/dev/null; then TEXT="等待降温、补电或存储恢复：$U / 100000"; else TEXT="独立离线训练中：$U / 100000；可熄屏充电"; fi
  termux-notification --id 91030 --title "远古帝国训练" --content "$TEXT" --ongoing --priority low --button1 "保存暂停" --button1-action "$PREFIX/bin/touch $ROOT/work/STOP"
  sleep 60
done
