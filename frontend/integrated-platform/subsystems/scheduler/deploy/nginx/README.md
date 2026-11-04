# nginx 接入说明

## 当前综合网页接入

接入入口为 `/scheduler/`，接口前缀为 `/scheduler/api/k8s/`，后端是
`http://10.166.33.36:5173/api/k8s/`。在 `research-platform/` 执行
`pnpm build:scheduler:portal`，得到 `apps/scheduler-display/dist-portal/` 和
`dist/portal-config/scheduler-display.conf`。配置片段加入综合网页现有 `server` 块。

构建和生成配置共同读取 `packages/config/portal_contract.json`。
源码和生成文件保留在 p3-2 的 `/home/p3-02/scheduler-display/source/`，
另一组可通过 SSH 直接使用，不必生成交付包。步骤见
[综合网页接入说明](../../../docs/portal-integration.md)。

下面保留的是旧的 master 引擎接入方式，使用 `/api/k8s/` 和 master 地址。
当前门户接入应使用上述门户构建生成的片段。

## 目录约定

```
http/engine.upstream.conf.example   示例；真正生效的文件由脚本生成，不入库
locations/scheduler-display.conf    门户 server 块里 include 的片段
```

## 步骤

1. 在仓库根目录执行 `pnpm nginx:upstream`，从 `packages/config/system_config.ts`
   生成 `http/engine.upstream.conf`。以后改 IP 只改配置源，再跑一次这条命令。
2. 把 `http/engine.upstream.conf` 放进 nginx 的 http 层（例如 `conf.d/`）。
3. 在门户的 server 块里 include `locations/scheduler-display.conf`。
4. 前端构建产物放到 `/var/www/scheduler-display/`（`pnpm build:scheduler` 的 `dist/`）。

引擎的 IP 只维护在 `packages/config/system_config.ts` 一处，nginx 这份是生成出来的。

## 为什么接口要走 nginx 而不是浏览器直连

浏览器只访问门户同域，有两个好处：门户是 https 时不会因为引擎是 http 被按混合内容拦掉；
也不需要给引擎单独开跨域。前端代码里用的是相对路径 `/api/k8s`，见 `packages/config`。
