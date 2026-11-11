# V6开发门禁未通过

阶段：Dev-54双重门禁。流程已停止，未锁定候选、未创建封存令牌，封存访问为0，训练更新为0。

详细成绩和遥测见同名JSON。

{
  "id": "C1",
  "games": [
    {
      "id": "p2-0-s0",
      "slot": 0,
      "seat": 0,
      "seed": 310000000,
      "opponent": "hard",
      "players": 2,
      "map": "(2) Crossed swords.aem",
      "category": "normal",
      "modelPlayer": 0,
      "initialSha256": "382a41b4c1f4e8068b7b310a40815dc054bf0e8bd64e564c624b36ad2f3922cb",
      "firstToActPlayer": 0,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_loss",
      "winner": 1,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 669,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 670,
      "rounds": 16,
      "roots": 123,
      "witnessCount": 16,
      "witnessActions": 196,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 7539,
        "observations": 24635,
        "completed": 7539,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 99716.00680000024,
        "peakBatchSize": 32,
        "bytes": 1721130443,
        "decisionRequests": 7537,
        "decisionObservations": 24602,
        "completedDecisionObservations": 24602,
        "decisionWireMs": 97109.26070000023,
        "decisionPeakBatchSize": 26,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.040Z",
            "id": 7508,
            "count": 4,
            "bytes": 268788,
            "remainingMs": 2767.7532000000065
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.054Z",
            "id": 7508,
            "count": 4,
            "ms": 13.30470000000787
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.063Z",
            "id": 7509,
            "count": 4,
            "bytes": 314112,
            "remainingMs": 2745.3053000000073
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.076Z",
            "id": 7509,
            "count": 4,
            "ms": 12.854300000006333
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.100Z",
            "id": 7510,
            "count": 1,
            "bytes": 66538,
            "remainingMs": 2708.6293000000005
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.113Z",
            "id": 7510,
            "count": 1,
            "ms": 13.182000000000698
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.120Z",
            "id": 7511,
            "count": 3,
            "bytes": 234632,
            "remainingMs": 2688.7061000000103
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.132Z",
            "id": 7511,
            "count": 3,
            "ms": 12.220500000024913
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.153Z",
            "id": 7512,
            "count": 1,
            "bytes": 69683,
            "remainingMs": 2655.1582000000053
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.166Z",
            "id": 7512,
            "count": 1,
            "ms": 12.92269999999553
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.173Z",
            "id": 7513,
            "count": 3,
            "bytes": 232968,
            "remainingMs": 2634.9951
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.186Z",
            "id": 7513,
            "count": 3,
            "ms": 12.589000000007218
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.203Z",
            "id": 7514,
            "count": 1,
            "bytes": 72956,
            "remainingMs": 2605.3942999999854
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.213Z",
            "id": 7514,
            "count": 1,
            "ms": 9.89879999999539
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.215Z",
            "id": 7515,
            "count": 1,
            "bytes": 74231,
            "remainingMs": 2593.1217999999935
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.225Z",
            "id": 7515,
            "count": 1,
            "ms": 9.707699999999022
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.232Z",
            "id": 7516,
            "count": 1,
            "bytes": 74103,
            "remainingMs": 2576.3735999999917
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.241Z",
            "id": 7516,
            "count": 1,
            "ms": 9.38409999999567
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.247Z",
            "id": 7517,
            "count": 1,
            "bytes": 66563,
            "remainingMs": 2561.1380000000063
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.257Z",
            "id": 7517,
            "count": 1,
            "ms": 10.187900000018999
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.259Z",
            "id": 7518,
            "count": 1,
            "bytes": 73878,
            "remainingMs": 2548.7834999999905
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.270Z",
            "id": 7518,
            "count": 1,
            "ms": 10.373200000001816
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.275Z",
            "id": 7519,
            "count": 1,
            "bytes": 66538,
            "remainingMs": 2532.8960999999836
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.286Z",
            "id": 7519,
            "count": 1,
            "ms": 10.656899999972666
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.288Z",
            "id": 7520,
            "count": 1,
            "bytes": 73142,
            "remainingMs": 2520.2891999999993
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.298Z",
            "id": 7520,
            "count": 1,
            "ms": 9.710900000005495
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.303Z",
            "id": 7521,
            "count": 1,
            "bytes": 72726,
            "remainingMs": 2504.8782000000065
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.314Z",
            "id": 7521,
            "count": 1,
            "ms": 10.172099999996135
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.320Z",
            "id": 7522,
            "count": 1,
            "bytes": 72342,
            "remainingMs": 2488.5786999999837
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.331Z",
            "id": 7522,
            "count": 1,
            "ms": 10.943099999974947
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.337Z",
            "id": 7523,
            "count": 1,
            "bytes": 71894,
            "remainingMs": 2471.423699999985
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.347Z",
            "id": 7523,
            "count": 1,
            "ms": 9.862999999983003
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.352Z",
            "id": 7524,
            "count": 1,
            "bytes": 71573,
            "remainingMs": 2456.0188999999955
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.362Z",
            "id": 7524,
            "count": 1,
            "ms": 10.298099999985425
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.368Z",
            "id": 7525,
            "count": 1,
            "bytes": 71413,
            "remainingMs": 2439.763799999986
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.378Z",
            "id": 7525,
            "count": 1,
            "ms": 9.117299999983516
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.383Z",
            "id": 7526,
            "count": 1,
            "bytes": 66563,
            "remainingMs": 2425.4402999999875
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.392Z",
            "id": 7526,
            "count": 1,
            "ms": 9.690299999987474
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.394Z",
            "id": 7527,
            "count": 1,
            "bytes": 70812,
            "remainingMs": 2413.9500999999873
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.404Z",
            "id": 7527,
            "count": 1,
            "ms": 9.896500000002561
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.410Z",
            "id": 7528,
            "count": 1,
            "bytes": 70460,
            "remainingMs": 2398.5929999999935
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.419Z",
            "id": 7528,
            "count": 1,
            "ms": 9.427200000005541
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.425Z",
            "id": 7529,
            "count": 1,
            "bytes": 69404,
            "remainingMs": 2383.290799999988
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.435Z",
            "id": 7529,
            "count": 1,
            "ms": 10.515299999999115
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.441Z",
            "id": 7530,
            "count": 1,
            "bytes": 68602,
            "remainingMs": 2367.530299999984
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.450Z",
            "id": 7530,
            "count": 1,
            "ms": 9.692299999995157
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.456Z",
            "id": 7531,
            "count": 1,
            "bytes": 67832,
            "remainingMs": 2352.706600000005
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.465Z",
            "id": 7531,
            "count": 1,
            "ms": 9.312300000019604
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.470Z",
            "id": 7532,
            "count": 1,
            "bytes": 70714,
            "remainingMs": 2338.0536999999895
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.481Z",
            "id": 7532,
            "count": 1,
            "ms": 10.771099999983562
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.482Z",
            "id": 7533,
            "count": 1,
            "bytes": 70760,
            "remainingMs": 2325.776500000007
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.494Z",
            "id": 7533,
            "count": 1,
            "ms": 11.216700000019046
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.498Z",
            "id": 7534,
            "count": 1,
            "bytes": 73923,
            "remainingMs": 2310.466599999985
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.509Z",
            "id": 7534,
            "count": 1,
            "ms": 10.771999999997206
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.511Z",
            "id": 7535,
            "count": 1,
            "bytes": 82401,
            "remainingMs": 2296.760799999989
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.524Z",
            "id": 7535,
            "count": 1,
            "ms": 12.900499999988824
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.526Z",
            "id": 7536,
            "count": 1,
            "bytes": 79544,
            "remainingMs": 2282.185599999997
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.537Z",
            "id": 7536,
            "count": 1,
            "ms": 10.842899999988731
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.542Z",
            "id": 7537,
            "count": 1,
            "bytes": 69683,
            "remainingMs": 2265.9492000000027
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.553Z",
            "id": 7537,
            "count": 1,
            "ms": 10.65600000001723
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.555Z",
            "id": 7538,
            "count": 1,
            "bytes": 79224,
            "remainingMs": 2252.9661999999953
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.566Z",
            "id": 7538,
            "count": 1,
            "ms": 10.95360000000801
          },
          {
            "type": "request",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.571Z",
            "id": 7539,
            "count": 1,
            "bytes": 69674,
            "remainingMs": 2237.0427999999956
          },
          {
            "type": "response",
            "label": "p2-0-s0:step-650",
            "at": "2026-11-01T17:16:24.582Z",
            "id": 7539,
            "count": 1,
            "ms": 10.99989999999525
          }
        ],
        "packMs": 2385.950000000736
      },
      "wallMs": 170445.7289,
      "latency": {
        "model": {
          "count": 257,
          "meanMs": 642.6270719844354,
          "p95Ms": 1997.310199999978,
          "maxMs": 2326.3111999999965
        },
        "opponent": {
          "count": 413,
          "meanMs": 9.331044067796963,
          "p95Ms": 41.38150000000314,
          "maxMs": 282.6947999999975
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-0-s0\\p2-0-s0"
    },
    {
      "id": "p2-0-s1",
      "slot": 0,
      "seat": 1,
      "seed": 310000000,
      "opponent": "hard",
      "players": 2,
      "map": "(2) Crossed swords.aem",
      "category": "normal",
      "modelPlayer": 1,
      "initialSha256": "382a41b4c1f4e8068b7b310a40815dc054bf0e8bd64e564c624b36ad2f3922cb",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_win",
      "winner": 1,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 1499,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 1500,
      "rounds": 39,
      "roots": 400,
      "witnessCount": 70,
      "witnessActions": 855,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 22578,
        "observations": 76157,
        "completed": 22578,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 281434.51899999846,
        "peakBatchSize": 32,
        "bytes": 4941334602,
        "decisionRequests": 22576,
        "decisionObservations": 76124,
        "completedDecisionObservations": 76124,
        "decisionWireMs": 278866.01739999844,
        "decisionPeakBatchSize": 28,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-0-s1:step-1496",
            "at": "2026-11-01T17:24:00.472Z",
            "id": 22547,
            "count": 1,
            "bytes": 70522,
            "remainingMs": 2369.722400000028
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1496",
            "at": "2026-11-01T17:24:00.486Z",
            "id": 22547,
            "count": 1,
            "ms": 14.126500000013039
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1496",
            "at": "2026-11-01T17:24:00.488Z",
            "id": 22548,
            "count": 1,
            "bytes": 70007,
            "remainingMs": 2353.6835999999894
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1496",
            "at": "2026-11-01T17:24:00.500Z",
            "id": 22548,
            "count": 1,
            "ms": 11.491600000008475
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1496",
            "at": "2026-11-01T17:24:00.502Z",
            "id": 22549,
            "count": 1,
            "bytes": 73410,
            "remainingMs": 2339.9160000000265
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1496",
            "at": "2026-11-01T17:24:00.512Z",
            "id": 22549,
            "count": 1,
            "ms": 10.096100000024308
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1496",
            "at": "2026-11-01T17:24:00.515Z",
            "id": 22550,
            "count": 1,
            "bytes": 84801,
            "remainingMs": 2326.9792000000016
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1496",
            "at": "2026-11-01T17:24:00.526Z",
            "id": 22550,
            "count": 1,
            "ms": 11.606599999999162
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.535Z",
            "id": 22551,
            "count": 1,
            "bytes": 78799,
            "remainingMs": 2923.263399999996
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.547Z",
            "id": 22551,
            "count": 1,
            "ms": 11.70240000000922
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.552Z",
            "id": 22552,
            "count": 1,
            "bytes": 66529,
            "remainingMs": 2906.353300000017
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.563Z",
            "id": 22552,
            "count": 1,
            "ms": 11.351699999999255
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.572Z",
            "id": 22553,
            "count": 4,
            "bytes": 311644,
            "remainingMs": 2886.0487999999896
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.585Z",
            "id": 22553,
            "count": 4,
            "ms": 12.585900000005495
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.589Z",
            "id": 22554,
            "count": 3,
            "bytes": 234093,
            "remainingMs": 2868.7793999999994
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.603Z",
            "id": 22554,
            "count": 3,
            "ms": 13.26799999998184
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.618Z",
            "id": 22555,
            "count": 2,
            "bytes": 154334,
            "remainingMs": 2840.306600000011
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.630Z",
            "id": 22555,
            "count": 2,
            "ms": 11.876500000013039
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.640Z",
            "id": 22556,
            "count": 2,
            "bytes": 154142,
            "remainingMs": 2818.4157000000123
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.651Z",
            "id": 22556,
            "count": 2,
            "ms": 11.32750000001397
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.664Z",
            "id": 22557,
            "count": 2,
            "bytes": 153566,
            "remainingMs": 2794.575200000021
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.679Z",
            "id": 22557,
            "count": 2,
            "ms": 15.581600000034086
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.692Z",
            "id": 22558,
            "count": 2,
            "bytes": 152606,
            "remainingMs": 2766.1118000000133
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.704Z",
            "id": 22558,
            "count": 2,
            "ms": 12.24820000003092
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.715Z",
            "id": 22559,
            "count": 1,
            "bytes": 66538,
            "remainingMs": 2743.190899999987
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.729Z",
            "id": 22559,
            "count": 1,
            "ms": 13.996799999964423
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.733Z",
            "id": 22560,
            "count": 2,
            "bytes": 151518,
            "remainingMs": 2725.0499999999884
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.746Z",
            "id": 22560,
            "count": 2,
            "ms": 12.358199999958742
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.757Z",
            "id": 22561,
            "count": 2,
            "bytes": 132914,
            "remainingMs": 2701.166900000011
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.770Z",
            "id": 22561,
            "count": 2,
            "ms": 12.987299999978859
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.775Z",
            "id": 22562,
            "count": 2,
            "bytes": 150685,
            "remainingMs": 2683.5118000000366
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.787Z",
            "id": 22562,
            "count": 2,
            "ms": 12.023500000010245
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.798Z",
            "id": 22563,
            "count": 2,
            "bytes": 150141,
            "remainingMs": 2659.8870999999926
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.809Z",
            "id": 22563,
            "count": 2,
            "ms": 11.164099999994505
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.821Z",
            "id": 22564,
            "count": 2,
            "bytes": 149181,
            "remainingMs": 2637.159500000009
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.833Z",
            "id": 22564,
            "count": 2,
            "ms": 11.62390000000596
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.845Z",
            "id": 22565,
            "count": 2,
            "bytes": 146107,
            "remainingMs": 2613.6628999999957
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.858Z",
            "id": 22565,
            "count": 2,
            "ms": 13.287599999981467
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.870Z",
            "id": 22566,
            "count": 2,
            "bytes": 145851,
            "remainingMs": 2587.846499999985
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.883Z",
            "id": 22566,
            "count": 2,
            "ms": 12.270299999974668
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.897Z",
            "id": 22567,
            "count": 2,
            "bytes": 145307,
            "remainingMs": 2561.665800000017
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.912Z",
            "id": 22567,
            "count": 2,
            "ms": 15.207500000018626
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.925Z",
            "id": 22568,
            "count": 2,
            "bytes": 143930,
            "remainingMs": 2533.691999999981
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.936Z",
            "id": 22568,
            "count": 2,
            "ms": 11.731799999950454
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.948Z",
            "id": 22569,
            "count": 2,
            "bytes": 142914,
            "remainingMs": 2510.529500000004
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.960Z",
            "id": 22569,
            "count": 2,
            "ms": 12.653600000019651
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.971Z",
            "id": 22570,
            "count": 2,
            "bytes": 140999,
            "remainingMs": 2486.9908000000287
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.983Z",
            "id": 22570,
            "count": 2,
            "ms": 11.892900000035297
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:00.994Z",
            "id": 22571,
            "count": 2,
            "bytes": 139014,
            "remainingMs": 2464.43670000002
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:01.011Z",
            "id": 22571,
            "count": 2,
            "ms": 17.337400000018533
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:01.023Z",
            "id": 22572,
            "count": 2,
            "bytes": 137794,
            "remainingMs": 2434.8108000000357
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:01.036Z",
            "id": 22572,
            "count": 2,
            "ms": 12.190900000045076
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:01.045Z",
            "id": 22573,
            "count": 2,
            "bytes": 136546,
            "remainingMs": 2413.1279000000213
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:01.059Z",
            "id": 22573,
            "count": 2,
            "ms": 14.23389999999199
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:01.068Z",
            "id": 22574,
            "count": 2,
            "bytes": 134524,
            "remainingMs": 2390.419099999999
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:01.079Z",
            "id": 22574,
            "count": 2,
            "ms": 10.893600000010338
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:01.086Z",
            "id": 22575,
            "count": 2,
            "bytes": 140625,
            "remainingMs": 2372.5885000000126
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:01.097Z",
            "id": 22575,
            "count": 2,
            "ms": 11.502900000021327
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:01.100Z",
            "id": 22576,
            "count": 2,
            "bytes": 139853,
            "remainingMs": 2357.8830000000307
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:01.111Z",
            "id": 22576,
            "count": 2,
            "ms": 11.149100000038743
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:01.116Z",
            "id": 22577,
            "count": 2,
            "bytes": 146531,
            "remainingMs": 2342.5180999999866
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:01.127Z",
            "id": 22577,
            "count": 2,
            "ms": 11.068700000003446
          },
          {
            "type": "request",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:01.133Z",
            "id": 22578,
            "count": 2,
            "bytes": 169698,
            "remainingMs": 2325.4193000000087
          },
          {
            "type": "response",
            "label": "p2-0-s1:step-1498",
            "at": "2026-11-01T17:24:01.146Z",
            "id": 22578,
            "count": 2,
            "ms": 13.130400000023656
          }
        ],
        "packMs": 6726.330999997281
      },
      "wallMs": 452904.7879,
      "latency": {
        "model": {
          "count": 819,
          "meanMs": 542.7332235653242,
          "p95Ms": 1607.5881999999983,
          "maxMs": 2126.018200000006
        },
        "opponent": {
          "count": 681,
          "meanMs": 7.46726886930951,
          "p95Ms": 24.440700000006473,
          "maxMs": 365.2908999999927
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-0-s1\\p2-0-s1"
    },
    {
      "id": "p2-1-s0",
      "slot": 1,
      "seat": 0,
      "seed": 310001009,
      "opponent": "hard",
      "players": 2,
      "map": "(2) Duel.aem",
      "category": "normal",
      "modelPlayer": 0,
      "initialSha256": "790eae901d853825d24e2b68c165ca90f39e7e2aca2491542de29a4a792e1fda",
      "firstToActPlayer": 0,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_win",
      "winner": 0,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 321,
          "ids": [
            1
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 322,
      "rounds": 13,
      "roots": 104,
      "witnessCount": 17,
      "witnessActions": 130,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 2413,
        "observations": 12066,
        "completed": 2413,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 33869.28600000006,
        "peakBatchSize": 32,
        "bytes": 514541440,
        "decisionRequests": 2411,
        "decisionObservations": 12033,
        "completedDecisionObservations": 12033,
        "decisionWireMs": 31313.808600000055,
        "decisionPeakBatchSize": 29,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-1-s0:step-314",
            "at": "2026-11-02T01:09:47.256Z",
            "id": 2382,
            "count": 8,
            "bytes": 377431,
            "remainingMs": 2853.614099999999
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-314",
            "at": "2026-11-02T01:09:47.270Z",
            "id": 2382,
            "count": 8,
            "ms": 14.435899999996764
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-314",
            "at": "2026-11-02T01:09:47.287Z",
            "id": 2383,
            "count": 8,
            "bytes": 352159,
            "remainingMs": 2822.863599999997
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-314",
            "at": "2026-11-02T01:09:47.302Z",
            "id": 2383,
            "count": 8,
            "ms": 15.166699999994307
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-314",
            "at": "2026-11-02T01:09:47.308Z",
            "id": 2384,
            "count": 7,
            "bytes": 323935,
            "remainingMs": 2801.605300000003
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-314",
            "at": "2026-11-02T01:09:47.322Z",
            "id": 2384,
            "count": 7,
            "ms": 14.375400000004447
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-314",
            "at": "2026-11-02T01:09:47.336Z",
            "id": 2385,
            "count": 7,
            "bytes": 308167,
            "remainingMs": 2773.4375999999975
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-314",
            "at": "2026-11-02T01:09:47.354Z",
            "id": 2385,
            "count": 7,
            "ms": 18.025000000001455
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-314",
            "at": "2026-11-02T01:09:47.357Z",
            "id": 2386,
            "count": 4,
            "bytes": 182108,
            "remainingMs": 2752.0651999999973
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-314",
            "at": "2026-11-02T01:09:47.369Z",
            "id": 2386,
            "count": 4,
            "ms": 11.543999999994412
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-314",
            "at": "2026-11-02T01:09:47.375Z",
            "id": 2387,
            "count": 2,
            "bytes": 88152,
            "remainingMs": 2734.1276
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-314",
            "at": "2026-11-02T01:09:47.387Z",
            "id": 2387,
            "count": 2,
            "ms": 12.043299999997544
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-314",
            "at": "2026-11-02T01:09:47.389Z",
            "id": 2388,
            "count": 2,
            "bytes": 88992,
            "remainingMs": 2720.5037999999986
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-314",
            "at": "2026-11-02T01:09:47.402Z",
            "id": 2388,
            "count": 2,
            "ms": 12.577899999996589
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-314",
            "at": "2026-11-02T01:09:47.405Z",
            "id": 2389,
            "count": 2,
            "bytes": 93316,
            "remainingMs": 2704.659999999996
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-314",
            "at": "2026-11-02T01:09:47.416Z",
            "id": 2389,
            "count": 2,
            "ms": 11.528800000000047
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.424Z",
            "id": 2390,
            "count": 1,
            "bytes": 47213,
            "remainingMs": 2924.1604000000007
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.434Z",
            "id": 2390,
            "count": 1,
            "ms": 9.931499999998778
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.437Z",
            "id": 2391,
            "count": 3,
            "bytes": 132155,
            "remainingMs": 2910.5195999999996
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.449Z",
            "id": 2391,
            "count": 3,
            "ms": 11.786299999999756
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.458Z",
            "id": 2392,
            "count": 11,
            "bytes": 509082,
            "remainingMs": 2889.4351000000024
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.475Z",
            "id": 2392,
            "count": 11,
            "ms": 16.976399999999558
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.481Z",
            "id": 2393,
            "count": 8,
            "bytes": 370442,
            "remainingMs": 2867.119899999998
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.495Z",
            "id": 2393,
            "count": 8,
            "ms": 13.82329999999638
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.510Z",
            "id": 2394,
            "count": 8,
            "bytes": 352170,
            "remainingMs": 2837.3295
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.528Z",
            "id": 2394,
            "count": 8,
            "ms": 17.40110000000277
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.533Z",
            "id": 2395,
            "count": 7,
            "bytes": 319805,
            "remainingMs": 2814.667699999998
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.548Z",
            "id": 2395,
            "count": 7,
            "ms": 14.979199999994307
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.561Z",
            "id": 2396,
            "count": 5,
            "bytes": 220161,
            "remainingMs": 2787.312899999997
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.572Z",
            "id": 2396,
            "count": 5,
            "ms": 11.561099999998987
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.576Z",
            "id": 2397,
            "count": 6,
            "bytes": 266684,
            "remainingMs": 2771.760699999999
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.588Z",
            "id": 2397,
            "count": 6,
            "ms": 11.89940000000206
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.598Z",
            "id": 2398,
            "count": 6,
            "bytes": 280364,
            "remainingMs": 2750.2165000000023
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.611Z",
            "id": 2398,
            "count": 6,
            "ms": 13.266199999998207
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.615Z",
            "id": 2399,
            "count": 4,
            "bytes": 168194,
            "remainingMs": 2732.6209000000017
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.626Z",
            "id": 2399,
            "count": 4,
            "ms": 11.10229999999865
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.633Z",
            "id": 2400,
            "count": 4,
            "bytes": 217663,
            "remainingMs": 2715.085100000004
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-316",
            "at": "2026-11-02T01:09:47.644Z",
            "id": 2400,
            "count": 4,
            "ms": 11.553700000004028
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-318",
            "at": "2026-11-02T01:09:47.651Z",
            "id": 2401,
            "count": 1,
            "bytes": 46699,
            "remainingMs": 2924.246500000001
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-318",
            "at": "2026-11-02T01:09:47.661Z",
            "id": 2401,
            "count": 1,
            "ms": 9.687700000002224
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-318",
            "at": "2026-11-02T01:09:47.666Z",
            "id": 2402,
            "count": 6,
            "bytes": 264164,
            "remainingMs": 2909.2586999999985
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-318",
            "at": "2026-11-02T01:09:47.678Z",
            "id": 2402,
            "count": 6,
            "ms": 12.51879999999801
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-318",
            "at": "2026-11-02T01:09:47.688Z",
            "id": 2403,
            "count": 14,
            "bytes": 637150,
            "remainingMs": 2886.6173999999955
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-318",
            "at": "2026-11-02T01:09:47.705Z",
            "id": 2403,
            "count": 14,
            "ms": 16.961599999995087
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-318",
            "at": "2026-11-02T01:09:47.711Z",
            "id": 2404,
            "count": 8,
            "bytes": 364102,
            "remainingMs": 2864.524099999995
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-318",
            "at": "2026-11-02T01:09:47.725Z",
            "id": 2404,
            "count": 8,
            "ms": 13.989699999998265
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-318",
            "at": "2026-11-02T01:09:47.737Z",
            "id": 2405,
            "count": 7,
            "bytes": 308167,
            "remainingMs": 2837.9761999999973
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-318",
            "at": "2026-11-02T01:09:47.751Z",
            "id": 2405,
            "count": 7,
            "ms": 14.296300000001793
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-318",
            "at": "2026-11-02T01:09:47.754Z",
            "id": 2406,
            "count": 3,
            "bytes": 133415,
            "remainingMs": 2820.9766999999993
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-318",
            "at": "2026-11-02T01:09:47.765Z",
            "id": 2406,
            "count": 3,
            "ms": 10.71190000000206
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-318",
            "at": "2026-11-02T01:09:47.770Z",
            "id": 2407,
            "count": 3,
            "bytes": 139853,
            "remainingMs": 2804.6561
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-318",
            "at": "2026-11-02T01:09:47.782Z",
            "id": 2407,
            "count": 3,
            "ms": 11.597399999998743
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-318",
            "at": "2026-11-02T01:09:47.783Z",
            "id": 2408,
            "count": 1,
            "bytes": 46412,
            "remainingMs": 2791.892199999995
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-318",
            "at": "2026-11-02T01:09:47.794Z",
            "id": 2408,
            "count": 1,
            "ms": 10.644099999997707
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-320",
            "at": "2026-11-02T01:09:47.800Z",
            "id": 2409,
            "count": 1,
            "bytes": 46091,
            "remainingMs": 2924.1515999999974
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-320",
            "at": "2026-11-02T01:09:47.812Z",
            "id": 2409,
            "count": 1,
            "ms": 11.649199999999837
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-320",
            "at": "2026-11-02T01:09:47.814Z",
            "id": 2410,
            "count": 2,
            "bytes": 88152,
            "remainingMs": 2909.8269
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-320",
            "at": "2026-11-02T01:09:47.825Z",
            "id": 2410,
            "count": 2,
            "ms": 10.365100000002712
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-320",
            "at": "2026-11-02T01:09:47.830Z",
            "id": 2411,
            "count": 8,
            "bytes": 353409,
            "remainingMs": 2894.065999999999
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-320",
            "at": "2026-11-02T01:09:47.845Z",
            "id": 2411,
            "count": 8,
            "ms": 14.909399999996822
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-320",
            "at": "2026-11-02T01:09:47.848Z",
            "id": 2412,
            "count": 6,
            "bytes": 264563,
            "remainingMs": 2875.809699999998
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-320",
            "at": "2026-11-02T01:09:47.861Z",
            "id": 2412,
            "count": 6,
            "ms": 12.360499999995227
          },
          {
            "type": "request",
            "label": "p2-1-s0:step-320",
            "at": "2026-11-02T01:09:47.871Z",
            "id": 2413,
            "count": 6,
            "bytes": 277471,
            "remainingMs": 2853.570099999997
          },
          {
            "type": "response",
            "label": "p2-1-s0:step-320",
            "at": "2026-11-02T01:09:47.883Z",
            "id": 2413,
            "count": 6,
            "ms": 12.08629999999539
          }
        ],
        "packMs": 777.9230000000516
      },
      "wallMs": 48040.001800000005,
      "latency": {
        "model": {
          "count": 199,
          "meanMs": 233.3536572864321,
          "p95Ms": 655.4313000000002,
          "maxMs": 864.8790000000008
        },
        "opponent": {
          "count": 123,
          "meanMs": 7.3923520325205745,
          "p95Ms": 20.278300000001764,
          "maxMs": 199.818299999999
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-1-s0\\p2-1-s0"
    },
    {
      "id": "p2-1-s1",
      "slot": 1,
      "seat": 1,
      "seed": 310001009,
      "opponent": "hard",
      "players": 2,
      "map": "(2) Duel.aem",
      "category": "normal",
      "modelPlayer": 1,
      "initialSha256": "790eae901d853825d24e2b68c165ca90f39e7e2aca2491542de29a4a792e1fda",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 0,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 316,
          "ids": [
            1
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 317,
      "rounds": 13,
      "roots": 43,
      "witnessCount": 12,
      "witnessActions": 92,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 1414,
        "observations": 5410,
        "completed": 1414,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 20139.854200000085,
        "peakBatchSize": 32,
        "bytes": 228352642,
        "decisionRequests": 1412,
        "decisionObservations": 5377,
        "completedDecisionObservations": 5377,
        "decisionWireMs": 17657.584000000086,
        "decisionPeakBatchSize": 17,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.100Z",
            "id": 1383,
            "count": 4,
            "bytes": 226392,
            "remainingMs": 2737.5779
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.114Z",
            "id": 1383,
            "count": 4,
            "ms": 13.126799999998184
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.119Z",
            "id": 1384,
            "count": 4,
            "bytes": 242740,
            "remainingMs": 2718.9745000000003
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.131Z",
            "id": 1384,
            "count": 4,
            "ms": 11.68999999999869
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.143Z",
            "id": 1385,
            "count": 4,
            "bytes": 223509,
            "remainingMs": 2695.3143999999993
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.157Z",
            "id": 1385,
            "count": 4,
            "ms": 14.413799999998446
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.161Z",
            "id": 1386,
            "count": 3,
            "bytes": 180486,
            "remainingMs": 2676.8459000000003
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.173Z",
            "id": 1386,
            "count": 3,
            "ms": 12.193100000000413
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.182Z",
            "id": 1387,
            "count": 3,
            "bytes": 166981,
            "remainingMs": 2656.2740999999987
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.193Z",
            "id": 1387,
            "count": 3,
            "ms": 10.75079999999798
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.194Z",
            "id": 1388,
            "count": 1,
            "bytes": 57938,
            "remainingMs": 2643.888500000001
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.206Z",
            "id": 1388,
            "count": 1,
            "ms": 11.580500000000029
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.208Z",
            "id": 1389,
            "count": 1,
            "bytes": 53927,
            "remainingMs": 2629.590500000002
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.221Z",
            "id": 1389,
            "count": 1,
            "ms": 12.269000000000233
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.223Z",
            "id": 1390,
            "count": 2,
            "bytes": 119780,
            "remainingMs": 2614.6751000000004
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.234Z",
            "id": 1390,
            "count": 2,
            "ms": 10.775399999998626
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.237Z",
            "id": 1391,
            "count": 1,
            "bytes": 53927,
            "remainingMs": 2600.679
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.248Z",
            "id": 1391,
            "count": 1,
            "ms": 10.54739999999947
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.251Z",
            "id": 1392,
            "count": 2,
            "bytes": 119236,
            "remainingMs": 2587.060099999999
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.263Z",
            "id": 1392,
            "count": 2,
            "ms": 12.061899999996967
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.267Z",
            "id": 1393,
            "count": 2,
            "bytes": 107674,
            "remainingMs": 2570.972600000001
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.279Z",
            "id": 1393,
            "count": 2,
            "ms": 11.79370000000199
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.282Z",
            "id": 1394,
            "count": 2,
            "bytes": 124470,
            "remainingMs": 2556.1035999999986
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.293Z",
            "id": 1394,
            "count": 2,
            "ms": 10.896699999997509
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.299Z",
            "id": 1395,
            "count": 2,
            "bytes": 113214,
            "remainingMs": 2539.2875999999997
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.311Z",
            "id": 1395,
            "count": 2,
            "ms": 11.906199999997625
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.314Z",
            "id": 1396,
            "count": 2,
            "bytes": 123830,
            "remainingMs": 2524.4000000000015
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.325Z",
            "id": 1396,
            "count": 2,
            "ms": 11.194500000001426
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.331Z",
            "id": 1397,
            "count": 2,
            "bytes": 113247,
            "remainingMs": 2507.574499999999
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.341Z",
            "id": 1397,
            "count": 2,
            "ms": 10.923399999999674
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.344Z",
            "id": 1398,
            "count": 2,
            "bytes": 123230,
            "remainingMs": 2493.6977000000006
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.356Z",
            "id": 1398,
            "count": 2,
            "ms": 11.763100000000122
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.361Z",
            "id": 1399,
            "count": 1,
            "bytes": 56688,
            "remainingMs": 2477.1726000000017
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.372Z",
            "id": 1399,
            "count": 1,
            "ms": 11.56590000000142
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.374Z",
            "id": 1400,
            "count": 1,
            "bytes": 61267,
            "remainingMs": 2464.1415000000015
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-280",
            "at": "2026-11-02T01:10:19.384Z",
            "id": 1400,
            "count": 1,
            "ms": 9.746000000002823
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.648Z",
            "id": 1401,
            "count": 1,
            "bytes": 51456,
            "remainingMs": 2923.6761000000006
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.663Z",
            "id": 1401,
            "count": 1,
            "ms": 15.102399999999761
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.665Z",
            "id": 1402,
            "count": 1,
            "bytes": 51327,
            "remainingMs": 2906.754399999998
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.677Z",
            "id": 1402,
            "count": 1,
            "ms": 12.694299999999203
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.686Z",
            "id": 1403,
            "count": 5,
            "bytes": 314370,
            "remainingMs": 2885.4184999999998
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.699Z",
            "id": 1403,
            "count": 5,
            "ms": 13.253000000000611
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.705Z",
            "id": 1404,
            "count": 4,
            "bytes": 251630,
            "remainingMs": 2867.0293999999994
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.717Z",
            "id": 1404,
            "count": 4,
            "ms": 12.607899999999063
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.729Z",
            "id": 1405,
            "count": 4,
            "bytes": 226311,
            "remainingMs": 2842.966199999999
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.742Z",
            "id": 1405,
            "count": 4,
            "ms": 13.847099999999045
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.748Z",
            "id": 1406,
            "count": 3,
            "bytes": 187866,
            "remainingMs": 2823.627700000001
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.761Z",
            "id": 1406,
            "count": 3,
            "ms": 13.12550000000192
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.768Z",
            "id": 1407,
            "count": 2,
            "bytes": 113214,
            "remainingMs": 2803.9933999999994
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.779Z",
            "id": 1407,
            "count": 2,
            "ms": 10.94510000000082
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.784Z",
            "id": 1408,
            "count": 3,
            "bytes": 186362,
            "remainingMs": 2787.939699999999
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.796Z",
            "id": 1408,
            "count": 3,
            "ms": 11.901200000000244
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.802Z",
            "id": 1409,
            "count": 2,
            "bytes": 113214,
            "remainingMs": 2770.0054999999993
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.815Z",
            "id": 1409,
            "count": 2,
            "ms": 13.330500000000029
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.817Z",
            "id": 1410,
            "count": 1,
            "bytes": 62132,
            "remainingMs": 2754.8688
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.827Z",
            "id": 1410,
            "count": 1,
            "ms": 10.418000000001484
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.830Z",
            "id": 1411,
            "count": 1,
            "bytes": 61604,
            "remainingMs": 2741.332299999998
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.841Z",
            "id": 1411,
            "count": 1,
            "ms": 10.692399999999907
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.843Z",
            "id": 1412,
            "count": 1,
            "bytes": 56778,
            "remainingMs": 2728.5671
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.854Z",
            "id": 1412,
            "count": 1,
            "ms": 11.39259999999922
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.856Z",
            "id": 1413,
            "count": 1,
            "bytes": 62900,
            "remainingMs": 2715.4825999999994
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.866Z",
            "id": 1413,
            "count": 1,
            "ms": 10.105500000001484
          },
          {
            "type": "request",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.869Z",
            "id": 1414,
            "count": 1,
            "bytes": 56688,
            "remainingMs": 2702.758399999999
          },
          {
            "type": "response",
            "label": "p2-1-s1:step-314",
            "at": "2026-11-02T01:10:19.879Z",
            "id": 1414,
            "count": 1,
            "ms": 10.53979999999865
          }
        ],
        "packMs": 367.71179999994786
      },
      "wallMs": 27315.6309,
      "latency": {
        "model": {
          "count": 81,
          "meanMs": 316.31881358024697,
          "p95Ms": 1366.3960999999981,
          "maxMs": 1630.7125000000015
        },
        "opponent": {
          "count": 236,
          "meanMs": 4.459188559322255,
          "p95Ms": 16.09860000000117,
          "maxMs": 82.85300000000097
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-1-s1\\p2-1-s1"
    },
    {
      "id": "p2-2-s0",
      "slot": 2,
      "seat": 0,
      "seed": 310002018,
      "opponent": "hard",
      "players": 2,
      "map": "(2) Icy Paths.aem",
      "category": "normal",
      "modelPlayer": 0,
      "initialSha256": "bab03e30fbe7e1b5b4a3c6b3090d52e6a0aa9bb069049983328a1cc780495b29",
      "firstToActPlayer": 0,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_win",
      "winner": 0,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 887,
          "ids": [
            1
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 888,
      "rounds": 20,
      "roots": 325,
      "witnessCount": 59,
      "witnessActions": 574,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 15537,
        "observations": 50432,
        "completed": 15537,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 197940.20240000213,
        "peakBatchSize": 32,
        "bytes": 4424733126,
        "decisionRequests": 15535,
        "decisionObservations": 50399,
        "completedDecisionObservations": 50399,
        "decisionWireMs": 195466.80510000212,
        "decisionPeakBatchSize": 24,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-2-s0:step-884",
            "at": "2026-11-02T01:15:55.759Z",
            "id": 15506,
            "count": 4,
            "bytes": 421792,
            "remainingMs": 2859.050199999998
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-884",
            "at": "2026-11-02T01:15:55.773Z",
            "id": 15506,
            "count": 4,
            "ms": 13.961999999999534
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-884",
            "at": "2026-11-02T01:15:55.782Z",
            "id": 15507,
            "count": 4,
            "bytes": 379136,
            "remainingMs": 2836.5832999999984
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-884",
            "at": "2026-11-02T01:15:55.794Z",
            "id": 15507,
            "count": 4,
            "ms": 12.406099999963772
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-884",
            "at": "2026-11-02T01:15:55.805Z",
            "id": 15508,
            "count": 4,
            "bytes": 422272,
            "remainingMs": 2813.7237000000314
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-884",
            "at": "2026-11-02T01:15:55.817Z",
            "id": 15508,
            "count": 4,
            "ms": 12.521500000031665
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-884",
            "at": "2026-11-02T01:15:55.825Z",
            "id": 15509,
            "count": 4,
            "bytes": 379136,
            "remainingMs": 2793.0623000000487
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-884",
            "at": "2026-11-02T01:15:55.839Z",
            "id": 15509,
            "count": 4,
            "ms": 13.15500000002794
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:55.852Z",
            "id": 15510,
            "count": 1,
            "bytes": 105430,
            "remainingMs": 2922.6472000000067
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:55.866Z",
            "id": 15510,
            "count": 1,
            "ms": 13.616399999998976
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:55.870Z",
            "id": 15511,
            "count": 1,
            "bytes": 94904,
            "remainingMs": 2905.0005999999703
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:55.879Z",
            "id": 15511,
            "count": 1,
            "ms": 9.804499999969266
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:55.890Z",
            "id": 15512,
            "count": 4,
            "bytes": 419225,
            "remainingMs": 2884.9943000000203
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:55.902Z",
            "id": 15512,
            "count": 4,
            "ms": 12.446400000015274
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:55.908Z",
            "id": 15513,
            "count": 3,
            "bytes": 314603,
            "remainingMs": 2866.402599999972
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:55.920Z",
            "id": 15513,
            "count": 3,
            "ms": 11.306400000001304
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:55.929Z",
            "id": 15514,
            "count": 3,
            "bytes": 313515,
            "remainingMs": 2845.255599999975
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:55.943Z",
            "id": 15514,
            "count": 3,
            "ms": 13.76749999995809
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:55.952Z",
            "id": 15515,
            "count": 3,
            "bytes": 310219,
            "remainingMs": 2822.560899999982
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:55.966Z",
            "id": 15515,
            "count": 3,
            "ms": 13.789999999979045
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:55.974Z",
            "id": 15516,
            "count": 3,
            "bytes": 308779,
            "remainingMs": 2800.885799999989
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:55.986Z",
            "id": 15516,
            "count": 3,
            "ms": 12.25079999997979
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:55.994Z",
            "id": 15517,
            "count": 3,
            "bytes": 308041,
            "remainingMs": 2780.6652999999933
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.005Z",
            "id": 15517,
            "count": 3,
            "ms": 11.388099999981932
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.013Z",
            "id": 15518,
            "count": 3,
            "bytes": 306791,
            "remainingMs": 2761.7405000000144
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.024Z",
            "id": 15518,
            "count": 3,
            "ms": 11.088300000003073
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.032Z",
            "id": 15519,
            "count": 3,
            "bytes": 305767,
            "remainingMs": 2742.982000000018
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.044Z",
            "id": 15519,
            "count": 3,
            "ms": 12.663400000019465
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.052Z",
            "id": 15520,
            "count": 3,
            "bytes": 304967,
            "remainingMs": 2722.404600000009
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.065Z",
            "id": 15520,
            "count": 3,
            "ms": 12.633300000044983
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.072Z",
            "id": 15521,
            "count": 3,
            "bytes": 304039,
            "remainingMs": 2702.924799999979
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.083Z",
            "id": 15521,
            "count": 3,
            "ms": 11.2666999999783
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.090Z",
            "id": 15522,
            "count": 3,
            "bytes": 302439,
            "remainingMs": 2684.7909999999683
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.101Z",
            "id": 15522,
            "count": 3,
            "ms": 11.201999999990221
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.108Z",
            "id": 15523,
            "count": 3,
            "bytes": 301159,
            "remainingMs": 2666.2260999999708
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.120Z",
            "id": 15523,
            "count": 3,
            "ms": 11.64079999999376
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.126Z",
            "id": 15524,
            "count": 3,
            "bytes": 300455,
            "remainingMs": 2648.187900000019
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.138Z",
            "id": 15524,
            "count": 3,
            "ms": 11.152200000011362
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.144Z",
            "id": 15525,
            "count": 3,
            "bytes": 299207,
            "remainingMs": 2630.587499999965
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.156Z",
            "id": 15525,
            "count": 3,
            "ms": 11.543799999984913
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.162Z",
            "id": 15526,
            "count": 3,
            "bytes": 297415,
            "remainingMs": 2612.1371999999974
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.174Z",
            "id": 15526,
            "count": 3,
            "ms": 11.57870000001276
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.180Z",
            "id": 15527,
            "count": 3,
            "bytes": 296133,
            "remainingMs": 2594.5535999999847
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.191Z",
            "id": 15527,
            "count": 3,
            "ms": 11.268999999971129
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.197Z",
            "id": 15528,
            "count": 3,
            "bytes": 294660,
            "remainingMs": 2577.2026000000187
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.210Z",
            "id": 15528,
            "count": 3,
            "ms": 12.662200000020675
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.216Z",
            "id": 15529,
            "count": 3,
            "bytes": 293502,
            "remainingMs": 2559.092100000009
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.228Z",
            "id": 15529,
            "count": 3,
            "ms": 12.321200000005774
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.234Z",
            "id": 15530,
            "count": 3,
            "bytes": 292507,
            "remainingMs": 2540.9820999999647
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.248Z",
            "id": 15530,
            "count": 3,
            "ms": 14.62809999997262
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.255Z",
            "id": 15531,
            "count": 3,
            "bytes": 291963,
            "remainingMs": 2519.943099999975
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.267Z",
            "id": 15531,
            "count": 3,
            "ms": 11.822299999999814
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.272Z",
            "id": 15532,
            "count": 3,
            "bytes": 291675,
            "remainingMs": 2502.255999999994
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.284Z",
            "id": 15532,
            "count": 3,
            "ms": 11.278099999995902
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.289Z",
            "id": 15533,
            "count": 3,
            "bytes": 291163,
            "remainingMs": 2485.8589999999967
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.300Z",
            "id": 15533,
            "count": 3,
            "ms": 10.846000000019558
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.305Z",
            "id": 15534,
            "count": 3,
            "bytes": 289819,
            "remainingMs": 2469.7335999999777
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.316Z",
            "id": 15534,
            "count": 3,
            "ms": 10.648999999975786
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.320Z",
            "id": 15535,
            "count": 3,
            "bytes": 287960,
            "remainingMs": 2454.214500000002
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.331Z",
            "id": 15535,
            "count": 3,
            "ms": 10.824200000031851
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.336Z",
            "id": 15536,
            "count": 3,
            "bytes": 286453,
            "remainingMs": 2438.8128000000142
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.347Z",
            "id": 15536,
            "count": 3,
            "ms": 10.956500000029337
          },
          {
            "type": "request",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.356Z",
            "id": 15537,
            "count": 3,
            "bytes": 319922,
            "remainingMs": 2418.178799999994
          },
          {
            "type": "response",
            "label": "p2-2-s0:step-886",
            "at": "2026-11-02T01:15:56.368Z",
            "id": 15537,
            "count": 3,
            "ms": 11.509299999976065
          }
        ],
        "packMs": 5540.561600001851
      },
      "wallMs": 331826.5309,
      "latency": {
        "model": {
          "count": 643,
          "meanMs": 508.45303996889595,
          "p95Ms": 1733.8261000000057,
          "maxMs": 2518.4030000000057
        },
        "opponent": {
          "count": 245,
          "meanMs": 11.571150612245125,
          "p95Ms": 47.66739999999845,
          "maxMs": 176.925900000002
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-2-s0\\p2-2-s0"
    },
    {
      "id": "p2-2-s1",
      "slot": 2,
      "seat": 1,
      "seed": 310002018,
      "opponent": "hard",
      "players": 2,
      "map": "(2) Icy Paths.aem",
      "category": "normal",
      "modelPlayer": 1,
      "initialSha256": "bab03e30fbe7e1b5b4a3c6b3090d52e6a0aa9bb069049983328a1cc780495b29",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 0,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 936,
          "ids": [
            1
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 937,
      "rounds": 22,
      "roots": 115,
      "witnessCount": 16,
      "witnessActions": 152,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 7186,
        "observations": 24258,
        "completed": 7186,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 94627.5476999995,
        "peakBatchSize": 32,
        "bytes": 1939135925,
        "decisionRequests": 7184,
        "decisionObservations": 24225,
        "completedDecisionObservations": 24225,
        "decisionWireMs": 92115.94139999952,
        "decisionPeakBatchSize": 29,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.499Z",
            "id": 7155,
            "count": 2,
            "bytes": 197748,
            "remainingMs": 2649.4493000000075
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.510Z",
            "id": 7155,
            "count": 2,
            "ms": 10.261200000008103
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.518Z",
            "id": 7156,
            "count": 3,
            "bytes": 321659,
            "remainingMs": 2631.0448000000033
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.529Z",
            "id": 7156,
            "count": 3,
            "ms": 11.319599999987986
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.533Z",
            "id": 7157,
            "count": 1,
            "bytes": 98954,
            "remainingMs": 2616.3306000000157
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.542Z",
            "id": 7157,
            "count": 1,
            "ms": 9.599700000020675
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.550Z",
            "id": 7158,
            "count": 3,
            "bytes": 320091,
            "remainingMs": 2598.888100000011
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.563Z",
            "id": 7158,
            "count": 3,
            "ms": 13.006599999993341
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.567Z",
            "id": 7159,
            "count": 1,
            "bytes": 91000,
            "remainingMs": 2582.1619000000064
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.578Z",
            "id": 7159,
            "count": 1,
            "ms": 10.897999999986496
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.586Z",
            "id": 7160,
            "count": 3,
            "bytes": 318491,
            "remainingMs": 2563.185200000007
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.600Z",
            "id": 7160,
            "count": 3,
            "ms": 14.021999999997206
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.605Z",
            "id": 7161,
            "count": 2,
            "bytes": 193707,
            "remainingMs": 2544.227500000008
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.617Z",
            "id": 7161,
            "count": 2,
            "ms": 12.782500000001164
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.625Z",
            "id": 7162,
            "count": 3,
            "bytes": 315579,
            "remainingMs": 2523.476800000004
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.639Z",
            "id": 7162,
            "count": 3,
            "ms": 13.369399999995949
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.648Z",
            "id": 7163,
            "count": 3,
            "bytes": 312763,
            "remainingMs": 2501.1835000000137
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.660Z",
            "id": 7163,
            "count": 3,
            "ms": 12.386700000002747
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.663Z",
            "id": 7164,
            "count": 1,
            "bytes": 98954,
            "remainingMs": 2485.7008000000205
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.673Z",
            "id": 7164,
            "count": 1,
            "ms": 10.138500000000931
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.680Z",
            "id": 7165,
            "count": 3,
            "bytes": 311547,
            "remainingMs": 2469.0512000000163
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.694Z",
            "id": 7165,
            "count": 3,
            "ms": 14.10010000001057
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.697Z",
            "id": 7166,
            "count": 1,
            "bytes": 94913,
            "remainingMs": 2452.128400000016
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.709Z",
            "id": 7166,
            "count": 1,
            "ms": 12.134000000020023
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.715Z",
            "id": 7167,
            "count": 3,
            "bytes": 310651,
            "remainingMs": 2433.6386000000057
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.729Z",
            "id": 7167,
            "count": 3,
            "ms": 13.428299999999581
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.736Z",
            "id": 7168,
            "count": 3,
            "bytes": 308986,
            "remainingMs": 2413.0997000000207
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.748Z",
            "id": 7168,
            "count": 3,
            "ms": 12.52980000001844
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.752Z",
            "id": 7169,
            "count": 2,
            "bytes": 185744,
            "remainingMs": 2396.7465000000084
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.763Z",
            "id": 7169,
            "count": 2,
            "ms": 10.388899999990826
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.769Z",
            "id": 7170,
            "count": 3,
            "bytes": 304040,
            "remainingMs": 2380.3125
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.782Z",
            "id": 7170,
            "count": 3,
            "ms": 13.309500000003027
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.789Z",
            "id": 7171,
            "count": 3,
            "bytes": 302983,
            "remainingMs": 2359.5755000000063
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.803Z",
            "id": 7171,
            "count": 3,
            "ms": 13.455799999996088
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.805Z",
            "id": 7172,
            "count": 1,
            "bytes": 91000,
            "remainingMs": 2343.532600000006
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.817Z",
            "id": 7172,
            "count": 1,
            "ms": 11.338400000007823
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.823Z",
            "id": 7173,
            "count": 3,
            "bytes": 301447,
            "remainingMs": 2325.3991000000096
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.836Z",
            "id": 7173,
            "count": 3,
            "ms": 12.578000000008615
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.843Z",
            "id": 7174,
            "count": 3,
            "bytes": 299527,
            "remainingMs": 2306.3705999999947
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.856Z",
            "id": 7174,
            "count": 3,
            "ms": 13.253899999981513
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.864Z",
            "id": 7175,
            "count": 3,
            "bytes": 298086,
            "remainingMs": 2284.596500000014
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.876Z",
            "id": 7175,
            "count": 3,
            "ms": 11.96150000000489
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.883Z",
            "id": 7176,
            "count": 3,
            "bytes": 295974,
            "remainingMs": 2266.3325000000186
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.894Z",
            "id": 7176,
            "count": 3,
            "ms": 11.80360000001383
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.900Z",
            "id": 7177,
            "count": 3,
            "bytes": 293862,
            "remainingMs": 2248.5630999999994
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.914Z",
            "id": 7177,
            "count": 3,
            "ms": 13.988899999996647
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.920Z",
            "id": 7178,
            "count": 3,
            "bytes": 292932,
            "remainingMs": 2228.642300000007
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.932Z",
            "id": 7178,
            "count": 3,
            "ms": 11.660700000007637
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.934Z",
            "id": 7179,
            "count": 1,
            "bytes": 94904,
            "remainingMs": 2214.527300000016
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.944Z",
            "id": 7179,
            "count": 1,
            "ms": 9.855000000010477
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.949Z",
            "id": 7180,
            "count": 3,
            "bytes": 290117,
            "remainingMs": 2200.2363999999943
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.962Z",
            "id": 7180,
            "count": 3,
            "ms": 12.976599999994505
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.965Z",
            "id": 7181,
            "count": 2,
            "bytes": 185900,
            "remainingMs": 2183.6585000000196
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.976Z",
            "id": 7181,
            "count": 2,
            "ms": 10.713000000017928
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.980Z",
            "id": 7182,
            "count": 3,
            "bytes": 287602,
            "remainingMs": 2168.6848000000173
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.992Z",
            "id": 7182,
            "count": 3,
            "ms": 11.464700000011362
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:46.997Z",
            "id": 7183,
            "count": 3,
            "bytes": 284688,
            "remainingMs": 2152.367500000022
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:47.009Z",
            "id": 7183,
            "count": 3,
            "ms": 12.79450000001816
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:47.014Z",
            "id": 7184,
            "count": 3,
            "bytes": 282509,
            "remainingMs": 2134.6696999999986
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:47.027Z",
            "id": 7184,
            "count": 3,
            "ms": 12.36819999999716
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:47.029Z",
            "id": 7185,
            "count": 1,
            "bytes": 91422,
            "remainingMs": 2119.962900000013
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:47.039Z",
            "id": 7185,
            "count": 1,
            "ms": 9.799700000003213
          },
          {
            "type": "request",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:47.044Z",
            "id": 7186,
            "count": 3,
            "bytes": 283958,
            "remainingMs": 2104.4624000000185
          },
          {
            "type": "response",
            "label": "p2-2-s1:step-807",
            "at": "2026-11-02T01:18:47.058Z",
            "id": 7186,
            "count": 3,
            "ms": 13.660300000017742
          }
        ],
        "packMs": 2523.5956000000688
      },
      "wallMs": 166676.3352,
      "latency": {
        "model": {
          "count": 240,
          "meanMs": 657.7751783333335,
          "p95Ms": 2127.017399999997,
          "maxMs": 2569.1173000000126
        },
        "opponent": {
          "count": 697,
          "meanMs": 9.906272453371907,
          "p95Ms": 33.12140000000363,
          "maxMs": 731.787799999991
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-2-s1\\p2-2-s1"
    },
    {
      "id": "p2-3-s0",
      "slot": 3,
      "seat": 0,
      "seed": 310003027,
      "opponent": "hard",
      "players": 2,
      "map": "(2) Liberty Port.aem",
      "category": "normal",
      "modelPlayer": 0,
      "initialSha256": "a6407021fbbbc3eb6ea674c77c64b79e0dc66249cc270436a801d8aa7f592d70",
      "firstToActPlayer": 0,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_win",
      "winner": 0,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 734,
          "ids": [
            1
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 735,
      "rounds": 19,
      "roots": 259,
      "witnessCount": 47,
      "witnessActions": 437,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 11343,
        "observations": 37834,
        "completed": 11343,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 142981.99949999855,
        "peakBatchSize": 32,
        "bytes": 2619389946,
        "decisionRequests": 11341,
        "decisionObservations": 37801,
        "completedDecisionObservations": 37801,
        "decisionWireMs": 140430.56879999855,
        "decisionPeakBatchSize": 23,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.662Z",
            "id": 11312,
            "count": 3,
            "bytes": 253063,
            "remainingMs": 2719.6884999999893
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.675Z",
            "id": 11312,
            "count": 3,
            "ms": 12.980400000000373
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.687Z",
            "id": 11313,
            "count": 3,
            "bytes": 262153,
            "remainingMs": 2694.7434999999823
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.699Z",
            "id": 11313,
            "count": 3,
            "ms": 11.707099999999627
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.703Z",
            "id": 11314,
            "count": 3,
            "bytes": 261571,
            "remainingMs": 2679.329700000002
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.714Z",
            "id": 11314,
            "count": 3,
            "ms": 11.411699999996927
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.719Z",
            "id": 11315,
            "count": 4,
            "bytes": 348329,
            "remainingMs": 2662.486600000004
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.732Z",
            "id": 11315,
            "count": 4,
            "ms": 12.231200000009267
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.750Z",
            "id": 11316,
            "count": 4,
            "bytes": 347368,
            "remainingMs": 2632.049700000003
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.766Z",
            "id": 11316,
            "count": 4,
            "ms": 15.979300000006333
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.782Z",
            "id": 11317,
            "count": 3,
            "bytes": 258484,
            "remainingMs": 2599.5278000000108
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.797Z",
            "id": 11317,
            "count": 3,
            "ms": 14.669400000013411
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.809Z",
            "id": 11318,
            "count": 2,
            "bytes": 171266,
            "remainingMs": 2572.828600000008
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.820Z",
            "id": 11318,
            "count": 2,
            "ms": 10.582900000008522
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.830Z",
            "id": 11319,
            "count": 2,
            "bytes": 170880,
            "remainingMs": 2551.5032000000065
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.841Z",
            "id": 11319,
            "count": 2,
            "ms": 10.647400000016205
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.850Z",
            "id": 11320,
            "count": 2,
            "bytes": 170080,
            "remainingMs": 2531.451399999991
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.861Z",
            "id": 11320,
            "count": 2,
            "ms": 10.4771999999939
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.869Z",
            "id": 11321,
            "count": 1,
            "bytes": 84461,
            "remainingMs": 2513.2531000000017
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.879Z",
            "id": 11321,
            "count": 1,
            "ms": 10.26469999999972
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.883Z",
            "id": 11322,
            "count": 1,
            "bytes": 87491,
            "remainingMs": 2498.544599999994
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.893Z",
            "id": 11322,
            "count": 1,
            "ms": 9.638399999996182
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.895Z",
            "id": 11323,
            "count": 1,
            "bytes": 87297,
            "remainingMs": 2487.176299999992
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-731",
            "at": "2026-11-02T01:22:36.904Z",
            "id": 11323,
            "count": 1,
            "ms": 9.310999999986961
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:36.912Z",
            "id": 11324,
            "count": 1,
            "bytes": 87506,
            "remainingMs": 2923.4858999999997
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:36.923Z",
            "id": 11324,
            "count": 1,
            "ms": 10.49000000001979
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:36.929Z",
            "id": 11325,
            "count": 1,
            "bytes": 87622,
            "remainingMs": 2906.8610000000044
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:36.939Z",
            "id": 11325,
            "count": 1,
            "ms": 9.892900000006193
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:36.941Z",
            "id": 11326,
            "count": 1,
            "bytes": 87297,
            "remainingMs": 2895.028900000005
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:36.951Z",
            "id": 11326,
            "count": 1,
            "ms": 10.03090000001248
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:36.962Z",
            "id": 11327,
            "count": 8,
            "bytes": 698745,
            "remainingMs": 2874.0697999999975
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:36.978Z",
            "id": 11327,
            "count": 8,
            "ms": 15.856499999994412
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:36.982Z",
            "id": 11328,
            "count": 4,
            "bytes": 347720,
            "remainingMs": 2853.420199999993
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:36.995Z",
            "id": 11328,
            "count": 4,
            "ms": 12.581399999995483
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.016Z",
            "id": 11329,
            "count": 4,
            "bytes": 345478,
            "remainingMs": 2819.6639999999898
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.034Z",
            "id": 11329,
            "count": 4,
            "ms": 17.768699999985984
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.051Z",
            "id": 11330,
            "count": 3,
            "bytes": 257520,
            "remainingMs": 2785.1184999999823
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.064Z",
            "id": 11330,
            "count": 3,
            "ms": 13.810799999977462
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.077Z",
            "id": 11331,
            "count": 3,
            "bytes": 257008,
            "remainingMs": 2758.3236000000034
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.092Z",
            "id": 11331,
            "count": 3,
            "ms": 14.107700000022305
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.105Z",
            "id": 11332,
            "count": 3,
            "bytes": 255760,
            "remainingMs": 2730.8740999999864
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.118Z",
            "id": 11332,
            "count": 3,
            "ms": 13.058400000008987
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.132Z",
            "id": 11333,
            "count": 3,
            "bytes": 253063,
            "remainingMs": 2703.876900000003
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.144Z",
            "id": 11333,
            "count": 3,
            "ms": 11.865200000000186
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.155Z",
            "id": 11334,
            "count": 3,
            "bytes": 262153,
            "remainingMs": 2680.282199999987
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.169Z",
            "id": 11334,
            "count": 3,
            "ms": 13.442899999994552
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.173Z",
            "id": 11335,
            "count": 3,
            "bytes": 261571,
            "remainingMs": 2663.0910999999905
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.188Z",
            "id": 11335,
            "count": 3,
            "ms": 15.615400000009686
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.192Z",
            "id": 11336,
            "count": 3,
            "bytes": 260214,
            "remainingMs": 2643.2613999999885
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.206Z",
            "id": 11336,
            "count": 3,
            "ms": 13.247000000003027
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.218Z",
            "id": 11337,
            "count": 2,
            "bytes": 172066,
            "remainingMs": 2617.268299999996
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.230Z",
            "id": 11337,
            "count": 2,
            "ms": 11.475600000005215
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.239Z",
            "id": 11338,
            "count": 2,
            "bytes": 171266,
            "remainingMs": 2596.7360000000044
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.251Z",
            "id": 11338,
            "count": 2,
            "ms": 12.242000000027474
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.260Z",
            "id": 11339,
            "count": 2,
            "bytes": 170880,
            "remainingMs": 2575.6487999999954
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.276Z",
            "id": 11339,
            "count": 2,
            "ms": 15.426700000010896
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.285Z",
            "id": 11340,
            "count": 2,
            "bytes": 170080,
            "remainingMs": 2551.219299999997
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.298Z",
            "id": 11340,
            "count": 2,
            "ms": 13.557800000009593
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.305Z",
            "id": 11341,
            "count": 1,
            "bytes": 84461,
            "remainingMs": 2530.260099999985
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.316Z",
            "id": 11341,
            "count": 1,
            "ms": 10.590999999985797
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.320Z",
            "id": 11342,
            "count": 1,
            "bytes": 87491,
            "remainingMs": 2515.391399999993
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.331Z",
            "id": 11342,
            "count": 1,
            "ms": 10.806500000006054
          },
          {
            "type": "request",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.333Z",
            "id": 11343,
            "count": 1,
            "bytes": 87297,
            "remainingMs": 2503.001199999999
          },
          {
            "type": "response",
            "label": "p2-3-s0:step-733",
            "at": "2026-11-02T01:22:37.344Z",
            "id": 11343,
            "count": 1,
            "ms": 10.831399999995483
          }
        ],
        "packMs": 3416.3021999990515
      },
      "wallMs": 224850.2757,
      "latency": {
        "model": {
          "count": 519,
          "meanMs": 427.66660019267766,
          "p95Ms": 1487.5595999999932,
          "maxMs": 1963.6699999999837
        },
        "opponent": {
          "count": 216,
          "meanMs": 5.943237500000192,
          "p95Ms": 26.33060000000114,
          "maxMs": 69.1368999999977
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-3-s0\\p2-3-s0"
    },
    {
      "id": "p2-3-s1",
      "slot": 3,
      "seat": 1,
      "seed": 310003027,
      "opponent": "hard",
      "players": 2,
      "map": "(2) Liberty Port.aem",
      "category": "normal",
      "modelPlayer": 1,
      "initialSha256": "a6407021fbbbc3eb6ea674c77c64b79e0dc66249cc270436a801d8aa7f592d70",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 0,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 1075,
          "ids": [
            1
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 1076,
      "rounds": 28,
      "roots": 195,
      "witnessCount": 29,
      "witnessActions": 418,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 11260,
        "observations": 38079,
        "completed": 11260,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 142344.8822000005,
        "peakBatchSize": 32,
        "bytes": 2555967053,
        "decisionRequests": 11258,
        "decisionObservations": 38046,
        "completedDecisionObservations": 38046,
        "decisionWireMs": 139797.2463000005,
        "decisionPeakBatchSize": 21,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.437Z",
            "id": 11229,
            "count": 1,
            "bytes": 72413,
            "remainingMs": 2722.1173999999883
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.449Z",
            "id": 11229,
            "count": 1,
            "ms": 11.92359999998007
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.455Z",
            "id": 11230,
            "count": 3,
            "bytes": 238284,
            "remainingMs": 2703.974099999992
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.467Z",
            "id": 11230,
            "count": 3,
            "ms": 12.122999999992317
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.476Z",
            "id": 11231,
            "count": 2,
            "bytes": 141263,
            "remainingMs": 2682.4995000000054
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.489Z",
            "id": 11231,
            "count": 2,
            "ms": 12.814899999997579
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.495Z",
            "id": 11232,
            "count": 3,
            "bytes": 237804,
            "remainingMs": 2664.0743000000075
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.507Z",
            "id": 11232,
            "count": 3,
            "ms": 12.559500000003027
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.519Z",
            "id": 11233,
            "count": 3,
            "bytes": 210097,
            "remainingMs": 2639.7767999999924
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.532Z",
            "id": 11233,
            "count": 3,
            "ms": 13.100799999985611
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.540Z",
            "id": 11234,
            "count": 3,
            "bytes": 236588,
            "remainingMs": 2618.896399999998
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.552Z",
            "id": 11234,
            "count": 3,
            "ms": 12.373699999996461
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.561Z",
            "id": 11235,
            "count": 1,
            "bytes": 69003,
            "remainingMs": 2598.0792000000074
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.572Z",
            "id": 11235,
            "count": 1,
            "ms": 11.229400000011083
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.577Z",
            "id": 11236,
            "count": 3,
            "bytes": 235692,
            "remainingMs": 2581.9083999999857
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.591Z",
            "id": 11236,
            "count": 3,
            "ms": 13.695999999996275
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.602Z",
            "id": 11237,
            "count": 3,
            "bytes": 233612,
            "remainingMs": 2556.5524999999907
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.615Z",
            "id": 11237,
            "count": 3,
            "ms": 12.215800000005402
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.626Z",
            "id": 11238,
            "count": 3,
            "bytes": 232393,
            "remainingMs": 2533.057199999981
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.640Z",
            "id": 11238,
            "count": 3,
            "ms": 14.353699999977835
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.651Z",
            "id": 11239,
            "count": 3,
            "bytes": 231144,
            "remainingMs": 2507.4612999999954
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.663Z",
            "id": 11239,
            "count": 3,
            "ms": 11.557100000005448
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.674Z",
            "id": 11240,
            "count": 3,
            "bytes": 229416,
            "remainingMs": 2484.5694000000076
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.686Z",
            "id": 11240,
            "count": 3,
            "ms": 11.70350000000326
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.697Z",
            "id": 11241,
            "count": 3,
            "bytes": 227816,
            "remainingMs": 2462.0417000000016
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.710Z",
            "id": 11241,
            "count": 3,
            "ms": 12.862900000007357
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.720Z",
            "id": 11242,
            "count": 3,
            "bytes": 226600,
            "remainingMs": 2438.614100000006
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.733Z",
            "id": 11242,
            "count": 3,
            "ms": 12.38990000000922
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.743Z",
            "id": 11243,
            "count": 3,
            "bytes": 224295,
            "remainingMs": 2415.8059000000067
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.754Z",
            "id": 11243,
            "count": 3,
            "ms": 11.175800000026356
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.765Z",
            "id": 11244,
            "count": 3,
            "bytes": 223237,
            "remainingMs": 2394.359599999996
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.777Z",
            "id": 11244,
            "count": 3,
            "ms": 12.267900000006193
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.787Z",
            "id": 11245,
            "count": 3,
            "bytes": 222245,
            "remainingMs": 2372.1919000000053
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.799Z",
            "id": 11245,
            "count": 3,
            "ms": 12.38220000002184
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.807Z",
            "id": 11246,
            "count": 2,
            "bytes": 141263,
            "remainingMs": 2351.6217999999935
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.818Z",
            "id": 11246,
            "count": 2,
            "ms": 11.144999999989523
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.823Z",
            "id": 11247,
            "count": 3,
            "bytes": 221572,
            "remainingMs": 2336.2063999999955
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.838Z",
            "id": 11247,
            "count": 3,
            "ms": 15.191699999995762
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.847Z",
            "id": 11248,
            "count": 1,
            "bytes": 69012,
            "remainingMs": 2312.0993000000017
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.859Z",
            "id": 11248,
            "count": 1,
            "ms": 11.78770000001532
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.864Z",
            "id": 11249,
            "count": 3,
            "bytes": 219216,
            "remainingMs": 2295.4233999999997
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.876Z",
            "id": 11249,
            "count": 3,
            "ms": 12.114000000001397
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.883Z",
            "id": 11250,
            "count": 3,
            "bytes": 217804,
            "remainingMs": 2276.302399999986
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.895Z",
            "id": 11250,
            "count": 3,
            "ms": 12.513699999981327
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.903Z",
            "id": 11251,
            "count": 3,
            "bytes": 216556,
            "remainingMs": 2255.6944999999832
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.917Z",
            "id": 11251,
            "count": 3,
            "ms": 13.58039999997709
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.925Z",
            "id": 11252,
            "count": 3,
            "bytes": 214988,
            "remainingMs": 2234.415699999983
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.936Z",
            "id": 11252,
            "count": 3,
            "ms": 11.860599999985425
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.943Z",
            "id": 11253,
            "count": 3,
            "bytes": 213447,
            "remainingMs": 2215.9431999999797
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.956Z",
            "id": 11253,
            "count": 3,
            "ms": 13.278299999976298
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.961Z",
            "id": 11254,
            "count": 1,
            "bytes": 77037,
            "remainingMs": 2197.949499999988
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.971Z",
            "id": 11254,
            "count": 1,
            "ms": 9.709700000006706
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.973Z",
            "id": 11255,
            "count": 2,
            "bytes": 138542,
            "remainingMs": 2185.485799999995
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.985Z",
            "id": 11255,
            "count": 2,
            "ms": 11.88320000001113
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:26.990Z",
            "id": 11256,
            "count": 2,
            "bytes": 146279,
            "remainingMs": 2168.8306999999913
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:27.003Z",
            "id": 11256,
            "count": 2,
            "ms": 12.769700000004377
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:27.005Z",
            "id": 11257,
            "count": 2,
            "bytes": 145056,
            "remainingMs": 2153.5277999999817
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:27.017Z",
            "id": 11257,
            "count": 2,
            "ms": 11.33629999999539
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:27.020Z",
            "id": 11258,
            "count": 2,
            "bytes": 153273,
            "remainingMs": 2138.962499999994
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:27.031Z",
            "id": 11258,
            "count": 2,
            "ms": 11.404199999989942
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:27.034Z",
            "id": 11259,
            "count": 2,
            "bytes": 151919,
            "remainingMs": 2124.8833999999915
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:27.045Z",
            "id": 11259,
            "count": 2,
            "ms": 11.153300000005402
          },
          {
            "type": "request",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:27.052Z",
            "id": 11260,
            "count": 3,
            "bytes": 238721,
            "remainingMs": 2106.9119000000064
          },
          {
            "type": "response",
            "label": "p2-3-s1:step-988",
            "at": "2026-11-02T01:26:27.065Z",
            "id": 11260,
            "count": 3,
            "ms": 12.67290000000503
          }
        ],
        "packMs": 3346.9194000000116
      },
      "wallMs": 225414.0087,
      "latency": {
        "model": {
          "count": 390,
          "meanMs": 560.0821400000002,
          "p95Ms": 1726.636400000003,
          "maxMs": 2164.6424000000115
        },
        "opponent": {
          "count": 686,
          "meanMs": 7.043558892128271,
          "p95Ms": 23.45110000000568,
          "maxMs": 271.0626000000011
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-3-s1\\p2-3-s1"
    },
    {
      "id": "p2-4-s0",
      "slot": 4,
      "seat": 0,
      "seed": 310004036,
      "opponent": "hard",
      "players": 2,
      "map": "(2) Mourningstar.aem",
      "category": "normal",
      "modelPlayer": 0,
      "initialSha256": "5836674eed1f2d3698e01f9a44bed5ba2adeb96628350455d2efb862ef280305",
      "firstToActPlayer": 0,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_loss",
      "winner": 1,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 516,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 517,
      "rounds": 16,
      "roots": 80,
      "witnessCount": 11,
      "witnessActions": 87,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 3256,
        "observations": 12551,
        "completed": 3256,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 43181.20849999981,
        "peakBatchSize": 32,
        "bytes": 550320652,
        "decisionRequests": 3254,
        "decisionObservations": 12518,
        "completedDecisionObservations": 12518,
        "decisionWireMs": 40623.20419999981,
        "decisionPeakBatchSize": 19,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-4-s0:step-495",
            "at": "2026-11-02T01:27:34.982Z",
            "id": 3225,
            "count": 1,
            "bytes": 47358,
            "remainingMs": 2470.2859000000026
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-495",
            "at": "2026-11-02T01:27:34.993Z",
            "id": 3225,
            "count": 1,
            "ms": 10.77049999999872
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-495",
            "at": "2026-11-02T01:27:34.995Z",
            "id": 3226,
            "count": 1,
            "bytes": 46366,
            "remainingMs": 2456.982600000003
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-495",
            "at": "2026-11-02T01:27:35.006Z",
            "id": 3226,
            "count": 1,
            "ms": 11.238400000002002
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-495",
            "at": "2026-11-02T01:27:35.010Z",
            "id": 3227,
            "count": 1,
            "bytes": 54291,
            "remainingMs": 2442.081099999996
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-495",
            "at": "2026-11-02T01:27:35.021Z",
            "id": 3227,
            "count": 1,
            "ms": 10.952399999994668
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.025Z",
            "id": 3228,
            "count": 1,
            "bytes": 47448,
            "remainingMs": 2924.082699999999
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.035Z",
            "id": 3228,
            "count": 1,
            "ms": 10.006000000008498
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.040Z",
            "id": 3229,
            "count": 3,
            "bytes": 151828,
            "remainingMs": 2909.101299999995
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.051Z",
            "id": 3229,
            "count": 3,
            "ms": 10.917700000005425
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.057Z",
            "id": 3230,
            "count": 5,
            "bytes": 250471,
            "remainingMs": 2892.1137000000017
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.070Z",
            "id": 3230,
            "count": 5,
            "ms": 13.695100000011735
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.091Z",
            "id": 3231,
            "count": 11,
            "bytes": 630006,
            "remainingMs": 2857.4622999999992
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.113Z",
            "id": 3231,
            "count": 11,
            "ms": 21.269000000000233
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.117Z",
            "id": 3232,
            "count": 3,
            "bytes": 172231,
            "remainingMs": 2831.5255999999936
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.130Z",
            "id": 3232,
            "count": 3,
            "ms": 12.534199999994598
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.139Z",
            "id": 3233,
            "count": 3,
            "bytes": 141888,
            "remainingMs": 2809.7455999999947
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.152Z",
            "id": 3233,
            "count": 3,
            "ms": 13.086899999994785
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.160Z",
            "id": 3234,
            "count": 3,
            "bytes": 170575,
            "remainingMs": 2788.988799999992
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.171Z",
            "id": 3234,
            "count": 3,
            "ms": 11.265700000003562
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.178Z",
            "id": 3235,
            "count": 2,
            "bytes": 94624,
            "remainingMs": 2770.8557
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.188Z",
            "id": 3235,
            "count": 2,
            "ms": 10.061000000001513
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.194Z",
            "id": 3236,
            "count": 3,
            "bytes": 169143,
            "remainingMs": 2755.1150999999954
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.205Z",
            "id": 3236,
            "count": 3,
            "ms": 11.086100000000442
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.211Z",
            "id": 3237,
            "count": 1,
            "bytes": 47424,
            "remainingMs": 2737.518100000001
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.223Z",
            "id": 3237,
            "count": 1,
            "ms": 12.14310000000114
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.228Z",
            "id": 3238,
            "count": 3,
            "bytes": 162533,
            "remainingMs": 2720.2975000000006
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.241Z",
            "id": 3238,
            "count": 3,
            "ms": 12.38870000001043
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.247Z",
            "id": 3239,
            "count": 1,
            "bytes": 47424,
            "remainingMs": 2701.914599999989
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.258Z",
            "id": 3239,
            "count": 1,
            "ms": 11.198399999993853
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.263Z",
            "id": 3240,
            "count": 3,
            "bytes": 158852,
            "remainingMs": 2685.4032000000007
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.277Z",
            "id": 3240,
            "count": 3,
            "ms": 13.335700000010547
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.282Z",
            "id": 3241,
            "count": 2,
            "bytes": 89358,
            "remainingMs": 2666.3419999999896
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.294Z",
            "id": 3241,
            "count": 2,
            "ms": 11.97389999999723
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.299Z",
            "id": 3242,
            "count": 3,
            "bytes": 157636,
            "remainingMs": 2649.409599999999
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.311Z",
            "id": 3242,
            "count": 3,
            "ms": 12.032700000010664
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.317Z",
            "id": 3243,
            "count": 2,
            "bytes": 89391,
            "remainingMs": 2631.511799999993
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.329Z",
            "id": 3243,
            "count": 2,
            "ms": 11.366599999993923
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.333Z",
            "id": 3244,
            "count": 3,
            "bytes": 154167,
            "remainingMs": 2616.0334000000003
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.344Z",
            "id": 3244,
            "count": 3,
            "ms": 11.20339999999851
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.350Z",
            "id": 3245,
            "count": 2,
            "bytes": 86877,
            "remainingMs": 2599.121699999989
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.362Z",
            "id": 3245,
            "count": 2,
            "ms": 12.616399999998976
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.365Z",
            "id": 3246,
            "count": 2,
            "bytes": 103750,
            "remainingMs": 2583.4835999999923
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.377Z",
            "id": 3246,
            "count": 2,
            "ms": 11.905899999997928
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.383Z",
            "id": 3247,
            "count": 2,
            "bytes": 102758,
            "remainingMs": 2566.070200000002
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.396Z",
            "id": 3247,
            "count": 2,
            "ms": 13.04320000000007
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.400Z",
            "id": 3248,
            "count": 1,
            "bytes": 44766,
            "remainingMs": 2549.1321000000025
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.411Z",
            "id": 3248,
            "count": 1,
            "ms": 11.631000000008498
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.414Z",
            "id": 3249,
            "count": 2,
            "bytes": 101606,
            "remainingMs": 2534.8987999999954
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.426Z",
            "id": 3249,
            "count": 2,
            "ms": 11.628700000001118
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.431Z",
            "id": 3250,
            "count": 2,
            "bytes": 100582,
            "remainingMs": 2517.765299999999
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.443Z",
            "id": 3250,
            "count": 2,
            "ms": 11.474700000006123
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.448Z",
            "id": 3251,
            "count": 2,
            "bytes": 98854,
            "remainingMs": 2501.1057999999903
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.459Z",
            "id": 3251,
            "count": 2,
            "ms": 11.067199999990407
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.464Z",
            "id": 3252,
            "count": 2,
            "bytes": 97452,
            "remainingMs": 2484.7872999999963
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.475Z",
            "id": 3252,
            "count": 2,
            "ms": 10.540699999997742
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.479Z",
            "id": 3253,
            "count": 2,
            "bytes": 95665,
            "remainingMs": 2469.4294999999984
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.490Z",
            "id": 3253,
            "count": 2,
            "ms": 10.222300000008545
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.494Z",
            "id": 3254,
            "count": 2,
            "bytes": 93518,
            "remainingMs": 2454.3065999999963
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.505Z",
            "id": 3254,
            "count": 2,
            "ms": 10.361399999994319
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.508Z",
            "id": 3255,
            "count": 1,
            "bytes": 46366,
            "remainingMs": 2440.336899999995
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.519Z",
            "id": 3255,
            "count": 1,
            "ms": 10.178299999999581
          },
          {
            "type": "request",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.522Z",
            "id": 3256,
            "count": 2,
            "bytes": 98932,
            "remainingMs": 2426.31779999999
          },
          {
            "type": "response",
            "label": "p2-4-s0:step-496",
            "at": "2026-11-02T01:27:35.534Z",
            "id": 3256,
            "count": 2,
            "ms": 11.867599999997765
          }
        ],
        "packMs": 844.4432999999162
      },
      "wallMs": 63376.649000000005,
      "latency": {
        "model": {
          "count": 170,
          "meanMs": 349.45084176470573,
          "p95Ms": 1265.461900000002,
          "maxMs": 1557.2252000000008
        },
        "opponent": {
          "count": 347,
          "meanMs": 8.558276657060233,
          "p95Ms": 27.32549999999901,
          "maxMs": 237.03640000000087
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-4-s0\\p2-4-s0"
    },
    {
      "id": "p2-4-s1",
      "slot": 4,
      "seat": 1,
      "seed": 310004036,
      "opponent": "hard",
      "players": 2,
      "map": "(2) Mourningstar.aem",
      "category": "normal",
      "modelPlayer": 1,
      "initialSha256": "5836674eed1f2d3698e01f9a44bed5ba2adeb96628350455d2efb862ef280305",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 0,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 689,
          "ids": [
            1
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 690,
      "rounds": 20,
      "roots": 90,
      "witnessCount": 16,
      "witnessActions": 142,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 4565,
        "observations": 15632,
        "completed": 4565,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 57785.56140000005,
        "peakBatchSize": 32,
        "bytes": 742416938,
        "decisionRequests": 4563,
        "decisionObservations": 15599,
        "completedDecisionObservations": 15599,
        "decisionWireMs": 55297.457000000046,
        "decisionPeakBatchSize": 21,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.506Z",
            "id": 4534,
            "count": 1,
            "bytes": 66435,
            "remainingMs": 2411.479600000006
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.515Z",
            "id": 4534,
            "count": 1,
            "ms": 9.277000000001863
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.516Z",
            "id": 4535,
            "count": 1,
            "bytes": 66210,
            "remainingMs": 2400.973100000003
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.527Z",
            "id": 4535,
            "count": 1,
            "ms": 10.724100000006729
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.529Z",
            "id": 4536,
            "count": 1,
            "bytes": 59373,
            "remainingMs": 2388.6886000000086
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.541Z",
            "id": 4536,
            "count": 1,
            "ms": 12.762800000011339
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.543Z",
            "id": 4537,
            "count": 1,
            "bytes": 76266,
            "remainingMs": 2374.328600000008
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.555Z",
            "id": 4537,
            "count": 1,
            "ms": 12.245000000009895
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.558Z",
            "id": 4538,
            "count": 1,
            "bytes": 75562,
            "remainingMs": 2359.1484000000055
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.569Z",
            "id": 4538,
            "count": 1,
            "ms": 10.474600000001374
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.571Z",
            "id": 4539,
            "count": 1,
            "bytes": 75210,
            "remainingMs": 2346.0464999999967
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.582Z",
            "id": 4539,
            "count": 1,
            "ms": 10.933599999989383
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.585Z",
            "id": 4540,
            "count": 1,
            "bytes": 74794,
            "remainingMs": 2332.523199999996
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.598Z",
            "id": 4540,
            "count": 1,
            "ms": 13.07709999999497
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.600Z",
            "id": 4541,
            "count": 1,
            "bytes": 74090,
            "remainingMs": 2317.040500000003
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.612Z",
            "id": 4541,
            "count": 1,
            "ms": 11.443599999998696
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.614Z",
            "id": 4542,
            "count": 1,
            "bytes": 73513,
            "remainingMs": 2303.2964999999967
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.625Z",
            "id": 4542,
            "count": 1,
            "ms": 10.663300000000163
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.627Z",
            "id": 4543,
            "count": 1,
            "bytes": 73097,
            "remainingMs": 2290.168000000005
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.639Z",
            "id": 4543,
            "count": 1,
            "ms": 11.343699999997625
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.641Z",
            "id": 4544,
            "count": 1,
            "bytes": 72873,
            "remainingMs": 2276.192200000005
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.653Z",
            "id": 4544,
            "count": 1,
            "ms": 11.622499999997672
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.655Z",
            "id": 4545,
            "count": 1,
            "bytes": 71913,
            "remainingMs": 2262.3022000000055
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.666Z",
            "id": 4545,
            "count": 1,
            "ms": 10.899400000009337
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.668Z",
            "id": 4546,
            "count": 1,
            "bytes": 71785,
            "remainingMs": 2249.190499999997
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.680Z",
            "id": 4546,
            "count": 1,
            "ms": 12.067299999995157
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.682Z",
            "id": 4547,
            "count": 1,
            "bytes": 71625,
            "remainingMs": 2234.876900000003
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.694Z",
            "id": 4547,
            "count": 1,
            "ms": 11.24330000000191
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.695Z",
            "id": 4548,
            "count": 1,
            "bytes": 65975,
            "remainingMs": 2221.9061999999976
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.709Z",
            "id": 4548,
            "count": 1,
            "ms": 13.551699999996345
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.711Z",
            "id": 4549,
            "count": 1,
            "bytes": 71217,
            "remainingMs": 2206.729600000006
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.722Z",
            "id": 4549,
            "count": 1,
            "ms": 11.306500000006054
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.723Z",
            "id": 4550,
            "count": 1,
            "bytes": 65885,
            "remainingMs": 2193.9331999999995
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.734Z",
            "id": 4550,
            "count": 1,
            "ms": 10.694499999997788
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.736Z",
            "id": 4551,
            "count": 1,
            "bytes": 70865,
            "remainingMs": 2181.582600000009
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.747Z",
            "id": 4551,
            "count": 1,
            "ms": 11.694800000012037
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.749Z",
            "id": 4552,
            "count": 1,
            "bytes": 65885,
            "remainingMs": 2168.4087
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.760Z",
            "id": 4552,
            "count": 1,
            "ms": 11.098299999997835
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.762Z",
            "id": 4553,
            "count": 1,
            "bytes": 70609,
            "remainingMs": 2155.7281999999977
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.773Z",
            "id": 4553,
            "count": 1,
            "ms": 11.275299999993877
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.775Z",
            "id": 4554,
            "count": 1,
            "bytes": 70289,
            "remainingMs": 2142.6077000000078
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.785Z",
            "id": 4554,
            "count": 1,
            "ms": 10.57850000000326
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.787Z",
            "id": 4555,
            "count": 1,
            "bytes": 65910,
            "remainingMs": 2130.7122999999992
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.798Z",
            "id": 4555,
            "count": 1,
            "ms": 11.561999999990803
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.800Z",
            "id": 4556,
            "count": 1,
            "bytes": 69881,
            "remainingMs": 2117.6900000000023
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.811Z",
            "id": 4556,
            "count": 1,
            "ms": 11.741200000004028
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.813Z",
            "id": 4557,
            "count": 1,
            "bytes": 69752,
            "remainingMs": 2104.2495999999956
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.824Z",
            "id": 4557,
            "count": 1,
            "ms": 10.98839999998745
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.826Z",
            "id": 4558,
            "count": 1,
            "bytes": 65942,
            "remainingMs": 2091.810500000007
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.837Z",
            "id": 4558,
            "count": 1,
            "ms": 11.478600000002189
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.838Z",
            "id": 4559,
            "count": 1,
            "bytes": 69248,
            "remainingMs": 2078.923900000009
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.851Z",
            "id": 4559,
            "count": 1,
            "ms": 12.383500000010827
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.853Z",
            "id": 4560,
            "count": 1,
            "bytes": 68957,
            "remainingMs": 2064.583200000008
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.864Z",
            "id": 4560,
            "count": 1,
            "ms": 11.186600000000908
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.865Z",
            "id": 4561,
            "count": 1,
            "bytes": 65910,
            "remainingMs": 2052.0409999999974
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.877Z",
            "id": 4561,
            "count": 1,
            "ms": 11.666799999991781
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.878Z",
            "id": 4562,
            "count": 1,
            "bytes": 68389,
            "remainingMs": 2039.1255999999994
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.891Z",
            "id": 4562,
            "count": 1,
            "ms": 13.236600000003818
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.893Z",
            "id": 4563,
            "count": 1,
            "bytes": 67781,
            "remainingMs": 2024.1854000000021
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.906Z",
            "id": 4563,
            "count": 1,
            "ms": 13.139400000000023
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.908Z",
            "id": 4564,
            "count": 1,
            "bytes": 66692,
            "remainingMs": 2009.6252999999997
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.918Z",
            "id": 4564,
            "count": 1,
            "ms": 10.691099999996368
          },
          {
            "type": "request",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.920Z",
            "id": 4565,
            "count": 1,
            "bytes": 59333,
            "remainingMs": 1997.4511000000057
          },
          {
            "type": "response",
            "label": "p2-4-s1:step-668",
            "at": "2026-11-02T01:29:05.930Z",
            "id": 4565,
            "count": 1,
            "ms": 10.503599999996368
          }
        ],
        "packMs": 1120.4554999999862
      },
      "wallMs": 85692.3635,
      "latency": {
        "model": {
          "count": 177,
          "meanMs": 456.15623841807906,
          "p95Ms": 1483.199999999997,
          "maxMs": 1729.6233000000066
        },
        "opponent": {
          "count": 513,
          "meanMs": 7.0907789473686025,
          "p95Ms": 26.12739999999758,
          "maxMs": 641.1025999999983
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-4-s1\\p2-4-s1"
    },
    {
      "id": "p2-5-s0",
      "slot": 5,
      "seat": 0,
      "seed": 310005045,
      "opponent": "hard",
      "players": 2,
      "map": "(2) Peak Island.aem",
      "category": "normal",
      "modelPlayer": 0,
      "initialSha256": "0845d887a502f5d7c5569ccbba36309f15424c09005e4b99469cfabd12c74ea9",
      "firstToActPlayer": 0,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_loss",
      "winner": 1,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 638,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 639,
      "rounds": 17,
      "roots": 146,
      "witnessCount": 40,
      "witnessActions": 353,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 7507,
        "observations": 24661,
        "completed": 7507,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 94424.71630000068,
        "peakBatchSize": 32,
        "bytes": 1638159379,
        "decisionRequests": 7505,
        "decisionObservations": 24628,
        "completedDecisionObservations": 24628,
        "decisionWireMs": 91897.79140000069,
        "decisionPeakBatchSize": 25,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.126Z",
            "id": 7476,
            "count": 4,
            "bytes": 281743,
            "remainingMs": 2680.618199999997
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.138Z",
            "id": 7476,
            "count": 4,
            "ms": 11.91589999999269
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.153Z",
            "id": 7477,
            "count": 3,
            "bytes": 184298,
            "remainingMs": 2652.834600000002
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.164Z",
            "id": 7477,
            "count": 3,
            "ms": 10.949200000002747
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.168Z",
            "id": 7478,
            "count": 2,
            "bytes": 140055,
            "remainingMs": 2638.0339000000095
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.179Z",
            "id": 7478,
            "count": 2,
            "ms": 10.532399999996414
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.187Z",
            "id": 7479,
            "count": 1,
            "bytes": 61543,
            "remainingMs": 2619.6646000000183
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.197Z",
            "id": 7479,
            "count": 1,
            "ms": 9.93640000000596
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.200Z",
            "id": 7480,
            "count": 2,
            "bytes": 137782,
            "remainingMs": 2606.1211000000185
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.212Z",
            "id": 7480,
            "count": 2,
            "ms": 11.689400000002934
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.222Z",
            "id": 7481,
            "count": 2,
            "bytes": 135605,
            "remainingMs": 2584.7108000000007
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.233Z",
            "id": 7481,
            "count": 2,
            "ms": 11.364799999981187
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.240Z",
            "id": 7482,
            "count": 1,
            "bytes": 61543,
            "remainingMs": 2565.9711000000243
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.251Z",
            "id": 7482,
            "count": 1,
            "ms": 10.56970000002184
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.253Z",
            "id": 7483,
            "count": 1,
            "bytes": 67563,
            "remainingMs": 2553.7110000000102
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.265Z",
            "id": 7483,
            "count": 1,
            "ms": 12.74890000000596
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.270Z",
            "id": 7484,
            "count": 1,
            "bytes": 67083,
            "remainingMs": 2536.436300000001
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.280Z",
            "id": 7484,
            "count": 1,
            "ms": 10.251399999979185
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.284Z",
            "id": 7485,
            "count": 1,
            "bytes": 66667,
            "remainingMs": 2521.86970000001
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.294Z",
            "id": 7485,
            "count": 1,
            "ms": 10.096799999999348
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.299Z",
            "id": 7486,
            "count": 1,
            "bytes": 65930,
            "remainingMs": 2507.400500000018
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.310Z",
            "id": 7486,
            "count": 1,
            "ms": 11.386300000012852
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.315Z",
            "id": 7487,
            "count": 1,
            "bytes": 65417,
            "remainingMs": 2491.6679000000004
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.325Z",
            "id": 7487,
            "count": 1,
            "ms": 10.124400000000605
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.329Z",
            "id": 7488,
            "count": 1,
            "bytes": 61559,
            "remainingMs": 2477.721900000004
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.339Z",
            "id": 7488,
            "count": 1,
            "ms": 10.373200000001816
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.340Z",
            "id": 7489,
            "count": 1,
            "bytes": 64721,
            "remainingMs": 2465.91810000001
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.351Z",
            "id": 7489,
            "count": 1,
            "ms": 10.200600000011036
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.355Z",
            "id": 7490,
            "count": 1,
            "bytes": 65976,
            "remainingMs": 2451.5175000000163
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.365Z",
            "id": 7490,
            "count": 1,
            "ms": 10.71840000001248
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.367Z",
            "id": 7491,
            "count": 1,
            "bytes": 64304,
            "remainingMs": 2439.231300000014
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.378Z",
            "id": 7491,
            "count": 1,
            "ms": 11.07050000000163
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.379Z",
            "id": 7492,
            "count": 1,
            "bytes": 64369,
            "remainingMs": 2426.8932000000204
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.391Z",
            "id": 7492,
            "count": 1,
            "ms": 11.200899999996182
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.392Z",
            "id": 7493,
            "count": 1,
            "bytes": 67000,
            "remainingMs": 2414.1981000000087
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.403Z",
            "id": 7493,
            "count": 1,
            "ms": 10.925699999992503
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.405Z",
            "id": 7494,
            "count": 1,
            "bytes": 67679,
            "remainingMs": 2400.799700000003
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.415Z",
            "id": 7494,
            "count": 1,
            "ms": 9.45449999999255
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.416Z",
            "id": 7495,
            "count": 1,
            "bytes": 67193,
            "remainingMs": 2390.050500000012
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.426Z",
            "id": 7495,
            "count": 1,
            "ms": 9.348200000007637
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.432Z",
            "id": 7496,
            "count": 4,
            "bytes": 287504,
            "remainingMs": 2374.277700000006
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.446Z",
            "id": 7496,
            "count": 4,
            "ms": 13.978999999992084
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.464Z",
            "id": 7497,
            "count": 4,
            "bytes": 245681,
            "remainingMs": 2341.8629000000074
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.477Z",
            "id": 7497,
            "count": 4,
            "ms": 12.388299999991432
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.485Z",
            "id": 7498,
            "count": 4,
            "bytes": 285519,
            "remainingMs": 2321.0597000000125
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.499Z",
            "id": 7498,
            "count": 4,
            "ms": 14.20319999998901
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.519Z",
            "id": 7499,
            "count": 4,
            "bytes": 245672,
            "remainingMs": 2287.0624000000244
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.533Z",
            "id": 7499,
            "count": 4,
            "ms": 13.533000000024913
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.540Z",
            "id": 7500,
            "count": 4,
            "bytes": 283407,
            "remainingMs": 2265.861900000018
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.553Z",
            "id": 7500,
            "count": 4,
            "ms": 12.329900000011548
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.569Z",
            "id": 7501,
            "count": 4,
            "bytes": 245715,
            "remainingMs": 2237.2346000000252
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.581Z",
            "id": 7501,
            "count": 4,
            "ms": 11.88310000000638
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.589Z",
            "id": 7502,
            "count": 4,
            "bytes": 281487,
            "remainingMs": 2217.476500000019
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.603Z",
            "id": 7502,
            "count": 4,
            "ms": 14.121899999998277
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.618Z",
            "id": 7503,
            "count": 3,
            "bytes": 184307,
            "remainingMs": 2188.136300000013
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.629Z",
            "id": 7503,
            "count": 3,
            "ms": 10.9377000000095
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.635Z",
            "id": 7504,
            "count": 3,
            "bytes": 208642,
            "remainingMs": 2171.704300000012
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.648Z",
            "id": 7504,
            "count": 3,
            "ms": 13.109900000010384
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.660Z",
            "id": 7505,
            "count": 3,
            "bytes": 184307,
            "remainingMs": 2146.5366000000213
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.671Z",
            "id": 7505,
            "count": 3,
            "ms": 11.103800000011688
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.674Z",
            "id": 7506,
            "count": 2,
            "bytes": 137910,
            "remainingMs": 2131.7788
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.690Z",
            "id": 7506,
            "count": 2,
            "ms": 15.146199999988312
          },
          {
            "type": "request",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.698Z",
            "id": 7507,
            "count": 2,
            "bytes": 122924,
            "remainingMs": 2108.0963000000047
          },
          {
            "type": "response",
            "label": "p2-5-s0:step-620",
            "at": "2026-11-02T01:31:31.709Z",
            "id": 7507,
            "count": 2,
            "ms": 10.788199999980861
          }
        ],
        "packMs": 2178.550899998791
      },
      "wallMs": 141147.451,
      "latency": {
        "model": {
          "count": 295,
          "meanMs": 465.96571966101635,
          "p95Ms": 1538.3904000000039,
          "maxMs": 2018.6754999999976
        },
        "opponent": {
          "count": 344,
          "meanMs": 6.835081976744301,
          "p95Ms": 25.232700000000477,
          "maxMs": 85.00659999999334
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-5-s0\\p2-5-s0"
    },
    {
      "id": "p2-5-s1",
      "slot": 5,
      "seat": 1,
      "seed": 310005045,
      "opponent": "hard",
      "players": 2,
      "map": "(2) Peak Island.aem",
      "category": "normal",
      "modelPlayer": 1,
      "initialSha256": "0845d887a502f5d7c5569ccbba36309f15424c09005e4b99469cfabd12c74ea9",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 0,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 423,
          "ids": [
            1
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 424,
      "rounds": 13,
      "roots": 73,
      "witnessCount": 16,
      "witnessActions": 160,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 3658,
        "observations": 11902,
        "completed": 3658,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 46949.76680000008,
        "peakBatchSize": 32,
        "bytes": 718395098,
        "decisionRequests": 3656,
        "decisionObservations": 11869,
        "completedDecisionObservations": 11869,
        "decisionWireMs": 44428.98770000008,
        "decisionPeakBatchSize": 28,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-5-s1:step-378",
            "at": "2026-11-02T01:32:44.663Z",
            "id": 3627,
            "count": 4,
            "bytes": 275766,
            "remainingMs": 1521.7303000000102
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-378",
            "at": "2026-11-02T01:32:44.677Z",
            "id": 3627,
            "count": 4,
            "ms": 14.154999999998836
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.006Z",
            "id": 3628,
            "count": 1,
            "bytes": 64572,
            "remainingMs": 2923.785799999998
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.022Z",
            "id": 3628,
            "count": 1,
            "ms": 15.903899999990244
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.030Z",
            "id": 3629,
            "count": 4,
            "bytes": 269423,
            "remainingMs": 2899.791400000002
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.043Z",
            "id": 3629,
            "count": 4,
            "ms": 13.57060000000638
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.064Z",
            "id": 3630,
            "count": 8,
            "bytes": 567295,
            "remainingMs": 2865.497000000003
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.085Z",
            "id": 3630,
            "count": 8,
            "ms": 20.522500000006403
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.092Z",
            "id": 3631,
            "count": 4,
            "bytes": 283727,
            "remainingMs": 2837.955400000006
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.107Z",
            "id": 3631,
            "count": 4,
            "ms": 15.015100000004168
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.127Z",
            "id": 3632,
            "count": 3,
            "bytes": 184307,
            "remainingMs": 2802.661699999997
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.145Z",
            "id": 3632,
            "count": 3,
            "ms": 18.04660000000149
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.157Z",
            "id": 3633,
            "count": 4,
            "bytes": 281519,
            "remainingMs": 2772.691500000001
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.174Z",
            "id": 3633,
            "count": 4,
            "ms": 16.764999999999418
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.192Z",
            "id": 3634,
            "count": 4,
            "bytes": 277190,
            "remainingMs": 2737.5262000000075
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.210Z",
            "id": 3634,
            "count": 4,
            "ms": 17.835100000011153
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.222Z",
            "id": 3635,
            "count": 3,
            "bytes": 184298,
            "remainingMs": 2707.9098999999987
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.236Z",
            "id": 3635,
            "count": 3,
            "ms": 14.177499999990687
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.242Z",
            "id": 3636,
            "count": 3,
            "bytes": 205529,
            "remainingMs": 2687.9612999999954
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.253Z",
            "id": 3636,
            "count": 3,
            "ms": 11.491299999994226
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.260Z",
            "id": 3637,
            "count": 1,
            "bytes": 61543,
            "remainingMs": 2669.429900000003
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.272Z",
            "id": 3637,
            "count": 1,
            "ms": 11.372900000002119
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.278Z",
            "id": 3638,
            "count": 3,
            "bytes": 201454,
            "remainingMs": 2651.306500000006
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.292Z",
            "id": 3638,
            "count": 3,
            "ms": 13.754400000005262
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.301Z",
            "id": 3639,
            "count": 2,
            "bytes": 120282,
            "remainingMs": 2628.782800000001
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.312Z",
            "id": 3639,
            "count": 2,
            "ms": 11.486999999993714
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.317Z",
            "id": 3640,
            "count": 2,
            "bytes": 134283,
            "remainingMs": 2613.1208999999944
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.329Z",
            "id": 3640,
            "count": 2,
            "ms": 11.98189999999886
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.334Z",
            "id": 3641,
            "count": 1,
            "bytes": 61534,
            "remainingMs": 2595.960600000006
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.346Z",
            "id": 3641,
            "count": 1,
            "ms": 12.433700000008685
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.348Z",
            "id": 3642,
            "count": 1,
            "bytes": 64898,
            "remainingMs": 2581.537599999996
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.358Z",
            "id": 3642,
            "count": 1,
            "ms": 9.863299999997253
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.361Z",
            "id": 3643,
            "count": 1,
            "bytes": 64706,
            "remainingMs": 2568.2584999999963
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.371Z",
            "id": 3643,
            "count": 1,
            "ms": 9.83399999998801
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.375Z",
            "id": 3644,
            "count": 1,
            "bytes": 64258,
            "remainingMs": 2554.980500000005
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.386Z",
            "id": 3644,
            "count": 1,
            "ms": 10.97280000000319
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.389Z",
            "id": 3645,
            "count": 1,
            "bytes": 63874,
            "remainingMs": 2540.712599999999
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.399Z",
            "id": 3645,
            "count": 1,
            "ms": 9.661500000001979
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.402Z",
            "id": 3646,
            "count": 1,
            "bytes": 63394,
            "remainingMs": 2527.774999999994
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.413Z",
            "id": 3646,
            "count": 1,
            "ms": 10.693199999994249
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.416Z",
            "id": 3647,
            "count": 1,
            "bytes": 62144,
            "remainingMs": 2513.7122999999992
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.427Z",
            "id": 3647,
            "count": 1,
            "ms": 11.535900000002584
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.431Z",
            "id": 3648,
            "count": 1,
            "bytes": 61598,
            "remainingMs": 2498.985400000005
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.442Z",
            "id": 3648,
            "count": 1,
            "ms": 11.151899999997113
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.445Z",
            "id": 3649,
            "count": 1,
            "bytes": 60574,
            "remainingMs": 2484.8882000000012
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.455Z",
            "id": 3649,
            "count": 1,
            "ms": 9.959900000001653
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.458Z",
            "id": 3650,
            "count": 1,
            "bytes": 60318,
            "remainingMs": 2471.896999999997
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.467Z",
            "id": 3650,
            "count": 1,
            "ms": 9.703800000002957
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.470Z",
            "id": 3651,
            "count": 1,
            "bytes": 59997,
            "remainingMs": 2459.2620000000024
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.481Z",
            "id": 3651,
            "count": 1,
            "ms": 10.671100000006845
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.484Z",
            "id": 3652,
            "count": 1,
            "bytes": 59677,
            "remainingMs": 2445.780700000003
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.495Z",
            "id": 3652,
            "count": 1,
            "ms": 10.78859999999986
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.497Z",
            "id": 3653,
            "count": 1,
            "bytes": 59322,
            "remainingMs": 2432.2881999999954
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.507Z",
            "id": 3653,
            "count": 1,
            "ms": 10.112999999997555
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.510Z",
            "id": 3654,
            "count": 1,
            "bytes": 62798,
            "remainingMs": 2419.4167000000016
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.521Z",
            "id": 3654,
            "count": 1,
            "ms": 10.291400000001886
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.522Z",
            "id": 3655,
            "count": 1,
            "bytes": 61739,
            "remainingMs": 2407.4182
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.533Z",
            "id": 3655,
            "count": 1,
            "ms": 10.69220000000496
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.535Z",
            "id": 3656,
            "count": 1,
            "bytes": 64878,
            "remainingMs": 2394.761500000008
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.546Z",
            "id": 3656,
            "count": 1,
            "ms": 10.775300000008428
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.547Z",
            "id": 3657,
            "count": 1,
            "bytes": 64295,
            "remainingMs": 2382.419099999999
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.558Z",
            "id": 3657,
            "count": 1,
            "ms": 10.311099999991711
          },
          {
            "type": "request",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.561Z",
            "id": 3658,
            "count": 1,
            "bytes": 76293,
            "remainingMs": 2369.027199999997
          },
          {
            "type": "response",
            "label": "p2-5-s1:step-416",
            "at": "2026-11-02T01:32:45.572Z",
            "id": 3658,
            "count": 1,
            "ms": 11.102799999993294
          }
        ],
        "packMs": 999.6782999998782
      },
      "wallMs": 68968.8735,
      "latency": {
        "model": {
          "count": 148,
          "meanMs": 446.54076959459456,
          "p95Ms": 1410.4639000000025,
          "maxMs": 1866.5570999999982
        },
        "opponent": {
          "count": 276,
          "meanMs": 7.327763043478025,
          "p95Ms": 42.72030000000086,
          "maxMs": 127.28759999999966
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-5-s1\\p2-5-s1"
    },
    {
      "id": "p2-6-s0",
      "slot": 6,
      "seat": 0,
      "seed": 310006054,
      "opponent": "hard",
      "players": 2,
      "map": "(2) Swamplands.aem",
      "category": "normal",
      "modelPlayer": 0,
      "initialSha256": "cf02a37e56deeb7d04e14cc3338c8fe40142c6b484016adb8fc5a97d46f782a1",
      "firstToActPlayer": 0,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_loss",
      "winner": 1,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 321,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 322,
      "rounds": 11,
      "roots": 61,
      "witnessCount": 9,
      "witnessActions": 80,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 1816,
        "observations": 8305,
        "completed": 1816,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 25802.52190000013,
        "peakBatchSize": 32,
        "bytes": 277524330,
        "decisionRequests": 1814,
        "decisionObservations": 8272,
        "completedDecisionObservations": 8272,
        "decisionWireMs": 23299.31100000013,
        "decisionPeakBatchSize": 30,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-6-s0:step-266",
            "at": "2026-11-02T01:33:27.272Z",
            "id": 1785,
            "count": 4,
            "bytes": 157124,
            "remainingMs": 2363.043700000002
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-266",
            "at": "2026-11-02T01:33:27.283Z",
            "id": 1785,
            "count": 4,
            "ms": 11.4233000000022
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-266",
            "at": "2026-11-02T01:33:27.286Z",
            "id": 1786,
            "count": 4,
            "bytes": 157353,
            "remainingMs": 2349.0459000000046
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-266",
            "at": "2026-11-02T01:33:27.297Z",
            "id": 1786,
            "count": 4,
            "ms": 11.120200000004843
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-266",
            "at": "2026-11-02T01:33:27.301Z",
            "id": 1787,
            "count": 4,
            "bytes": 139160,
            "remainingMs": 2333.2703000000038
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-266",
            "at": "2026-11-02T01:33:27.313Z",
            "id": 1787,
            "count": 4,
            "ms": 11.353100000000268
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.600Z",
            "id": 1788,
            "count": 1,
            "bytes": 32820,
            "remainingMs": 2924.1934000000037
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.612Z",
            "id": 1788,
            "count": 1,
            "ms": 11.225299999998242
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.614Z",
            "id": 1789,
            "count": 2,
            "bytes": 65142,
            "remainingMs": 2910.9119000000064
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.624Z",
            "id": 1789,
            "count": 2,
            "ms": 10.421800000003714
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.638Z",
            "id": 1790,
            "count": 8,
            "bytes": 382746,
            "remainingMs": 2886.6291000000056
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.653Z",
            "id": 1790,
            "count": 8,
            "ms": 15.14320000000589
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.659Z",
            "id": 1791,
            "count": 4,
            "bytes": 191478,
            "remainingMs": 2865.984500000006
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.671Z",
            "id": 1791,
            "count": 4,
            "ms": 11.911599999999453
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.687Z",
            "id": 1792,
            "count": 4,
            "bytes": 147589,
            "remainingMs": 2838.080400000006
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.698Z",
            "id": 1792,
            "count": 4,
            "ms": 11.6449000000066
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.704Z",
            "id": 1793,
            "count": 4,
            "bytes": 187126,
            "remainingMs": 2820.207000000002
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.716Z",
            "id": 1793,
            "count": 4,
            "ms": 11.794199999996636
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.730Z",
            "id": 1794,
            "count": 3,
            "bytes": 110773,
            "remainingMs": 2795.1718000000037
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.741Z",
            "id": 1794,
            "count": 3,
            "ms": 11.492400000002817
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.746Z",
            "id": 1795,
            "count": 3,
            "bytes": 139093,
            "remainingMs": 2778.8487000000023
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.757Z",
            "id": 1795,
            "count": 3,
            "ms": 10.932600000000093
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.766Z",
            "id": 1796,
            "count": 2,
            "bytes": 73882,
            "remainingMs": 2758.335500000001
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.777Z",
            "id": 1796,
            "count": 2,
            "ms": 10.325299999996787
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.781Z",
            "id": 1797,
            "count": 3,
            "bytes": 137429,
            "remainingMs": 2743.738900000004
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.794Z",
            "id": 1797,
            "count": 3,
            "ms": 13.05750000000262
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.803Z",
            "id": 1798,
            "count": 2,
            "bytes": 73882,
            "remainingMs": 2721.5724000000046
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.815Z",
            "id": 1798,
            "count": 2,
            "ms": 12.011900000004971
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.818Z",
            "id": 1799,
            "count": 2,
            "bytes": 90612,
            "remainingMs": 2706.687300000005
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.829Z",
            "id": 1799,
            "count": 2,
            "ms": 11.459900000001653
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.837Z",
            "id": 1800,
            "count": 2,
            "bytes": 89107,
            "remainingMs": 2687.5845000000045
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.848Z",
            "id": 1800,
            "count": 2,
            "ms": 10.963999999999942
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.855Z",
            "id": 1801,
            "count": 2,
            "bytes": 86834,
            "remainingMs": 2669.374300000003
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.866Z",
            "id": 1801,
            "count": 2,
            "ms": 11.031999999999243
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.873Z",
            "id": 1802,
            "count": 2,
            "bytes": 85778,
            "remainingMs": 2651.2845000000016
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.885Z",
            "id": 1802,
            "count": 2,
            "ms": 11.352500000000873
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.891Z",
            "id": 1803,
            "count": 2,
            "bytes": 73864,
            "remainingMs": 2633.951700000005
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.901Z",
            "id": 1803,
            "count": 2,
            "ms": 10.221700000001874
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.904Z",
            "id": 1804,
            "count": 2,
            "bytes": 84498,
            "remainingMs": 2620.8110000000015
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.914Z",
            "id": 1804,
            "count": 2,
            "ms": 9.935499999999593
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.921Z",
            "id": 1805,
            "count": 2,
            "bytes": 82929,
            "remainingMs": 2603.9727000000057
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.932Z",
            "id": 1805,
            "count": 2,
            "ms": 11.616900000000896
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.939Z",
            "id": 1806,
            "count": 2,
            "bytes": 80558,
            "remainingMs": 2585.9579000000012
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.950Z",
            "id": 1806,
            "count": 2,
            "ms": 11.697999999996682
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.957Z",
            "id": 1807,
            "count": 2,
            "bytes": 78058,
            "remainingMs": 2568.008700000006
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.967Z",
            "id": 1807,
            "count": 2,
            "ms": 10.54040000000532
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.973Z",
            "id": 1808,
            "count": 2,
            "bytes": 76721,
            "remainingMs": 2551.3668000000034
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.985Z",
            "id": 1808,
            "count": 2,
            "ms": 11.78859999999986
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:27.990Z",
            "id": 1809,
            "count": 2,
            "bytes": 75147,
            "remainingMs": 2534.6057
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:28.003Z",
            "id": 1809,
            "count": 2,
            "ms": 12.46969999999419
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:28.007Z",
            "id": 1810,
            "count": 2,
            "bytes": 81370,
            "remainingMs": 2517.564400000003
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:28.018Z",
            "id": 1810,
            "count": 2,
            "ms": 10.86540000000241
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:28.020Z",
            "id": 1811,
            "count": 2,
            "bytes": 78636,
            "remainingMs": 2504.7311000000045
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:28.032Z",
            "id": 1811,
            "count": 2,
            "ms": 11.94050000000425
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:28.035Z",
            "id": 1812,
            "count": 2,
            "bytes": 95796,
            "remainingMs": 2489.9558000000034
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:28.046Z",
            "id": 1812,
            "count": 2,
            "ms": 10.920299999997951
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:28.053Z",
            "id": 1813,
            "count": 2,
            "bytes": 73864,
            "remainingMs": 2471.691200000001
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:28.064Z",
            "id": 1813,
            "count": 2,
            "ms": 10.600200000000768
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:28.067Z",
            "id": 1814,
            "count": 2,
            "bytes": 93812,
            "remainingMs": 2457.7839999999997
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:28.078Z",
            "id": 1814,
            "count": 2,
            "ms": 11.26579999999376
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:28.085Z",
            "id": 1815,
            "count": 2,
            "bytes": 73882,
            "remainingMs": 2439.5466000000015
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:28.097Z",
            "id": 1815,
            "count": 2,
            "ms": 11.41870000000199
          },
          {
            "type": "request",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:28.100Z",
            "id": 1816,
            "count": 2,
            "bytes": 92596,
            "remainingMs": 2425.1303000000044
          },
          {
            "type": "response",
            "label": "p2-6-s0:step-292",
            "at": "2026-11-02T01:33:28.110Z",
            "id": 1816,
            "count": 2,
            "ms": 10.504200000003038
          }
        ],
        "packMs": 472.36010000002426
      },
      "wallMs": 38107.958,
      "latency": {
        "model": {
          "count": 115,
          "meanMs": 301.04020000000025,
          "p95Ms": 809.7250000000022,
          "maxMs": 1121.2295999999988
        },
        "opponent": {
          "count": 207,
          "meanMs": 13.807743961352756,
          "p95Ms": 43.61779999999999,
          "maxMs": 528.0339999999997
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-6-s0\\p2-6-s0"
    },
    {
      "id": "p2-6-s1",
      "slot": 6,
      "seat": 1,
      "seed": 310006054,
      "opponent": "hard",
      "players": 2,
      "map": "(2) Swamplands.aem",
      "category": "normal",
      "modelPlayer": 1,
      "initialSha256": "cf02a37e56deeb7d04e14cc3338c8fe40142c6b484016adb8fc5a97d46f782a1",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 0,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 209,
          "ids": [
            1
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 210,
      "rounds": 8,
      "roots": 32,
      "witnessCount": 16,
      "witnessActions": 195,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 1062,
        "observations": 4564,
        "completed": 1062,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 16092.447900000096,
        "peakBatchSize": 32,
        "bytes": 144462368,
        "decisionRequests": 1060,
        "decisionObservations": 4531,
        "completedDecisionObservations": 4531,
        "decisionWireMs": 13562.558200000096,
        "decisionPeakBatchSize": 15,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.304Z",
            "id": 1031,
            "count": 2,
            "bytes": 83646,
            "remainingMs": 2123.1034
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.316Z",
            "id": 1031,
            "count": 2,
            "ms": 12.067699999999604
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.322Z",
            "id": 1032,
            "count": 4,
            "bytes": 191922,
            "remainingMs": 2105.7108000000007
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.336Z",
            "id": 1032,
            "count": 4,
            "ms": 14.138600000002043
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.341Z",
            "id": 1033,
            "count": 1,
            "bytes": 41910,
            "remainingMs": 2086.624499999998
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.353Z",
            "id": 1033,
            "count": 1,
            "ms": 11.977699999999459
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.361Z",
            "id": 1034,
            "count": 4,
            "bytes": 191154,
            "remainingMs": 2066.2029
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.373Z",
            "id": 1034,
            "count": 4,
            "ms": 12.282400000000052
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.379Z",
            "id": 1035,
            "count": 2,
            "bytes": 83637,
            "remainingMs": 2048.0908999999992
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.392Z",
            "id": 1035,
            "count": 2,
            "ms": 12.778399999999237
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.397Z",
            "id": 1036,
            "count": 4,
            "bytes": 189562,
            "remainingMs": 2030.2517000000007
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.410Z",
            "id": 1036,
            "count": 4,
            "ms": 12.601900000001478
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.417Z",
            "id": 1037,
            "count": 2,
            "bytes": 83727,
            "remainingMs": 2010.4673999999977
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.429Z",
            "id": 1037,
            "count": 2,
            "ms": 12.26379999999699
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.434Z",
            "id": 1038,
            "count": 4,
            "bytes": 187562,
            "remainingMs": 1993.3299000000006
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.448Z",
            "id": 1038,
            "count": 4,
            "ms": 13.782100000000355
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.457Z",
            "id": 1039,
            "count": 3,
            "bytes": 125367,
            "remainingMs": 1970.589899999999
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.468Z",
            "id": 1039,
            "count": 3,
            "ms": 11.325000000000728
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.473Z",
            "id": 1040,
            "count": 4,
            "bytes": 185706,
            "remainingMs": 1954.6391000000003
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.484Z",
            "id": 1040,
            "count": 4,
            "ms": 11.4220000000023
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.495Z",
            "id": 1041,
            "count": 4,
            "bytes": 182734,
            "remainingMs": 1932.5172999999995
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.508Z",
            "id": 1041,
            "count": 4,
            "ms": 13.358299999999872
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.516Z",
            "id": 1042,
            "count": 3,
            "bytes": 125427,
            "remainingMs": 1910.851200000001
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.528Z",
            "id": 1042,
            "count": 3,
            "ms": 11.359400000001187
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.532Z",
            "id": 1043,
            "count": 4,
            "bytes": 179397,
            "remainingMs": 1895.3282
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.546Z",
            "id": 1043,
            "count": 4,
            "ms": 13.786400000000867
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.555Z",
            "id": 1044,
            "count": 4,
            "bytes": 167202,
            "remainingMs": 1872.7036999999982
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.567Z",
            "id": 1044,
            "count": 4,
            "ms": 12.274499999999534
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.571Z",
            "id": 1045,
            "count": 4,
            "bytes": 177797,
            "remainingMs": 1856.322400000001
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.585Z",
            "id": 1045,
            "count": 4,
            "ms": 14.028400000002875
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.594Z",
            "id": 1046,
            "count": 4,
            "bytes": 167193,
            "remainingMs": 1833.594799999999
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.607Z",
            "id": 1046,
            "count": 4,
            "ms": 13.62039999999979
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.611Z",
            "id": 1047,
            "count": 4,
            "bytes": 175473,
            "remainingMs": 1816.5348999999987
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.622Z",
            "id": 1047,
            "count": 4,
            "ms": 11.176899999998568
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.633Z",
            "id": 1048,
            "count": 4,
            "bytes": 167243,
            "remainingMs": 1794.0324999999975
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.647Z",
            "id": 1048,
            "count": 4,
            "ms": 13.92659999999887
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.650Z",
            "id": 1049,
            "count": 4,
            "bytes": 173591,
            "remainingMs": 1777.0391999999993
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.661Z",
            "id": 1049,
            "count": 4,
            "ms": 11.231199999998353
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.671Z",
            "id": 1050,
            "count": 4,
            "bytes": 170909,
            "remainingMs": 1755.8322999999982
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.686Z",
            "id": 1050,
            "count": 4,
            "ms": 14.557199999999284
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.687Z",
            "id": 1051,
            "count": 1,
            "bytes": 44543,
            "remainingMs": 1739.9051
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.699Z",
            "id": 1051,
            "count": 1,
            "ms": 11.97320000000036
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.702Z",
            "id": 1052,
            "count": 3,
            "bytes": 128904,
            "remainingMs": 1725.7147000000004
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.712Z",
            "id": 1052,
            "count": 3,
            "ms": 10.488199999999779
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.718Z",
            "id": 1053,
            "count": 2,
            "bytes": 90782,
            "remainingMs": 1708.7739000000001
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.729Z",
            "id": 1053,
            "count": 2,
            "ms": 10.839599999999336
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.731Z",
            "id": 1054,
            "count": 2,
            "bytes": 88912,
            "remainingMs": 1696.1013999999996
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.742Z",
            "id": 1054,
            "count": 2,
            "ms": 11.152200000000448
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.744Z",
            "id": 1055,
            "count": 3,
            "bytes": 127847,
            "remainingMs": 1682.9393999999993
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.757Z",
            "id": 1055,
            "count": 3,
            "ms": 12.39140000000043
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.763Z",
            "id": 1056,
            "count": 3,
            "bytes": 126398,
            "remainingMs": 1664.6306000000004
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.775Z",
            "id": 1056,
            "count": 3,
            "ms": 12.083800000000338
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.780Z",
            "id": 1057,
            "count": 3,
            "bytes": 135152,
            "remainingMs": 1647.2347000000009
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.793Z",
            "id": 1057,
            "count": 3,
            "ms": 13.04870000000301
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.796Z",
            "id": 1058,
            "count": 3,
            "bytes": 133425,
            "remainingMs": 1631.7209999999977
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.807Z",
            "id": 1058,
            "count": 3,
            "ms": 11.534899999998743
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.809Z",
            "id": 1059,
            "count": 3,
            "bytes": 133425,
            "remainingMs": 1618.2075000000004
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.820Z",
            "id": 1059,
            "count": 3,
            "ms": 10.559100000002218
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.821Z",
            "id": 1060,
            "count": 1,
            "bytes": 47822,
            "remainingMs": 1606.0776000000005
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.831Z",
            "id": 1060,
            "count": 1,
            "ms": 9.671300000001793
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.832Z",
            "id": 1061,
            "count": 1,
            "bytes": 47304,
            "remainingMs": 1595.515199999998
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.842Z",
            "id": 1061,
            "count": 1,
            "ms": 10.345499999999447
          },
          {
            "type": "request",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.844Z",
            "id": 1062,
            "count": 2,
            "bytes": 78992,
            "remainingMs": 1583.3336999999992
          },
          {
            "type": "response",
            "label": "p2-6-s1:step-187",
            "at": "2026-11-02T01:33:54.855Z",
            "id": 1062,
            "count": 2,
            "ms": 10.786800000001676
          }
        ],
        "packMs": 251.43429999999398
      },
      "wallMs": 21856.9008,
      "latency": {
        "model": {
          "count": 63,
          "meanMs": 321.94615873015886,
          "p95Ms": 1030.6090000000022,
          "maxMs": 1353.0629000000008
        },
        "opponent": {
          "count": 147,
          "meanMs": 7.844896598639393,
          "p95Ms": 39.037899999999354,
          "maxMs": 88.61059999999998
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-6-s1\\p2-6-s1"
    },
    {
      "id": "p2-7-s0",
      "slot": 7,
      "seat": 0,
      "seed": 310007063,
      "opponent": "hard",
      "players": 2,
      "map": "(2) The Crossing.aem",
      "category": "normal",
      "modelPlayer": 0,
      "initialSha256": "165635e4cb403bc2b405748913e3e89cea6d86d3ffd3688d6a2d63bb16ca6939",
      "firstToActPlayer": 0,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_loss",
      "winner": 1,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 528,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 529,
      "rounds": 16,
      "roots": 67,
      "witnessCount": 18,
      "witnessActions": 152,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 3075,
        "observations": 12029,
        "completed": 3075,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 40906.62759999984,
        "peakBatchSize": 32,
        "bytes": 595871366,
        "decisionRequests": 3073,
        "decisionObservations": 11996,
        "completedDecisionObservations": 11996,
        "decisionWireMs": 38383.793599999844,
        "decisionPeakBatchSize": 31,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.277Z",
            "id": 3044,
            "count": 9,
            "bytes": 633421,
            "remainingMs": 2859.5527999999904
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.294Z",
            "id": 3044,
            "count": 9,
            "ms": 16.911899999991874
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.298Z",
            "id": 3045,
            "count": 3,
            "bytes": 211139,
            "remainingMs": 2838.5640999999887
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.309Z",
            "id": 3045,
            "count": 3,
            "ms": 11.025199999989127
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.325Z",
            "id": 3046,
            "count": 3,
            "bytes": 209507,
            "remainingMs": 2811.1554999999935
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.343Z",
            "id": 3046,
            "count": 3,
            "ms": 17.50810000000638
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.358Z",
            "id": 3047,
            "count": 3,
            "bytes": 208227,
            "remainingMs": 2778.152199999997
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.370Z",
            "id": 3047,
            "count": 3,
            "ms": 11.686800000010408
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.386Z",
            "id": 3048,
            "count": 3,
            "bytes": 206147,
            "remainingMs": 2750.675099999993
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.398Z",
            "id": 3048,
            "count": 3,
            "ms": 12.329899999996996
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.408Z",
            "id": 3049,
            "count": 1,
            "bytes": 60043,
            "remainingMs": 2728.1565999999875
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.419Z",
            "id": 3049,
            "count": 1,
            "ms": 10.485799999994924
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.424Z",
            "id": 3050,
            "count": 3,
            "bytes": 201498,
            "remainingMs": 2712.649099999995
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.435Z",
            "id": 3050,
            "count": 3,
            "ms": 11.437300000005052
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.452Z",
            "id": 3051,
            "count": 3,
            "bytes": 199994,
            "remainingMs": 2685.0339999999997
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.465Z",
            "id": 3051,
            "count": 3,
            "ms": 13.878700000001118
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.474Z",
            "id": 3052,
            "count": 1,
            "bytes": 60010,
            "remainingMs": 2662.920199999993
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.484Z",
            "id": 3052,
            "count": 1,
            "ms": 10.215500000005704
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.489Z",
            "id": 3053,
            "count": 3,
            "bytes": 198575,
            "remainingMs": 2647.9063999999926
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.501Z",
            "id": 3053,
            "count": 3,
            "ms": 12.019499999994878
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.509Z",
            "id": 3054,
            "count": 1,
            "bytes": 60010,
            "remainingMs": 2627.7121999999945
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.519Z",
            "id": 3054,
            "count": 1,
            "ms": 9.895700000008219
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.523Z",
            "id": 3055,
            "count": 3,
            "bytes": 197199,
            "remainingMs": 2613.6632999999856
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.535Z",
            "id": 3055,
            "count": 3,
            "ms": 12.255899999989197
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.544Z",
            "id": 3056,
            "count": 1,
            "bytes": 60010,
            "remainingMs": 2592.6951999999874
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.555Z",
            "id": 3056,
            "count": 1,
            "ms": 11.293499999999767
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.559Z",
            "id": 3057,
            "count": 3,
            "bytes": 195319,
            "remainingMs": 2577.4147999999986
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.571Z",
            "id": 3057,
            "count": 3,
            "ms": 11.377900000006775
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.581Z",
            "id": 3058,
            "count": 3,
            "bytes": 193687,
            "remainingMs": 2555.2065999999904
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.594Z",
            "id": 3058,
            "count": 3,
            "ms": 12.38969999999972
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.604Z",
            "id": 3059,
            "count": 3,
            "bytes": 191863,
            "remainingMs": 2532.3912999999884
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.616Z",
            "id": 3059,
            "count": 3,
            "ms": 11.266499999997905
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.626Z",
            "id": 3060,
            "count": 3,
            "bytes": 190870,
            "remainingMs": 2510.361499999999
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.638Z",
            "id": 3060,
            "count": 3,
            "ms": 11.288500000009662
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.648Z",
            "id": 3061,
            "count": 3,
            "bytes": 188114,
            "remainingMs": 2488.713899999988
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.660Z",
            "id": 3061,
            "count": 3,
            "ms": 11.792199999996228
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.670Z",
            "id": 3062,
            "count": 3,
            "bytes": 187441,
            "remainingMs": 2466.87539999999
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.681Z",
            "id": 3062,
            "count": 3,
            "ms": 11.329400000002352
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.691Z",
            "id": 3063,
            "count": 3,
            "bytes": 185807,
            "remainingMs": 2445.2946999999986
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.703Z",
            "id": 3063,
            "count": 3,
            "ms": 11.200900000010733
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.713Z",
            "id": 3064,
            "count": 3,
            "bytes": 185167,
            "remainingMs": 2423.911599999992
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.726Z",
            "id": 3064,
            "count": 3,
            "ms": 13.366599999993923
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.737Z",
            "id": 3065,
            "count": 3,
            "bytes": 184301,
            "remainingMs": 2400.1054999999906
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.748Z",
            "id": 3065,
            "count": 3,
            "ms": 11.344100000002072
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.758Z",
            "id": 3066,
            "count": 3,
            "bytes": 181771,
            "remainingMs": 2378.8582999999926
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.769Z",
            "id": 3066,
            "count": 3,
            "ms": 11.689299999998184
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.779Z",
            "id": 3067,
            "count": 3,
            "bytes": 179142,
            "remainingMs": 2357.7585999999865
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.790Z",
            "id": 3067,
            "count": 3,
            "ms": 11.076000000000931
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.796Z",
            "id": 3068,
            "count": 1,
            "bytes": 60945,
            "remainingMs": 2340.678999999989
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.807Z",
            "id": 3068,
            "count": 1,
            "ms": 11.319799999997485
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.810Z",
            "id": 3069,
            "count": 3,
            "bytes": 180582,
            "remainingMs": 2326.768499999991
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.821Z",
            "id": 3069,
            "count": 3,
            "ms": 11.119699999995646
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.826Z",
            "id": 3070,
            "count": 3,
            "bytes": 191787,
            "remainingMs": 2310.7374999999884
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.839Z",
            "id": 3070,
            "count": 3,
            "ms": 12.907599999991362
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.841Z",
            "id": 3071,
            "count": 2,
            "bytes": 126828,
            "remainingMs": 2295.330099999992
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.853Z",
            "id": 3071,
            "count": 2,
            "ms": 11.353900000001886
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.857Z",
            "id": 3072,
            "count": 2,
            "bytes": 134340,
            "remainingMs": 2280.098399999988
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.867Z",
            "id": 3072,
            "count": 2,
            "ms": 10.740399999995134
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.869Z",
            "id": 3073,
            "count": 1,
            "bytes": 66428,
            "remainingMs": 2267.795199999993
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.880Z",
            "id": 3073,
            "count": 1,
            "ms": 11.486000000004424
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.882Z",
            "id": 3074,
            "count": 1,
            "bytes": 67459,
            "remainingMs": 2255.039499999999
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.892Z",
            "id": 3074,
            "count": 1,
            "ms": 10.846900000004098
          },
          {
            "type": "request",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.899Z",
            "id": 3075,
            "count": 3,
            "bytes": 230081,
            "remainingMs": 2237.7100999999966
          },
          {
            "type": "response",
            "label": "p2-7-s0:step-444",
            "at": "2026-11-02T01:35:03.911Z",
            "id": 3075,
            "count": 3,
            "ms": 11.720100000005914
          }
        ],
        "packMs": 874.954499999983
      },
      "wallMs": 64573.6964,
      "latency": {
        "model": {
          "count": 132,
          "meanMs": 461.01439090909093,
          "p95Ms": 1359.6487000000016,
          "maxMs": 1553.5305000000008
        },
        "opponent": {
          "count": 397,
          "meanMs": 6.703823425692632,
          "p95Ms": 26.455999999998312,
          "maxMs": 164.84219999999914
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-7-s0\\p2-7-s0"
    },
    {
      "id": "p2-7-s1",
      "slot": 7,
      "seat": 1,
      "seed": 310007063,
      "opponent": "hard",
      "players": 2,
      "map": "(2) The Crossing.aem",
      "category": "normal",
      "modelPlayer": 1,
      "initialSha256": "165635e4cb403bc2b405748913e3e89cea6d86d3ffd3688d6a2d63bb16ca6939",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_win",
      "winner": 1,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 547,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 548,
      "rounds": 16,
      "roots": 172,
      "witnessCount": 25,
      "witnessActions": 236,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 6643,
        "observations": 24790,
        "completed": 6643,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 85048.10410000022,
        "peakBatchSize": 32,
        "bytes": 1301077753,
        "decisionRequests": 6641,
        "decisionObservations": 24757,
        "completedDecisionObservations": 24757,
        "decisionWireMs": 82515.15640000021,
        "decisionPeakBatchSize": 30,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.547Z",
            "id": 6612,
            "count": 1,
            "bytes": 61837,
            "remainingMs": 2630.228700000007
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.558Z",
            "id": 6612,
            "count": 1,
            "ms": 10.895799999998417
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.563Z",
            "id": 6613,
            "count": 1,
            "bytes": 61004,
            "remainingMs": 2615.006000000023
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.573Z",
            "id": 6613,
            "count": 1,
            "ms": 10.539700000023004
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.576Z",
            "id": 6614,
            "count": 1,
            "bytes": 60491,
            "remainingMs": 2601.397400000016
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.586Z",
            "id": 6614,
            "count": 1,
            "ms": 9.972600000008242
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.589Z",
            "id": 6615,
            "count": 1,
            "bytes": 59753,
            "remainingMs": 2588.8023000000103
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.600Z",
            "id": 6615,
            "count": 1,
            "ms": 10.79790000000503
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.602Z",
            "id": 6616,
            "count": 1,
            "bytes": 59177,
            "remainingMs": 2575.4808000000194
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.612Z",
            "id": 6616,
            "count": 1,
            "ms": 10.10150000001886
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.615Z",
            "id": 6617,
            "count": 1,
            "bytes": 58537,
            "remainingMs": 2562.882200000022
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.625Z",
            "id": 6617,
            "count": 1,
            "ms": 10.341899999999441
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.627Z",
            "id": 6618,
            "count": 1,
            "bytes": 57381,
            "remainingMs": 2550.2038000000175
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.638Z",
            "id": 6618,
            "count": 1,
            "ms": 10.482500000012806
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.640Z",
            "id": 6619,
            "count": 1,
            "bytes": 60945,
            "remainingMs": 2537.2432000000263
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.650Z",
            "id": 6619,
            "count": 1,
            "ms": 10.20920000001206
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.652Z",
            "id": 6620,
            "count": 1,
            "bytes": 60059,
            "remainingMs": 2525.599500000011
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.662Z",
            "id": 6620,
            "count": 1,
            "ms": 9.691400000010617
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.663Z",
            "id": 6621,
            "count": 1,
            "bytes": 63865,
            "remainingMs": 2514.390000000014
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.673Z",
            "id": 6621,
            "count": 1,
            "ms": 10.068399999989197
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.676Z",
            "id": 6622,
            "count": 1,
            "bytes": 72039,
            "remainingMs": 2501.286700000026
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-544",
            "at": "2026-11-02T01:37:18.686Z",
            "id": 6622,
            "count": 1,
            "ms": 9.700400000001537
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.694Z",
            "id": 6623,
            "count": 1,
            "bytes": 68462,
            "remainingMs": 2923.3021999999764
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.704Z",
            "id": 6623,
            "count": 1,
            "ms": 10.362399999983609
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.710Z",
            "id": 6624,
            "count": 1,
            "bytes": 56984,
            "remainingMs": 2907.651099999988
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.720Z",
            "id": 6624,
            "count": 1,
            "ms": 10.1024000000034
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.727Z",
            "id": 6625,
            "count": 4,
            "bytes": 269590,
            "remainingMs": 2890.5375999999815
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.740Z",
            "id": 6625,
            "count": 4,
            "ms": 13.029000000009546
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.744Z",
            "id": 6626,
            "count": 3,
            "bytes": 202152,
            "remainingMs": 2872.977499999979
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.757Z",
            "id": 6626,
            "count": 3,
            "ms": 12.22589999999036
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.769Z",
            "id": 6627,
            "count": 3,
            "bytes": 200936,
            "remainingMs": 2848.4611999999906
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.781Z",
            "id": 6627,
            "count": 3,
            "ms": 11.910900000017136
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.795Z",
            "id": 6628,
            "count": 3,
            "bytes": 199912,
            "remainingMs": 2822.410199999984
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.806Z",
            "id": 6628,
            "count": 3,
            "ms": 11.437799999985145
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.817Z",
            "id": 6629,
            "count": 1,
            "bytes": 56993,
            "remainingMs": 2800.338699999993
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.828Z",
            "id": 6629,
            "count": 1,
            "ms": 10.933199999999488
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.833Z",
            "id": 6630,
            "count": 3,
            "bytes": 199048,
            "remainingMs": 2783.8546999999962
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.848Z",
            "id": 6630,
            "count": 3,
            "ms": 14.838799999997718
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.863Z",
            "id": 6631,
            "count": 3,
            "bytes": 198120,
            "remainingMs": 2754.3789999999863
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.876Z",
            "id": 6631,
            "count": 3,
            "ms": 12.653599999990547
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.890Z",
            "id": 6632,
            "count": 3,
            "bytes": 196872,
            "remainingMs": 2726.880999999994
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.905Z",
            "id": 6632,
            "count": 3,
            "ms": 14.176100000011502
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.919Z",
            "id": 6633,
            "count": 3,
            "bytes": 195016,
            "remainingMs": 2697.9653999999864
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.931Z",
            "id": 6633,
            "count": 3,
            "ms": 11.970499999995809
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.947Z",
            "id": 6634,
            "count": 3,
            "bytes": 191910,
            "remainingMs": 2670.2601999999897
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.958Z",
            "id": 6634,
            "count": 3,
            "ms": 11.154899999994086
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.970Z",
            "id": 6635,
            "count": 3,
            "bytes": 189669,
            "remainingMs": 2647.125699999975
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.987Z",
            "id": 6635,
            "count": 3,
            "ms": 17.042599999986123
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:18.998Z",
            "id": 6636,
            "count": 3,
            "bytes": 185829,
            "remainingMs": 2619.1756999999925
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:19.010Z",
            "id": 6636,
            "count": 3,
            "ms": 11.458400000003166
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:19.019Z",
            "id": 6637,
            "count": 3,
            "bytes": 184228,
            "remainingMs": 2598.115299999976
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:19.031Z",
            "id": 6637,
            "count": 3,
            "ms": 11.971999999979744
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:19.040Z",
            "id": 6638,
            "count": 3,
            "bytes": 181857,
            "remainingMs": 2576.8871999999974
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:19.053Z",
            "id": 6638,
            "count": 3,
            "ms": 12.300799999997253
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:19.061Z",
            "id": 6639,
            "count": 3,
            "bytes": 180157,
            "remainingMs": 2556.3680999999924
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:19.073Z",
            "id": 6639,
            "count": 3,
            "ms": 12.35000000000582
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:19.081Z",
            "id": 6640,
            "count": 3,
            "bytes": 178233,
            "remainingMs": 2535.981699999975
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:19.095Z",
            "id": 6640,
            "count": 3,
            "ms": 13.94550000000163
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:19.102Z",
            "id": 6641,
            "count": 3,
            "bytes": 175320,
            "remainingMs": 2514.7773999999918
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:19.114Z",
            "id": 6641,
            "count": 3,
            "ms": 11.707500000018626
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:19.119Z",
            "id": 6642,
            "count": 1,
            "bytes": 58088,
            "remainingMs": 2498.1179999999877
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:19.130Z",
            "id": 6642,
            "count": 1,
            "ms": 10.785899999988033
          },
          {
            "type": "request",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:19.136Z",
            "id": 6643,
            "count": 3,
            "bytes": 193837,
            "remainingMs": 2481.0899999999965
          },
          {
            "type": "response",
            "label": "p2-7-s1:step-546",
            "at": "2026-11-02T01:37:19.149Z",
            "id": 6643,
            "count": 3,
            "ms": 12.330900000000838
          }
        ],
        "packMs": 1837.9118000003857
      },
      "wallMs": 130146.0678,
      "latency": {
        "model": {
          "count": 357,
          "meanMs": 355.82235406162437,
          "p95Ms": 1187.1366999999955,
          "maxMs": 1598.1143999999986
        },
        "opponent": {
          "count": 191,
          "meanMs": 10.392821989528938,
          "p95Ms": 40.292600000000675,
          "maxMs": 250.9406999999992
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-7-s1\\p2-7-s1"
    },
    {
      "id": "p2-8-s0",
      "slot": 8,
      "seat": 0,
      "seed": 310008072,
      "opponent": "hard",
      "players": 2,
      "map": "(2) Swamplands.aem",
      "category": "preset_units",
      "modelPlayer": 0,
      "initialSha256": "4c63bab19a2994408656f39a527f87a67ce0ca5138e0c5dc069e0dab80f771f3",
      "firstToActPlayer": 1,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 2,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 426,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 427,
      "rounds": 10,
      "roots": 60,
      "witnessCount": 16,
      "witnessActions": 229,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 4337,
        "observations": 13385,
        "completed": 4337,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 63329.702000000165,
        "peakBatchSize": 32,
        "bytes": 908665530,
        "decisionRequests": 4335,
        "decisionObservations": 13352,
        "completedDecisionObservations": 13352,
        "decisionWireMs": 60555.27210000017,
        "decisionPeakBatchSize": 26,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.731Z",
            "id": 4306,
            "count": 1,
            "bytes": 44689,
            "remainingMs": 2923.9474000000046
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.746Z",
            "id": 4306,
            "count": 1,
            "ms": 14.68519999999262
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.751Z",
            "id": 4307,
            "count": 4,
            "bytes": 190697,
            "remainingMs": 2904.209600000002
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.765Z",
            "id": 4307,
            "count": 4,
            "ms": 13.603999999992084
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.768Z",
            "id": 4308,
            "count": 1,
            "bytes": 47295,
            "remainingMs": 2887.3833000000013
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.781Z",
            "id": 4308,
            "count": 1,
            "ms": 13.06689999999071
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.798Z",
            "id": 4309,
            "count": 9,
            "bytes": 489145,
            "remainingMs": 2857.643000000011
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.820Z",
            "id": 4309,
            "count": 9,
            "ms": 22.02610000000277
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.825Z",
            "id": 4310,
            "count": 4,
            "bytes": 214570,
            "remainingMs": 2830.3269
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.841Z",
            "id": 4310,
            "count": 4,
            "ms": 15.59649999999965
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.855Z",
            "id": 4311,
            "count": 4,
            "bytes": 212323,
            "remainingMs": 2800.1427000000112
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.868Z",
            "id": 4311,
            "count": 4,
            "ms": 12.654399999999441
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.877Z",
            "id": 4312,
            "count": 3,
            "bytes": 133294,
            "remainingMs": 2778.6177000000025
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.889Z",
            "id": 4312,
            "count": 3,
            "ms": 12.622600000002421
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.897Z",
            "id": 4313,
            "count": 4,
            "bytes": 210339,
            "remainingMs": 2758.5878000000084
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.910Z",
            "id": 4313,
            "count": 4,
            "ms": 12.913400000004913
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.919Z",
            "id": 4314,
            "count": 1,
            "bytes": 44543,
            "remainingMs": 2736.2136000000028
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.929Z",
            "id": 4314,
            "count": 1,
            "ms": 10.203599999993457
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.936Z",
            "id": 4315,
            "count": 4,
            "bytes": 203791,
            "remainingMs": 2719.6676000000007
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.952Z",
            "id": 4315,
            "count": 4,
            "ms": 16.223299999997835
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.960Z",
            "id": 4316,
            "count": 1,
            "bytes": 44576,
            "remainingMs": 2695.1954000000114
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.971Z",
            "id": 4316,
            "count": 1,
            "ms": 11.123700000011013
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.977Z",
            "id": 4317,
            "count": 4,
            "bytes": 200980,
            "remainingMs": 2678.2600000000093
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:38.991Z",
            "id": 4317,
            "count": 4,
            "ms": 13.866500000003725
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.002Z",
            "id": 4318,
            "count": 4,
            "bytes": 195371,
            "remainingMs": 2653.109700000001
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.019Z",
            "id": 4318,
            "count": 4,
            "ms": 16.870599999994738
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.026Z",
            "id": 4319,
            "count": 1,
            "bytes": 44543,
            "remainingMs": 2628.8313000000053
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.038Z",
            "id": 4319,
            "count": 1,
            "ms": 11.42630000000645
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.043Z",
            "id": 4320,
            "count": 4,
            "bytes": 193963,
            "remainingMs": 2612.2337000000116
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.057Z",
            "id": 4320,
            "count": 4,
            "ms": 13.460800000000745
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.063Z",
            "id": 4321,
            "count": 1,
            "bytes": 44543,
            "remainingMs": 2592.248000000007
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.076Z",
            "id": 4321,
            "count": 1,
            "ms": 12.8865000000078
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.081Z",
            "id": 4322,
            "count": 4,
            "bytes": 193019,
            "remainingMs": 2574.560200000007
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.096Z",
            "id": 4322,
            "count": 4,
            "ms": 15.25909999999567
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.103Z",
            "id": 4323,
            "count": 3,
            "bytes": 128009,
            "remainingMs": 2551.957600000009
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.119Z",
            "id": 4323,
            "count": 3,
            "ms": 15.52719999999681
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.126Z",
            "id": 4324,
            "count": 4,
            "bytes": 191187,
            "remainingMs": 2529.443299999999
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.140Z",
            "id": 4324,
            "count": 4,
            "ms": 13.914999999993597
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.147Z",
            "id": 4325,
            "count": 1,
            "bytes": 41901,
            "remainingMs": 2508.1350999999995
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.160Z",
            "id": 4325,
            "count": 1,
            "ms": 12.977499999993597
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.165Z",
            "id": 4326,
            "count": 4,
            "bytes": 189339,
            "remainingMs": 2489.844100000002
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.182Z",
            "id": 4326,
            "count": 4,
            "ms": 16.457299999994575
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.193Z",
            "id": 4327,
            "count": 4,
            "bytes": 184693,
            "remainingMs": 2462.5944000000018
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.207Z",
            "id": 4327,
            "count": 4,
            "ms": 13.86359999999695
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.214Z",
            "id": 4328,
            "count": 4,
            "bytes": 181455,
            "remainingMs": 2441.3966000000073
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.229Z",
            "id": 4328,
            "count": 4,
            "ms": 15.25470000000496
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.236Z",
            "id": 4329,
            "count": 4,
            "bytes": 179340,
            "remainingMs": 2418.817200000005
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.249Z",
            "id": 4329,
            "count": 4,
            "ms": 12.91809999999532
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.256Z",
            "id": 4330,
            "count": 4,
            "bytes": 177561,
            "remainingMs": 2399.1751000000077
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.271Z",
            "id": 4330,
            "count": 4,
            "ms": 14.781600000002072
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.276Z",
            "id": 4331,
            "count": 4,
            "bytes": 176824,
            "remainingMs": 2378.8274999999994
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.291Z",
            "id": 4331,
            "count": 4,
            "ms": 14.933399999994435
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.298Z",
            "id": 4332,
            "count": 4,
            "bytes": 175606,
            "remainingMs": 2357.742100000003
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.311Z",
            "id": 4332,
            "count": 4,
            "ms": 13.762199999997392
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.315Z",
            "id": 4333,
            "count": 1,
            "bytes": 44568,
            "remainingMs": 2340.6236000000063
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.329Z",
            "id": 4333,
            "count": 1,
            "ms": 14.288899999999558
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.332Z",
            "id": 4334,
            "count": 4,
            "bytes": 173787,
            "remainingMs": 2322.9686000000074
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.346Z",
            "id": 4334,
            "count": 4,
            "ms": 13.41139999999723
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.349Z",
            "id": 4335,
            "count": 1,
            "bytes": 46263,
            "remainingMs": 2306.5053000000044
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.360Z",
            "id": 4335,
            "count": 1,
            "ms": 11.37380000000121
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.362Z",
            "id": 4336,
            "count": 1,
            "bytes": 45221,
            "remainingMs": 2292.817900000009
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.373Z",
            "id": 4336,
            "count": 1,
            "ms": 10.258700000005774
          },
          {
            "type": "request",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.379Z",
            "id": 4337,
            "count": 4,
            "bytes": 197986,
            "remainingMs": 2276.3831000000064
          },
          {
            "type": "response",
            "label": "p2-8-s0:step-384",
            "at": "2026-11-01T17:25:39.392Z",
            "id": 4337,
            "count": 4,
            "ms": 12.854200000001583
          }
        ],
        "packMs": 1356.8021999999924
      },
      "wallMs": 94638.42129999999,
      "latency": {
        "model": {
          "count": 115,
          "meanMs": 783.4606495652174,
          "p95Ms": 2181.674799999999,
          "maxMs": 2545.6413000000002
        },
        "opponent": {
          "count": 312,
          "meanMs": 11.234672756409712,
          "p95Ms": 48.873399999996764,
          "maxMs": 222.90959999999905
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-8-s0\\p2-8-s0"
    },
    {
      "id": "p2-8-s1",
      "slot": 8,
      "seat": 1,
      "seed": 310008072,
      "opponent": "hard",
      "players": 2,
      "map": "(2) Swamplands.aem",
      "category": "preset_units",
      "modelPlayer": 1,
      "initialSha256": "4c63bab19a2994408656f39a527f87a67ce0ca5138e0c5dc069e0dab80f771f3",
      "firstToActPlayer": 1,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_win",
      "winner": 2,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 201,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 202,
      "rounds": 5,
      "roots": 71,
      "witnessCount": 16,
      "witnessActions": 196,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 4685,
        "observations": 14043,
        "completed": 4685,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 68302.71060000031,
        "peakBatchSize": 32,
        "bytes": 912199308,
        "decisionRequests": 4683,
        "decisionObservations": 14010,
        "completedDecisionObservations": 14010,
        "decisionWireMs": 65570.70970000031,
        "decisionPeakBatchSize": 28,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.624Z",
            "id": 4654,
            "count": 4,
            "bytes": 191611,
            "remainingMs": 2712.2842999999993
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.645Z",
            "id": 4654,
            "count": 4,
            "ms": 21.2216999999946
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.652Z",
            "id": 4655,
            "count": 4,
            "bytes": 179324,
            "remainingMs": 2684.5924000000086
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.671Z",
            "id": 4655,
            "count": 4,
            "ms": 18.97729999999865
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.678Z",
            "id": 4656,
            "count": 4,
            "bytes": 185648,
            "remainingMs": 2658.5592000000033
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.694Z",
            "id": 4656,
            "count": 4,
            "ms": 15.816900000005262
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.697Z",
            "id": 4657,
            "count": 2,
            "bytes": 100194,
            "remainingMs": 2639.2715000000026
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.714Z",
            "id": 4657,
            "count": 2,
            "ms": 17.33169999999518
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.717Z",
            "id": 4658,
            "count": 2,
            "bytes": 95112,
            "remainingMs": 2619.560700000002
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.732Z",
            "id": 4658,
            "count": 2,
            "ms": 14.762300000002142
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.734Z",
            "id": 4659,
            "count": 1,
            "bytes": 44534,
            "remainingMs": 2602.800900000002
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.748Z",
            "id": 4659,
            "count": 1,
            "ms": 14.123399999996764
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.749Z",
            "id": 4660,
            "count": 1,
            "bytes": 45093,
            "remainingMs": 2587.3554000000004
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.762Z",
            "id": 4660,
            "count": 1,
            "ms": 13.29309999999532
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.764Z",
            "id": 4661,
            "count": 1,
            "bytes": 44705,
            "remainingMs": 2572.4091000000044
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.777Z",
            "id": 4661,
            "count": 1,
            "ms": 13.090599999995902
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.785Z",
            "id": 4662,
            "count": 4,
            "bytes": 226654,
            "remainingMs": 2551.3628000000026
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.800Z",
            "id": 4662,
            "count": 4,
            "ms": 14.704700000002049
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.803Z",
            "id": 4663,
            "count": 4,
            "bytes": 183712,
            "remainingMs": 2533.020199999999
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.819Z",
            "id": 4663,
            "count": 4,
            "ms": 15.369999999995343
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.824Z",
            "id": 4664,
            "count": 3,
            "bytes": 149969,
            "remainingMs": 2511.9391000000032
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.841Z",
            "id": 4664,
            "count": 3,
            "ms": 16.58379999999306
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.846Z",
            "id": 4665,
            "count": 3,
            "bytes": 147356,
            "remainingMs": 2490.22570000001
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.863Z",
            "id": 4665,
            "count": 3,
            "ms": 16.70000000001164
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.869Z",
            "id": 4666,
            "count": 4,
            "bytes": 179884,
            "remainingMs": 2467.161300000007
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.889Z",
            "id": 4666,
            "count": 4,
            "ms": 20.05229999999574
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.895Z",
            "id": 4667,
            "count": 3,
            "bytes": 135258,
            "remainingMs": 2441.357400000008
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.908Z",
            "id": 4667,
            "count": 3,
            "ms": 12.915200000003097
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.910Z",
            "id": 4668,
            "count": 1,
            "bytes": 53201,
            "remainingMs": 2426.6386000000057
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.925Z",
            "id": 4668,
            "count": 1,
            "ms": 15.607700000007753
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.930Z",
            "id": 4669,
            "count": 4,
            "bytes": 167223,
            "remainingMs": 2406.811600000001
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.946Z",
            "id": 4669,
            "count": 4,
            "ms": 16.909799999993993
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.952Z",
            "id": 4670,
            "count": 2,
            "bytes": 89193,
            "remainingMs": 2384.0650000000023
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.964Z",
            "id": 4670,
            "count": 2,
            "ms": 11.188800000003539
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.971Z",
            "id": 4671,
            "count": 4,
            "bytes": 221944,
            "remainingMs": 2365.4665000000095
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-192",
            "at": "2026-11-01T17:27:17.986Z",
            "id": 4671,
            "count": 4,
            "ms": 15.264500000004773
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-195",
            "at": "2026-11-01T17:27:17.996Z",
            "id": 4672,
            "count": 1,
            "bytes": 44641,
            "remainingMs": 2924.303899999999
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-195",
            "at": "2026-11-01T17:27:18.009Z",
            "id": 4672,
            "count": 1,
            "ms": 13.483600000006845
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-195",
            "at": "2026-11-01T17:27:18.013Z",
            "id": 4673,
            "count": 4,
            "bytes": 191308,
            "remainingMs": 2907.124299999996
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-195",
            "at": "2026-11-01T17:27:18.025Z",
            "id": 4673,
            "count": 4,
            "ms": 12.07709999999497
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-195",
            "at": "2026-11-01T17:27:18.032Z",
            "id": 4674,
            "count": 8,
            "bytes": 377331,
            "remainingMs": 2887.9602999999915
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-195",
            "at": "2026-11-01T17:27:18.057Z",
            "id": 4674,
            "count": 8,
            "ms": 24.96140000000014
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-195",
            "at": "2026-11-01T17:27:18.080Z",
            "id": 4675,
            "count": 16,
            "bytes": 670734,
            "remainingMs": 2839.8660999999993
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-195",
            "at": "2026-11-01T17:27:18.122Z",
            "id": 4675,
            "count": 16,
            "ms": 41.61840000000666
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-195",
            "at": "2026-11-01T17:27:18.127Z",
            "id": 4676,
            "count": 4,
            "bytes": 170211,
            "remainingMs": 2792.6388000000006
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-195",
            "at": "2026-11-01T17:27:18.145Z",
            "id": 4676,
            "count": 4,
            "ms": 17.67300000000978
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-195",
            "at": "2026-11-01T17:27:18.153Z",
            "id": 4677,
            "count": 4,
            "bytes": 167450,
            "remainingMs": 2766.9069000000018
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-195",
            "at": "2026-11-01T17:27:18.172Z",
            "id": 4677,
            "count": 4,
            "ms": 18.782300000006217
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-195",
            "at": "2026-11-01T17:27:18.175Z",
            "id": 4678,
            "count": 3,
            "bytes": 123961,
            "remainingMs": 2744.580600000001
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-195",
            "at": "2026-11-01T17:27:18.192Z",
            "id": 4678,
            "count": 3,
            "ms": 16.873400000011316
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-195",
            "at": "2026-11-01T17:27:18.202Z",
            "id": 4679,
            "count": 4,
            "bytes": 222044,
            "remainingMs": 2717.724199999997
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-195",
            "at": "2026-11-01T17:27:18.216Z",
            "id": 4679,
            "count": 4,
            "ms": 13.992899999997462
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-200",
            "at": "2026-11-01T17:27:18.251Z",
            "id": 4680,
            "count": 1,
            "bytes": 54564,
            "remainingMs": 2923.7419999999984
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-200",
            "at": "2026-11-01T17:27:18.265Z",
            "id": 4680,
            "count": 1,
            "ms": 13.812300000005052
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-200",
            "at": "2026-11-01T17:27:18.276Z",
            "id": 4681,
            "count": 6,
            "bytes": 266425,
            "remainingMs": 2899.0685999999987
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-200",
            "at": "2026-11-01T17:27:18.296Z",
            "id": 4681,
            "count": 6,
            "ms": 19.8634999999922
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-200",
            "at": "2026-11-01T17:27:18.318Z",
            "id": 4682,
            "count": 11,
            "bytes": 589309,
            "remainingMs": 2856.904699999999
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-200",
            "at": "2026-11-01T17:27:18.340Z",
            "id": 4682,
            "count": 11,
            "ms": 21.62039999999979
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-200",
            "at": "2026-11-01T17:27:18.343Z",
            "id": 4683,
            "count": 2,
            "bytes": 108258,
            "remainingMs": 2831.7985000000044
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-200",
            "at": "2026-11-01T17:27:18.357Z",
            "id": 4683,
            "count": 2,
            "ms": 13.512300000002142
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-200",
            "at": "2026-11-01T17:27:18.367Z",
            "id": 4684,
            "count": 3,
            "bytes": 160342,
            "remainingMs": 2808.300199999998
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-200",
            "at": "2026-11-01T17:27:18.383Z",
            "id": 4684,
            "count": 3,
            "ms": 16.260999999998603
          },
          {
            "type": "request",
            "label": "p2-8-s1:step-200",
            "at": "2026-11-01T17:27:18.387Z",
            "id": 4685,
            "count": 1,
            "bytes": 44543,
            "remainingMs": 2787.8852000000043
          },
          {
            "type": "response",
            "label": "p2-8-s1:step-200",
            "at": "2026-11-01T17:27:18.399Z",
            "id": 4685,
            "count": 1,
            "ms": 11.51950000000943
          }
        ],
        "packMs": 1391.7030999998585
      },
      "wallMs": 95028.8101,
      "latency": {
        "model": {
          "count": 132,
          "meanMs": 703.8008553030298,
          "p95Ms": 2071.7176999999992,
          "maxMs": 2722.5140999999994
        },
        "opponent": {
          "count": 70,
          "meanMs": 22.596571428571977,
          "p95Ms": 36.87960000000021,
          "maxMs": 1002.209600000002
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-8-s1\\p2-8-s1"
    },
    {
      "id": "p2-9-s0",
      "slot": 9,
      "seat": 0,
      "seed": 310009081,
      "opponent": "hard",
      "players": 2,
      "map": "(2) Peak Island.aem",
      "category": "skill",
      "modelPlayer": 0,
      "initialSha256": "9f5fe48304f2a0d3f734d39d8492f811f01e9034914bcdfd06ffd3eb7aca1e82",
      "firstToActPlayer": 1,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 2,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 376,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 377,
      "rounds": 12,
      "roots": 62,
      "witnessCount": 18,
      "witnessActions": 324,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 3350,
        "observations": 11332,
        "completed": 3350,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 47257.98959999988,
        "peakBatchSize": 32,
        "bytes": 661150947,
        "decisionRequests": 3348,
        "decisionObservations": 11299,
        "completedDecisionObservations": 11299,
        "decisionWireMs": 44314.61619999988,
        "decisionPeakBatchSize": 25,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.388Z",
            "id": 3319,
            "count": 4,
            "bytes": 198171,
            "remainingMs": 2425.7410999999993
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.400Z",
            "id": 3319,
            "count": 4,
            "ms": 11.944700000007288
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.406Z",
            "id": 3320,
            "count": 4,
            "bytes": 213088,
            "remainingMs": 2408.452999999994
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.419Z",
            "id": 3320,
            "count": 4,
            "ms": 13.423500000004424
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.430Z",
            "id": 3321,
            "count": 4,
            "bytes": 194152,
            "remainingMs": 2384.5889000000025
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.444Z",
            "id": 3321,
            "count": 4,
            "ms": 14.07280000000901
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.448Z",
            "id": 3322,
            "count": 4,
            "bytes": 208972,
            "remainingMs": 2365.7168999999994
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.461Z",
            "id": 3322,
            "count": 4,
            "ms": 12.544000000008964
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.471Z",
            "id": 3323,
            "count": 4,
            "bytes": 192159,
            "remainingMs": 2343.502800000002
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.484Z",
            "id": 3323,
            "count": 4,
            "ms": 12.97510000001057
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.489Z",
            "id": 3324,
            "count": 4,
            "bytes": 206506,
            "remainingMs": 2325.6480999999912
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.501Z",
            "id": 3324,
            "count": 4,
            "ms": 12.259299999990617
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.509Z",
            "id": 3325,
            "count": 3,
            "bytes": 142661,
            "remainingMs": 2305.205600000001
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.521Z",
            "id": 3325,
            "count": 3,
            "ms": 11.921100000006845
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.525Z",
            "id": 3326,
            "count": 4,
            "bytes": 205029,
            "remainingMs": 2288.9167000000016
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.537Z",
            "id": 3326,
            "count": 4,
            "ms": 11.622400000007474
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.546Z",
            "id": 3327,
            "count": 3,
            "bytes": 144654,
            "remainingMs": 2268.3562999999995
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.557Z",
            "id": 3327,
            "count": 3,
            "ms": 11.330900000000838
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.561Z",
            "id": 3328,
            "count": 4,
            "bytes": 199669,
            "remainingMs": 2252.945399999997
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.573Z",
            "id": 3328,
            "count": 4,
            "ms": 11.989000000001397
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.583Z",
            "id": 3329,
            "count": 4,
            "bytes": 196181,
            "remainingMs": 2231.0599999999977
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.596Z",
            "id": 3329,
            "count": 4,
            "ms": 12.953999999997905
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.605Z",
            "id": 3330,
            "count": 4,
            "bytes": 193032,
            "remainingMs": 2209.1594999999943
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.619Z",
            "id": 3330,
            "count": 4,
            "ms": 14.135099999999511
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.626Z",
            "id": 3331,
            "count": 3,
            "bytes": 143753,
            "remainingMs": 2188.0725999999995
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.639Z",
            "id": 3331,
            "count": 3,
            "ms": 12.45350000000326
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.644Z",
            "id": 3332,
            "count": 3,
            "bytes": 150290,
            "remainingMs": 2169.734700000001
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.657Z",
            "id": 3332,
            "count": 3,
            "ms": 12.890400000003865
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.661Z",
            "id": 3333,
            "count": 3,
            "bytes": 149228,
            "remainingMs": 2153.2556999999942
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.674Z",
            "id": 3333,
            "count": 3,
            "ms": 12.741299999994226
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.679Z",
            "id": 3334,
            "count": 3,
            "bytes": 156557,
            "remainingMs": 2135.4131999999954
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.697Z",
            "id": 3334,
            "count": 3,
            "ms": 18.426399999996647
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.704Z",
            "id": 3335,
            "count": 4,
            "bytes": 203032,
            "remainingMs": 2110.083599999998
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-347",
            "at": "2026-11-01T17:28:32.722Z",
            "id": 3335,
            "count": 4,
            "ms": 17.70820000000822
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:32.915Z",
            "id": 3336,
            "count": 1,
            "bytes": 50022,
            "remainingMs": 2924.0314999999973
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:32.928Z",
            "id": 3336,
            "count": 1,
            "ms": 12.81590000000142
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:32.934Z",
            "id": 3337,
            "count": 4,
            "bytes": 208236,
            "remainingMs": 2905.037400000001
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:32.946Z",
            "id": 3337,
            "count": 4,
            "ms": 12.37380000000121
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:32.961Z",
            "id": 3338,
            "count": 8,
            "bytes": 467158,
            "remainingMs": 2878.141399999993
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:32.976Z",
            "id": 3338,
            "count": 8,
            "ms": 14.548599999994622
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:32.981Z",
            "id": 3339,
            "count": 4,
            "bytes": 233658,
            "remainingMs": 2858.535999999993
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:32.993Z",
            "id": 3339,
            "count": 4,
            "ms": 12.231499999994412
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:32.998Z",
            "id": 3340,
            "count": 1,
            "bytes": 49658,
            "remainingMs": 2840.6736999999994
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.010Z",
            "id": 3340,
            "count": 1,
            "ms": 11.668600000004517
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.016Z",
            "id": 3341,
            "count": 4,
            "bytes": 228784,
            "remainingMs": 2822.8766000000032
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.029Z",
            "id": 3341,
            "count": 4,
            "ms": 12.27740000000631
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.034Z",
            "id": 3342,
            "count": 1,
            "bytes": 49658,
            "remainingMs": 2804.749499999991
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.045Z",
            "id": 3342,
            "count": 1,
            "ms": 10.56009999998787
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.051Z",
            "id": 3343,
            "count": 4,
            "bytes": 224676,
            "remainingMs": 2788.3840999999957
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.064Z",
            "id": 3343,
            "count": 4,
            "ms": 13.667199999996228
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.073Z",
            "id": 3344,
            "count": 3,
            "bytes": 146647,
            "remainingMs": 2766.2831999999908
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.085Z",
            "id": 3344,
            "count": 3,
            "ms": 12.38859999999113
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.091Z",
            "id": 3345,
            "count": 4,
            "bytes": 216303,
            "remainingMs": 2748.116599999994
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.103Z",
            "id": 3345,
            "count": 4,
            "ms": 12.316500000000815
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.111Z",
            "id": 3346,
            "count": 3,
            "bytes": 142661,
            "remainingMs": 2728.334699999992
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.124Z",
            "id": 3346,
            "count": 3,
            "ms": 12.805999999996857
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.130Z",
            "id": 3347,
            "count": 4,
            "bytes": 207250,
            "remainingMs": 2708.9358999999968
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.143Z",
            "id": 3347,
            "count": 4,
            "ms": 12.817399999999907
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.152Z",
            "id": 3348,
            "count": 4,
            "bytes": 186416,
            "remainingMs": 2687.1736999999994
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.165Z",
            "id": 3348,
            "count": 4,
            "ms": 12.7502000000095
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.168Z",
            "id": 3349,
            "count": 2,
            "bytes": 99768,
            "remainingMs": 2671.113499999992
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.180Z",
            "id": 3349,
            "count": 2,
            "ms": 12.446899999995367
          },
          {
            "type": "request",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.184Z",
            "id": 3350,
            "count": 2,
            "bytes": 91406,
            "remainingMs": 2655.059599999993
          },
          {
            "type": "response",
            "label": "p2-9-s0:step-369",
            "at": "2026-11-01T17:28:33.200Z",
            "id": 3350,
            "count": 2,
            "ms": 15.560799999992014
          }
        ],
        "packMs": 1011.9528000002333
      },
      "wallMs": 70848.01,
      "latency": {
        "model": {
          "count": 131,
          "meanMs": 502.5834061068699,
          "p95Ms": 1435.0047999999988,
          "maxMs": 2046.2255999999998
        },
        "opponent": {
          "count": 246,
          "meanMs": 16.559201219512474,
          "p95Ms": 72.21630000000005,
          "maxMs": 348.1660999999999
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-9-s0\\p2-9-s0"
    },
    {
      "id": "p2-9-s1",
      "slot": 9,
      "seat": 1,
      "seed": 310009081,
      "opponent": "hard",
      "players": 2,
      "map": "(2) Peak Island.aem",
      "category": "skill",
      "modelPlayer": 1,
      "initialSha256": "9f5fe48304f2a0d3f734d39d8492f811f01e9034914bcdfd06ffd3eb7aca1e82",
      "firstToActPlayer": 1,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_win",
      "winner": 2,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 591,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 592,
      "rounds": 14,
      "roots": 236,
      "witnessCount": 47,
      "witnessActions": 433,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 11077,
        "observations": 34861,
        "completed": 11077,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 152045.32310000045,
        "peakBatchSize": 32,
        "bytes": 2572566703,
        "decisionRequests": 11075,
        "decisionObservations": 34828,
        "completedDecisionObservations": 34828,
        "decisionWireMs": 149444.02790000042,
        "decisionPeakBatchSize": 31,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p2-9-s1:step-588",
            "at": "2026-11-01T17:32:35.307Z",
            "id": 11046,
            "count": 1,
            "bytes": 76099,
            "remainingMs": 2473.4907999999996
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-588",
            "at": "2026-11-01T17:32:35.318Z",
            "id": 11046,
            "count": 1,
            "ms": 11.446100000001024
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-588",
            "at": "2026-11-01T17:32:35.321Z",
            "id": 11047,
            "count": 1,
            "bytes": 75811,
            "remainingMs": 2458.824800000002
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-588",
            "at": "2026-11-01T17:32:35.332Z",
            "id": 11047,
            "count": 1,
            "ms": 10.275200000003679
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-588",
            "at": "2026-11-01T17:32:35.335Z",
            "id": 11048,
            "count": 1,
            "bytes": 75363,
            "remainingMs": 2445.223800000007
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-588",
            "at": "2026-11-01T17:32:35.345Z",
            "id": 11048,
            "count": 1,
            "ms": 10.105600000009872
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-588",
            "at": "2026-11-01T17:32:35.348Z",
            "id": 11049,
            "count": 1,
            "bytes": 74354,
            "remainingMs": 2431.7820000000065
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-588",
            "at": "2026-11-01T17:32:35.359Z",
            "id": 11049,
            "count": 1,
            "ms": 10.77960000000894
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-588",
            "at": "2026-11-01T17:32:35.361Z",
            "id": 11050,
            "count": 1,
            "bytes": 73767,
            "remainingMs": 2419.273499999981
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-588",
            "at": "2026-11-01T17:32:35.371Z",
            "id": 11050,
            "count": 1,
            "ms": 10.359499999991385
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-588",
            "at": "2026-11-01T17:32:35.377Z",
            "id": 11051,
            "count": 1,
            "bytes": 77018,
            "remainingMs": 2402.9465999999957
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-588",
            "at": "2026-11-01T17:32:35.388Z",
            "id": 11051,
            "count": 1,
            "ms": 10.668000000005122
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-588",
            "at": "2026-11-01T17:32:35.391Z",
            "id": 11052,
            "count": 1,
            "bytes": 83792,
            "remainingMs": 2388.7025999999896
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-588",
            "at": "2026-11-01T17:32:35.402Z",
            "id": 11052,
            "count": 1,
            "ms": 10.970799999980954
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.413Z",
            "id": 11053,
            "count": 1,
            "bytes": 83752,
            "remainingMs": 2923.0842999999877
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.424Z",
            "id": 11053,
            "count": 1,
            "ms": 10.586799999990035
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.428Z",
            "id": 11054,
            "count": 1,
            "bytes": 73346,
            "remainingMs": 2908.4853000000003
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.439Z",
            "id": 11054,
            "count": 1,
            "ms": 11.572899999999208
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.449Z",
            "id": 11055,
            "count": 4,
            "bytes": 333488,
            "remainingMs": 2887.414299999975
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.463Z",
            "id": 11055,
            "count": 4,
            "ms": 14.028999999980442
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.468Z",
            "id": 11056,
            "count": 3,
            "bytes": 250120,
            "remainingMs": 2867.8597999999765
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.482Z",
            "id": 11056,
            "count": 3,
            "ms": 13.729699999996228
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.486Z",
            "id": 11057,
            "count": 1,
            "bytes": 73346,
            "remainingMs": 2849.6753000000026
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.499Z",
            "id": 11057,
            "count": 1,
            "ms": 12.592900000017835
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.504Z",
            "id": 11058,
            "count": 2,
            "bytes": 165872,
            "remainingMs": 2832.497299999988
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.517Z",
            "id": 11058,
            "count": 2,
            "ms": 13.02410000000964
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.522Z",
            "id": 11059,
            "count": 2,
            "bytes": 165776,
            "remainingMs": 2813.945799999987
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.535Z",
            "id": 11059,
            "count": 2,
            "ms": 13.061599999986356
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.545Z",
            "id": 11060,
            "count": 2,
            "bytes": 165248,
            "remainingMs": 2791.5809999999765
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.558Z",
            "id": 11060,
            "count": 2,
            "ms": 13.74199999999837
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.567Z",
            "id": 11061,
            "count": 2,
            "bytes": 163920,
            "remainingMs": 2769.1445999999996
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.579Z",
            "id": 11061,
            "count": 2,
            "ms": 11.790700000012293
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.588Z",
            "id": 11062,
            "count": 2,
            "bytes": 162928,
            "remainingMs": 2748.2938999999897
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.602Z",
            "id": 11062,
            "count": 2,
            "ms": 14.23519999999553
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.612Z",
            "id": 11063,
            "count": 2,
            "bytes": 162544,
            "remainingMs": 2724.1876999999804
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.627Z",
            "id": 11063,
            "count": 2,
            "ms": 14.831600000004983
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.635Z",
            "id": 11064,
            "count": 2,
            "bytes": 161710,
            "remainingMs": 2700.9832999999926
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.648Z",
            "id": 11064,
            "count": 2,
            "ms": 12.831100000010338
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.657Z",
            "id": 11065,
            "count": 2,
            "bytes": 159662,
            "remainingMs": 2679.209099999978
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.668Z",
            "id": 11065,
            "count": 2,
            "ms": 11.434099999984028
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.677Z",
            "id": 11066,
            "count": 2,
            "bytes": 159182,
            "remainingMs": 2659.1900000000023
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.691Z",
            "id": 11066,
            "count": 2,
            "ms": 13.766600000002654
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.698Z",
            "id": 11067,
            "count": 2,
            "bytes": 158222,
            "remainingMs": 2637.9418000000005
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.713Z",
            "id": 11067,
            "count": 2,
            "ms": 14.424400000018068
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.720Z",
            "id": 11068,
            "count": 2,
            "bytes": 157198,
            "remainingMs": 2616.5050999999803
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.734Z",
            "id": 11068,
            "count": 2,
            "ms": 14.21109999998589
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.742Z",
            "id": 11069,
            "count": 2,
            "bytes": 156270,
            "remainingMs": 2594.181899999996
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.754Z",
            "id": 11069,
            "count": 2,
            "ms": 12.13289999999688
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.762Z",
            "id": 11070,
            "count": 2,
            "bytes": 155342,
            "remainingMs": 2574.508199999982
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.775Z",
            "id": 11070,
            "count": 2,
            "ms": 13.252000000007683
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.783Z",
            "id": 11071,
            "count": 2,
            "bytes": 153162,
            "remainingMs": 2553.223499999993
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.794Z",
            "id": 11071,
            "count": 2,
            "ms": 11.299300000013318
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.801Z",
            "id": 11072,
            "count": 2,
            "bytes": 151912,
            "remainingMs": 2534.936799999996
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.814Z",
            "id": 11072,
            "count": 2,
            "ms": 12.991600000008475
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.821Z",
            "id": 11073,
            "count": 2,
            "bytes": 151270,
            "remainingMs": 2515.541499999992
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.834Z",
            "id": 11073,
            "count": 2,
            "ms": 13.854200000001583
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.842Z",
            "id": 11074,
            "count": 2,
            "bytes": 150630,
            "remainingMs": 2494.5035999999964
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.855Z",
            "id": 11074,
            "count": 2,
            "ms": 13.602700000017649
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.862Z",
            "id": 11075,
            "count": 2,
            "bytes": 149925,
            "remainingMs": 2474.0745999999926
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.874Z",
            "id": 11075,
            "count": 2,
            "ms": 11.702599999989616
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.880Z",
            "id": 11076,
            "count": 2,
            "bytes": 148532,
            "remainingMs": 2455.837899999984
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.891Z",
            "id": 11076,
            "count": 2,
            "ms": 10.459799999982351
          },
          {
            "type": "request",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.899Z",
            "id": 11077,
            "count": 2,
            "bytes": 171424,
            "remainingMs": 2437.147100000002
          },
          {
            "type": "response",
            "label": "p2-9-s1:step-590",
            "at": "2026-11-01T17:32:35.910Z",
            "id": 11077,
            "count": 2,
            "ms": 10.80470000000787
          }
        ],
        "packMs": 3671.9341000003074
      },
      "wallMs": 239060.7957,
      "latency": {
        "model": {
          "count": 448,
          "meanMs": 525.375628571428,
          "p95Ms": 1742.7566000000006,
          "maxMs": 2224.8143999999993
        },
        "opponent": {
          "count": 144,
          "meanMs": 14.045267361111833,
          "p95Ms": 58.92059999999765,
          "maxMs": 133.00690000000031
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p2-9-s1\\p2-9-s1"
    },
    {
      "id": "p3-10-s0",
      "slot": 10,
      "seat": 0,
      "seed": 310010090,
      "opponent": "hard",
      "players": 3,
      "map": "(3) classic 2.aem",
      "category": "normal",
      "modelPlayer": 0,
      "initialSha256": "3453a6f42f356f0af305207f3b9bb1a61623908d0de2e032b5f8c8c87b24a6b3",
      "firstToActPlayer": 0,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_win",
      "winner": 1,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 626,
          "ids": [
            3
          ],
          "averagePlace": 3,
          "normalizedRank": 0
        },
        {
          "step": 1129,
          "ids": [
            2
          ],
          "averagePlace": 2,
          "normalizedRank": 0.5
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 1130,
      "rounds": 24,
      "roots": 344,
      "witnessCount": 56,
      "witnessActions": 983,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 18856,
        "observations": 59672,
        "completed": 18856,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 253001.7695999996,
        "peakBatchSize": 32,
        "bytes": 4994944223,
        "decisionRequests": 18854,
        "decisionObservations": 59639,
        "completedDecisionObservations": 59639,
        "decisionWireMs": 250182.8954999996,
        "decisionPeakBatchSize": 25,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:27.957Z",
            "id": 18825,
            "count": 4,
            "bytes": 452681,
            "remainingMs": 2886.486600000004
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:27.970Z",
            "id": 18825,
            "count": 4,
            "ms": 13.104300000006333
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:27.976Z",
            "id": 18826,
            "count": 3,
            "bytes": 339569,
            "remainingMs": 2867.571499999962
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:27.988Z",
            "id": 18826,
            "count": 3,
            "ms": 11.371699999959674
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:27.991Z",
            "id": 18827,
            "count": 1,
            "bytes": 100258,
            "remainingMs": 2852.725299999991
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.002Z",
            "id": 18827,
            "count": 1,
            "ms": 10.523199999995995
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.007Z",
            "id": 18828,
            "count": 2,
            "bytes": 225593,
            "remainingMs": 2837.0876999999746
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.017Z",
            "id": 18828,
            "count": 2,
            "ms": 10.440100000007078
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.024Z",
            "id": 18829,
            "count": 2,
            "bytes": 224313,
            "remainingMs": 2819.7842999999993
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.035Z",
            "id": 18829,
            "count": 2,
            "ms": 10.872800000011921
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.041Z",
            "id": 18830,
            "count": 2,
            "bytes": 222393,
            "remainingMs": 2802.7381999999634
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.052Z",
            "id": 18830,
            "count": 2,
            "ms": 10.9541999999783
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.058Z",
            "id": 18831,
            "count": 2,
            "bytes": 221529,
            "remainingMs": 2785.911699999997
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.072Z",
            "id": 18831,
            "count": 2,
            "ms": 13.71950000000652
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.079Z",
            "id": 18832,
            "count": 2,
            "bytes": 221145,
            "remainingMs": 2765.3047999999835
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.090Z",
            "id": 18832,
            "count": 2,
            "ms": 11.198099999979604
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.095Z",
            "id": 18833,
            "count": 2,
            "bytes": 220601,
            "remainingMs": 2748.5176999999676
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.106Z",
            "id": 18833,
            "count": 2,
            "ms": 10.576299999956973
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.112Z",
            "id": 18834,
            "count": 2,
            "bytes": 219801,
            "remainingMs": 2731.9760999999708
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.123Z",
            "id": 18834,
            "count": 2,
            "ms": 10.897100000001956
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.128Z",
            "id": 18835,
            "count": 2,
            "bytes": 219353,
            "remainingMs": 2715.9619999999995
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.139Z",
            "id": 18835,
            "count": 2,
            "ms": 11.04550000000745
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.144Z",
            "id": 18836,
            "count": 2,
            "bytes": 218361,
            "remainingMs": 2699.739799999981
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.154Z",
            "id": 18836,
            "count": 2,
            "ms": 10.205699999991339
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.160Z",
            "id": 18837,
            "count": 2,
            "bytes": 217593,
            "remainingMs": 2683.7929000000004
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.173Z",
            "id": 18837,
            "count": 2,
            "ms": 12.470499999995809
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.178Z",
            "id": 18838,
            "count": 2,
            "bytes": 216120,
            "remainingMs": 2665.8512999999803
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.191Z",
            "id": 18838,
            "count": 2,
            "ms": 12.634799999999814
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.196Z",
            "id": 18839,
            "count": 2,
            "bytes": 214903,
            "remainingMs": 2648.2870999999577
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.209Z",
            "id": 18839,
            "count": 2,
            "ms": 13.230299999995623
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.213Z",
            "id": 18840,
            "count": 2,
            "bytes": 213495,
            "remainingMs": 2630.471900000004
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.224Z",
            "id": 18840,
            "count": 2,
            "ms": 10.369400000025053
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.228Z",
            "id": 18841,
            "count": 2,
            "bytes": 212759,
            "remainingMs": 2615.536599999992
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.239Z",
            "id": 18841,
            "count": 2,
            "ms": 10.539500000013504
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.243Z",
            "id": 18842,
            "count": 2,
            "bytes": 212055,
            "remainingMs": 2600.8223
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.254Z",
            "id": 18842,
            "count": 2,
            "ms": 10.648700000019744
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.258Z",
            "id": 18843,
            "count": 2,
            "bytes": 211351,
            "remainingMs": 2585.9776999999885
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.269Z",
            "id": 18843,
            "count": 2,
            "ms": 11.504799999995157
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.272Z",
            "id": 18844,
            "count": 1,
            "bytes": 100267,
            "remainingMs": 2572.0951999999816
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.282Z",
            "id": 18844,
            "count": 1,
            "ms": 10.675099999993108
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.286Z",
            "id": 18845,
            "count": 2,
            "bytes": 210391,
            "remainingMs": 2557.931600000011
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.296Z",
            "id": 18845,
            "count": 2,
            "ms": 10.46940000000177
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.301Z",
            "id": 18846,
            "count": 2,
            "bytes": 209495,
            "remainingMs": 2543.197999999975
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.311Z",
            "id": 18846,
            "count": 2,
            "ms": 10.268199999991339
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.316Z",
            "id": 18847,
            "count": 2,
            "bytes": 208214,
            "remainingMs": 2528.12089999998
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.326Z",
            "id": 18847,
            "count": 2,
            "ms": 10.07760000001872
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.329Z",
            "id": 18848,
            "count": 2,
            "bytes": 207124,
            "remainingMs": 2514.3819999999832
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.340Z",
            "id": 18848,
            "count": 2,
            "ms": 10.342899999988731
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.343Z",
            "id": 18849,
            "count": 2,
            "bytes": 206769,
            "remainingMs": 2500.410899999959
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.354Z",
            "id": 18849,
            "count": 2,
            "ms": 10.742199999978766
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.358Z",
            "id": 18850,
            "count": 2,
            "bytes": 206449,
            "remainingMs": 2486.0266999999876
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.369Z",
            "id": 18850,
            "count": 2,
            "ms": 11.544400000013411
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.373Z",
            "id": 18851,
            "count": 2,
            "bytes": 205639,
            "remainingMs": 2470.6265999999596
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.383Z",
            "id": 18851,
            "count": 2,
            "ms": 10.147599999967497
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.387Z",
            "id": 18852,
            "count": 2,
            "bytes": 204839,
            "remainingMs": 2456.739899999986
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.399Z",
            "id": 18852,
            "count": 2,
            "ms": 11.790199999988545
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.402Z",
            "id": 18853,
            "count": 2,
            "bytes": 204102,
            "remainingMs": 2441.507500000007
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.413Z",
            "id": 18853,
            "count": 2,
            "ms": 10.154500000004191
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.416Z",
            "id": 18854,
            "count": 2,
            "bytes": 202628,
            "remainingMs": 2427.813599999994
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.426Z",
            "id": 18854,
            "count": 2,
            "ms": 9.990300000004936
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.429Z",
            "id": 18855,
            "count": 2,
            "bytes": 201538,
            "remainingMs": 2414.6322999999975
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.441Z",
            "id": 18855,
            "count": 2,
            "ms": 11.759400000039022
          },
          {
            "type": "request",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.448Z",
            "id": 18856,
            "count": 2,
            "bytes": 228025,
            "remainingMs": 2395.955900000001
          },
          {
            "type": "response",
            "label": "p3-10-s0:step-1128",
            "at": "2026-11-01T17:39:28.460Z",
            "id": 18856,
            "count": 2,
            "ms": 11.70329999999376
          }
        ],
        "packMs": 6642.478200000583
      },
      "wallMs": 408732.4811,
      "latency": {
        "model": {
          "count": 674,
          "meanMs": 597.2923366468843,
          "p95Ms": 1862.6943000000028,
          "maxMs": 2706.570399999968
        },
        "opponent": {
          "count": 456,
          "meanMs": 7.192702192981804,
          "p95Ms": 27.6252000000095,
          "maxMs": 278.241399999999
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p3-10-s0\\p3-10-s0"
    },
    {
      "id": "p3-10-s1",
      "slot": 10,
      "seat": 1,
      "seed": 310010090,
      "opponent": "hard",
      "players": 3,
      "map": "(3) classic 2.aem",
      "category": "normal",
      "modelPlayer": 2,
      "initialSha256": "3453a6f42f356f0af305207f3b9bb1a61623908d0de2e032b5f8c8c87b24a6b3",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 1,
      "firstPlace": 0,
      "normalizedRank": 0.5,
      "eliminations": [
        {
          "step": 641,
          "ids": [
            3
          ],
          "averagePlace": 3,
          "normalizedRank": 0
        },
        {
          "step": 1415,
          "ids": [
            2
          ],
          "averagePlace": 2,
          "normalizedRank": 0.5
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 1416,
      "rounds": 27,
      "roots": 218,
      "witnessCount": 34,
      "witnessActions": 705,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 16195,
        "observations": 53190,
        "completed": 16195,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 198740.78159999996,
        "peakBatchSize": 32,
        "bytes": 4699585085,
        "decisionRequests": 16193,
        "decisionObservations": 53157,
        "completedDecisionObservations": 53157,
        "decisionWireMs": 196110.71279999995,
        "decisionPeakBatchSize": 18,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p3-10-s1:step-1336",
            "at": "2026-11-01T17:45:14.027Z",
            "id": 16164,
            "count": 4,
            "bytes": 352522,
            "remainingMs": 2222.830600000045
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1336",
            "at": "2026-11-01T17:45:14.039Z",
            "id": 16164,
            "count": 4,
            "ms": 11.972000000008848
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1336",
            "at": "2026-11-01T17:45:14.046Z",
            "id": 16165,
            "count": 4,
            "bytes": 350533,
            "remainingMs": 2203.8336000000127
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1336",
            "at": "2026-11-01T17:45:14.059Z",
            "id": 16165,
            "count": 4,
            "ms": 13.658400000014808
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1336",
            "at": "2026-11-01T17:45:14.067Z",
            "id": 16166,
            "count": 4,
            "bytes": 347964,
            "remainingMs": 2182.854900000035
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1336",
            "at": "2026-11-01T17:45:14.082Z",
            "id": 16166,
            "count": 4,
            "ms": 15.03269999998156
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1336",
            "at": "2026-11-01T17:45:14.089Z",
            "id": 16167,
            "count": 4,
            "bytes": 345436,
            "remainingMs": 2160.5179000000353
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1336",
            "at": "2026-11-01T17:45:14.101Z",
            "id": 16167,
            "count": 4,
            "ms": 11.815700000035577
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1336",
            "at": "2026-11-01T17:45:14.107Z",
            "id": 16168,
            "count": 4,
            "bytes": 343193,
            "remainingMs": 2142.59990000003
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1336",
            "at": "2026-11-01T17:45:14.121Z",
            "id": 16168,
            "count": 4,
            "ms": 14.114999999990687
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1336",
            "at": "2026-11-01T17:45:14.128Z",
            "id": 16169,
            "count": 4,
            "bytes": 341784,
            "remainingMs": 2121.8940000000293
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1336",
            "at": "2026-11-01T17:45:14.139Z",
            "id": 16169,
            "count": 4,
            "ms": 11.027500000025611
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1336",
            "at": "2026-11-01T17:45:14.150Z",
            "id": 16170,
            "count": 4,
            "bytes": 340406,
            "remainingMs": 2099.8647000000346
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1336",
            "at": "2026-11-01T17:45:14.163Z",
            "id": 16170,
            "count": 4,
            "ms": 13.036699999996927
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1336",
            "at": "2026-11-01T17:45:14.166Z",
            "id": 16171,
            "count": 1,
            "bytes": 85037,
            "remainingMs": 2083.6224999999977
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1336",
            "at": "2026-11-01T17:45:14.175Z",
            "id": 16171,
            "count": 1,
            "ms": 9.540199999988545
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1336",
            "at": "2026-11-01T17:45:14.183Z",
            "id": 16172,
            "count": 4,
            "bytes": 353738,
            "remainingMs": 2066.1365000000224
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1336",
            "at": "2026-11-01T17:45:14.196Z",
            "id": 16172,
            "count": 4,
            "ms": 12.45140000001993
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.545Z",
            "id": 16173,
            "count": 1,
            "bytes": 84359,
            "remainingMs": 2923.460699999996
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.558Z",
            "id": 16173,
            "count": 1,
            "ms": 12.241500000003725
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.560Z",
            "id": 16174,
            "count": 1,
            "bytes": 88502,
            "remainingMs": 2908.689299999969
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.572Z",
            "id": 16174,
            "count": 1,
            "ms": 11.541299999982584
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.580Z",
            "id": 16175,
            "count": 3,
            "bytes": 297495,
            "remainingMs": 2888.7567999999737
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.592Z",
            "id": 16175,
            "count": 3,
            "ms": 11.64159999997355
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.596Z",
            "id": 16176,
            "count": 2,
            "bytes": 198522,
            "remainingMs": 2873.2434999999823
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.606Z",
            "id": 16176,
            "count": 2,
            "ms": 10.652500000025611
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.609Z",
            "id": 16177,
            "count": 1,
            "bytes": 88135,
            "remainingMs": 2859.7666999999783
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.619Z",
            "id": 16177,
            "count": 1,
            "ms": 9.381099999998696
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.622Z",
            "id": 16178,
            "count": 1,
            "bytes": 98749,
            "remainingMs": 2847.0506999999634
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.634Z",
            "id": 16178,
            "count": 1,
            "ms": 11.89379999996163
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.637Z",
            "id": 16179,
            "count": 1,
            "bytes": 98557,
            "remainingMs": 2832.16459999996
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.646Z",
            "id": 16179,
            "count": 1,
            "ms": 9.631599999964237
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.648Z",
            "id": 16180,
            "count": 1,
            "bytes": 88177,
            "remainingMs": 2820.483499999973
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.663Z",
            "id": 16180,
            "count": 1,
            "ms": 14.678799999994226
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.666Z",
            "id": 16181,
            "count": 1,
            "bytes": 98301,
            "remainingMs": 2803.1841999999597
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.678Z",
            "id": 16181,
            "count": 1,
            "ms": 12.293699999980163
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.681Z",
            "id": 16182,
            "count": 1,
            "bytes": 98141,
            "remainingMs": 2787.806500000006
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.692Z",
            "id": 16182,
            "count": 1,
            "ms": 10.800900000031106
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.695Z",
            "id": 16183,
            "count": 1,
            "bytes": 97789,
            "remainingMs": 2774.0974999999744
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.707Z",
            "id": 16183,
            "count": 1,
            "ms": 12.286800000001676
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.710Z",
            "id": 16184,
            "count": 1,
            "bytes": 96829,
            "remainingMs": 2758.660799999954
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.720Z",
            "id": 16184,
            "count": 1,
            "ms": 9.919299999950454
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.723Z",
            "id": 16185,
            "count": 1,
            "bytes": 96605,
            "remainingMs": 2745.7838999999803
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.733Z",
            "id": 16185,
            "count": 1,
            "ms": 9.841399999975692
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.736Z",
            "id": 16186,
            "count": 1,
            "bytes": 95836,
            "remainingMs": 2733.0655999999726
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.746Z",
            "id": 16186,
            "count": 1,
            "ms": 10.091699999989942
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.749Z",
            "id": 16187,
            "count": 1,
            "bytes": 95388,
            "remainingMs": 2720.123800000001
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.761Z",
            "id": 16187,
            "count": 1,
            "ms": 12.100500000000466
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.764Z",
            "id": 16188,
            "count": 1,
            "bytes": 94588,
            "remainingMs": 2705.1011999999755
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.773Z",
            "id": 16188,
            "count": 1,
            "ms": 9.653300000005402
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.775Z",
            "id": 16189,
            "count": 1,
            "bytes": 88144,
            "remainingMs": 2693.603999999992
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.785Z",
            "id": 16189,
            "count": 1,
            "ms": 9.193700000003446
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.787Z",
            "id": 16190,
            "count": 1,
            "bytes": 94300,
            "remainingMs": 2682.2725999999675
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.797Z",
            "id": 16190,
            "count": 1,
            "ms": 10.208500000007916
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.799Z",
            "id": 16191,
            "count": 1,
            "bytes": 94108,
            "remainingMs": 2669.654899999965
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.811Z",
            "id": 16191,
            "count": 1,
            "ms": 11.861800000013318
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.814Z",
            "id": 16192,
            "count": 1,
            "bytes": 94108,
            "remainingMs": 2655.3582999999635
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.824Z",
            "id": 16192,
            "count": 1,
            "ms": 10.584600000001956
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.826Z",
            "id": 16193,
            "count": 1,
            "bytes": 88144,
            "remainingMs": 2642.7886999999755
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.838Z",
            "id": 16193,
            "count": 1,
            "ms": 11.964099999982864
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.840Z",
            "id": 16194,
            "count": 1,
            "bytes": 94140,
            "remainingMs": 2628.794899999979
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.850Z",
            "id": 16194,
            "count": 1,
            "ms": 9.678200000023935
          },
          {
            "type": "request",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.852Z",
            "id": 16195,
            "count": 1,
            "bytes": 88135,
            "remainingMs": 2617.2224999999744
          },
          {
            "type": "response",
            "label": "p3-10-s1:step-1387",
            "at": "2026-11-01T17:45:14.862Z",
            "id": 16195,
            "count": 1,
            "ms": 10.102100000018254
          }
        ],
        "packMs": 5887.8119999985365
      },
      "wallMs": 342943.9186,
      "latency": {
        "model": {
          "count": 448,
          "meanMs": 743.1844776785716,
          "p95Ms": 2121.6548000000184,
          "maxMs": 2489.2385000000068
        },
        "opponent": {
          "count": 968,
          "meanMs": 7.053800619834589,
          "p95Ms": 31.319799999997485,
          "maxMs": 260.54349999997066
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p3-10-s1\\p3-10-s1"
    },
    {
      "id": "p3-10-s2",
      "slot": 10,
      "seat": 2,
      "seed": 310010090,
      "opponent": "hard",
      "players": 3,
      "map": "(3) classic 2.aem",
      "category": "normal",
      "modelPlayer": 3,
      "initialSha256": "3453a6f42f356f0af305207f3b9bb1a61623908d0de2e032b5f8c8c87b24a6b3",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 3,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 536,
          "ids": [
            3
          ],
          "averagePlace": 3,
          "normalizedRank": 0
        },
        {
          "step": 1706,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0.5
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": true,
      "steps": 1707,
      "rounds": 37,
      "roots": 44,
      "witnessCount": 16,
      "witnessActions": 248,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 2872,
        "observations": 10116,
        "completed": 2872,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 37981.208200000074,
        "peakBatchSize": 32,
        "bytes": 768384985,
        "decisionRequests": 2870,
        "decisionObservations": 10083,
        "completedDecisionObservations": 10083,
        "decisionWireMs": 35168.87560000007,
        "decisionPeakBatchSize": 16,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.574Z",
            "id": 2841,
            "count": 2,
            "bytes": 204704,
            "remainingMs": 2232.621299999999
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.584Z",
            "id": 2841,
            "count": 2,
            "ms": 10.543400000002293
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.592Z",
            "id": 2842,
            "count": 4,
            "bytes": 424901,
            "remainingMs": 2213.980499999998
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.605Z",
            "id": 2842,
            "count": 4,
            "ms": 12.802600000002712
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.614Z",
            "id": 2843,
            "count": 2,
            "bytes": 204749,
            "remainingMs": 2192.5079999999944
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.626Z",
            "id": 2843,
            "count": 2,
            "ms": 11.780899999997928
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.635Z",
            "id": 2844,
            "count": 4,
            "bytes": 419708,
            "remainingMs": 2171.3081999999995
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.650Z",
            "id": 2844,
            "count": 4,
            "ms": 15.08310000000347
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.658Z",
            "id": 2845,
            "count": 1,
            "bytes": 100300,
            "remainingMs": 2148.516499999998
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.670Z",
            "id": 2845,
            "count": 1,
            "ms": 11.648600000000442
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.679Z",
            "id": 2846,
            "count": 4,
            "bytes": 413578,
            "remainingMs": 2127.7599999999948
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.701Z",
            "id": 2846,
            "count": 4,
            "ms": 22.326600000000326
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.714Z",
            "id": 2847,
            "count": 3,
            "bytes": 300600,
            "remainingMs": 2092.294799999996
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.727Z",
            "id": 2847,
            "count": 3,
            "ms": 12.635099999999511
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.736Z",
            "id": 2848,
            "count": 4,
            "bytes": 411530,
            "remainingMs": 2070.610099999998
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.749Z",
            "id": 2848,
            "count": 4,
            "ms": 13.44430000000284
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.758Z",
            "id": 2849,
            "count": 2,
            "bytes": 196485,
            "remainingMs": 2048.4909999999945
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.768Z",
            "id": 2849,
            "count": 2,
            "ms": 10.207699999999022
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.775Z",
            "id": 2850,
            "count": 4,
            "bytes": 409225,
            "remainingMs": 2031.1076999999932
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.788Z",
            "id": 2850,
            "count": 4,
            "ms": 12.295399999995425
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.795Z",
            "id": 2851,
            "count": 1,
            "bytes": 92048,
            "remainingMs": 2011.8424999999988
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.804Z",
            "id": 2851,
            "count": 1,
            "ms": 9.569400000000314
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.811Z",
            "id": 2852,
            "count": 4,
            "bytes": 403293,
            "remainingMs": 1995.7215999999971
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.824Z",
            "id": 2852,
            "count": 4,
            "ms": 12.97559999999794
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.831Z",
            "id": 2853,
            "count": 1,
            "bytes": 92090,
            "remainingMs": 1975.6836999999941
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.840Z",
            "id": 2853,
            "count": 1,
            "ms": 9.566500000000815
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.848Z",
            "id": 2854,
            "count": 4,
            "bytes": 397873,
            "remainingMs": 1958.8323999999993
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.859Z",
            "id": 2854,
            "count": 4,
            "ms": 11.458000000005995
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.876Z",
            "id": 2855,
            "count": 3,
            "bytes": 292241,
            "remainingMs": 1930.2314999999944
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.889Z",
            "id": 2855,
            "count": 3,
            "ms": 12.371899999998277
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.896Z",
            "id": 2856,
            "count": 4,
            "bytes": 396205,
            "remainingMs": 1910.5570999999982
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.908Z",
            "id": 2856,
            "count": 4,
            "ms": 12.152999999998428
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.919Z",
            "id": 2857,
            "count": 4,
            "bytes": 384252,
            "remainingMs": 1887.1900999999998
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.931Z",
            "id": 2857,
            "count": 4,
            "ms": 11.587400000003981
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.938Z",
            "id": 2858,
            "count": 4,
            "bytes": 382160,
            "remainingMs": 1868.885199999997
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.950Z",
            "id": 2858,
            "count": 4,
            "ms": 12.371800000000803
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.961Z",
            "id": 2859,
            "count": 4,
            "bytes": 372298,
            "remainingMs": 1845.6881999999969
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.973Z",
            "id": 2859,
            "count": 4,
            "ms": 12.279399999999441
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.979Z",
            "id": 2860,
            "count": 4,
            "bytes": 375843,
            "remainingMs": 1827.388899999998
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:17.992Z",
            "id": 2860,
            "count": 4,
            "ms": 12.448300000003655
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.001Z",
            "id": 2861,
            "count": 4,
            "bytes": 368120,
            "remainingMs": 1805.4461999999985
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.013Z",
            "id": 2861,
            "count": 4,
            "ms": 11.969100000002072
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.019Z",
            "id": 2862,
            "count": 4,
            "bytes": 365648,
            "remainingMs": 1786.9807
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.031Z",
            "id": 2862,
            "count": 4,
            "ms": 11.711800000004587
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.037Z",
            "id": 2863,
            "count": 2,
            "bytes": 184245,
            "remainingMs": 1769.0350999999937
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.048Z",
            "id": 2863,
            "count": 2,
            "ms": 10.610799999994924
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.055Z",
            "id": 2864,
            "count": 4,
            "bytes": 362824,
            "remainingMs": 1751.8064999999988
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.068Z",
            "id": 2864,
            "count": 4,
            "ms": 13.80970000000525
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.074Z",
            "id": 2865,
            "count": 2,
            "bytes": 185471,
            "remainingMs": 1732.0409999999974
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.084Z",
            "id": 2865,
            "count": 2,
            "ms": 9.995100000000093
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.090Z",
            "id": 2866,
            "count": 4,
            "bytes": 369250,
            "remainingMs": 1716.5836999999956
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.101Z",
            "id": 2866,
            "count": 4,
            "ms": 11.407200000001467
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.108Z",
            "id": 2867,
            "count": 3,
            "bytes": 286193,
            "remainingMs": 1698.7459999999992
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.119Z",
            "id": 2867,
            "count": 3,
            "ms": 10.858500000002095
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.122Z",
            "id": 2868,
            "count": 2,
            "bytes": 188289,
            "remainingMs": 1684.1194999999934
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.134Z",
            "id": 2868,
            "count": 2,
            "ms": 12.104599999998754
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.139Z",
            "id": 2869,
            "count": 2,
            "bytes": 197562,
            "remainingMs": 1667.863099999995
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.151Z",
            "id": 2869,
            "count": 2,
            "ms": 12.458599999998114
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.153Z",
            "id": 2870,
            "count": 1,
            "bytes": 100365,
            "remainingMs": 1653.2320999999938
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.165Z",
            "id": 2870,
            "count": 1,
            "ms": 12.26919999999518
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.167Z",
            "id": 2871,
            "count": 1,
            "bytes": 105158,
            "remainingMs": 1639.1363999999958
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.178Z",
            "id": 2871,
            "count": 1,
            "ms": 10.727200000001176
          },
          {
            "type": "request",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.186Z",
            "id": 2872,
            "count": 4,
            "bytes": 397738,
            "remainingMs": 1620.243899999994
          },
          {
            "type": "response",
            "label": "p3-10-s2:step-466",
            "at": "2026-11-01T17:46:18.200Z",
            "id": 2872,
            "count": 4,
            "ms": 13.727099999996426
          }
        ],
        "packMs": 1023.2920000000622
      },
      "wallMs": 71061.8811,
      "latency": {
        "model": {
          "count": 94,
          "meanMs": 595.8079276595746,
          "p95Ms": 2162.4623999999967,
          "maxMs": 2605.3626000000004
        },
        "opponent": {
          "count": 1613,
          "meanMs": 7.165705641661428,
          "p95Ms": 25.84560000000056,
          "maxMs": 419.16100000000733
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p3-10-s2\\p3-10-s2"
    },
    {
      "id": "p3-11-s0",
      "slot": 11,
      "seat": 0,
      "seed": 310011099,
      "opponent": "hard",
      "players": 3,
      "map": "(3) Glu.aem",
      "category": "preset_units",
      "modelPlayer": 0,
      "initialSha256": "6799fffe34ef7a5b0b7d7d3d8af63a190c9881393473bd38313c48b4dd6333d5",
      "firstToActPlayer": 2,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 3,
      "firstPlace": 0,
      "normalizedRank": 0.5,
      "eliminations": [
        {
          "step": 940,
          "ids": [
            1
          ],
          "averagePlace": 3,
          "normalizedRank": 0
        },
        {
          "step": 1071,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0.5
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 1072,
      "rounds": 28,
      "roots": 196,
      "witnessCount": 36,
      "witnessActions": 458,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 12742,
        "observations": 42149,
        "completed": 12742,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 159753.93580000318,
        "peakBatchSize": 32,
        "bytes": 3306721180,
        "decisionRequests": 12740,
        "decisionObservations": 42116,
        "completedDecisionObservations": 42116,
        "decisionWireMs": 157193.69850000317,
        "decisionPeakBatchSize": 28,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p3-11-s0:step-1034",
            "at": "2026-11-02T01:41:43.534Z",
            "id": 12711,
            "count": 1,
            "bytes": 64957,
            "remainingMs": 1815.2962000000116
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1034",
            "at": "2026-11-02T01:41:43.545Z",
            "id": 12711,
            "count": 1,
            "ms": 10.919800000003306
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1034",
            "at": "2026-11-02T01:41:43.547Z",
            "id": 12712,
            "count": 2,
            "bytes": 119507,
            "remainingMs": 1801.9172000000253
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1034",
            "at": "2026-11-02T01:41:43.558Z",
            "id": 12712,
            "count": 2,
            "ms": 10.597200000018347
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.709Z",
            "id": 12713,
            "count": 1,
            "bytes": 52780,
            "remainingMs": 2923.992200000008
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.722Z",
            "id": 12713,
            "count": 1,
            "ms": 13.49900000001071
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.725Z",
            "id": 12714,
            "count": 2,
            "bytes": 105204,
            "remainingMs": 2908.043000000005
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.738Z",
            "id": 12714,
            "count": 2,
            "ms": 12.99210000000312
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.749Z",
            "id": 12715,
            "count": 6,
            "bytes": 425282,
            "remainingMs": 2884.003700000001
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.762Z",
            "id": 12715,
            "count": 6,
            "ms": 12.918600000004517
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.768Z",
            "id": 12716,
            "count": 4,
            "bytes": 283212,
            "remainingMs": 2865.14929999999
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.781Z",
            "id": 12716,
            "count": 4,
            "ms": 12.810700000001816
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.800Z",
            "id": 12717,
            "count": 3,
            "bytes": 185459,
            "remainingMs": 2832.5035999999964
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.813Z",
            "id": 12717,
            "count": 3,
            "ms": 12.093800000002375
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.819Z",
            "id": 12718,
            "count": 4,
            "bytes": 280283,
            "remainingMs": 2813.585300000006
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.831Z",
            "id": 12718,
            "count": 4,
            "ms": 12.049100000003818
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.853Z",
            "id": 12719,
            "count": 3,
            "bytes": 185384,
            "remainingMs": 2780.276899999997
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.864Z",
            "id": 12719,
            "count": 3,
            "ms": 11.014399999985471
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.870Z",
            "id": 12720,
            "count": 4,
            "bytes": 278963,
            "remainingMs": 2762.501799999998
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.884Z",
            "id": 12720,
            "count": 4,
            "ms": 13.149200000014389
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.909Z",
            "id": 12721,
            "count": 4,
            "bytes": 274351,
            "remainingMs": 2723.740699999995
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.925Z",
            "id": 12721,
            "count": 4,
            "ms": 15.818899999983842
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.947Z",
            "id": 12722,
            "count": 3,
            "bytes": 185384,
            "remainingMs": 2685.900800000003
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.959Z",
            "id": 12722,
            "count": 3,
            "ms": 12.326700000005076
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.964Z",
            "id": 12723,
            "count": 3,
            "bytes": 203261,
            "remainingMs": 2668.618199999997
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.976Z",
            "id": 12723,
            "count": 3,
            "ms": 11.70350000000326
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:43.993Z",
            "id": 12724,
            "count": 2,
            "bytes": 123642,
            "remainingMs": 2640.230899999995
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.004Z",
            "id": 12724,
            "count": 2,
            "ms": 11.03059999999823
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.008Z",
            "id": 12725,
            "count": 3,
            "bytes": 201851,
            "remainingMs": 2624.9419000000053
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.020Z",
            "id": 12725,
            "count": 3,
            "ms": 12.216899999999441
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.036Z",
            "id": 12726,
            "count": 1,
            "bytes": 61992,
            "remainingMs": 2597.222699999984
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.048Z",
            "id": 12726,
            "count": 1,
            "ms": 12.184899999992922
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.051Z",
            "id": 12727,
            "count": 2,
            "bytes": 133937,
            "remainingMs": 2582.1944999999832
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.064Z",
            "id": 12727,
            "count": 2,
            "ms": 13.121399999974528
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.074Z",
            "id": 12728,
            "count": 1,
            "bytes": 61902,
            "remainingMs": 2558.9725000000035
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.084Z",
            "id": 12728,
            "count": 1,
            "ms": 9.97510000001057
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.087Z",
            "id": 12729,
            "count": 2,
            "bytes": 132239,
            "remainingMs": 2546.34090000001
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.097Z",
            "id": 12729,
            "count": 2,
            "ms": 10.687200000014855
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.108Z",
            "id": 12730,
            "count": 2,
            "bytes": 123642,
            "remainingMs": 2524.651199999993
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.118Z",
            "id": 12730,
            "count": 2,
            "ms": 9.90700000000652
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.121Z",
            "id": 12731,
            "count": 2,
            "bytes": 131055,
            "remainingMs": 2512.042699999991
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.132Z",
            "id": 12731,
            "count": 2,
            "ms": 10.628899999981513
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.142Z",
            "id": 12732,
            "count": 1,
            "bytes": 61902,
            "remainingMs": 2490.9159999999974
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.153Z",
            "id": 12732,
            "count": 1,
            "ms": 10.575799999991432
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.154Z",
            "id": 12733,
            "count": 1,
            "bytes": 64864,
            "remainingMs": 2478.985799999995
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.164Z",
            "id": 12733,
            "count": 1,
            "ms": 9.7274000000034
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.169Z",
            "id": 12734,
            "count": 1,
            "bytes": 61902,
            "remainingMs": 2463.649700000009
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.179Z",
            "id": 12734,
            "count": 1,
            "ms": 10.036300000007031
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.181Z",
            "id": 12735,
            "count": 1,
            "bytes": 64510,
            "remainingMs": 2452.358600000007
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.191Z",
            "id": 12735,
            "count": 1,
            "ms": 10.398700000019744
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.196Z",
            "id": 12736,
            "count": 1,
            "bytes": 64126,
            "remainingMs": 2436.5360999999975
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.206Z",
            "id": 12736,
            "count": 1,
            "ms": 9.936799999995856
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.211Z",
            "id": 12737,
            "count": 1,
            "bytes": 63710,
            "remainingMs": 2421.702799999999
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.227Z",
            "id": 12737,
            "count": 1,
            "ms": 15.407800000015413
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.232Z",
            "id": 12738,
            "count": 1,
            "bytes": 63196,
            "remainingMs": 2401.185999999987
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.241Z",
            "id": 12738,
            "count": 1,
            "ms": 9.506999999983236
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.246Z",
            "id": 12739,
            "count": 1,
            "bytes": 65342,
            "remainingMs": 2386.770499999984
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.257Z",
            "id": 12739,
            "count": 1,
            "ms": 10.795499999978347
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.258Z",
            "id": 12740,
            "count": 1,
            "bytes": 64747,
            "remainingMs": 2374.4683999999834
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.269Z",
            "id": 12740,
            "count": 1,
            "ms": 10.624399999971502
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.271Z",
            "id": 12741,
            "count": 1,
            "bytes": 67718,
            "remainingMs": 2361.669599999994
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.283Z",
            "id": 12741,
            "count": 1,
            "ms": 12.193399999989197
          },
          {
            "type": "request",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.286Z",
            "id": 12742,
            "count": 1,
            "bytes": 57150,
            "remainingMs": 2347.3826999999874
          },
          {
            "type": "response",
            "label": "p3-11-s0:step-1062",
            "at": "2026-11-02T01:41:44.298Z",
            "id": 12742,
            "count": 1,
            "ms": 12.063899999979185
          }
        ],
        "packMs": 4169.721100000329
      },
      "wallMs": 255698.826,
      "latency": {
        "model": {
          "count": 384,
          "meanMs": 636.5551848958333,
          "p95Ms": 1869.559000000001,
          "maxMs": 2828.2590999999993
        },
        "opponent": {
          "count": 688,
          "meanMs": 12.937581976743802,
          "p95Ms": 37.94679999999971,
          "maxMs": 2469.477999999999
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p3-11-s0\\p3-11-s0"
    },
    {
      "id": "p3-11-s1",
      "slot": 11,
      "seat": 1,
      "seed": 310011099,
      "opponent": "hard",
      "players": 3,
      "map": "(3) Glu.aem",
      "category": "preset_units",
      "modelPlayer": 1,
      "initialSha256": "6799fffe34ef7a5b0b7d7d3d8af63a190c9881393473bd38313c48b4dd6333d5",
      "firstToActPlayer": 2,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 3,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 1030,
          "ids": [
            1
          ],
          "averagePlace": 3,
          "normalizedRank": 0
        },
        {
          "step": 1123,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0.5
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": true,
      "steps": 1124,
      "rounds": 31,
      "roots": 171,
      "witnessCount": 40,
      "witnessActions": 483,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 10230,
        "observations": 36775,
        "completed": 10230,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 131168.8148999991,
        "peakBatchSize": 32,
        "bytes": 2863776017,
        "decisionRequests": 10228,
        "decisionObservations": 36742,
        "completedDecisionObservations": 36742,
        "decisionWireMs": 128611.4704999991,
        "decisionPeakBatchSize": 21,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.498Z",
            "id": 10199,
            "count": 4,
            "bytes": 218496,
            "remainingMs": 2135.6833000000042
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.510Z",
            "id": 10199,
            "count": 4,
            "ms": 12.152299999987008
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.516Z",
            "id": 10200,
            "count": 2,
            "bytes": 124358,
            "remainingMs": 2117.4616000000096
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.529Z",
            "id": 10200,
            "count": 2,
            "ms": 13.493799999996554
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.532Z",
            "id": 10201,
            "count": 2,
            "bytes": 123642,
            "remainingMs": 2101.5353000000177
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.545Z",
            "id": 10201,
            "count": 2,
            "ms": 13.236100000009174
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.549Z",
            "id": 10202,
            "count": 4,
            "bytes": 212128,
            "remainingMs": 2084.0338000000047
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.563Z",
            "id": 10202,
            "count": 4,
            "ms": 13.831699999980628
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.571Z",
            "id": 10203,
            "count": 4,
            "bytes": 214675,
            "remainingMs": 2062.0148000000045
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.586Z",
            "id": 10203,
            "count": 4,
            "ms": 14.752899999992223
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.589Z",
            "id": 10204,
            "count": 2,
            "bytes": 110444,
            "remainingMs": 2044.1615000000165
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.605Z",
            "id": 10204,
            "count": 2,
            "ms": 16.072099999990314
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.608Z",
            "id": 10205,
            "count": 2,
            "bytes": 112660,
            "remainingMs": 2024.9954000000143
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.620Z",
            "id": 10205,
            "count": 2,
            "ms": 11.428699999989476
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.621Z",
            "id": 10206,
            "count": 1,
            "bytes": 54820,
            "remainingMs": 2012.007500000007
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.635Z",
            "id": 10206,
            "count": 1,
            "ms": 13.298500000004424
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.636Z",
            "id": 10207,
            "count": 1,
            "bytes": 58019,
            "remainingMs": 1997.1474000000162
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.648Z",
            "id": 10207,
            "count": 1,
            "ms": 11.755999999993946
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.653Z",
            "id": 10208,
            "count": 4,
            "bytes": 210466,
            "remainingMs": 1980.655300000013
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1008",
            "at": "2026-11-02T01:45:21.668Z",
            "id": 10208,
            "count": 4,
            "ms": 14.907700000010664
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.676Z",
            "id": 10209,
            "count": 1,
            "bytes": 49694,
            "remainingMs": 2923.543000000005
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.692Z",
            "id": 10209,
            "count": 1,
            "ms": 16.117399999988265
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.700Z",
            "id": 10210,
            "count": 6,
            "bytes": 292095,
            "remainingMs": 2899.677000000025
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.717Z",
            "id": 10210,
            "count": 6,
            "ms": 16.895100000023376
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.740Z",
            "id": 10211,
            "count": 14,
            "bytes": 841975,
            "remainingMs": 2859.414300000004
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.759Z",
            "id": 10211,
            "count": 14,
            "ms": 19.0168999999878
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.768Z",
            "id": 10212,
            "count": 8,
            "bytes": 481549,
            "remainingMs": 2831.6453000000038
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.789Z",
            "id": 10212,
            "count": 8,
            "ms": 20.503999999986263
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.832Z",
            "id": 10213,
            "count": 6,
            "bytes": 325703,
            "remainingMs": 2767.2716000000073
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.847Z",
            "id": 10213,
            "count": 6,
            "ms": 14.569499999983236
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.857Z",
            "id": 10214,
            "count": 6,
            "bytes": 359608,
            "remainingMs": 2743.108200000017
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.870Z",
            "id": 10214,
            "count": 6,
            "ms": 13.709999999991851
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.896Z",
            "id": 10215,
            "count": 3,
            "bytes": 163991,
            "remainingMs": 2704.2195000000065
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.912Z",
            "id": 10215,
            "count": 3,
            "ms": 16.946999999985565
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.921Z",
            "id": 10216,
            "count": 6,
            "bytes": 351761,
            "remainingMs": 2678.2592000000004
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.936Z",
            "id": 10216,
            "count": 6,
            "ms": 14.193499999993946
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.964Z",
            "id": 10217,
            "count": 2,
            "bytes": 109380,
            "remainingMs": 2635.458100000018
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.976Z",
            "id": 10217,
            "count": 2,
            "ms": 11.410700000007637
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.980Z",
            "id": 10218,
            "count": 4,
            "bytes": 230560,
            "remainingMs": 2619.4014000000025
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:21.992Z",
            "id": 10218,
            "count": 4,
            "ms": 12.143899999995483
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.013Z",
            "id": 10219,
            "count": 4,
            "bytes": 224077,
            "remainingMs": 2586.670000000013
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.030Z",
            "id": 10219,
            "count": 4,
            "ms": 16.889300000009825
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.051Z",
            "id": 10220,
            "count": 4,
            "bytes": 221515,
            "remainingMs": 2548.604000000021
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.067Z",
            "id": 10220,
            "count": 4,
            "ms": 15.48420000000624
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.085Z",
            "id": 10221,
            "count": 4,
            "bytes": 214958,
            "remainingMs": 2515.084499999997
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.098Z",
            "id": 10221,
            "count": 4,
            "ms": 13.509699999995064
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.116Z",
            "id": 10222,
            "count": 4,
            "bytes": 220961,
            "remainingMs": 2483.8250000000116
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.128Z",
            "id": 10222,
            "count": 4,
            "ms": 12.294200000003912
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.131Z",
            "id": 10223,
            "count": 2,
            "bytes": 113878,
            "remainingMs": 2468.549700000003
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.146Z",
            "id": 10223,
            "count": 2,
            "ms": 14.788199999980861
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.150Z",
            "id": 10224,
            "count": 4,
            "bytes": 216212,
            "remainingMs": 2449.9842000000062
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.162Z",
            "id": 10224,
            "count": 4,
            "ms": 12.230099999986123
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.169Z",
            "id": 10225,
            "count": 2,
            "bytes": 115106,
            "remainingMs": 2430.8603000000003
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.180Z",
            "id": 10225,
            "count": 2,
            "ms": 10.822199999995064
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.184Z",
            "id": 10226,
            "count": 4,
            "bytes": 206224,
            "remainingMs": 2415.424500000023
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.196Z",
            "id": 10226,
            "count": 4,
            "ms": 11.703100000013364
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.201Z",
            "id": 10227,
            "count": 2,
            "bytes": 105138,
            "remainingMs": 2398.81210000001
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.212Z",
            "id": 10227,
            "count": 2,
            "ms": 10.870499999989988
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.215Z",
            "id": 10228,
            "count": 4,
            "bytes": 202584,
            "remainingMs": 2384.38440000001
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.233Z",
            "id": 10228,
            "count": 4,
            "ms": 17.877700000011828
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.239Z",
            "id": 10229,
            "count": 4,
            "bytes": 214422,
            "remainingMs": 2360.9888999999966
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.254Z",
            "id": 10229,
            "count": 4,
            "ms": 15.226599999994505
          },
          {
            "type": "request",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.260Z",
            "id": 10230,
            "count": 4,
            "bytes": 206352,
            "remainingMs": 2339.733600000007
          },
          {
            "type": "response",
            "label": "p3-11-s1:step-1010",
            "at": "2026-11-02T01:45:22.274Z",
            "id": 10230,
            "count": 4,
            "ms": 13.714299999992363
          }
        ],
        "packMs": 3585.18539999936
      },
      "wallMs": 214018.66210000002,
      "latency": {
        "model": {
          "count": 334,
          "meanMs": 610.4698592814382,
          "p95Ms": 1940.0508000000118,
          "maxMs": 2875.9080999999996
        },
        "opponent": {
          "count": 790,
          "meanMs": 9.747394303797218,
          "p95Ms": 32.77859999999055,
          "maxMs": 586.1693000000014
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p3-11-s1\\p3-11-s1"
    },
    {
      "id": "p3-11-s2",
      "slot": 11,
      "seat": 2,
      "seed": 310011099,
      "opponent": "hard",
      "players": 3,
      "map": "(3) Glu.aem",
      "category": "preset_units",
      "modelPlayer": 2,
      "initialSha256": "6799fffe34ef7a5b0b7d7d3d8af63a190c9881393473bd38313c48b4dd6333d5",
      "firstToActPlayer": 2,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_loss",
      "winner": 2,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 774,
          "ids": [
            2
          ],
          "averagePlace": 3,
          "normalizedRank": 0
        },
        {
          "step": 815,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0.5
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": true,
      "steps": 816,
      "rounds": 22,
      "roots": 108,
      "witnessCount": 10,
      "witnessActions": 252,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 7291,
        "observations": 23935,
        "completed": 7291,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 94510.32150000038,
        "peakBatchSize": 32,
        "bytes": 2003520096,
        "decisionRequests": 7289,
        "decisionObservations": 23902,
        "completedDecisionObservations": 23902,
        "decisionWireMs": 91736.11350000039,
        "decisionPeakBatchSize": 28,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.518Z",
            "id": 7260,
            "count": 6,
            "bytes": 339510,
            "remainingMs": 2861.64479999998
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.532Z",
            "id": 7260,
            "count": 6,
            "ms": 14.502899999992223
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.542Z",
            "id": 7261,
            "count": 6,
            "bytes": 357981,
            "remainingMs": 2837.9481999999844
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.556Z",
            "id": 7261,
            "count": 6,
            "ms": 14.334799999982351
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.567Z",
            "id": 7262,
            "count": 6,
            "bytes": 380700,
            "remainingMs": 2812.770599999989
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.582Z",
            "id": 7262,
            "count": 6,
            "ms": 14.927800000004936
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.598Z",
            "id": 7263,
            "count": 6,
            "bytes": 368117,
            "remainingMs": 2782.001799999998
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.611Z",
            "id": 7263,
            "count": 6,
            "ms": 13.799100000003818
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.623Z",
            "id": 7264,
            "count": 6,
            "bytes": 409002,
            "remainingMs": 2756.680800000002
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.637Z",
            "id": 7264,
            "count": 6,
            "ms": 14.612200000003213
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.657Z",
            "id": 7265,
            "count": 4,
            "bytes": 239584,
            "remainingMs": 2722.166599999997
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.670Z",
            "id": 7265,
            "count": 4,
            "ms": 12.856100000004517
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.675Z",
            "id": 7266,
            "count": 3,
            "bytes": 208406,
            "remainingMs": 2704.268299999996
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.688Z",
            "id": 7266,
            "count": 3,
            "ms": 12.96940000000177
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.698Z",
            "id": 7267,
            "count": 2,
            "bytes": 123642,
            "remainingMs": 2681.675199999998
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.708Z",
            "id": 7267,
            "count": 2,
            "ms": 10.557300000014948
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.713Z",
            "id": 7268,
            "count": 3,
            "bytes": 205453,
            "remainingMs": 2666.273599999986
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.726Z",
            "id": 7268,
            "count": 3,
            "ms": 13.141199999983655
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.736Z",
            "id": 7269,
            "count": 3,
            "bytes": 185503,
            "remainingMs": 2643.4455000000016
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.748Z",
            "id": 7269,
            "count": 3,
            "ms": 11.652400000020862
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.753Z",
            "id": 7270,
            "count": 2,
            "bytes": 135731,
            "remainingMs": 2626.099900000001
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.764Z",
            "id": 7270,
            "count": 2,
            "ms": 10.877500000002328
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.772Z",
            "id": 7271,
            "count": 2,
            "bytes": 123642,
            "remainingMs": 2607.5264000000025
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.785Z",
            "id": 7271,
            "count": 2,
            "ms": 13.351700000028359
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.788Z",
            "id": 7272,
            "count": 2,
            "bytes": 132106,
            "remainingMs": 2591.26939999999
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.799Z",
            "id": 7272,
            "count": 2,
            "ms": 10.255600000004051
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.804Z",
            "id": 7273,
            "count": 2,
            "bytes": 121119,
            "remainingMs": 2575.039699999994
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-753",
            "at": "2026-11-02T01:47:58.816Z",
            "id": 7273,
            "count": 2,
            "ms": 11.185200000007171
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:58.822Z",
            "id": 7274,
            "count": 1,
            "bytes": 54869,
            "remainingMs": 2924.0181999999913
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:58.834Z",
            "id": 7274,
            "count": 1,
            "ms": 11.440899999986868
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:58.839Z",
            "id": 7275,
            "count": 4,
            "bytes": 229795,
            "remainingMs": 2907.7448999999906
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:58.850Z",
            "id": 7275,
            "count": 4,
            "ms": 11.495999999984633
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:58.860Z",
            "id": 7276,
            "count": 8,
            "bytes": 455430,
            "remainingMs": 2886.4254000000074
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:58.875Z",
            "id": 7276,
            "count": 8,
            "ms": 14.684900000022026
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:58.879Z",
            "id": 7277,
            "count": 4,
            "bytes": 227794,
            "remainingMs": 2867.8715000000084
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:58.891Z",
            "id": 7277,
            "count": 4,
            "ms": 11.980300000024727
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:58.896Z",
            "id": 7278,
            "count": 4,
            "bytes": 240462,
            "remainingMs": 2850.1033999999927
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:58.908Z",
            "id": 7278,
            "count": 4,
            "ms": 11.2329000000027
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:58.915Z",
            "id": 7279,
            "count": 4,
            "bytes": 276104,
            "remainingMs": 2831.0541000000085
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:58.927Z",
            "id": 7279,
            "count": 4,
            "ms": 11.68540000001667
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:58.942Z",
            "id": 7280,
            "count": 4,
            "bytes": 247126,
            "remainingMs": 2804.2309999999998
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:58.953Z",
            "id": 7280,
            "count": 4,
            "ms": 11.315600000001723
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:58.960Z",
            "id": 7281,
            "count": 4,
            "bytes": 274567,
            "remainingMs": 2786.568800000008
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:58.972Z",
            "id": 7281,
            "count": 4,
            "ms": 11.932900000014342
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:58.988Z",
            "id": 7282,
            "count": 4,
            "bytes": 273927,
            "remainingMs": 2758.5387000000046
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:58.999Z",
            "id": 7282,
            "count": 4,
            "ms": 11.284000000014203
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:59.011Z",
            "id": 7283,
            "count": 2,
            "bytes": 123642,
            "remainingMs": 2735.619399999996
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:59.021Z",
            "id": 7283,
            "count": 2,
            "ms": 10.419699999998556
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:59.027Z",
            "id": 7284,
            "count": 4,
            "bytes": 266293,
            "remainingMs": 2719.112200000003
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:59.039Z",
            "id": 7284,
            "count": 4,
            "ms": 11.447100000019418
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:59.052Z",
            "id": 7285,
            "count": 4,
            "bytes": 242116,
            "remainingMs": 2694.6570000000065
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:59.064Z",
            "id": 7285,
            "count": 4,
            "ms": 12.149700000009034
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:59.070Z",
            "id": 7286,
            "count": 4,
            "bytes": 256314,
            "remainingMs": 2676.8341000000073
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:59.083Z",
            "id": 7286,
            "count": 4,
            "ms": 13.224500000011176
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:59.095Z",
            "id": 7287,
            "count": 3,
            "bytes": 175474,
            "remainingMs": 2651.7115999999805
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:59.105Z",
            "id": 7287,
            "count": 3,
            "ms": 10.693099999974947
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:59.108Z",
            "id": 7288,
            "count": 2,
            "bytes": 128801,
            "remainingMs": 2637.9964000000036
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:59.119Z",
            "id": 7288,
            "count": 2,
            "ms": 10.807600000000093
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:59.126Z",
            "id": 7289,
            "count": 2,
            "bytes": 118623,
            "remainingMs": 2620.5338000000047
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:59.136Z",
            "id": 7289,
            "count": 2,
            "ms": 10.220600000000559
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:59.138Z",
            "id": 7290,
            "count": 1,
            "bytes": 63728,
            "remainingMs": 2608.7814999999828
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:59.149Z",
            "id": 7290,
            "count": 1,
            "ms": 10.888299999991432
          },
          {
            "type": "request",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:59.152Z",
            "id": 7291,
            "count": 1,
            "bytes": 59388,
            "remainingMs": 2594.7774999999965
          },
          {
            "type": "response",
            "label": "p3-11-s2:step-755",
            "at": "2026-11-02T01:47:59.161Z",
            "id": 7291,
            "count": 1,
            "ms": 9.574499999987893
          }
        ],
        "packMs": 2505.5513999988707
      },
      "wallMs": 151172.69929999998,
      "latency": {
        "model": {
          "count": 208,
          "meanMs": 695.5212875000004,
          "p95Ms": 2210.6304999999993,
          "maxMs": 2833.3223999999973
        },
        "opponent": {
          "count": 608,
          "meanMs": 7.810453453947605,
          "p95Ms": 31.454100000002654,
          "maxMs": 187.66590000000724
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p3-11-s2\\p3-11-s2"
    },
    {
      "id": "p3-12-s0",
      "slot": 12,
      "seat": 0,
      "seed": 310012108,
      "opponent": "hard",
      "players": 3,
      "map": "(3) Frozen fields.aem",
      "category": "advantage_endgame",
      "modelPlayer": 0,
      "initialSha256": "aabdd1d01448186ef4e6ed17c8d1d47acd9e088a3f3e26166cec6f8891eee57d",
      "firstToActPlayer": 2,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_win",
      "winner": 1,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 1379,
          "ids": [
            2
          ],
          "averagePlace": 3,
          "normalizedRank": 0
        },
        {
          "step": 1570,
          "ids": [
            1
          ],
          "averagePlace": 2,
          "normalizedRank": 0.5
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 1571,
      "rounds": 33,
      "roots": 484,
      "witnessCount": 72,
      "witnessActions": 1375,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 28047,
        "observations": 90537,
        "completed": 28047,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 336385.372199998,
        "peakBatchSize": 32,
        "bytes": 6980046593,
        "decisionRequests": 28045,
        "decisionObservations": 90504,
        "completedDecisionObservations": 90504,
        "decisionWireMs": 333783.992699998,
        "decisionPeakBatchSize": 22,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p3-12-s0:step-1567",
            "at": "2026-11-01T17:55:11.849Z",
            "id": 28016,
            "count": 1,
            "bytes": 91548,
            "remainingMs": 2451.056600000011
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1567",
            "at": "2026-11-01T17:55:11.858Z",
            "id": 28016,
            "count": 1,
            "ms": 9.842000000004191
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:11.867Z",
            "id": 28017,
            "count": 1,
            "bytes": 90764,
            "remainingMs": 2923.2219999998924
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:11.878Z",
            "id": 28017,
            "count": 1,
            "ms": 10.480199999990873
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:11.881Z",
            "id": 28018,
            "count": 1,
            "bytes": 81086,
            "remainingMs": 2909.3634999999194
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:11.891Z",
            "id": 28018,
            "count": 1,
            "ms": 9.590800000005402
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:11.900Z",
            "id": 28019,
            "count": 4,
            "bytes": 359824,
            "remainingMs": 2890.870099999942
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:11.913Z",
            "id": 28019,
            "count": 4,
            "ms": 12.879500000039116
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:11.919Z",
            "id": 28020,
            "count": 3,
            "bytes": 270084,
            "remainingMs": 2872.1777999998885
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:11.932Z",
            "id": 28020,
            "count": 3,
            "ms": 13.646599999978207
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:11.940Z",
            "id": 28021,
            "count": 3,
            "bytes": 267812,
            "remainingMs": 2850.6078999998863
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:11.954Z",
            "id": 28021,
            "count": 3,
            "ms": 14.386699999973644
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:11.962Z",
            "id": 28022,
            "count": 3,
            "bytes": 266307,
            "remainingMs": 2828.9416999999085
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:11.973Z",
            "id": 28022,
            "count": 3,
            "ms": 11.04839999997057
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:11.980Z",
            "id": 28023,
            "count": 3,
            "bytes": 265698,
            "remainingMs": 2810.7287999999244
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:11.995Z",
            "id": 28023,
            "count": 3,
            "ms": 14.609800000034738
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.002Z",
            "id": 28024,
            "count": 3,
            "bytes": 265057,
            "remainingMs": 2789.034599999897
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.012Z",
            "id": 28024,
            "count": 3,
            "ms": 10.674999999988358
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.019Z",
            "id": 28025,
            "count": 3,
            "bytes": 264417,
            "remainingMs": 2771.7283999999054
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.030Z",
            "id": 28025,
            "count": 3,
            "ms": 11.268199999991339
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.037Z",
            "id": 28026,
            "count": 3,
            "bytes": 263649,
            "remainingMs": 2753.5236999999033
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.051Z",
            "id": 28026,
            "count": 3,
            "ms": 13.358599999977741
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.058Z",
            "id": 28027,
            "count": 3,
            "bytes": 262561,
            "remainingMs": 2733.090499999933
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.071Z",
            "id": 28027,
            "count": 3,
            "ms": 13.190600000030827
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.077Z",
            "id": 28028,
            "count": 3,
            "bytes": 261249,
            "remainingMs": 2713.3496999999043
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.089Z",
            "id": 28028,
            "count": 3,
            "ms": 11.15700000000652
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.094Z",
            "id": 28029,
            "count": 3,
            "bytes": 259905,
            "remainingMs": 2696.347599999921
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.107Z",
            "id": 28029,
            "count": 3,
            "ms": 12.918500000028871
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.114Z",
            "id": 28030,
            "count": 3,
            "bytes": 258433,
            "remainingMs": 2676.816799999913
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.127Z",
            "id": 28030,
            "count": 3,
            "ms": 13.381600000022445
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.133Z",
            "id": 28031,
            "count": 3,
            "bytes": 256649,
            "remainingMs": 2657.4498999998905
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.145Z",
            "id": 28031,
            "count": 3,
            "ms": 11.597899999993388
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.147Z",
            "id": 28032,
            "count": 1,
            "bytes": 81095,
            "remainingMs": 2643.292499999923
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.158Z",
            "id": 28032,
            "count": 1,
            "ms": 10.492900000012014
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.163Z",
            "id": 28033,
            "count": 3,
            "bytes": 255945,
            "remainingMs": 2627.7675999999046
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.175Z",
            "id": 28033,
            "count": 3,
            "ms": 11.653400000010151
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.180Z",
            "id": 28034,
            "count": 3,
            "bytes": 254215,
            "remainingMs": 2610.4428999999072
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.195Z",
            "id": 28034,
            "count": 3,
            "ms": 14.444399999978486
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.200Z",
            "id": 28035,
            "count": 3,
            "bytes": 252288,
            "remainingMs": 2590.5968999998877
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.214Z",
            "id": 28035,
            "count": 3,
            "ms": 14.044399999955203
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.219Z",
            "id": 28036,
            "count": 3,
            "bytes": 250877,
            "remainingMs": 2571.4722999999067
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.233Z",
            "id": 28036,
            "count": 3,
            "ms": 13.532300000020768
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.238Z",
            "id": 28037,
            "count": 3,
            "bytes": 250013,
            "remainingMs": 2552.510299999907
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.249Z",
            "id": 28037,
            "count": 3,
            "ms": 10.871400000003632
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.254Z",
            "id": 28038,
            "count": 3,
            "bytes": 249053,
            "remainingMs": 2536.8230999999214
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.265Z",
            "id": 28038,
            "count": 3,
            "ms": 10.870899999979883
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.270Z",
            "id": 28039,
            "count": 3,
            "bytes": 247772,
            "remainingMs": 2520.70909999992
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.283Z",
            "id": 28039,
            "count": 3,
            "ms": 13.147700000030454
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.287Z",
            "id": 28040,
            "count": 3,
            "bytes": 246938,
            "remainingMs": 2503.2626999999047
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.299Z",
            "id": 28040,
            "count": 3,
            "ms": 11.820399999967776
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.301Z",
            "id": 28041,
            "count": 1,
            "bytes": 81152,
            "remainingMs": 2489.5137999998988
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.311Z",
            "id": 28041,
            "count": 1,
            "ms": 10.043699999980163
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.315Z",
            "id": 28042,
            "count": 3,
            "bytes": 246337,
            "remainingMs": 2475.7555999999167
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.326Z",
            "id": 28042,
            "count": 3,
            "ms": 10.935100000002421
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.328Z",
            "id": 28043,
            "count": 1,
            "bytes": 81120,
            "remainingMs": 2462.768599999894
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.337Z",
            "id": 28043,
            "count": 1,
            "ms": 9.319900000002235
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.341Z",
            "id": 28044,
            "count": 3,
            "bytes": 245448,
            "remainingMs": 2449.598199999891
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.353Z",
            "id": 28044,
            "count": 3,
            "ms": 11.712999999988824
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.357Z",
            "id": 28045,
            "count": 3,
            "bytes": 244744,
            "remainingMs": 2433.5224999999045
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.369Z",
            "id": 28045,
            "count": 3,
            "ms": 11.446699999971315
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.371Z",
            "id": 28046,
            "count": 1,
            "bytes": 81485,
            "remainingMs": 2419.6478999999235
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.381Z",
            "id": 28046,
            "count": 1,
            "ms": 9.971100000024308
          },
          {
            "type": "request",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.388Z",
            "id": 28047,
            "count": 3,
            "bytes": 274020,
            "remainingMs": 2402.5509999999194
          },
          {
            "type": "response",
            "label": "p3-12-s0:step-1569",
            "at": "2026-11-01T17:55:12.399Z",
            "id": 28047,
            "count": 3,
            "ms": 11.205799999996088
          }
        ],
        "packMs": 8927.838899997467
      },
      "wallMs": 518960.2676,
      "latency": {
        "model": {
          "count": 956,
          "meanMs": 534.5831601464444,
          "p95Ms": 1584.959200000012,
          "maxMs": 2161.396300000022
        },
        "opponent": {
          "count": 615,
          "meanMs": 6.7611619512192505,
          "p95Ms": 24.741299999994226,
          "maxMs": 156.75439999997616
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p3-12-s0\\p3-12-s0"
    },
    {
      "id": "p3-12-s1",
      "slot": 12,
      "seat": 1,
      "seed": 310012108,
      "opponent": "hard",
      "players": 3,
      "map": "(3) Frozen fields.aem",
      "category": "advantage_endgame",
      "modelPlayer": 1,
      "initialSha256": "aabdd1d01448186ef4e6ed17c8d1d47acd9e088a3f3e26166cec6f8891eee57d",
      "firstToActPlayer": 2,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_win",
      "winner": 2,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 1527,
          "ids": [
            2
          ],
          "averagePlace": 3,
          "normalizedRank": 0
        },
        {
          "step": 1706,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0.5
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 1707,
      "rounds": 34,
      "roots": 423,
      "witnessCount": 80,
      "witnessActions": 1264,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 25168,
        "observations": 81580,
        "completed": 25168,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 301804.55710000044,
        "peakBatchSize": 32,
        "bytes": 6695973827,
        "decisionRequests": 25166,
        "decisionObservations": 81547,
        "completedDecisionObservations": 81547,
        "decisionWireMs": 299278.3678000004,
        "decisionPeakBatchSize": 24,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p3-12-s1:step-1703",
            "at": "2026-11-01T18:03:09.843Z",
            "id": 25137,
            "count": 4,
            "bytes": 339004,
            "remainingMs": 2478.492900000012
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1703",
            "at": "2026-11-01T18:03:09.855Z",
            "id": 25137,
            "count": 4,
            "ms": 11.56339999998454
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:09.865Z",
            "id": 25138,
            "count": 1,
            "bytes": 95613,
            "remainingMs": 2923.17220000003
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:09.875Z",
            "id": 25138,
            "count": 1,
            "ms": 9.800300000002608
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:09.879Z",
            "id": 25139,
            "count": 1,
            "bytes": 84871,
            "remainingMs": 2909.247000000032
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:09.888Z",
            "id": 25139,
            "count": 1,
            "ms": 9.448600000003353
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:09.898Z",
            "id": 25140,
            "count": 4,
            "bytes": 379604,
            "remainingMs": 2890.1947999999975
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:09.911Z",
            "id": 25140,
            "count": 4,
            "ms": 13.43899999995483
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:09.916Z",
            "id": 25141,
            "count": 3,
            "bytes": 284631,
            "remainingMs": 2871.794900000037
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:09.927Z",
            "id": 25141,
            "count": 3,
            "ms": 11.04639999999199
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:09.936Z",
            "id": 25142,
            "count": 3,
            "bytes": 283383,
            "remainingMs": 2852.4433000000427
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:09.948Z",
            "id": 25142,
            "count": 3,
            "ms": 12.251100000052247
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:09.956Z",
            "id": 25143,
            "count": 3,
            "bytes": 280855,
            "remainingMs": 2832.090200000035
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:09.967Z",
            "id": 25143,
            "count": 3,
            "ms": 11.218900000036228
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:09.974Z",
            "id": 25144,
            "count": 3,
            "bytes": 279383,
            "remainingMs": 2813.616700000013
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:09.986Z",
            "id": 25144,
            "count": 3,
            "ms": 11.61119999998482
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:09.993Z",
            "id": 25145,
            "count": 3,
            "bytes": 278262,
            "remainingMs": 2794.91810000001
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.005Z",
            "id": 25145,
            "count": 3,
            "ms": 12.121299999998882
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.012Z",
            "id": 25146,
            "count": 3,
            "bytes": 276724,
            "remainingMs": 2775.6993000000366
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.024Z",
            "id": 25146,
            "count": 3,
            "ms": 11.43680000002496
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.031Z",
            "id": 25147,
            "count": 3,
            "bytes": 276052,
            "remainingMs": 2757.3591000000015
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.042Z",
            "id": 25147,
            "count": 3,
            "ms": 11.807800000009593
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.049Z",
            "id": 25148,
            "count": 3,
            "bytes": 275476,
            "remainingMs": 2739.030300000042
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.061Z",
            "id": 25148,
            "count": 3,
            "ms": 12.332500000018626
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.068Z",
            "id": 25149,
            "count": 3,
            "bytes": 274772,
            "remainingMs": 2719.8658000000287
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.080Z",
            "id": 25149,
            "count": 3,
            "ms": 11.42139999999199
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.086Z",
            "id": 25150,
            "count": 3,
            "bytes": 273460,
            "remainingMs": 2701.9856000000145
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.099Z",
            "id": 25150,
            "count": 3,
            "ms": 12.769299999985378
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.101Z",
            "id": 25151,
            "count": 1,
            "bytes": 84880,
            "remainingMs": 2686.8733000000357
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.111Z",
            "id": 25151,
            "count": 1,
            "ms": 9.589500000001863
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.116Z",
            "id": 25152,
            "count": 3,
            "bytes": 271796,
            "remainingMs": 2672.1450000000186
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.127Z",
            "id": 25152,
            "count": 3,
            "ms": 11.042699999990873
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.130Z",
            "id": 25153,
            "count": 2,
            "bytes": 169633,
            "remainingMs": 2657.5407000000123
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.142Z",
            "id": 25153,
            "count": 2,
            "ms": 11.211899999994785
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.147Z",
            "id": 25154,
            "count": 3,
            "bytes": 270132,
            "remainingMs": 2641.2210000000196
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.159Z",
            "id": 25154,
            "count": 3,
            "ms": 11.79649999999674
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.165Z",
            "id": 25155,
            "count": 3,
            "bytes": 268212,
            "remainingMs": 2623.258700000006
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.176Z",
            "id": 25155,
            "count": 3,
            "ms": 11.117800000007264
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.181Z",
            "id": 25156,
            "count": 3,
            "bytes": 266868,
            "remainingMs": 2606.9979000000167
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.194Z",
            "id": 25156,
            "count": 3,
            "ms": 13.285299999988638
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.199Z",
            "id": 25157,
            "count": 3,
            "bytes": 265618,
            "remainingMs": 2588.644200000039
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.211Z",
            "id": 25157,
            "count": 3,
            "ms": 11.196800000034273
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.216Z",
            "id": 25158,
            "count": 3,
            "bytes": 264366,
            "remainingMs": 2572.123100000026
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.228Z",
            "id": 25158,
            "count": 3,
            "ms": 12.115600000019185
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.233Z",
            "id": 25159,
            "count": 3,
            "bytes": 262376,
            "remainingMs": 2555.232100000023
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.244Z",
            "id": 25159,
            "count": 3,
            "ms": 11.466599999985192
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.249Z",
            "id": 25160,
            "count": 3,
            "bytes": 261544,
            "remainingMs": 2539.0077000000165
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.262Z",
            "id": 25160,
            "count": 3,
            "ms": 12.812900000018999
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.267Z",
            "id": 25161,
            "count": 3,
            "bytes": 259816,
            "remainingMs": 2521.044500000018
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.278Z",
            "id": 25161,
            "count": 3,
            "ms": 11.321200000005774
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.283Z",
            "id": 25162,
            "count": 3,
            "bytes": 258597,
            "remainingMs": 2505.2733000000007
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.294Z",
            "id": 25162,
            "count": 3,
            "ms": 11.127700000011828
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.299Z",
            "id": 25163,
            "count": 3,
            "bytes": 257893,
            "remainingMs": 2489.1723000000347
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.310Z",
            "id": 25163,
            "count": 3,
            "ms": 11.131300000008196
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.314Z",
            "id": 25164,
            "count": 3,
            "bytes": 257029,
            "remainingMs": 2473.824800000002
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.325Z",
            "id": 25164,
            "count": 3,
            "ms": 10.540799999958836
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.329Z",
            "id": 25165,
            "count": 3,
            "bytes": 256450,
            "remainingMs": 2458.689100000018
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.340Z",
            "id": 25165,
            "count": 3,
            "ms": 10.71630000002915
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.344Z",
            "id": 25166,
            "count": 3,
            "bytes": 255778,
            "remainingMs": 2443.643299999996
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.356Z",
            "id": 25166,
            "count": 3,
            "ms": 11.665799999958836
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.360Z",
            "id": 25167,
            "count": 3,
            "bytes": 255199,
            "remainingMs": 2428.202500000014
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.370Z",
            "id": 25167,
            "count": 3,
            "ms": 10.31449999997858
          },
          {
            "type": "request",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.379Z",
            "id": 25168,
            "count": 3,
            "bytes": 286359,
            "remainingMs": 2409.260799999989
          },
          {
            "type": "response",
            "label": "p3-12-s1:step-1705",
            "at": "2026-11-01T18:03:10.390Z",
            "id": 25168,
            "count": 3,
            "ms": 11.57989999995334
          }
        ],
        "packMs": 8450.296899997486
      },
      "wallMs": 474518.8063,
      "latency": {
        "model": {
          "count": 815,
          "meanMs": 571.6170026993868,
          "p95Ms": 1696.9683999999834,
          "maxMs": 1960.539300000004
        },
        "opponent": {
          "count": 892,
          "meanMs": 5.358621412555582,
          "p95Ms": 16.515299999999115,
          "maxMs": 259.91589999999997
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p3-12-s1\\p3-12-s1"
    },
    {
      "id": "p3-12-s2",
      "slot": 12,
      "seat": 2,
      "seed": 310012108,
      "opponent": "hard",
      "players": 3,
      "map": "(3) Frozen fields.aem",
      "category": "advantage_endgame",
      "modelPlayer": 2,
      "initialSha256": "aabdd1d01448186ef4e6ed17c8d1d47acd9e088a3f3e26166cec6f8891eee57d",
      "firstToActPlayer": 2,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_win",
      "winner": 3,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 1103,
          "ids": [
            1
          ],
          "averagePlace": 3,
          "normalizedRank": 0
        },
        {
          "step": 1267,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0.5
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 1268,
      "rounds": 27,
      "roots": 379,
      "witnessCount": 60,
      "witnessActions": 1011,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 21366,
        "observations": 68087,
        "completed": 21366,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 252413.42069999743,
        "peakBatchSize": 32,
        "bytes": 5038560187,
        "decisionRequests": 21364,
        "decisionObservations": 68054,
        "completedDecisionObservations": 68054,
        "decisionWireMs": 249734.5023999974,
        "decisionPeakBatchSize": 20,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p3-12-s2:step-1264",
            "at": "2026-11-01T18:09:39.276Z",
            "id": 21335,
            "count": 1,
            "bytes": 74423,
            "remainingMs": 2580.556099999987
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1264",
            "at": "2026-11-01T18:09:39.285Z",
            "id": 21335,
            "count": 1,
            "ms": 9.263899999961723
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1264",
            "at": "2026-11-01T18:09:39.288Z",
            "id": 21336,
            "count": 1,
            "bytes": 73782,
            "remainingMs": 2568.504499999981
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1264",
            "at": "2026-11-01T18:09:39.300Z",
            "id": 21336,
            "count": 1,
            "ms": 11.90639999997802
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1264",
            "at": "2026-11-01T18:09:39.303Z",
            "id": 21337,
            "count": 1,
            "bytes": 72708,
            "remainingMs": 2553.8347000000067
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1264",
            "at": "2026-11-01T18:09:39.312Z",
            "id": 21337,
            "count": 1,
            "ms": 9.48489999998128
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1264",
            "at": "2026-11-01T18:09:39.314Z",
            "id": 21338,
            "count": 1,
            "bytes": 72580,
            "remainingMs": 2542.404099999985
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1264",
            "at": "2026-11-01T18:09:39.323Z",
            "id": 21338,
            "count": 1,
            "ms": 9.036800000001676
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1264",
            "at": "2026-11-01T18:09:39.325Z",
            "id": 21339,
            "count": 1,
            "bytes": 71795,
            "remainingMs": 2531.3156999999774
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1264",
            "at": "2026-11-01T18:09:39.336Z",
            "id": 21339,
            "count": 1,
            "ms": 10.990200000000186
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1264",
            "at": "2026-11-01T18:09:39.338Z",
            "id": 21340,
            "count": 1,
            "bytes": 71667,
            "remainingMs": 2518.949399999983
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1264",
            "at": "2026-11-01T18:09:39.348Z",
            "id": 21340,
            "count": 1,
            "ms": 10.528400000010151
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1264",
            "at": "2026-11-01T18:09:39.351Z",
            "id": 21341,
            "count": 1,
            "bytes": 81241,
            "remainingMs": 2505.469700000016
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1264",
            "at": "2026-11-01T18:09:39.362Z",
            "id": 21341,
            "count": 1,
            "ms": 10.682700000004843
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.370Z",
            "id": 21342,
            "count": 1,
            "bytes": 81465,
            "remainingMs": 2923.222599999979
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.381Z",
            "id": 21342,
            "count": 1,
            "ms": 10.713499999954365
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.384Z",
            "id": 21343,
            "count": 1,
            "bytes": 70499,
            "remainingMs": 2909.2707999999984
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.394Z",
            "id": 21343,
            "count": 1,
            "ms": 9.78139999997802
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.402Z",
            "id": 21344,
            "count": 4,
            "bytes": 321892,
            "remainingMs": 2891.0109999999986
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.417Z",
            "id": 21344,
            "count": 4,
            "ms": 14.238599999982398
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.422Z",
            "id": 21345,
            "count": 3,
            "bytes": 241291,
            "remainingMs": 2871.282999999996
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.433Z",
            "id": 21345,
            "count": 3,
            "ms": 10.801900000020396
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.440Z",
            "id": 21346,
            "count": 3,
            "bytes": 239243,
            "remainingMs": 2853.1327000000165
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.451Z",
            "id": 21346,
            "count": 3,
            "ms": 10.753100000030827
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.456Z",
            "id": 21347,
            "count": 3,
            "bytes": 211202,
            "remainingMs": 2837.9492999999784
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.468Z",
            "id": 21347,
            "count": 3,
            "ms": 12.599300000001676
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.474Z",
            "id": 21348,
            "count": 3,
            "bytes": 239195,
            "remainingMs": 2819.6011999999755
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.485Z",
            "id": 21348,
            "count": 3,
            "ms": 10.795599999953993
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.493Z",
            "id": 21349,
            "count": 3,
            "bytes": 237915,
            "remainingMs": 2800.9102999999886
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.504Z",
            "id": 21349,
            "count": 3,
            "ms": 11.284500000008848
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.512Z",
            "id": 21350,
            "count": 3,
            "bytes": 236763,
            "remainingMs": 2781.6511000000173
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.524Z",
            "id": 21350,
            "count": 3,
            "ms": 12.290800000017043
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.532Z",
            "id": 21351,
            "count": 3,
            "bytes": 235642,
            "remainingMs": 2761.450899999996
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.543Z",
            "id": 21351,
            "count": 3,
            "ms": 11.269900000013877
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.551Z",
            "id": 21352,
            "count": 3,
            "bytes": 234585,
            "remainingMs": 2742.1450000000186
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.562Z",
            "id": 21352,
            "count": 3,
            "ms": 10.74720000004163
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.570Z",
            "id": 21353,
            "count": 3,
            "bytes": 233271,
            "remainingMs": 2723.6892000000225
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.581Z",
            "id": 21353,
            "count": 3,
            "ms": 11.134200000029523
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.589Z",
            "id": 21354,
            "count": 3,
            "bytes": 232119,
            "remainingMs": 2704.9306000000215
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.600Z",
            "id": 21354,
            "count": 3,
            "ms": 11.056299999996554
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.608Z",
            "id": 21355,
            "count": 3,
            "bytes": 229815,
            "remainingMs": 2685.2486999999965
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.621Z",
            "id": 21355,
            "count": 3,
            "ms": 12.778799999970943
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.629Z",
            "id": 21356,
            "count": 3,
            "bytes": 228471,
            "remainingMs": 2664.2700000000186
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.640Z",
            "id": 21356,
            "count": 3,
            "ms": 10.888600000005681
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.648Z",
            "id": 21357,
            "count": 3,
            "bytes": 227959,
            "remainingMs": 2645.6145999999717
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.659Z",
            "id": 21357,
            "count": 3,
            "ms": 11.361399999994319
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.667Z",
            "id": 21358,
            "count": 3,
            "bytes": 225943,
            "remainingMs": 2626.5682999999844
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.678Z",
            "id": 21358,
            "count": 3,
            "ms": 11.0454000000027
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.686Z",
            "id": 21359,
            "count": 3,
            "bytes": 223668,
            "remainingMs": 2607.8425999999745
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.697Z",
            "id": 21359,
            "count": 3,
            "ms": 11.150199999974575
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.705Z",
            "id": 21360,
            "count": 3,
            "bytes": 222274,
            "remainingMs": 2588.7898000000278
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.715Z",
            "id": 21360,
            "count": 3,
            "ms": 10.628400000045076
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.723Z",
            "id": 21361,
            "count": 3,
            "bytes": 219485,
            "remainingMs": 2570.017899999977
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.735Z",
            "id": 21361,
            "count": 3,
            "ms": 11.552399999985937
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.741Z",
            "id": 21362,
            "count": 3,
            "bytes": 217899,
            "remainingMs": 2552.098500000022
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.752Z",
            "id": 21362,
            "count": 3,
            "ms": 10.6370000000461
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.757Z",
            "id": 21363,
            "count": 3,
            "bytes": 214343,
            "remainingMs": 2536.010899999994
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.768Z",
            "id": 21363,
            "count": 3,
            "ms": 10.78259999997681
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.773Z",
            "id": 21364,
            "count": 3,
            "bytes": 213863,
            "remainingMs": 2520.216599999985
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.784Z",
            "id": 21364,
            "count": 3,
            "ms": 11.028499999956694
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.789Z",
            "id": 21365,
            "count": 3,
            "bytes": 211496,
            "remainingMs": 2504.177399999986
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.800Z",
            "id": 21365,
            "count": 3,
            "ms": 11.168899999989662
          },
          {
            "type": "request",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.808Z",
            "id": 21366,
            "count": 3,
            "bytes": 243083,
            "remainingMs": 2485.589099999983
          },
          {
            "type": "response",
            "label": "p3-12-s2:step-1266",
            "at": "2026-11-01T18:09:39.819Z",
            "id": 21366,
            "count": 3,
            "ms": 11.200599999981932
          }
        ],
        "packMs": 6499.891500001623
      },
      "wallMs": 385815.3844,
      "latency": {
        "model": {
          "count": 747,
          "meanMs": 506.59283279785853,
          "p95Ms": 1588.5132000000012,
          "maxMs": 2072.7405
        },
        "opponent": {
          "count": 521,
          "meanMs": 8.532888483684772,
          "p95Ms": 31.560699999998178,
          "maxMs": 383.5353000000032
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p3-12-s2\\p3-12-s2"
    },
    {
      "id": "p3-13-s0",
      "slot": 13,
      "seat": 0,
      "seed": 310013117,
      "opponent": "hard",
      "players": 3,
      "map": "(3) Midway.aem",
      "category": "preset_units",
      "modelPlayer": 0,
      "initialSha256": "ec68c4f760b9a06afc0f8e347eedd2caaf793ee0f94e87e1892232019c6719f9",
      "firstToActPlayer": 2,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_win",
      "winner": 1,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 1858,
          "ids": [
            2
          ],
          "averagePlace": 3,
          "normalizedRank": 0
        },
        {
          "step": 2097,
          "ids": [
            1
          ],
          "averagePlace": 2,
          "normalizedRank": 0.5
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 2098,
      "rounds": 26,
      "roots": 551,
      "witnessCount": 89,
      "witnessActions": 1614,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 41626,
        "observations": 129745,
        "completed": 41626,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 573380.860299998,
        "peakBatchSize": 34,
        "bytes": 24539037382,
        "decisionRequests": 41624,
        "decisionObservations": 129712,
        "completedDecisionObservations": 129712,
        "decisionWireMs": 569565.910199998,
        "decisionPeakBatchSize": 34,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.592Z",
            "id": 41595,
            "count": 3,
            "bytes": 377981,
            "remainingMs": 2613.4259999999776
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.605Z",
            "id": 41595,
            "count": 3,
            "ms": 12.57620000001043
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.633Z",
            "id": 41596,
            "count": 3,
            "bytes": 376317,
            "remainingMs": 2572.4754999999423
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.646Z",
            "id": 41596,
            "count": 3,
            "ms": 12.829599999822676
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.674Z",
            "id": 41597,
            "count": 3,
            "bytes": 372541,
            "remainingMs": 2531.719500000123
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.687Z",
            "id": 41597,
            "count": 3,
            "ms": 13.005300000077114
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.714Z",
            "id": 41598,
            "count": 3,
            "bytes": 370653,
            "remainingMs": 2491.2434000000358
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.728Z",
            "id": 41598,
            "count": 3,
            "ms": 13.24750000005588
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.755Z",
            "id": 41599,
            "count": 3,
            "bytes": 367293,
            "remainingMs": 2450.907000000123
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.773Z",
            "id": 41599,
            "count": 3,
            "ms": 18.636100000003353
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.800Z",
            "id": 41600,
            "count": 3,
            "bytes": 365501,
            "remainingMs": 2405.398999999976
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.813Z",
            "id": 41600,
            "count": 3,
            "ms": 12.497699999948964
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.839Z",
            "id": 41601,
            "count": 3,
            "bytes": 364445,
            "remainingMs": 2366.6193000001367
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.851Z",
            "id": 41601,
            "count": 3,
            "ms": 12.014600000111386
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.877Z",
            "id": 41602,
            "count": 3,
            "bytes": 363101,
            "remainingMs": 2328.600700000068
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.890Z",
            "id": 41602,
            "count": 3,
            "ms": 12.776800000108778
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.918Z",
            "id": 41603,
            "count": 3,
            "bytes": 362620,
            "remainingMs": 2287.5464000001084
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.930Z",
            "id": 41603,
            "count": 3,
            "ms": 11.967300000134856
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.956Z",
            "id": 41604,
            "count": 3,
            "bytes": 361691,
            "remainingMs": 2249.6380000000354
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.968Z",
            "id": 41604,
            "count": 3,
            "ms": 11.737999999895692
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:38.994Z",
            "id": 41605,
            "count": 3,
            "bytes": 360771,
            "remainingMs": 2211.994699999923
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.009Z",
            "id": 41605,
            "count": 3,
            "ms": 15.426399999996647
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.035Z",
            "id": 41606,
            "count": 3,
            "bytes": 359402,
            "remainingMs": 2170.910200000042
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.046Z",
            "id": 41606,
            "count": 3,
            "ms": 11.825299999909475
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.071Z",
            "id": 41607,
            "count": 3,
            "bytes": 358345,
            "remainingMs": 2134.129699999932
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.085Z",
            "id": 41607,
            "count": 3,
            "ms": 13.979300000006333
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.111Z",
            "id": 41608,
            "count": 3,
            "bytes": 357288,
            "remainingMs": 2095.03050000011
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.126Z",
            "id": 41608,
            "count": 3,
            "ms": 15.864599999971688
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.152Z",
            "id": 41609,
            "count": 3,
            "bytes": 356166,
            "remainingMs": 2053.463100000052
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.170Z",
            "id": 41609,
            "count": 3,
            "ms": 17.926200000103563
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.195Z",
            "id": 41610,
            "count": 3,
            "bytes": 355110,
            "remainingMs": 2010.2687999999616
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.208Z",
            "id": 41610,
            "count": 3,
            "ms": 12.253099999856204
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.233Z",
            "id": 41611,
            "count": 3,
            "bytes": 353508,
            "remainingMs": 1972.2309000000823
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.246Z",
            "id": 41611,
            "count": 3,
            "ms": 13.113300000084564
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.271Z",
            "id": 41612,
            "count": 3,
            "bytes": 351972,
            "remainingMs": 1934.2450999999419
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.283Z",
            "id": 41612,
            "count": 3,
            "ms": 11.937799999956042
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.308Z",
            "id": 41613,
            "count": 3,
            "bytes": 350756,
            "remainingMs": 1897.9769000001252
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.321Z",
            "id": 41613,
            "count": 3,
            "ms": 13.59030000003986
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.345Z",
            "id": 41614,
            "count": 3,
            "bytes": 349732,
            "remainingMs": 1860.096200000029
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.360Z",
            "id": 41614,
            "count": 3,
            "ms": 14.76659999997355
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.382Z",
            "id": 41615,
            "count": 1,
            "bytes": 113579,
            "remainingMs": 1823.9872000000905
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.393Z",
            "id": 41615,
            "count": 1,
            "ms": 10.947900000028312
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.397Z",
            "id": 41616,
            "count": 3,
            "bytes": 348618,
            "remainingMs": 1808.3678999999538
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.412Z",
            "id": 41616,
            "count": 3,
            "ms": 14.76009999983944
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.436Z",
            "id": 41617,
            "count": 3,
            "bytes": 346900,
            "remainingMs": 1769.6118000000715
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.450Z",
            "id": 41617,
            "count": 3,
            "ms": 13.888500000117347
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.472Z",
            "id": 41618,
            "count": 3,
            "bytes": 345808,
            "remainingMs": 1733.877199999988
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.485Z",
            "id": 41618,
            "count": 3,
            "ms": 13.703999999910593
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.507Z",
            "id": 41619,
            "count": 3,
            "bytes": 358383,
            "remainingMs": 1698.063400000101
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.524Z",
            "id": 41619,
            "count": 3,
            "ms": 16.583300000056624
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.531Z",
            "id": 41620,
            "count": 3,
            "bytes": 357095,
            "remainingMs": 1674.5375000000931
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.545Z",
            "id": 41620,
            "count": 3,
            "ms": 13.567800000077114
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.558Z",
            "id": 41621,
            "count": 3,
            "bytes": 370952,
            "remainingMs": 1647.7021999999415
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.572Z",
            "id": 41621,
            "count": 3,
            "ms": 14.051599999889731
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.577Z",
            "id": 41622,
            "count": 3,
            "bytes": 369787,
            "remainingMs": 1628.8545000001322
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.589Z",
            "id": 41622,
            "count": 3,
            "ms": 11.89740000013262
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.593Z",
            "id": 41623,
            "count": 1,
            "bytes": 128499,
            "remainingMs": 1612.094299999997
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.607Z",
            "id": 41623,
            "count": 1,
            "ms": 13.250199999893084
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.609Z",
            "id": 41624,
            "count": 1,
            "bytes": 128465,
            "remainingMs": 1596.7290000000503
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.621Z",
            "id": 41624,
            "count": 1,
            "ms": 12.189800000051036
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.625Z",
            "id": 41625,
            "count": 1,
            "bytes": 133565,
            "remainingMs": 1580.3708999999799
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.637Z",
            "id": 41625,
            "count": 1,
            "ms": 11.372800000011921
          },
          {
            "type": "request",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.648Z",
            "id": 41626,
            "count": 3,
            "bytes": 439305,
            "remainingMs": 1557.717799999984
          },
          {
            "type": "response",
            "label": "p3-13-s0:step-2096",
            "at": "2026-11-02T02:06:39.662Z",
            "id": 41626,
            "count": 3,
            "ms": 14.100300000049174
          }
        ],
        "packMs": 26862.789200000247
      },
      "wallMs": 1111434.0031,
      "latency": {
        "model": {
          "count": 1095,
          "meanMs": 1003.4351068493172,
          "p95Ms": 2751.7714999999735,
          "maxMs": 2923.032999999996
        },
        "opponent": {
          "count": 1003,
          "meanMs": 7.617944167498325,
          "p95Ms": 31.797400000039488,
          "maxMs": 133.3408000000054
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p3-13-s0\\p3-13-s0"
    },
    {
      "id": "p3-13-s1",
      "slot": 13,
      "seat": 1,
      "seed": 310013117,
      "opponent": "hard",
      "players": 3,
      "map": "(3) Midway.aem",
      "category": "preset_units",
      "modelPlayer": 1,
      "initialSha256": "ec68c4f760b9a06afc0f8e347eedd2caaf793ee0f94e87e1892232019c6719f9",
      "firstToActPlayer": 2,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_win",
      "winner": 2,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 1575,
          "ids": [
            2
          ],
          "averagePlace": 3,
          "normalizedRank": 0
        },
        {
          "step": 3578,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0.5
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 3579,
      "rounds": 47,
      "roots": 1276,
      "witnessCount": 169,
      "witnessActions": 3049,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 82888,
        "observations": 255678,
        "completed": 82888,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 1112471.7805000187,
        "peakBatchSize": 32,
        "bytes": 42224849406,
        "decisionRequests": 82886,
        "decisionObservations": 255645,
        "completedDecisionObservations": 255645,
        "decisionWireMs": 1109797.1716000189,
        "decisionPeakBatchSize": 29,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.105Z",
            "id": 82857,
            "count": 3,
            "bytes": 533569,
            "remainingMs": 2599.3305999999866
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.120Z",
            "id": 82857,
            "count": 3,
            "ms": 15.19760000007227
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.132Z",
            "id": 82858,
            "count": 3,
            "bytes": 531873,
            "remainingMs": 2572.5427999999374
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.146Z",
            "id": 82858,
            "count": 3,
            "ms": 14.650799999944866
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.157Z",
            "id": 82859,
            "count": 3,
            "bytes": 530689,
            "remainingMs": 2546.8697000001557
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.173Z",
            "id": 82859,
            "count": 3,
            "ms": 15.864700000267476
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.184Z",
            "id": 82860,
            "count": 3,
            "bytes": 528833,
            "remainingMs": 2519.871499999892
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.198Z",
            "id": 82860,
            "count": 3,
            "ms": 14.099399999715388
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.209Z",
            "id": 82861,
            "count": 3,
            "bytes": 526721,
            "remainingMs": 2494.970200000331
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.222Z",
            "id": 82861,
            "count": 3,
            "ms": 13.204000000376254
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.232Z",
            "id": 82862,
            "count": 3,
            "bytes": 525441,
            "remainingMs": 2471.7117000003345
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.245Z",
            "id": 82862,
            "count": 3,
            "ms": 12.691800000146031
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.255Z",
            "id": 82863,
            "count": 3,
            "bytes": 524385,
            "remainingMs": 2449.601100000087
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.268Z",
            "id": 82863,
            "count": 3,
            "ms": 13.674399999901652
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.277Z",
            "id": 82864,
            "count": 3,
            "bytes": 524161,
            "remainingMs": 2426.94430000009
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.292Z",
            "id": 82864,
            "count": 3,
            "ms": 14.354999999981374
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.300Z",
            "id": 82865,
            "count": 3,
            "bytes": 523905,
            "remainingMs": 2403.69700000016
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.314Z",
            "id": 82865,
            "count": 3,
            "ms": 13.052800000179559
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.323Z",
            "id": 82866,
            "count": 3,
            "bytes": 522945,
            "remainingMs": 2381.6381999999285
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.336Z",
            "id": 82866,
            "count": 3,
            "ms": 13.557199999690056
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.346Z",
            "id": 82867,
            "count": 3,
            "bytes": 522111,
            "remainingMs": 2358.2428000001237
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.358Z",
            "id": 82867,
            "count": 3,
            "ms": 11.914799999911338
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.367Z",
            "id": 82868,
            "count": 3,
            "bytes": 520990,
            "remainingMs": 2337.377100000158
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.383Z",
            "id": 82868,
            "count": 3,
            "ms": 15.825800000224262
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.391Z",
            "id": 82869,
            "count": 3,
            "bytes": 519998,
            "remainingMs": 2312.9532000003383
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.406Z",
            "id": 82869,
            "count": 3,
            "ms": 14.438200000207871
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.415Z",
            "id": 82870,
            "count": 3,
            "bytes": 518462,
            "remainingMs": 2289.3358000000007
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.429Z",
            "id": 82870,
            "count": 3,
            "ms": 13.988299999851733
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.438Z",
            "id": 82871,
            "count": 3,
            "bytes": 516734,
            "remainingMs": 2265.938500000164
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.451Z",
            "id": 82871,
            "count": 3,
            "ms": 13.104199999943376
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.460Z",
            "id": 82872,
            "count": 3,
            "bytes": 516286,
            "remainingMs": 2243.7019000002183
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.472Z",
            "id": 82872,
            "count": 3,
            "ms": 11.709100000094622
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.480Z",
            "id": 82873,
            "count": 3,
            "bytes": 515838,
            "remainingMs": 2223.8398000001907
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.493Z",
            "id": 82873,
            "count": 3,
            "ms": 12.888900000136346
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.501Z",
            "id": 82874,
            "count": 3,
            "bytes": 514174,
            "remainingMs": 2202.912000000011
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.514Z",
            "id": 82874,
            "count": 3,
            "ms": 12.905900000128895
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.523Z",
            "id": 82875,
            "count": 3,
            "bytes": 513150,
            "remainingMs": 2181.6041000001132
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.535Z",
            "id": 82875,
            "count": 3,
            "ms": 12.26370000001043
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.543Z",
            "id": 82876,
            "count": 3,
            "bytes": 511518,
            "remainingMs": 2161.24729999993
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.555Z",
            "id": 82876,
            "count": 3,
            "ms": 11.727999999653548
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.562Z",
            "id": 82877,
            "count": 3,
            "bytes": 510718,
            "remainingMs": 2142.2299999999814
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.574Z",
            "id": 82877,
            "count": 3,
            "ms": 12.417299999855459
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.582Z",
            "id": 82878,
            "count": 3,
            "bytes": 510045,
            "remainingMs": 2121.712999999989
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.596Z",
            "id": 82878,
            "count": 3,
            "ms": 13.319499999750406
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.604Z",
            "id": 82879,
            "count": 3,
            "bytes": 508571,
            "remainingMs": 2100.501900000032
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.615Z",
            "id": 82879,
            "count": 3,
            "ms": 11.74709999980405
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.623Z",
            "id": 82880,
            "count": 3,
            "bytes": 507360,
            "remainingMs": 2081.2087000003085
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.635Z",
            "id": 82880,
            "count": 3,
            "ms": 12.155100000090897
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.642Z",
            "id": 82881,
            "count": 3,
            "bytes": 505850,
            "remainingMs": 2061.7080000001006
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.655Z",
            "id": 82881,
            "count": 3,
            "ms": 12.11310000019148
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.661Z",
            "id": 82882,
            "count": 3,
            "bytes": 505066,
            "remainingMs": 2042.7948000002652
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.674Z",
            "id": 82882,
            "count": 3,
            "ms": 12.392400000244379
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.681Z",
            "id": 82883,
            "count": 3,
            "bytes": 503850,
            "remainingMs": 2023.4990000003017
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.693Z",
            "id": 82883,
            "count": 3,
            "ms": 11.858299999963492
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.699Z",
            "id": 82884,
            "count": 3,
            "bytes": 502665,
            "remainingMs": 2005.1650000000373
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.714Z",
            "id": 82884,
            "count": 3,
            "ms": 14.90029999986291
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.719Z",
            "id": 82885,
            "count": 2,
            "bytes": 334334,
            "remainingMs": 1984.7886000000872
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.733Z",
            "id": 82885,
            "count": 2,
            "ms": 13.805699999909848
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.738Z",
            "id": 82886,
            "count": 2,
            "bytes": 287244,
            "remainingMs": 1966.1802000002936
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.749Z",
            "id": 82886,
            "count": 2,
            "ms": 11.198900000192225
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.757Z",
            "id": 82887,
            "count": 2,
            "bytes": 298758,
            "remainingMs": 1947.569700000342
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.768Z",
            "id": 82887,
            "count": 2,
            "ms": 11.707700000144541
          },
          {
            "type": "request",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.781Z",
            "id": 82888,
            "count": 3,
            "bytes": 558902,
            "remainingMs": 1922.7044999999925
          },
          {
            "type": "response",
            "label": "p3-13-s1:step-3577",
            "at": "2026-11-02T02:41:52.800Z",
            "id": 82888,
            "count": 3,
            "ms": 18.524399999994785
          }
        ],
        "packMs": 46834.21189999087
      },
      "wallMs": 2108195.5670000003,
      "latency": {
        "model": {
          "count": 2414,
          "meanMs": 864.8341501656989,
          "p95Ms": 2649.8326999999117,
          "maxMs": 2922.840099999972
        },
        "opponent": {
          "count": 1165,
          "meanMs": 9.936349012873183,
          "p95Ms": 35.40419999998994,
          "maxMs": 527.9433000000427
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p3-13-s1\\p3-13-s1"
    },
    {
      "id": "p3-13-s2",
      "slot": 13,
      "seat": 2,
      "seed": 310013117,
      "opponent": "hard",
      "players": 3,
      "map": "(3) Midway.aem",
      "category": "preset_units",
      "modelPlayer": 2,
      "initialSha256": "ec68c4f760b9a06afc0f8e347eedd2caaf793ee0f94e87e1892232019c6719f9",
      "firstToActPlayer": 2,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_loss",
      "winner": 1,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 1267,
          "ids": [
            2
          ],
          "averagePlace": 3,
          "normalizedRank": 0
        },
        {
          "step": 2038,
          "ids": [
            1
          ],
          "averagePlace": 2,
          "normalizedRank": 0.5
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": true,
      "steps": 2039,
      "rounds": 25,
      "roots": 148,
      "witnessCount": 30,
      "witnessActions": 709,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 12231,
        "observations": 38931,
        "completed": 12231,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 177833.12109999958,
        "peakBatchSize": 32,
        "bytes": 10311700640,
        "decisionRequests": 12229,
        "decisionObservations": 38898,
        "completedDecisionObservations": 38898,
        "decisionWireMs": 175230.0341999996,
        "decisionPeakBatchSize": 32,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:58.905Z",
            "id": 12200,
            "count": 4,
            "bytes": 593937,
            "remainingMs": 1623.4587000000174
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:58.919Z",
            "id": 12200,
            "count": 4,
            "ms": 14.24690000002738
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:58.931Z",
            "id": 12201,
            "count": 2,
            "bytes": 310618,
            "remainingMs": 1597.487300000037
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:58.944Z",
            "id": 12201,
            "count": 2,
            "ms": 12.45240000000922
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:58.955Z",
            "id": 12202,
            "count": 4,
            "bytes": 602148,
            "remainingMs": 1573.4527000000235
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:58.970Z",
            "id": 12202,
            "count": 4,
            "ms": 14.413400000019465
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:58.984Z",
            "id": 12203,
            "count": 2,
            "bytes": 286985,
            "remainingMs": 1544.7744999999995
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:58.996Z",
            "id": 12203,
            "count": 2,
            "ms": 12.163200000009965
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.006Z",
            "id": 12204,
            "count": 4,
            "bytes": 600641,
            "remainingMs": 1522.9043999999994
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.020Z",
            "id": 12204,
            "count": 4,
            "ms": 14.150699999998324
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.032Z",
            "id": 12205,
            "count": 1,
            "bytes": 143595,
            "remainingMs": 1496.4988000000012
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.042Z",
            "id": 12205,
            "count": 1,
            "ms": 9.535199999983888
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.052Z",
            "id": 12206,
            "count": 4,
            "bytes": 598943,
            "remainingMs": 1476.4472999999998
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.065Z",
            "id": 12206,
            "count": 4,
            "ms": 13.06130000000121
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.083Z",
            "id": 12207,
            "count": 4,
            "bytes": 584663,
            "remainingMs": 1446.0708999999915
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.096Z",
            "id": 12207,
            "count": 4,
            "ms": 13.73410000000149
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.106Z",
            "id": 12208,
            "count": 4,
            "bytes": 587467,
            "remainingMs": 1422.8789000000106
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.119Z",
            "id": 12208,
            "count": 4,
            "ms": 13.48320000001695
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.136Z",
            "id": 12209,
            "count": 3,
            "bytes": 435951,
            "remainingMs": 1393.1406000000425
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.152Z",
            "id": 12209,
            "count": 3,
            "ms": 16.550100000051316
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.161Z",
            "id": 12210,
            "count": 4,
            "bytes": 570157,
            "remainingMs": 1367.583500000008
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.178Z",
            "id": 12210,
            "count": 4,
            "ms": 17.113899999996647
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.197Z",
            "id": 12211,
            "count": 4,
            "bytes": 558059,
            "remainingMs": 1332.0109999999986
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.210Z",
            "id": 12211,
            "count": 4,
            "ms": 13.504899999999907
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.219Z",
            "id": 12212,
            "count": 4,
            "bytes": 557525,
            "remainingMs": 1309.5467000000062
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.234Z",
            "id": 12212,
            "count": 4,
            "ms": 14.65849999996135
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.248Z",
            "id": 12213,
            "count": 1,
            "bytes": 138305,
            "remainingMs": 1280.9590000000317
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.257Z",
            "id": 12213,
            "count": 1,
            "ms": 9.439500000036787
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.265Z",
            "id": 12214,
            "count": 4,
            "bytes": 556179,
            "remainingMs": 1263.7877000000444
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.279Z",
            "id": 12214,
            "count": 4,
            "ms": 14.040399999998044
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.294Z",
            "id": 12215,
            "count": 3,
            "bytes": 415056,
            "remainingMs": 1234.2233000000124
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.311Z",
            "id": 12215,
            "count": 3,
            "ms": 17.01370000001043
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.314Z",
            "id": 12216,
            "count": 1,
            "bytes": 138240,
            "remainingMs": 1214.3837000000058
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.328Z",
            "id": 12216,
            "count": 1,
            "ms": 13.833699999959208
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.335Z",
            "id": 12217,
            "count": 4,
            "bytes": 559179,
            "remainingMs": 1193.28820000001
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.348Z",
            "id": 12217,
            "count": 4,
            "ms": 12.902599999972153
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.367Z",
            "id": 12218,
            "count": 4,
            "bytes": 557802,
            "remainingMs": 1161.1861999999965
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.382Z",
            "id": 12218,
            "count": 4,
            "ms": 14.005799999984447
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.396Z",
            "id": 12219,
            "count": 2,
            "bytes": 287924,
            "remainingMs": 1132.867499999993
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.407Z",
            "id": 12219,
            "count": 2,
            "ms": 11.054299999959767
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.412Z",
            "id": 12220,
            "count": 2,
            "bytes": 287018,
            "remainingMs": 1117.1003999999957
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.425Z",
            "id": 12220,
            "count": 2,
            "ms": 13.647799999976996
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.433Z",
            "id": 12221,
            "count": 4,
            "bytes": 556358,
            "remainingMs": 1095.8110000000452
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.446Z",
            "id": 12221,
            "count": 4,
            "ms": 13.276000000012573
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.457Z",
            "id": 12222,
            "count": 1,
            "bytes": 144080,
            "remainingMs": 1071.5610000000452
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.469Z",
            "id": 12222,
            "count": 1,
            "ms": 12.003000000026077
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.472Z",
            "id": 12223,
            "count": 1,
            "bytes": 143562,
            "remainingMs": 1056.4376000000047
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.484Z",
            "id": 12223,
            "count": 1,
            "ms": 11.737299999978859
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.491Z",
            "id": 12224,
            "count": 4,
            "bytes": 554964,
            "remainingMs": 1037.9572000000044
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.504Z",
            "id": 12224,
            "count": 4,
            "ms": 13.113399999972899
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.514Z",
            "id": 12225,
            "count": 1,
            "bytes": 144080,
            "remainingMs": 1015.1462000000174
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.525Z",
            "id": 12225,
            "count": 1,
            "ms": 11.247399999992922
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.528Z",
            "id": 12226,
            "count": 1,
            "bytes": 143562,
            "remainingMs": 1000.8670000000275
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.539Z",
            "id": 12226,
            "count": 1,
            "ms": 10.87330000003567
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.544Z",
            "id": 12227,
            "count": 3,
            "bytes": 415832,
            "remainingMs": 984.6590999999898
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.557Z",
            "id": 12227,
            "count": 3,
            "ms": 13.151199999963865
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.564Z",
            "id": 12228,
            "count": 1,
            "bytes": 144048,
            "remainingMs": 964.7068999999901
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.575Z",
            "id": 12228,
            "count": 1,
            "ms": 11.43869999999879
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.580Z",
            "id": 12229,
            "count": 2,
            "bytes": 266378,
            "remainingMs": 948.5158999999985
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.594Z",
            "id": 12229,
            "count": 2,
            "ms": 13.54759999999078
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.600Z",
            "id": 12230,
            "count": 2,
            "bytes": 277280,
            "remainingMs": 928.9678000000422
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.613Z",
            "id": 12230,
            "count": 2,
            "ms": 12.976300000038464
          },
          {
            "type": "request",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.625Z",
            "id": 12231,
            "count": 4,
            "bytes": 587951,
            "remainingMs": 903.4131000000052
          },
          {
            "type": "response",
            "label": "p3-13-s2:step-1252",
            "at": "2026-11-02T02:47:59.647Z",
            "id": 12231,
            "count": 4,
            "ms": 21.427399999985937
          }
        ],
        "packMs": 11062.33970000083
      },
      "wallMs": 371108.39530000003,
      "latency": {
        "model": {
          "count": 285,
          "meanMs": 1233.8969540350865,
          "p95Ms": 2912.6897000000026,
          "maxMs": 2922.3796
        },
        "opponent": {
          "count": 1754,
          "meanMs": 8.51730712656835,
          "p95Ms": 30.61030000000028,
          "maxMs": 908.0903999999864
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p3-13-s2\\p3-13-s2"
    },
    {
      "id": "p3-14-s0",
      "slot": 14,
      "seat": 0,
      "seed": 310014126,
      "opponent": "hard",
      "players": 3,
      "map": "(3) classic 2.aem",
      "category": "preset_units",
      "modelPlayer": 0,
      "initialSha256": "538c26da5287870a9e906eedaed922ba68c7313414efa850f7e5a2bdaa555ac9",
      "firstToActPlayer": 0,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_win",
      "winner": 1,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 831,
          "ids": [
            3
          ],
          "averagePlace": 3,
          "normalizedRank": 0
        },
        {
          "step": 2333,
          "ids": [
            2
          ],
          "averagePlace": 2,
          "normalizedRank": 0.5
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 2334,
      "rounds": 32,
      "roots": 801,
      "witnessCount": 110,
      "witnessActions": 2613,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 50385,
        "observations": 158459,
        "completed": 50385,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 673359.9361999818,
        "peakBatchSize": 32,
        "bytes": 24359208572,
        "decisionRequests": 50383,
        "decisionObservations": 158426,
        "completedDecisionObservations": 158426,
        "decisionWireMs": 670766.5247999817,
        "decisionPeakBatchSize": 29,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.691Z",
            "id": 50354,
            "count": 3,
            "bytes": 421310,
            "remainingMs": 2669.2021999999415
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.705Z",
            "id": 50354,
            "count": 3,
            "ms": 13.868799999821931
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.715Z",
            "id": 50355,
            "count": 3,
            "bytes": 420670,
            "remainingMs": 2645.3079000001308
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.728Z",
            "id": 50355,
            "count": 3,
            "ms": 12.953800000017509
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.738Z",
            "id": 50356,
            "count": 3,
            "bytes": 419134,
            "remainingMs": 2622.5781000000425
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.751Z",
            "id": 50356,
            "count": 3,
            "ms": 12.47870000009425
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.760Z",
            "id": 50357,
            "count": 3,
            "bytes": 418398,
            "remainingMs": 2600.6385000001173
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.774Z",
            "id": 50357,
            "count": 3,
            "ms": 14.374900000169873
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.778Z",
            "id": 50358,
            "count": 1,
            "bytes": 127981,
            "remainingMs": 2582.8063000000548
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.788Z",
            "id": 50358,
            "count": 1,
            "ms": 10.232499999925494
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.796Z",
            "id": 50359,
            "count": 3,
            "bytes": 417470,
            "remainingMs": 2564.560000000056
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.809Z",
            "id": 50359,
            "count": 3,
            "ms": 12.493199999909848
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.815Z",
            "id": 50360,
            "count": 3,
            "bytes": 383599,
            "remainingMs": 2545.4165000000503
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.828Z",
            "id": 50360,
            "count": 3,
            "ms": 12.367099999915808
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.836Z",
            "id": 50361,
            "count": 3,
            "bytes": 416318,
            "remainingMs": 2524.718200000003
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.848Z",
            "id": 50361,
            "count": 3,
            "ms": 12.057599999941885
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.853Z",
            "id": 50362,
            "count": 2,
            "bytes": 255790,
            "remainingMs": 2507.407099999953
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.867Z",
            "id": 50362,
            "count": 2,
            "ms": 13.363200000021607
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.874Z",
            "id": 50363,
            "count": 3,
            "bytes": 414686,
            "remainingMs": 2486.2676000001375
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.888Z",
            "id": 50363,
            "count": 3,
            "ms": 13.896600000094622
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.898Z",
            "id": 50364,
            "count": 3,
            "bytes": 412990,
            "remainingMs": 2462.5756000000983
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.913Z",
            "id": 50364,
            "count": 3,
            "ms": 14.735499999951571
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.923Z",
            "id": 50365,
            "count": 3,
            "bytes": 410333,
            "remainingMs": 2437.467500000028
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.935Z",
            "id": 50365,
            "count": 3,
            "ms": 11.527699999976903
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.945Z",
            "id": 50366,
            "count": 3,
            "bytes": 409341,
            "remainingMs": 2415.936600000132
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.957Z",
            "id": 50366,
            "count": 3,
            "ms": 12.28580000018701
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.966Z",
            "id": 50367,
            "count": 3,
            "bytes": 405211,
            "remainingMs": 2395.066700000083
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.979Z",
            "id": 50367,
            "count": 3,
            "ms": 13.839399999938905
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:02.988Z",
            "id": 50368,
            "count": 3,
            "bytes": 404187,
            "remainingMs": 2372.8634000001475
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.000Z",
            "id": 50368,
            "count": 3,
            "ms": 12.324300000211224
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.008Z",
            "id": 50369,
            "count": 3,
            "bytes": 402907,
            "remainingMs": 2352.847000000067
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.022Z",
            "id": 50369,
            "count": 3,
            "ms": 14.174200000008568
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.029Z",
            "id": 50370,
            "count": 3,
            "bytes": 401755,
            "remainingMs": 2331.4915000000037
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.042Z",
            "id": 50370,
            "count": 3,
            "ms": 12.508499999996275
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.049Z",
            "id": 50371,
            "count": 3,
            "bytes": 400795,
            "remainingMs": 2311.656699999934
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.060Z",
            "id": 50371,
            "count": 3,
            "ms": 11.204900000011548
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.067Z",
            "id": 50372,
            "count": 3,
            "bytes": 400155,
            "remainingMs": 2293.465599999996
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.081Z",
            "id": 50372,
            "count": 3,
            "ms": 13.854000000050291
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.089Z",
            "id": 50373,
            "count": 3,
            "bytes": 398619,
            "remainingMs": 2272.117499999935
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.103Z",
            "id": 50373,
            "count": 3,
            "ms": 14.472099999897182
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.110Z",
            "id": 50374,
            "count": 3,
            "bytes": 397627,
            "remainingMs": 2250.1724000000395
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.123Z",
            "id": 50374,
            "count": 3,
            "ms": 12.114599999971688
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.130Z",
            "id": 50375,
            "count": 3,
            "bytes": 396378,
            "remainingMs": 2230.999899999937
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.142Z",
            "id": 50375,
            "count": 3,
            "ms": 11.97359999991022
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.145Z",
            "id": 50376,
            "count": 1,
            "bytes": 128014,
            "remainingMs": 2215.9166999999434
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.156Z",
            "id": 50376,
            "count": 1,
            "ms": 10.80489999987185
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.161Z",
            "id": 50377,
            "count": 3,
            "bytes": 394809,
            "remainingMs": 2199.410600000061
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.173Z",
            "id": 50377,
            "count": 3,
            "ms": 12.251399999950081
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.180Z",
            "id": 50378,
            "count": 3,
            "bytes": 393728,
            "remainingMs": 2180.440699999919
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.192Z",
            "id": 50378,
            "count": 3,
            "ms": 12.056299999821931
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.198Z",
            "id": 50379,
            "count": 3,
            "bytes": 392543,
            "remainingMs": 2162.3286000001244
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.212Z",
            "id": 50379,
            "count": 3,
            "ms": 13.58490000013262
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.218Z",
            "id": 50380,
            "count": 3,
            "bytes": 391999,
            "remainingMs": 2142.2047000001185
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.230Z",
            "id": 50380,
            "count": 3,
            "ms": 11.890800000168383
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.233Z",
            "id": 50381,
            "count": 1,
            "bytes": 128038,
            "remainingMs": 2127.571200000122
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.243Z",
            "id": 50381,
            "count": 1,
            "ms": 10.34070000005886
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.248Z",
            "id": 50382,
            "count": 3,
            "bytes": 390311,
            "remainingMs": 2112.151700000046
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.262Z",
            "id": 50382,
            "count": 3,
            "ms": 13.33850000007078
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.268Z",
            "id": 50383,
            "count": 3,
            "bytes": 388711,
            "remainingMs": 2092.99729999993
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.280Z",
            "id": 50383,
            "count": 3,
            "ms": 12.022799999918789
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.285Z",
            "id": 50384,
            "count": 3,
            "bytes": 387076,
            "remainingMs": 2075.4795000001322
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.299Z",
            "id": 50384,
            "count": 3,
            "ms": 13.758100000210106
          },
          {
            "type": "request",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.310Z",
            "id": 50385,
            "count": 3,
            "bytes": 431295,
            "remainingMs": 2050.3329000000376
          },
          {
            "type": "response",
            "label": "p3-14-s0:step-2332",
            "at": "2026-11-02T03:09:03.324Z",
            "id": 50385,
            "count": 3,
            "ms": 13.354000000050291
          }
        ],
        "packMs": 27605.283299973707
      },
      "wallMs": 1249733.3488999999,
      "latency": {
        "model": {
          "count": 1510,
          "meanMs": 818.9961076158933,
          "p95Ms": 2497.5762000000104,
          "maxMs": 2921.9905999999974
        },
        "opponent": {
          "count": 824,
          "meanMs": 8.627220145632034,
          "p95Ms": 35.22490000000107,
          "maxMs": 570.460299999977
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p3-14-s0\\p3-14-s0"
    },
    {
      "id": "p3-14-s1",
      "slot": 14,
      "seat": 1,
      "seed": 310014126,
      "opponent": "hard",
      "players": 3,
      "map": "(3) classic 2.aem",
      "category": "preset_units",
      "modelPlayer": 2,
      "initialSha256": "538c26da5287870a9e906eedaed922ba68c7313414efa850f7e5a2bdaa555ac9",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_win",
      "winner": 3,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 969,
          "ids": [
            3
          ],
          "averagePlace": 3,
          "normalizedRank": 0
        },
        {
          "step": 1510,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0.5
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 1511,
      "rounds": 18,
      "roots": 416,
      "witnessCount": 76,
      "witnessActions": 1400,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 31509,
        "observations": 96014,
        "completed": 31509,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 420711.959299991,
        "peakBatchSize": 32,
        "bytes": 16895361464,
        "decisionRequests": 31507,
        "decisionObservations": 95981,
        "completedDecisionObservations": 95981,
        "decisionWireMs": 418042.06519999105,
        "decisionPeakBatchSize": 28,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:56.837Z",
            "id": 31478,
            "count": 3,
            "bytes": 305242,
            "remainingMs": 2704.0670999999857
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:56.851Z",
            "id": 31478,
            "count": 3,
            "ms": 14.040900000021793
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:56.867Z",
            "id": 31479,
            "count": 3,
            "bytes": 304058,
            "remainingMs": 2673.650399999926
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:56.884Z",
            "id": 31479,
            "count": 3,
            "ms": 16.289600000018254
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:56.900Z",
            "id": 31480,
            "count": 3,
            "bytes": 303386,
            "remainingMs": 2640.5866999999853
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:56.914Z",
            "id": 31480,
            "count": 3,
            "ms": 13.534500000067055
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:56.930Z",
            "id": 31481,
            "count": 3,
            "bytes": 303386,
            "remainingMs": 2610.5547999999253
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:56.942Z",
            "id": 31481,
            "count": 3,
            "ms": 12.085599999991246
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:56.961Z",
            "id": 31482,
            "count": 3,
            "bytes": 301466,
            "remainingMs": 2579.628299999982
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:56.975Z",
            "id": 31482,
            "count": 3,
            "ms": 13.533700000029057
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:56.987Z",
            "id": 31483,
            "count": 2,
            "bytes": 183936,
            "remainingMs": 2553.696499999962
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:56.998Z",
            "id": 31483,
            "count": 2,
            "ms": 10.297600000048988
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.004Z",
            "id": 31484,
            "count": 3,
            "bytes": 300090,
            "remainingMs": 2536.590499999933
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.016Z",
            "id": 31484,
            "count": 3,
            "ms": 11.999599999981001
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.028Z",
            "id": 31485,
            "count": 1,
            "bytes": 92048,
            "remainingMs": 2513.342299999902
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.039Z",
            "id": 31485,
            "count": 1,
            "ms": 10.974399999948218
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.044Z",
            "id": 31486,
            "count": 3,
            "bytes": 298840,
            "remainingMs": 2496.545299999998
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.057Z",
            "id": 31486,
            "count": 3,
            "ms": 13.0578000000678
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.072Z",
            "id": 31487,
            "count": 3,
            "bytes": 298199,
            "remainingMs": 2468.447199999937
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.085Z",
            "id": 31487,
            "count": 3,
            "ms": 12.148599999956787
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.101Z",
            "id": 31488,
            "count": 3,
            "bytes": 298039,
            "remainingMs": 2439.5808999999426
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.114Z",
            "id": 31488,
            "count": 3,
            "ms": 12.933100000023842
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.129Z",
            "id": 31489,
            "count": 3,
            "bytes": 297599,
            "remainingMs": 2411.7539000000106
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.146Z",
            "id": 31489,
            "count": 3,
            "ms": 17.062400000053458
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.162Z",
            "id": 31490,
            "count": 3,
            "bytes": 296383,
            "remainingMs": 2379.132899999968
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.177Z",
            "id": 31490,
            "count": 3,
            "ms": 15.33940000005532
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.192Z",
            "id": 31491,
            "count": 3,
            "bytes": 294943,
            "remainingMs": 2348.8484999999637
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.209Z",
            "id": 31491,
            "count": 3,
            "ms": 17.07860000000801
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.224Z",
            "id": 31492,
            "count": 3,
            "bytes": 294335,
            "remainingMs": 2316.4286999999313
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.237Z",
            "id": 31492,
            "count": 3,
            "ms": 12.4372999999905
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.252Z",
            "id": 31493,
            "count": 3,
            "bytes": 291679,
            "remainingMs": 2289.1307999999262
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.264Z",
            "id": 31493,
            "count": 3,
            "ms": 12.145799999940209
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.278Z",
            "id": 31494,
            "count": 3,
            "bytes": 290847,
            "remainingMs": 2262.854799999972
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.293Z",
            "id": 31494,
            "count": 3,
            "ms": 14.712799999979325
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.307Z",
            "id": 31495,
            "count": 3,
            "bytes": 289244,
            "remainingMs": 2233.714799999958
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.320Z",
            "id": 31495,
            "count": 3,
            "ms": 12.726099999970756
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.334Z",
            "id": 31496,
            "count": 3,
            "bytes": 287964,
            "remainingMs": 2206.4802999999374
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.348Z",
            "id": 31496,
            "count": 3,
            "ms": 13.167799999937415
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.359Z",
            "id": 31497,
            "count": 2,
            "bytes": 184101,
            "remainingMs": 2181.439199999906
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.371Z",
            "id": 31497,
            "count": 2,
            "ms": 11.215999999898486
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.375Z",
            "id": 31498,
            "count": 3,
            "bytes": 287209,
            "remainingMs": 2165.6977999999654
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.387Z",
            "id": 31498,
            "count": 3,
            "ms": 11.354099999996834
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.400Z",
            "id": 31499,
            "count": 3,
            "bytes": 286473,
            "remainingMs": 2140.5618999999715
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.414Z",
            "id": 31499,
            "count": 3,
            "ms": 13.618099999963306
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.428Z",
            "id": 31500,
            "count": 3,
            "bytes": 285065,
            "remainingMs": 2112.7417999999598
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.440Z",
            "id": 31500,
            "count": 3,
            "ms": 12.205700000049546
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.454Z",
            "id": 31501,
            "count": 3,
            "bytes": 281987,
            "remainingMs": 2086.888500000001
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.466Z",
            "id": 31501,
            "count": 3,
            "ms": 12.379900000058115
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.480Z",
            "id": 31502,
            "count": 3,
            "bytes": 278266,
            "remainingMs": 2061.371599999955
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.492Z",
            "id": 31502,
            "count": 3,
            "ms": 12.00109999999404
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.504Z",
            "id": 31503,
            "count": 3,
            "bytes": 291131,
            "remainingMs": 2036.5943999999436
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.521Z",
            "id": 31503,
            "count": 3,
            "ms": 16.568100000033155
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.524Z",
            "id": 31504,
            "count": 1,
            "bytes": 96131,
            "remainingMs": 2017.3708999999799
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.536Z",
            "id": 31504,
            "count": 1,
            "ms": 12.717000000062399
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.541Z",
            "id": 31505,
            "count": 3,
            "bytes": 289457,
            "remainingMs": 2000.3979999999283
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.555Z",
            "id": 31505,
            "count": 3,
            "ms": 14.307599999941885
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.559Z",
            "id": 31506,
            "count": 2,
            "bytes": 201474,
            "remainingMs": 1981.7580999999773
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.572Z",
            "id": 31506,
            "count": 2,
            "ms": 12.420600000070408
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.574Z",
            "id": 31507,
            "count": 1,
            "bytes": 96228,
            "remainingMs": 1967.1347999999998
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.585Z",
            "id": 31507,
            "count": 1,
            "ms": 11.065400000079535
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.587Z",
            "id": 31508,
            "count": 1,
            "bytes": 101010,
            "remainingMs": 1954.1159999999218
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.597Z",
            "id": 31508,
            "count": 1,
            "ms": 10.426699999952689
          },
          {
            "type": "request",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.606Z",
            "id": 31509,
            "count": 3,
            "bytes": 344313,
            "remainingMs": 1934.8807999999262
          },
          {
            "type": "response",
            "label": "p3-14-s1:step-1509",
            "at": "2026-11-02T03:21:57.619Z",
            "id": 31509,
            "count": 3,
            "ms": 12.636899999924935
          }
        ],
        "packMs": 18581.799099998556
      },
      "wallMs": 769326.7958,
      "latency": {
        "model": {
          "count": 809,
          "meanMs": 938.6692399258353,
          "p95Ms": 2612.05210000003,
          "maxMs": 2922.1379000000015
        },
        "opponent": {
          "count": 702,
          "meanMs": 8.857628774927548,
          "p95Ms": 33.70119999999997,
          "maxMs": 941.5682000000088
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p3-14-s1\\p3-14-s1"
    },
    {
      "id": "p3-14-s2",
      "slot": 14,
      "seat": 2,
      "seed": 310014126,
      "opponent": "hard",
      "players": 3,
      "map": "(3) classic 2.aem",
      "category": "preset_units",
      "modelPlayer": 3,
      "initialSha256": "538c26da5287870a9e906eedaed922ba68c7313414efa850f7e5a2bdaa555ac9",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 3,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 933,
          "ids": [
            3
          ],
          "averagePlace": 3,
          "normalizedRank": 0
        },
        {
          "step": 1852,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0.5
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": true,
      "steps": 1853,
      "rounds": 24,
      "roots": 81,
      "witnessCount": 17,
      "witnessActions": 384,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 7100,
        "observations": 22285,
        "completed": 7100,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 105212.42220000098,
        "peakBatchSize": 32,
        "bytes": 6385715737,
        "decisionRequests": 7098,
        "decisionObservations": 22252,
        "completedDecisionObservations": 22252,
        "decisionWireMs": 102599.79060000097,
        "decisionPeakBatchSize": 25,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.046Z",
            "id": 7069,
            "count": 3,
            "bytes": 584816,
            "remainingMs": 1185.7623999999778
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.062Z",
            "id": 7069,
            "count": 3,
            "ms": 16.058300000004238
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.075Z",
            "id": 7070,
            "count": 4,
            "bytes": 794437,
            "remainingMs": 1155.8781000000017
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.089Z",
            "id": 7070,
            "count": 4,
            "ms": 13.404000000009546
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.112Z",
            "id": 7071,
            "count": 4,
            "bytes": 787188,
            "remainingMs": 1119.255999999994
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.126Z",
            "id": 7071,
            "count": 4,
            "ms": 13.630600000004051
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.141Z",
            "id": 7072,
            "count": 2,
            "bytes": 394316,
            "remainingMs": 1089.8083999999799
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.152Z",
            "id": 7072,
            "count": 2,
            "ms": 10.96909999998752
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.165Z",
            "id": 7073,
            "count": 4,
            "bytes": 759696,
            "remainingMs": 1066.4522999999754
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.179Z",
            "id": 7073,
            "count": 4,
            "ms": 14.367199999978766
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.196Z",
            "id": 7074,
            "count": 3,
            "bytes": 546765,
            "remainingMs": 1034.9306999999972
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.212Z",
            "id": 7074,
            "count": 3,
            "ms": 15.939400000002934
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.226Z",
            "id": 7075,
            "count": 4,
            "bytes": 739588,
            "remainingMs": 1005.7609999999986
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.243Z",
            "id": 7075,
            "count": 4,
            "ms": 17.496000000013737
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.256Z",
            "id": 7076,
            "count": 2,
            "bytes": 362686,
            "remainingMs": 974.8032999999996
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.267Z",
            "id": 7076,
            "count": 2,
            "ms": 10.916200000006938
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.279Z",
            "id": 7077,
            "count": 4,
            "bytes": 731259,
            "remainingMs": 952.4184999999998
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.291Z",
            "id": 7077,
            "count": 4,
            "ms": 12.282100000011269
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.303Z",
            "id": 7078,
            "count": 1,
            "bytes": 190771,
            "remainingMs": 928.5352999999886
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.313Z",
            "id": 7078,
            "count": 1,
            "ms": 10.338900000002468
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.324Z",
            "id": 7079,
            "count": 4,
            "bytes": 721901,
            "remainingMs": 906.8140999999887
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.337Z",
            "id": 7079,
            "count": 4,
            "ms": 13.00669999999809
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.348Z",
            "id": 7080,
            "count": 1,
            "bytes": 178201,
            "remainingMs": 883.1104999999807
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.359Z",
            "id": 7080,
            "count": 1,
            "ms": 10.660899999988033
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.369Z",
            "id": 7081,
            "count": 4,
            "bytes": 714540,
            "remainingMs": 861.9126999999862
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.383Z",
            "id": 7081,
            "count": 4,
            "ms": 13.657100000011269
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.400Z",
            "id": 7082,
            "count": 4,
            "bytes": 712426,
            "remainingMs": 830.8374999999942
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.414Z",
            "id": 7082,
            "count": 4,
            "ms": 13.08650000000489
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.432Z",
            "id": 7083,
            "count": 4,
            "bytes": 709956,
            "remainingMs": 799.2463999999745
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.450Z",
            "id": 7083,
            "count": 4,
            "ms": 17.72959999999148
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.463Z",
            "id": 7084,
            "count": 2,
            "bytes": 344220,
            "remainingMs": 768.4730999999738
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.474Z",
            "id": 7084,
            "count": 2,
            "ms": 11.026599999982864
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.483Z",
            "id": 7085,
            "count": 4,
            "bytes": 702178,
            "remainingMs": 747.9593999999925
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.497Z",
            "id": 7085,
            "count": 4,
            "ms": 13.564199999993434
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.507Z",
            "id": 7086,
            "count": 1,
            "bytes": 166126,
            "remainingMs": 724.4651999999769
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.517Z",
            "id": 7086,
            "count": 1,
            "ms": 10.204799999977695
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.526Z",
            "id": 7087,
            "count": 4,
            "bytes": 700607,
            "remainingMs": 705.6529999999912
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.538Z",
            "id": 7087,
            "count": 4,
            "ms": 12.659299999999348
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.551Z",
            "id": 7088,
            "count": 2,
            "bytes": 344132,
            "remainingMs": 680.5106999999844
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.562Z",
            "id": 7088,
            "count": 2,
            "ms": 11.544099999999162
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.572Z",
            "id": 7089,
            "count": 4,
            "bytes": 699003,
            "remainingMs": 659.2311999999802
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.586Z",
            "id": 7089,
            "count": 4,
            "ms": 13.78200000000652
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.598Z",
            "id": 7090,
            "count": 2,
            "bytes": 356406,
            "remainingMs": 632.9045999999798
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.609Z",
            "id": 7090,
            "count": 2,
            "ms": 10.777999999991152
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.618Z",
            "id": 7091,
            "count": 4,
            "bytes": 697978,
            "remainingMs": 613.0080000000016
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.631Z",
            "id": 7091,
            "count": 4,
            "ms": 12.760399999999208
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.640Z",
            "id": 7092,
            "count": 1,
            "bytes": 172669,
            "remainingMs": 591.075199999992
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.652Z",
            "id": 7092,
            "count": 1,
            "ms": 11.332099999999627
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.660Z",
            "id": 7093,
            "count": 4,
            "bytes": 702867,
            "remainingMs": 571.0149999999849
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.674Z",
            "id": 7093,
            "count": 4,
            "ms": 13.717899999988731
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.683Z",
            "id": 7094,
            "count": 1,
            "bytes": 178726,
            "remainingMs": 547.9255999999878
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.694Z",
            "id": 7094,
            "count": 1,
            "ms": 11.034299999999348
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.703Z",
            "id": 7095,
            "count": 4,
            "bytes": 707343,
            "remainingMs": 528.0907000000007
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.718Z",
            "id": 7095,
            "count": 4,
            "ms": 15.096900000004098
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.728Z",
            "id": 7096,
            "count": 2,
            "bytes": 357392,
            "remainingMs": 503.75740000000224
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.739Z",
            "id": 7096,
            "count": 2,
            "ms": 11.57050000000163
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.744Z",
            "id": 7097,
            "count": 2,
            "bytes": 356162,
            "remainingMs": 487.3953999999794
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.755Z",
            "id": 7097,
            "count": 2,
            "ms": 10.996099999989383
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.762Z",
            "id": 7098,
            "count": 3,
            "bytes": 541033,
            "remainingMs": 469.7055999999866
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.774Z",
            "id": 7098,
            "count": 3,
            "ms": 12.271000000007916
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.785Z",
            "id": 7099,
            "count": 3,
            "bytes": 560862,
            "remainingMs": 446.483899999992
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.797Z",
            "id": 7099,
            "count": 3,
            "ms": 11.956399999995483
          },
          {
            "type": "request",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.806Z",
            "id": 7100,
            "count": 3,
            "bytes": 528776,
            "remainingMs": 425.16559999997844
          },
          {
            "type": "response",
            "label": "p3-14-s2:step-787",
            "at": "2026-11-02T03:25:34.820Z",
            "id": 7100,
            "count": 3,
            "ms": 13.925399999978254
          }
        ],
        "packMs": 6875.192499999612
      },
      "wallMs": 224552.1755,
      "latency": {
        "model": {
          "count": 146,
          "meanMs": 1420.0721630136986,
          "p95Ms": 2910.222900000008,
          "maxMs": 2919.7651
        },
        "opponent": {
          "count": 1707,
          "meanMs": 7.760722085530318,
          "p95Ms": 29.751900000002934,
          "maxMs": 512.4770000000135
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p3-14-s2\\p3-14-s2"
    },
    {
      "id": "p3-15-s0",
      "slot": 15,
      "seat": 0,
      "seed": 310015135,
      "opponent": "hard",
      "players": 3,
      "map": "(3) classic 2.aem",
      "category": "advantage_endgame",
      "modelPlayer": 0,
      "initialSha256": "e099bb95e6b770fda8004fcc2b8b6777fa14941e31d2a773d6b498d5aafb7f04",
      "firstToActPlayer": 0,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_win",
      "winner": 1,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 729,
          "ids": [
            3
          ],
          "averagePlace": 3,
          "normalizedRank": 0
        },
        {
          "step": 1881,
          "ids": [
            2
          ],
          "averagePlace": 2,
          "normalizedRank": 0.5
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 1882,
      "rounds": 37,
      "roots": 616,
      "witnessCount": 91,
      "witnessActions": 1375,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 33818,
        "observations": 107065,
        "completed": 33818,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 426793.9873000076,
        "peakBatchSize": 32,
        "bytes": 10436951686,
        "decisionRequests": 33816,
        "decisionObservations": 107032,
        "completedDecisionObservations": 107032,
        "decisionWireMs": 424256.23970000754,
        "decisionPeakBatchSize": 30,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.581Z",
            "id": 33787,
            "count": 2,
            "bytes": 134661,
            "remainingMs": 2833.9247999999207
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.593Z",
            "id": 33787,
            "count": 2,
            "ms": 11.594199999934062
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.599Z",
            "id": 33788,
            "count": 3,
            "bytes": 233485,
            "remainingMs": 2816.4020999999484
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.611Z",
            "id": 33788,
            "count": 3,
            "ms": 12.215800000005402
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.618Z",
            "id": 33789,
            "count": 3,
            "bytes": 231661,
            "remainingMs": 2797.230499999947
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.631Z",
            "id": 33789,
            "count": 3,
            "ms": 13.001300000003539
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.638Z",
            "id": 33790,
            "count": 3,
            "bytes": 230765,
            "remainingMs": 2777.2678000000305
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.650Z",
            "id": 33790,
            "count": 3,
            "ms": 12.07460000005085
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.658Z",
            "id": 33791,
            "count": 3,
            "bytes": 229165,
            "remainingMs": 2757.3094000000274
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.671Z",
            "id": 33791,
            "count": 3,
            "ms": 12.691600000020117
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.682Z",
            "id": 33792,
            "count": 3,
            "bytes": 226892,
            "remainingMs": 2733.411599999992
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.696Z",
            "id": 33792,
            "count": 3,
            "ms": 13.882300000055693
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.698Z",
            "id": 33793,
            "count": 1,
            "bytes": 67411,
            "remainingMs": 2716.986799999955
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.709Z",
            "id": 33793,
            "count": 1,
            "ms": 10.511300000012852
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.714Z",
            "id": 33794,
            "count": 3,
            "bytes": 224914,
            "remainingMs": 2700.9440000000177
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.726Z",
            "id": 33794,
            "count": 3,
            "ms": 11.866400000057183
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.732Z",
            "id": 33795,
            "count": 3,
            "bytes": 220817,
            "remainingMs": 2683.173199999961
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.746Z",
            "id": 33795,
            "count": 3,
            "ms": 13.661199999973178
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.752Z",
            "id": 33796,
            "count": 3,
            "bytes": 218545,
            "remainingMs": 2663.6359999999404
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.763Z",
            "id": 33796,
            "count": 3,
            "ms": 11.694999999948777
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.769Z",
            "id": 33797,
            "count": 3,
            "bytes": 217073,
            "remainingMs": 2646.678100000019
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.781Z",
            "id": 33797,
            "count": 3,
            "ms": 11.911100000026636
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.785Z",
            "id": 33798,
            "count": 3,
            "bytes": 215793,
            "remainingMs": 2629.935599999968
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.798Z",
            "id": 33798,
            "count": 3,
            "ms": 12.159100000048056
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.802Z",
            "id": 33799,
            "count": 3,
            "bytes": 214512,
            "remainingMs": 2612.8876000000164
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.814Z",
            "id": 33799,
            "count": 3,
            "ms": 11.268600000068545
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.819Z",
            "id": 33800,
            "count": 3,
            "bytes": 213552,
            "remainingMs": 2596.70829999994
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.832Z",
            "id": 33800,
            "count": 3,
            "ms": 13.041299999924377
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.836Z",
            "id": 33801,
            "count": 3,
            "bytes": 212043,
            "remainingMs": 2579.0069999999832
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.849Z",
            "id": 33801,
            "count": 3,
            "ms": 13.023399999947287
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.854Z",
            "id": 33802,
            "count": 3,
            "bytes": 210085,
            "remainingMs": 2561.278900000034
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.866Z",
            "id": 33802,
            "count": 3,
            "ms": 11.688100000028498
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.870Z",
            "id": 33803,
            "count": 3,
            "bytes": 207237,
            "remainingMs": 2545.3249999999534
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.884Z",
            "id": 33803,
            "count": 3,
            "ms": 14.303799999994226
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.888Z",
            "id": 33804,
            "count": 3,
            "bytes": 205601,
            "remainingMs": 2527.091400000034
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.900Z",
            "id": 33804,
            "count": 3,
            "ms": 12.017100000055507
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.903Z",
            "id": 33805,
            "count": 1,
            "bytes": 64773,
            "remainingMs": 2512.514499999932
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.914Z",
            "id": 33805,
            "count": 1,
            "ms": 11.306299999938346
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.919Z",
            "id": 33806,
            "count": 1,
            "bytes": 67872,
            "remainingMs": 2496.327399999951
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.931Z",
            "id": 33806,
            "count": 1,
            "ms": 12.268700000015087
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.933Z",
            "id": 33807,
            "count": 1,
            "bytes": 67766,
            "remainingMs": 2482.0435999999754
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.945Z",
            "id": 33807,
            "count": 1,
            "ms": 11.950199999962933
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.951Z",
            "id": 33808,
            "count": 1,
            "bytes": 70985,
            "remainingMs": 2464.820699999924
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.961Z",
            "id": 33808,
            "count": 1,
            "ms": 10.885499999974854
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.963Z",
            "id": 33809,
            "count": 1,
            "bytes": 70589,
            "remainingMs": 2452.0720999999903
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.973Z",
            "id": 33809,
            "count": 1,
            "ms": 9.63890000001993
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.974Z",
            "id": 33810,
            "count": 1,
            "bytes": 70887,
            "remainingMs": 2440.852499999921
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.984Z",
            "id": 33810,
            "count": 1,
            "ms": 9.2206999999471
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.989Z",
            "id": 33811,
            "count": 1,
            "bytes": 74226,
            "remainingMs": 2426.3907999999356
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:39.999Z",
            "id": 33811,
            "count": 1,
            "ms": 10.438899999950081
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:40.002Z",
            "id": 33812,
            "count": 1,
            "bytes": 74112,
            "remainingMs": 2413.59990000003
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:40.012Z",
            "id": 33812,
            "count": 1,
            "ms": 9.841500000096858
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:40.016Z",
            "id": 33813,
            "count": 1,
            "bytes": 77627,
            "remainingMs": 2399.724799999967
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:40.025Z",
            "id": 33813,
            "count": 1,
            "ms": 9.368600000045262
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:40.027Z",
            "id": 33814,
            "count": 1,
            "bytes": 77369,
            "remainingMs": 2388.062099999981
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:40.037Z",
            "id": 33814,
            "count": 1,
            "ms": 9.542299999971874
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:40.040Z",
            "id": 33815,
            "count": 1,
            "bytes": 81156,
            "remainingMs": 2375.0056999999797
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:40.050Z",
            "id": 33815,
            "count": 1,
            "ms": 9.792900000000373
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:40.052Z",
            "id": 33816,
            "count": 1,
            "bytes": 80800,
            "remainingMs": 2362.9675999999745
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:40.062Z",
            "id": 33816,
            "count": 1,
            "ms": 9.974099999992177
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:40.065Z",
            "id": 33817,
            "count": 1,
            "bytes": 84909,
            "remainingMs": 2350.40009999997
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:40.075Z",
            "id": 33817,
            "count": 1,
            "ms": 10.441899999976158
          },
          {
            "type": "request",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:40.084Z",
            "id": 33818,
            "count": 3,
            "bytes": 261459,
            "remainingMs": 2331.3040999999503
          },
          {
            "type": "response",
            "label": "p3-15-s0:step-1880",
            "at": "2026-11-02T03:37:40.096Z",
            "id": 33818,
            "count": 3,
            "ms": 12.251500000013039
          }
        ],
        "packMs": 12819.196900005667
      },
      "wallMs": 708317.2774,
      "latency": {
        "model": {
          "count": 1179,
          "meanMs": 591.6168522476668,
          "p95Ms": 2170.6589999999997,
          "maxMs": 2789.1355999999796
        },
        "opponent": {
          "count": 703,
          "meanMs": 8.913735704125365,
          "p95Ms": 32.17850000000908,
          "maxMs": 377.162900000003
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p3-15-s0\\p3-15-s0"
    },
    {
      "id": "p3-15-s1",
      "slot": 15,
      "seat": 1,
      "seed": 310015135,
      "opponent": "hard",
      "players": 3,
      "map": "(3) classic 2.aem",
      "category": "advantage_endgame",
      "modelPlayer": 2,
      "initialSha256": "e099bb95e6b770fda8004fcc2b8b6777fa14941e31d2a773d6b498d5aafb7f04",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_win",
      "winner": 3,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 430,
          "ids": [
            3
          ],
          "averagePlace": 3,
          "normalizedRank": 0
        },
        {
          "step": 1261,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0.5
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 1262,
      "rounds": 23,
      "roots": 388,
      "witnessCount": 71,
      "witnessActions": 1087,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 23683,
        "observations": 75686,
        "completed": 23683,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 298609.6896999998,
        "peakBatchSize": 32,
        "bytes": 6831512869,
        "decisionRequests": 23681,
        "decisionObservations": 75653,
        "completedDecisionObservations": 75653,
        "decisionWireMs": 295954.5814999998,
        "decisionPeakBatchSize": 24,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.410Z",
            "id": 23652,
            "count": 1,
            "bytes": 100258,
            "remainingMs": 2908.450499999977
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.420Z",
            "id": 23652,
            "count": 1,
            "ms": 9.815000000002328
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.433Z",
            "id": 23653,
            "count": 4,
            "bytes": 453673,
            "remainingMs": 2885.454399999988
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.450Z",
            "id": 23653,
            "count": 4,
            "ms": 16.458700000017416
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.455Z",
            "id": 23654,
            "count": 3,
            "bytes": 340305,
            "remainingMs": 2863.1909999999916
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.471Z",
            "id": 23654,
            "count": 3,
            "ms": 15.287599999981467
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.481Z",
            "id": 23655,
            "count": 3,
            "bytes": 338993,
            "remainingMs": 2837.4501000000164
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.493Z",
            "id": 23655,
            "count": 3,
            "ms": 11.669200000003912
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.503Z",
            "id": 23656,
            "count": 3,
            "bytes": 336753,
            "remainingMs": 2815.7130999999936
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.514Z",
            "id": 23656,
            "count": 3,
            "ms": 11.356499999994412
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.524Z",
            "id": 23657,
            "count": 3,
            "bytes": 334321,
            "remainingMs": 2794.498499999987
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.537Z",
            "id": 23657,
            "count": 3,
            "ms": 13.193399999989197
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.546Z",
            "id": 23658,
            "count": 3,
            "bytes": 333329,
            "remainingMs": 2772.7045999999973
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.558Z",
            "id": 23658,
            "count": 3,
            "ms": 12.21919999999227
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.566Z",
            "id": 23659,
            "count": 3,
            "bytes": 332177,
            "remainingMs": 2752.0952999999863
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.580Z",
            "id": 23659,
            "count": 3,
            "ms": 13.649099999980535
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.589Z",
            "id": 23660,
            "count": 3,
            "bytes": 331697,
            "remainingMs": 2729.980199999991
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.601Z",
            "id": 23660,
            "count": 3,
            "ms": 12.085499999986496
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.609Z",
            "id": 23661,
            "count": 3,
            "bytes": 330897,
            "remainingMs": 2709.4137999999803
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.622Z",
            "id": 23661,
            "count": 3,
            "ms": 12.61119999998482
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.630Z",
            "id": 23662,
            "count": 3,
            "bytes": 330001,
            "remainingMs": 2688.6059999999707
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.642Z",
            "id": 23662,
            "count": 3,
            "ms": 12.213300000003073
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.650Z",
            "id": 23663,
            "count": 3,
            "bytes": 328945,
            "remainingMs": 2668.2018999999855
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.662Z",
            "id": 23663,
            "count": 3,
            "ms": 11.73540000000503
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.670Z",
            "id": 23664,
            "count": 3,
            "bytes": 327729,
            "remainingMs": 2648.3351999999722
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.682Z",
            "id": 23664,
            "count": 3,
            "ms": 11.798999999999069
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.690Z",
            "id": 23665,
            "count": 3,
            "bytes": 325937,
            "remainingMs": 2628.5824999999604
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.702Z",
            "id": 23665,
            "count": 3,
            "ms": 11.897999999986496
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.710Z",
            "id": 23666,
            "count": 3,
            "bytes": 324080,
            "remainingMs": 2608.9750999999815
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.721Z",
            "id": 23666,
            "count": 3,
            "ms": 11.646399999968708
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.729Z",
            "id": 23667,
            "count": 3,
            "bytes": 322318,
            "remainingMs": 2589.2981000000145
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.744Z",
            "id": 23667,
            "count": 3,
            "ms": 14.962300000013784
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.753Z",
            "id": 23668,
            "count": 3,
            "bytes": 321518,
            "remainingMs": 2565.7938999999897
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.765Z",
            "id": 23668,
            "count": 3,
            "ms": 11.881500000017695
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.770Z",
            "id": 23669,
            "count": 2,
            "bytes": 200440,
            "remainingMs": 2549.0342999999993
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.781Z",
            "id": 23669,
            "count": 2,
            "ms": 11.116600000008475
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.789Z",
            "id": 23670,
            "count": 3,
            "bytes": 321006,
            "remainingMs": 2530.016100000008
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.804Z",
            "id": 23670,
            "count": 3,
            "ms": 15.532800000044517
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.811Z",
            "id": 23671,
            "count": 3,
            "bytes": 320014,
            "remainingMs": 2507.4658000000054
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.823Z",
            "id": 23671,
            "count": 3,
            "ms": 12.30960000003688
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.830Z",
            "id": 23672,
            "count": 3,
            "bytes": 319278,
            "remainingMs": 2488.5225999999675
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.843Z",
            "id": 23672,
            "count": 3,
            "ms": 13.208400000003166
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.851Z",
            "id": 23673,
            "count": 3,
            "bytes": 317454,
            "remainingMs": 2467.8311000000103
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.866Z",
            "id": 23673,
            "count": 3,
            "ms": 14.863300000026356
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.873Z",
            "id": 23674,
            "count": 3,
            "bytes": 316686,
            "remainingMs": 2445.818499999994
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.886Z",
            "id": 23674,
            "count": 3,
            "ms": 13.153500000014901
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.892Z",
            "id": 23675,
            "count": 3,
            "bytes": 313902,
            "remainingMs": 2426.252700000012
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.905Z",
            "id": 23675,
            "count": 3,
            "ms": 12.99740000005113
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.912Z",
            "id": 23676,
            "count": 3,
            "bytes": 313326,
            "remainingMs": 2406.6180999999633
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.926Z",
            "id": 23676,
            "count": 3,
            "ms": 13.72209999995539
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.932Z",
            "id": 23677,
            "count": 3,
            "bytes": 312589,
            "remainingMs": 2386.7676999999676
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.944Z",
            "id": 23677,
            "count": 3,
            "ms": 12.372299999988172
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.951Z",
            "id": 23678,
            "count": 3,
            "bytes": 311818,
            "remainingMs": 2367.9769000000088
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.963Z",
            "id": 23678,
            "count": 3,
            "ms": 12.473100000002887
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.971Z",
            "id": 23679,
            "count": 3,
            "bytes": 310663,
            "remainingMs": 2347.8165000000154
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.984Z",
            "id": 23679,
            "count": 3,
            "ms": 13.723400000017136
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:00.990Z",
            "id": 23680,
            "count": 3,
            "bytes": 308537,
            "remainingMs": 2328.437899999961
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:01.004Z",
            "id": 23680,
            "count": 3,
            "ms": 13.597399999969639
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:01.009Z",
            "id": 23681,
            "count": 3,
            "bytes": 305528,
            "remainingMs": 2309.3557000000146
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:01.023Z",
            "id": 23681,
            "count": 3,
            "ms": 13.806600000010803
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:01.027Z",
            "id": 23682,
            "count": 2,
            "bytes": 202884,
            "remainingMs": 2291.3634999999776
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:01.042Z",
            "id": 23682,
            "count": 2,
            "ms": 14.895900000003166
          },
          {
            "type": "request",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:01.053Z",
            "id": 23683,
            "count": 3,
            "bytes": 341617,
            "remainingMs": 2266.0438999999897
          },
          {
            "type": "response",
            "label": "p3-15-s1:step-1260",
            "at": "2026-11-02T03:46:01.068Z",
            "id": 23683,
            "count": 3,
            "ms": 15.690200000011828
          }
        ],
        "packMs": 8470.464099997542
      },
      "wallMs": 496108.4196,
      "latency": {
        "model": {
          "count": 762,
          "meanMs": 641.31068871391,
          "p95Ms": 1950.5659000000014,
          "maxMs": 2339.196299999996
        },
        "opponent": {
          "count": 500,
          "meanMs": 8.86041840000061,
          "p95Ms": 28.114199999999983,
          "maxMs": 342.38469999999506
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p3-15-s1\\p3-15-s1"
    },
    {
      "id": "p3-15-s2",
      "slot": 15,
      "seat": 2,
      "seed": 310015135,
      "opponent": "hard",
      "players": 3,
      "map": "(3) classic 2.aem",
      "category": "advantage_endgame",
      "modelPlayer": 3,
      "initialSha256": "e099bb95e6b770fda8004fcc2b8b6777fa14941e31d2a773d6b498d5aafb7f04",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 1,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 758,
          "ids": [
            3
          ],
          "averagePlace": 3,
          "normalizedRank": 0
        },
        {
          "step": 1323,
          "ids": [
            2
          ],
          "averagePlace": 2,
          "normalizedRank": 0.5
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": true,
      "steps": 1324,
      "rounds": 23,
      "roots": 66,
      "witnessCount": 16,
      "witnessActions": 367,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 5661,
        "observations": 18217,
        "completed": 5661,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 75379.72309999968,
        "peakBatchSize": 32,
        "bytes": 1987914053,
        "decisionRequests": 5659,
        "decisionObservations": 18184,
        "completedDecisionObservations": 18184,
        "decisionWireMs": 72787.19919999967,
        "decisionPeakBatchSize": 25,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p3-15-s2:step-680",
            "at": "2026-11-02T03:48:12.943Z",
            "id": 5630,
            "count": 2,
            "bytes": 223001,
            "remainingMs": 393.9962000000087
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-680",
            "at": "2026-11-02T03:48:12.954Z",
            "id": 5630,
            "count": 2,
            "ms": 10.830400000006193
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:13.802Z",
            "id": 5631,
            "count": 1,
            "bytes": 118625,
            "remainingMs": 2923.1946000000025
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:13.814Z",
            "id": 5631,
            "count": 1,
            "ms": 12.125599999999395
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:13.824Z",
            "id": 5632,
            "count": 5,
            "bytes": 590520,
            "remainingMs": 2901.951000000001
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:13.839Z",
            "id": 5632,
            "count": 5,
            "ms": 15.267899999991641
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:13.872Z",
            "id": 5633,
            "count": 13,
            "bytes": 1578482,
            "remainingMs": 2853.3796
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:13.895Z",
            "id": 5633,
            "count": 13,
            "ms": 23.04639999999199
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:13.905Z",
            "id": 5634,
            "count": 4,
            "bytes": 485336,
            "remainingMs": 2820.696000000011
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:13.918Z",
            "id": 5634,
            "count": 4,
            "ms": 13.26249999999709
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:13.946Z",
            "id": 5635,
            "count": 3,
            "bytes": 340318,
            "remainingMs": 2779.9580000000133
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:13.959Z",
            "id": 5635,
            "count": 3,
            "ms": 13.790400000012596
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:13.970Z",
            "id": 5636,
            "count": 4,
            "bytes": 483572,
            "remainingMs": 2755.2965000000113
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:13.987Z",
            "id": 5636,
            "count": 4,
            "ms": 16.999800000005052
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.014Z",
            "id": 5637,
            "count": 3,
            "bytes": 340318,
            "remainingMs": 2711.57640000002
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.029Z",
            "id": 5637,
            "count": 3,
            "ms": 15.209800000011455
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.038Z",
            "id": 5638,
            "count": 4,
            "bytes": 477291,
            "remainingMs": 2687.200299999997
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.054Z",
            "id": 5638,
            "count": 4,
            "ms": 15.641499999997905
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.082Z",
            "id": 5639,
            "count": 4,
            "bytes": 449147,
            "remainingMs": 2643.309200000018
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.102Z",
            "id": 5639,
            "count": 4,
            "ms": 19.99680000002263
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.110Z",
            "id": 5640,
            "count": 3,
            "bytes": 350000,
            "remainingMs": 2615.8179999999993
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.124Z",
            "id": 5640,
            "count": 3,
            "ms": 14.542599999986123
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.144Z",
            "id": 5641,
            "count": 2,
            "bytes": 217830,
            "remainingMs": 2581.065200000012
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.156Z",
            "id": 5641,
            "count": 2,
            "ms": 11.987300000007963
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.161Z",
            "id": 5642,
            "count": 2,
            "bytes": 228990,
            "remainingMs": 2564.5065999999933
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.177Z",
            "id": 5642,
            "count": 2,
            "ms": 15.58619999999064
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.188Z",
            "id": 5643,
            "count": 1,
            "bytes": 109001,
            "remainingMs": 2537.274800000014
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.199Z",
            "id": 5643,
            "count": 1,
            "ms": 10.643700000015087
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.203Z",
            "id": 5644,
            "count": 2,
            "bytes": 228286,
            "remainingMs": 2522.2232000000076
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.215Z",
            "id": 5644,
            "count": 2,
            "ms": 11.981100000004517
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.232Z",
            "id": 5645,
            "count": 4,
            "bytes": 486296,
            "remainingMs": 2493.233900000021
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.247Z",
            "id": 5645,
            "count": 4,
            "ms": 14.560100000002421
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.277Z",
            "id": 5646,
            "count": 4,
            "bytes": 453700,
            "remainingMs": 2448.650099999999
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.289Z",
            "id": 5646,
            "count": 4,
            "ms": 12.589699999982258
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.300Z",
            "id": 5647,
            "count": 4,
            "bytes": 484277,
            "remainingMs": 2425.2314999999944
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.314Z",
            "id": 5647,
            "count": 4,
            "ms": 13.272100000001956
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.342Z",
            "id": 5648,
            "count": 4,
            "bytes": 453733,
            "remainingMs": 2383.175099999993
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.356Z",
            "id": 5648,
            "count": 4,
            "ms": 13.506999999983236
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.366Z",
            "id": 5649,
            "count": 4,
            "bytes": 473634,
            "remainingMs": 2359.8197999999975
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.377Z",
            "id": 5649,
            "count": 4,
            "ms": 11.831500000000233
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.405Z",
            "id": 5650,
            "count": 4,
            "bytes": 444627,
            "remainingMs": 2320.6904000000213
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.417Z",
            "id": 5650,
            "count": 4,
            "ms": 12.00820000001113
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.426Z",
            "id": 5651,
            "count": 4,
            "bytes": 461808,
            "remainingMs": 2299.6738999999943
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.438Z",
            "id": 5651,
            "count": 4,
            "ms": 11.90639999997802
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.463Z",
            "id": 5652,
            "count": 4,
            "bytes": 435649,
            "remainingMs": 2262.790500000003
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.479Z",
            "id": 5652,
            "count": 4,
            "ms": 16.462100000004284
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.488Z",
            "id": 5653,
            "count": 4,
            "bytes": 450526,
            "remainingMs": 2237.568499999994
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.501Z",
            "id": 5653,
            "count": 4,
            "ms": 12.826399999990826
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.525Z",
            "id": 5654,
            "count": 4,
            "bytes": 426671,
            "remainingMs": 2200.686799999996
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.541Z",
            "id": 5654,
            "count": 4,
            "ms": 16.177899999980582
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.546Z",
            "id": 5655,
            "count": 2,
            "bytes": 211223,
            "remainingMs": 2179.851400000014
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.560Z",
            "id": 5655,
            "count": 2,
            "ms": 14.011900000012247
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.573Z",
            "id": 5656,
            "count": 2,
            "bytes": 200374,
            "remainingMs": 2152.1369000000122
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.587Z",
            "id": 5656,
            "count": 2,
            "ms": 13.857500000012806
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.592Z",
            "id": 5657,
            "count": 2,
            "bytes": 210455,
            "remainingMs": 2133.3803999999946
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.606Z",
            "id": 5657,
            "count": 2,
            "ms": 13.857099999993807
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.620Z",
            "id": 5658,
            "count": 2,
            "bytes": 200374,
            "remainingMs": 2105.2669999999925
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.634Z",
            "id": 5658,
            "count": 2,
            "ms": 13.729399999981979
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.638Z",
            "id": 5659,
            "count": 2,
            "bytes": 209783,
            "remainingMs": 2087.5054999999993
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.652Z",
            "id": 5659,
            "count": 2,
            "ms": 13.823999999993248
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.663Z",
            "id": 5660,
            "count": 2,
            "bytes": 200407,
            "remainingMs": 2062.2902999999933
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.674Z",
            "id": 5660,
            "count": 2,
            "ms": 10.806799999991199
          },
          {
            "type": "request",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.676Z",
            "id": 5661,
            "count": 1,
            "bytes": 103325,
            "remainingMs": 2049.151500000007
          },
          {
            "type": "response",
            "label": "p3-15-s2:step-741",
            "at": "2026-11-02T03:48:14.686Z",
            "id": 5661,
            "count": 1,
            "ms": 9.92840000000433
          }
        ],
        "packMs": 2354.2065999998194
      },
      "wallMs": 135355.8431,
      "latency": {
        "model": {
          "count": 135,
          "meanMs": 906.4506244444448,
          "p95Ms": 2535.9765999999945,
          "maxMs": 2773.5688999999984
        },
        "opponent": {
          "count": 1189,
          "meanMs": 8.533610260723838,
          "p95Ms": 32.17389999999432,
          "maxMs": 216.59090000001015
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p3-15-s2\\p3-15-s2"
    },
    {
      "id": "p4-16-s0",
      "slot": 16,
      "seat": 0,
      "seed": 310016144,
      "opponent": "hard",
      "players": 4,
      "map": "(4) Critical mass.aem",
      "category": "normal",
      "modelPlayer": 0,
      "initialSha256": "ed3a7dc2feb09559f84dc7d04e4af73639b7c68546865f3ea73e01af68f4f511",
      "firstToActPlayer": 0,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_loss",
      "winner": 3,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 6511,
          "ids": [
            0
          ],
          "averagePlace": 4,
          "normalizedRank": 0
        },
        {
          "step": 6622,
          "ids": [
            3
          ],
          "averagePlace": 3,
          "normalizedRank": 0.3333333333333333
        },
        {
          "step": 6735,
          "ids": [
            1
          ],
          "averagePlace": 2,
          "normalizedRank": 0.6666666666666666
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": true,
      "steps": 6736,
      "rounds": 119,
      "roots": 796,
      "witnessCount": 136,
      "witnessActions": 2231,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 68782,
        "observations": 217604,
        "completed": 68782,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 979091.740800018,
        "peakBatchSize": 32,
        "bytes": 21685786909,
        "decisionRequests": 68780,
        "decisionObservations": 217571,
        "completedDecisionObservations": 217571,
        "decisionWireMs": 976463.9367000179,
        "decisionPeakBatchSize": 32,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.722Z",
            "id": 68751,
            "count": 2,
            "bytes": 174368,
            "remainingMs": 2252.1119999999646
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.735Z",
            "id": 68751,
            "count": 2,
            "ms": 13.299400000134483
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.743Z",
            "id": 68752,
            "count": 3,
            "bytes": 281081,
            "remainingMs": 2231.214500000002
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.762Z",
            "id": 68752,
            "count": 3,
            "ms": 19.577400000067428
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.774Z",
            "id": 68753,
            "count": 2,
            "bytes": 174398,
            "remainingMs": 2200.214199999813
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.788Z",
            "id": 68753,
            "count": 2,
            "ms": 14.65209999983199
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.790Z",
            "id": 68754,
            "count": 1,
            "bytes": 87476,
            "remainingMs": 2183.7655999998096
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.808Z",
            "id": 68754,
            "count": 1,
            "ms": 17.691699999850243
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.816Z",
            "id": 68755,
            "count": 3,
            "bytes": 268638,
            "remainingMs": 2157.692199999932
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.831Z",
            "id": 68755,
            "count": 3,
            "ms": 14.410600000061095
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.841Z",
            "id": 68756,
            "count": 2,
            "bytes": 167794,
            "remainingMs": 2132.6634999997914
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.860Z",
            "id": 68756,
            "count": 2,
            "ms": 18.63539999979548
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.862Z",
            "id": 68757,
            "count": 1,
            "bytes": 87313,
            "remainingMs": 2111.8933999999426
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.872Z",
            "id": 68757,
            "count": 1,
            "ms": 10.5289000000339
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.879Z",
            "id": 68758,
            "count": 3,
            "bytes": 262893,
            "remainingMs": 2095.0500999998767
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.891Z",
            "id": 68758,
            "count": 3,
            "ms": 12.300000000046566
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.901Z",
            "id": 68759,
            "count": 2,
            "bytes": 170613,
            "remainingMs": 2072.935599999968
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.911Z",
            "id": 68759,
            "count": 2,
            "ms": 10.239500000141561
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.916Z",
            "id": 68760,
            "count": 3,
            "bytes": 258612,
            "remainingMs": 2057.369799999986
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.928Z",
            "id": 68760,
            "count": 3,
            "ms": 11.2793000000529
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.937Z",
            "id": 68761,
            "count": 2,
            "bytes": 160410,
            "remainingMs": 2037.2223999998532
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.948Z",
            "id": 68761,
            "count": 2,
            "ms": 11.824299999978393
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.954Z",
            "id": 68762,
            "count": 3,
            "bytes": 257780,
            "remainingMs": 2019.9540999999736
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.965Z",
            "id": 68762,
            "count": 3,
            "ms": 11.418599999975413
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.974Z",
            "id": 68763,
            "count": 3,
            "bytes": 243873,
            "remainingMs": 2000.0161999999546
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.986Z",
            "id": 68763,
            "count": 3,
            "ms": 12.54410000005737
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:03.991Z",
            "id": 68764,
            "count": 3,
            "bytes": 255905,
            "remainingMs": 1982.873399999924
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.003Z",
            "id": 68764,
            "count": 3,
            "ms": 12.169299999950454
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.012Z",
            "id": 68765,
            "count": 3,
            "bytes": 243889,
            "remainingMs": 1961.748999999836
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.024Z",
            "id": 68765,
            "count": 3,
            "ms": 11.471399999922141
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.028Z",
            "id": 68766,
            "count": 3,
            "bytes": 253991,
            "remainingMs": 1945.593699999852
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.040Z",
            "id": 68766,
            "count": 3,
            "ms": 11.84429999999702
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.050Z",
            "id": 68767,
            "count": 3,
            "bytes": 243799,
            "remainingMs": 1924.1313999998383
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.062Z",
            "id": 68767,
            "count": 3,
            "ms": 12.103499999968335
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.066Z",
            "id": 68768,
            "count": 3,
            "bytes": 248247,
            "remainingMs": 1907.6135999998078
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.078Z",
            "id": 68768,
            "count": 3,
            "ms": 11.720800000010058
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.087Z",
            "id": 68769,
            "count": 3,
            "bytes": 235452,
            "remainingMs": 1886.5501999999397
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.101Z",
            "id": 68769,
            "count": 3,
            "ms": 13.430399999953806
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.110Z",
            "id": 68770,
            "count": 3,
            "bytes": 232313,
            "remainingMs": 1864.1303999999072
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.126Z",
            "id": 68770,
            "count": 3,
            "ms": 15.856099999975413
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.134Z",
            "id": 68771,
            "count": 3,
            "bytes": 231184,
            "remainingMs": 1839.8371999999508
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.148Z",
            "id": 68771,
            "count": 3,
            "ms": 14.496200000168756
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.158Z",
            "id": 68772,
            "count": 3,
            "bytes": 243404,
            "remainingMs": 1815.749899999937
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.171Z",
            "id": 68772,
            "count": 3,
            "ms": 13.160600000061095
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.177Z",
            "id": 68773,
            "count": 3,
            "bytes": 241243,
            "remainingMs": 1796.9438999998383
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.195Z",
            "id": 68773,
            "count": 3,
            "ms": 18.199299999978393
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.203Z",
            "id": 68774,
            "count": 3,
            "bytes": 252484,
            "remainingMs": 1770.8800999999512
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.220Z",
            "id": 68774,
            "count": 3,
            "ms": 16.683700000168756
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.226Z",
            "id": 68775,
            "count": 3,
            "bytes": 254103,
            "remainingMs": 1748.274899999844
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.244Z",
            "id": 68775,
            "count": 3,
            "ms": 18.312699999893084
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.253Z",
            "id": 68776,
            "count": 3,
            "bytes": 250893,
            "remainingMs": 1720.9893999998458
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.268Z",
            "id": 68776,
            "count": 3,
            "ms": 14.770099999848753
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.271Z",
            "id": 68777,
            "count": 2,
            "bytes": 170905,
            "remainingMs": 1702.5374999998603
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.284Z",
            "id": 68777,
            "count": 2,
            "ms": 12.389699999941513
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.291Z",
            "id": 68778,
            "count": 2,
            "bytes": 179989,
            "remainingMs": 1682.8286999999546
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.309Z",
            "id": 68778,
            "count": 2,
            "ms": 18.06610000017099
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.315Z",
            "id": 68779,
            "count": 2,
            "bytes": 178088,
            "remainingMs": 1658.7921999997925
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.329Z",
            "id": 68779,
            "count": 2,
            "ms": 13.636999999871477
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.331Z",
            "id": 68780,
            "count": 1,
            "bytes": 91000,
            "remainingMs": 1643.1897999998182
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.341Z",
            "id": 68780,
            "count": 1,
            "ms": 10.440899999812245
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.343Z",
            "id": 68781,
            "count": 1,
            "bytes": 95075,
            "remainingMs": 1630.8197999999393
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.355Z",
            "id": 68781,
            "count": 1,
            "ms": 11.664099999936298
          },
          {
            "type": "request",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.359Z",
            "id": 68782,
            "count": 3,
            "bytes": 258485,
            "remainingMs": 1614.6439999998547
          },
          {
            "type": "response",
            "label": "p4-16-s0:step-6453",
            "at": "2026-11-01T18:41:04.371Z",
            "id": 68782,
            "count": 3,
            "ms": 12.262399999890476
          }
        ],
        "packMs": 27842.178200003633
      },
      "wallMs": 1883621.6859,
      "latency": {
        "model": {
          "count": 1546,
          "meanMs": 1074.7592877749044,
          "p95Ms": 2715.9486000000034,
          "maxMs": 2924.4554000000935
        },
        "opponent": {
          "count": 5190,
          "meanMs": 39.67919637765058,
          "p95Ms": 139.19449999998324,
          "maxMs": 4727.777199999895
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p4-16-s0\\p4-16-s0"
    },
    {
      "id": "p4-16-s1",
      "slot": 16,
      "seat": 1,
      "seed": 310016144,
      "opponent": "hard",
      "players": 4,
      "map": "(4) Critical mass.aem",
      "category": "normal",
      "modelPlayer": 1,
      "initialSha256": "ed3a7dc2feb09559f84dc7d04e4af73639b7c68546865f3ea73e01af68f4f511",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_win",
      "winner": 2,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 2488,
          "ids": [
            0
          ],
          "averagePlace": 4,
          "normalizedRank": 0
        },
        {
          "step": 2584,
          "ids": [
            3
          ],
          "averagePlace": 3,
          "normalizedRank": 0.3333333333333333
        },
        {
          "step": 2697,
          "ids": [
            2
          ],
          "averagePlace": 2,
          "normalizedRank": 0.6666666666666666
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 2698,
      "rounds": 47,
      "roots": 695,
      "witnessCount": 117,
      "witnessActions": 2030,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 54354,
        "observations": 173686,
        "completed": 54354,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 676669.9753000014,
        "peakBatchSize": 32,
        "bytes": 17278996493,
        "decisionRequests": 54352,
        "decisionObservations": 173653,
        "completedDecisionObservations": 173653,
        "decisionWireMs": 673962.3497000014,
        "decisionPeakBatchSize": 31,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p4-16-s1:step-2694",
            "at": "2026-11-01T19:01:13.694Z",
            "id": 54323,
            "count": 1,
            "bytes": 122261,
            "remainingMs": 2396.8633000000846
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2694",
            "at": "2026-11-01T19:01:13.704Z",
            "id": 54323,
            "count": 1,
            "ms": 9.780100000090897
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.714Z",
            "id": 54324,
            "count": 1,
            "bytes": 123382,
            "remainingMs": 2922.458299999824
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.727Z",
            "id": 54324,
            "count": 1,
            "ms": 12.499899999937043
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.732Z",
            "id": 54325,
            "count": 1,
            "bytes": 107423,
            "remainingMs": 2904.6313999998383
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.742Z",
            "id": 54325,
            "count": 1,
            "ms": 9.689799999818206
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.755Z",
            "id": 54326,
            "count": 4,
            "bytes": 490160,
            "remainingMs": 2882.159299999941
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.767Z",
            "id": 54326,
            "count": 4,
            "ms": 12.237399999983609
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.773Z",
            "id": 54327,
            "count": 3,
            "bytes": 368231,
            "remainingMs": 2863.469099999871
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.785Z",
            "id": 54327,
            "count": 3,
            "ms": 11.670299999881536
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.796Z",
            "id": 54328,
            "count": 3,
            "bytes": 364295,
            "remainingMs": 2840.9151999999303
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.807Z",
            "id": 54328,
            "count": 3,
            "ms": 11.412500000093132
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.818Z",
            "id": 54329,
            "count": 3,
            "bytes": 362439,
            "remainingMs": 2818.8834999999963
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.830Z",
            "id": 54329,
            "count": 3,
            "ms": 11.65500000002794
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.840Z",
            "id": 54330,
            "count": 3,
            "bytes": 360615,
            "remainingMs": 2797.053399999859
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.853Z",
            "id": 54330,
            "count": 3,
            "ms": 12.85219999984838
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.863Z",
            "id": 54331,
            "count": 3,
            "bytes": 359591,
            "remainingMs": 2774.2567999998573
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.875Z",
            "id": 54331,
            "count": 3,
            "ms": 11.782399999909103
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.884Z",
            "id": 54332,
            "count": 3,
            "bytes": 357927,
            "remainingMs": 2752.7892999998294
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.897Z",
            "id": 54332,
            "count": 3,
            "ms": 12.73119999980554
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.907Z",
            "id": 54333,
            "count": 3,
            "bytes": 355559,
            "remainingMs": 2730.093299999833
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.918Z",
            "id": 54333,
            "count": 3,
            "ms": 11.272799999918789
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.927Z",
            "id": 54334,
            "count": 3,
            "bytes": 353415,
            "remainingMs": 2709.5440999998245
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.940Z",
            "id": 54334,
            "count": 3,
            "ms": 12.612299999920651
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.949Z",
            "id": 54335,
            "count": 3,
            "bytes": 351047,
            "remainingMs": 2687.5116999999154
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.961Z",
            "id": 54335,
            "count": 3,
            "ms": 11.263800000073388
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.969Z",
            "id": 54336,
            "count": 3,
            "bytes": 348679,
            "remainingMs": 2667.6058000000194
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.982Z",
            "id": 54336,
            "count": 3,
            "ms": 12.197400000179186
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:13.990Z",
            "id": 54337,
            "count": 3,
            "bytes": 345893,
            "remainingMs": 2647.34039999987
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.002Z",
            "id": 54337,
            "count": 3,
            "ms": 12.582399999955669
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.011Z",
            "id": 54338,
            "count": 3,
            "bytes": 342916,
            "remainingMs": 2626.41240000003
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.022Z",
            "id": 54338,
            "count": 3,
            "ms": 11.303700000047684
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.029Z",
            "id": 54339,
            "count": 3,
            "bytes": 340964,
            "remainingMs": 2607.5693999999203
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.041Z",
            "id": 54339,
            "count": 3,
            "ms": 11.159900000086054
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.048Z",
            "id": 54340,
            "count": 3,
            "bytes": 340516,
            "remainingMs": 2589.149800000014
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.059Z",
            "id": 54340,
            "count": 3,
            "ms": 11.571400000015274
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.066Z",
            "id": 54341,
            "count": 3,
            "bytes": 339620,
            "remainingMs": 2570.929599999916
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.079Z",
            "id": 54341,
            "count": 3,
            "ms": 13.071400000015274
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.086Z",
            "id": 54342,
            "count": 3,
            "bytes": 338468,
            "remainingMs": 2550.961899999995
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.099Z",
            "id": 54342,
            "count": 3,
            "ms": 13.049000000115484
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.106Z",
            "id": 54343,
            "count": 3,
            "bytes": 336164,
            "remainingMs": 2530.842599999858
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.118Z",
            "id": 54343,
            "count": 3,
            "ms": 11.675700000021607
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.124Z",
            "id": 54344,
            "count": 3,
            "bytes": 334371,
            "remainingMs": 2512.6145999999717
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.138Z",
            "id": 54344,
            "count": 3,
            "ms": 13.668899999931455
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.144Z",
            "id": 54345,
            "count": 3,
            "bytes": 333376,
            "remainingMs": 2492.811999999918
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.156Z",
            "id": 54345,
            "count": 3,
            "ms": 12.145999999949709
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.162Z",
            "id": 54346,
            "count": 3,
            "bytes": 331550,
            "remainingMs": 2474.942700000014
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.174Z",
            "id": 54346,
            "count": 3,
            "ms": 12.183399999979883
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.180Z",
            "id": 54347,
            "count": 3,
            "bytes": 329720,
            "remainingMs": 2456.7268999998923
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.193Z",
            "id": 54347,
            "count": 3,
            "ms": 12.465799999888986
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.198Z",
            "id": 54348,
            "count": 3,
            "bytes": 328632,
            "remainingMs": 2438.7271999998484
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.210Z",
            "id": 54348,
            "count": 3,
            "ms": 11.321699999971315
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.214Z",
            "id": 54349,
            "count": 3,
            "bytes": 328088,
            "remainingMs": 2422.471299999859
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.225Z",
            "id": 54349,
            "count": 3,
            "ms": 10.765999999828637
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.231Z",
            "id": 54350,
            "count": 3,
            "bytes": 327063,
            "remainingMs": 2406.437199999811
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.241Z",
            "id": 54350,
            "count": 3,
            "ms": 10.774799999780953
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.246Z",
            "id": 54351,
            "count": 3,
            "bytes": 325942,
            "remainingMs": 2390.463899999857
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.260Z",
            "id": 54351,
            "count": 3,
            "ms": 13.680199999827892
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.266Z",
            "id": 54352,
            "count": 3,
            "bytes": 324147,
            "remainingMs": 2371.2368999999017
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.277Z",
            "id": 54352,
            "count": 3,
            "ms": 11.244100000010803
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.281Z",
            "id": 54353,
            "count": 3,
            "bytes": 322957,
            "remainingMs": 2355.461899999995
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.294Z",
            "id": 54353,
            "count": 3,
            "ms": 12.978100000182167
          },
          {
            "type": "request",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.306Z",
            "id": 54354,
            "count": 3,
            "bytes": 371178,
            "remainingMs": 2331.439499999862
          },
          {
            "type": "response",
            "label": "p4-16-s1:step-2696",
            "at": "2026-11-01T19:01:14.317Z",
            "id": 54354,
            "count": 3,
            "ms": 11.026599999982864
          }
        ],
        "packMs": 21365.9483999807
      },
      "wallMs": 1203629.9336,
      "latency": {
        "model": {
          "count": 1363,
          "meanMs": 846.0630325751994,
          "p95Ms": 2547.4532000000036,
          "maxMs": 2918.273899999913
        },
        "opponent": {
          "count": 1335,
          "meanMs": 32.82207917602982,
          "p95Ms": 120.92530000000261,
          "maxMs": 1930.7915999999968
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p4-16-s1\\p4-16-s1"
    },
    {
      "id": "p4-16-s2",
      "slot": 16,
      "seat": 2,
      "seed": 310016144,
      "opponent": "hard",
      "players": 4,
      "map": "(4) Critical mass.aem",
      "category": "normal",
      "modelPlayer": 2,
      "initialSha256": "ed3a7dc2feb09559f84dc7d04e4af73639b7c68546865f3ea73e01af68f4f511",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 2,
      "firstPlace": 0,
      "normalizedRank": 0.6666666666666666,
      "eliminations": [
        {
          "step": 7626,
          "ids": [
            0
          ],
          "averagePlace": 4,
          "normalizedRank": 0
        },
        {
          "step": 7713,
          "ids": [
            3
          ],
          "averagePlace": 3,
          "normalizedRank": 0.3333333333333333
        },
        {
          "step": 7841,
          "ids": [
            2
          ],
          "averagePlace": 2,
          "normalizedRank": 0.6666666666666666
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 7842,
      "rounds": 139,
      "roots": 442,
      "witnessCount": 71,
      "witnessActions": 1081,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 39277,
        "observations": 126261,
        "completed": 39277,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 499196.6659000105,
        "peakBatchSize": 32,
        "bytes": 12570171315,
        "decisionRequests": 39275,
        "decisionObservations": 126228,
        "completedDecisionObservations": 126228,
        "decisionWireMs": 496578.0615000105,
        "decisionPeakBatchSize": 28,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:38.874Z",
            "id": 39246,
            "count": 1,
            "bytes": 76677,
            "remainingMs": 2923.438599999994
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:38.887Z",
            "id": 39246,
            "count": 1,
            "ms": 13.653500000014901
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:38.893Z",
            "id": 39247,
            "count": 3,
            "bytes": 241575,
            "remainingMs": 2904.02649999992
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:38.906Z",
            "id": 39247,
            "count": 3,
            "ms": 13.029399999883026
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:38.913Z",
            "id": 39248,
            "count": 3,
            "bytes": 239994,
            "remainingMs": 2884.5555000000168
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:38.924Z",
            "id": 39248,
            "count": 3,
            "ms": 11.436900000087917
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:38.952Z",
            "id": 39249,
            "count": 9,
            "bytes": 900364,
            "remainingMs": 2844.7745000000577
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:38.970Z",
            "id": 39249,
            "count": 9,
            "ms": 17.824900000123307
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:38.979Z",
            "id": 39250,
            "count": 3,
            "bytes": 300676,
            "remainingMs": 2818.0153000000864
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:38.996Z",
            "id": 39250,
            "count": 3,
            "ms": 16.75800000014715
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.011Z",
            "id": 39251,
            "count": 3,
            "bytes": 299620,
            "remainingMs": 2786.476100000087
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.024Z",
            "id": 39251,
            "count": 3,
            "ms": 13.089099999982864
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.030Z",
            "id": 39252,
            "count": 3,
            "bytes": 250327,
            "remainingMs": 2766.773999999976
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.044Z",
            "id": 39252,
            "count": 3,
            "ms": 13.902299999957904
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.054Z",
            "id": 39253,
            "count": 3,
            "bytes": 308957,
            "remainingMs": 2743.152100000065
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.066Z",
            "id": 39253,
            "count": 3,
            "ms": 11.899399999994785
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.072Z",
            "id": 39254,
            "count": 3,
            "bytes": 261325,
            "remainingMs": 2725.252000000095
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.086Z",
            "id": 39254,
            "count": 3,
            "ms": 14.215000000083819
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.095Z",
            "id": 39255,
            "count": 3,
            "bytes": 307325,
            "remainingMs": 2702.2319000000134
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.109Z",
            "id": 39255,
            "count": 3,
            "ms": 13.745600000023842
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.119Z",
            "id": 39256,
            "count": 3,
            "bytes": 305532,
            "remainingMs": 2677.937399999937
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.130Z",
            "id": 39256,
            "count": 3,
            "ms": 10.957599999848753
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.135Z",
            "id": 39257,
            "count": 2,
            "bytes": 174270,
            "remainingMs": 2661.867499999935
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.146Z",
            "id": 39257,
            "count": 2,
            "ms": 10.64379999996163
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.157Z",
            "id": 39258,
            "count": 3,
            "bytes": 300083,
            "remainingMs": 2640.398899999913
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.169Z",
            "id": 39258,
            "count": 3,
            "ms": 12.367499999934807
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.179Z",
            "id": 39259,
            "count": 3,
            "bytes": 298579,
            "remainingMs": 2618.124899999937
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.191Z",
            "id": 39259,
            "count": 3,
            "ms": 11.752099999925122
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.201Z",
            "id": 39260,
            "count": 3,
            "bytes": 295763,
            "remainingMs": 2596.5471999999136
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.213Z",
            "id": 39260,
            "count": 3,
            "ms": 11.94359999988228
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.224Z",
            "id": 39261,
            "count": 3,
            "bytes": 294227,
            "remainingMs": 2573.5127999999095
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.236Z",
            "id": 39261,
            "count": 3,
            "ms": 12.178599999984726
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.246Z",
            "id": 39262,
            "count": 3,
            "bytes": 291827,
            "remainingMs": 2551.2970000000205
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.257Z",
            "id": 39262,
            "count": 3,
            "ms": 11.17809999990277
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.267Z",
            "id": 39263,
            "count": 3,
            "bytes": 288563,
            "remainingMs": 2529.930799999973
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.281Z",
            "id": 39263,
            "count": 3,
            "ms": 14.17160000000149
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.289Z",
            "id": 39264,
            "count": 3,
            "bytes": 283859,
            "remainingMs": 2508.091599999927
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.301Z",
            "id": 39264,
            "count": 3,
            "ms": 12.285199999809265
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.309Z",
            "id": 39265,
            "count": 3,
            "bytes": 275136,
            "remainingMs": 2488.3896000001114
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.320Z",
            "id": 39265,
            "count": 3,
            "ms": 11.63620000006631
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.328Z",
            "id": 39266,
            "count": 3,
            "bytes": 273024,
            "remainingMs": 2468.662800000049
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.343Z",
            "id": 39266,
            "count": 3,
            "ms": 14.813499999931082
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.351Z",
            "id": 39267,
            "count": 3,
            "bytes": 271438,
            "remainingMs": 2446.438499999931
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.364Z",
            "id": 39267,
            "count": 3,
            "ms": 13.20449999999255
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.371Z",
            "id": 39268,
            "count": 3,
            "bytes": 268078,
            "remainingMs": 2426.277999999933
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.387Z",
            "id": 39268,
            "count": 3,
            "ms": 16.165199999930337
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.394Z",
            "id": 39269,
            "count": 3,
            "bytes": 266766,
            "remainingMs": 2403.059899999993
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.408Z",
            "id": 39269,
            "count": 3,
            "ms": 14.083199999993667
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.414Z",
            "id": 39270,
            "count": 3,
            "bytes": 262957,
            "remainingMs": 2383.067000000039
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.426Z",
            "id": 39270,
            "count": 3,
            "ms": 11.543199999956414
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.431Z",
            "id": 39271,
            "count": 3,
            "bytes": 259912,
            "remainingMs": 2366.11819999991
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.444Z",
            "id": 39271,
            "count": 3,
            "ms": 12.883399999933317
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.449Z",
            "id": 39272,
            "count": 3,
            "bytes": 257410,
            "remainingMs": 2348.1149999999907
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.462Z",
            "id": 39272,
            "count": 3,
            "ms": 12.822099999990314
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.464Z",
            "id": 39273,
            "count": 1,
            "bytes": 83549,
            "remainingMs": 2332.999700000044
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.473Z",
            "id": 39273,
            "count": 1,
            "ms": 9.256300000008196
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.477Z",
            "id": 39274,
            "count": 3,
            "bytes": 255466,
            "remainingMs": 2319.78190000006
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.489Z",
            "id": 39274,
            "count": 3,
            "ms": 11.939000000013039
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.494Z",
            "id": 39275,
            "count": 3,
            "bytes": 254631,
            "remainingMs": 2302.9769999999553
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.505Z",
            "id": 39275,
            "count": 3,
            "ms": 11.273300000000745
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.510Z",
            "id": 39276,
            "count": 3,
            "bytes": 252742,
            "remainingMs": 2287.156500000041
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.523Z",
            "id": 39276,
            "count": 3,
            "ms": 13.114400000078604
          },
          {
            "type": "request",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.534Z",
            "id": 39277,
            "count": 3,
            "bytes": 304644,
            "remainingMs": 2263.091299999971
          },
          {
            "type": "response",
            "label": "p4-16-s2:step-7708",
            "at": "2026-11-01T19:20:39.548Z",
            "id": 39277,
            "count": 3,
            "ms": 14.021500000031665
          }
        ],
        "packMs": 15321.561699991202
      },
      "wallMs": 1162483.9191,
      "latency": {
        "model": {
          "count": 923,
          "meanMs": 951.264862621885,
          "p95Ms": 2738.565799999982,
          "maxMs": 2888.6281000000017
        },
        "opponent": {
          "count": 6919,
          "meanMs": 38.68491913571278,
          "p95Ms": 125.33389999996871,
          "maxMs": 3938.49729999993
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p4-16-s2\\p4-16-s2"
    },
    {
      "id": "p4-16-s3",
      "slot": 16,
      "seat": 3,
      "seed": 310016144,
      "opponent": "hard",
      "players": 4,
      "map": "(4) Critical mass.aem",
      "category": "normal",
      "modelPlayer": 3,
      "initialSha256": "ed3a7dc2feb09559f84dc7d04e4af73639b7c68546865f3ea73e01af68f4f511",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 1,
      "firstPlace": 0,
      "normalizedRank": 0.6666666666666666,
      "eliminations": [
        {
          "step": 1771,
          "ids": [
            2
          ],
          "averagePlace": 4,
          "normalizedRank": 0
        },
        {
          "step": 1862,
          "ids": [
            1
          ],
          "averagePlace": 3,
          "normalizedRank": 0.3333333333333333
        },
        {
          "step": 2022,
          "ids": [
            3
          ],
          "averagePlace": 2,
          "normalizedRank": 0.6666666666666666
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 2023,
      "rounds": 35,
      "roots": 99,
      "witnessCount": 19,
      "witnessActions": 285,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 7954,
        "observations": 24259,
        "completed": 7954,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 103796.5942000002,
        "peakBatchSize": 34,
        "bytes": 2522447704,
        "decisionRequests": 7952,
        "decisionObservations": 24226,
        "completedDecisionObservations": 24226,
        "decisionWireMs": 101272.15830000018,
        "decisionPeakBatchSize": 34,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.249Z",
            "id": 7923,
            "count": 1,
            "bytes": 116443,
            "remainingMs": 2772.7296000000206
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.258Z",
            "id": 7923,
            "count": 1,
            "ms": 9.773400000005495
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.265Z",
            "id": 7924,
            "count": 2,
            "bytes": 254353,
            "remainingMs": 2756.6970000000147
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.277Z",
            "id": 7924,
            "count": 2,
            "ms": 12.063800000003539
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.279Z",
            "id": 7925,
            "count": 1,
            "bytes": 111890,
            "remainingMs": 2742.0807000000204
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.290Z",
            "id": 7925,
            "count": 1,
            "ms": 10.551999999996042
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.295Z",
            "id": 7926,
            "count": 2,
            "bytes": 253825,
            "remainingMs": 2725.7854000000225
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.307Z",
            "id": 7926,
            "count": 2,
            "ms": 11.36490000001504
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.310Z",
            "id": 7927,
            "count": 1,
            "bytes": 116443,
            "remainingMs": 2711.6019000000088
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.320Z",
            "id": 7927,
            "count": 1,
            "ms": 10.081799999985378
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.325Z",
            "id": 7928,
            "count": 2,
            "bytes": 253073,
            "remainingMs": 2696.0742000000027
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.339Z",
            "id": 7928,
            "count": 2,
            "ms": 13.49210000000312
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.346Z",
            "id": 7929,
            "count": 2,
            "bytes": 251921,
            "remainingMs": 2675.342900000018
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.357Z",
            "id": 7929,
            "count": 2,
            "ms": 10.839500000001863
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.364Z",
            "id": 7930,
            "count": 2,
            "bytes": 251025,
            "remainingMs": 2657.1924
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.376Z",
            "id": 7930,
            "count": 2,
            "ms": 11.508199999982025
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.382Z",
            "id": 7931,
            "count": 2,
            "bytes": 248785,
            "remainingMs": 2639.043400000024
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.395Z",
            "id": 7931,
            "count": 2,
            "ms": 12.299700000003213
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.401Z",
            "id": 7932,
            "count": 2,
            "bytes": 247537,
            "remainingMs": 2619.904200000019
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.414Z",
            "id": 7932,
            "count": 2,
            "ms": 12.184399999998277
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.420Z",
            "id": 7933,
            "count": 2,
            "bytes": 246801,
            "remainingMs": 2601.216400000005
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.432Z",
            "id": 7933,
            "count": 2,
            "ms": 12.268299999996088
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.438Z",
            "id": 7934,
            "count": 2,
            "bytes": 245329,
            "remainingMs": 2583.174700000003
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.449Z",
            "id": 7934,
            "count": 2,
            "ms": 11.147199999977602
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.455Z",
            "id": 7935,
            "count": 2,
            "bytes": 245617,
            "remainingMs": 2565.8403000000108
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.468Z",
            "id": 7935,
            "count": 2,
            "ms": 12.370699999999488
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.473Z",
            "id": 7936,
            "count": 2,
            "bytes": 244497,
            "remainingMs": 2548.034900000028
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.485Z",
            "id": 7936,
            "count": 2,
            "ms": 11.981200000009267
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.491Z",
            "id": 7937,
            "count": 2,
            "bytes": 244784,
            "remainingMs": 2530.269500000024
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.502Z",
            "id": 7937,
            "count": 2,
            "ms": 11.007299999997485
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.507Z",
            "id": 7938,
            "count": 2,
            "bytes": 244112,
            "remainingMs": 2514.2760000000126
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.519Z",
            "id": 7938,
            "count": 2,
            "ms": 12.077499999984866
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.524Z",
            "id": 7939,
            "count": 2,
            "bytes": 243056,
            "remainingMs": 2496.9453000000212
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.536Z",
            "id": 7939,
            "count": 2,
            "ms": 11.557700000004843
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.541Z",
            "id": 7940,
            "count": 2,
            "bytes": 242800,
            "remainingMs": 2480.6637000000046
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.552Z",
            "id": 7940,
            "count": 2,
            "ms": 11.04079999998794
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.557Z",
            "id": 7941,
            "count": 2,
            "bytes": 241975,
            "remainingMs": 2464.131800000003
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.570Z",
            "id": 7941,
            "count": 2,
            "ms": 13.292199999996228
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.575Z",
            "id": 7942,
            "count": 2,
            "bytes": 241463,
            "remainingMs": 2446.231599999999
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.589Z",
            "id": 7942,
            "count": 2,
            "ms": 13.489499999996042
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.593Z",
            "id": 7943,
            "count": 2,
            "bytes": 240823,
            "remainingMs": 2428.054700000008
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.604Z",
            "id": 7943,
            "count": 2,
            "ms": 10.49220000000787
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.608Z",
            "id": 7944,
            "count": 2,
            "bytes": 239607,
            "remainingMs": 2413.0152000000235
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.621Z",
            "id": 7944,
            "count": 2,
            "ms": 13.080900000000838
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.626Z",
            "id": 7945,
            "count": 2,
            "bytes": 238647,
            "remainingMs": 2395.459300000017
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.639Z",
            "id": 7945,
            "count": 2,
            "ms": 13.408900000009453
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.644Z",
            "id": 7946,
            "count": 2,
            "bytes": 237815,
            "remainingMs": 2377.700700000016
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.655Z",
            "id": 7946,
            "count": 2,
            "ms": 11.713799999997718
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.660Z",
            "id": 7947,
            "count": 2,
            "bytes": 237239,
            "remainingMs": 2361.675100000022
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.673Z",
            "id": 7947,
            "count": 2,
            "ms": 12.989200000010896
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.677Z",
            "id": 7948,
            "count": 2,
            "bytes": 235381,
            "remainingMs": 2343.9766000000236
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.688Z",
            "id": 7948,
            "count": 2,
            "ms": 10.931400000001304
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.692Z",
            "id": 7949,
            "count": 2,
            "bytes": 233970,
            "remainingMs": 2328.972700000013
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.705Z",
            "id": 7949,
            "count": 2,
            "ms": 12.809500000003027
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.709Z",
            "id": 7950,
            "count": 2,
            "bytes": 233231,
            "remainingMs": 2312.1465000000026
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.721Z",
            "id": 7950,
            "count": 2,
            "ms": 11.669099999999162
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.725Z",
            "id": 7951,
            "count": 2,
            "bytes": 232335,
            "remainingMs": 2296.097700000013
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.738Z",
            "id": 7951,
            "count": 2,
            "ms": 12.777700000006007
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.742Z",
            "id": 7952,
            "count": 2,
            "bytes": 230509,
            "remainingMs": 2279.606599999999
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.752Z",
            "id": 7952,
            "count": 2,
            "ms": 10.839799999987008
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.755Z",
            "id": 7953,
            "count": 1,
            "bytes": 116992,
            "remainingMs": 2266.4849000000104
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.765Z",
            "id": 7953,
            "count": 1,
            "ms": 10.444499999983236
          },
          {
            "type": "request",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.772Z",
            "id": 7954,
            "count": 2,
            "bytes": 258905,
            "remainingMs": 2248.8276000000187
          },
          {
            "type": "response",
            "label": "p4-16-s3:step-1968",
            "at": "2026-11-02T03:52:30.785Z",
            "id": 7954,
            "count": 2,
            "ms": 12.53200000000652
          }
        ],
        "packMs": 3026.396199999477
      },
      "wallMs": 243163.2109,
      "latency": {
        "model": {
          "count": 202,
          "meanMs": 867.678483168317,
          "p95Ms": 2692.633399999999,
          "maxMs": 2850.9695000000065
        },
        "opponent": {
          "count": 1821,
          "meanMs": 35.01266699615572,
          "p95Ms": 118.04939999998896,
          "maxMs": 4169.697999999975
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p4-16-s3\\p4-16-s3"
    },
    {
      "id": "p4-17-s0",
      "slot": 17,
      "seat": 0,
      "seed": 310017153,
      "opponent": "hard",
      "players": 4,
      "map": "(4) Shadowlands.aem",
      "category": "preset_units",
      "modelPlayer": 0,
      "initialSha256": "6182825a63ec499e628350b9e2ef1801099c741bc890bb97414676bdb57c7c7e",
      "firstToActPlayer": 0,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_win",
      "winner": 1,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 2191,
          "ids": [
            2
          ],
          "averagePlace": 4,
          "normalizedRank": 0
        },
        {
          "step": 2257,
          "ids": [
            1
          ],
          "averagePlace": 3,
          "normalizedRank": 0.3333333333333333
        },
        {
          "step": 2442,
          "ids": [
            3
          ],
          "averagePlace": 2,
          "normalizedRank": 0.6666666666666666
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 2443,
      "rounds": 29,
      "roots": 512,
      "witnessCount": 79,
      "witnessActions": 1092,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 31756,
        "observations": 104448,
        "completed": 31756,
        "lateResponses": 1,
        "softDeadlines": 1,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 464848.95910000236,
        "peakBatchSize": 34,
        "bytes": 25186750013,
        "decisionRequests": 31754,
        "decisionObservations": 104415,
        "completedDecisionObservations": 104415,
        "decisionWireMs": 462306.4487000024,
        "decisionPeakBatchSize": 34,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:18.756Z",
            "id": 31725,
            "count": 3,
            "bytes": 584763,
            "remainingMs": 2770.275799999945
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:18.771Z",
            "id": 31725,
            "count": 3,
            "ms": 14.408400000073016
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:18.789Z",
            "id": 31726,
            "count": 3,
            "bytes": 582939,
            "remainingMs": 2737.719299999997
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:18.802Z",
            "id": 31726,
            "count": 3,
            "ms": 13.061699999962002
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:18.819Z",
            "id": 31727,
            "count": 3,
            "bytes": 581147,
            "remainingMs": 2707.5759999998845
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:18.832Z",
            "id": 31727,
            "count": 3,
            "ms": 12.544999999925494
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:18.849Z",
            "id": 31728,
            "count": 3,
            "bytes": 579227,
            "remainingMs": 2677.8341999999247
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:18.862Z",
            "id": 31728,
            "count": 3,
            "ms": 13.395000000018626
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:18.881Z",
            "id": 31729,
            "count": 3,
            "bytes": 577531,
            "remainingMs": 2645.587999999989
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:18.894Z",
            "id": 31729,
            "count": 3,
            "ms": 12.547100000083447
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:18.912Z",
            "id": 31730,
            "count": 3,
            "bytes": 574331,
            "remainingMs": 2615.194200000027
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:18.926Z",
            "id": 31730,
            "count": 3,
            "ms": 14.654900000197813
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:18.943Z",
            "id": 31731,
            "count": 3,
            "bytes": 567451,
            "remainingMs": 2584.1769999999087
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:18.956Z",
            "id": 31731,
            "count": 3,
            "ms": 13.275099999969825
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:18.973Z",
            "id": 31732,
            "count": 3,
            "bytes": 561755,
            "remainingMs": 2553.2950999999885
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:18.987Z",
            "id": 31732,
            "count": 3,
            "ms": 13.43170000007376
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.001Z",
            "id": 31733,
            "count": 3,
            "bytes": 559098,
            "remainingMs": 2525.530999999959
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.015Z",
            "id": 31733,
            "count": 3,
            "ms": 14.09539999999106
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.029Z",
            "id": 31734,
            "count": 3,
            "bytes": 554808,
            "remainingMs": 2497.909999999916
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.046Z",
            "id": 31734,
            "count": 3,
            "ms": 17.09210000000894
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.062Z",
            "id": 31735,
            "count": 3,
            "bytes": 550840,
            "remainingMs": 2464.934200000018
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.074Z",
            "id": 31735,
            "count": 3,
            "ms": 12.553000000072643
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.088Z",
            "id": 31736,
            "count": 3,
            "bytes": 550040,
            "remainingMs": 2438.850300000049
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.101Z",
            "id": 31736,
            "count": 3,
            "ms": 12.751400000182912
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.106Z",
            "id": 31737,
            "count": 1,
            "bytes": 170363,
            "remainingMs": 2420.8843999998644
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.116Z",
            "id": 31737,
            "count": 1,
            "ms": 9.968299999833107
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.126Z",
            "id": 31738,
            "count": 3,
            "bytes": 548360,
            "remainingMs": 2400.7582999998704
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.141Z",
            "id": 31738,
            "count": 3,
            "ms": 15.33559999987483
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.149Z",
            "id": 31739,
            "count": 2,
            "bytes": 340554,
            "remainingMs": 2378.248799999943
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.160Z",
            "id": 31739,
            "count": 2,
            "ms": 11.935400000074878
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.172Z",
            "id": 31740,
            "count": 3,
            "bytes": 546896,
            "remainingMs": 2354.504900000058
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.184Z",
            "id": 31740,
            "count": 3,
            "ms": 11.9621000001207
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.197Z",
            "id": 31741,
            "count": 3,
            "bytes": 545120,
            "remainingMs": 2329.8828000000212
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.209Z",
            "id": 31741,
            "count": 3,
            "ms": 12.003800000064075
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.221Z",
            "id": 31742,
            "count": 3,
            "bytes": 543232,
            "remainingMs": 2305.4839999999385
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.237Z",
            "id": 31742,
            "count": 3,
            "ms": 15.973400000017136
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.249Z",
            "id": 31743,
            "count": 3,
            "bytes": 540960,
            "remainingMs": 2277.5738999999594
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.263Z",
            "id": 31743,
            "count": 3,
            "ms": 13.672800000058487
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.276Z",
            "id": 31744,
            "count": 3,
            "bytes": 538560,
            "remainingMs": 2251.2034999998286
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.294Z",
            "id": 31744,
            "count": 3,
            "ms": 18.03899999987334
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.306Z",
            "id": 31745,
            "count": 3,
            "bytes": 536928,
            "remainingMs": 2220.277499999851
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.322Z",
            "id": 31745,
            "count": 3,
            "ms": 15.048199999844655
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.333Z",
            "id": 31746,
            "count": 3,
            "bytes": 534527,
            "remainingMs": 2193.8584999998566
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.345Z",
            "id": 31746,
            "count": 3,
            "ms": 12.09539999999106
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.357Z",
            "id": 31747,
            "count": 3,
            "bytes": 530845,
            "remainingMs": 2170.128199999919
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.368Z",
            "id": 31747,
            "count": 3,
            "ms": 11.845100000035018
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.379Z",
            "id": 31748,
            "count": 3,
            "bytes": 527485,
            "remainingMs": 2147.5744000000414
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.393Z",
            "id": 31748,
            "count": 3,
            "ms": 13.785900000017136
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.405Z",
            "id": 31749,
            "count": 3,
            "bytes": 524573,
            "remainingMs": 2122.121799999848
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.417Z",
            "id": 31749,
            "count": 3,
            "ms": 12.708600000012666
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.427Z",
            "id": 31750,
            "count": 3,
            "bytes": 522460,
            "remainingMs": 2100.0466999998316
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.441Z",
            "id": 31750,
            "count": 3,
            "ms": 13.800099999876693
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.449Z",
            "id": 31751,
            "count": 3,
            "bytes": 521207,
            "remainingMs": 2077.4168000000063
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.462Z",
            "id": 31751,
            "count": 3,
            "ms": 12.488499999977648
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.470Z",
            "id": 31752,
            "count": 3,
            "bytes": 519060,
            "remainingMs": 2056.3963999999687
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.483Z",
            "id": 31752,
            "count": 3,
            "ms": 12.235499999951571
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.492Z",
            "id": 31753,
            "count": 3,
            "bytes": 517041,
            "remainingMs": 2034.9728999999352
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.504Z",
            "id": 31753,
            "count": 3,
            "ms": 12.266099999891594
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.513Z",
            "id": 31754,
            "count": 3,
            "bytes": 515055,
            "remainingMs": 2013.9161999998614
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.527Z",
            "id": 31754,
            "count": 3,
            "ms": 13.881799999857321
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.534Z",
            "id": 31755,
            "count": 3,
            "bytes": 512715,
            "remainingMs": 1992.2850999999791
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.547Z",
            "id": 31755,
            "count": 3,
            "ms": 12.040900000138208
          },
          {
            "type": "request",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.564Z",
            "id": 31756,
            "count": 3,
            "bytes": 590195,
            "remainingMs": 1962.312299999874
          },
          {
            "type": "response",
            "label": "p4-17-s0:step-2441",
            "at": "2026-11-02T04:11:19.579Z",
            "id": 31756,
            "count": 3,
            "ms": 14.566200000001118
          }
        ],
        "packMs": 27851.75130001724
      },
      "wallMs": 1123607.9614000001,
      "latency": {
        "model": {
          "count": 1029,
          "meanMs": 1066.0298357628765,
          "p95Ms": 2916.647399999987,
          "maxMs": 2927.56210000001
        },
        "opponent": {
          "count": 1414,
          "meanMs": 14.487869519094604,
          "p95Ms": 50.119899999990594,
          "maxMs": 926.4165999999968
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p4-17-s0\\p4-17-s0"
    },
    {
      "id": "p4-17-s1",
      "slot": 17,
      "seat": 1,
      "seed": 310017153,
      "opponent": "hard",
      "players": 4,
      "map": "(4) Shadowlands.aem",
      "category": "preset_units",
      "modelPlayer": 1,
      "initialSha256": "6182825a63ec499e628350b9e2ef1801099c741bc890bb97414676bdb57c7c7e",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_win",
      "winner": 2,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 2314,
          "ids": [
            3
          ],
          "averagePlace": 4,
          "normalizedRank": 0
        },
        {
          "step": 2763,
          "ids": [
            2
          ],
          "averagePlace": 3,
          "normalizedRank": 0.3333333333333333
        },
        {
          "step": 2771,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0.6666666666666666
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 2772,
      "rounds": 33,
      "roots": 678,
      "witnessCount": 111,
      "witnessActions": 2041,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 44550,
        "observations": 138729,
        "completed": 44550,
        "lateResponses": 1,
        "softDeadlines": 1,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 605254.3435999954,
        "peakBatchSize": 32,
        "bytes": 31091611513,
        "decisionRequests": 44548,
        "decisionObservations": 138696,
        "completedDecisionObservations": 138696,
        "decisionWireMs": 602587.4379999954,
        "decisionPeakBatchSize": 31,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.191Z",
            "id": 44519,
            "count": 4,
            "bytes": 900303,
            "remainingMs": 2723.851500000106
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.207Z",
            "id": 44519,
            "count": 4,
            "ms": 15.18350000004284
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.228Z",
            "id": 44520,
            "count": 4,
            "bytes": 981900,
            "remainingMs": 2687.3574000000954
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.242Z",
            "id": 44520,
            "count": 4,
            "ms": 13.85730000003241
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.302Z",
            "id": 44521,
            "count": 4,
            "bytes": 900131,
            "remainingMs": 2612.842600000091
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.318Z",
            "id": 44521,
            "count": 4,
            "ms": 15.884599999990314
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.334Z",
            "id": 44522,
            "count": 3,
            "bytes": 735950,
            "remainingMs": 2581.092299999902
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.348Z",
            "id": 44522,
            "count": 3,
            "ms": 13.514999999897555
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.391Z",
            "id": 44523,
            "count": 3,
            "bytes": 675121,
            "remainingMs": 2524.09440000006
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.404Z",
            "id": 44523,
            "count": 3,
            "ms": 12.779199999989942
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.420Z",
            "id": 44524,
            "count": 4,
            "bytes": 980692,
            "remainingMs": 2495.249300000025
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.437Z",
            "id": 44524,
            "count": 4,
            "ms": 17.190200000070035
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.486Z",
            "id": 44525,
            "count": 3,
            "bytes": 675311,
            "remainingMs": 2429.1813000000548
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.500Z",
            "id": 44525,
            "count": 3,
            "ms": 14.282600000035018
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.520Z",
            "id": 44526,
            "count": 4,
            "bytes": 980444,
            "remainingMs": 2394.808999999892
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.535Z",
            "id": 44526,
            "count": 4,
            "ms": 14.482399999862537
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.592Z",
            "id": 44527,
            "count": 3,
            "bytes": 675213,
            "remainingMs": 2323.5426000000443
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.605Z",
            "id": 44527,
            "count": 3,
            "ms": 13.021799999987707
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.624Z",
            "id": 44528,
            "count": 4,
            "bytes": 979868,
            "remainingMs": 2290.9150000000373
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.639Z",
            "id": 44528,
            "count": 4,
            "ms": 14.41550000011921
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.696Z",
            "id": 44529,
            "count": 4,
            "bytes": 900122,
            "remainingMs": 2218.848800000036
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.710Z",
            "id": 44529,
            "count": 4,
            "ms": 13.58780000009574
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.721Z",
            "id": 44530,
            "count": 2,
            "bytes": 489632,
            "remainingMs": 2193.840799999889
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.734Z",
            "id": 44530,
            "count": 2,
            "ms": 12.190099999774247
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.763Z",
            "id": 44531,
            "count": 2,
            "bytes": 450138,
            "remainingMs": 2152.6651999999303
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2766",
            "at": "2026-11-02T04:35:43.774Z",
            "id": 44531,
            "count": 2,
            "ms": 11.821599999908358
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:43.791Z",
            "id": 44532,
            "count": 1,
            "bytes": 245818,
            "remainingMs": 2920.6426999999676
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:43.802Z",
            "id": 44532,
            "count": 1,
            "ms": 11.770699999993667
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:43.825Z",
            "id": 44533,
            "count": 2,
            "bytes": 450156,
            "remainingMs": 2885.91370000015
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:43.837Z",
            "id": 44533,
            "count": 2,
            "ms": 11.840599999995902
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:43.887Z",
            "id": 44534,
            "count": 10,
            "bytes": 2452709,
            "remainingMs": 2824.4569000001065
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:43.910Z",
            "id": 44534,
            "count": 10,
            "ms": 23.017200000118464
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:43.925Z",
            "id": 44535,
            "count": 4,
            "bytes": 981900,
            "remainingMs": 2786.468400000129
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:43.939Z",
            "id": 44535,
            "count": 4,
            "ms": 13.98880000016652
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.000Z",
            "id": 44536,
            "count": 4,
            "bytes": 900131,
            "remainingMs": 2710.75130000012
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.016Z",
            "id": 44536,
            "count": 4,
            "ms": 15.159300000173971
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.032Z",
            "id": 44537,
            "count": 3,
            "bytes": 735822,
            "remainingMs": 2679.314100000076
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.045Z",
            "id": 44537,
            "count": 3,
            "ms": 13.538900000043213
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.092Z",
            "id": 44538,
            "count": 3,
            "bytes": 675121,
            "remainingMs": 2619.351800000062
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.106Z",
            "id": 44538,
            "count": 3,
            "ms": 14.357899999944493
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.124Z",
            "id": 44539,
            "count": 4,
            "bytes": 980404,
            "remainingMs": 2587.380099999951
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.142Z",
            "id": 44539,
            "count": 4,
            "ms": 18.17409999994561
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.203Z",
            "id": 44540,
            "count": 3,
            "bytes": 675148,
            "remainingMs": 2507.9287000000477
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.219Z",
            "id": 44540,
            "count": 3,
            "ms": 16.12140000006184
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.240Z",
            "id": 44541,
            "count": 4,
            "bytes": 978876,
            "remainingMs": 2470.9295000000857
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.256Z",
            "id": 44541,
            "count": 4,
            "ms": 16.12609999999404
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.314Z",
            "id": 44542,
            "count": 3,
            "bytes": 675121,
            "remainingMs": 2397.3067000000738
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.327Z",
            "id": 44542,
            "count": 3,
            "ms": 12.954900000011548
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.333Z",
            "id": 44543,
            "count": 1,
            "bytes": 244410,
            "remainingMs": 2377.8305000001565
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.344Z",
            "id": 44543,
            "count": 1,
            "ms": 10.078100000042468
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.359Z",
            "id": 44544,
            "count": 1,
            "bytes": 244530,
            "remainingMs": 2352.029400000116
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.369Z",
            "id": 44544,
            "count": 1,
            "ms": 10.151599999982864
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.384Z",
            "id": 44545,
            "count": 1,
            "bytes": 225155,
            "remainingMs": 2327.6193000001367
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2768",
            "at": "2026-11-02T04:35:44.394Z",
            "id": 44545,
            "count": 1,
            "ms": 10.517900000093505
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2770",
            "at": "2026-11-02T04:35:44.413Z",
            "id": 44546,
            "count": 1,
            "bytes": 245650,
            "remainingMs": 2919.9851999999955
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2770",
            "at": "2026-11-02T04:35:44.424Z",
            "id": 44546,
            "count": 1,
            "ms": 11.83449999988079
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2770",
            "at": "2026-11-02T04:35:44.449Z",
            "id": 44547,
            "count": 2,
            "bytes": 450138,
            "remainingMs": 2883.7099999999627
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2770",
            "at": "2026-11-02T04:35:44.461Z",
            "id": 44547,
            "count": 2,
            "ms": 12.417399999918416
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2770",
            "at": "2026-11-02T04:35:44.482Z",
            "id": 44548,
            "count": 4,
            "bytes": 967298,
            "remainingMs": 2850.195500000147
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2770",
            "at": "2026-11-02T04:35:44.497Z",
            "id": 44548,
            "count": 4,
            "ms": 14.638900000136346
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2770",
            "at": "2026-11-02T04:35:44.505Z",
            "id": 44549,
            "count": 2,
            "bytes": 490168,
            "remainingMs": 2827.779700000072
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2770",
            "at": "2026-11-02T04:35:44.518Z",
            "id": 44549,
            "count": 2,
            "ms": 13.221499999985099
          },
          {
            "type": "request",
            "label": "p4-17-s1:step-2770",
            "at": "2026-11-02T04:35:44.546Z",
            "id": 44550,
            "count": 2,
            "bytes": 450138,
            "remainingMs": 2786.5533000000287
          },
          {
            "type": "response",
            "label": "p4-17-s1:step-2770",
            "at": "2026-11-02T04:35:44.558Z",
            "id": 44550,
            "count": 2,
            "ms": 12.274299999931827
          }
        ],
        "packMs": 35082.77719997868
      },
      "wallMs": 1459926.3692,
      "latency": {
        "model": {
          "count": 1333,
          "meanMs": 1072.8950125281274,
          "p95Ms": 2915.4261000000115,
          "maxMs": 2927.834200000012
        },
        "opponent": {
          "count": 1439,
          "meanMs": 15.557455941626815,
          "p95Ms": 48.21250000002328,
          "maxMs": 1934.8715000000084
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p4-17-s1\\p4-17-s1"
    },
    {
      "id": "p4-17-s2",
      "slot": 17,
      "seat": 2,
      "seed": 310017153,
      "opponent": "hard",
      "players": 4,
      "map": "(4) Shadowlands.aem",
      "category": "preset_units",
      "modelPlayer": 2,
      "initialSha256": "6182825a63ec499e628350b9e2ef1801099c741bc890bb97414676bdb57c7c7e",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 2,
      "firstPlace": 0,
      "normalizedRank": 0.3333333333333333,
      "eliminations": [
        {
          "step": 1840,
          "ids": [
            3
          ],
          "averagePlace": 4,
          "normalizedRank": 0
        },
        {
          "step": 2423,
          "ids": [
            2
          ],
          "averagePlace": 3,
          "normalizedRank": 0.3333333333333333
        },
        {
          "step": 2963,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0.6666666666666666
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": true,
      "steps": 2964,
      "rounds": 35,
      "roots": 172,
      "witnessCount": 33,
      "witnessActions": 606,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 13066,
        "observations": 42116,
        "completed": 13066,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 195564.33009999833,
        "peakBatchSize": 33,
        "bytes": 13636798185,
        "decisionRequests": 13064,
        "decisionObservations": 42083,
        "completedDecisionObservations": 42083,
        "decisionWireMs": 192957.21289999833,
        "decisionPeakBatchSize": 33,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.251Z",
            "id": 13035,
            "count": 4,
            "bytes": 799720,
            "remainingMs": 1369.9517999999807
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.263Z",
            "id": 13035,
            "count": 4,
            "ms": 12.894599999999627
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.299Z",
            "id": 13036,
            "count": 4,
            "bytes": 798214,
            "remainingMs": 1321.2363999999943
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.318Z",
            "id": 13036,
            "count": 4,
            "ms": 18.68839999998454
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.354Z",
            "id": 13037,
            "count": 4,
            "bytes": 795238,
            "remainingMs": 1266.897799999977
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.373Z",
            "id": 13037,
            "count": 4,
            "ms": 19.2954000000027
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.408Z",
            "id": 13038,
            "count": 4,
            "bytes": 791078,
            "remainingMs": 1212.9040999999852
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.426Z",
            "id": 13038,
            "count": 4,
            "ms": 18.182900000014342
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.455Z",
            "id": 13039,
            "count": 4,
            "bytes": 737858,
            "remainingMs": 1165.141100000008
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.470Z",
            "id": 13039,
            "count": 4,
            "ms": 14.96760000003269
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.485Z",
            "id": 13040,
            "count": 4,
            "bytes": 788454,
            "remainingMs": 1135.8208999999915
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.499Z",
            "id": 13040,
            "count": 4,
            "ms": 14.006800000031944
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.528Z",
            "id": 13041,
            "count": 4,
            "bytes": 737849,
            "remainingMs": 1092.6920999999857
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.542Z",
            "id": 13041,
            "count": 4,
            "ms": 13.886500000022352
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.557Z",
            "id": 13042,
            "count": 4,
            "bytes": 780093,
            "remainingMs": 1063.398199999996
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.571Z",
            "id": 13042,
            "count": 4,
            "ms": 13.48389999999199
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.598Z",
            "id": 13043,
            "count": 3,
            "bytes": 550753,
            "remainingMs": 1022.7276999999885
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.611Z",
            "id": 13043,
            "count": 3,
            "ms": 13.243000000016764
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.624Z",
            "id": 13044,
            "count": 4,
            "bytes": 783422,
            "remainingMs": 996.0783999999985
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.639Z",
            "id": 13044,
            "count": 4,
            "ms": 14.380600000033155
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.662Z",
            "id": 13045,
            "count": 1,
            "bytes": 193488,
            "remainingMs": 958.0587999999989
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.673Z",
            "id": 13045,
            "count": 1,
            "ms": 10.785700000007637
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.685Z",
            "id": 13046,
            "count": 4,
            "bytes": 779790,
            "remainingMs": 935.4764999999898
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.700Z",
            "id": 13046,
            "count": 4,
            "ms": 14.712999999988824
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.725Z",
            "id": 13047,
            "count": 1,
            "bytes": 181694,
            "remainingMs": 895.0611999999965
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.736Z",
            "id": 13047,
            "count": 1,
            "ms": 10.455300000030547
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.748Z",
            "id": 13048,
            "count": 4,
            "bytes": 763332,
            "remainingMs": 872.9248999999836
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.761Z",
            "id": 13048,
            "count": 4,
            "ms": 13.472499999974389
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.794Z",
            "id": 13049,
            "count": 4,
            "bytes": 759843,
            "remainingMs": 826.9556999999913
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.807Z",
            "id": 13049,
            "count": 4,
            "ms": 13.81359999999404
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.830Z",
            "id": 13050,
            "count": 1,
            "bytes": 187469,
            "remainingMs": 790.2069999999949
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.841Z",
            "id": 13050,
            "count": 1,
            "ms": 10.538200000009965
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.852Z",
            "id": 13051,
            "count": 4,
            "bytes": 755041,
            "remainingMs": 768.8349000000162
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.865Z",
            "id": 13051,
            "count": 4,
            "ms": 13.1537000000244
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.889Z",
            "id": 13052,
            "count": 2,
            "bytes": 357395,
            "remainingMs": 731.2650999999605
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.903Z",
            "id": 13052,
            "count": 2,
            "ms": 14.039399999950547
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.914Z",
            "id": 13053,
            "count": 4,
            "bytes": 751520,
            "remainingMs": 706.5319000000018
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.927Z",
            "id": 13053,
            "count": 4,
            "ms": 13.435200000007171
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.950Z",
            "id": 13054,
            "count": 1,
            "bytes": 181645,
            "remainingMs": 670.555400000012
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.960Z",
            "id": 13054,
            "count": 1,
            "ms": 10.021900000050664
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.970Z",
            "id": 13055,
            "count": 4,
            "bytes": 742870,
            "remainingMs": 650.6609999999637
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:12.984Z",
            "id": 13055,
            "count": 4,
            "ms": 13.652699999976903
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.006Z",
            "id": 13056,
            "count": 1,
            "bytes": 175940,
            "remainingMs": 614.5743999999831
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.016Z",
            "id": 13056,
            "count": 1,
            "ms": 9.896499999973457
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.026Z",
            "id": 13057,
            "count": 4,
            "bytes": 741460,
            "remainingMs": 594.8497999999672
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.039Z",
            "id": 13057,
            "count": 4,
            "ms": 13.546799999952782
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.069Z",
            "id": 13058,
            "count": 4,
            "bytes": 738547,
            "remainingMs": 551.3249000000069
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.083Z",
            "id": 13058,
            "count": 4,
            "ms": 13.5456000000122
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.113Z",
            "id": 13059,
            "count": 4,
            "bytes": 734767,
            "remainingMs": 507.99199999996927
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.126Z",
            "id": 13059,
            "count": 4,
            "ms": 13.879599999985658
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.160Z",
            "id": 13060,
            "count": 4,
            "bytes": 732171,
            "remainingMs": 460.82889999996405
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.178Z",
            "id": 13060,
            "count": 4,
            "ms": 18.226800000004005
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.203Z",
            "id": 13061,
            "count": 2,
            "bytes": 367309,
            "remainingMs": 417.9863999999943
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.213Z",
            "id": 13061,
            "count": 2,
            "ms": 10.955100000021048
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.224Z",
            "id": 13062,
            "count": 1,
            "bytes": 194246,
            "remainingMs": 396.12099999998463
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.237Z",
            "id": 13062,
            "count": 1,
            "ms": 12.161599999992177
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.239Z",
            "id": 13063,
            "count": 1,
            "bytes": 193439,
            "remainingMs": 381.04550000000745
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.251Z",
            "id": 13063,
            "count": 1,
            "ms": 11.646400000026915
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.254Z",
            "id": 13064,
            "count": 1,
            "bytes": 176793,
            "remainingMs": 366.83319999999367
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.263Z",
            "id": 13064,
            "count": 1,
            "ms": 9.620800000033341
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.269Z",
            "id": 13065,
            "count": 1,
            "bytes": 182548,
            "remainingMs": 351.54329999996116
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.279Z",
            "id": 13065,
            "count": 1,
            "ms": 10.522499999962747
          },
          {
            "type": "request",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.285Z",
            "id": 13066,
            "count": 2,
            "bytes": 324610,
            "remainingMs": 335.5425999999861
          },
          {
            "type": "response",
            "label": "p4-17-s2:step-2266",
            "at": "2026-11-02T04:44:13.296Z",
            "id": 13066,
            "count": 2,
            "ms": 10.841599999985192
          }
        ],
        "packMs": 14699.615899995875
      },
      "wallMs": 510325.8827,
      "latency": {
        "model": {
          "count": 345,
          "meanMs": 1374.3180426086947,
          "p95Ms": 2921.294900000001,
          "maxMs": 2925.0101999999897
        },
        "opponent": {
          "count": 2619,
          "meanMs": 11.161183276059232,
          "p95Ms": 45.54810000001453,
          "maxMs": 1082.2851000000082
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p4-17-s2\\p4-17-s2"
    },
    {
      "id": "p4-17-s3",
      "slot": 17,
      "seat": 3,
      "seed": 310017153,
      "opponent": "hard",
      "players": 4,
      "map": "(4) Shadowlands.aem",
      "category": "preset_units",
      "modelPlayer": 3,
      "initialSha256": "6182825a63ec499e628350b9e2ef1801099c741bc890bb97414676bdb57c7c7e",
      "firstToActPlayer": 0,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 1,
      "firstPlace": 0,
      "normalizedRank": 0.3333333333333333,
      "eliminations": [
        {
          "step": 2626,
          "ids": [
            2
          ],
          "averagePlace": 4,
          "normalizedRank": 0
        },
        {
          "step": 4856,
          "ids": [
            3
          ],
          "averagePlace": 3,
          "normalizedRank": 0.3333333333333333
        },
        {
          "step": 5045,
          "ids": [
            1
          ],
          "averagePlace": 2,
          "normalizedRank": 0.6666666666666666
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": true,
      "steps": 5046,
      "rounds": 68,
      "roots": 450,
      "witnessCount": 89,
      "witnessActions": 1297,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 31229,
        "observations": 99546,
        "completed": 31229,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 436117.0524999939,
        "peakBatchSize": 32,
        "bytes": 21845344882,
        "decisionRequests": 31227,
        "decisionObservations": 99513,
        "completedDecisionObservations": 99513,
        "decisionWireMs": 433570.3002999939,
        "decisionPeakBatchSize": 32,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:04.653Z",
            "id": 31198,
            "count": 3,
            "bytes": 447655,
            "remainingMs": 1523.5716999999713
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:04.667Z",
            "id": 31198,
            "count": 3,
            "ms": 13.67519999993965
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:04.679Z",
            "id": 31199,
            "count": 4,
            "bytes": 628201,
            "remainingMs": 1497.814400000032
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:04.693Z",
            "id": 31199,
            "count": 4,
            "ms": 13.258900000015274
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:04.755Z",
            "id": 31200,
            "count": 4,
            "bytes": 582389,
            "remainingMs": 1422.1354000000283
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:04.768Z",
            "id": 31200,
            "count": 4,
            "ms": 13.385200000135228
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:04.781Z",
            "id": 31201,
            "count": 4,
            "bytes": 625193,
            "remainingMs": 1396.4495999999344
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:04.794Z",
            "id": 31201,
            "count": 4,
            "ms": 13.665299999993294
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:04.853Z",
            "id": 31202,
            "count": 3,
            "bytes": 447655,
            "remainingMs": 1323.8610999998637
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:04.869Z",
            "id": 31202,
            "count": 3,
            "ms": 15.736199999926612
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:04.881Z",
            "id": 31203,
            "count": 4,
            "bytes": 624105,
            "remainingMs": 1295.9825999999885
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:04.895Z",
            "id": 31203,
            "count": 4,
            "ms": 14.006800000090152
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:04.955Z",
            "id": 31204,
            "count": 4,
            "bytes": 582389,
            "remainingMs": 1222.2397999998648
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:04.971Z",
            "id": 31204,
            "count": 4,
            "ms": 16.612599999876693
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:04.983Z",
            "id": 31205,
            "count": 4,
            "bytes": 622473,
            "remainingMs": 1194.1772999998648
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:04.996Z",
            "id": 31205,
            "count": 4,
            "ms": 12.852500000037253
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.051Z",
            "id": 31206,
            "count": 1,
            "bytes": 134906,
            "remainingMs": 1126.2574000000022
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.063Z",
            "id": 31206,
            "count": 1,
            "ms": 11.847800000105053
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.073Z",
            "id": 31207,
            "count": 4,
            "bytes": 618921,
            "remainingMs": 1104.4958999999799
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.086Z",
            "id": 31207,
            "count": 4,
            "ms": 13.5914000000339
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.149Z",
            "id": 31208,
            "count": 4,
            "bytes": 601070,
            "remainingMs": 1028.1663999999873
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.162Z",
            "id": 31208,
            "count": 4,
            "ms": 13.459599999943748
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.225Z",
            "id": 31209,
            "count": 4,
            "bytes": 595819,
            "remainingMs": 951.9094000000041
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.243Z",
            "id": 31209,
            "count": 4,
            "ms": 18.032700000097975
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.305Z",
            "id": 31210,
            "count": 4,
            "bytes": 591718,
            "remainingMs": 871.6372999998275
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.319Z",
            "id": 31210,
            "count": 4,
            "ms": 13.231499999994412
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.377Z",
            "id": 31211,
            "count": 4,
            "bytes": 567578,
            "remainingMs": 799.8259000000544
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.396Z",
            "id": 31211,
            "count": 4,
            "ms": 18.707500000018626
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.405Z",
            "id": 31212,
            "count": 4,
            "bytes": 567166,
            "remainingMs": 772.0220999999437
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.419Z",
            "id": 31212,
            "count": 4,
            "ms": 13.77239999989979
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.480Z",
            "id": 31213,
            "count": 4,
            "bytes": 564990,
            "remainingMs": 697.3303000000305
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.495Z",
            "id": 31213,
            "count": 4,
            "ms": 15.198800000129268
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.553Z",
            "id": 31214,
            "count": 4,
            "bytes": 557774,
            "remainingMs": 623.7534999998752
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.567Z",
            "id": 31214,
            "count": 4,
            "ms": 13.364099999889731
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.616Z",
            "id": 31215,
            "count": 4,
            "bytes": 570194,
            "remainingMs": 560.751500000013
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.633Z",
            "id": 31215,
            "count": 4,
            "ms": 17.096200000029057
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.642Z",
            "id": 31216,
            "count": 4,
            "bytes": 567578,
            "remainingMs": 535.2867000000551
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.655Z",
            "id": 31216,
            "count": 4,
            "ms": 12.777000000001863
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.664Z",
            "id": 31217,
            "count": 4,
            "bytes": 578306,
            "remainingMs": 513.2918999998365
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.677Z",
            "id": 31217,
            "count": 4,
            "ms": 13.183399999979883
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.728Z",
            "id": 31218,
            "count": 4,
            "bytes": 557774,
            "remainingMs": 448.7155999999959
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.746Z",
            "id": 31218,
            "count": 4,
            "ms": 17.756700000027195
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.797Z",
            "id": 31219,
            "count": 4,
            "bytes": 573494,
            "remainingMs": 379.9403999999631
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.811Z",
            "id": 31219,
            "count": 4,
            "ms": 14.284500000067055
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.818Z",
            "id": 31220,
            "count": 2,
            "bytes": 290806,
            "remainingMs": 358.6404999999795
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.832Z",
            "id": 31220,
            "count": 2,
            "ms": 13.75289999996312
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.845Z",
            "id": 31221,
            "count": 2,
            "bytes": 299770,
            "remainingMs": 331.8381999998819
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.856Z",
            "id": 31221,
            "count": 2,
            "ms": 10.978799999924377
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.861Z",
            "id": 31222,
            "count": 2,
            "bytes": 298476,
            "remainingMs": 316.4396999999881
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.872Z",
            "id": 31222,
            "count": 2,
            "ms": 11.45880000013858
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.877Z",
            "id": 31223,
            "count": 2,
            "bytes": 253458,
            "remainingMs": 299.83950000000186
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.889Z",
            "id": 31223,
            "count": 2,
            "ms": 11.352300000144169
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.896Z",
            "id": 31224,
            "count": 2,
            "bytes": 251976,
            "remainingMs": 280.67699999990873
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.906Z",
            "id": 31224,
            "count": 2,
            "ms": 9.942000000039116
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.913Z",
            "id": 31225,
            "count": 2,
            "bytes": 262404,
            "remainingMs": 263.9597000000067
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.924Z",
            "id": 31225,
            "count": 2,
            "ms": 10.706200000131503
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.929Z",
            "id": 31226,
            "count": 2,
            "bytes": 260600,
            "remainingMs": 247.96699999994598
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.941Z",
            "id": 31226,
            "count": 2,
            "ms": 12.182199999922886
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.944Z",
            "id": 31227,
            "count": 1,
            "bytes": 130353,
            "remainingMs": 233.06279999995604
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.953Z",
            "id": 31227,
            "count": 1,
            "ms": 9.368999999947846
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.956Z",
            "id": 31228,
            "count": 1,
            "bytes": 135488,
            "remainingMs": 221.10389999998733
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.965Z",
            "id": 31228,
            "count": 1,
            "ms": 9.252700000070035
          },
          {
            "type": "request",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.970Z",
            "id": 31229,
            "count": 2,
            "bytes": 256353,
            "remainingMs": 206.84519999986514
          },
          {
            "type": "response",
            "label": "p4-17-s3:step-4797",
            "at": "2026-11-02T05:03:05.980Z",
            "id": 31229,
            "count": 2,
            "ms": 10.157999999821186
          }
        ],
        "packMs": 23909.478699997882
      },
      "wallMs": 1123797.2445,
      "latency": {
        "model": {
          "count": 903,
          "meanMs": 1154.9034147286825,
          "p95Ms": 2913.4627000000037,
          "maxMs": 2924.3468999999996
        },
        "opponent": {
          "count": 4143,
          "meanMs": 16.74204984310983,
          "p95Ms": 54.223400000017136,
          "maxMs": 3580.3430999999982
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p4-17-s3\\p4-17-s3"
    },
    {
      "id": "p4-18-s0",
      "slot": 18,
      "seat": 0,
      "seed": 310018162,
      "opponent": "hard",
      "players": 4,
      "map": "(4) The Crucible.aem",
      "category": "advantage_endgame",
      "modelPlayer": 0,
      "initialSha256": "56ad3c842f847cf0f0a9a479e86acc2a0d0d0e1f25016a8fc0c49651fcfc51b9",
      "firstToActPlayer": 2,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 2,
      "firstPlace": 0,
      "normalizedRank": 0.6666666666666666,
      "eliminations": [
        {
          "step": 1607,
          "ids": [
            3
          ],
          "averagePlace": 4,
          "normalizedRank": 0
        },
        {
          "step": 2271,
          "ids": [
            2
          ],
          "averagePlace": 3,
          "normalizedRank": 0.3333333333333333
        },
        {
          "step": 2606,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0.6666666666666666
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 2607,
      "rounds": 41,
      "roots": 206,
      "witnessCount": 32,
      "witnessActions": 719,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 13780,
        "observations": 45442,
        "completed": 13780,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 192436.0989000021,
        "peakBatchSize": 32,
        "bytes": 6787427202,
        "decisionRequests": 13778,
        "decisionObservations": 45409,
        "completedDecisionObservations": 45409,
        "decisionWireMs": 189795.4102000021,
        "decisionPeakBatchSize": 31,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p4-18-s0:step-2525",
            "at": "2026-11-01T19:27:59.936Z",
            "id": 13749,
            "count": 1,
            "bytes": 198763,
            "remainingMs": 1672.7799000000232
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2525",
            "at": "2026-11-01T19:27:59.947Z",
            "id": 13749,
            "count": 1,
            "ms": 10.96889999997802
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2525",
            "at": "2026-11-01T19:27:59.954Z",
            "id": 13750,
            "count": 1,
            "bytes": 198227,
            "remainingMs": 1654.1591999999946
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2525",
            "at": "2026-11-01T19:27:59.964Z",
            "id": 13750,
            "count": 1,
            "ms": 9.83219999994617
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2525",
            "at": "2026-11-01T19:27:59.971Z",
            "id": 13751,
            "count": 1,
            "bytes": 197554,
            "remainingMs": 1637.0287000000244
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2525",
            "at": "2026-11-01T19:27:59.982Z",
            "id": 13751,
            "count": 1,
            "ms": 10.935799999977462
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2525",
            "at": "2026-11-01T19:27:59.993Z",
            "id": 13752,
            "count": 1,
            "bytes": 196881,
            "remainingMs": 1615.9444000000367
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2525",
            "at": "2026-11-01T19:28:00.004Z",
            "id": 13752,
            "count": 1,
            "ms": 11.162899999995716
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2525",
            "at": "2026-11-01T19:28:00.011Z",
            "id": 13753,
            "count": 1,
            "bytes": 195951,
            "remainingMs": 1597.390800000052
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2525",
            "at": "2026-11-01T19:28:00.025Z",
            "id": 13753,
            "count": 1,
            "ms": 13.41980000003241
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2525",
            "at": "2026-11-01T19:28:00.032Z",
            "id": 13754,
            "count": 1,
            "bytes": 193439,
            "remainingMs": 1576.4477000000188
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2525",
            "at": "2026-11-01T19:28:00.043Z",
            "id": 13754,
            "count": 1,
            "ms": 11.370699999970384
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.496Z",
            "id": 13755,
            "count": 1,
            "bytes": 171073,
            "remainingMs": 2922.331999999995
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.508Z",
            "id": 13755,
            "count": 1,
            "ms": 12.321999999985565
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.518Z",
            "id": 13756,
            "count": 2,
            "bytes": 340748,
            "remainingMs": 2900.1747000000323
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.530Z",
            "id": 13756,
            "count": 2,
            "ms": 11.928300000028685
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.562Z",
            "id": 13757,
            "count": 6,
            "bytes": 1359848,
            "remainingMs": 2855.899800000014
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.586Z",
            "id": 13757,
            "count": 6,
            "ms": 23.038699999975506
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.600Z",
            "id": 13758,
            "count": 4,
            "bytes": 906488,
            "remainingMs": 2818.4138000000385
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.614Z",
            "id": 13758,
            "count": 4,
            "ms": 14.302300000039395
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.646Z",
            "id": 13759,
            "count": 2,
            "bytes": 411300,
            "remainingMs": 2772.449900000007
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.658Z",
            "id": 13759,
            "count": 2,
            "ms": 12.567900000023656
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.677Z",
            "id": 13760,
            "count": 4,
            "bytes": 910857,
            "remainingMs": 2740.968200000003
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.691Z",
            "id": 13760,
            "count": 4,
            "ms": 13.737800000002608
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.734Z",
            "id": 13761,
            "count": 4,
            "bytes": 902424,
            "remainingMs": 2684.8220999999903
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.750Z",
            "id": 13761,
            "count": 4,
            "ms": 16.239999999990687
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.781Z",
            "id": 13762,
            "count": 2,
            "bytes": 398884,
            "remainingMs": 2637.2872000000207
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.793Z",
            "id": 13762,
            "count": 2,
            "ms": 12.18640000000596
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.812Z",
            "id": 13763,
            "count": 4,
            "bytes": 900568,
            "remainingMs": 2606.3983000000007
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.825Z",
            "id": 13763,
            "count": 4,
            "ms": 13.382500000006985
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.854Z",
            "id": 13764,
            "count": 1,
            "bytes": 212090,
            "remainingMs": 2564.370500000019
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.865Z",
            "id": 13764,
            "count": 1,
            "ms": 10.56050000002142
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.878Z",
            "id": 13765,
            "count": 3,
            "bytes": 662339,
            "remainingMs": 2540.7325999999885
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.891Z",
            "id": 13765,
            "count": 3,
            "ms": 13.411399999982677
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.916Z",
            "id": 13766,
            "count": 2,
            "bytes": 398866,
            "remainingMs": 2502.529600000009
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.927Z",
            "id": 13766,
            "count": 2,
            "ms": 10.807099999976344
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.932Z",
            "id": 13767,
            "count": 1,
            "bytes": 224431,
            "remainingMs": 2486.5098
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.942Z",
            "id": 13767,
            "count": 1,
            "ms": 10.23599999997532
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.953Z",
            "id": 13768,
            "count": 1,
            "bytes": 223887,
            "remainingMs": 2465.4872000000323
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.963Z",
            "id": 13768,
            "count": 1,
            "ms": 10.222600000037346
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.974Z",
            "id": 13769,
            "count": 1,
            "bytes": 223183,
            "remainingMs": 2444.7026000000187
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.985Z",
            "id": 13769,
            "count": 1,
            "ms": 10.89020000002347
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:00.995Z",
            "id": 13770,
            "count": 1,
            "bytes": 222991,
            "remainingMs": 2422.9873999999836
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.006Z",
            "id": 13770,
            "count": 1,
            "ms": 10.92229999997653
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.015Z",
            "id": 13771,
            "count": 1,
            "bytes": 205745,
            "remainingMs": 2403.268400000001
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.025Z",
            "id": 13771,
            "count": 1,
            "ms": 9.50189999997383
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.029Z",
            "id": 13772,
            "count": 1,
            "bytes": 222927,
            "remainingMs": 2389.3400000000256
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.040Z",
            "id": 13772,
            "count": 1,
            "ms": 11.069400000036694
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.051Z",
            "id": 13773,
            "count": 1,
            "bytes": 222415,
            "remainingMs": 2367.603999999992
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.062Z",
            "id": 13773,
            "count": 1,
            "ms": 11.364499999966938
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.073Z",
            "id": 13774,
            "count": 1,
            "bytes": 221679,
            "remainingMs": 2345.598500000022
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.083Z",
            "id": 13774,
            "count": 1,
            "ms": 9.930099999997765
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.093Z",
            "id": 13775,
            "count": 1,
            "bytes": 221006,
            "remainingMs": 2325.1970999999903
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.103Z",
            "id": 13775,
            "count": 1,
            "ms": 10.29639999999199
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.114Z",
            "id": 13776,
            "count": 1,
            "bytes": 220398,
            "remainingMs": 2304.3978999999817
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.124Z",
            "id": 13776,
            "count": 1,
            "ms": 10.082699999969918
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.136Z",
            "id": 13777,
            "count": 1,
            "bytes": 220334,
            "remainingMs": 2282.7001000000164
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.146Z",
            "id": 13777,
            "count": 1,
            "ms": 10.266300000017509
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.156Z",
            "id": 13778,
            "count": 1,
            "bytes": 219374,
            "remainingMs": 2262.0215000000317
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.166Z",
            "id": 13778,
            "count": 1,
            "ms": 9.991399999998976
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.177Z",
            "id": 13779,
            "count": 1,
            "bytes": 218830,
            "remainingMs": 2241.763500000001
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.187Z",
            "id": 13779,
            "count": 1,
            "ms": 10.680999999982305
          },
          {
            "type": "request",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.196Z",
            "id": 13780,
            "count": 1,
            "bytes": 205745,
            "remainingMs": 2222.3635999999824
          },
          {
            "type": "response",
            "label": "p4-18-s0:step-2596",
            "at": "2026-11-01T19:28:01.207Z",
            "id": 13780,
            "count": 1,
            "ms": 11.181199999991804
          }
        ],
        "packMs": 7643.748700004442
      },
      "wallMs": 437256.221,
      "latency": {
        "model": {
          "count": 420,
          "meanMs": 942.2443909523812,
          "p95Ms": 2425.0801999999967,
          "maxMs": 2921.9609999999957
        },
        "opponent": {
          "count": 2187,
          "meanMs": 16.293657201646226,
          "p95Ms": 54.56479999999283,
          "maxMs": 946.0338000000338
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p4-18-s0\\p4-18-s0"
    },
    {
      "id": "p4-18-s1",
      "slot": 18,
      "seat": 1,
      "seed": 310018162,
      "opponent": "hard",
      "players": 4,
      "map": "(4) The Crucible.aem",
      "category": "advantage_endgame",
      "modelPlayer": 1,
      "initialSha256": "56ad3c842f847cf0f0a9a479e86acc2a0d0d0e1f25016a8fc0c49651fcfc51b9",
      "firstToActPlayer": 2,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_win",
      "winner": 2,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 1416,
          "ids": [
            0
          ],
          "averagePlace": 4,
          "normalizedRank": 0
        },
        {
          "step": 1555,
          "ids": [
            3
          ],
          "averagePlace": 3,
          "normalizedRank": 0.3333333333333333
        },
        {
          "step": 1561,
          "ids": [
            2
          ],
          "averagePlace": 2,
          "normalizedRank": 0.6666666666666666
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 1562,
      "rounds": 23,
      "roots": 442,
      "witnessCount": 68,
      "witnessActions": 1268,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 30767,
        "observations": 97549,
        "completed": 30767,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 417397.67639999883,
        "peakBatchSize": 32,
        "bytes": 14855527532,
        "decisionRequests": 30765,
        "decisionObservations": 97516,
        "completedDecisionObservations": 97516,
        "decisionWireMs": 414766.7919999988,
        "decisionPeakBatchSize": 25,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p4-18-s1:step-1554",
            "at": "2026-11-01T19:41:35.712Z",
            "id": 30736,
            "count": 3,
            "bytes": 473230,
            "remainingMs": 2766.893700000015
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1554",
            "at": "2026-11-01T19:41:35.723Z",
            "id": 30736,
            "count": 3,
            "ms": 11.051700000069104
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1554",
            "at": "2026-11-01T19:41:35.730Z",
            "id": 30737,
            "count": 2,
            "bytes": 343774,
            "remainingMs": 2748.675500000012
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1554",
            "at": "2026-11-01T19:41:35.741Z",
            "id": 30737,
            "count": 2,
            "ms": 10.671700000064448
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1554",
            "at": "2026-11-01T19:41:35.748Z",
            "id": 30738,
            "count": 2,
            "bytes": 318994,
            "remainingMs": 2731.185999999987
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1554",
            "at": "2026-11-01T19:41:35.759Z",
            "id": 30738,
            "count": 2,
            "ms": 11.161899999948218
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:35.770Z",
            "id": 30739,
            "count": 1,
            "bytes": 172501,
            "remainingMs": 2921.920400000061
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:35.780Z",
            "id": 30739,
            "count": 1,
            "ms": 9.965000000083819
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:35.795Z",
            "id": 30740,
            "count": 5,
            "bytes": 797272,
            "remainingMs": 2897.2974000000395
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:35.809Z",
            "id": 30740,
            "count": 5,
            "ms": 13.646500000031665
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:35.852Z",
            "id": 30741,
            "count": 13,
            "bytes": 2232890,
            "remainingMs": 2840.643299999996
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:35.883Z",
            "id": 30741,
            "count": 13,
            "ms": 31.41149999992922
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:35.894Z",
            "id": 30742,
            "count": 4,
            "bytes": 688176,
            "remainingMs": 2798.532499999972
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:35.907Z",
            "id": 30742,
            "count": 4,
            "ms": 13.083699999959208
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:35.920Z",
            "id": 30743,
            "count": 4,
            "bytes": 637843,
            "remainingMs": 2772.7517000000225
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:35.937Z",
            "id": 30743,
            "count": 4,
            "ms": 17.227599999983795
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:35.948Z",
            "id": 30744,
            "count": 3,
            "bytes": 515655,
            "remainingMs": 2744.217399999965
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:35.962Z",
            "id": 30744,
            "count": 3,
            "ms": 13.614599999971688
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:35.971Z",
            "id": 30745,
            "count": 3,
            "bytes": 478405,
            "remainingMs": 2721.6205000000773
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:35.983Z",
            "id": 30745,
            "count": 3,
            "ms": 11.972000000067055
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:35.994Z",
            "id": 30746,
            "count": 4,
            "bytes": 686480,
            "remainingMs": 2698.2530999999726
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:36.008Z",
            "id": 30746,
            "count": 4,
            "ms": 13.89159999997355
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:36.019Z",
            "id": 30747,
            "count": 3,
            "bytes": 478414,
            "remainingMs": 2673.7184000000125
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:36.030Z",
            "id": 30747,
            "count": 3,
            "ms": 11.377800000016578
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:36.038Z",
            "id": 30748,
            "count": 2,
            "bytes": 342462,
            "remainingMs": 2654.660900000017
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:36.049Z",
            "id": 30748,
            "count": 2,
            "ms": 11.445599999977276
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:36.056Z",
            "id": 30749,
            "count": 2,
            "bytes": 319003,
            "remainingMs": 2636.7234999999637
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:36.068Z",
            "id": 30749,
            "count": 2,
            "ms": 11.973399999900721
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:36.071Z",
            "id": 30750,
            "count": 1,
            "bytes": 170997,
            "remainingMs": 2621.016500000027
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:36.083Z",
            "id": 30750,
            "count": 1,
            "ms": 11.533500000019558
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:36.086Z",
            "id": 30751,
            "count": 1,
            "bytes": 159583,
            "remainingMs": 2606.362700000056
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1556",
            "at": "2026-11-01T19:41:36.096Z",
            "id": 30751,
            "count": 1,
            "ms": 10.492500000051223
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.107Z",
            "id": 30752,
            "count": 1,
            "bytes": 172053,
            "remainingMs": 2922.379699999932
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.117Z",
            "id": 30752,
            "count": 1,
            "ms": 10.144899999955669
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.134Z",
            "id": 30753,
            "count": 6,
            "bytes": 956692,
            "remainingMs": 2895.707300000009
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.151Z",
            "id": 30753,
            "count": 6,
            "ms": 17.256799999973737
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.197Z",
            "id": 30754,
            "count": 14,
            "bytes": 2397183,
            "remainingMs": 2832.4888999999966
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.230Z",
            "id": 30754,
            "count": 14,
            "ms": 32.82559999998193
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.241Z",
            "id": 30755,
            "count": 4,
            "bytes": 686672,
            "remainingMs": 2789.011700000032
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.255Z",
            "id": 30755,
            "count": 4,
            "ms": 14.654199999989942
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.269Z",
            "id": 30756,
            "count": 4,
            "bytes": 637843,
            "remainingMs": 2760.8519999999553
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.286Z",
            "id": 30756,
            "count": 4,
            "ms": 17.322900000028312
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.296Z",
            "id": 30757,
            "count": 3,
            "bytes": 514407,
            "remainingMs": 2733.1452999999747
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.310Z",
            "id": 30757,
            "count": 3,
            "ms": 13.846699999994598
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.319Z",
            "id": 30758,
            "count": 3,
            "bytes": 478405,
            "remainingMs": 2710.491000000038
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.332Z",
            "id": 30758,
            "count": 3,
            "ms": 12.68590000004042
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.344Z",
            "id": 30759,
            "count": 4,
            "bytes": 684048,
            "remainingMs": 2685.7533999999287
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.356Z",
            "id": 30759,
            "count": 4,
            "ms": 12.389699999941513
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.369Z",
            "id": 30760,
            "count": 4,
            "bytes": 637834,
            "remainingMs": 2660.716299999971
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.383Z",
            "id": 30760,
            "count": 4,
            "ms": 13.76859999995213
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.390Z",
            "id": 30761,
            "count": 2,
            "bytes": 341246,
            "remainingMs": 2639.3042999999598
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.402Z",
            "id": 30761,
            "count": 2,
            "ms": 12.18550000002142
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.408Z",
            "id": 30762,
            "count": 2,
            "bytes": 318994,
            "remainingMs": 2621.1165000000037
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1558",
            "at": "2026-11-01T19:41:36.420Z",
            "id": 30762,
            "count": 2,
            "ms": 11.399100000038743
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1560",
            "at": "2026-11-01T19:41:36.432Z",
            "id": 30763,
            "count": 1,
            "bytes": 171861,
            "remainingMs": 2922.3859999999404
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1560",
            "at": "2026-11-01T19:41:36.442Z",
            "id": 30763,
            "count": 1,
            "ms": 10.182599999941885
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1560",
            "at": "2026-11-01T19:41:36.447Z",
            "id": 30764,
            "count": 1,
            "bytes": 159583,
            "remainingMs": 2906.5923000000184
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1560",
            "at": "2026-11-01T19:41:36.458Z",
            "id": 30764,
            "count": 1,
            "ms": 10.126600000075996
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1560",
            "at": "2026-11-01T19:41:36.471Z",
            "id": 30765,
            "count": 4,
            "bytes": 677127,
            "remainingMs": 2883.099099999992
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1560",
            "at": "2026-11-01T19:41:36.484Z",
            "id": 30765,
            "count": 4,
            "ms": 13.45090000005439
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1560",
            "at": "2026-11-01T19:41:36.492Z",
            "id": 30766,
            "count": 3,
            "bytes": 511303,
            "remainingMs": 2862.298199999961
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1560",
            "at": "2026-11-01T19:41:36.505Z",
            "id": 30766,
            "count": 3,
            "ms": 13.64199999999255
          },
          {
            "type": "request",
            "label": "p4-18-s1:step-1560",
            "at": "2026-11-01T19:41:36.516Z",
            "id": 30767,
            "count": 3,
            "bytes": 478405,
            "remainingMs": 2838.4917999999598
          },
          {
            "type": "response",
            "label": "p4-18-s1:step-1560",
            "at": "2026-11-01T19:41:36.532Z",
            "id": 30767,
            "count": 3,
            "ms": 16.50199999997858
          }
        ],
        "packMs": 16681.99379999867
      },
      "wallMs": 811685.9413,
      "latency": {
        "model": {
          "count": 876,
          "meanMs": 910.5385464611866,
          "p95Ms": 2654.338400000008,
          "maxMs": 2920.4838999999993
        },
        "opponent": {
          "count": 686,
          "meanMs": 14.607417346938204,
          "p95Ms": 53.07039999999688,
          "maxMs": 742.1964000000153
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p4-18-s1\\p4-18-s1"
    },
    {
      "id": "p4-18-s2",
      "slot": 18,
      "seat": 2,
      "seed": 310018162,
      "opponent": "hard",
      "players": 4,
      "map": "(4) The Crucible.aem",
      "category": "advantage_endgame",
      "modelPlayer": 2,
      "initialSha256": "56ad3c842f847cf0f0a9a479e86acc2a0d0d0e1f25016a8fc0c49651fcfc51b9",
      "firstToActPlayer": 2,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_win",
      "winner": 3,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 1863,
          "ids": [
            0
          ],
          "averagePlace": 4,
          "normalizedRank": 0
        },
        {
          "step": 2290,
          "ids": [
            1
          ],
          "averagePlace": 3,
          "normalizedRank": 0.3333333333333333
        },
        {
          "step": 2357,
          "ids": [
            3
          ],
          "averagePlace": 2,
          "normalizedRank": 0.6666666666666666
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 2358,
      "rounds": 36,
      "roots": 524,
      "witnessCount": 96,
      "witnessActions": 1439,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 37120,
        "observations": 118040,
        "completed": 37120,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 493394.8713999911,
        "peakBatchSize": 32,
        "bytes": 16894868746,
        "decisionRequests": 37118,
        "decisionObservations": 118007,
        "completedDecisionObservations": 118007,
        "decisionWireMs": 490821.22409999114,
        "decisionPeakBatchSize": 32,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.265Z",
            "id": 37089,
            "count": 3,
            "bytes": 566883,
            "remainingMs": 2815.851800000062
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.282Z",
            "id": 37089,
            "count": 3,
            "ms": 16.318800000008196
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.299Z",
            "id": 37090,
            "count": 3,
            "bytes": 562659,
            "remainingMs": 2782.5452000000514
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.311Z",
            "id": 37090,
            "count": 3,
            "ms": 12.129500000039116
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.328Z",
            "id": 37091,
            "count": 3,
            "bytes": 559683,
            "remainingMs": 2753.317400000058
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.344Z",
            "id": 37091,
            "count": 3,
            "ms": 16.130699999979697
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.360Z",
            "id": 37092,
            "count": 3,
            "bytes": 555360,
            "remainingMs": 2720.8924000000115
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.377Z",
            "id": 37092,
            "count": 3,
            "ms": 16.577199999941513
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.393Z",
            "id": 37093,
            "count": 3,
            "bytes": 552704,
            "remainingMs": 2688.3752000000095
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.405Z",
            "id": 37093,
            "count": 3,
            "ms": 12.412200000020675
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.421Z",
            "id": 37094,
            "count": 3,
            "bytes": 549920,
            "remainingMs": 2660.387400000007
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.434Z",
            "id": 37094,
            "count": 3,
            "ms": 13.015299999970011
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.449Z",
            "id": 37095,
            "count": 3,
            "bytes": 546464,
            "remainingMs": 2632.2963000000454
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.467Z",
            "id": 37095,
            "count": 3,
            "ms": 18.556400000001304
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.485Z",
            "id": 37096,
            "count": 3,
            "bytes": 542528,
            "remainingMs": 2596.6517999999924
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.497Z",
            "id": 37096,
            "count": 3,
            "ms": 12.589799999957904
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.511Z",
            "id": 37097,
            "count": 3,
            "bytes": 540800,
            "remainingMs": 2569.906500000041
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.524Z",
            "id": 37097,
            "count": 3,
            "ms": 12.91890000004787
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.538Z",
            "id": 37098,
            "count": 3,
            "bytes": 538400,
            "remainingMs": 2543.5696999999927
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.554Z",
            "id": 37098,
            "count": 3,
            "ms": 16.313099999912083
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.567Z",
            "id": 37099,
            "count": 3,
            "bytes": 537568,
            "remainingMs": 2514.1051000000443
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.580Z",
            "id": 37099,
            "count": 3,
            "ms": 12.933399999979883
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.593Z",
            "id": 37100,
            "count": 3,
            "bytes": 536704,
            "remainingMs": 2488.556600000011
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.606Z",
            "id": 37100,
            "count": 3,
            "ms": 13.26280000002589
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.619Z",
            "id": 37101,
            "count": 3,
            "bytes": 536096,
            "remainingMs": 2462.632500000065
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.631Z",
            "id": 37101,
            "count": 3,
            "ms": 12.116600000066683
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.643Z",
            "id": 37102,
            "count": 3,
            "bytes": 535104,
            "remainingMs": 2438.4441000000807
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.655Z",
            "id": 37102,
            "count": 3,
            "ms": 12.193100000033155
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.666Z",
            "id": 37103,
            "count": 3,
            "bytes": 534270,
            "remainingMs": 2414.7815999999875
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.679Z",
            "id": 37103,
            "count": 3,
            "ms": 12.515199999907054
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.691Z",
            "id": 37104,
            "count": 3,
            "bytes": 533885,
            "remainingMs": 2390.360900000087
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.703Z",
            "id": 37104,
            "count": 3,
            "ms": 12.29390000004787
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.715Z",
            "id": 37105,
            "count": 3,
            "bytes": 532669,
            "remainingMs": 2366.5115000000224
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.727Z",
            "id": 37105,
            "count": 3,
            "ms": 12.43660000001546
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.738Z",
            "id": 37106,
            "count": 3,
            "bytes": 531709,
            "remainingMs": 2343.0627000000095
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.751Z",
            "id": 37106,
            "count": 3,
            "ms": 13.142400000011548
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.762Z",
            "id": 37107,
            "count": 3,
            "bytes": 531069,
            "remainingMs": 2319.018800000078
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.774Z",
            "id": 37107,
            "count": 3,
            "ms": 11.997200000099838
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.785Z",
            "id": 37108,
            "count": 3,
            "bytes": 530013,
            "remainingMs": 2296.028900000034
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.797Z",
            "id": 37108,
            "count": 3,
            "ms": 11.623299999977462
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.808Z",
            "id": 37109,
            "count": 3,
            "bytes": 527933,
            "remainingMs": 2273.634100000025
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.820Z",
            "id": 37109,
            "count": 3,
            "ms": 12.151399999973364
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.830Z",
            "id": 37110,
            "count": 3,
            "bytes": 526429,
            "remainingMs": 2251.2455000000773
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.842Z",
            "id": 37110,
            "count": 3,
            "ms": 11.859600000083447
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.852Z",
            "id": 37111,
            "count": 3,
            "bytes": 524509,
            "remainingMs": 2229.639599999995
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.863Z",
            "id": 37111,
            "count": 3,
            "ms": 11.50109999999404
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.873Z",
            "id": 37112,
            "count": 3,
            "bytes": 521434,
            "remainingMs": 2208.6340000000782
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.885Z",
            "id": 37112,
            "count": 3,
            "ms": 12.113500000094064
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.893Z",
            "id": 37113,
            "count": 3,
            "bytes": 520858,
            "remainingMs": 2187.823800000013
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.906Z",
            "id": 37113,
            "count": 3,
            "ms": 12.193100000033155
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.915Z",
            "id": 37114,
            "count": 3,
            "bytes": 519857,
            "remainingMs": 2166.6495000000577
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.927Z",
            "id": 37114,
            "count": 3,
            "ms": 12.88959999999497
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.937Z",
            "id": 37115,
            "count": 3,
            "bytes": 519089,
            "remainingMs": 2144.057299999986
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.951Z",
            "id": 37115,
            "count": 3,
            "ms": 13.971199999912642
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.960Z",
            "id": 37116,
            "count": 3,
            "bytes": 518257,
            "remainingMs": 2121.050900000031
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.973Z",
            "id": 37116,
            "count": 3,
            "ms": 12.997899999958463
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.982Z",
            "id": 37117,
            "count": 3,
            "bytes": 516721,
            "remainingMs": 2098.7421999999788
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:57.997Z",
            "id": 37117,
            "count": 3,
            "ms": 14.42449999996461
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:58.006Z",
            "id": 37118,
            "count": 3,
            "bytes": 514606,
            "remainingMs": 2075.033000000054
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:58.020Z",
            "id": 37118,
            "count": 3,
            "ms": 14.146999999997206
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:58.029Z",
            "id": 37119,
            "count": 3,
            "bytes": 510940,
            "remainingMs": 2052.5498999999836
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:58.041Z",
            "id": 37119,
            "count": 3,
            "ms": 12.491099999984726
          },
          {
            "type": "request",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:58.056Z",
            "id": 37120,
            "count": 3,
            "bytes": 553832,
            "remainingMs": 2025.1084000000264
          },
          {
            "type": "response",
            "label": "p4-18-s2:step-2356",
            "at": "2026-11-01T19:57:58.069Z",
            "id": 37120,
            "count": 3,
            "ms": 12.649499999941327
          }
        ],
        "packMs": 18971.57960000208
      },
      "wallMs": 978009.8391000001,
      "latency": {
        "model": {
          "count": 1043,
          "meanMs": 906.9771613614583,
          "p95Ms": 2550.9905000000144,
          "maxMs": 2917.4672000000137
        },
        "opponent": {
          "count": 1315,
          "meanMs": 20.054441216730257,
          "p95Ms": 65.83870000000752,
          "maxMs": 2804.0180999999866
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p4-18-s2\\p4-18-s2"
    },
    {
      "id": "p4-18-s3",
      "slot": 18,
      "seat": 3,
      "seed": 310018162,
      "opponent": "hard",
      "players": 4,
      "map": "(4) The Crucible.aem",
      "category": "advantage_endgame",
      "modelPlayer": 3,
      "initialSha256": "56ad3c842f847cf0f0a9a479e86acc2a0d0d0e1f25016a8fc0c49651fcfc51b9",
      "firstToActPlayer": 2,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 3,
      "firstPlace": 0,
      "normalizedRank": 0,
      "eliminations": [
        {
          "step": 5492,
          "ids": [
            3
          ],
          "averagePlace": 4,
          "normalizedRank": 0
        },
        {
          "step": 5949,
          "ids": [
            0
          ],
          "averagePlace": 3,
          "normalizedRank": 0.3333333333333333
        },
        {
          "step": 6578,
          "ids": [
            1
          ],
          "averagePlace": 2,
          "normalizedRank": 0.6666666666666666
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": true,
      "steps": 6579,
      "rounds": 110,
      "roots": 588,
      "witnessCount": 76,
      "witnessActions": 1328,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 50980,
        "observations": 166152,
        "completed": 50980,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 653374.742799981,
        "peakBatchSize": 32,
        "bytes": 22618477805,
        "decisionRequests": 50978,
        "decisionObservations": 166119,
        "completedDecisionObservations": 166119,
        "decisionWireMs": 650774.7528999811,
        "decisionPeakBatchSize": 32,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.586Z",
            "id": 50949,
            "count": 1,
            "bytes": 125928,
            "remainingMs": 1790.0082000000402
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.596Z",
            "id": 50949,
            "count": 1,
            "ms": 10.261699999915436
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.605Z",
            "id": 50950,
            "count": 4,
            "bytes": 481980,
            "remainingMs": 1771.1988000001293
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.618Z",
            "id": 50950,
            "count": 4,
            "ms": 13.242100000148639
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.633Z",
            "id": 50951,
            "count": 4,
            "bytes": 479732,
            "remainingMs": 1742.5543000001926
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.646Z",
            "id": 50951,
            "count": 4,
            "ms": 12.901100000133738
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.660Z",
            "id": 50952,
            "count": 1,
            "bytes": 117462,
            "remainingMs": 1715.8003000000026
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.670Z",
            "id": 50952,
            "count": 1,
            "ms": 9.898899999912828
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.678Z",
            "id": 50953,
            "count": 4,
            "bytes": 477412,
            "remainingMs": 1697.4995000001509
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.692Z",
            "id": 50953,
            "count": 4,
            "ms": 13.124900000169873
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.705Z",
            "id": 50954,
            "count": 3,
            "bytes": 352042,
            "remainingMs": 1671.1007000000682
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.716Z",
            "id": 50954,
            "count": 3,
            "ms": 11.17409999994561
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.725Z",
            "id": 50955,
            "count": 4,
            "bytes": 474241,
            "remainingMs": 1651.3643000000156
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.737Z",
            "id": 50955,
            "count": 4,
            "ms": 11.96889999997802
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.748Z",
            "id": 50956,
            "count": 3,
            "bytes": 352042,
            "remainingMs": 1628.2097000000067
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.759Z",
            "id": 50956,
            "count": 3,
            "ms": 11.314899999881163
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.767Z",
            "id": 50957,
            "count": 4,
            "bytes": 472109,
            "remainingMs": 1608.974000000162
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.781Z",
            "id": 50957,
            "count": 4,
            "ms": 13.5914000000339
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.793Z",
            "id": 50958,
            "count": 4,
            "bytes": 469916,
            "remainingMs": 1583.2806000001729
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.805Z",
            "id": 50958,
            "count": 4,
            "ms": 11.982500000158325
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.816Z",
            "id": 50959,
            "count": 4,
            "bytes": 488401,
            "remainingMs": 1559.5975999999791
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.829Z",
            "id": 50959,
            "count": 4,
            "ms": 12.955999999772757
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.833Z",
            "id": 50960,
            "count": 1,
            "bytes": 121696,
            "remainingMs": 1542.7773000001907
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.843Z",
            "id": 50960,
            "count": 1,
            "ms": 10.085000000195578
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.854Z",
            "id": 50961,
            "count": 4,
            "bytes": 514608,
            "remainingMs": 1521.9516000000294
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.867Z",
            "id": 50961,
            "count": 4,
            "ms": 12.64269999996759
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.891Z",
            "id": 50962,
            "count": 4,
            "bytes": 510367,
            "remainingMs": 1485.1321000000462
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.903Z",
            "id": 50962,
            "count": 4,
            "ms": 12.53249999997206
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.929Z",
            "id": 50963,
            "count": 1,
            "bytes": 121631,
            "remainingMs": 1447.4013000000268
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.940Z",
            "id": 50963,
            "count": 1,
            "ms": 11.228499999968335
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.949Z",
            "id": 50964,
            "count": 4,
            "bytes": 504470,
            "remainingMs": 1427.1205000001937
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.962Z",
            "id": 50964,
            "count": 4,
            "ms": 13.404500000178814
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:41.993Z",
            "id": 50965,
            "count": 4,
            "bytes": 477771,
            "remainingMs": 1382.4583000000566
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.005Z",
            "id": 50965,
            "count": 4,
            "ms": 11.819200000027195
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.016Z",
            "id": 50966,
            "count": 4,
            "bytes": 500886,
            "remainingMs": 1360.1220000002068
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.029Z",
            "id": 50966,
            "count": 4,
            "ms": 13.126900000032037
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.061Z",
            "id": 50967,
            "count": 3,
            "bytes": 364680,
            "remainingMs": 1315.3662000000477
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.075Z",
            "id": 50967,
            "count": 3,
            "ms": 14.265099999960512
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.084Z",
            "id": 50968,
            "count": 4,
            "bytes": 498581,
            "remainingMs": 1291.721600000048
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.097Z",
            "id": 50968,
            "count": 4,
            "ms": 12.344000000040978
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.125Z",
            "id": 50969,
            "count": 4,
            "bytes": 477870,
            "remainingMs": 1250.5134000000544
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.138Z",
            "id": 50969,
            "count": 4,
            "ms": 12.672599999932572
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.145Z",
            "id": 50970,
            "count": 3,
            "bytes": 369661,
            "remainingMs": 1230.6809000000358
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.157Z",
            "id": 50970,
            "count": 3,
            "ms": 11.92269999999553
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.182Z",
            "id": 50971,
            "count": 3,
            "bytes": 356363,
            "remainingMs": 1193.4946000000928
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.194Z",
            "id": 50971,
            "count": 3,
            "ms": 11.895899999886751
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.201Z",
            "id": 50972,
            "count": 3,
            "bytes": 366522,
            "remainingMs": 1175.0890999999829
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.213Z",
            "id": 50972,
            "count": 3,
            "ms": 11.749299999792129
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.236Z",
            "id": 50973,
            "count": 3,
            "bytes": 356372,
            "remainingMs": 1139.7273000001442
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.248Z",
            "id": 50973,
            "count": 3,
            "ms": 12.087000000057742
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.253Z",
            "id": 50974,
            "count": 2,
            "bytes": 239552,
            "remainingMs": 1123.1719000001904
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.263Z",
            "id": 50974,
            "count": 2,
            "ms": 10.644000000087544
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.276Z",
            "id": 50975,
            "count": 2,
            "bytes": 234913,
            "remainingMs": 1099.7919000000693
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.289Z",
            "id": 50975,
            "count": 2,
            "ms": 12.528699999907985
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.291Z",
            "id": 50976,
            "count": 1,
            "bytes": 123167,
            "remainingMs": 1084.8716000001878
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.301Z",
            "id": 50976,
            "count": 1,
            "ms": 10.449000000022352
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.307Z",
            "id": 50977,
            "count": 1,
            "bytes": 122492,
            "remainingMs": 1068.503400000045
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.317Z",
            "id": 50977,
            "count": 1,
            "ms": 9.921899999957532
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.323Z",
            "id": 50978,
            "count": 1,
            "bytes": 126606,
            "remainingMs": 1053.3597999999765
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.333Z",
            "id": 50978,
            "count": 1,
            "ms": 10.24669999978505
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.336Z",
            "id": 50979,
            "count": 1,
            "bytes": 131988,
            "remainingMs": 1040.2996000000276
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.346Z",
            "id": 50979,
            "count": 1,
            "ms": 10.05089999991469
          },
          {
            "type": "request",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.350Z",
            "id": 50980,
            "count": 1,
            "bytes": 125928,
            "remainingMs": 1025.4228000000585
          },
          {
            "type": "response",
            "label": "p4-18-s3:step-5446",
            "at": "2026-11-02T05:25:42.362Z",
            "id": 50980,
            "count": 1,
            "ms": 11.63620000006631
          }
        ],
        "packMs": 25589.71280001256
      },
      "wallMs": 1366894.8167,
      "latency": {
        "model": {
          "count": 1143,
          "meanMs": 1094.698029133858,
          "p95Ms": 2729.244399999967,
          "maxMs": 2921.2811999999685
        },
        "opponent": {
          "count": 5436,
          "meanMs": 18.604454654155344,
          "p95Ms": 60.478900000001886,
          "maxMs": 4291.399800000014
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p4-18-s3\\p4-18-s3"
    },
    {
      "id": "p4-19-s0",
      "slot": 19,
      "seat": 0,
      "seed": 310019171,
      "opponent": "hard",
      "players": 4,
      "map": "(4) classic 1.aem",
      "category": "advantage_endgame",
      "modelPlayer": 0,
      "initialSha256": "df974bfeb435b58c7997e280b61e60185f807054e413e7a30aaf211dd135cd89",
      "firstToActPlayer": 2,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 4,
      "firstPlace": 0,
      "normalizedRank": 0.6666666666666666,
      "eliminations": [
        {
          "step": 3234,
          "ids": [
            1
          ],
          "averagePlace": 4,
          "normalizedRank": 0
        },
        {
          "step": 3751,
          "ids": [
            2
          ],
          "averagePlace": 3,
          "normalizedRank": 0.3333333333333333
        },
        {
          "step": 4683,
          "ids": [
            0
          ],
          "averagePlace": 2,
          "normalizedRank": 0.6666666666666666
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 4684,
      "rounds": 79,
      "roots": 653,
      "witnessCount": 110,
      "witnessActions": 2156,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 60893,
        "observations": 194639,
        "completed": 60893,
        "lateResponses": 1,
        "softDeadlines": 1,
        "drainWaits": 1,
        "hardTimeouts": 0,
        "wireMs": 773240.9982000074,
        "peakBatchSize": 32,
        "bytes": 20793754080,
        "decisionRequests": 60891,
        "decisionObservations": 194606,
        "completedDecisionObservations": 194606,
        "decisionWireMs": 770605.1239000073,
        "decisionPeakBatchSize": 31,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.460Z",
            "id": 60862,
            "count": 2,
            "bytes": 261963,
            "remainingMs": 2122.977000000188
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.472Z",
            "id": 60862,
            "count": 2,
            "ms": 12.118300000205636
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.477Z",
            "id": 60863,
            "count": 2,
            "bytes": 260747,
            "remainingMs": 2105.44160000002
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.488Z",
            "id": 60863,
            "count": 2,
            "ms": 10.68640000000596
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.494Z",
            "id": 60864,
            "count": 2,
            "bytes": 259274,
            "remainingMs": 2088.5158000001684
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.508Z",
            "id": 60864,
            "count": 2,
            "ms": 14.005600000033155
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.514Z",
            "id": 60865,
            "count": 2,
            "bytes": 257609,
            "remainingMs": 2069.253299999982
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.524Z",
            "id": 60865,
            "count": 2,
            "ms": 10.945599999977276
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.530Z",
            "id": 60866,
            "count": 2,
            "bytes": 255587,
            "remainingMs": 2053.156500000041
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.540Z",
            "id": 60866,
            "count": 2,
            "ms": 10.703199999872595
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.545Z",
            "id": 60867,
            "count": 2,
            "bytes": 254082,
            "remainingMs": 2037.4920000000857
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.558Z",
            "id": 60867,
            "count": 2,
            "ms": 12.733599999919534
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.561Z",
            "id": 60868,
            "count": 1,
            "bytes": 127940,
            "remainingMs": 2021.8046000001486
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.573Z",
            "id": 60868,
            "count": 1,
            "ms": 12.44580000010319
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.577Z",
            "id": 60869,
            "count": 2,
            "bytes": 252159,
            "remainingMs": 2005.9981000002008
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.589Z",
            "id": 60869,
            "count": 2,
            "ms": 12.489600000204518
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.592Z",
            "id": 60870,
            "count": 1,
            "bytes": 127931,
            "remainingMs": 1991.036500000162
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.603Z",
            "id": 60870,
            "count": 1,
            "ms": 10.942000000039116
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.605Z",
            "id": 60871,
            "count": 1,
            "bytes": 123196,
            "remainingMs": 1978.1682000001892
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.616Z",
            "id": 60871,
            "count": 1,
            "ms": 11.845600000116974
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.621Z",
            "id": 60872,
            "count": 1,
            "bytes": 141433,
            "remainingMs": 1961.9010000000708
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4603",
            "at": "2026-11-02T05:49:33.633Z",
            "id": 60872,
            "count": 1,
            "ms": 12.10910000000149
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.065Z",
            "id": 60873,
            "count": 1,
            "bytes": 128458,
            "remainingMs": 2922.8310000000056
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.078Z",
            "id": 60873,
            "count": 1,
            "ms": 12.839900000020862
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.089Z",
            "id": 60874,
            "count": 5,
            "bytes": 639402,
            "remainingMs": 2898.8974999999627
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.104Z",
            "id": 60874,
            "count": 5,
            "ms": 15.295200000051409
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.157Z",
            "id": 60875,
            "count": 13,
            "bytes": 2060020,
            "remainingMs": 2830.0478999998886
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.182Z",
            "id": 60875,
            "count": 13,
            "ms": 24.606699999887496
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.195Z",
            "id": 60876,
            "count": 4,
            "bytes": 633680,
            "remainingMs": 2792.3662000000477
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.210Z",
            "id": 60876,
            "count": 4,
            "ms": 14.710800000000745
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.218Z",
            "id": 60877,
            "count": 2,
            "bytes": 275696,
            "remainingMs": 2769.5722999998834
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.229Z",
            "id": 60877,
            "count": 2,
            "ms": 10.93819999997504
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.241Z",
            "id": 60878,
            "count": 3,
            "bytes": 479240,
            "remainingMs": 2746.3910999998916
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.254Z",
            "id": 60878,
            "count": 3,
            "ms": 12.70699999993667
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.265Z",
            "id": 60879,
            "count": 2,
            "bytes": 314382,
            "remainingMs": 2722.0855000000447
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.276Z",
            "id": 60879,
            "count": 2,
            "ms": 10.543500000145286
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.286Z",
            "id": 60880,
            "count": 2,
            "bytes": 313614,
            "remainingMs": 2701.8900999999605
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.297Z",
            "id": 60880,
            "count": 2,
            "ms": 11.134799999883398
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.303Z",
            "id": 60881,
            "count": 2,
            "bytes": 275714,
            "remainingMs": 2685.0071999998763
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.317Z",
            "id": 60881,
            "count": 2,
            "ms": 14.410999999847263
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.325Z",
            "id": 60882,
            "count": 2,
            "bytes": 313806,
            "remainingMs": 2662.3003000000026
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.336Z",
            "id": 60882,
            "count": 2,
            "ms": 10.714099999982864
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.343Z",
            "id": 60883,
            "count": 2,
            "bytes": 275696,
            "remainingMs": 2644.336399999913
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.360Z",
            "id": 60883,
            "count": 2,
            "ms": 16.962199999950826
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.375Z",
            "id": 60884,
            "count": 4,
            "bytes": 634064,
            "remainingMs": 2613.0183999999426
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.389Z",
            "id": 60884,
            "count": 4,
            "ms": 13.976699999999255
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.402Z",
            "id": 60885,
            "count": 4,
            "bytes": 551220,
            "remainingMs": 2585.254399999976
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.417Z",
            "id": 60885,
            "count": 4,
            "ms": 14.884700000053272
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.434Z",
            "id": 60886,
            "count": 4,
            "bytes": 653748,
            "remainingMs": 2553.4321000000928
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.447Z",
            "id": 60886,
            "count": 4,
            "ms": 13.365400000009686
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.456Z",
            "id": 60887,
            "count": 2,
            "bytes": 286100,
            "remainingMs": 2531.841999999946
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.467Z",
            "id": 60887,
            "count": 2,
            "ms": 11.729300000006333
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.475Z",
            "id": 60888,
            "count": 2,
            "bytes": 325440,
            "remainingMs": 2512.3850000000093
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.487Z",
            "id": 60888,
            "count": 2,
            "ms": 12.012000000104308
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.491Z",
            "id": 60889,
            "count": 1,
            "bytes": 143136,
            "remainingMs": 2496.5625
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.502Z",
            "id": 60889,
            "count": 1,
            "ms": 11.072099999990314
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.506Z",
            "id": 60890,
            "count": 1,
            "bytes": 162214,
            "remainingMs": 2481.4228999998886
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.517Z",
            "id": 60890,
            "count": 1,
            "ms": 10.552499999990687
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.522Z",
            "id": 60891,
            "count": 1,
            "bytes": 161862,
            "remainingMs": 2465.6410000000615
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.532Z",
            "id": 60891,
            "count": 1,
            "ms": 10.517400000011548
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.537Z",
            "id": 60892,
            "count": 1,
            "bytes": 161030,
            "remainingMs": 2450.5431999999564
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.548Z",
            "id": 60892,
            "count": 1,
            "ms": 10.886699999915436
          },
          {
            "type": "request",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.551Z",
            "id": 60893,
            "count": 1,
            "bytes": 143136,
            "remainingMs": 2436.7557999999262
          },
          {
            "type": "response",
            "label": "p4-19-s0:step-4673",
            "at": "2026-11-02T05:49:34.561Z",
            "id": 60893,
            "count": 1,
            "ms": 10.096600000048056
          }
        ],
        "packMs": 25052.037299984237
      },
      "wallMs": 1407428.3643999998,
      "latency": {
        "model": {
          "count": 1299,
          "meanMs": 1035.8465742879148,
          "p95Ms": 2594.966800000053,
          "maxMs": 2932.119799999986
        },
        "opponent": {
          "count": 3385,
          "meanMs": 15.186419881832062,
          "p95Ms": 48.5433999998495,
          "maxMs": 2411.7402999999467
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p4-19-s0\\p4-19-s0"
    },
    {
      "id": "p4-19-s1",
      "slot": 19,
      "seat": 1,
      "seed": 310019171,
      "opponent": "hard",
      "players": 4,
      "map": "(4) classic 1.aem",
      "category": "advantage_endgame",
      "modelPlayer": 1,
      "initialSha256": "df974bfeb435b58c7997e280b61e60185f807054e413e7a30aaf211dd135cd89",
      "firstToActPlayer": 2,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_win",
      "winner": 2,
      "firstPlace": 1,
      "normalizedRank": 1,
      "eliminations": [
        {
          "step": 1281,
          "ids": [
            2
          ],
          "averagePlace": 4,
          "normalizedRank": 0
        },
        {
          "step": 1726,
          "ids": [
            0
          ],
          "averagePlace": 3,
          "normalizedRank": 0.3333333333333333
        },
        {
          "step": 1823,
          "ids": [
            3
          ],
          "averagePlace": 2,
          "normalizedRank": 0.6666666666666666
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 1824,
      "rounds": 30,
      "roots": 450,
      "witnessCount": 84,
      "witnessActions": 1182,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 33482,
        "observations": 106957,
        "completed": 33482,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 424673.3395000003,
        "peakBatchSize": 32,
        "bytes": 11833393361,
        "decisionRequests": 33480,
        "decisionObservations": 106924,
        "completedDecisionObservations": 106924,
        "decisionWireMs": 421934.0265000003,
        "decisionPeakBatchSize": 27,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.675Z",
            "id": 33451,
            "count": 3,
            "bytes": 409200,
            "remainingMs": 2858.244799999986
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.687Z",
            "id": 33451,
            "count": 3,
            "ms": 11.620400000014342
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.697Z",
            "id": 33452,
            "count": 2,
            "bytes": 271524,
            "remainingMs": 2836.4906999999657
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.708Z",
            "id": 33452,
            "count": 2,
            "ms": 11.636300000012852
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.718Z",
            "id": 33453,
            "count": 2,
            "bytes": 269476,
            "remainingMs": 2814.961799999932
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.729Z",
            "id": 33453,
            "count": 2,
            "ms": 10.676199999987148
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.738Z",
            "id": 33454,
            "count": 2,
            "bytes": 267458,
            "remainingMs": 2795.196499999962
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.749Z",
            "id": 33454,
            "count": 2,
            "ms": 10.586200000019744
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.757Z",
            "id": 33455,
            "count": 2,
            "bytes": 265186,
            "remainingMs": 2775.9127999999328
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.768Z",
            "id": 33455,
            "count": 2,
            "ms": 10.600699999951757
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.776Z",
            "id": 33456,
            "count": 2,
            "bytes": 263682,
            "remainingMs": 2756.8042999999598
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.788Z",
            "id": 33456,
            "count": 2,
            "ms": 11.481900000013411
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.796Z",
            "id": 33457,
            "count": 2,
            "bytes": 262274,
            "remainingMs": 2736.7722999999532
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.809Z",
            "id": 33457,
            "count": 2,
            "ms": 12.936299999943003
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.817Z",
            "id": 33458,
            "count": 2,
            "bytes": 260674,
            "remainingMs": 2716.383999999962
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.828Z",
            "id": 33458,
            "count": 2,
            "ms": 11.208899999968708
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.835Z",
            "id": 33459,
            "count": 2,
            "bytes": 259874,
            "remainingMs": 2698.18479999993
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.846Z",
            "id": 33459,
            "count": 2,
            "ms": 10.644999999902211
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.853Z",
            "id": 33460,
            "count": 2,
            "bytes": 258818,
            "remainingMs": 2679.7833999999566
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.864Z",
            "id": 33460,
            "count": 2,
            "ms": 10.614399999962188
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.872Z",
            "id": 33461,
            "count": 2,
            "bytes": 257922,
            "remainingMs": 2661.0823999999557
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.883Z",
            "id": 33461,
            "count": 2,
            "ms": 11.007699999958277
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.890Z",
            "id": 33462,
            "count": 2,
            "bytes": 256578,
            "remainingMs": 2643.1946999999927
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.902Z",
            "id": 33462,
            "count": 2,
            "ms": 11.554699999978766
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.908Z",
            "id": 33463,
            "count": 2,
            "bytes": 255394,
            "remainingMs": 2625.0753999999724
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.920Z",
            "id": 33463,
            "count": 2,
            "ms": 11.795599999953993
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.927Z",
            "id": 33464,
            "count": 2,
            "bytes": 253922,
            "remainingMs": 2606.2944000000134
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.939Z",
            "id": 33464,
            "count": 2,
            "ms": 12.070500000030734
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.945Z",
            "id": 33465,
            "count": 2,
            "bytes": 252801,
            "remainingMs": 2588.096799999941
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.955Z",
            "id": 33465,
            "count": 2,
            "ms": 10.177999999956228
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.962Z",
            "id": 33466,
            "count": 2,
            "bytes": 251104,
            "remainingMs": 2571.416599999997
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.972Z",
            "id": 33466,
            "count": 2,
            "ms": 10.120200000004843
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.978Z",
            "id": 33467,
            "count": 2,
            "bytes": 249320,
            "remainingMs": 2554.8466999999946
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.989Z",
            "id": 33467,
            "count": 2,
            "ms": 10.852199999964796
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:11.995Z",
            "id": 33468,
            "count": 2,
            "bytes": 248808,
            "remainingMs": 2538.317299999995
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.005Z",
            "id": 33468,
            "count": 2,
            "ms": 10.349099999992177
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.011Z",
            "id": 33469,
            "count": 2,
            "bytes": 248296,
            "remainingMs": 2522.181899999967
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.022Z",
            "id": 33469,
            "count": 2,
            "ms": 10.801600000006147
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.028Z",
            "id": 33470,
            "count": 2,
            "bytes": 247656,
            "remainingMs": 2505.32919999992
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.039Z",
            "id": 33470,
            "count": 2,
            "ms": 11.55019999993965
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.045Z",
            "id": 33471,
            "count": 2,
            "bytes": 246600,
            "remainingMs": 2487.728299999959
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.056Z",
            "id": 33471,
            "count": 2,
            "ms": 10.914400000008754
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.062Z",
            "id": 33472,
            "count": 2,
            "bytes": 245512,
            "remainingMs": 2471.4183000000194
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.073Z",
            "id": 33472,
            "count": 2,
            "ms": 10.874600000097416
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.078Z",
            "id": 33473,
            "count": 2,
            "bytes": 244231,
            "remainingMs": 2454.85699999996
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.090Z",
            "id": 33473,
            "count": 2,
            "ms": 11.76929999992717
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.095Z",
            "id": 33474,
            "count": 2,
            "bytes": 243395,
            "remainingMs": 2438.5007999999216
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.106Z",
            "id": 33474,
            "count": 2,
            "ms": 11.395999999949709
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.111Z",
            "id": 33475,
            "count": 2,
            "bytes": 242819,
            "remainingMs": 2422.5412999999244
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.122Z",
            "id": 33475,
            "count": 2,
            "ms": 11.524399999994785
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.127Z",
            "id": 33476,
            "count": 2,
            "bytes": 242024,
            "remainingMs": 2405.8392999999924
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.140Z",
            "id": 33476,
            "count": 2,
            "ms": 12.712399999960326
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.145Z",
            "id": 33477,
            "count": 2,
            "bytes": 241000,
            "remainingMs": 2388.6494999999413
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.155Z",
            "id": 33477,
            "count": 2,
            "ms": 10.446999999927357
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.160Z",
            "id": 33478,
            "count": 2,
            "bytes": 240296,
            "remainingMs": 2372.839500000002
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.171Z",
            "id": 33478,
            "count": 2,
            "ms": 10.943599999998696
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.176Z",
            "id": 33479,
            "count": 2,
            "bytes": 238790,
            "remainingMs": 2357.310899999924
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.187Z",
            "id": 33479,
            "count": 2,
            "ms": 10.947899999911897
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.191Z",
            "id": 33480,
            "count": 2,
            "bytes": 237311,
            "remainingMs": 2342.081499999971
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.203Z",
            "id": 33480,
            "count": 2,
            "ms": 11.556299999938346
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.206Z",
            "id": 33481,
            "count": 1,
            "bytes": 118483,
            "remainingMs": 2327.2506000000285
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.216Z",
            "id": 33481,
            "count": 1,
            "ms": 9.64110000000801
          },
          {
            "type": "request",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.223Z",
            "id": 33482,
            "count": 2,
            "bytes": 274852,
            "remainingMs": 2310.156699999934
          },
          {
            "type": "response",
            "label": "p4-19-s1:step-1822",
            "at": "2026-11-02T06:02:12.234Z",
            "id": 33482,
            "count": 2,
            "ms": 10.872199999983422
          }
        ],
        "packMs": 14371.112499996487
      },
      "wallMs": 752584.7233,
      "latency": {
        "model": {
          "count": 907,
          "meanMs": 810.9137922822488,
          "p95Ms": 2540.3055999999633,
          "maxMs": 2912.317299999999
        },
        "opponent": {
          "count": 917,
          "meanMs": 13.714884514721584,
          "p95Ms": 59.12029999998049,
          "maxMs": 369.04049999999916
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p4-19-s1\\p4-19-s1"
    },
    {
      "id": "p4-19-s2",
      "slot": 19,
      "seat": 2,
      "seed": 310019171,
      "opponent": "hard",
      "players": 4,
      "map": "(4) classic 1.aem",
      "category": "advantage_endgame",
      "modelPlayer": 2,
      "initialSha256": "df974bfeb435b58c7997e280b61e60185f807054e413e7a30aaf211dd135cd89",
      "firstToActPlayer": 2,
      "actualHand": "first",
      "natural": true,
      "classification": "natural_loss",
      "winner": 4,
      "firstPlace": 0,
      "normalizedRank": 0.3333333333333333,
      "eliminations": [
        {
          "step": 956,
          "ids": [
            0
          ],
          "averagePlace": 4,
          "normalizedRank": 0
        },
        {
          "step": 1358,
          "ids": [
            2
          ],
          "averagePlace": 3,
          "normalizedRank": 0.3333333333333333
        },
        {
          "step": 1762,
          "ids": [
            1
          ],
          "averagePlace": 2,
          "normalizedRank": 0.6666666666666666
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": true,
      "steps": 1763,
      "rounds": 28,
      "roots": 104,
      "witnessCount": 21,
      "witnessActions": 446,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 9109,
        "observations": 29731,
        "completed": 9109,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 117715.81189999996,
        "peakBatchSize": 32,
        "bytes": 3564267829,
        "decisionRequests": 9107,
        "decisionObservations": 29698,
        "completedDecisionObservations": 29698,
        "decisionWireMs": 115054.69189999996,
        "decisionPeakBatchSize": 28,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.404Z",
            "id": 9078,
            "count": 4,
            "bytes": 436970,
            "remainingMs": 929.6399999999849
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.417Z",
            "id": 9078,
            "count": 4,
            "ms": 12.79089999999269
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.428Z",
            "id": 9079,
            "count": 1,
            "bytes": 105208,
            "remainingMs": 905.920299999998
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.439Z",
            "id": 9079,
            "count": 1,
            "ms": 11.316500000015367
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.445Z",
            "id": 9080,
            "count": 4,
            "bytes": 431073,
            "remainingMs": 888.6379000000015
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.462Z",
            "id": 9080,
            "count": 4,
            "ms": 16.862300000007963
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.476Z",
            "id": 9081,
            "count": 4,
            "bytes": 429054,
            "remainingMs": 857.1626999999862
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.489Z",
            "id": 9081,
            "count": 4,
            "ms": 12.384900000004563
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.502Z",
            "id": 9082,
            "count": 4,
            "bytes": 427996,
            "remainingMs": 832.0315999999875
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.514Z",
            "id": 9082,
            "count": 4,
            "ms": 12.054999999993015
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.526Z",
            "id": 9083,
            "count": 4,
            "bytes": 426516,
            "remainingMs": 807.2574000000022
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.539Z",
            "id": 9083,
            "count": 4,
            "ms": 13.14000000001397
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.550Z",
            "id": 9084,
            "count": 3,
            "bytes": 338893,
            "remainingMs": 783.6933999999892
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.563Z",
            "id": 9084,
            "count": 3,
            "ms": 12.674800000007963
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.570Z",
            "id": 9085,
            "count": 4,
            "bytes": 438924,
            "remainingMs": 763.8604999999807
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.583Z",
            "id": 9085,
            "count": 4,
            "ms": 13.68849999998929
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.594Z",
            "id": 9086,
            "count": 4,
            "bytes": 458521,
            "remainingMs": 739.6971999999951
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.606Z",
            "id": 9086,
            "count": 4,
            "ms": 11.784600000013597
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.613Z",
            "id": 9087,
            "count": 4,
            "bytes": 456162,
            "remainingMs": 720.5415999999968
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.630Z",
            "id": 9087,
            "count": 4,
            "ms": 16.526699999987613
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.639Z",
            "id": 9088,
            "count": 4,
            "bytes": 476959,
            "remainingMs": 694.4567999999854
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.653Z",
            "id": 9088,
            "count": 4,
            "ms": 14.193999999988591
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.663Z",
            "id": 9089,
            "count": 4,
            "bytes": 454546,
            "remainingMs": 670.0570000000007
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.677Z",
            "id": 9089,
            "count": 4,
            "ms": 13.290100000012899
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.692Z",
            "id": 9090,
            "count": 3,
            "bytes": 333047,
            "remainingMs": 641.6258999999845
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.704Z",
            "id": 9090,
            "count": 3,
            "ms": 11.82709999999497
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.713Z",
            "id": 9091,
            "count": 4,
            "bytes": 445521,
            "remainingMs": 620.431899999996
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.726Z",
            "id": 9091,
            "count": 4,
            "ms": 12.464500000001863
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.741Z",
            "id": 9092,
            "count": 2,
            "bytes": 214475,
            "remainingMs": 592.0896999999823
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.752Z",
            "id": 9092,
            "count": 2,
            "ms": 10.707399999984773
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.760Z",
            "id": 9093,
            "count": 4,
            "bytes": 433246,
            "remainingMs": 573.1429000000062
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.774Z",
            "id": 9093,
            "count": 4,
            "ms": 13.786300000007031
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.791Z",
            "id": 9094,
            "count": 2,
            "bytes": 210211,
            "remainingMs": 542.0626000000047
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.805Z",
            "id": 9094,
            "count": 2,
            "ms": 13.43550000002142
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.814Z",
            "id": 9095,
            "count": 4,
            "bytes": 429369,
            "remainingMs": 519.8957999999984
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.826Z",
            "id": 9095,
            "count": 4,
            "ms": 12.316900000005262
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.846Z",
            "id": 9096,
            "count": 4,
            "bytes": 416210,
            "remainingMs": 487.9396999999881
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.858Z",
            "id": 9096,
            "count": 4,
            "ms": 12.70209999999497
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.866Z",
            "id": 9097,
            "count": 4,
            "bytes": 421702,
            "remainingMs": 467.58739999998943
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.879Z",
            "id": 9097,
            "count": 4,
            "ms": 13.029999999998836
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.898Z",
            "id": 9098,
            "count": 2,
            "bytes": 206075,
            "remainingMs": 435.6933999999892
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.910Z",
            "id": 9098,
            "count": 2,
            "ms": 12.393599999981234
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.914Z",
            "id": 9099,
            "count": 2,
            "bytes": 214162,
            "remainingMs": 419.46059999999125
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.925Z",
            "id": 9099,
            "count": 2,
            "ms": 10.842299999989336
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.934Z",
            "id": 9100,
            "count": 1,
            "bytes": 105240,
            "remainingMs": 399.7159999999858
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.944Z",
            "id": 9100,
            "count": 1,
            "ms": 9.747600000002421
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.947Z",
            "id": 9101,
            "count": 2,
            "bytes": 208391,
            "remainingMs": 386.4297999999835
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.958Z",
            "id": 9101,
            "count": 2,
            "ms": 11.293899999989662
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.965Z",
            "id": 9102,
            "count": 2,
            "bytes": 206009,
            "remainingMs": 368.13430000000517
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.979Z",
            "id": 9102,
            "count": 2,
            "ms": 13.737600000022212
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.984Z",
            "id": 9103,
            "count": 2,
            "bytes": 203120,
            "remainingMs": 349.37020000000484
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:53.995Z",
            "id": 9103,
            "count": 2,
            "ms": 10.575299999996787
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:54.002Z",
            "id": 9104,
            "count": 2,
            "bytes": 202220,
            "remainingMs": 331.53409999998985
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:54.013Z",
            "id": 9104,
            "count": 2,
            "ms": 10.763699999981327
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:54.017Z",
            "id": 9105,
            "count": 2,
            "bytes": 211246,
            "remainingMs": 316.11230000000796
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:54.031Z",
            "id": 9105,
            "count": 2,
            "ms": 13.926000000006752
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:54.035Z",
            "id": 9106,
            "count": 1,
            "bytes": 105208,
            "remainingMs": 298.90929999999935
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:54.044Z",
            "id": 9106,
            "count": 1,
            "ms": 9.269800000009127
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:54.047Z",
            "id": 9107,
            "count": 2,
            "bytes": 206156,
            "remainingMs": 286.3329000000085
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:54.057Z",
            "id": 9107,
            "count": 2,
            "ms": 9.890800000022864
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:54.062Z",
            "id": 9108,
            "count": 2,
            "bytes": 215896,
            "remainingMs": 271.6186999999918
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:54.073Z",
            "id": 9108,
            "count": 2,
            "ms": 10.887900000001537
          },
          {
            "type": "request",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:54.078Z",
            "id": 9109,
            "count": 2,
            "bytes": 215203,
            "remainingMs": 255.82730000000447
          },
          {
            "type": "response",
            "label": "p4-19-s2:step-1195",
            "at": "2026-11-02T06:05:54.089Z",
            "id": 9109,
            "count": 2,
            "ms": 11.550700000021607
          }
        ],
        "packMs": 4183.695599999344
      },
      "wallMs": 223709.3421,
      "latency": {
        "model": {
          "count": 205,
          "meanMs": 984.488789268293,
          "p95Ms": 2613.2897999999986,
          "maxMs": 2918.8099
        },
        "opponent": {
          "count": 1558,
          "meanMs": 11.284137419768868,
          "p95Ms": 37.99029999997583,
          "maxMs": 728.049399999989
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p4-19-s2\\p4-19-s2"
    },
    {
      "id": "p4-19-s3",
      "slot": 19,
      "seat": 3,
      "seed": 310019171,
      "opponent": "hard",
      "players": 4,
      "map": "(4) classic 1.aem",
      "category": "advantage_endgame",
      "modelPlayer": 3,
      "initialSha256": "df974bfeb435b58c7997e280b61e60185f807054e413e7a30aaf211dd135cd89",
      "firstToActPlayer": 2,
      "actualHand": "later",
      "natural": true,
      "classification": "natural_loss",
      "winner": 2,
      "firstPlace": 0,
      "normalizedRank": 0.6666666666666666,
      "eliminations": [
        {
          "step": 2418,
          "ids": [
            2
          ],
          "averagePlace": 4,
          "normalizedRank": 0
        },
        {
          "step": 3085,
          "ids": [
            0
          ],
          "averagePlace": 3,
          "normalizedRank": 0.3333333333333333
        },
        {
          "step": 3350,
          "ids": [
            3
          ],
          "averagePlace": 2,
          "normalizedRank": 0.6666666666666666
        }
      ],
      "earlyEliminated": false,
      "eliminatedBeforeFinalOpponent": false,
      "steps": 3351,
      "rounds": 54,
      "roots": 427,
      "witnessCount": 78,
      "witnessActions": 1582,
      "allSavedWitnessesLegal": true,
      "error": null,
      "transportFault": false,
      "runtimeSha256": "e51ff9963c66c8d738989caec4b05797d36e1568ff4784c0cf4f0bd2a1e84a7d",
      "inferenceDiagnostics": {
        "requests": 41150,
        "observations": 131628,
        "completed": 41150,
        "lateResponses": 0,
        "softDeadlines": 0,
        "drainWaits": 0,
        "hardTimeouts": 0,
        "wireMs": 516058.4580999999,
        "peakBatchSize": 32,
        "bytes": 14796316163,
        "decisionRequests": 41148,
        "decisionObservations": 131595,
        "completedDecisionObservations": 131595,
        "decisionWireMs": 513435.18469999987,
        "decisionPeakBatchSize": 29,
        "inFlight": null,
        "failure": null,
        "lastEvents": [
          {
            "type": "request",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.807Z",
            "id": 41119,
            "count": 1,
            "bytes": 154366,
            "remainingMs": 2188.580100000021
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.816Z",
            "id": 41119,
            "count": 1,
            "ms": 9.846900000004098
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.820Z",
            "id": 41120,
            "count": 1,
            "bytes": 153342,
            "remainingMs": 2175.158999999985
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.830Z",
            "id": 41120,
            "count": 1,
            "ms": 9.545199999934994
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.833Z",
            "id": 41121,
            "count": 1,
            "bytes": 152349,
            "remainingMs": 2161.6790999999503
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.844Z",
            "id": 41121,
            "count": 1,
            "ms": 10.435499999905005
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.847Z",
            "id": 41122,
            "count": 1,
            "bytes": 152189,
            "remainingMs": 2147.95279999997
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.858Z",
            "id": 41122,
            "count": 1,
            "ms": 10.453899999964051
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.861Z",
            "id": 41123,
            "count": 1,
            "bytes": 150938,
            "remainingMs": 2134.1944999999832
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.871Z",
            "id": 41123,
            "count": 1,
            "ms": 9.660299999988638
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.874Z",
            "id": 41124,
            "count": 1,
            "bytes": 150010,
            "remainingMs": 2121.3634999999776
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.885Z",
            "id": 41124,
            "count": 1,
            "ms": 10.731099999975413
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.887Z",
            "id": 41125,
            "count": 1,
            "bytes": 149080,
            "remainingMs": 2107.778500000015
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.898Z",
            "id": 41125,
            "count": 1,
            "ms": 10.890800000051968
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.901Z",
            "id": 41126,
            "count": 1,
            "bytes": 148458,
            "remainingMs": 2094.2441999999573
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.911Z",
            "id": 41126,
            "count": 1,
            "ms": 9.6583999999566
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.912Z",
            "id": 41127,
            "count": 1,
            "bytes": 148628,
            "remainingMs": 2082.6735000000335
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.923Z",
            "id": 41127,
            "count": 1,
            "ms": 10.85620000003837
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.926Z",
            "id": 41128,
            "count": 1,
            "bytes": 154585,
            "remainingMs": 2069.2386000000406
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.937Z",
            "id": 41128,
            "count": 1,
            "ms": 10.787300000083633
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.939Z",
            "id": 41129,
            "count": 1,
            "bytes": 153907,
            "remainingMs": 2056.1165000000037
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.949Z",
            "id": 41129,
            "count": 1,
            "ms": 10.065799999982119
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.952Z",
            "id": 41130,
            "count": 1,
            "bytes": 143494,
            "remainingMs": 2043.5289999999804
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3266",
            "at": "2026-11-02T06:21:50.961Z",
            "id": 41130,
            "count": 1,
            "ms": 9.697599999955855
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.507Z",
            "id": 41131,
            "count": 1,
            "bytes": 154393,
            "remainingMs": 2922.6762000001036
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.520Z",
            "id": 41131,
            "count": 1,
            "ms": 12.71750000002794
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.528Z",
            "id": 41132,
            "count": 3,
            "bytes": 461377,
            "remainingMs": 2901.8536000000313
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.539Z",
            "id": 41132,
            "count": 3,
            "ms": 11.50249999994412
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.573Z",
            "id": 41133,
            "count": 7,
            "bytes": 1315517,
            "remainingMs": 2856.2616000000853
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.592Z",
            "id": 41133,
            "count": 7,
            "ms": 18.692600000067614
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.605Z",
            "id": 41134,
            "count": 4,
            "bytes": 752607,
            "remainingMs": 2824.681600000011
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.619Z",
            "id": 41134,
            "count": 4,
            "ms": 14.51789999997709
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.637Z",
            "id": 41135,
            "count": 3,
            "bytes": 489525,
            "remainingMs": 2792.5195999999996
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.651Z",
            "id": 41135,
            "count": 3,
            "ms": 13.435599999967963
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.669Z",
            "id": 41136,
            "count": 4,
            "bytes": 767578,
            "remainingMs": 2760.719700000016
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.684Z",
            "id": 41136,
            "count": 4,
            "ms": 15.08089999994263
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.714Z",
            "id": 41137,
            "count": 4,
            "bytes": 764626,
            "remainingMs": 2715.752300000051
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.732Z",
            "id": 41137,
            "count": 4,
            "ms": 18.351499999989755
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.760Z",
            "id": 41138,
            "count": 4,
            "bytes": 762810,
            "remainingMs": 2669.8816000000807
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.774Z",
            "id": 41138,
            "count": 4,
            "ms": 13.96889999997802
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.787Z",
            "id": 41139,
            "count": 1,
            "bytes": 165189,
            "remainingMs": 2642.9459000000497
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.797Z",
            "id": 41139,
            "count": 1,
            "ms": 10.79769999999553
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.814Z",
            "id": 41140,
            "count": 4,
            "bytes": 755441,
            "remainingMs": 2615.656799999997
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.828Z",
            "id": 41140,
            "count": 4,
            "ms": 14.020900000003166
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.855Z",
            "id": 41141,
            "count": 4,
            "bytes": 752953,
            "remainingMs": 2574.989500000025
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.868Z",
            "id": 41141,
            "count": 4,
            "ms": 13.257600000011735
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.881Z",
            "id": 41142,
            "count": 2,
            "bytes": 336039,
            "remainingMs": 2548.9718000000576
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.894Z",
            "id": 41142,
            "count": 2,
            "ms": 13.731299999984913
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.907Z",
            "id": 41143,
            "count": 3,
            "bytes": 559289,
            "remainingMs": 2522.422600000049
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.920Z",
            "id": 41143,
            "count": 3,
            "ms": 13.259599999990314
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.929Z",
            "id": 41144,
            "count": 1,
            "bytes": 159475,
            "remainingMs": 2500.185300000012
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.940Z",
            "id": 41144,
            "count": 1,
            "ms": 10.606900000013411
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.945Z",
            "id": 41145,
            "count": 1,
            "bytes": 185307,
            "remainingMs": 2484.713800000027
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.955Z",
            "id": 41145,
            "count": 1,
            "ms": 10.305300000007264
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.961Z",
            "id": 41146,
            "count": 1,
            "bytes": 184475,
            "remainingMs": 2468.2656000000425
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.972Z",
            "id": 41146,
            "count": 1,
            "ms": 10.889899999951012
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.978Z",
            "id": 41147,
            "count": 1,
            "bytes": 184091,
            "remainingMs": 2451.635600000038
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.988Z",
            "id": 41147,
            "count": 1,
            "ms": 9.944599999929778
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:51.995Z",
            "id": 41148,
            "count": 1,
            "bytes": 183355,
            "remainingMs": 2435.027100000065
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:52.006Z",
            "id": 41148,
            "count": 1,
            "ms": 11.224700000020675
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:52.010Z",
            "id": 41149,
            "count": 1,
            "bytes": 165189,
            "remainingMs": 2419.688300000038
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:52.020Z",
            "id": 41149,
            "count": 1,
            "ms": 10.571499999961816
          },
          {
            "type": "request",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:52.025Z",
            "id": 41150,
            "count": 1,
            "bytes": 182651,
            "remainingMs": 2404.8125
          },
          {
            "type": "response",
            "label": "p4-19-s3:step-3335",
            "at": "2026-11-02T06:21:52.035Z",
            "id": 41150,
            "count": 1,
            "ms": 9.834999999962747
          }
        ],
        "packMs": 17545.21579999758
      },
      "wallMs": 946387.5545,
      "latency": {
        "model": {
          "count": 835,
          "meanMs": 1074.813306227546,
          "p95Ms": 2628.053799999994,
          "maxMs": 2920.6250999999975
        },
        "opponent": {
          "count": 2516,
          "meanMs": 16.46696359300436,
          "p95Ms": 60.90590000001248,
          "maxMs": 1266.221200000029
        }
      },
      "artifactDirectory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\C1\\p4-19-s3\\p4-19-s3"
    }
  ],
  "scores": {
    "byPlayers": {
      "2": {
        "attempted": 20,
        "natural": 20,
        "wins": 7,
        "conservativeWin": 0.35,
        "conservativeRank": 0.35,
        "winBounds": [
          0.35,
          0.35
        ],
        "rankBounds": [
          0.35,
          0.35
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
        "wins": 10,
        "conservativeWin": 0.5555555555555556,
        "conservativeRank": 0.6111111111111112,
        "winBounds": [
          0.5555555555555556,
          0.5555555555555556
        ],
        "rankBounds": [
          0.6111111111111112,
          0.6111111111111112
        ],
        "earlyEliminations": 6,
        "roundTruncations": 0,
        "wallTruncations": 0,
        "actionTruncations": 0,
        "errors": 0,
        "timeForfeits": 0
      },
      "4": {
        "attempted": 16,
        "natural": 16,
        "wins": 6,
        "conservativeWin": 0.375,
        "conservativeRank": 0.6458333333333333,
        "winBounds": [
          0.375,
          0.375
        ],
        "rankBounds": [
          0.6458333333333333,
          0.6458333333333333
        ],
        "earlyEliminations": 5,
        "roundTruncations": 0,
        "wallTruncations": 0,
        "actionTruncations": 0,
        "errors": 0,
        "timeForfeits": 0
      }
    },
    "equalWin": 0.4268518518518518,
    "equalRank": 0.5356481481481481,
    "equalWinBounds": [
      0.4268518518518518,
      0.4268518518518518
    ],
    "equalRankBounds": [
      0.5356481481481481,
      0.5356481481481481
    ],
    "allNatural": true,
    "missing": 0
  },
  "telemetry": {
    "completeCoverage": true,
    "substantiveByPlayers": {
      "2": {
        "roots": 2714,
        "comparisons": 2714,
        "rate": 1
      },
      "3": {
        "roots": 6710,
        "comparisons": 6602,
        "rate": 0.9839046199701937
      },
      "4": {
        "roots": 7238,
        "comparisons": 6847,
        "rate": 0.9459795523625311
      }
    },
    "directory": "D:\\AncientEmpiresData\\continuation_stage4_v6_20261102_v1\\full-C1",
    "decisions": 32798,
    "nonUniqueNonQueuedRoots": 16662,
    "queued": 16136,
    "unique": 0,
    "substantiveComparisons": 16163,
    "substantiveRate": 0.9700516144520466,
    "rootMeanMs": 1616.6345577541697,
    "rootP95Ms": 2797.1453999999794,
    "rootMaxMs": 2931.7557999999262,
    "overBudget": 0,
    "overBudgetRate": 0,
    "timeForfeits": 0,
    "meanOwnNodes": 19.89437042371864,
    "meanResponseNodes": 265.8013443764254,
    "meanBatchSize": 3.2096151421338552,
    "peakBatchSize": 34,
    "observations": 3640047,
    "physicalForward": null,
    "networkObservationsPerSecond": 236.58617513806013,
    "parityBenchSpeedupVsSerial": 6.116233583411965,
    "parityFile": "GPU_BATCH_PARITY.json",
    "paritySha256": "1fafc16a10ec96be62f1ec6a7cf928b12f2104911f93401c990ff4d4a7df377f",
    "responseByPlayers": {
      "2": {
        "complete": 20115,
        "truncated": 14,
        "rate": 0.9993044860648815
      },
      "3": {
        "complete": 46645,
        "truncated": 5406,
        "rate": 0.8961403239130853
      },
      "4": {
        "complete": 41399,
        "truncated": 12960,
        "rate": 0.7615850181202745
      }
    },
    "teacherValid": 16164,
    "invalidTeacher": 0,
    "teacherUnavailable": 498,
    "vetoed": 170,
    "responseReasons": {
      "complete": 108159,
      "budget_shed_for_top2": 4498,
      "cohort_deferred": 12753,
      "no_policy_before_cutoff": 658,
      "incomplete_chain": 385,
      "unevaluated_leaf": 86
    },
    "responseFullActions": 211682044,
    "responseProposalActions": 121120815,
    "budgetExpirations": 3,
    "budgetDiscardedObservations": 5,
    "witnesses": 2807,
    "witnessActions": 45601,
    "allSavedWitnessesLegal": true,
    "labels": "只对完整post_response目标归一化；无完整叶时教师标签不可用，零向量不得用于蒸馏；吞吐含IPC，不含CPU编码。"
  }
}
