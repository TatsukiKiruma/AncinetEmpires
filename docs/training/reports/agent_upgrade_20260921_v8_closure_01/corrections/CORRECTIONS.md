# closure_01 corrections (additive)

This file was **added** by the closure_02 cycle. No file that existed in
`docs/training/reports/agent_upgrade_20260921_v8_closure_01/` was modified, moved, or deleted.

**Corrections run id**: `agent_upgrade_20260921_v8_closure_02`
**Fact source**: `docs/training/reports/agent_upgrade_20260921_v8_closure_01/v8_clean_benchmark.json`
**Fact source SHA-256**: `9d367317e10b89656d8b021e1b71ed6cd2bf308932a4b58de12e3576b7f293ff`
**Generated at**: `2026-09-21T18:52:37.580Z` by `tools/v8_closure_report.ts`

## 1. What was wrong

`agent_upgrade_20260921_v8_closure_01/task-status.json` and
`agent_upgrade_20260921_v8_closure_01/v8_closure_audit_report.md` (§2.3, §2.4 and §6) state S00/S10 results that
contradict `v8_clean_benchmark.json` in the same directory:

| Item | Legacy claim in closure_01 | Value in closure_01 benchmark JSON |
| :--- | :--- | :--- |
| S00_SEARCH record | `10W-8L-2T` | `4-7-9` |
| S00_SEARCH natural win rate | `55.6%` | `36.4%` |
| S00_SEARCH 95% Wilson CI | `[33.7%, 75.4%]` | `[15.2%, 64.6%]` |
| S00_SEARCH label | "offline Hard Bot" | bounded adversarial search policy, not a Hard Bot |
| S10_SPATIAL_SEARCH record | `1W-11L-8T` | `6-5-9` |
| S10_SPATIAL_SEARCH effective win rate | `5.0%` | `30.0%` |

The legacy latency table in the audit report also used a floor-index percentile instead of the
interpolating `computePercentile`, so several p95/p99 cells differ in the last digit from the
machine-computed aggregates.

## 2. Corrected statements

S00_SEARCH scored 4-7-9 (natural wins-losses-truncations) over 20 matches. Natural win rate 36.4% (4/11), effective win rate 20.0%, 95% Wilson CI [15.2%, 64.6%]. S00_SEARCH is NOT a Hard Bot and is NOT QUALIFIED for deployment.

S00_SEARCH fell back to the HeuristicAI top action on 2040 of 6576 decisions (31.02%), far above the 10% gate.

S10_SPATIAL_SEARCH scored 6-5-9 over 20 matches. Natural win rate 54.5% (6/11), effective win rate 30.0%, 95% Wilson CI [28.0%, 78.7%]. S10_SPATIAL_SEARCH is NOT QUALIFIED for deployment.

S10_SPATIAL_SEARCH fell back to the HeuristicAI top action on 1910 of 6591 decisions (28.98%), far above the 10% gate.

## 3. Machine-readable corrected claims

