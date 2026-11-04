# system-3 执行进度（2026-09-23）

## 已完成

- 在服务器唯一工作目录建立 Git 仓库并提交导入基线：`5d2f2e4`。
- 前端拆为 Vue Router 两页：`/system-3/comparison` 与 `/system-3/benchmark`；分享链接 `?job=` 保留在 comparison 路由。
- 静态 UI 代理增加 Vue history fallback，缺失静态资源仍返回 404，并拒绝路径越界。
- 独立引擎列表改由 `GET /api/engines` 驱动，支持运行时新增 dPP；mdraid 显示禁用原因。
- 前端移除不存在的 `GET /api/state` 请求，健康接口缺少 `run_enabled: true` 时默认只读；删除死代码 `engineTarget`。
- 新增 dashboard-caas v19 候选源码：增加引擎清单接口、显式 `run_enabled` 健康字段与 `/api/run` 服务端门禁；默认关闭独立引擎压测，CaaS API 路径不变。
- v19 启动时只读回放 `/results` 中的规范 fio 日志，按引擎/配置合并重复记录并标注“历史归档、时长未知”。
- 浏览器验证两个深链与分享参数；531px 视口无横向溢出。用安全本地后端和合成日志验证动态引擎清单、历史样本和压测关闭状态。
- `scripts/verify.ps1` 当前通过：6 项 Node 测试、22 项 Python 测试与 Vue 类型检查/生产构建。

## 部署结果（2026-09-23）

部署已完成。服务器仓库提交：`0f33216 feat: split system-3 views and align production contracts`。已构建并导入镜像 `scalaafa/dashboard-ui:v4` 与 `scalaafa/dashboard:v19-backend-contract`，并完成两个 Deployment 的滚动更新。

验收检查：

- `dashboard-caas` 与 `dashboard-ui` 均为 `1/1 Ready`，分别运行 v19 与 v4 镜像；其他 CaaS、HDFS、CSA、ProCP、runner Deployment 保持 Ready。
- `/api/health` 返回 `ok=true`、`run_enabled=false`、`state=idle`、`samples=11`；`/api/engines` 返回 ScalaAFA、RAID5F、dPP 与禁用的 mdraid。
- UI 代理下的 health 与 engines 接口均可用；`/system-3/`、`/system-3/comparison?job=...`、`/system-3/benchmark` 均返回 HTTP 200。
- CaaS health 中 HDFS、ProCP、CSA、dPP 在线校验均 ready/passed，runner 为 idle；正式作业 `compare-cebc4a277d4b43baa8721fc54b6865c8` 仍为 done。
- 未调用 `/api/run`，未重新提交正式作业，未执行三引擎压测。

回滚命令：

```bash
kubectl -n scalaafa-platform rollout undo deployment/dashboard-caas
kubectl -n scalaafa-platform rollout undo deployment/dashboard-ui
```

## 暂停项

- 不运行三引擎实测；RAID5F 与在线 `afa0` 的 bdev 互斥仍未核实，后端默认关闭独立压测。
- 方案文档已补入 CaaS 业务域与生产 API 实况。portal 菜单前缀仍由总平台负责人最终确认；模块内部深链使用现有 `/system-3/`。
- 不重复提交正式任务 `compare-cebc4a277d4b43baa8721fc54b6865c8`。

## 设备与总平台复核（2026-09-23，只读）

