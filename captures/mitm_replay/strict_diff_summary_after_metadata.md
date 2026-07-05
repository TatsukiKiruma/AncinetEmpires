# APK 回放差异分类汇总

- 报告数：2
- parsed：40
- passed：37
- failed：3
- parseErrors：0
- duplicates：0

## 分类

| 分类 | 数量 | 示例 |
| --- | ---: | --- |
| strict 移动可达性缺口 (`strict_move_reachability_gap`) | 2 | game_get_20260704_132008_065.bin#55 STANDBY move:u_13:4,6 (captures/mitm_replay/strict_unique_after_metadata_061_080.json)<br>game_get_20260704_132050_078.bin#51 ATTACK move:u_11:10,5 (captures/mitm_replay/strict_unique_after_metadata_061_080.json) |
| strict 目的格被项目状态占用 (`strict_move_destination_occupied`) | 1 | game_get_20260704_132339_097.bin#3008 OCCUPY move:u_267:5,2 (captures/mitm_replay/strict_unique_after_metadata_081_100.json) |

## 报告

| 报告 | force | uniqueOffset | uniqueLimit | parsed | passed | failed | parseErrors |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| captures/mitm_replay/strict_unique_after_metadata_061_080.json | false | 60 | 20 | 20 | 18 | 2 | 0 |
| captures/mitm_replay/strict_unique_after_metadata_081_100.json | false | 80 | 20 | 20 | 19 | 1 | 0 |
