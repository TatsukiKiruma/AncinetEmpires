#!/system/bin/sh
export PATH=/system/bin:/system/xbin
chroot /data/local/tmp/aeii-2m-scratch100-20261024/runtime/rootfs /usr/bin/env PATH=/usr/sbin:/usr/bin:/sbin:/bin DEBIAN_FRONTEND=noninteractive /bin/bash -c 'apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates libgomp1 && python3 -m venv /opt/torch-env' > /data/local/tmp/aeii-2m-scratch100-20261024/logs/runtime-install.log 2>&1
CODE=$?
printf '{"returncode":%s}
' "$CODE" > /data/local/tmp/aeii-2m-scratch100-20261024/logs/runtime-install-exit.json
exit "$CODE"
