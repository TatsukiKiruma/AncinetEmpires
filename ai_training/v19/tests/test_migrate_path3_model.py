from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

import pytest
import torch


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))
sys.path.insert(0, str(ROOT / "v19" / "training"))

from migrate_path3_model import (  # noqa: E402
    NEW_POLICY_IN_DIM,
    NEW_SCHEMA_ID,
    OLD_POLICY_IN_DIM,
    OLD_SCHEMA_ID,
    PATH3_DIM,
    POLICY_OUT_DIM,
    PREFIX_DIM,
    migrate_file,
    migrate_model_dict,
)
from spatial_resnet_model import SpatialResNet  # noqa: E402


def _source_model_json() -> dict[str, object]:
    weights = [float(row * 1000 + column + 1) for row in range(POLICY_OUT_DIM) for column in range(OLD_POLICY_IN_DIM)]
    return {
        "version": "spatial-resnet-v2",
        "numBlocks": 2,
        "architectureId": "spatial_resnet_32ch_2res",
        "globalPolicyPool": False,
        "spatialChannels": 34,
        "encoderSchemaId": OLD_SCHEMA_ID,
        "customMetadata": {"lineage": "theta1", "unchanged": [1, 2, 3]},
        "stem": {"weights": [0.25], "biases": [-0.5]},
        "valDense1": {"weights": [2.0], "biases": [3.0]},
        "polDense1": {
            "inDim": OLD_POLICY_IN_DIM,
            "outDim": POLICY_OUT_DIM,
            "weights": weights,
            "biases": [float(index) for index in range(POLICY_OUT_DIM)],
        },
        "polDense2": {"inDim": 48, "outDim": 1, "weights": [4.0], "biases": [5.0]},
    }


def _copy_model_with_migrated_policy(old: SpatialResNet, new: SpatialResNet) -> dict[str, object]:
    old_state = old.state_dict()
    new_state = new.state_dict()
    for name, tensor in old_state.items():
        if name != "pol_dense1.weight":
            new_state[name].copy_(tensor)

    source_json = _source_model_json()
    source_json["polDense1"]["weights"] = old_state["pol_dense1.weight"].flatten().tolist()
    source_json["polDense1"]["biases"] = old_state["pol_dense1.bias"].tolist()
    migrated_json = migrate_model_dict(source_json)
    new_state["pol_dense1.weight"].copy_(
        torch.tensor(migrated_json["polDense1"]["weights"], dtype=torch.float32).view(
            POLICY_OUT_DIM, NEW_POLICY_IN_DIM
        )
    )
    new.load_state_dict(new_state)
    return migrated_json


def test_mapping_is_exact_and_preserves_all_unrelated_content() -> None:
    source = _source_model_json()
    original = copy.deepcopy(source)
    migrated = migrate_model_dict(source)

    assert source == original
    assert migrated["encoderSchemaId"] == NEW_SCHEMA_ID
    assert migrated["polDense1"]["inDim"] == NEW_POLICY_IN_DIM

    old_weights = torch.tensor(source["polDense1"]["weights"], dtype=torch.float64).view(POLICY_OUT_DIM, OLD_POLICY_IN_DIM)
    new_weights = torch.tensor(migrated["polDense1"]["weights"], dtype=torch.float64).view(POLICY_OUT_DIM, NEW_POLICY_IN_DIM)
    assert torch.equal(new_weights[:, :PREFIX_DIM], old_weights[:, :PREFIX_DIM])
    assert torch.count_nonzero(new_weights[:, PREFIX_DIM : PREFIX_DIM + PATH3_DIM]).item() == 0
    assert torch.equal(new_weights[:, PREFIX_DIM + PATH3_DIM :], old_weights[:, PREFIX_DIM:])

    # 末尾 20 列必须仍是原 globals 权重，防止误把 globals 留在插入区或清零。
    assert torch.count_nonzero(new_weights[:, -20:]).item() == POLICY_OUT_DIM * 20
    assert torch.equal(new_weights[:, -20:], old_weights[:, -20:])

    expected = copy.deepcopy(source)
    expected["encoderSchemaId"] = NEW_SCHEMA_ID
    expected["polDense1"]["inDim"] = NEW_POLICY_IN_DIM
    expected["polDense1"]["weights"] = migrated["polDense1"]["weights"]
    assert migrated == expected


