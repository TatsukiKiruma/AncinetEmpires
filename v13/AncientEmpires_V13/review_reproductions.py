#!/usr/bin/env python3
"""Isolated reproductions of expressions audited at AncinetEmpires b8c0c24.

This script DOES NOT import/run the repository, train an AI, or evaluate games.
It checks the loss-accounting and value-mask expressions transcribed from
python/train_spatial_resnet.py. PyTorch is required for the mask reproductions.
Usage: python review_reproductions.py --out review_reproductions.json
"""
from __future__ import annotations
import argparse
import json
import warnings
from pathlib import Path

SHA = "b8c0c24312a551a3cf20802f820e3f1edf798395"


def loss_accounting() -> dict:
    losses = [1.0, 2.0, 3.0]
    ordinary_total = 0.0
    capped_total = 0.0
    for i, loss in enumerate(losses):
        ordinary_total += loss   # the optimizer-success block
        ordinary_total += loss   # the common footer
        capped_total += loss
        if i == len(losses) - 1:  # break skips the common footer of last batch
            break
        capped_total += loss
    expected = sum(losses) / len(losses)
    assert expected == 2.0 and ordinary_total / len(losses) == 4.0
    assert capped_total / len(losses) == 3.0
    return {"batch_losses": losses, "correct_mean": expected,
            "current_mean_without_cap_break": ordinary_total / len(losses),
            "current_mean_with_last_batch_cap_break": capped_total / len(losses),
            "scope": "Metric accounting only; the source calls backward/step once per batch."}


def value_mask_reproduction() -> dict:
    import torch
    import torch.nn.functional as F
    raw = [1.0, -1.0]
    mask = [True, False]
    pred = torch.tensor([0.25, 0.75], requires_grad=True)
    valid = torch.tensor([v is not None and mask[i] for i, v in enumerate(raw)])
    # Current implementation: different filters for prediction and target.
    old_t = torch.tensor([v for v in raw if v is not None])
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        old_loss = F.mse_loss(pred[valid], old_t)
    old_loss.backward()
    old_gradient = pred.grad.detach().tolist()
    pred2 = pred.detach().clone().requires_grad_(True)
    fixed_t = torch.tensor([v for i, v in enumerate(raw) if bool(valid[i])])
    fixed_loss = F.mse_loss(pred2[valid], fixed_t)
    fixed_loss.backward()
    assert abs(old_loss.item() - 1.0625) < 1e-7
    assert abs(fixed_loss.item() - 0.5625) < 1e-7
    assert old_gradient[0] > 0 and pred2.grad[0].item() < 0
    mismatch_error = None
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:
            F.mse_loss(torch.tensor([0.25, 0.75]), torch.tensor([1.0, -1.0, 1.0]))
        except RuntimeError as exc:
            mismatch_error = str(exc)
    assert mismatch_error is not None
    return {"torch_version": torch.__version__, "targets": raw, "value_loss_mask": mask,
            "predictions": pred.detach().tolist(), "old_loss": old_loss.item(),
            "fixed_loss": fixed_loss.item(), "old_gradient": old_gradient,
            "fixed_gradient": pred2.grad.detach().tolist(),
            "broadcast_warnings": [str(w.message) for w in caught],
            "two_predictions_three_targets_error": mismatch_error,
            "scope": "Mixed non-null targets with different masks; this does not show that V12 budget runs used such batches."}


def mirror_counting() -> dict:
    rows = [{"seed": seed, "candidate_seat": seat, "mirror_winner": 2}
            for seed in (2026070501, 2026070502) for seat in range(4)]
    return {"constructed_from_report_protocol": True, "mirror_row_count": len(rows),
            "unique_mirror_configurations": len({r["seed"] for r in rows}),
            "independence_warning": "Seat replacements share a seed/root block; repeated all-heuristic mirrors are not independent games.",
            "duel_report_arithmetic": {"p1_wins": 8 + 7, "games": 10 + 8, "rate": (8 + 7) / (10 + 8)}}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=Path("review_reproductions.json"))
    args = parser.parse_args()
    result = {"reviewed_commit": SHA, "execution_scope": "ISOLATED_EXPRESSION_REPRODUCTION_NOT_REPOSITORY_TESTS",
              "source": f"https://github.com/TatsukiKiruma/AncinetEmpires/blob/{SHA}/python/train_spatial_resnet.py#L185-L375",
              "loss_accounting": loss_accounting(), "value_mask": value_mask_reproduction(),
              "mirror_counting": mirror_counting()}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
