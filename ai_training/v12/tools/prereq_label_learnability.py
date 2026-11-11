"""T12-08 prerequisite probe: is there anything LEARNABLE in the continuous dQ labels?

Subagent D's T12-06/07 report explicitly lists as unverified:
  "Whether a ranker actually learns from these labels, and whether it transfers
   to game strength."

The second half needs the authorised match budget (T12-08). The FIRST half is cheap
and can be answered offline, and it is a genuine precondition: if a ranker cannot
beat the heuristic's own ordering out-of-episode, then authorising T12-08 is
premature.

What we have per (decision, candidate): heuristicScore, leaf, deltaQ, actionType.
What we do NOT have: any state/board feature. So this probe can only test whether
the label carries information BEYOND the heuristic score that is recoverable from
the remaining available signal (action type + rank position). That is a weak test
by construction, and it is reported as such:

  - NEGATIVE result (model <= heuristic) is informative: with no state features
    there is nothing to learn, so the ranker must be fed board features.
  - POSITIVE result (model > heuristic) is necessary but NOT sufficient: mean dQ is
    on the evaluatePositionHeuristic scale, NOT a win probability. It does not
    prove strength gain.

Usage: py -3.12 v12/tools/prereq_label_learnability.py
"""
from __future__ import annotations

import json
import math
import statistics
from collections import Counter, defaultdict

import numpy as np

LABELS = "v12/out/labels/counterfactual_labels_v2.jsonl"
RIDGE_LAMBDA = 1.0


def spearman(xs: list[float], ys: list[float]) -> float:
    """Spearman rho with average ranks for ties."""
    def ranks(v: list[float]) -> list[float]:
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2.0 + 1.0
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r
    rx, ry = ranks(xs), ranks(ys)
    n = len(rx)
    mx, my = sum(rx) / n, sum(ry) / n
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    dx = math.sqrt(sum((a - mx) ** 2 for a in rx))
    dy = math.sqrt(sum((b - my) ** 2 for b in ry))
    return num / (dx * dy) if dx > 0 and dy > 0 else 0.0


