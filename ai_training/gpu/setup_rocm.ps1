# 在项目独立环境安装AMD官方固定版本，不覆盖现有CPU环境。
param([string]$Python = 'C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe')
$ErrorActionPreference = 'Stop'
$TrainingRoot = Split-Path $PSScriptRoot -Parent
$EnvironmentPath = Join-Path $TrainingRoot '.venv-rocm'
if (-not (Test-Path -LiteralPath $EnvironmentPath)) {
    & $Python -m venv $EnvironmentPath
    if ($LASTEXITCODE -ne 0) { throw '创建虚拟环境失败' }
}
$GpuPython = Join-Path $EnvironmentPath 'Scripts/python.exe'
$WheelRoot = 'https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1'
& $GpuPython -m pip install --no-cache-dir `
    "$WheelRoot/rocm_sdk_core-7.2.1-py3-none-win_amd64.whl" `
    "$WheelRoot/rocm_sdk_devel-7.2.1-py3-none-win_amd64.whl" `
    "$WheelRoot/rocm_sdk_libraries_custom-7.2.1-py3-none-win_amd64.whl" `
    "$WheelRoot/rocm-7.2.1.tar.gz" `
    "$WheelRoot/torch-2.9.1%2Brocm7.2.1-cp312-cp312-win_amd64.whl" numpy
if ($LASTEXITCODE -ne 0) { throw '安装ROCm依赖失败' }
& $GpuPython -c "import torch; print(torch.__version__); print([(i, torch.cuda.get_device_name(i)) for i in range(torch.cuda.device_count())]); assert torch.cuda.is_available(), 'GPU不可用'"
if ($LASTEXITCODE -ne 0) { throw 'GPU设备探测失败' }
