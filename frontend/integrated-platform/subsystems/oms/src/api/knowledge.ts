// Plain-language explanations of the five root-cause categories for non-technical readers.
export interface RootCauseKnowledge {
  title: string
  plainDescription: string
  recommendedActions: string[]
}

const ROOT_CAUSE_KNOWLEDGE_BASE: Record<string, RootCauseKnowledge> = {
  host_shutdown_or_poweroff: {
    title: '主机关机或掉电',
    plainDescription: '服务器由于硬件电源中断、意外断电或系统关机导致离线，该节点承载的所有通信与服务中断。',
    recommendedActions: [
      '排查机房物理配电与 PDU 供电状态，确认主机电源指示灯与风扇运转情况。',
      '通过 IPMI / iLO 带外管理卡检查硬件健康日志并尝试远程开机。',
      '核查容器与服务调度副本是否已自动迁移至正常节点，避免单点业务堆积。',
    ],
  },
  host_network_partition_or_isolation: {
    title: '网络通信中断与隔离',
    plainDescription: '该主机物理网卡断开、上联交换机链路异常或防火墙安全规则阻断，导致该机器无法与集群其他成员通信。',
    recommendedActions: [
      '检查该主机网卡物理连接指示灯、光纤跳线与交换机接口收发光功率。',
      '排查网络路由配置与本地安全防火墙规则，排除误封堵或 IP 冲突可能。',
      '关注集群分布式协调组件的心跳状态，防止因通信孤岛产生集群脑裂。',
    ],
  },
  service_process_failure: {
    title: '关键业务进程故障',
    plainDescription: '节点上的核心微服务进程发生内存溢出、死锁、依赖异常或崩溃，服务无法对外提供正常响应。',
    recommendedActions: [
      '检索目标服务的错误日志，定位进程退出的直接异常堆栈。',
      '手动或通过容器编排控制台重新拉起故障实例，恢复基础服务。',
      '核查服务依赖的下游数据库与中间件是否发生延迟升高或连接池耗尽。',
    ],
  },
  storage_or_disk_failure: {
    title: '存储设备与磁盘读写故障',
    plainDescription: '服务器本地存储盘发生 I/O 挂死、物理扇区损坏或文件系统转为只读挂载，数据写入受阻。',
    recommendedActions: [
      '执行磁盘状态检测命令排查物理坏道，检查存储阵列卡告警日志。',
      '若使用网络共享存储卷，确认存储服务端连通性及存储池剩余可用空间。',
      '紧急停止向故障卷写入数据，启动数据镜像同步与临时灾备盘挂载。',
    ],
  },
  config_or_env_misconfig: {
    title: '系统参数或环境配置错误',
    plainDescription: '近期配置下发有误、端口冲突、环境变量缺失或权限不匹配，导致服务无法正常启动或协同。',
    recommendedActions: [
      '调阅最近的配置发布版本，一键回滚至上一稳定运行版本的参数配置。',
      '逐项核对服务监听端口、证书有效期与访问认证密钥是否匹配。',
      '在预发环境重现配置差异，并在确认无误后再同步推送到生产集群。',
    ],
  },
}

const DEFAULT_KNOWLEDGE: RootCauseKnowledge = {
  title: '系统综合异常',
  plainDescription: '集群检测到组件通信时延偏高或局部指标异常，AI 诊断引擎已根据多维日志完成根因定位。',
  recommendedActions: [
    '查看故障节点的实时指标与关联服务状态。',
    '跟踪后台自动化诊断进展，若有必要可派发工单人工协同核验。',
  ],
}

export function rootCauseKnowledge(category: string | undefined): RootCauseKnowledge {
  return ROOT_CAUSE_KNOWLEDGE_BASE[category ?? ''] ?? DEFAULT_KNOWLEDGE
}