def main() -> int:
    decisions: list[dict] = []
    with open(LABELS, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                decisions.append(json.loads(line))

    print(f"decisions loaded        : {len(decisions)}")

    action_types = sorted({c["actionType"] for d in decisions for c in d["leaves"]})
    print(f"action types            : {action_types}")

    # ---- 1. how much does the maximin leaf disagree with the heuristic? -----
    disagree = sum(1 for d in decisions if d["deltaQ"] != 0)
    print()
    print("--- leaf vs heuristic ordering ---")
    print(f"decisions where leaf-top != heuristic-top : {disagree}/{len(decisions)} "
          f"({100.0 * disagree / len(decisions):.1f}%)")

    rhos = []
    for d in decisions:
        hs = [c["heuristicScore"] for c in d["leaves"]]
        dq = [c["deltaQ"] for c in d["leaves"]]
        if len(set(hs)) > 1 and len(set(dq)) > 1:
            rhos.append(spearman(hs, dq))
    if rhos:
        print(f"within-decision Spearman(heuristicScore, deltaQ): "
              f"n={len(rhos)} mean={statistics.mean(rhos):.3f} median={statistics.median(rhos):.3f}")

    # ---- 2. build features -------------------------------------------------
    # Per-candidate features that do NOT include any board state.
    def featurize(d: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        cands = d["leaves"]
        hs = np.array([c["heuristicScore"] for c in cands], dtype=float)
        # rank 0 = best heuristic score
        order = np.argsort(-hs)
        rank = np.empty(len(cands), dtype=float)
        rank[order] = np.arange(len(cands), dtype=float)
        # normalise score within decision
        mu, sd = hs.mean(), hs.std()
        z = (hs - mu) / sd if sd > 1e-9 else np.zeros_like(hs)
        onehot = np.zeros((len(cands), len(action_types)), dtype=float)
        for i, c in enumerate(cands):
            onehot[i, action_types.index(c["actionType"])] = 1.0
        X = np.hstack([np.ones((len(cands), 1)), z.reshape(-1, 1), rank.reshape(-1, 1), onehot])
        y = np.array([c["deltaQ"] for c in cands], dtype=float)
        return X, y, order

    groups: dict[str, list[dict]] = defaultdict(list)
    for d in decisions:
        groups[d["rootFamilyId"]].append(d)
    print()
    print(f"root families           : {len(groups)}")
    print(f"decisions per family    : "
          f"{sorted(len(v) for v in groups.values())}")

    # ---- 3. leave-one-rootFamily-out evaluation ----------------------------
    res_model, res_baseline, res_oracle, res_random, res_random_nonbase = [], [], [], [], []
    top1_model = top1_base = 0
    n_eval = 0
    rng = np.random.default_rng(20260924)

    # override-policy sweep: only deviate from the heuristic when the model is
    # confident. Mirrors the residual/veto gate the taskbook asks for.
    override_records: list[dict] = []

    for held_out, test_decisions in groups.items():
        train = [d for g, ds in groups.items() if g != held_out for d in ds]
        Xtr = np.vstack([featurize(d)[0] for d in train])
        ytr = np.concatenate([featurize(d)[1] for d in train])
        # ridge closed form
        A = Xtr.T @ Xtr + RIDGE_LAMBDA * np.eye(Xtr.shape[1])
        w = np.linalg.solve(A, Xtr.T @ ytr)

        for d in test_decisions:
            X, y, order = featurize(d)
            pred = X @ w
            # the heuristic's own choice is candidate 0 (deltaQ == 0 by construction)
            base = 0.0
            oracle = float(y.max())
            model = float(y[int(np.argmax(pred))])
            rand = float(y[int(rng.integers(0, len(y)))])
            nonbase = [i for i in range(len(y)) if i != 0]
            rand_nb = float(y[nonbase[int(rng.integers(0, len(nonbase)))]]) if nonbase else 0.0
            res_baseline.append(base)
            res_oracle.append(oracle)
            res_model.append(model)
            res_random.append(rand)
            res_random_nonbase.append(rand_nb)
            if int(np.argmax(pred)) == int(np.argmax(y)):
                top1_model += 1
            if 0 == int(np.argmax(y)):
                top1_base += 1
            n_eval += 1
            # candidate the model would override to (never the baseline itself)
            best_i = max(nonbase, key=lambda i: pred[i]) if nonbase else 0
            override_records.append({
                "family": held_out,
                "predMargin": float(pred[best_i] - pred[0]),
                "realisedDeltaQ": float(y[best_i]),
            })

    def summarize(name: str, vals: list[float]) -> None:
        print(f"  {name:<28} mean dQ = {statistics.mean(vals):9.2f}   "
              f"median = {statistics.median(vals):8.2f}   >0 in "
              f"{100.0 * sum(1 for v in vals if v > 0) / len(vals):5.1f}%")

    print()
    print(f"--- leave-one-rootFamily-out evaluation (n={n_eval} decisions) ---")
    summarize("heuristic baseline (a0)", res_baseline)
    summarize("random (all candidates)", res_random)
    summarize("random (non-baseline only)", res_random_nonbase)
    summarize("MODEL (no board feats)", res_model)
    summarize("oracle upper bound", res_oracle)
    print()
    print(f"  top-1 agreement with leaf-argmax: model {100.0 * top1_model / n_eval:.1f}% | "
          f"always-a0 {100.0 * top1_base / n_eval:.1f}%")

    headroom = statistics.mean(res_oracle) - statistics.mean(res_random_nonbase)
    captured = statistics.mean(res_model) - statistics.mean(res_random_nonbase)
    print(f"  headroom over random-non-baseline = {headroom:.2f} mean dQ; model captures "
          f"{captured:.2f} ({100.0 * captured / headroom:.1f}%)")

    # ---- override-gated policy: the shape a residual ranker would actually take
    print()
    print("--- override-gated policy (deviate from a0 only when predMargin > t) ---")
    print(f"  {'t':>8} {'override%':>10} {'mean dQ':>10} {'harmful%':>10} {'median dQ':>10}")
    for t in (0.0, 25.0, 50.0, 100.0, 200.0, 400.0):
        picked = [r for r in override_records if r["predMargin"] > t]
        if not picked:
            print(f"  {t:>8.0f} {0.0:>9.1f}% {'n/a':>10} {'n/a':>10} {'n/a':>10}")
            continue
        vals = [r["realisedDeltaQ"] for r in picked]
        harmful = sum(1 for v in vals if v < 0)
        print(f"  {t:>8.0f} {100.0 * len(picked) / len(override_records):>9.1f}% "
              f"{statistics.mean(vals):>10.2f} {100.0 * harmful / len(vals):>9.1f}% "
              f"{statistics.median(vals):>10.2f}")

    # paired per-family test on the full-override policy (t=0)
    by_family: dict[str, list[float]] = defaultdict(list)
    for r in override_records:
        by_family[r["family"]].append(r["realisedDeltaQ"])
    fam_means = [statistics.mean(v) for v in by_family.values()]
    if len(fam_means) > 1:
        mu = statistics.mean(fam_means)
        sd = statistics.stdev(fam_means)
        se = sd / math.sqrt(len(fam_means))
        print()
        print(f"  per-root-family mean dQ (n={len(fam_means)} families): "
              f"mean={mu:.2f} sd={sd:.2f} se={se:.2f}")
        print(f"  families with mean dQ > 0: {sum(1 for v in fam_means if v > 0)}/{len(fam_means)}")
        print(f"  naive 95% CI on the family mean: [{mu - 1.96 * se:.2f}, {mu + 1.96 * se:.2f}] "
              f"(families are not independent samples; treat as indicative only)")

    # ---- 4. verdict --------------------------------------------------------
    m, b = statistics.mean(res_model), statistics.mean(res_baseline)
    print()
    print("--- verdict ---")
    if m <= b + 1e-9:
        print("  NEGATIVE: with only these features the model cannot beat the heuristic.")
        print("  Interpretation: no board/state features are present in the label file,")
        print("  so this says the label file alone is insufficient -- a ranker MUST be fed")
        print("  spatial/action features (which the converter can produce) before T12-08.")
    else:
        print(f"  POSITIVE: model beats the heuristic baseline by {m - b:.2f} mean dQ on")
        print("  held-out root families. Necessary but NOT sufficient: dQ is on the")
        print("  evaluatePositionHeuristic scale, not a win probability.")
    print()
    print("  CAVEAT: features are heuristicScore / rank / actionType ONLY. There is no")
    print("  board state here, so a negative result is not evidence that the LABEL is")
    print("  bad -- only that this feature set is too thin. See report section 'what this")
    print("  does and does not establish'.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