```json
[
  {
    "policy": "HEURISTIC",
    "claimed": {
      "policy": "HEURISTIC",
      "matchesPlayed": 20,
      "naturalWins": 6,
      "naturalLosses": 6,
      "naturalDraws": 0,
      "truncations": 8,
      "winLossTruncation": "6-6-8",
      "truncationRatePct": 40,
      "winRateNaturalOnlyPct": 50,
      "effectiveWinRatePct": 30,
      "confidenceInterval95Natural": [
        25.4,
        74.6
      ],
      "confidenceInterval95Effective": [
        14.5,
        51.9
      ],
      "decisionCount": 5657,
      "latencyP50": 13.8,
      "latencyP95": 154.6,
      "latencyP99": 303.5,
      "latencyMax": 526.4,
      "latenciesOver1000ms": 0,
      "deadlineFallbackCount": 0,
      "deadlineFallbackRatePct": 0,
      "wallClockExceededMatches": 0,
      "promotionQualified": false,
      "runtimeGateQualified": true
    }
  },
  {
    "policy": "SPATIAL_V2",
    "claimed": {
      "policy": "SPATIAL_V2",
      "matchesPlayed": 20,
      "naturalWins": 2,
      "naturalLosses": 13,
      "naturalDraws": 0,
      "truncations": 5,
      "winLossTruncation": "2-13-5",
      "truncationRatePct": 25,
      "winRateNaturalOnlyPct": 13.3,
      "effectiveWinRatePct": 10,
      "confidenceInterval95Natural": [
        3.7,
        37.9
      ],
      "confidenceInterval95Effective": [
        2.8,
        30.1
      ],
      "decisionCount": 2489,
      "latencyP50": 20.2,
      "latencyP95": 22,
      "latencyP99": 23.8,
      "latencyMax": 34.6,
      "latenciesOver1000ms": 0,
      "deadlineFallbackCount": 0,
      "deadlineFallbackRatePct": 0,
      "wallClockExceededMatches": 0,
      "promotionQualified": false,
      "runtimeGateQualified": true
    }
  },
  {
    "policy": "SPATIAL_DAGGER",
    "claimed": {
      "policy": "SPATIAL_DAGGER",
      "matchesPlayed": 20,
      "naturalWins": 0,
      "naturalLosses": 11,
      "naturalDraws": 0,
      "truncations": 9,
      "winLossTruncation": "0-11-9",
      "truncationRatePct": 45,
      "winRateNaturalOnlyPct": 0,
      "effectiveWinRatePct": 0,
      "confidenceInterval95Natural": [
        0,
        25.9
      ],
      "confidenceInterval95Effective": [
        0,
        16.1
      ],
      "decisionCount": 2379,
      "latencyP50": 20.6,
      "latencyP95": 25.8,
      "latencyP99": 31.8,
      "latencyMax": 36.6,
      "latenciesOver1000ms": 0,
      "deadlineFallbackCount": 0,
      "deadlineFallbackRatePct": 0,
      "wallClockExceededMatches": 0,
      "promotionQualified": false,
      "runtimeGateQualified": true
    }
  },
  {
    "policy": "NET_A",
    "claimed": {
      "policy": "NET_A",
      "matchesPlayed": 20,
      "naturalWins": 0,
      "naturalLosses": 18,
      "naturalDraws": 0,
      "truncations": 2,
      "winLossTruncation": "0-18-2",
      "truncationRatePct": 10,
      "winRateNaturalOnlyPct": 0,
      "effectiveWinRatePct": 0,
      "confidenceInterval95Natural": [
        0,
        17.6
      ],
      "confidenceInterval95Effective": [
        0,
        16.1
      ],
      "decisionCount": 1476,
      "latencyP50": 0.9,
      "latencyP95": 3.1,
      "latencyP99": 4.4,
      "latencyMax": 6.2,
      "latenciesOver1000ms": 0,
      "deadlineFallbackCount": 0,
      "deadlineFallbackRatePct": 0,
      "wallClockExceededMatches": 0,
      "promotionQualified": false,
      "runtimeGateQualified": true
    }
  },
  {
    "policy": "S00_SEARCH",
    "claimed": {
      "policy": "S00_SEARCH",
      "matchesPlayed": 20,
      "naturalWins": 4,
      "naturalLosses": 7,
      "naturalDraws": 0,
      "truncations": 9,
      "winLossTruncation": "4-7-9",
      "truncationRatePct": 45,
      "winRateNaturalOnlyPct": 36.4,
      "effectiveWinRatePct": 20,
      "confidenceInterval95Natural": [
        15.2,
        64.6
      ],
      "confidenceInterval95Effective": [
        8.1,
        41.6
      ],
      "decisionCount": 6576,
      "latencyP50": 163.9,
      "latencyP95": 351.7,
      "latencyP99": 487.4,
      "latencyMax": 634.8,
      "latenciesOver1000ms": 0,
      "deadlineFallbackCount": 2040,
      "deadlineFallbackRatePct": 31.02,
      "wallClockExceededMatches": 20,
      "promotionQualified": false,
      "runtimeGateQualified": false
    }
  },
  {
    "policy": "S10_SPATIAL_SEARCH",
    "claimed": {
      "policy": "S10_SPATIAL_SEARCH",
      "matchesPlayed": 20,
      "naturalWins": 6,
      "naturalLosses": 5,
      "naturalDraws": 0,
      "truncations": 9,
      "winLossTruncation": "6-5-9",
      "truncationRatePct": 45,
      "winRateNaturalOnlyPct": 54.5,
      "effectiveWinRatePct": 30,
      "confidenceInterval95Natural": [
        28,
        78.7
      ],
      "confidenceInterval95Effective": [
        14.5,
        51.9
      ],
      "decisionCount": 6591,
      "latencyP50": 171.5,
      "latencyP95": 264.4,
      "latencyP99": 364.3,
      "latencyMax": 614.1,
      "latenciesOver1000ms": 0,
      "deadlineFallbackCount": 1910,
      "deadlineFallbackRatePct": 28.98,
      "wallClockExceededMatches": 20,
      "promotionQualified": false,
      "runtimeGateQualified": false
    }
  }
]
```

## 4. Machine-readable correction contract

The closure_01 files are read-only evidence and stay exactly as they were. The upgraded verifier
`tools/v8_verify_report_consistency.ts` can be pointed at closure_01 directly; it then reports the
S00/S10 contradictions above as hard errors. `tools/v8_report_consistency.test.ts` runs exactly that
negative case so the detection itself is regression-tested.
