# 服务器下游 Runner 只读诊断

目标：定位 30082 容器配置的 caas-compare-runner:8080 为什么 Connection refused。以下命令只读取资源、日志和网络状态，不提交任务、不重启、不扩缩容、不改挂载。

## 1. Kubernetes 资源

在 xhf@10.166.33.158 执行：

```bash
kubectl get svc -A -o wide | grep -E 'caas|compare|runner|dashboard|scalaafa'
kubectl get endpoints -A -o wide | grep -E 'caas|compare|runner'
kubectl get endpointslice -A -o wide | grep -E 'caas|compare|runner'
kubectl get pods -A -o wide | grep -E 'caas|compare|runner|dashboard|scalaafa'
kubectl get deploy,sts -A -o wide | grep -E 'caas|compare|runner|dashboard|scalaafa'
```

重点记录：Service 名称、namespace、ClusterIP、端口/targetPort、Endpoint 地址、Pod 状态和 Pod IP。

## 2. 服务详情与事件

把上一步的 namespace 和 service 名替换进去：

```bash
kubectl -n <namespace> describe svc caas-compare-runner
kubectl -n <namespace> get endpoints caas-compare-runner -o yaml
kubectl -n <namespace> describe pod <runner-pod>
kubectl -n <namespace> get events --sort-by=.lastTimestamp | tail -50
```

如果 Service 没有 Endpoint，优先检查 selector 与 Pod labels 是否匹配，以及 Pod 是否 Ready。

## 3. Runner 容器监听状态

```bash
kubectl -n <namespace> exec <runner-pod> -- sh -c 'id; hostname; (ss -ltn || netstat -ltn) 2>/dev/null || true; env | sort | grep -E "PORT|HOST|RUNNER|RESULT" || true'
kubectl -n <namespace> logs <runner-pod> --all-containers --tail=200
```

禁止在这里调用 /run、/compare、/dpp。

## 4. 从 30082 容器视角检查 DNS/连接

先找 30082 对应的 dashboard Pod，再执行：

```bash
kubectl -n <dashboard-namespace> exec <dashboard-pod> -- sh -c 'getent hosts caas-compare-runner || nslookup caas-compare-runner || true'
kubectl -n <dashboard-namespace> exec <dashboard-pod> -- sh -c 'python - <<"PY"
import socket
try:
 print(socket.getaddrinfo("caas-compare-runner",8080)); s=socket.create_connection(("caas-compare-runner",8080),timeout=3); print("TCP_OPEN"); s.close()
except Exception as e: print(type(e).__name__,e)
PY'
```

结果解释：DNS 失败表示 Service/namespace 名称错误；DNS 成功但 TCP refused 表示 target Pod 没监听或 targetPort 错；timeout 表示网络策略或不可达；TCP open 后再只读检查 Runner /health。

## 5. 对照 30082 配置

```bash
kubectl -n <dashboard-namespace> get deploy <dashboard-deploy> -o yaml | grep -n -A3 -B3 -E 'caas-compare-runner|CAAS_RUNNER|8080'
```

确认 CAAS_RUNNER_URL 是否应为同 namespace 服务名，或跨 namespace 的完整 svc 地址。不要直接改成宿主机 IP，也不要用 30082 自己回环代替 Runner。

## 当前已知结果（2026-09-20）

- 30082/api/health 正常；caas_runner_url 是 http://caas-compare-runner:8080。
- 30082/api/caas/health 返回 Connection refused。
- 没有调用 POST 接口，没有启动 CaaS Job。
- 本地 Vue 只读适配页会持续显示错误，不会自动重试写操作。

## 修复前门槛

完成诊断后，只有确认 Runner Pod、Service、端口和命名空间，才能决定是否修复部署。修复后先只读验证 /api/caas/health，返回健康且存储门通过，再讨论低风险 smoke 测试。