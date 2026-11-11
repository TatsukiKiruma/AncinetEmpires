"""借助本次独占的原生辅助进程执行 libc rename，不允许 mv 的复制回退。"""

from contextlib import AbstractContextManager
import json
from pathlib import Path

SOURCE = r"""
const renameCall = new SystemFunction(Module.getGlobalExportByName('rename'), 'int', ['pointer','pointer']);
const accessCall = new SystemFunction(Module.getGlobalExportByName('access'), 'int', ['pointer','int']);
rpc.exports = {
 rename: function(source,target) {
  const src=Memory.allocUtf8String(source),dst=Memory.allocUtf8String(target);
  const exists=accessCall(dst,0);
  if(exists.value===0) return {result:-1,errno:17,reason:'目标已存在'};
  if(exists.errno!==2) return {result:-1,errno:exists.errno,reason:'目标存在性无法确认'};
  const result=renameCall(src,dst);
  return {result:result.value,errno:result.errno,sourceGone:accessCall(src,0).value!==0,targetExists:accessCall(dst,0).value===0};
 }
};
"""


class AtomicDeviceFs(AbstractContextManager):
    def __init__(self, adb_call, directory: Path):
        self.adb = adb_call
        self.directory = directory
        self.session = self.script = self.device = None
        self.pid = self.port = None

    def __enter__(self):
        import frida
        self.port = self.adb("forward", "tcp:0", "tcp:27042").strip()
        if not self.port.isdigit():
            raise RuntimeError("原子重命名辅助服务端口无效")
        self.device = frida.get_device_manager().add_remote_device("127.0.0.1:" + self.port)
        self.pid = self.device.spawn(["/system/bin/sleep", "1200"])
        self.session = self.device.attach(self.pid)
        self.script = self.session.create_script(SOURCE, name="只执行libc原子重命名")
        self.script.load()
        self.device.resume(self.pid)
        (self.directory / "atomic-helper.json").write_text(json.dumps({"pid": self.pid,
            "command": ["/system/bin/sleep", "1200"], "scope": "libc-rename-only", "copyFallback": False}), encoding="utf-8")
        return self

    def rename(self, source: str, target: str):
        parents = ("/data/user/0", "/data/user_de/0")
        package = "net.toyknight.aeii.android"
        if source.rsplit("/", 1)[0] != target.rsplit("/", 1)[0] or source.rsplit("/", 1)[0] not in parents:
            raise ValueError("仅允许同一用户数据父目录内的原子重命名")
        for path in (source, target):
            name = path.rsplit("/", 1)[1]
            if name != package and not (name.startswith("." + package + ".aeii-") or name.startswith(".aeii-atomic-probe-")):
                raise ValueError("原子重命名路径不属于本次游戏或隔离探针")
        result = self.script.exports_sync.rename(source, target)
        with (self.directory / "atomic-renames.jsonl").open("a", encoding="utf-8") as output:
            output.write(json.dumps({"source": source, "target": target, **result}, ensure_ascii=False) + "\n")
        if result.get("result") != 0 or not result.get("sourceGone") or not result.get("targetExists"):
            raise RuntimeError("原子重命名失败，禁止回退复制：" + json.dumps(result, ensure_ascii=False))
        return result

    def __exit__(self, *details):
        try:
            if self.pid is not None:
                # 此进程由本对象spawn且仍由Frida会话持有，只终止本次辅助进程。
                self.device.kill(self.pid)
        finally:
            if self.session is not None:
                try:
                    self.session.detach()
                except Exception:
                    pass
            if self.port is not None:
                self.adb("forward", "--remove", "tcp:" + self.port)
        return False
