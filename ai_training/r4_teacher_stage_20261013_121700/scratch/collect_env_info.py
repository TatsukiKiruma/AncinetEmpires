import os
import sys
import json
import platform
import subprocess
import psutil

def get_sys_info():
    info = {
        "platform": platform.platform(),
        "processor": platform.processor(),
        "cpu_count_logical": os.cpu_count(),
        "memory_total_gb": round(psutil.virtual_memory().total / (1024**3), 2),
        "python_version": sys.version,
    }

    # Node & npm version
    try:
        node_v = subprocess.check_output(["node", "--version"], text=True).strip()
        info["node_version"] = node_v
    except Exception as e:
        info["node_version"] = str(e)

    try:
        npm_v = subprocess.check_output(["npm", "--version"], text=True).strip()
        info["npm_version"] = npm_v
    except Exception as e:
        info["npm_version"] = str(e)

    # PyTorch and GPU
    try:
        import torch
        info["torch_version"] = torch.__version__
        info["cuda_available"] = torch.cuda.is_available()
        if torch.cuda.is_available():
            info["cuda_device_name"] = torch.cuda.get_device_name(0)
            info["cuda_device_count"] = torch.cuda.device_count()
        else:
            info["cuda_device_name"] = None
    except ImportError:
        info["torch_version"] = "not_installed"
        info["cuda_available"] = False
        info["cuda_device_name"] = None

    return info

if __name__ == "__main__":
    out_dir = r"C:\code\AncinetEmpires\ai_training\r4_teacher_stage_20261013_121700\artifacts"
    os.makedirs(out_dir, exist_ok=True)
    info = get_sys_info()
    out_file = os.path.join(out_dir, "environment.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(info, f, indent=2, ensure_ascii=False)
    print("Environment info collected:", json.dumps(info, indent=2))
