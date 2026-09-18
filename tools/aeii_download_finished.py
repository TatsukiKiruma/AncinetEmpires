"""使用本机令牌分页下载已结束对局，保留证书校验和下载进度。"""

import argparse
import hashlib
import json
import ssl
import struct
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from mitm_aeii_token_capture import HOSTS, ROOT, load_helpers


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-unverified-na', action='store_true', help='经用户授权，仅对北美服务放宽证书校验')
    args = parser.parse_args()
    helpers = load_helpers()
    session = json.loads((ROOT / ".env.aeii-session.json").read_text(encoding="utf-8"))
    host, token = session["host"], session["token"]
    if host not in HOSTS or not token:
        raise ValueError("本机会话缺少有效服务地址或令牌")
    output = ROOT / "captures" / "cloud" / datetime.now().strftime("%Y%m%d_%H%M%S")
    output.mkdir(parents=True, exist_ok=True)
    report = {"host": host, "started_at": datetime.now(timezone.utc).isoformat(),
              "tls_verified": True, "complete": False, "pages": 0, "downloads": [], "errors": []}
    context = ssl.create_default_context()
    if args.allow_unverified_na:
        if host != 'ae-multiplayer-na.toyknight.net':
            raise ValueError('证书例外仅适用于用户授权的北美服务')
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        report['tls_verified'] = False
    # 不跟随重定向，避免将认证请求转发至非预期服务。
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=context), NoRedirect())

    def save_report():
        (output / "download_report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    def request(endpoint, payload):
        req = urllib.request.Request("https://" + host + endpoint, data=payload,
            headers={"Accept": "application/octet-stream", "Content-Type": "application/octet-stream"}, method="POST")
        for attempt in range(3):
            try:
                with opener.open(req, timeout=30) as response:
                    data = response.read()
                break
            except (urllib.error.URLError, TimeoutError):
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
        plain = helpers["decrypt_apk_payload"](data)
        status = struct.unpack(">i", plain[5:9])[0]
        if status != 100:
            raise ValueError("API_STATUS_" + str(status))
        return data, helpers["parse_c1270o"](plain)

    seen = set()
    report['duplicates'] = 0
    report['skipped_not_closed'] = 0
    try:
        page = 0
        while True:
            # 与 APK 的“已结束的游戏”页一致：s3=false，f4=true。
            fields = [("s3", b"\x00" + struct.pack(">i", 0) + b"\x00"),
                      ("f4", b"\x00" + struct.pack(">i", 0) + b"\x01"),
                      ("p", helpers["write_c0635f_int"](page)),
                      ("a1", helpers["write_c0635f_string"](token))]
            plain = struct.pack(">i", 365703) + b"\x00" + struct.pack(">ii", 0, len(fields))
            for name, value in fields:
                plain += helpers["write_nullable_string"](name) + value
            data, result = request("/api/game_list", helpers["encrypt_apk_payload"](plain))
            games = helpers["parse_c1260f_array"](result["s2"])
            (output / f"list_{page:05d}.bin").write_bytes(data)
            report["pages"] += 1
            if not games:
                report["complete"] = not report["errors"]
                break
            new_games = [g for g in games if g["id"] not in seen]
            report['duplicates'] += len(games) - len(new_games)
            if not new_games:
                raise ValueError("列表重复，已停止，不能确认分页完整")
            for game in new_games:
                game_id = game["id"]
                seen.add(game_id)
                if game["status"] != 2:
                    report['skipped_not_closed'] += 1
                    continue
                time.sleep(0.5)
                try:
                    body, details = request("/api/game_get", helpers["encode_game_get_request"](game_id, token))
                    if not isinstance(details.get("g"), bytes):
                        raise ValueError("回放响应缺少 g 字段")
                except Exception as error:
                    report['errors'].append({'id': game_id, 'type': type(error).__name__})
                    save_report()
                    continue
                filename = "game_get_" + hashlib.sha256(game_id.encode()).hexdigest()[:24] + ".bin"
                (output / filename).write_bytes(body)
                report["downloads"].append({"id": game_id, "file": filename,
                    "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body)})
                save_report()
            print("PAGE", page, "DOWNLOADED", len(report["downloads"]), flush=True)
            page += 1
            time.sleep(0.5)
    except Exception as error:
        # 仅记录异常类型和受控错误信息，不输出令牌或请求正文。
        reason = error.reason if isinstance(error, urllib.error.URLError) else error
        message = type(reason).__name__
        if isinstance(reason, ssl.SSLCertVerificationError):
            message += ": " + reason.verify_message
        elif isinstance(reason, ValueError):
            message += ": " + str(reason)
        report["errors"].append(message)
        print("STOPPED", message, flush=True)
    finally:
        save_report()
        print("REPORT", output / "download_report.json", flush=True)
        print("DOWNLOADED", len(report["downloads"]), "COMPLETE", report["complete"], flush=True)


if __name__ == "__main__":
    main()
