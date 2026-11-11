#!/system/bin/sh
. "$1/smart_governor.sh"
smart_init 2 0 0
test "$ACTIVE_LIMIT:$RECOVERY_TARGET:$OPERATING_CEILING" = 2:2:2 || exit 11
smart_update 92 300 30 10000000 0 5; test "$ACTIVE_LIMIT" = 1 || exit 12
smart_update 92 300 30 10000000 0 10; test "$ACTIVE_LIMIT" = 0 || exit 13
smart_update 20 300 30 10000000 0 11
smart_update 20 300 30 10000000 0 71; test "$ACTIVE_LIMIT" = 1 || exit 14
smart_update 20 300 30 10000000 0 102; test "$ACTIVE_LIMIT" = 2 || exit 15
smart_update 20 450 30 10000000 0 110; test "$ACTIVE_LIMIT:$RESOURCE_PAUSED" = 0:1 || exit 16
smart_update 20 420 24 10000000 0 120; test "$RESOURCE_PAUSED" = 1 || exit 17
smart_update 20 420 25 2359296 0 130; test "$RESOURCE_PAUSED" = 0 || exit 18
smart_update 20 420 25 2000000 0 140; test "$RESOURCE_PAUSED" = 1 || exit 19
printf 'GOVERNOR_OK\n'
