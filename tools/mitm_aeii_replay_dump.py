"""保存 AEII 多人远端回放响应的 mitmproxy 插件。

该插件只保存 /api/game_get 的响应体。请求体通常包含账号认证信息，
默认不落盘，避免无意保存敏感凭据。
"""

from __future__ import annotations

import os
import struct
import warnings
from datetime import datetime
from pathlib import Path

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, modes
try:
    from cryptography.hazmat.decrepit.ciphers import algorithms as decrepit_algorithms
except Exception:  # pragma: no cover - 兼容旧版 cryptography
    decrepit_algorithms = None
from cryptography.hazmat.primitives.ciphers import algorithms
from mitmproxy import http
from mitmproxy import ctx


APK_MAGIC = 365703
DEFAULT_NETWORK_KEY = bytes.fromhex("726b000000004646")
ROOM_STATUS_CLOSED = 2


class ApkObjectReader:
    def __init__(self, data: bytes, label: str) -> None:
        self.data = data
        self.label = label
        self.offset = 0

    def require(self, length: int) -> None:
        if self.offset + length > len(self.data):
            raise ValueError(f"{self.label}: 数据长度不足 offset={self.offset} length={length}")

    def read_bool(self) -> bool:
        self.require(1)
        value = self.data[self.offset] != 0
        self.offset += 1
        return value

    def read_int(self) -> int:
        self.require(4)
        value = struct.unpack(">i", self.data[self.offset:self.offset + 4])[0]
        self.offset += 4
        return value

    def read_long(self) -> int:
        self.require(8)
        value = struct.unpack(">q", self.data[self.offset:self.offset + 8])[0]
        self.offset += 8
        return value

    def read_bytes(self, length: int) -> bytes:
        self.require(length)
        value = self.data[self.offset:self.offset + length]
        self.offset += length
        return value

    def read_java_utf(self) -> str:
        self.require(2)
        length = struct.unpack(">H", self.data[self.offset:self.offset + 2])[0]
        self.offset += 2
        return decode_modified_utf8(self.read_bytes(length))

    def read_nullable_string(self) -> str | None:
        if self.read_bool():
            return None
        return self.read_java_utf()

    def read_nullable_byte_array(self) -> bytes | None:
        if self.read_bool():
            return None
        length = self.read_int()
        if length < 0:
            raise ValueError(f"{self.label}: byte[] 长度无效 {length}")
        return self.read_bytes(length)

    def read_nullable_enum_ordinal(self) -> int | None:
        if self.read_bool():
            return None
        return self.read_int()


def decode_modified_utf8(data: bytes) -> str:
    code_units: list[int] = []
    index = 0
    while index < len(data):
        first = data[index]
        if first & 0x80 == 0:
            code_units.append(first)
            index += 1
        elif first & 0xE0 == 0xC0:
            second = data[index + 1]
            code_units.append(((first & 0x1F) << 6) | (second & 0x3F))
            index += 2
        else:
            second = data[index + 1]
            third = data[index + 2]
            code_units.append(((first & 0x0F) << 12) | ((second & 0x3F) << 6) | (third & 0x3F))
            index += 3
    return "".join(chr(unit) for unit in code_units)


def encode_java_utf(value: str) -> bytes:
    encoded = bytearray()
    for char in value:
        code = ord(char)
        if 0x0001 <= code <= 0x007F:
            encoded.append(code)
        elif code <= 0x07FF:
            encoded.append(0xC0 | ((code >> 6) & 0x1F))
            encoded.append(0x80 | (code & 0x3F))
        else:
            encoded.append(0xE0 | ((code >> 12) & 0x0F))
            encoded.append(0x80 | ((code >> 6) & 0x3F))
            encoded.append(0x80 | (code & 0x3F))
    if len(encoded) > 0xFFFF:
        raise ValueError("Java UTF 字符串过长")
    return struct.pack(">H", len(encoded)) + bytes(encoded)


def get_network_key() -> bytes:
    override = os.environ.get("AEII_NETWORK_KEY_HEX", "").strip()
    if override:
        key = bytes.fromhex(override)
    else:
        key = DEFAULT_NETWORK_KEY
    if len(key) != 8:
        raise ValueError("AEII_NETWORK_KEY_HEX 必须是 8 字节 DES key")
    return key


