# 云边端协同的内生智能决策系统 · 整合前端

本项目提供科研成果首页，以及故障诊断、智能调度、模型推理、存算分离四个子系统的统一访问入口。首页和四个子系统分别维护源码与构建产物，各子系统可以独立修改、构建和发布。

## 项目结构

```text
integrated-platform/
├── src/home/                     首页组件、样式和系统入口
├── src/main.ts                   首页应用入口
├── subsystems/
│   ├── oms/                      故障诊断 Vue 项目
│   ├── scheduler/                智能调度 pnpm 工作区
│   │   ├── apps/scheduler-display/
│   │   └── packages/             共享配置和样式
│   ├── inference/                模型推理 Vue 项目
│   └── storage/                  存算分离 pnpm 工作区
│       ├── apps/system-3/
│       └── packages/
├── public/
│   ├── oms/                      故障诊断网页产物
│   ├── scheduler/                智能调度网页产物
│   ├── inference/                模型推理网页产物
│   ├── system-3/                 存算分离网页产物
│   ├── portal-shell.js           公共侧栏、主题及系统标识交互
│   └── portal-shell.css          公共外框样式
├── scripts/prepare-portal-shell.mjs
├── docs/                         整合记录
├── vite.config.ts                本地页面入口和接口代理
└── package.json                  首页依赖及运行命令
```

`subsystems/` 用于开发，`public/` 保存整合站点实际使用的子系统页面。子系统源码更新后，需要重新构建并同步对应的 `public/` 目录。本仓库保留这些页面产物，首次查看已有页面时只需安装首页项目的依赖。

## 环境与首次启动

使用满足项目依赖要求的 Node.js。首页 Vite 8 要求 Node.js 20.19+ 或 22.12+，调度项目使用 pnpm 11.19.0，建议团队统一 Node.js 24 环境。npm 项目使用各自的 package-lock.json，pnpm 工作区使用各自的 pnpm-lock.yaml。

以下命令适用于 Windows PowerShell。先进入团队仓库中的 `frontend/integrated-platform`，后续命令以该目录为起点。每条命令完成后再执行下一条。

```powershell
npm.cmd ci
npm.cmd run dev -- --port 5181
```

打开 `http://127.0.0.1:5181/platform`。终端需持续运行，使用 Ctrl+C 停止。只查看已有前端页面时，一次启动整合站点即可。

| 页面 | 整合站点路径 |
| --- | --- |
| 首页 | /platform |
| 故障诊断 | /oms/ |
| 智能调度 | /scheduler/ |
| 模型推理 | /inference/ |
| 存算分离 | /system-3/ |

故障诊断在自己的应用内部使用 Vue Router，各系统之间通过 href 跳转。各系统侧栏提供返回首页入口。主题偏好使用 localStorage 的 snowapi-portal-theme 保存。

## 独立更新子系统

以下命令均从整合项目根目录开始执行。只在对应构建命令成功退出后执行复制步骤。依赖未变化时可跳过安装步骤。pnpm 命令通过 npx.cmd 调用指定版本。

### 故障诊断

```powershell
npm.cmd --prefix subsystems/oms ci
npm.cmd --prefix subsystems/oms run build
Copy-Item "subsystems/oms/dist/*" "public/oms" -Recurse -Force
```

### 智能调度

```powershell
Push-Location subsystems/scheduler
npx.cmd --yes pnpm@11.19.0 install --frozen-lockfile
npx.cmd --yes pnpm@11.19.0 run build:scheduler:portal
Pop-Location
Copy-Item "subsystems/scheduler/apps/scheduler-display/dist-portal/*" "public/scheduler" -Recurse -Force
node scripts/prepare-portal-shell.mjs
```

构建同时生成的 dist-portal-config 为部署配置参考，网页产物位于 apps/scheduler-display/dist-portal。

### 模型推理

```powershell
npm.cmd --prefix subsystems/inference ci
npm.cmd --prefix subsystems/inference run build
Copy-Item "subsystems/inference/dist/*" "public/inference" -Recurse -Force
node scripts/prepare-portal-shell.mjs
```

当前 .env.production 中 VITE_API_BASE_URL=/inference/api 用于配置浏览器的接口路径。模型推理源码副本曾与服务器演示版本存在差异，更新时需由负责人确认对应版本。

### 存算分离

```powershell
Push-Location subsystems/storage
npx.cmd --yes pnpm@11.19.0 install --frozen-lockfile
npx.cmd --yes pnpm@11.19.0 --filter @research-platform/system-3 build
Pop-Location
Copy-Item "subsystems/storage/apps/system-3/dist/*" "public/system-3" -Recurse -Force
node scripts/prepare-portal-shell.mjs
```

存算分离需保留 apps 与 packages 工作区结构。首次使用此工作区的 pnpm 版本安装时，应检查锁文件兼容情况，安装失败时保留锁文件并排查错误。

