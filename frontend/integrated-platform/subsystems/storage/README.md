# 总平台子系统 3：ScalaAFA 基准看板与 CaaS 整合对比

当前目录同时维护独立引擎诊断和 CaaS 整合系统对比两个业务域。生产页面通过单独的 UI 代理访问现有 `dashboard-caas`；本地 FastAPI 仅用于安全预览和合成测试。

- `apps/system-3`：Vue 3 + TypeScript 前端，构建前缀 `/system-3/`。
- `apps/system-3/src/api/server`：旧 SSH/FEMU FastAPI 原型，仅用于本地预览与测试，不能作为生产 `dashboard-caas` 部署。
- `packages/config/system_config.ts`：总平台共享变量入口，目前只放会议确认的 `ENGINE_TARGET`。
- `apps/system-3/deploy`：独立 UI 代理部署文件、候选 dashboard-caas v19 源码与交给 portal 负责人合并的 nginx 片段。

system-3 内部路由为 `/system-3/comparison` 和 `/system-3/benchmark`。压测按钮只有在后端健康接口明确返回布尔 `run_enabled: true` 时才启用；当前生产默认关闭。正式 CaaS 作业 `compare-cebc4a277d4b43baa8721fc54b6865c8` 已完成，不要重复提交。

## 本地联调

服务器 30082 的只读接入已单独实现：参见 [远端只读接入说明](远端只读接入说明.md)。使用 8001/5174，不修改下面的 8000/5173 本地预览入口。

在两个 PowerShell 终端中分别启动后端和前端（已安装本项目独立依赖）：

```powershell
Set-Location 'C:\Users\86138\Desktop\论文\xiangmu\research-platform'
.\scripts\start-api.ps1
```

另一个终端：

```powershell
Set-Location 'C:\Users\86138\Desktop\论文\xiangmu\research-platform'
.\scripts\start-ui.ps1
```

打开 <http://127.0.0.1:5173/system-3/>。两个启动脚本在前台运行，分别按 Ctrl+C 停止。端口被占用时启动失败，不会自动切换端口或关闭其他进程。

前端请求 `/system-3/api`、`/system-3/ws`，Vite 去掉模块前缀后转到本机 8000。部署时 nginx 使用相同约定。Python 接口本身仍为 `/api/*` 和 `/ws`。

`start-api.ps1` 强制 `BENCH_ENABLE_RUN=0`，禁用真实压测；界面显示“安全预览”。`/api/health` 只说明 API 活着，不表示 SSH、SPDK 或 FEMU 已连通。默认不填充模拟结果，空白数据区是正常现象。

前端共享地址由 `packages/config/system_config.ts` 导出；Python 通过部署环境变量配置，二者不会自动同步。不要直接把宿主机 `xhf:22` 和实验虚拟机 `femu:8090` 当成同一套连接信息。真实运行前必须确认 bench.sh 所在机器、转发方式、身份文件和设备范围。

## 复测

在项目根目录执行统一验证脚本：

```powershell
.\scripts\verify.ps1
```

该脚本依次运行 system-3 类型检查与生产构建、前端 domain/验收测试，以及 Python 单元测试。测试使用合成 fio 文本和模拟执行函数，不运行 SSH 或提交真实压测。浏览器视觉核验和服务器只读契约核验仍需单独执行。

## 接入总平台

向总平台负责人提供 `apps/system-3/dist`、`deploy/nginx-system-3.conf` 和菜单路由 `/system-3/`。模块内部由 Vue Router 提供 `/system-3/comparison` 和 `/system-3/benchmark` 两个页面；静态服务器对这两个地址回退到 `index.html`。部署路径仍以现有 `/system-3/` 为准，portal 菜单接入由总平台负责人合并。

部署模板不是可直接上线的成品：镜像仓库、SSH 客户端/凭据/known_hosts 挂载、结果持久化、鉴权和资源限制仍需补齐。API 部署在 K8s 上不要求 `BENCH_DRIVER=k8s`；若仍远程调用 bench.sh，应继续使用 SSH 驱动。K8s 原生执行驱动只是占位，尚不可用。
