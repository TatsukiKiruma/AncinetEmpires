#!/data/data/com.termux/files/usr/bin/bash
# 所有依赖和输入都位于本机私有目录，不连接电脑或外部服务。
set -e
PREFIX=/data/data/com.termux/files/usr
ROOT="$(cd "$(dirname "$0")" && pwd)"
unset LD_PRELOAD LD_LIBRARY_PATH
exec "$PREFIX/bin/proot" --link2symlink --kill-on-exit -0 -r "$ROOT/rootfs" \
  -b /dev -b /proc -b /sys -b "$ROOT/work:/work" -b "$ROOT:/phone" -b "$ROOT/tmp:/tmp" -w /work \
  /usr/bin/env HOME=/root TMPDIR=/tmp OMNI_WORK=/work LANG=C.UTF-8 \
  PATH=/opt/torch-env/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=4 MKL_NUM_THREADS=4 "$@"
