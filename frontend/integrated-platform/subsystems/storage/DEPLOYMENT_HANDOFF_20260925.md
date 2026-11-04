# 隔离引擎部署交接（2026-09-25）

## 已准备

- `scalaafa/dashboard:v21-isolated-engines` 已在服务器本地 Docker 构建，containerd 导入包为 `/tmp/dashboard-v21-isolated-engines.tar`。`ctr images import` 不接受 gzip 包，因此保留了未压缩 tar。
- runner 源码已更新到 `/data/xhf/scalaafa-platform/runner/runner_service_safe.py`；AFA、RAID5F、mdraid 隔离脚本已放入 runner 目录。
- 8091 FEMU guest 已收到 `bench_afa_isolated.sh`。ScalaAFA 与 dPP 使用五个独立 FEMU 虚拟 NVMe，RAID5F 使用同组虚拟 NVMe；不会打开生产 PV。
- 8093 kernel guest 已启动，独立磁盘位于 `/data/xhf/scalaafa-persist/devices-mdraid-isolated-20260925/`，序列号为 `MDISO0` 至 `MDISO3`，每盘 8 GiB。宿主 backing 文件在 `/dev/sda2`，与生产 PV `/dev/nvme4n1` 分离。
- mdraid runner 只会匹配以上四个序列号，检查盘未挂载后才创建临时 RAID5；结束时停止阵列并清除这四块隔离盘上的 md superblock。
- 未运行 fio、mdadm create 或任何 CaaS benchmark。

## 尚待管理员执行

## Vue 前端更新

- Vue 3 + TypeScript 源码位于 `apps/system-3/src/`，本次更新提交为 `7d65226`。
- `BenchmarkView.vue` 继续调用现有 Python `/api/health`、`/api/engines`、`/api/run` 和 `/ws`，并按后端引擎能力限制块大小；没有复制或改写 Python benchmark 逻辑。
- 已构建 UI 镜像 `scalaafa/dashboard-ui:v5-vue-api`，containerd 导入包为 `/tmp/dashboard-ui-v5-vue-api.tar`。导入后把 `dashboard-ui` Deployment 镜像更新为该 tag 即可。

当前 SSH 已通，但 `sudo -n` 返回 `a password is required`。以下命令会导入镜像、更新 runner 引擎白名单并滚动 dashboard。PowerShell 会通过 `ssh -tt` 显示 sudo 密码提示；密码只在终端输入，不要粘贴到聊天。

```powershell
ssh -tt xhf@10.166.33.158 "sudo ctr -n k8s.io images import /tmp/dashboard-v21-isolated-engines.tar && sudo install -D -m 0644 /tmp/benchmark-gate-v21.conf /etc/systemd/system/scalaafa-safe-web-runner.service.d/benchmark-gate.conf && sudo systemctl daemon-reload && sudo systemctl restart scalaafa-safe-web-runner.service && kubectl -n scalaafa-platform set env deployment/dashboard-caas BENCH_ENABLE_RUN=1 BENCH_ENABLED_ENGINES=scalaafa,raid5f,dpp,mdraid && kubectl -n scalaafa-platform set image deployment/dashboard-caas dashboard=scalaafa/dashboard:v21-isolated-engines && kubectl -n scalaafa-platform rollout status deployment/dashboard-caas --timeout=180s && curl --fail --silent --unix-socket /data/xhf/scalaafa-platform/runner/runner-v2.sock http://localhost/health"
```

完成后可只读核对：

```powershell
ssh xhf@10.166.33.158 "curl --fail --silent --unix-socket /data/xhf/scalaafa-platform/runner/runner-v2.sock http://localhost/health; curl --fail --silent http://127.0.0.1:30083/system-3/api/engines"
```

Vue UI 更新命令：

```powershell
ssh -tt xhf@10.166.33.158 "sudo ctr -n k8s.io images import /tmp/dashboard-ui-v5-vue-api.tar && kubectl -n scalaafa-platform set image deployment/dashboard-ui ui=scalaafa/dashboard-ui:v5-vue-api && kubectl -n scalaafa-platform rollout status deployment/dashboard-ui --timeout=180s"
```

网页地址：`http://10.166.33.158:30083/system-3/`