- 活动 FEMU 是 8092，guest 中 `config_afa.json` 和 `config_raid5f.json` 都使用 `nvme0n1`–`nvme4n1`。在生产 8092 上切换配置或运行 RAID5F 不安全。
- 已启动隔离 FEMU guest 于 8091；宿主 QEMU 使用独立进程和新建 backing files `/data/xhf/scalaafa-persist/devices-mode2-raid5f-isolated-20260923/disk*.img`，metadata 也使用新文件。生产 guest 的 OS 镜像以 `snapshot=on` 挂载；SSH 仅转发到 `127.0.0.1:8091`。新 backing files 位于 `/dev/sda2`，与生产 PV `/dev/nvme4n1` 分离。
- 8091 guest 启动后只读检查确认无 SPDK target、无已挂载 NVMe namespace；已将 `bench_raid5f_isolated.sh` 放入该 guest。此脚本只连接独立 guest，并在运行前拒绝已有 SPDK target 或已挂载的 guest NVMe namespace。
- 独立 guest 的启动/停止脚本位于 `apps/system-3/deploy/dashboard-caas-v19/ops/`。停止只结束命名为 `FEMU-ScalaAFA-RAID5F-Isolated` 的 QEMU 进程，保留 disposable images；重新启动时会把隔离 runner 脚本复制回 OS snapshot。
- UUID 与卷身份复核：PVC `scalaafa-platform/caas-hdfs-data` 绑定 PV `caas-hdfs-data-scalaafa`；PV 的 `local.path` 是 `/data/xhf/caas-lsm/scalaafa-pv`，标签 `storage-backend=scalaafa`。DataNode Pod 中 `/state/datanode` 实际挂载 `/dev/nvme4n1`，宿主机该 PV 路径也由同一设备挂载，ext4 UUID 为 `79471491-003a-4558-bdaf-e614cbfd083d`。runner 原期望 UUID `8a298d8a-c3f9-44dd-aad0-87315d452f78` 已过期；仅修正 UUID 校验常量，未写卷数据。原 runner 源码另存为 `runner_service_safe.py.bak-uuid-20260923`。
- CaaS runner `/health` 中 dPP/HDFS 检查通过，与上面的安全基准 runner 是不同检查，不能证明三引擎隔离安全。
- Kubernetes 没有 Ingress 或 IngressClass；UI 当前只通过 `dashboard-ui` NodePort `30083` 暴露。接总平台仍需平台方确认入口域名/路径及网关配置位置，并转发 API 与 WebSocket。
- 尚未运行 fio/benchmark，未调用 runner `/run` 或 dashboard `/api/run`，也没有重启生产服务。安全 runner `/health` 仍因 UUID 不匹配而拒绝测试。

## UUID 修复与引擎门禁（2026-09-23）

- 生产 runner 源码已将 `EXPECTED_UUID` 更新为上述 PV 当前 UUID，并加入和 dashboard 相同的双门禁：必须同时设置 `BENCH_ENABLE_RUN=1` 与 `BENCH_ENABLED_ENGINES` 白名单；默认不开启任何引擎。
- `dashboard_v1.py` 同样按引擎构造 `/api/engines` 可运行清单；`/api/run` 与 `/api/health` 报告均由双门禁决定。`mdraid` 仍硬禁用。
- dashboard 新镜像 `scalaafa/dashboard:v20-engine-allowlist` 已在服务器 Docker 本地构建，并打包为 `/tmp/dashboard-v20-engine-allowlist.tar.gz`。生产 Pod 仍为 v19；需要有 sudo 权限导入 containerd 镜像、重启 runner 服务、设置显式关闭环境变量并滚动 dashboard Deployment 后，修复和门禁才会生效。
- dashboard v20 已成功导入并滚动上线，Deployment 为 `1/1 Ready`。隔离检查通过后，生产显式配置 `BENCH_ENABLE_RUN=1`、`BENCH_ENABLED_ENGINES=raid5f`，只开放隔离 RAID5F。只读 API 核对返回 `run_enabled=true`、`run_enabled_engines=[raid5f]`、`state=idle`、`samples=11`；ScalaAFA、dPP 未列入白名单，mdraid 仍硬禁用。
- runner 第一次重启后仍报 UUID 不匹配，排查发现 `xhf` 执行 `blkid` 得到空结果。runner 源码改用 `lsblk -nro UUID`（已确认无 sudo 可读到 PV 的正确 UUID），提交 `f2ea070` 并完成再次重启。
- runner `/health` 已返回 `ok=true`、source `/dev/nvme4n1`、`run_enabled=true`、`run_enabled_engines=[raid5f]`、`active_job=null`、`runner_state=idle`。UUID 校验通过；未启动 fio/benchmark，网页未提交作业。RAID5F 只接受 256k 块大小。
- 没有调用 runner `/run` 或 dashboard `/api/run`，没有运行 fio/benchmark，也没有提交任何 CaaS 作业。生产卷没有格式化、重建或写裸设备。