def triple_des_algorithm(key: bytes):
    key24 = key * 3
    if decrepit_algorithms is not None and hasattr(decrepit_algorithms, "TripleDES"):
        return decrepit_algorithms.TripleDES(key24)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return algorithms.TripleDES(key24)


def decrypt_apk_payload(data: bytes) -> bytes:
    key = get_network_key()
    decryptor = Cipher(triple_des_algorithm(key), modes.CBC(key)).decryptor()
    padded = decryptor.update(data) + decryptor.finalize()
    unpadder = padding.PKCS7(64).unpadder()
    return unpadder.update(padded) + unpadder.finalize()


def encrypt_apk_payload(data: bytes) -> bytes:
    key = get_network_key()
    padder = padding.PKCS7(64).padder()
    padded = padder.update(data) + padder.finalize()
    encryptor = Cipher(triple_des_algorithm(key), modes.CBC(key)).encryptor()
    return encryptor.update(padded) + encryptor.finalize()


def parse_c0635f_value(reader: ApkObjectReader):
    if reader.read_bool():
        return None
    value_type = reader.read_int()
    if value_type == 0:
        return reader.read_bool()
    if value_type == 1:
        return reader.read_int()
    if value_type == 2:
        reader.require(4)
        value = struct.unpack(">f", reader.data[reader.offset:reader.offset + 4])[0]
        reader.offset += 4
        return value
    if value_type == 3:
        return reader.read_long()
    if value_type == 4:
        raw = reader.read_nullable_byte_array()
        return raw.decode("utf-8") if raw is not None else None
    if value_type == 5:
        return reader.read_nullable_byte_array()
    return None


def parse_c1270o(data: bytes) -> dict[str, object]:
    reader = ApkObjectReader(data, "C1270o")
    magic = reader.read_int()
    if magic != APK_MAGIC:
        raise ValueError(f"C1270o: 未知 magic {magic}")
    if reader.read_bool():
        raise ValueError("C1270o: 根对象为 null")
    reader.read_int()
    count = reader.read_int()
    result: dict[str, object] = {}
    for _ in range(count):
        key = reader.read_nullable_string()
        if key is None:
            raise ValueError("C1270o: key 为 null")
        result[key] = parse_c0635f_value(reader)
    return result


def parse_c1260f_array(data: bytes) -> list[dict[str, object]]:
    reader = ApkObjectReader(data, "C1260f[]")
    magic = reader.read_int()
    if magic != APK_MAGIC:
        raise ValueError(f"C1260f[]: 未知 magic {magic}")
    if reader.read_bool():
        return []
    count = reader.read_int()
    games: list[dict[str, object]] = []
    for _ in range(count):
        if reader.read_bool():
            continue
        game_id = reader.read_nullable_string()
        reader.read_nullable_string()
        reader.read_nullable_string()
        reader.read_nullable_string()
        reader.read_nullable_enum_ordinal()
        reader.read_nullable_enum_ordinal()
        map_or_mod_id = reader.read_nullable_string()
        map_index = reader.read_int()
        reader.read_int()
        status = reader.read_nullable_enum_ordinal()
        reader.read_long()
        reader.read_long()
        marker = reader.read_int()
        games.append({
            "id": game_id,
            "status": status,
            "map_or_mod_id": map_or_mod_id,
            "map_index": map_index,
            "marker": marker,
        })
    return games


def write_nullable_string(value: str) -> bytes:
    return b"\x00" + encode_java_utf(value)


def write_c0635f_int(value: int) -> bytes:
    return b"\x00" + struct.pack(">i", 1) + struct.pack(">i", value)


def write_c0635f_string(value: str) -> bytes:
    raw = value.encode("utf-8")
    return b"\x00" + struct.pack(">i", 4) + b"\x00" + struct.pack(">i", len(raw)) + raw


def encode_game_get_request(game_id: str, account_token: str) -> bytes:
    # C1270o 请求体：C0601r magic + 非空 C1270o + f3070b=0 + C0634e 字段表。
    fields = [
        ("v1", write_c0635f_int(100)),
        ("v2", write_c0635f_int(400)),
        ("i", write_c0635f_string(game_id)),
        ("a1", write_c0635f_string(account_token)),
    ]
    body = bytearray()
    body += struct.pack(">i", APK_MAGIC)
    body += b"\x00"
    body += struct.pack(">i", 0)
    body += struct.pack(">i", len(fields))
    for key, value in fields:
        body += write_nullable_string(key)
        body += value
    return encrypt_apk_payload(bytes(body))


