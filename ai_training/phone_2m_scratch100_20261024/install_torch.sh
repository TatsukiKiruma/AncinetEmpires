#!/system/bin/sh
chroot /data/local/tmp/aeii-2m-scratch100-20261024/runtime/rootfs /usr/bin/env PATH=/opt/torch-env/bin:/usr/sbin:/usr/bin:/sbin:/bin /bin/bash -c 'python -m pip install --no-index --find-links /opt/wheels torch==2.14.0+cpu numpy && python -c "import torch,platform; print(torch.__version__,platform.machine()); print(torch.backends.mkldnn.is_available()); print(torch.get_num_threads())"' >/data/local/tmp/aeii-2m-scratch100-20261024/logs/torch-install.log 2>&1
printf '{"returncode":%s}\n' "$?" >/data/local/tmp/aeii-2m-scratch100-20261024/logs/torch-install-exit.json
