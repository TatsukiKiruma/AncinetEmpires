import os
import sys
import json
import time
import subprocess
from datetime import datetime

STAGE_DIR = r"C:\code\AncinetEmpires\ai_training\r4_teacher_stage_20261013_121700"
COMMANDS_JSONL = os.path.join(STAGE_DIR, "commands.jsonl")
LOGS_DIR = os.path.join(STAGE_DIR, "artifacts", "logs")
os.makedirs(LOGS_DIR, exist_ok=True)

def run_logged_command(cmd, cwd=None, log_name=None):
    if cwd is None:
        cwd = STAGE_DIR
    if log_name is None:
        log_name = f"cmd_{int(time.time()*1000)}"

    start_iso = datetime.now().isoformat()
    start_t = time.time()
    
    # Run command
    # Windows shell=True for npm / npx
    p = subprocess.Popen(
        cmd,
        shell=True,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace"
    )
    stdout, stderr = p.communicate()
    end_t = time.time()
    end_iso = datetime.now().isoformat()
    duration = end_t - start_t
    exit_code = p.returncode

    # Save log files
    log_base = os.path.join(LOGS_DIR, log_name)
    with open(f"{log_base}.stdout.log", "w", encoding="utf-8") as f:
        f.write(stdout)
    with open(f"{log_base}.stderr.log", "w", encoding="utf-8") as f:
        f.write(stderr)

    record = {
        "command": cmd,
        "cwd": cwd,
        "start_time": start_iso,
        "end_time": end_iso,
        "duration_seconds": round(duration, 3),
        "exit_code": exit_code,
        "log_name": log_name,
        "stdout_snippet": stdout[:500] if stdout else "",
        "stderr_snippet": stderr[:500] if stderr else ""
    }

    with open(COMMANDS_JSONL, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f"[{exit_code}] {cmd} ({duration:.2f}s)")
    if exit_code != 0:
        safe_stderr = stderr[:400].encode(sys.stdout.encoding or 'utf-8', errors='replace').decode(sys.stdout.encoding or 'utf-8')
        print("STDERR SNIPPET:", safe_stderr)
    return record

if __name__ == "__main__":
    if len(sys.argv) > 1:
        cmd_str = " ".join(sys.argv[1:])
        run_logged_command(cmd_str)
