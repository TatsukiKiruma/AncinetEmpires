"""只读盘点双流资产，并校验清理后的保全内容；本工具不删除任何文件。"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import sys
import warnings

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
TRAINING = ROOT / "ai_training"
SCOPES = [
    "dual_stream_v2_phase1_20261020", "dual_stream_v2_phase2_20261020",
    "dual_stream_v2_phase3_20261020", "dual_stream_v2_phase4_20261020",
    "dual_stream_v2_phase5_20261020", "dual_stream_v2_phase6_20261022",
    "dual_stream_v2_gen02_20261021",
]
BLOCKED_NAMES = {"node_modules", "APK", "captures", ".git"}
TEXT_SUFFIXES = {".json", ".py", ".ts", ".mjs", ".md", ".snapshot"}
SHA_PATTERN = re.compile(r"(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])")


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def sha_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def rel(path):
    return Path(path).relative_to(ROOT).as_posix()


def is_reparse(path):
    return bool(getattr(Path(path).lstat(), "st_file_attributes", 0) & 1024) or Path(path).is_symlink()


def safe_path(path):
    # 不解析联接目标，逐级拒绝重解析点，也不通过支持链接读取文件。
    path = Path(os.path.abspath(path))
    try:
        parts = path.relative_to(ROOT).parts
    except ValueError:
        return False
    cursor = ROOT
    for part in parts:
        if part in BLOCKED_NAMES:
            return False
        cursor /= part
        try:
            if is_reparse(cursor):
                return False
        except FileNotFoundError:
            pass
    return True


def walk_files(base, skipped):
    if not safe_path(base) or is_reparse(base):
        skipped.append(str(base))
        return
    for directory, dirs, files in os.walk(base, followlinks=False):
        for name in list(dirs):
            candidate = Path(directory) / name
            if name in BLOCKED_NAMES or is_reparse(candidate):
                skipped.append(str(candidate))
                dirs.remove(name)
        for name in sorted(files):
            candidate = Path(directory) / name
            if is_reparse(candidate):
                skipped.append(str(candidate))
            else:
                yield candidate


def read_json(path):
    return json.loads(Path(path).read_text("utf-8-sig"))


def save_json(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", "utf-8")


def local_reference(value, context):
    if not isinstance(value, str) or len(value) > 1000 or "\n" in value:
        return None
    value = value.replace("\\", "/")
    if value.startswith(("ai_training/", "src/", "deliverables/", "docs/", "runtime/")):
        candidate = ROOT / value
    elif value.startswith("dual_stream_v2_"):
        candidate = TRAINING / value
    elif value.startswith(("C:/code/AncinetEmpires/", "C:/code/AncinetEmpires/".lower())):
        candidate = Path(value)
    elif value.startswith(("./", "../")):
        candidate = context.parent / value
    else:
        return None
    return Path(os.path.abspath(candidate)) if safe_path(candidate) else None


def discover_files():
    skipped, reasons, files = [], {}, set()
    for name in SCOPES:
        for path in walk_files(TRAINING / name, skipped):
            files.add(path)
            reasons[str(path)] = "用户限定的双流主目录"
    # Phase 6交付清单逐文件声明其实际评测产物和直接源代码，不遍历根src。
    declared = read_json(TRAINING / SCOPES[5] / "DELIVERY_MANIFEST.json")
    for row in declared["files"]:
        path = ROOT / row["path"]
        if path.is_file() and safe_path(path):
            files.add(path)
            reasons.setdefault(str(path), "Phase 6交付清单声明的直接依赖")
    archive = TRAINING / "dual_stream_v2_phase51_cache_archive_20261021"
    for path in walk_files(archive, skipped):
        files.add(path)
        reasons[str(path)] = "阶段5.1校准缓存归档清单的直接SHA依赖；本轮保留"
    for path in historical_exact_files():
        if path.is_file() and safe_path(path):
            files.add(path)
            reasons[str(path)] = "阶段3历史基线脚本精确读取的模型、摘要或逐槽身份；不扩大旧目录"
    # 仅取主目录第一层源码的直接相对导入，不向依赖继续递归。
    imports = re.compile(r"(?:from\s+|import\s*)['\"](\.{1,2}/[^'\"]+)['\"]")
    initial_sources = [p for p in files if p.suffix in {".ts", ".mjs"} and p.parent.name in SCOPES]
    for source in initial_sources:
        for target in imports.findall(source.read_text("utf-8-sig")):
            stem = source.parent / target
            for path in [stem, Path(str(stem) + ".ts"), Path(str(stem) + ".mjs"), stem / "index.ts"]:
                path = Path(os.path.abspath(path))
                if path.is_file() and safe_path(path):
                    files.add(path)
                    reasons.setdefault(str(path), "当前双流入口源码的一层直接导入")
                    break
    return sorted(files), skipped, reasons


def historical_exact_files():
    paths = [TRAINING / "tactical_exit_20261019/teacher-r6-battle-summary.json", TRAINING / "tactical_value_search_20261018/model-final.json"]
    identity = read_json(TRAINING / SCOPES[2] / "historical-baseline-identities.json")
    for row in identity["entries"]:
        result = ROOT / row["resultPath"]
        paths.extend([result, result.with_name("started.json")])
    return sorted(set(paths))


def category(path):
    if "evaluation-rule-cache" in path.parts:
        return "可重建规则缓存_待核验"
    if "__pycache__" in path.parts or path.suffix == ".pyc":
        return "Python字节码缓存"
    if "evaluation-index-history" in path.parts or path.name in {"evaluation-exclusions.txt.gz", "excluded-evaluation-hashes.txt.gz"}:
        return "必须保留_训练排重身份"
    if path.suffix in {".bin", ".pt", ".pth"} and "calibration" not in path.name and path.name not in {"samples.bin", "bridge-fixture.bin"}:
        return "必须保留_模型或恢复检查点"
    return "必须保留_源码数据配置或历史证据"


def digest_named_tensors(tensors):
    digest = hashlib.sha256()
    for name, shape, dtype, payload in sorted(tensors, key=lambda row: row[0]):
        header = json.dumps([name, list(shape), dtype], separators=(",", ":")).encode()
        digest.update(struct.pack("<I", len(header)))
        digest.update(header)
        digest.update(payload)
    return digest.hexdigest()


def checkpoint_info(path):
    import numpy as np
    import torch
    allowed = [np._core.multiarray._reconstruct, np.ndarray, np.dtype]
    allowed += [type(np.dtype(name)) for name in ["uint32", "int64", "float32", "float64"]]
    try:
        with torch.serialization.safe_globals(allowed):
            value = torch.load(path, map_location="cpu", weights_only=True)
        if not isinstance(value, dict):
            return {"path": str(path), "modelCheckpoint": False, "type": type(value).__name__}
        state = value.get("model", value.get("state_dict"))
        info = {"path": str(path), "keys": list(value), "modelCheckpoint": isinstance(state, dict)}
        if isinstance(state, dict):
            info["checkpointKind"] = "完整网络与恢复状态"
        else:
            # 语义线性层和wait增量检查点只保存局部参数，必须连同父模型保留。
            state = {name: value[name] for name in ["weight", "offset", "delta"] if torch.is_tensor(value.get(name))}
            info["checkpointKind"] = "依赖父模型的局部策略参数与恢复状态"
        tensors = [(name, list(t.shape), str(t.numpy().dtype), t.detach().cpu().contiguous().numpy().tobytes()) for name, t in state.items() if torch.is_tensor(t)]
        info.update(tensorCount=len(tensors), realParameters=sum(math.prod(shape) for _, shape, _, _ in tensors),
                    tensorSchema=[{"name": name, "shape": shape, "dtype": dtype} for name, shape, dtype, _ in sorted(tensors)],
                    namedTensorSha256=digest_named_tensors(tensors),
                    finite=all(bool(torch.isfinite(t).all()) for t in state.values() if torch.is_tensor(t)))
        optimizer = value.get("optimizer")
        if isinstance(optimizer, dict):
            groups = optimizer.get("param_groups", [])
            info["optimizer"] = {"present": True, "stateCount": len(optimizer.get("state", {})), "groups": [{k: v for k, v in group.items() if k != "params"} | {"parameterTensorCount": len(group.get("params", []))} for group in groups]}
        else:
            info["optimizer"] = {"present": False}
        info["resumeFields"] = {k: value[k] for k in ["epoch", "updates", "seed", "cursor", "contractSha256", "parentSha256"] if k in value}
        info["rngFields"] = [k for k in value if "rng" in k.lower()]
        info["identities"] = {k: value[k] for k in ["dataIdentity", "sourceIdentity"] if isinstance(value.get(k), dict)}
        if isinstance(value.get("identity"), dict):
            info["embeddedIdentity"] = value["identity"]
        if "step" in value and isinstance(value["step"], (int, float)):
            info["resumeFields"]["step"] = value["step"]
        return info
    except Exception as error:
        return {"path": str(path), "modelCheckpoint": None, "error": str(error)[:1800], "retention": "无法安全解析时保留，不退回不安全pickle模式"}


def inspect_models(files, by_path, references):
    import numpy as np
    checkpoints = [checkpoint_info(path) for path in files if path.suffix in {".pt", ".pth"} and "calibration" not in path.name]
    paths_by_sha = collections.defaultdict(list)
    for record in by_path.values():
        paths_by_sha[record["sha256"]].append(record["path"])
    for checkpoint in checkpoints:
        dependencies = []
        for identity_type, entries in checkpoint.get("identities", {}).items():
            for recorded_path, digest in entries.items():
                if not isinstance(digest, str):
                    continue
                current = local_reference(recorded_path, Path(checkpoint["path"]))
                current_record = by_path.get(str(current)) if current else None
                dependencies.append({"type": identity_type, "recordedPath": recorded_path, "expectedSha256": digest,
                                     "currentPath": str(current) if current else None,
                                     "currentShaMatchesExpected": bool(current_record and current_record["sha256"] == digest),
                                     "availableShaMatchingPaths": paths_by_sha.get(digest, []),
                                     "status": "当前或保留快照可按SHA定位" if paths_by_sha.get(digest) else "本限定范围未找到该SHA；不改写历史身份、不认定可无条件续训"})
        checkpoint["dependencyVerification"] = dependencies
        embedded_references = []
        def embedded_sha_refs(value, key_path):
            if isinstance(value, dict):
                for key, item in value.items():
                    embedded_sha_refs(item, key_path + [str(key)])
            elif isinstance(value, list):
                for index, item in enumerate(value):
                    embedded_sha_refs(item, key_path + [str(index)])
            elif isinstance(value, str) and re.fullmatch("[0-9a-f]{64}", value):
                embedded_references.append({"key": "/".join(key_path), "sha256": value, "availableShaMatchingPaths": paths_by_sha.get(value, []), "interpretation": "实存文件SHA或历史复合身份；没有对应文件时保留原身份，不据此断言数据丢失"})
        embedded_sha_refs(checkpoint.get("embeddedIdentity", {}), [])
        checkpoint["embeddedShaReferences"] = embedded_references
        parent = checkpoint.get("resumeFields", {}).get("parentSha256")
        checkpoint["parentDependency"] = {"expectedSha256": parent, "availableShaMatchingPaths": paths_by_sha.get(parent, [])} if parent else None
        checkpoint["embeddedParentDependencies"] = [r for r in embedded_references if re.search("parent|warm|champion", r["key"], re.I)]
        checkpoint["completePackageBytes"] = by_path[checkpoint["path"]]["bytes"]
        checkpoint["under100MB"] = by_path[checkpoint["path"]]["bytes"] < 100000000
        checkpoint["retention"] = "全部恢复检查点保留；包括优化器/RNG/游标，不因权重重复而删除"
    models = []
    for path in files:
        if path.suffix != ".json" or path.stat().st_size > 150000:
            continue
        try:
            meta = read_json(path)
        except (ValueError, UnicodeDecodeError):
            continue
        if not isinstance(meta, dict) or not isinstance(meta.get("tensors"), list) or not meta.get("parameters"):
            continue
        binary = path.with_suffix(".bin")
        if str(binary) not in by_path:
            continue
        shapes, offset, errors, payload = [], 0, [], binary.read_bytes()
        for item in meta["tensors"]:
            size = math.prod(item["shape"])
            if item["length"] != size or item["offset"] != offset:
                errors.append(item["name"])
            offset = item["offset"] + item["length"]
            shapes.append((item["name"], item["shape"], "float32", payload[item["offset"] * 4:offset * 4]))
        real = sum(math.prod(item["shape"]) for item in meta["tensors"])
        canonical = digest_named_tensors(shapes)
        paired = [c for c in checkpoints if c.get("namedTensorSha256") == canonical]
        # 完整包包含实际网络/schema、同目录恢复状态、校准与训练身份；数据与源码依赖另行引用。
        companions = [p for p in files if p.parent == path.parent and (p.name in {"head-calibration.json", "value-calibration.json", "value-config.json"} or p.suffix in {".pt", ".pth"} or (p.suffix == ".json" and any(t in p.name for t in ["protocol", "identity", "training", "train-", "freeze"])))]
        package = sorted(set([path, binary, *companions]))
        package_bytes = sum(by_path[str(p)]["bytes"] for p in package)
        parent_references = []
        def find_parent_references(value, key_path, document):
            if isinstance(value, dict):
                for key, item in value.items():
                    find_parent_references(item, key_path + [key], document)
            elif isinstance(value, list):
                for index, item in enumerate(value):
                    find_parent_references(item, key_path + [str(index)], document)
            elif isinstance(value, str) and key_path and re.search("parent|warm|champion", key_path[-1], re.I):
                parent_references.append({"document": str(document), "key": "/".join(key_path), "value": value,
                                          "shaMatchingPaths": paths_by_sha.get(value, []) if re.fullmatch("[0-9a-f]{64}", value) else []})
        for companion in companions:
            if companion.suffix == ".json":
                try:
                    find_parent_references(read_json(companion), [], companion)
                except (ValueError, UnicodeError):
                    pass
        valid = meta.get("dtype") == "float32-le" and real == meta["parameters"] and len(payload) == real * 4 and not errors and bool(np.isfinite(np.frombuffer(payload, dtype="<f4")).all())
        models.append({"schemaPath": str(path), "weightsPath": str(binary), "schemaSha256": by_path[str(path)]["sha256"], "weightsSha256": by_path[str(binary)]["sha256"],
                       "model": meta.get("model"), "schema": meta.get("schema"), "dtype": meta.get("dtype"), "declaredParameters": meta["parameters"], "realParameters": real,
                       "tensorCount": len(meta["tensors"]), "tensorSchema": meta["tensors"], "offsetErrors": errors, "finite": bool(np.isfinite(np.frombuffer(payload, dtype="<f4")).all()),
                       "valid": valid, "namedTensorSha256": canonical, "matchingCheckpointPaths": [c["path"] for c in paired],
                       "calibrationPaths": [str(p) for p in companions if "calibration" in p.name or p.name == "value-config.json"],
                       "declaredParentReferences": parent_references,
                       "checkpointParentDependencies": [c["parentDependency"] for c in paired if c.get("parentDependency")],
                       "packagePaths": [str(p) for p in package], "completePackageBytes": package_bytes, "thresholdBytes": 100000000, "under100MB": package_bytes < 100000000,
                       "weightShaReferences": references.get(by_path[str(binary)]["sha256"], []), "retention": "保留；包括未晋升、网格、早期和失败尝试中的有效不同小模型"})
    groups = collections.defaultdict(list)
    for model in models:
        groups[model["namedTensorSha256"]].append(model["weightsPath"])
    checkpoint_only = [c for c in checkpoints if c.get("modelCheckpoint") and c.get("namedTensorSha256") not in groups]
    legacy = []
    legacy_path = TRAINING / "tactical_value_search_20261018/model-final.json"
    if str(legacy_path) in by_path:
        value = read_json(legacy_path)
        policy, state_value = value["weights"], value["valueWeights"]
        bias = value["schema"].get("groupTypeBias", [])
        legacy.append({"path": str(legacy_path), "sha256": by_path[str(legacy_path)]["sha256"], "schema": value["schema"], "policyWeightCount": len(policy), "valueWeightCount": len(state_value), "storedWeightScalars": len(policy) + len(state_value), "schemaGroupBiasCount": len(bias), "finite": all(math.isfinite(v) for v in policy + state_value + bias), "completePackageBytes": by_path[str(legacy_path)]["bytes"], "under100MB": by_path[str(legacy_path)]["bytes"] < 100000000, "checkpoint": "此精确历史引用是自含JSON推理包；未扩大旧目录检查优化器", "retention": "历史对比直接引用的小模型完整保留"})
    return {"generatedAt": now(), "scope": "七个双流主目录及明确直接依赖；不拓展为全历史模型清查", "packageDefinition": "网络schema+二进制+同目录checkpoint、外置校准、训练身份/协议；共享父模型与源码、数据引用另列，不复制。100MB=100000000字节。", "summary": {"modelSchemaWeightPairs": len(models), "uniqueNetworkTensorStates": len(groups), "validModelPairs": sum(m["valid"] for m in models), "allPackagesUnder100MB": all(m["under100MB"] for m in models), "checkpoints": len(checkpoints), "checkpointOnlyStates": len(checkpoint_only), "legacyReferencedModels": len(legacy)}, "models": models, "checkpoints": checkpoints, "checkpointOnlyStates": checkpoint_only, "legacyReferencedModels": legacy, "sameNetworkWeights": [{"namedTensorSha256": key, "paths": value} for key, value in groups.items() if len(value) > 1], "deleteModelPaths": []}


def build_references(files):
    refs = collections.defaultdict(list)
    for path in files:
        if path.suffix not in TEXT_SUFFIXES or path.stat().st_size > 4 * 1024 * 1024:
            continue
        try:
            content = path.read_text("utf-8-sig")
        except UnicodeError:
            continue
        for digest in set(SHA_PATTERN.findall(content)):
            refs[digest].append(str(path))
    return refs


def audit_rule_caches(files, by_path):
    source_by_sha = collections.defaultdict(list)
    for path in files:
        if path.name == "actions.jsonl.gz":
            source_by_sha[by_path[str(path)]["sha256"]].append(str(path))
    results = []
    for name in [SCOPES[4], SCOPES[6]]:
        base = TRAINING / name
        index = base / "evaluation-exclusions.txt.gz"
        # 单次只读取一个现行索引，不加载历史索引，也不做规则重放。
        excluded, plain_digest = set(), hashlib.sha256()
        with gzip.open(index, "rb") as stream:
            for line in stream:
                plain_digest.update(line)
                excluded.add(line.rstrip(b"\r\n").decode("ascii"))
        receipt = read_json(base / "evaluation-exclusion-receipt.json")
        index_verified = plain_digest.hexdigest() == receipt.get("sha256")
        paths = [p for p in files if "evaluation-rule-cache" in p.parts and p.is_relative_to(base)]
        for path in paths:
            row = {"path": str(path), "currentIndexPath": str(index), "currentIndexSha256": by_path[str(index)]["sha256"], "indexPlainShaMatchesReceipt": index_verified}
            try:
                with gzip.open(path, "rt", encoding="utf-8") as stream:
                    cache = json.load(stream)
                source = cache.get("sourceSha256", "")
                authority = cache.get("authoritySha256", "")
                hashes = cache.get("hashes")
                schema_valid = bool(re.fullmatch("[0-9a-f]{64}", source) and re.fullmatch("[0-9a-f]{64}", authority) and isinstance(hashes, list) and isinstance(cache.get("actions"), int) and all(isinstance(v, str) and re.fullmatch("[0-9a-f]{64}", v) for v in hashes))
                missing = sum(v not in excluded for v in hashes) if isinstance(hashes, list) else None
                name_matches = path.name == hashlib.sha256((source + authority).encode()).hexdigest() + ".json.gz"
                row.update(sourceSha256=source, authoritySha256=authority, sourcePaths=source_by_sha.get(source, []), hashCount=len(hashes) if isinstance(hashes, list) else None, missingFromCurrentIndex=missing,
                           schemaValid=schema_valid, filenameIdentityValid=name_matches, actions=cache.get("actions"))
                row["safeCandidate"] = bool(index_verified and schema_valid and name_matches and source_by_sha.get(source) and missing == 0)
            except (ValueError, OSError, UnicodeError) as error:
                row.update(safeCandidate=False, error=str(error))
            results.append(row)
        del excluded
    return results


def inventory():
    started = now()
    disk = shutil.disk_usage(ROOT)
    files, skipped, reasons = discover_files()
    print(json.dumps({"event": "开始逐文件SHA", "files": len(files)}, ensure_ascii=False), flush=True)
    records = []
    for index, path in enumerate(files):
        stat = path.stat()
        records.append({"path": str(path), "relativePath": rel(path), "bytes": stat.st_size, "sha256": sha_file(path), "category": category(path), "scopeReason": reasons[str(path)], "mtimeNs": stat.st_mtime_ns, "device": stat.st_dev, "inode": stat.st_ino, "hardlinkCount": stat.st_nlink})
        if index and index % 5000 == 0:
            print(json.dumps({"event": "SHA进度", "completed": index}, ensure_ascii=False), flush=True)
    by_path = {row["path"]: row for row in records}
    references = build_references(files)
    print(json.dumps({"event": "校验规则缓存与当前索引包含关系"}, ensure_ascii=False), flush=True)
    cache_audit = audit_rule_caches(files, by_path)
    candidates = []
    for row in records:
        if row["category"] == "Python字节码缓存":
            source = Path(row["path"]).parent.parent / (Path(row["path"]).name.split(".cpython-")[0] + ".py")
            if source.is_file() and safe_path(source):
                candidates.append({"path": row["path"], "bytes": row["bytes"], "sha256": row["sha256"], "type": "python-bytecode", "sourcePaths": [str(source)], "reason": "CPython派生字节码，源文件保留且可再次导入生成", "rebuild": "使用原Python版本再次导入保留的.py源文件；本轮不运行训练脚本"})
    for audit in cache_audit:
        if audit["safeCandidate"]:
            row = by_path[audit["path"]]
            candidates.append({"path": row["path"], "bytes": row["bytes"], "sha256": row["sha256"], "type": "evaluation-rule-cache", "sourcePaths": audit["sourcePaths"], "reason": "原始动作轨迹实存且SHA相同，缓存身份有效，全部状态哈希已进入保留的现行排重索引", "rebuild": "未来确需新规则排重时，在新输出目录使用对应保留权威规则和exclusions.ts从sourcePaths独立strict恢复；不覆盖现行或历史索引。现行SHA绑定索引已保留，旧代恢复不依赖本缓存。", "validation": audit})
    candidate_paths = {row["path"] for row in candidates}
    for row in records:
        row["retention"] = "清单内可重建缓存候选；本次未删除" if row["path"] in candidate_paths else "保留且删后逐文件SHA核验"
    duplicates = collections.defaultdict(list)
    for row in records:
        duplicates[(row["sha256"], row["bytes"])].append(row)
    duplicate_rows = [{"sha256": digest, "bytesEach": size, "paths": [r["path"] for r in rows], "physicalFileIdentities": len({(r["device"], r["inode"]) for r in rows}), "retention": "保留全部路径；重复内容不是本轮删除授权"} for (digest, size), rows in duplicates.items() if len(rows) > 1]
    models = inspect_models(files, by_path, references)
    scopes = []
    for name in SCOPES:
        subset = [r for r in records if r["relativePath"].startswith("ai_training/" + name + "/")]
        scopes.append({"path": str(TRAINING / name), "files": len(subset), "bytes": sum(r["bytes"] for r in subset)})
    protected_indices = []
    for row in records:
        if row["category"] == "必须保留_训练排重身份":
            stem = Path(row["path"]).name.removesuffix(".txt.gz")
            fixture = any(part.startswith("index-regression-") for part in Path(row["path"]).parts)
            protected_indices.append({"path": row["path"], "sha256": row["sha256"], "bytes": row["bytes"], "historyFilenameMatchesSha": stem == row["sha256"] if re.fullmatch("[0-9a-f]{64}", stem) else None, "indexRole": "坏副本拒绝回归夹具；源码故意以错误SHA命名原始字节" if fixture else "真实训练排重索引", "shaReferences": references.get(row["sha256"], []), "reason": "恢复、训练隔离与输入身份可能按内容SHA引用；保留所有版本"})
    manifest = {"generatedAt": now(), "startedAt": started, "root": str(ROOT), "scopeDirectories": scopes, "scopeBoundary": "七个主目录全部实存普通文件，另含Phase 6交付清单明确文件、阶段5.1缓存归档和主入口第一层源码导入；不递归扩展到整个旧研究或来源封存库。", "excludedTraversal": ["ai_training/src", "ai_training/APK", "ai_training/node_modules", "ai_training/captures", "所有重解析点及归档联接"], "skippedReparseOrBlockedPaths": skipped, "diskBefore": {"totalBytes": disk.total, "usedBytes": disk.used, "freeBytes": disk.free}, "summary": {"files": len(records), "bytes": sum(r["bytes"] for r in records), "sha256VerifiedFiles": len(records), "cleanupCandidateFiles": len(candidates), "cleanupCandidateBytes": sum(c["bytes"] for c in candidates), "preservedFiles": len(records)-len(candidates), "duplicateGroups": len(duplicate_rows)}, "files": records, "duplicateContentGroups": duplicate_rows, "protectedEvaluationIndices": protected_indices}
    cleanup = {"generatedAt": now(), "status": "audit_only_no_deletions", "root": str(ROOT), "allowedRoots": [str(TRAINING / name) for name in SCOPES], "fileCount": len(candidates), "logicalBytes": sum(row["bytes"] for row in candidates), "diskBefore": manifest["diskBefore"], "deletionRequirements": ["仅以逐文件绝对路径PowerShell Remove-Item -LiteralPath删除，不递归删除目录", "删除前核对路径处于allowedRoots、每一级不是重解析点、文件大小和SHA仍与清单一致", "不得从重复组、未通过缓存核验组、排重索引、模型或归档派生更多删除项", "删除后运行asset_inventory.py --verify --allow-cleaned核对全部保留文件SHA"], "candidates": sorted(candidates, key=lambda r:r["path"]), "ruleCacheAudit": cache_audit, "protectedEvaluationIndices": protected_indices, "retainModelPaths": [m["weightsPath"] for m in models["models"]] + [c["path"] for c in models["checkpoints"]], "actualDeletedPaths": []}
    save_json("ASSET_MANIFEST.json", manifest)
    save_json("MODEL_REGISTRY.json", models)
    save_json("CLEANUP_MANIFEST.json", cleanup)
    count = collections.Counter(c["type"] for c in candidates)
    sizes = collections.Counter()
    for row in candidates:
        sizes[row["type"]] += row["bytes"]
    lines = ["# 双流资产与缓存清理审计", "", "本工具只盘点和核验，没有删除或改写历史资产，没有启动训练或规则重放。", "", f"核验时间：{manifest['generatedAt']}。逐文件SHA-256核验{len(records)}份、合计{manifest['summary']['bytes']:,}字节。审计前C盘空闲{disk.free:,}字节（{disk.free / 1024**3:.2f} GiB）。", "", "| 范围 | 文件 | 字节 |", "|---|---:|---:|"]
    lines += [f"| {Path(s['path']).name} | {s['files']} | {s['bytes']:,} |" for s in scopes]
    lines += ["", "## 模型保全", "", f"识别{len(models['models'])}组schema/权重配对，{models['summary']['uniqueNetworkTensorStates']}种不同网络张量状态；安全解析{len(models['checkpoints'])}份检查点。全部模型文件与有效不同小模型保留，未晋升和失败尝试不构成删除理由。", "", f"每个完整包按schema、权重、同目录checkpoint、外置校准及训练身份/协议计量；100MB为100,000,000字节。全部小于门槛：{models['summary']['allPackagesUnder100MB']}。父模型和数据/源码是共享引用，不复制入包。真实参数按张量shape逐项复算、校验offset/length、二进制字节数和有限性；检查点记录优化器、游标/RNG、来源身份及父权重SHA。详见MODEL_REGISTRY.json。", "", f"发现{len(duplicate_rows)}组字节相同文件；完整列出路径、SHA和物理文件身份，未把重复内容直接列为清理对象。", "", "## 可执行清理候选", "", f"共{len(candidates)}文件、{cleanup['logicalBytes']:,}字节（{cleanup['logicalBytes']/1024**2:.2f} MiB）逻辑大小；实际释放量须由执行方实测。", "", "| 类别 | 文件 | 字节 |", "|---|---:|---:|"]
    lines += [f"| {key} | {count[key]} | {sizes[key]:,} |" for key in sorted(count)]
    lines += ["", f"规则缓存逐份解压核对schema、文件名身份、原动作轨迹SHA与现行排重索引包含关系；{sum(a['safeCandidate'] for a in cache_audit)}/{len(cache_audit)}份通过。未通过的缓存保留，细节见CLEANUP_MANIFEST.json/ruleCacheAudit。CPython缓存仅在原.py源文件实存时列入。", "", f"现行及历史排重索引共{len(protected_indices)}份全部保留。post_evaluation_audit.ts、isolation_phase51.ts、isolation_phase52.ts与checkpoint/dataIdentity按索引内容SHA恢复训练输入，不能把evaluation-index-history与evaluation-exclusions当作缓存清理。阶段5.1两个校准归档也按历史清单SHA保留。", "", "## 执行与删后保全核验", "", "CLEANUP_MANIFEST.json/candidates提供绝对路径、原大小、原SHA、理由、重建说明与源轨迹。执行方仅用PowerShell Remove-Item -LiteralPath逐文件删除，预先校验所有父路径没有重解析点且位于allowedRoots；不递归删除目录。", "", "```powershell", "& 'C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe' -X utf8 ai_training/pretrain_preflight_20261022/asset_inventory.py --verify --allow-cleaned", "```", "", "该入口重新核验ASSET_MANIFEST.json记录的全部文件；只容许CLEANUP_MANIFEST.json精确候选缺失，任何保留文件缺失或内容/大小变化均返回非零退出码。仍存在的候选也必须SHA相符。--verify不改清单；可通过--verification-output另存执行回执。", "", "## 范围与限制", "", manifest["scopeBoundary"], "不遍历支持链接、APK、node_modules、captures或归档重解析点。对外部封存来源及全部历史版本不作完整审计声明。现存历史哈希引用只登记，不改写旧路径或将旧源码身份强行替换为当前版本。"]
    (OUT / "CLEANUP_REPORT.md").write_text("\n".join(lines) + "\n", "utf-8")
    print(json.dumps({"event": "资产审计完成", **manifest["summary"], "models": models["summary"]}, ensure_ascii=False), flush=True)


def verify(allow_cleaned, output):
    manifest, cleanup = read_json(OUT / "ASSET_MANIFEST.json"), read_json(OUT / "CLEANUP_MANIFEST.json")
    allowed = {row["path"] for row in cleanup["candidates"]} if allow_cleaned else set()
    changed, missing, unsafe, cleaned, checked = [], [], [], [], 0
    for row in manifest["files"]:
        path = Path(row["path"])
        if not safe_path(path):
            unsafe.append(row["path"])
        elif not path.is_file():
            (cleaned if row["path"] in allowed else missing).append(row["path"])
        else:
            if path.stat().st_size != row["bytes"] or sha_file(path) != row["sha256"]:
                changed.append(row["path"])
            checked += 1
    disk = shutil.disk_usage(ROOT)
    result = {"generatedAt": now(), "passed": not (changed or missing or unsafe), "manifestSha256": sha_file(OUT / "ASSET_MANIFEST.json"), "cleanupManifestSha256": sha_file(OUT / "CLEANUP_MANIFEST.json"), "checkedFiles": checked, "allowedCleanedFiles": len(cleaned), "changed": changed, "missing": missing, "unsafe": unsafe, "cleanedPaths": cleaned, "diskFreeBytes": disk.free}
    if output:
        target = Path(output)
        if not target.is_absolute():
            target = ROOT / target
        if not safe_path(target) or not target.is_relative_to(OUT):
            raise ValueError("复核回执只允许写入当前审计输出目录")
        target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["passed"] else 1


def extend_historical():
    manifest = read_json(OUT / "ASSET_MANIFEST.json")
    known = {row["path"] for row in manifest["files"]}
    added = []
    for path in historical_exact_files():
        if str(path) in known:
            continue
        if not path.is_file() or not safe_path(path):
            raise ValueError("精确历史依赖无法安全读取：" + str(path))
        stat = path.stat()
        added.append({"path": str(path), "relativePath": rel(path), "bytes": stat.st_size, "sha256": sha_file(path), "category": category(path), "scopeReason": "阶段3历史基线脚本精确读取的模型、摘要或逐槽身份；不扩大旧目录", "mtimeNs": stat.st_mtime_ns, "device": stat.st_dev, "inode": stat.st_ino, "hardlinkCount": stat.st_nlink, "retention": "保留且删后逐文件SHA核验"})
    manifest["files"] = sorted(manifest["files"] + added, key=lambda row: row["path"])
    for key in ["files", "sha256VerifiedFiles", "preservedFiles"]:
        manifest["summary"][key] += len(added)
    manifest["summary"]["bytes"] += sum(row["bytes"] for row in added)
    manifest["scopeBoundary"] += "另按主代理确认加入阶段3历史基线脚本精确引用的模型、摘要与80槽result/started文件，不扩大旧目录。"
    manifest["historicalExactExtension"] = {"generatedAt": now(), "files": len(added), "bytes": sum(row["bytes"] for row in added)}
    duplicates = collections.defaultdict(list)
    for row in manifest["files"]:
        duplicates[(row["sha256"], row["bytes"])].append(row)
    manifest["duplicateContentGroups"] = [{"sha256": digest, "bytesEach": size, "paths": [r["path"] for r in rows], "physicalFileIdentities": len({(r["device"], r["inode"]) for r in rows}), "retention": "保留全部路径；重复内容不是本轮删除授权"} for (digest, size), rows in duplicates.items() if len(rows) > 1]
    manifest["summary"]["duplicateGroups"] = len(manifest["duplicateContentGroups"])
    save_json("ASSET_MANIFEST.json", manifest)
    with (OUT / "CLEANUP_REPORT.md").open("a", encoding="utf-8") as stream:
        stream.write(f"\n## 精确历史依赖增补\n\n另加入{len(added)}份精确引用、{sum(row['bytes'] for row in added):,}字节；最终保全清单为{manifest['summary']['files']}份、{manifest['summary']['bytes']:,}字节。未扩大旧目录，也没有增加清理项。\n")
    print(json.dumps(manifest["historicalExactExtension"], ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="双流资产只读盘点与删后SHA保全检查，不执行删除")
    parser.add_argument("--verify", action="store_true", help="重新核验既有清单")
    parser.add_argument("--allow-cleaned", action="store_true", help="容许精确候选缺失，其余文件全部保全")
    parser.add_argument("--verification-output", help="可选：将复核回执另存当前审计目录")
    parser.add_argument("--refresh-models", action="store_true", help="在既有SHA清单上刷新模型结构、父依赖和检查点检查，不重新盘点或改清理候选")
    parser.add_argument("--extend-historical", action="store_true", help="向既有清单增补精确历史基线依赖，不扩大目录或清理范围")
    args = parser.parse_args()
    warnings.filterwarnings("ignore", category=FutureWarning, module="torch")
    if args.verify:
        sys.exit(verify(args.allow_cleaned, args.verification_output))
    if args.extend_historical:
        extend_historical()
        sys.exit(0)
    if args.refresh_models:
        manifest = read_json(OUT / "ASSET_MANIFEST.json")
        file_records = {row["path"]: row for row in manifest["files"]}
        paths = [Path(row["path"]) for row in manifest["files"]]
        registry = inspect_models(paths, file_records, build_references(paths))
        save_json("MODEL_REGISTRY.json", registry)
        print(json.dumps(registry["summary"], ensure_ascii=False))
        sys.exit(0)
    inventory()
