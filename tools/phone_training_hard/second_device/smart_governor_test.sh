#!/system/bin/sh
# 使用合成资源读数验证纯函数，不操作真实队列或应用。
. "$1"
assert_limit() { test "$ACTIVE_LIMIT" = "$1" || { echo "并发断言失败：$ACTIVE_LIMIT != $1"; exit 2; }; }
STOP_INCREASING=0
smart_init 3 100 0
smart_update 90 390 80 5000000 0 101; assert_limit 2
smart_update 95 390 80 5000000 0 106; assert_limit 1
smart_update 91 390 80 5000000 0 111; assert_limit 0
smart_update 60 390 80 5000000 0 120; assert_limit 0
smart_update 60 390 80 5000000 0 150; assert_limit 0
smart_update 60 390 80 5000000 0 171; assert_limit 1
smart_update 60 390 80 5000000 0 201; assert_limit 2
smart_update 60 390 80 5000000 0 231; assert_limit 3
smart_update 80 450 80 5000000 0 240; assert_limit 0
smart_update 40 430 80 5000000 0 270; assert_limit 0
smart_update 40 420 80 5000000 0 280; assert_limit 0
smart_update 40 420 80 5000000 0 310; assert_limit 1
smart_update 40 420 80 5000000 0 340; assert_limit 2
smart_update 40 420 80 5000000 0 370; assert_limit 3
smart_update 40 390 19 5000000 0 380; assert_limit 0
smart_update 40 390 24 5000000 0 410; assert_limit 0
smart_update 40 390 25 5000000 0 420; assert_limit 0
smart_update 40 390 25 5000000 0 450; assert_limit 1
smart_init 3 500 10
smart_update 50 390 80 5000000 13 510; assert_limit 2
smart_update 50 390 80 5000000 13 540; assert_limit 2
smart_update 50 390 80 5000000 13 630; assert_limit 3
smart_update 50 390 80 2097151 13 640; assert_limit 0
smart_update 50 390 80 2200000 13 670; assert_limit 0
smart_update 50 390 80 2359296 13 680; assert_limit 0
smart_update 50 390 80 2359296 13 710; assert_limit 1
echo '{"passed":true,"cases":["CPU90逐档降至0","低负载冷却后逐档恢复3","45至42温度滞回","20至25电量滞回","2至2.25GiB空间滞回","失败密集暂降后恢复"]}'
