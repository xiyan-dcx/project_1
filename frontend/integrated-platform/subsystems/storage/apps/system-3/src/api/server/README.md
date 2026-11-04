# System 3 FastAPI 后端

本目录从原 `dashboard完善版本_三个测试数据.py` 拆出接口和 fio 输出解析。默认通过 SSH 调用远端 `/home/femu/bench.sh`。

```powershell
$env:BENCH_ENABLE_RUN='0'
$env:BENCH_DRIVER='ssh'
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

上面的命令需要已安装依赖的 Python 环境；建议直接使用项目根目录 `scripts/start-api.ps1`，它会选择本项目 .venv 并把结果目录设在项目 .local 下。

关键环境变量：`ENGINE_TARGET`、`VM_HOST`（优先于 ENGINE_TARGET）、`VM_USER`、`VM_PORT`、`RESULTS_DIR`、`BENCH_DRIVER`、`BENCH_ENABLE_RUN`。默认禁用真实压测，只有明确配置 BENCH_ENABLE_RUN=1 才允许请求进入执行驱动；这不是鉴权机制。

API 部署到 K8s 与执行驱动选择是两回事：容器里仍可通过 SSH 调用实验环境。不要因为上 K8s 就改成 BENCH_DRIVER=k8s，当前该驱动只是不可用的占位实现。不要将宿主机 xhf:22 与 FEMU femu:8090 的参数混用；连接拓扑尚待现场验证。