class AeiiReplayDump:
    def __init__(self) -> None:
        self.count = 0
        self.batch_count = 0
        self.batch_seen: set[str] = set()
        self.batch_enabled = os.environ.get("AEII_MITM_BATCH_GAME_LIST", "0") == "1"
        self.batch_closed_only = os.environ.get("AEII_MITM_BATCH_CLOSED_ONLY", "1") != "0"
        self.batch_max_per_page = int(os.environ.get("AEII_MITM_BATCH_MAX_PER_PAGE", "20"))
        root = os.environ.get("AEII_MITM_OUT_DIR", "")
        if root:
            self.out_dir = Path(root)
        else:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            self.out_dir = Path("captures") / "mitm_replay" / timestamp
        self.out_dir.mkdir(parents=True, exist_ok=True)

    def response(self, flow: http.HTTPFlow) -> None:
        host = flow.request.pretty_host.lower()
        path = flow.request.path
        if "ae-multiplayer" not in host:
            return
        if flow.response is None:
            return

        if "/api/game_list" in path and self.batch_enabled:
            self.handle_game_list(flow)
            return

        if "/api/game_get" not in path:
            return

        self.count += 1
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        prefix = f"game_get_{timestamp}_{self.count:03d}"
        body_path = self.out_dir / f"{prefix}.bin"
        meta_path = self.out_dir / f"{prefix}.txt"

        body = flow.response.raw_content or flow.response.content or b""
        body_path.write_bytes(body)

        # 只保存必要元数据，不保存请求体，避免泄露账号认证字段。
        meta_path.write_text(
            "\n".join(
                [
                    f"time={datetime.now().isoformat(timespec='seconds')}",
                    f"method={flow.request.method}",
                    f"url={flow.request.pretty_url}",
                    f"status_code={flow.response.status_code}",
                    f"response_bytes={len(body)}",
                    f"body_file={body_path.name}",
                ]
            )
            + "\n",
            encoding="utf-8",
        )

        print(f"[AEII] 已保存 /api/game_get 响应：{body_path}")

    def handle_game_list(self, flow: http.HTTPFlow) -> None:
        try:
            request_fields = parse_c1270o(decrypt_apk_payload(flow.request.raw_content or flow.request.content or b""))
            account_token = request_fields.get("a1")
            if not isinstance(account_token, str) or not account_token:
                print("[AEII] game_list 请求缺少 a1，会跳过批量下载")
                return

            response_fields = parse_c1270o(decrypt_apk_payload(flow.response.raw_content or flow.response.content or b""))
            raw_list = response_fields.get("s2")
            if not isinstance(raw_list, bytes):
                print("[AEII] game_list 响应缺少 s2，会跳过批量下载")
                return

            games = parse_c1260f_array(raw_list)
            queued = 0
            for game in games:
                game_id = game.get("id")
                status = game.get("status")
                if not isinstance(game_id, str) or not game_id:
                    continue
                if self.batch_closed_only and status != ROOM_STATUS_CLOSED:
                    continue
                if game_id in self.batch_seen:
                    continue
                if queued >= self.batch_max_per_page:
                    break

                self.batch_seen.add(game_id)
                queued += 1
                self.batch_count += 1
                replay_flow = flow.copy()
                replay_flow.request.path = "/api/game_get"
                replay_flow.request.content = encode_game_get_request(game_id, account_token)
                replay_flow.request.headers["accept"] = "application/octet-stream"
                replay_flow.request.headers["x-aeii-batch"] = "1"
                replay_flow.metadata["aeii_batch_game_id"] = game_id
                ctx.master.commands.call("replay.client", [replay_flow])

            print(f"[AEII] game_list 发现 {len(games)} 条，已批量请求 {queued} 条 CLOSED 回放；累计 {self.batch_count} 条")
        except Exception as exc:
            print(f"[AEII] game_list 批量下载失败：{exc}")


addons = [AeiiReplayDump()]