调度、推理和存算分离复制后执行公共外框脚本，以恢复统一侧栏与主题引用。复制流程可能保留旧的带哈希资源文件，发布时宜使用独立版本目录并整体切换。每次更新后检查系统入口、子页面刷新、主题切换、返回首页和数据请求。

## 整合站点构建

```powershell
npm.cmd run typecheck
npm.cmd run build
```

输出为根目录 dist/，包含首页和 public/ 中已有的子系统产物。此命令构建首页并汇总当前页面产物，各子系统的新源码需要按上一节单独构建和同步。

故障诊断原有前端测试可单独运行。

```powershell
npm.cmd --prefix subsystems/oms test
```

## 数据接口与运行条件

本地开发代理配置位于 vite.config.ts。当前配置指向校园内网服务器，接口需在具备相应网络访问条件的环境中联调。

| 本地请求路径 | 当前上游 |
| --- | --- |
| /api、/experiments/output | http://10.166.33.36:3000 |
| /scheduler/api/k8s | http://10.166.33.36:5173，转发时移除 /scheduler |
| /inference/api | http://10.166.33.36:8083，转发时移除 /inference |
| /system-3/api、/system-3/ws | 10.166.33.36:5174，保留路径并支持 WebSocket |

GitHub 提供代码交付。真实数据展示依赖上游服务持续运行。故障诊断 3000 服务曾需要负责人在服务器上手动启动，请与服务负责人确认运行状态。调度和推理健康接口可用，也需进一步确认具体业务接口和依赖状态。

页面可打开但没有数据时，查看 Vite 终端和浏览器网络请求，记录失败路径与错误码。ECONNREFUSED 表示目标连接被拒绝，ETIMEDOUT 表示连接超时，HTTP 500 需要进一步查看服务日志。

## 各组如何独立修改代码

| 负责范围 | 主要修改位置 |
| --- | --- |
| 首页 | src/home/ |
| 故障诊断 | subsystems/oms/src/ |
| 智能调度 | subsystems/scheduler/apps/scheduler-display/src/ |
| 模型推理 | subsystems/inference/src/ |
| 存算分离 | subsystems/storage/apps/system-3/src/ |

子系统内的 packages/ 目录包含工作区依赖，调整共享配置或样式时需同步检查引用它的应用。public/ 下的 JavaScript 和 CSS 是生成的页面文件，功能开发从上表源码目录开始，之后使用“独立更新子系统”中的命令生成网页产物。

下面以故障诊断修改事件列表为例。Git 命令从团队仓库根目录执行，也就是包含 frontend/ 的目录。示例以修改前工作区干净、目标分支已合并整合项目为前提。首次整合 PR 尚未合并时，由团队明确共同使用的起点分支。

1. 获取团队主分支最新代码并创建本次修改分支。

```powershell
git switch master
git pull --ff-only origin master
git switch -c fix/oms-event-list
```

2. 编辑 frontend/integrated-platform/subsystems/oms/src/ 中对应的页面或组件。进入整合项目目录，按本文故障诊断更新步骤安装依赖、测试、构建并复制产物。

```powershell
Set-Location frontend/integrated-platform
npm.cmd --prefix subsystems/oms test
```

3. 从整合首页进入故障诊断，验证改动、刷新和返回入口。每个系统使用自己的构建命令，数据功能联调需满足本文的网络及服务条件。

4. 回到团队仓库根目录，仅暂存本次涉及的源码和网页产物，再查看提交内容。

```powershell
Set-Location ../..
git status --short
git add frontend/integrated-platform/subsystems/oms frontend/integrated-platform/public/oms
git diff --cached --stat
git diff --cached
```

5. 确认清单和差异后提交、推送本次分支，再在 GitHub 创建 Pull Request，请负责人审阅。

```powershell
git commit -m "fix(oms): update event list"
git push -u origin fix/oms-event-list
```

其他组使用同样流程，将分支名、源码目录、构建命令和 public/ 目录替换为对应系统。修改公共外框时将相关文件一同提交并说明影响范围。PR 合并后，按团队发布流程更新对应页面目录，GitHub 上的提交本身不会自动替换服务器网页。

## 服务器发布与团队协作

服务器发布方案待团队确认。正式发布需配置静态页面托管、各应用的路由回退、接口反向代理及流式连接。开发代理仅在本地 Vite 开发服务中生效，生产发布需单独配置同等代理规则。故障诊断页面路由回退到 /oms/index.html，存算分离页面路由回退到 /system-3/index.html，API 请求应优先匹配代理规则。

独立发布时可分别替换各子系统的网页目录，首页使用固定入口路径。后续自动更新需要配套构建和发布流程。

各组从团队默认分支创建功能分支，主要修改对应的 subsystems/ 目录。提交时包含必要源码、配置、锁文件以及当前工作流需要同步的 public/ 页面产物，通过 Pull Request 审阅合并。修改公共外框或接口路径时需与整合维护者协商。

node_modules、各级 dist、日志和缓存通过 .gitignore 排除。公开提交前检查配置文件及提交清单，密码、令牌和私钥通过运行环境管理。
