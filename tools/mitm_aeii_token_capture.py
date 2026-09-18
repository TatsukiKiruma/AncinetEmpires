"""仅在本机接收一次游戏令牌，不向上游转发请求。"""

import ast
import json
from datetime import datetime, timezone
from pathlib import Path

from mitmproxy import ctx, http


ROOT = Path(__file__).resolve().parent.parent
HOSTS = {"ae-multiplayer-na.toyknight.net", "aer.augix.me"}


def load_helpers():
    # 复用协议解析函数，但不初始化原插件，避免启动批量下载或创建回放目录。
    source = ROOT / "tools" / "mitm_aeii_replay_dump.py"
    tree = ast.parse(source.read_text(encoding="utf-8"))
    tree.body = [node for node in tree.body if not (
        isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == "addons" for target in node.targets)
    )]
    namespace = {}
    exec(compile(tree, str(source), "exec"), namespace)
    return namespace


class TokenCapture:
    def __init__(self):
        self.helpers = load_helpers()
        self.captured = False

    def http_connect(self, flow: http.HTTPFlow):
        # 临时代理不接收其他站点的 HTTPS 流量。
        if flow.request.host.lower() not in HOSTS:
            flow.response = http.Response.make(403, b"Game capture only")

    def request(self, flow: http.HTTPFlow):
        if flow.request.host == "192.168.31.195" and flow.request.path == "/":
            ctx.log.info("AEII_PHONE_CONNECTIVITY_OK")
            flow.response = http.Response.make(
                200, "电脑临时代理连接成功。请返回聊天告知测试结果。".encode("utf-8"),
                {"Content-Type": "text/plain; charset=utf-8"},
            )
            return
        # 所有请求都由本地终止，包括成功提取令牌后的请求。
        flow.response = http.Response.make(503, b"Local capture; no upstream request")
        if self.captured or flow.request.host.lower() not in HOSTS:
            return
        if flow.request.path.split("?", 1)[0] != "/api/game_list":
            return
        try:
            body = self.helpers["decrypt_apk_payload"](flow.request.content or b"")
            token = self.helpers["parse_c1270o"](body).get("a1")
            if not isinstance(token, str) or not token.strip():
                ctx.log.warn("AEII_TOKEN_MISSING")
                return
            # 此文件被现有 .env* 规则排除，不打印令牌，也不保存完整流量。
            destination = ROOT / ".env.aeii-session.json"
            destination.write_text(json.dumps({
                "host": flow.request.host.lower(),
                "token": token,
                "captured_at": datetime.now(timezone.utc).isoformat(),
            }), encoding="utf-8")
            self.captured = True
            ctx.log.info("AEII_TOKEN_CAPTURED")
        except Exception:
            # 解析异常不输出请求内容。
            ctx.log.warn("AEII_TOKEN_PARSE_FAILED")


addons = [TokenCapture()]
