from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
import torch


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from spatial_resnet_model import (  # noqa: E402
    PATH3_ENCODER_SCHEMA_ID,
    SpatialResNet,
    export_model_to_ts_json,
    load_model_from_ts_json,
)
from verify_parity import load_spatial_model_from_json, shape_schema_hint  # noqa: E402


V15_SCHEMA = "spatial26_global20_actionSemantics53_v15"
V19_SCHEMA = "spatial34_global20_actionSemantics53_v19"


def _model(channels: int, semantics: int, schema: str, *, pool: bool = False) -> SpatialResNet:
    model = SpatialResNet(
        spatial_channels=channels,
        global_dim=20,
        action_semantic_dim=semantics,
        global_policy_pool=pool,
    )
    model.encoder_schema_id = schema
    return model


def _assert_same_state(left: SpatialResNet, right: SpatialResNet) -> None:
    for name, tensor in left.state_dict().items():
        assert torch.equal(tensor, right.state_dict()[name]), name


@pytest.mark.parametrize(
    ("channels", "semantics", "schema"),
    [(34, 53, V19_SCHEMA), (34, 56, PATH3_ENCODER_SCHEMA_ID)],
)
def test_same_shape_export_and_load_roundtrip(
    tmp_path: Path, channels: int, semantics: int, schema: str
) -> None:
    torch.manual_seed(20261003 + semantics)
    source = _model(channels, semantics, schema)
    checkpoint = tmp_path / f"model-{semantics}.json"
    export_model_to_ts_json(source, str(checkpoint), schema)

    loaded_json = json.loads(checkpoint.read_text(encoding="utf-8"))
    assert loaded_json["encoderSchemaId"] == schema
    assert loaded_json["polDense1"]["inDim"] == 96 + semantics + 20

    target = _model(channels, semantics, schema)
    load_model_from_ts_json(target, str(checkpoint))
    _assert_same_state(source, target)


def test_unknown_and_same_shape_wrong_schema_are_rejected_before_mutation(tmp_path: Path) -> None:
    source = _model(34, 56, PATH3_ENCODER_SCHEMA_ID)
    checkpoint = tmp_path / "path3.json"
    export_model_to_ts_json(source, str(checkpoint), PATH3_ENCODER_SCHEMA_ID)
    original = json.loads(checkpoint.read_text(encoding="utf-8"))

    target = _model(34, 56, PATH3_ENCODER_SCHEMA_ID)
    before = {name: tensor.clone() for name, tensor in target.state_dict().items()}
    bad = dict(original)
    bad["encoderSchemaId"] = "unknown-schema"
    checkpoint.write_text(json.dumps(bad), encoding="utf-8")
    with pytest.raises(ValueError, match="未知 encoderSchemaId"):
        load_model_from_ts_json(target, str(checkpoint))
    for name, tensor in before.items():
        assert torch.equal(tensor, target.state_dict()[name]), name

    bad = dict(original)
    bad["encoderSchemaId"] = V19_SCHEMA
    checkpoint.write_text(json.dumps(bad), encoding="utf-8")
    with pytest.raises(ValueError, match="migrate_path3_model.py"):
        load_model_from_ts_json(target, str(checkpoint))


def test_generic_53_to_56_prefix_copy_is_explicitly_forbidden(tmp_path: Path) -> None:
    source = _model(34, 53, V19_SCHEMA)
    checkpoint = tmp_path / "old53.json"
    export_model_to_ts_json(source, str(checkpoint), V19_SCHEMA)
    target = _model(34, 56, PATH3_ENCODER_SCHEMA_ID)

    with pytest.raises(ValueError, match="migrate_path3_model.py"):
        load_model_from_ts_json(target, str(checkpoint), zero_new_policy_dims=True)


def test_path3_declared_schema_rejects_old_169_column_layout(tmp_path: Path) -> None:
    source = _model(34, 53, V19_SCHEMA)
    checkpoint = tmp_path / "mislabelled.json"
    export_model_to_ts_json(source, str(checkpoint), V19_SCHEMA)
    data = json.loads(checkpoint.read_text(encoding="utf-8"))
    data["encoderSchemaId"] = PATH3_ENCODER_SCHEMA_ID
    checkpoint.write_text(json.dumps(data), encoding="utf-8")

    with pytest.raises(ValueError, match="172->48"):
        load_model_from_ts_json(_model(34, 56, PATH3_ENCODER_SCHEMA_ID), str(checkpoint))


def test_legacy_v15_roundtrip_and_gap_extension_still_work(tmp_path: Path) -> None:
    torch.manual_seed(20261003)
    source = _model(26, 53, V15_SCHEMA)
    checkpoint = tmp_path / "v15.json"
    export_model_to_ts_json(source, str(checkpoint), V15_SCHEMA)

    same_shape = _model(26, 53, V15_SCHEMA)
    load_model_from_ts_json(same_shape, str(checkpoint))
    _assert_same_state(source, same_shape)

    # 中文：保留 V18 已有的 GAP 尾部扩展路径；它不改变 action semantic 布局。
    gap_model = _model(26, 53, V15_SCHEMA, pool=True)
    load_model_from_ts_json(gap_model, str(checkpoint), zero_new_policy_dims=True)
    assert torch.equal(gap_model.pol_dense1.weight[:, :169], source.pol_dense1.weight)
    assert torch.count_nonzero(gap_model.pol_dense1.weight[:, 169:]).item() == 0


def test_python_parity_derives_56_from_policy_shape_and_checks_schema(tmp_path: Path) -> None:
    checkpoint = tmp_path / "path3.json"
    export_model_to_ts_json(
        _model(34, 56, PATH3_ENCODER_SCHEMA_ID),
        str(checkpoint),
        PATH3_ENCODER_SCHEMA_ID,
    )
    loaded = load_spatial_model_from_json(str(checkpoint))
    assert loaded.action_semantic_dim == 56
    assert loaded.pol_dense1.in_features == 172
    assert loaded.encoder_schema_id == PATH3_ENCODER_SCHEMA_ID
    assert shape_schema_hint(34, 56) == PATH3_ENCODER_SCHEMA_ID

    data = json.loads(checkpoint.read_text(encoding="utf-8"))
    data["encoderSchemaId"] = V19_SCHEMA
    checkpoint.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(ValueError, match=r"实际推导为 \(34, 56\)"):
        load_spatial_model_from_json(str(checkpoint))
