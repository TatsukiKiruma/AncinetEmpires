"""正式单局契约：保留旧短冒烟版本，单父局最多两万个原生动作。"""

from contract import EXPECTED, SUCCESS_FILES, file_sha256, inspect_apk, parse_device_sha, parse_package_path, require_identity, summarize_evidence
from contract import validate_job as validate_smoke_job

MAX_ACTIONS = 20000


def validate_job(job: dict) -> None:
    count = job.get("maxActions")
    if type(count) is not int or not 1 <= count <= MAX_ACTIONS:
        raise ValueError("正式单局动作上限必须在1至20000之间")
    # 其余字段使用原有严格契约，不放开并发、派生开局或随机源注入。
    validate_smoke_job({**job, "maxActions": min(count, 200)})
