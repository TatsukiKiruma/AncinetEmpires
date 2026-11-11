# V7正式验收报告

训练更新0；固定Omni-Base权重1d3b6d01b91de9cbd56693b9140ca769e9df06c490701adccfd8fc701fb4a6a6。唯一配置C2在通过完整Dev-54健康及棋力门禁后，执行一次封存54局与历史40局。

搜索使用首单位原子链、己方回合余量贪心补全、主干优先双梯队敌席响应以及先验锚定J评分；每步重新进入真实根搜索，禁止自动跟进队列。教师纯Q和锚定分数分开保存。二进制GPU一致性最大误差见GPU_BATCH_PARITY.json。

三代成绩与10000次配对聚类bootstrap见FINAL_SEARCH_PAIRED_COMPARISON.json；四个重点局权威逐步合法重放及丢城事件见TACTICAL_CASE_REVIEW.json。自然胜负、截断、错误分开统计，不能以保守计零替代自然负局。

{
  "baseline2414": {
    "byPlayers": {
      "2": {
        "attempted": 20,
        "natural": 20,
        "wins": 4,
        "conservativeWin": 0.2,
        "conservativeRank": 0.2,
        "winBounds": [
          0.2,
          0.2
        ],
        "rankBounds": [
          0.2,
          0.2
        ],
        "earlyEliminations": 0,
        "roundTruncations": 0,
        "wallTruncations": 0,
        "actionTruncations": 0,
        "errors": 0,
        "timeForfeits": 0
      },
      "3": {
        "attempted": 18,
        "natural": 18,
        "wins": 2,
        "conservativeWin": 0.1111111111111111,
        "conservativeRank": 0.3055555555555556,
        "winBounds": [
          0.1111111111111111,
          0.1111111111111111
        ],
        "rankBounds": [
          0.3055555555555556,
          0.3055555555555556
        ],
        "earlyEliminations": 0,
        "roundTruncations": 0,
        "wallTruncations": 0,
        "actionTruncations": 0,
        "errors": 0,
        "timeForfeits": 0
      },
      "4": {
        "attempted": 16,
        "natural": 16,
        "wins": 0,
        "conservativeWin": 0,
        "conservativeRank": 0.31249999999999994,
        "winBounds": [
          0,
          0
        ],
        "rankBounds": [
          0.31249999999999994,
          0.31249999999999994
        ],
        "earlyEliminations": 0,
        "roundTruncations": 0,
        "wallTruncations": 0,
        "actionTruncations": 0,
        "errors": 0,
        "timeForfeits": 0
      }
    },
    "equalWin": 0.1037037037037037,
    "equalRank": 0.2726851851851852,
    "equalWinBounds": [
      0.1037037037037037,
      0.1037037037037037
    ],
    "equalRankBounds": [
      0.2726851851851852,
      0.2726851851851852
    ],
    "allNatural": true,
    "missing": 0
  },
  "omniBase": {
    "byPlayers": {
      "2": {
        "attempted": 20,
        "natural": 20,
        "wins": 9,
        "conservativeWin": 0.45,
        "conservativeRank": 0.45,
        "winBounds": [
          0.45,
          0.45
        ],
        "rankBounds": [
          0.45,
          0.45
        ],
        "earlyEliminations": 0,
        "roundTruncations": 0,
        "wallTruncations": 0,
        "actionTruncations": 0,
        "errors": 0,
        "timeForfeits": 0
      },
      "3": {
        "attempted": 18,
        "natural": 17,
        "wins": 6,
        "conservativeWin": 0.3333333333333333,
        "conservativeRank": 0.4722222222222222,
        "winBounds": [
          0.3333333333333333,
          0.38888888888888884
        ],
        "rankBounds": [
          0.4722222222222222,
          0.5277777777777778
        ],
        "earlyEliminations": 0,
        "roundTruncations": 1,
        "wallTruncations": 0,
        "actionTruncations": 0,
        "errors": 0,
        "timeForfeits": 0
      },
      "4": {
        "attempted": 16,
        "natural": 16,
        "wins": 7,
        "conservativeWin": 0.4375,
        "conservativeRank": 0.6666666666666666,
        "winBounds": [
          0.4375,
          0.4375
        ],
        "rankBounds": [
          0.6666666666666666,
          0.6666666666666666
        ],
        "earlyEliminations": 0,
        "roundTruncations": 0,
        "wallTruncations": 0,
        "actionTruncations": 0,
        "errors": 0,
        "timeForfeits": 0
      }
    },
    "equalWin": 0.4069444444444444,
    "equalRank": 0.5296296296296297,
    "equalWinBounds": [
      0.4069444444444444,
      0.42546296296296293
    ],
    "equalRankBounds": [
      0.5296296296296297,
      0.5481481481481482
    ],
    "allNatural": false,
    "missing": 1
  },
  "omniSearch": {
    "byPlayers": {
      "2": {
        "attempted": 20,
        "natural": 20,
        "wins": 14,
        "conservativeWin": 0.7,
        "conservativeRank": 0.7,
        "winBounds": [
          0.7,
          0.7
        ],
        "rankBounds": [
          0.7,
          0.7
        ],
        "earlyEliminations": 0,
        "roundTruncations": 0,
        "wallTruncations": 0,
        "actionTruncations": 0,
        "errors": 0,
        "timeForfeits": 0
      },
      "3": {
        "attempted": 18,
        "natural": 18,
        "wins": 13,
        "conservativeWin": 0.7222222222222222,
        "conservativeRank": 0.75,
        "winBounds": [
          0.7222222222222222,
          0.7222222222222222
        ],
        "rankBounds": [
          0.75,
          0.75
        ],
        "earlyEliminations": 4,
        "roundTruncations": 0,
        "wallTruncations": 0,
        "actionTruncations": 0,
        "errors": 0,
        "timeForfeits": 0
      },
      "4": {
        "attempted": 16,
        "natural": 16,
        "wins": 8,
        "conservativeWin": 0.5,
        "conservativeRank": 0.6666666666666666,
        "winBounds": [
          0.5,
          0.5
        ],
        "rankBounds": [
          0.6666666666666666,
          0.6666666666666666
        ],
        "earlyEliminations": 6,
        "roundTruncations": 0,
        "wallTruncations": 0,
        "actionTruncations": 0,
        "errors": 0,
        "timeForfeits": 0
      }
    },
    "equalWin": 0.6407407407407407,
    "equalRank": 0.7055555555555556,
    "equalWinBounds": [
      0.6407407407407407,
      0.6407407407407407
    ],
    "equalRankBounds": [
      0.7055555555555556,
      0.7055555555555556
    ],
    "allNatural": true,
    "missing": 0
  }
}

封存实质比较率0.9403397575266241，4P 0.862267637786716。完整遥测见SEARCH_TELEMETRY_AUDIT.json。对手为项目困难复刻；结论受有限初态槽、推理栈变化及搜索预算约束，不据验收结果回调配置或重试。
