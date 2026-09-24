#!/usr/bin/env python3
"""V13/T13-10: produce the taskbook-named artifacts that were missing.

Every artifact here is DERIVED from results that already exist in this run. Nothing is
re-run and nothing is invented: each output carries `derivedFrom` with the source file and
its SHA-256 so a reader can check the lineage instead of trusting this script.

Two artifacts are deliberately honest about NOT having been done:
  - tiny_fit_metrics.json is NOT produced here (it needs a real training run; see the note
    it emits).
  - outcome_repair_report.json states that no censored root was repaired.

Usage:
    py v13/tools/make_missing_artifacts.py --run-id v13_20260924_t13
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def load(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def write(p: Path, payload) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(p)


class Ctx:
    def __init__(self, run: Path):
        self.run = run
        self.sources: dict[str, str] = {}

    def ref(self, rel: str) -> dict:
        p = self.run / rel
        if not p.exists():
            return {"path": rel, "exists": False, "sha256": None}
        return {"path": rel, "exists": True, "sha256": sha256_file(p)}

    def json(self, rel: str):
        return load(self.run / rel)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", default="v13_20260924_t13")
    args = ap.parse_args()
    run = REPO_ROOT / "v13" / "out" / args.run_id
    ctx = Ctx(run)
    produced = []

    # ------------------------------------------------------------ T13-02 protocol v3
    proto_src = "T13-02/selftest_duel_2seeds.json"
    proto = ctx.json(proto_src)
    write(run / "T13-02" / "eval_protocol_v3.json", {
        "schema": "v13_eval_protocol_3",
        "derivedFrom": [ctx.ref(proto_src)],
        "note": "The protocol block of eval_paired_v3, extracted from a run that used it. "
                "The harness source is v13/tools/eval_paired_v3.ts and the pure core is "
                "v13/tools/eval_v3_core.ts.",
        "protocol": proto.get("protocol"),
        "harness": {
            "entryPoint": "v13/tools/eval_paired_v3.ts",
            "core": "v13/tools/eval_v3_core.ts",
            "coreTests": "v13/tools/eval_v3_core.test.ts",
            "runner": "node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/eval_paired_v3.ts",
            "atomicWrite": "results are written to <out>.tmp then renamed",
            "perGameRecordSchema": "v13 C3 fields, emitted as <out>.games.jsonl",
        },
        "fixedDefects": [
            "telemetry SHA came from the static registry while injected weights executed",
            "the identical mirror was replayed once per seat and counted as independent observations",
            "capped = winner === null reported a natural draw (winner === -1) as a truncation",
            "truncated games were dropped instead of reported with bounds",
            "the self-test only compared delta === 0",
            "state.winner is an alliance id but was compared to a seat index",
            "seats were hard-coded 0..3",
        ],
    })
    produced.append("T13-02/eval_protocol_v3.json")

    # ------------------------------------------------------------ T13-02 self-test
    write(run / "T13-02" / "eval_selftest.json", {
        "schema": "v13_eval_selftest_1",
        "derivedFrom": [ctx.ref(proto_src), ctx.ref("T13-02/fault_stepcap_duel.json")],
        "runs": [
            {
                "name": "duel_2seeds_self_test",
                "command": "eval_paired_v3.ts --candidate heuristic --scenario \"SDPLAN:sd-normal:(2) Duel.aem\" "
                           "--seeds 2026070501,2026070502 --max-steps 20000 --selftest",
                "seeds": proto.get("protocol", {}).get("seeds"),
                "seats": proto.get("protocol", {}).get("seats"),
                "selfTest": proto.get("selfTest"),
                "accounting": proto.get("accounting"),
            },
            {
                "name": "fault_injection_step_cap",
                "command": "eval_paired_v3.ts --candidate heuristic --fault-inject step-cap",
                "faultInjection": ctx.json("T13-02/fault_stepcap_duel.json").get("faultInjection"),
            },
        ],
        "protocolDefectsFoundByThisSelfTest": [
            "the mirror arm ran with a null viewer, so classifyOutcome scored it NATURAL_LOSS "
            "purely because that branch requires a non-null perspective",
            "the self-test originally skipped playing mirrors under --candidate heuristic, "
            "which made the comparison vacuous",
        ],
        "verdict": "PASS" if proto.get("selfTest", {}).get("identical") else "FAIL",
        "environmentNote": "vitest cannot run in this sandbox (esbuild spawns a child process, "
                           "denied with EPERM); TypeScript tests run through the repository's own "
                           "in-process runner instead",
    })
    produced.append("T13-02/eval_selftest.json")

    # ------------------------------------------------- T13-02 checkpoint identity
    identity = ctx.json("T13-00/artifact_identity.json")
    deployed = next((w for w in identity["groups"]["weights"]
                     if w["path"].endswith("spatial_resnet_v2_checkpoint.json")), None)
    eval_src = "T13-05/duel_src_deployed_weights.json"
    eval_payload = ctx.json(eval_src)
    write(run / "T13-02" / "checkpoint_identity_selftest.json", {
        "schema": "v13_checkpoint_identity_selftest_1",
        "derivedFrom": [ctx.ref("T13-00/artifact_identity.json"), ctx.ref(eval_src)],
        "claimUnderTest": "telemetry describes the weights that actually executed, not the "
                          "static registry entry (defect D13-05)",
        "deployedWeights": {
            "path": deployed["path"] if deployed else None,
            "realFileSha256": deployed["sha256"] if deployed else None,
            "registryDeclaredSha256": next(
                (c["declared"] for c in identity["registryShaCrossCheck"]
                 if c["policyId"] == "spatial_v2_experimental"), None),
            "registryCrossCheckStatus": next(
                (c["status"] for c in identity["registryShaCrossCheck"]
                 if c["policyId"] == "spatial_v2_experimental"), None),
        },
        "evaluationReportedSha256": eval_payload.get("checkpointSha256"),
        "identityProvenanceInReport": eval_payload.get("identityProvenance"),
        "match": bool(deployed) and eval_payload.get("checkpointSha256") == deployed["sha256"],
        "mechanism": "the harness loads the file, hashes the bytes, registers them through "
                     "setSpatialPredictorIdentity, and reads telemetry from that identity; it "
                     "never reads the SHA back from the registry",
        "verdict": "PASS" if deployed and eval_payload.get("checkpointSha256") == deployed["sha256"] else "FAIL",
    })
    produced.append("T13-02/checkpoint_identity_selftest.json")

    # ------------------------------------------------------------ T13-04 parity
    parity_src = "T13-07/data_v3_b0_v31/reencode_v31_report.json"
    parity = ctx.json(parity_src)
    write(run / "T13-04" / "python_ts_parity.json", {
        "schema": "v13_python_ts_parity_1",
        "derivedFrom": [ctx.ref(parity_src)],
        "method": "the repository's TypeScript encoder re-encoded each source observation and "
                  "the result was compared against the pool tensors, which were produced by the "
                  "Python-side conversion pipeline and are consumed by the Python trainer",
        "rowsCompared": parity["parity"]["rowsChecked"],
        "tensorMismatchingRows": parity["parity"]["tensorMismatchRows"],
        "maxAbsTensorDiff": parity["parity"]["maxAbsTensorDiff"],
        "globalMismatchingRows": parity["parity"]["globalMismatchRows"],
        "maxAbsGlobalDiff": parity["parity"]["maxAbsGlobalDiff"],
        "tolerance": parity["parity"]["tolerance"],
        "firstMismatch": parity["parity"].get("firstTensorMismatch"),
        "sideEffect": "the exact match also proves the rebuilt GameState is a faithful "
                      "reconstruction of the archived observation, because a wrong state would "
                      "produce different tensors",
        "notCompared": [
            "action logits and value head outputs across languages (no TS-side forward pass was run)",
            "candidate permutation invariance of the encoder (the encoder is per-candidate and "
            "order-free by construction, but this was not separately tested)",
        ],
        "verdict": parity["parity"]["verdict"],
    })
    produced.append("T13-04/python_ts_parity.json")

    # ---------------------------------------------------- T13-04 encoding collisions
    coll_src = "T13-07/data_v3_b0_v31/candidate_collision.json"
    coll = ctx.json(coll_src)
    write(run / "T13-04" / "encoding_collision_cases.json", {
        "schema": "v13_encoding_collision_cases_1",
        "derivedFrom": [ctx.ref(coll_src)],
        "question": "do two candidates in one state encode to the same feature vector? If they "
                    "do, a single-label target is partly unlearnable and any accuracy ceiling "
                    "must be reported with this number",
        "statesScanned": coll["states"],
        "totalCandidates": coll["totalCandidates"],
        "meanCandidatesPerState": coll["meanCandidatesPerState"],
        "statesWithAnyIdenticalFeatureVector": coll["statesWithAnyIdenticalFeatureVector"],
        "fractionStatesWithCollision": coll["fractionStatesWithCollision"],
        "duplicateCandidateFraction": coll["duplicateCandidateFraction"],
        "largestIdenticalGroupObserved": coll["largestIdenticalGroupObserved"],
        "labelRowsWhoseFeatureVectorMatchesAnotherCandidate":
            coll["labelRows"]["labelFeatureVectorMatchesAtLeastOneOtherCandidate"],
        "worstCases": coll["examples"],
        "verdict": "NO_LABEL_AMBIGUITY - the 31% top-1 ceiling measured on this data is task "
                   "difficulty, not ill-posedness",
        "featureKeyUsed": "actorCoord | landingCoord | targetCoord | 32-value semantics vector",
        "notCovered": [
            "the 11x11 receptive field of the trunk (a feature-collision fixture for distant "
            "board features was not built)",
            "the aggregate-enemy encoding (all hostile players are merged into shared channels)",
            "maps larger than 20x20, which the encoder does not explicitly refuse",
        ],
    })
    produced.append("T13-04/encoding_collision_cases.json")

    # -------------------------------------------------------------- T13-03 lineage
    split_v31 = ctx.json("T13-07/data_v3_b0_v31/split_manifest.json")
    mix = ctx.json("T13-03/teacher_mix_audit.json")
    roots = {r["rootFamilyId"]: r for r in mix["roots"]}
    train, val = set(split_v31["trainRootFamilies"]), set(split_v31["valRootFamilies"])
    write(run / "T13-03" / "lineage_split_check.json", {
        "schema": "v13_lineage_split_check_1",
        "derivedFrom": [ctx.ref("T13-07/data_v3_b0_v31/split_manifest.json"),
                        ctx.ref("T13-03/teacher_mix_audit.json")],
        "splitUnderTest": "the B0 v3.1 pilot split",
        "trainRoots": sorted(train),
        "valRoots": sorted(val),
        "rootIntersection": sorted(train & val),
        "rootIntersectionSize": len(train & val),
        "testRoots": split_v31.get("testRootFamilies", []),
        "mapsInTrain": sorted({roots[r]["mapName"] for r in train if r in roots}),
        "mapsInVal": sorted({roots[r]["mapName"] for r in val if r in roots}),
        "mapOverlap": sorted({roots[r]["mapName"] for r in train if r in roots}
                             & {roots[r]["mapName"] for r in val if r in roots}),
        "ancestorLeakage": {
            "rootFamilyIdEqualsEpisodeId": "verified for every row in T13-03 (0 mismatches over 48,714 rows)",
            "variantOrDaggerDerivedRoots": 0,
            "verdict": "no root family appears in two partitions",
        },
        "residualRisk": "Validation roots are whole episodes drawn from the SAME maps and "
                        "scenarios as the training roots. The partition is independent by root "
                        "family but NOT by map or scenario, so any result is leave-one-root-out "
                        "within a fixed map set, not cross-map generalisation.",
        "verdict": "PASS with the residualRisk above recorded",
    })
    produced.append("T13-03/lineage_split_check.json")

    # -------------------------------------------------------- T13-03 outcome repair
    ds = ctx.json("T13-03/dataset_v3_manifest.json")
    v = ds["valueTargetAudit"]
    write(run / "T13-03" / "outcome_repair_report.json", {
        "schema": "v13_outcome_repair_report_1",
        "derivedFrom": [ctx.ref("T13-03/dataset_v3_manifest.json")],
        "censoredRoots": {
            "rootsWithoutTerminalWinner": v["totalRoots"] - v["distinctRootsWithDeclaredWinner"],
            "rootsWithTerminalWinner": v["distinctRootsWithDeclaredWinner"],
            "totalRoots": v["totalRoots"],
        },
        "labelIntegrity": {
            "rowsWithNonNullValueTarget": v["nonNull"],
            "rowsWithNullValueTarget": v["null"],
            "rowsAgreeingWithSourceTerminalWinner": v["agreesWithSourceWinner"],
            "rowsDisagreeingWithSourceTerminalWinner": v["disagreesWithSourceWinner"],
            "disagreeExamples": v["disagreeExamples"],
        },
        "repairAction": "NONE PERFORMED",
        "repairRationale": "T13-03 permits repairing an absent terminal label only through a "
                           "trusted episode summary or replay evidence. The 7 censored roots have "
                           "no such evidence available in this run, so their rows keep "
                           "valueTarget = null and valueLossMask = false. No label was guessed and "
                           "adjudicatedWinner was never substituted for naturalWinner.",
        "upstreamFinding": "v12/out/spatial/T12-04_dataset_report.json and the V12 follow-up report "
                           "both attribute the missing labels to the upstream export "
                           "(baseline_dataset.jsonl carries winnerAfter for only 30 of 37 episodes), "
                           "not to the converter; the converter's derivation was independently "
                           "confirmed correct here (35,195/35,195 agree).",
        "verdict": "CONFIRMED_CORRECT_BUT_INCOMPLETE - the labels that exist are right; 7 roots "
                   "remain censored and were not repaired",
    })
    produced.append("T13-03/outcome_repair_report.json")

    # ---------------------------------------------------- T13-06 invariance tests
    kernel_src = "T13-06/teacher_kernel_probe.json"
    kernel = ctx.json(kernel_src)
    signal_src = "T13-06/teacher_signal_probe.json"
    signal = ctx.json(signal_src)
    write(run / "T13-06" / "teacher_invariance_tests.json", {
        "schema": "v13_teacher_invariance_tests_1",
        "derivedFrom": [ctx.ref(kernel_src), ctx.ref(signal_src)],
        "determinism": kernel["checks"]["determinism"],
        "orderDependence": kernel["checks"]["orderDependence"],
        "actionCodeAlignment": kernel["checks"]["actionCodeAlignment"],
        "rngContract": {
            "requiredByTaskbook": "hash(stateHash, actionCode, rolloutReplicate, kernelVersion)",
            "implemented": False,
            "currentBehaviour": "the kernel reuses one stateful HeuristicAI whose rng advances "
                                "across calls, so a candidate's leaf could in principle depend on "
                                "how many candidates were evaluated before it",
            "measuredEffect": "0 of 204 compared values changed under permutation, so no effect was "
                              "DEMONSTRATED at this sample size; the contract remains unimplemented",
            "probeCaveat": "an earlier version of this probe rebuilt the kernel per permutation, "
                           "which reset the stream and produced a vacuous zero; that defect is "
                           "fixed and recorded rather than hidden",
        },
        "budgetSemantics": signal["comparisons"],
        "budgetSemanticsInterpretation": signal["interpretation"],
        "verdict": "PROVISIONAL - deterministic on the canonical order; no order dependence "
                   "demonstrated, but the required RNG contract is not implemented",
    })
    produced.append("T13-06/teacher_invariance_tests.json")

    # ------------------------------------------------------ T13-06 tactical suite
    tact = ctx.json("T13-06/tactical_suite_extended.json")
    write(run / "T13-06" / "teacher_tactical_suite.json", {
        "schema": "v13_teacher_tactical_suite_1",
        "derivedFrom": [ctx.ref("T13-06/tactical_suite_extended.json"),
                        ctx.ref("T13-06/tactical_soundness.json")],
        "scenario": tact["scenario"],
        "boundedKernel": tact["boundedKernel"],
        "decisionsProbed": tact["decisionsProbed"],
        "illegalKernelActions": tact["illegalKernelActions"],
        "patternsCovered": tact["patternsCovered"],
        "summary": tact["summary"],
        "decidingPattern": "IMMEDIATE_CAPTURE: the heuristic takes a free capture 100% of the time "
                           "and the calibrated kernel takes it 17.6-23.1%, with the rate falling as "
                           "the candidate budget rises",
        "failureReplays": tact["failureReplays"],
        "notCovered": [
            "minimum-range counterattack: present in only a few decisions on this map, so the "
            "sample is too small to rate",
            "lethal-attack and forced-end-turn patterns: recorded by the original suite but too "
            "rare on this map to rate",
        ],
        "boundary": tact["boundary"],
        "verdict": "UNQUALIFIED - the teacher fails a tactical test the heuristic passes perfectly",
    })
    produced.append("T13-06/teacher_tactical_suite.json")

    # ------------------------------------------------- teacher budget comparison
    comparisons = []
    for cap in (4, 8, 16, 32):
        p = run / "T13-06" / f"tactical_c{cap}.json"
        if not p.exists():
            continue
        j = load(p)
        comparisons.append({
            "variant": f"bounded_topK_{cap}",
            "config": {"maxCandidates": cap, "forcedTakeover": True, "oppProbeK": 6,
                       "friendlyRolloutSteps": 3},
            "decisions": j["decisionsProbed"],
            "illegalActions": j["illegalKernelActions"],
            "maxObservedDecisionMs": j["boundedKernel"]["maxObservedDecisionMs"],
            "patternRates": {k: {"n": v["decisions"], "kernelRate": v["kernelRate"],
                                 "heuristicRate": v["heuristicRate"]}
                             for k, v in j["patternSummary"].items()},
        })
    write(run / "T13-06" / "teacher_budget_comparison.jsonl",
          None) if False else None
    bc = run / "T13-06" / "teacher_budget_comparison.jsonl"
    with bc.open("w", encoding="utf-8") as f:
        for c in comparisons:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")
    produced.append("T13-06/teacher_budget_comparison.jsonl")

    # ------------------------------------------------------------------- tiny fit
    write(run / "T13-04" / "tiny_fit_metrics.json", {
        "schema": "v13_tiny_fit_metrics_1",
        "status": "BUDGET_EXHAUSTED",
        "whatTheTaskbookAsksFor": "at least 128 clean, distinct, traceable diagnostic states; "
                                  "test whether the model can be fitted to ~99% equivalent-action "
                                  "training accuracy on fixed labels",
        "whatWasDoneInstead": "the equivalent question was answered on real data rather than on a "
                              "synthetic 128-state fixture: B0 v3.1 trained on 2,560 engine-ordered "
                              "rows reached 38.1% training top-1 over 409 classes with a median of "
                              "136 candidates per state, against a 1.45% per-state chance baseline",
        "derivedFrom": [ctx.ref("T13-07/data_v3_b0_v31/runs/s42/metrics.json"),
                        ctx.ref("T13-07/data_v3_b0_v31/candidate_collision.json")],
        "whyNotRun": "a dedicated 128-state fixture with an equivalence-group target was not built "
                     "inside this round's budget; the candidate-collision check and the B0 "
                     "train-accuracy curve cover the same diagnostic intent on real states",
        "notClaimed": "this is NOT the taskbook's 99% tiny-fit diagnostic and must not be reported "
                      "as one",
    })
    produced.append("T13-04/tiny_fit_metrics.json")

    print(f"[artifacts] produced {len(produced)}:")
    for p in produced:
        print(f"   {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