def test_pytorch_forward_logits_and_value_are_preserved_with_nonzero_path3() -> None:
    torch.manual_seed(20261003)
    old = SpatialResNet(spatial_channels=34, global_dim=20, action_semantic_dim=53)
    new = SpatialResNet(spatial_channels=34, global_dim=20, action_semantic_dim=56)
    migrated_json = _copy_model_with_migrated_policy(old, new)
    old.eval()
    new.eval()

    spatial = torch.randn(2, 34, 20, 20)
    globals_batch = torch.randn(2, 20)
    old_semantics = torch.randn(2, 4, 53)
    # 使用任意非零 Path3 特征，验证新列置零后不会改变函数。
    path3 = torch.tensor([1.25, -2.0, 3.5]).view(1, 1, 3).expand(2, 4, 3)

    with torch.no_grad():
        old_z = old.forward_trunk(spatial)
        new_z = new.forward_trunk(spatial)
        old_common = torch.cat(
            [old_z[:, :, 1, 2], old_z[:, :, 7, 8], old_z[:, :, 13, 14]], dim=-1
        ).unsqueeze(1).expand(-1, 4, -1)
        new_common = torch.cat(
            [new_z[:, :, 1, 2], new_z[:, :, 7, 8], new_z[:, :, 13, 14]], dim=-1
        ).unsqueeze(1).expand(-1, 4, -1)
        expanded_globals = globals_batch.unsqueeze(1).expand(-1, 4, -1)
        old_features = torch.cat([old_common, old_semantics, expanded_globals], dim=-1)
        new_features = torch.cat([new_common, old_semantics, path3, expanded_globals], dim=-1)

        old_logits = old.forward_action_logits(old_features)
        new_logits = new.forward_action_logits(new_features)
        old_value = old.forward_value(old_z, globals_batch)
        new_value = new.forward_value(new_z, globals_batch)

    torch.testing.assert_close(new_z, old_z, rtol=0.0, atol=0.0)
    torch.testing.assert_close(new_logits, old_logits, rtol=1e-6, atol=1e-6)
    torch.testing.assert_close(new_value, old_value, rtol=0.0, atol=0.0)

    new_state = new.state_dict()
    for name, tensor in old.state_dict().items():
        if name != "pol_dense1.weight":
            assert torch.equal(new_state[name], tensor), name
    assert torch.equal(new.pol_dense1.weight[:, -20:], old.pol_dense1.weight[:, -20:])
    assert migrated_json["polDense1"]["biases"] == old.pol_dense1.bias.tolist()


@pytest.mark.parametrize(
    ("field", "bad_value"),
    [
        ("encoderSchemaId", NEW_SCHEMA_ID),
        ("version", "spatial-resnet-v1"),
        ("spatialChannels", 26),
        ("globalPolicyPool", True),
    ],
)
def test_rejects_wrong_source_identity(field: str, bad_value: object) -> None:
    source = _source_model_json()
    source[field] = bad_value
    with pytest.raises(ValueError):
        migrate_model_dict(source)


def test_rejects_wrong_policy_shape() -> None:
    source = _source_model_json()
    source["polDense1"]["inDim"] = NEW_POLICY_IN_DIM
    with pytest.raises(ValueError, match="维度错误"):
        migrate_model_dict(source)


def test_file_migration_rejects_existing_output(tmp_path: Path) -> None:
    input_path = tmp_path / "theta1.json"
    output_path = tmp_path / "path3.json"
    input_path.write_text(json.dumps(_source_model_json()), encoding="utf-8")
    output_path.write_text("不可覆盖", encoding="utf-8")

    with pytest.raises(FileExistsError, match="拒绝覆盖"):
        migrate_file(input_path, output_path)
    assert output_path.read_text(encoding="utf-8") == "不可覆盖"


def test_file_migration_writes_parseable_json_without_extra_metadata(tmp_path: Path) -> None:
    input_path = tmp_path / "theta1.json"
    output_path = tmp_path / "nested" / "path3.json"
    source = _source_model_json()
    input_path.write_text(json.dumps(source), encoding="utf-8")

    migrate_file(input_path, output_path)
    written = json.loads(output_path.read_text(encoding="utf-8"))
    assert written == migrate_model_dict(source)
