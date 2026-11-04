# Vue3 看板部署进度交接（2026-09-21）

## 接续工作位置

- 服务器：`10.166.33.158`，用户 `xhf`；密码由用户另行提供，不写入文档。
- 服务器唯一开发/部署工作目录：`/data/xhf/research-platform-dev-20260921/research-platform`。不要继续在 `/home/xhf` 工作；此前复制的 `/home/xhf/research-platform-dev-20260921` 仅为旧副本。
- 当前 Codex 本地工作副本：`C:\Users\XZL\Documents\ChatGPT\kubernetes的存算应用层优化复现\research-platform-vue`。
- 组员原始源码：`C:\zym\项目\research-platform-dev-20260921\research-platform`，未被改动。

## 已完成

1. 从组员 Vue3 项目增加了独立的 `CaaSComparison.vue` 整合系统页面，保留原三引擎模块为“独立诊断”。
2. 增加 `/api/caas/health`、`POST /api/caas/run`、`GET /api/caas/run/{job_id}` 客户端和类型。UI 可显示健康状态、正式/快速参数、任务状态、基线/优化指标及每项验收失败原因。
3. dPP、ScalaAFA、CaaS-LSM 各有证据说明；端到端性能提升没有错误归因给单个组件。
4. 本地 `vue-tsc --noEmit` 与 Vite 生产构建均通过。最新构建产物路径为 `apps/system-3/dist`。
5. 服务器部署了独立的 `Deployment/dashboard-ui`、`Service/dashboard-ui`，namespace 为 `scalaafa-platform`，NodePort `30083`，不修改旧 `dashboard-caas` 30082。
6. 当前 UI 镜像 `scalaafa/dashboard-ui:v3` 已导入 master 节点 containerd，Pod Ready。v3 增加对比条形图、逐轮详情和结果分享链接。由于服务器 Docker Hub TLS 超时，镜像以已缓存的 `scalaafa/dashboard:v18-backend-detect` 为基础，运行独立的 `ui_server.py`（只负责静态文件和代理，不运行旧压测后端）。
7. v3 滚动更新成功；已验证 `http://127.0.0.1:30083/system-3/`、JS (`index-Dak1al2b.js`)、CSS (`index-CfzLxXun.css`) 均 HTTP 200；`/system-3/api/caas/health` 返回 `ok=true`、在线 dPP 通过；v2 验证时 WebSocket 首帧能收到 `state`。
8. v3 发布后旧 `dashboard-caas` Deployment 仍 1/1，`http://127.0.0.1:30082/api/caas/health` 为 `ok=true`、Runner idle，旧部署未被覆盖。现有正式任务经新入口 `GET /system-3/api/caas/run/{job_id}` 返回 `state=done`、验收 `passed=true`。

## 正式验证结果（不要重复提交）

通过新入口 `30083` 提交了一次正式 100k/1线程/1KiB/3轮对比：

```text
job_id=compare-cebc4a277d4b43baa8721fc54b6865c8
```

任务已完成，正式验收全部通过：`formal_run=true`、`throughput_improved=true`、`stable=true`、`remote_path_exercised=true`、`dpp_online_verified=true`、`passed=true`。**不要重复提交**。可查询现有任务：

```bash
curl -fsS http://127.0.0.1:30083/system-3/api/caas/run/compare-cebc4a277d4b43baa8721fc54b6865c8 | jq .
```

原始路径中位吞吐 3,811 ops/s，P99 68.975831 µs，CV 15.5565%；优化整合路径中位吞吐 11,950 ops/s，P99 32.192053 µs，CV 6.81058%，远程压缩 6 次。吞吐提高 213.56599%，P99 降低 53.32850%，写入时间降低 68.10854%。结果文件：`/data/xhf/caas-lsm/k8s-results/comparison-compare-cebc4a277d4b43baa8721fc54b6865c8.json`。旧 30082 健康检查仍为 `ok=true`、runner idle、dPP passed。

## 已知问题与处理

- v1 镜像曾因 Windows `scp` 把 `dist/assets` 目录设为 700，导致 JS/CSS 返回 401；v2 Dockerfile 以 root 执行 `chmod -R a+rX /app/dist` 后切回 UID 1017，已验证 JS/CSS 为 200。
- 新服务器外网无法稳定拉取 Nginx，也无法从 npm 官方仓库安装 pnpm。依赖在 Windows 本地使用捆绑 pnpm 安装与构建，上传的只有源码/`dist`/部署文件，没有 `node_modules`。
- Browser Use 工具多次获取页面状态超时（v3 发布后再次超时），尚未完成视觉截图核验；已通过 HTTP 静态资源、API 和 WebSocket 做功能通路检查。后续应由用户或可用浏览器复查实际布局和按钮状态。
- 服务器 `/data/xhf` 位于 `/dev/sda2`，可用约 107G；避免在 `/home/xhf` 写入。

## 关键文件

```text
apps/system-3/src/components/CaaSComparison.vue
apps/system-3/src/api/caas.ts
apps/system-3/src/types/caas.ts
apps/system-3/src/domain/caas.ts
apps/system-3/src/App.vue
apps/system-3/deploy/Dockerfile.ui
apps/system-3/deploy/ui_server.py
apps/system-3/deploy/k8s-dashboard-ui.yaml
```

## 不能做的事

- 不要替换/缩容/删除现有 `dashboard-caas`、`caas-compare-runner`、HDFS、CSA、ProCP、ScalaAFA/dPP 组件。
- 不要修改 `scheduler-demo/kubernetes-front`，那是旧 React 演示系统。
- 不要在 `/home/xhf` 继续开发。
- 不要把组员 `src/api/server/app.py` 部署成正式后端；那是旧 SSH/FEMU 原型。Vue 通过独立代理使用现有 `dashboard-caas:8000`。
- 不要把快速 20k 结果当作正式 dPP/ScalaAFA 性能结论。

## 下一步

1. 在可用浏览器打开现有任务的分享链接 `http://10.166.33.158:30083/system-3/?job=compare-cebc4a277d4b43baa8721fc54b6865c8`，视觉验收响应式布局、图表、按钮、验收逐项结果；当前自动浏览器工具持续超时，不能声称此项已完成。
2. 补充自动化契约测试，尤其是 `acceptance.stable=false` 与 `remote_path_exercised=false` 的 UI 解释。
3. 如需正式总平台入口，先与用户确认总平台路由；现阶段保留 30082/30083 并行，不切换旧入口。

回滚新 UI：`kubectl -n scalaafa-platform scale deployment/dashboard-ui --replicas=0`；旧 30082 不受影响。
