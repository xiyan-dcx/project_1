<script setup lang="ts">
import { UiButton, UiCard, UiBadge, DataTable, PageLayout } from '@research-platform/design-system'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import MetricChart from '../components/MetricChart.vue'
import type { EChartsOption } from '../domain/dashboard'
import '../assets/fusion.css'

interface Group { measured_trials:number; seconds:number[]; median_seconds:number; remote_compactions:number[]; verified:boolean; median_counters:Record<string,number>; compaction_policy?:{mode:string;minimum_remote_bytes:number;local_jobs:number[];selected_remote_jobs:number[]} }
interface Evidence {
  verified:boolean; factor:string; job_id:string;
  summary:{run_id:string; correctness_passed:boolean; repeats_complete:boolean; performance_gain_proven:boolean; measurement_timestamps?:Record<string,(string|null)[]>; summary:{native:Group;optimized:Group}; limits:string[]; preconditioning_notes?:string[]};
  acceptance?:{remote_compaction_chain?:{passed:boolean;actual_remote_compactions:number};five_minute_durable_write_load?:{passed:boolean;operations:number;seconds:number};controlled_guest_restart?:{passed:boolean;trials:unknown[]}}
}
const evidence=ref<Evidence>(),loading=ref(false),error=ref(''),healthState=ref('正在检查在线业务'),healthOk=ref(false)
const native=computed(()=>evidence.value?.summary.summary.native),optimized=computed(()=>evidence.value?.summary.summary.optimized)
const sizePolicy=computed(()=>optimized.value?.compaction_policy?.mode==='size_threshold')
const remoteProof=computed(()=>evidence.value?.acceptance?.remote_compaction_chain)
const reportId='optimization-bf065af8406a4a6fa7b34b2de5407c5a'
let controller:AbortController|undefined
const f=(n:number|undefined,d=2)=>n!=null&&Number.isFinite(n)?n.toFixed(d):'—'
const signed=(n:number|undefined)=>n!=null&&Number.isFinite(n)?n===0?'持平':`${n>0?'增加':'减少'} ${Math.abs(n).toFixed(1)}%`:'—'
const percent=(a?:number,b?:number)=>a!=null&&b!=null&&a>0?(b/a-1)*100:undefined
const change=computed(()=>percent(native.value?.median_seconds,optimized.value?.median_seconds))
const conclusionNote=computed(()=>change.value==null?'正在读取完整对照结果。':change.value<0?'本轮同负载对照的耗时中位数下降；其他指标按下表分别判定。':change.value>0?'本轮尚未取得整体耗时收益；正确性和性能分别判定。':'本轮两组耗时中位数持平。')
const date=computed(()=>{const s=evidence.value?.summary;const dates=Object.values(s?.measurement_timestamps||{}).flat().filter((v):v is string=>typeof v==='string').map(v=>v.slice(0,10)).sort();if(dates.length)return dates[0]===dates[dates.length-1]?dates[0]:`${dates[0]} 至 ${dates[dates.length-1]}`;const id=s?.run_id;return id?.match(/^\d{8}/)?`${id.slice(0,4)}-${id.slice(4,6)}-${id.slice(6,8)}`:id||'—'})
const metrics=[{key:'host_read_bytes',label:'SSD 接口读取'},{key:'host_write_bytes',label:'SSD 接口写入'},
  {key:'ssd_interface_total_bytes',label:'SSD 接口读写总量'},{key:'storage_pod_tx_bytes',label:'存储 Pod 发送量'}]
const rows=computed(()=>metrics.map(item=>({...item,n:native.value?.median_counters[item.key],o:optimized.value?.median_counters[item.key]})))
const colors=['var(--muted-foreground)','var(--muted-foreground)'],labels=['基线系统','ScalaFusion']
const chart=(names:string[],series:Array<{name:string;data:number[];color:string}>):EChartsOption=>({
  textStyle:{color:'var(--muted-foreground)',fontFamily:'system-ui'},tooltip:{trigger:'axis',confine:true,backgroundColor:'var(--muted-foreground)',borderColor:'var(--muted-foreground)',textStyle:{color:'var(--muted-foreground)'}},
  legend:{top:0,textStyle:{color:'var(--muted-foreground)'},itemWidth:10,itemHeight:10},grid:{top:48,left:12,right:18,bottom:5,containLabel:true},
  xAxis:{type:'category',data:names,axisLabel:{color:'var(--muted-foreground)',fontSize:11},axisLine:{lineStyle:{color:'var(--muted-foreground)'}}},
  yAxis:{type:'value',min:0,axisLabel:{color:'var(--muted-foreground)'},splitLine:{lineStyle:{color:'var(--muted-foreground)'}}},
  series:series.map(s=>({type:'bar',name:s.name,data:s.data,barMaxWidth:42,itemStyle:{color:s.color,borderRadius:[5,5,0,0]}}))
})
const timeChart=computed(()=>chart(['第 1 轮','第 2 轮','第 3 轮'],[
  {name:labels[0],data:native.value?.seconds||[],color:colors[0]},{name:labels[1],data:optimized.value?.seconds||[],color:colors[1]}]))
const ioChart=computed(()=>chart(['读取 MiB','写入 MiB','读写总量 MiB'],['native','optimized'].map((p,i)=>({name:labels[i],color:colors[i],
  data:['host_read_bytes','host_write_bytes','ssd_interface_total_bytes'].map(k=>(evidence.value?.summary.summary[p as 'native'|'optimized'].median_counters[k]||0)/1024**2)}))))
const networkChart=computed(()=>chart(['存储 Pod eth0 发送量 · MiB'],['native','optimized'].map((p,i)=>({name:labels[i],color:colors[i],
  data:[(evidence.value?.summary.summary[p as 'native'|'optimized'].median_counters.storage_pod_tx_bytes||0)/1024**2]}))))
const checks=computed(()=>[
  {name:'业务读写正确性',ok:evidence.value?.summary.correctness_passed,text:'3024 次操作 · 1755 个键逐值一致'},
  {name:'compaction 执行与分流',ok:(optimized.value?.remote_compactions.length===3&&optimized.value.remote_compactions.every(n=>n>0))||(sizePolicy.value&&remoteProof.value?.passed),text:sizePolicy.value?`本轮远程 ${optimized.value?.remote_compactions.join(' / ')} 次；强制远程链路另经 ${remoteProof.value?.actual_remote_compactions??'—'} 次验证`:`三轮远程成功次数：${optimized.value?.remote_compactions.join(' / ')||'—'}`},
  {name:'重启后读回',ok:evidence.value?.acceptance?.controlled_guest_restart?.passed,text:'存储服务重启后四份数据一致'},
  {name:'持续写入验证',ok:evidence.value?.acceptance?.five_minute_durable_write_load?.passed,text:`5 分钟 · ${evidence.value?.acceptance?.five_minute_durable_write_load?.operations.toLocaleString()||'—'} 次持久化覆盖写`},
])
async function refresh(){
  if(loading.value)return
  loading.value=true;error.value='';controller=new AbortController()
  const timeout=setTimeout(()=>controller?.abort(),15000)
  try{
    const response=await fetch(`/system-3/api/optimization/run/${reportId}`,{cache:'no-store',signal:controller.signal})
    if(!response.ok)throw new Error('暂时无法读取对照结果，请稍后刷新。')
    const data=await response.json() as Evidence
    if(data.factor!=='whole_stack'||!data.verified||!data.summary?.repeats_complete||!data.summary.correctness_passed)throw new Error('该记录尚未完成整套系统对照验收。')
    for(const g of [data.summary.summary.native,data.summary.summary.optimized]){
      if(!g.verified||g.measured_trials!==3||g.seconds.length!==3||!g.seconds.every(n=>Number.isFinite(n)&&n>0)||!Number.isFinite(g.median_seconds)||g.median_seconds<=0)throw new Error('对照数据不完整，暂不绘制性能图。')
      if(g.remote_compactions.length!==3||!g.remote_compactions.every(n=>Number.isSafeInteger(n)&&n>=0))throw new Error('远程 compaction 计数不完整。')
      if(metrics.some(c=>!Number.isFinite(g.median_counters[c.key])||g.median_counters[c.key]<0))throw new Error('设备或网络计数缺失，暂不展示变化结论。')
    }
    evidence.value=data
  }catch(e){error.value=e instanceof Error?e.message:'结果读取失败，请稍后刷新。'}
  finally{clearTimeout(timeout);loading.value=false}
  try{
    const response=await fetch('/system-3/api/caas/health',{cache:'no-store',signal:AbortSignal.timeout(10000)})
    const h=await response.json();healthOk.value=!!(response.ok&&h.ok&&h.hdfs?.ready&&h.procp?.ready&&h.csa?.ready);healthState.value=healthOk.value?'在线业务运行正常':'在线业务状态待确认'
  }catch{healthOk.value=false;healthState.value='在线业务状态暂不可用'}
}
function download(){
  if(!evidence.value)return
  const url=URL.createObjectURL(new Blob([JSON.stringify(evidence.value,null,2)],{type:'application/json'}))
  const a=document.createElement('a');a.href=url;a.download=`ScalaFusion-${evidence.value.summary.run_id}-evidence.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
onMounted(refresh);onBeforeUnmount(()=>controller?.abort())
</script>

<template>
  <PageLayout class="fusion-page">
    <template #heading>
    <header class="fusion-hero" data-visual-region="page-heading">
      <div><p class="fusion-eyebrow">KUBERNETES · STORAGE &amp; COMPUTE</p><h1>一套业务，两条存算路径。</h1><p class="fusion-intro">ScalaFusion 存算协同优化系统 <span>ScalaAFA ＋ CaaS-LSM ＋ dPP</span></p></div>
      <div class="hero-status" :class="{pending:!healthOk}"><span><i/>{{healthState}}</span><small>当前展示已完成实验 · 正式业务未切换</small></div>
    </header></template>
    <section class="workload-strip" aria-label="对照业务与实验口径">
      <div><small>共同业务负载</small><strong>混合键值读写与压缩</strong></div><div><small>固定回放</small><strong>3024 次操作 · 同一份数据</strong></div><div><small>测量轮次</small><strong>预热 1 轮 ＋ 测量 3 轮 / 组</strong></div>
      <UiButton variant="default" class="fusion-button" :disabled="loading" @click="refresh">{{loading?'正在读取…':'刷新实验结果'}}</UiButton>
    </section>
    <p v-if="error" class="fusion-notice" role="alert">{{error}} <span v-if="evidence">下方保留上次读取的结果。</span></p>
    <div v-if="!evidence" class="fusion-empty">{{loading?'正在读取整套系统对照结果…':'尚未获得完整实验结果。不会使用示例数据替代。'}}</div>
    <template v-else>
      <section class="systems-grid" aria-label="基线与整套优化系统">
        <UiCard class="system-card baseline"><div class="system-top"><span class="path-number">01</span><span>BASELINE</span><UiBadge>对照组</UiBadge></div><h2>Kubernetes 上的基线系统</h2><p>原生 HDFS ＋ 本地 LSM compaction ＋ 普通 RAID5</p><div class="path-flow"><span>业务回放</span><b>→</b><span>HDFS</span><b>→</b><span>普通 RAID5</span></div><div class="system-result"><div><small>端到端中位耗时</small><strong>{{f(native?.median_seconds)}}<em>秒</em></strong></div><span class="system-ok">✓ 内容校验一致</span></div></UiCard>
        <UiCard class="system-card optimized"><div class="system-top"><span class="path-number">02</span><span>SCALAFUSION</span><UiBadge>整套优化组</UiBadge></div><h2>ScalaFusion 协同优化系统</h2><p>ScalaAFA ＋ 跨节点 dPP ＋ CaaS-LSM {{sizePolicy?'按任务规模分流 compaction':'远程 compaction'}}</p><div class="path-flow"><span>业务回放</span><b>→</b><span>HDFS / SPDK</span><b>→</b><span>协同存算路径</span></div><div class="system-result"><div><small>端到端中位耗时</small><strong>{{f(optimized?.median_seconds)}}<em>秒</em></strong></div><span class="system-ok">✓ 内容校验一致</span></div></UiCard>
      </section>
      <section class="conclusion" :class="change!=null&&change>0?'regression':'gain'" aria-live="polite"><span class="conclusion-icon">{{change!=null&&change>0?'↗':'↘'}}</span><div><strong>本轮端到端耗时{{change!=null&&change>0?'增加':'减少'}} {{f(Math.abs(change||0),1)}}%</strong><p>{{conclusionNote}} 性能结论以本轮实验范围为限。</p></div><span>{{date}} · 3 轮中位数</span></section>
      <section class="measure-grid">
        <UiCard class="measure-panel time-panel"><div class="panel-heading"><div><p class="fusion-eyebrow">END-TO-END</p><h3>同一业务的逐轮耗时</h3></div><span>秒 · 越低越好</span></div><MetricChart :option="timeChart" label="基线与 ScalaFusion 三轮业务耗时对照"/><DataTable class="trial-table"><table data-slot="table"><thead data-slot="table-header"><tr data-slot="table-row"><th data-slot="table-head">系统</th><th data-slot="table-head">第 1 轮</th><th data-slot="table-head">第 2 轮</th><th data-slot="table-head">第 3 轮</th><th data-slot="table-head">中位数</th></tr></thead><tbody data-slot="table-body"><tr data-slot="table-row" v-for="(g,key) in evidence.summary.summary" :key="key"><td data-slot="table-cell">{{key==='native'?'基线系统':'ScalaFusion'}}</td><td data-slot="table-cell" v-for="(n,i) in g.seconds" :key="i">{{f(n)}} s</td><td data-slot="table-cell">{{f(g.median_seconds)}} s</td></tr></tbody></table></DataTable></UiCard>
        <UiCard class="measure-panel"><div class="panel-heading"><div><p class="fusion-eyebrow">STORAGE I/O</p><h3>设备接口读写</h3></div><span>MiB · 三轮中位数</span></div><MetricChart :option="ioChart" label="两组 SSD 接口读写字节对照"/><p class="panel-note">记录 SSD 接口载荷；不等同于物理 NAND I/O。设备内转换的读写在实验详情中单列。</p></UiCard>
        <UiCard class="measure-panel"><div class="panel-heading"><div><p class="fusion-eyebrow">STORAGE NETWORK</p><h3>存储节点发送量</h3></div><span>MiB · 三轮中位数</span></div><MetricChart :option="networkChart" label="两组存储 Pod 网络发送字节对照"/><p class="panel-note">两台存储 Pod 的 eth0 发送量；不包含其他业务、HDFS、CSA Pod 的全部流量。</p></UiCard>
      </section>
      <section data-slot="card" class="measure-panel metrics-panel"><div class="panel-heading"><div><p class="fusion-eyebrow">MEASURED CHANGES</p><h3>各项指标的实际变化</h3></div><UiButton variant="ghost" class="fusion-link" @click="download">导出原始测量 ↓</UiButton></div><DataTable class="trial-table"><table data-slot="table"><thead data-slot="table-header"><tr data-slot="table-row"><th data-slot="table-head">指标</th><th data-slot="table-head">基线系统</th><th data-slot="table-head">ScalaFusion</th><th data-slot="table-head">相对基线（越低越好）</th></tr></thead><tbody data-slot="table-body"><tr data-slot="table-row"><td data-slot="table-cell">端到端耗时</td><td data-slot="table-cell">{{f(native?.median_seconds)}} s</td><td data-slot="table-cell">{{f(optimized?.median_seconds)}} s</td><td data-slot="table-cell" :class="(change||0)>0?'metric-worse':'metric-better'">{{signed(change)}}</td></tr><tr data-slot="table-row" v-for="row in rows" :key="row.key"><td data-slot="table-cell">{{row.label}}</td><td data-slot="table-cell">{{f((row.n||0)/1024**2)}} MiB</td><td data-slot="table-cell">{{f((row.o||0)/1024**2)}} MiB</td><td data-slot="table-cell" :class="(percent(row.n,row.o)||0)>0?'metric-worse':'metric-better'">{{signed(percent(row.n,row.o))}}</td></tr></tbody></table></DataTable><p class="panel-note">同一指标先逐轮计算，再取中位数。网络载荷下降不自动代表实际 I/O 或业务耗时下降。</p></section>
      <section class="checks-grid" aria-label="正确性和恢复验证"><UiCard v-for="check in checks" :key="check.name"><span :class="check.ok?'check-ok':'check-pending'">{{check.ok?'✓':'○'}}</span><div><h3>{{check.name}}</h3><p>{{check.text}}</p><small>{{check.ok?'最近一次验证通过':'待确认'}}</small></div></UiCard></section>
      <details id="experiment-config" class="experiment-config"><summary><span>实验配置与测量范围</span><small>{{date}} · 展开详情</small></summary><div class="config-content"><p>两组共同运行于 Kubernetes，复用同一组 5 个测试设备实例、相同 HDFS/CaaS 镜像、同一轨迹和 2 GiB 文件系统容量。Kubernetes 是共同部署平台；本轮没有单独改动其调度器。</p><dl><dt>节点分工</dt><dd>158：业务、HDFS 与 AFA 前端；35 / 36：测试存储设备与远程 compaction。测试 HDFS 使用一个 DataNode，跨节点分布发生在块层。</dd><dt>基线实现</dt><dd>原 HDFS 镜像＋相同 CaaS SDK 本地 compaction 模式＋普通内核 RAID5。不是另行编译的上游原版 LSM。</dd><dt>测量限制</dt><dd>分组顺序测量、缓存已预热、两个保留文件系统的历史分配不同，未做初始磁盘布局完全相同的随机交错实验。计数覆盖 apply 区间。</dd><template v-if="sizePolicy"><dt>compaction 分流</dt><dd>输入小于 {{f((optimized?.compaction_policy?.minimum_remote_bytes||0)/1024**2,0)}} MiB 的任务在本地执行，达到阈值后选择远程。本轮三次测量的本地任务数为 {{optimized?.compaction_policy?.local_jobs.join(' / ')}}，实际远程任务数为 {{optimized?.remote_compactions.join(' / ')}}。强制远程链路另有正确性验证；当前整套结果不单独证明远程 compaction 加速。</dd></template><dt>设备内转换</dt><dd>优化组三轮中位数：{{optimized?.median_counters.device_conversions}} 次；内部读 {{f((optimized?.median_counters.internal_read_bytes||0)/1024**2)}} MiB、内部写 {{f((optimized?.median_counters.internal_write_bytes||0)/1024**2)}} MiB。该部分不包含在主机接口字节中。</dd><dt>运行范围</dt><dd>独立测试卷，正式 HDFS 路径未替换。受控 VM/Pod 重启通过不等于任意断电、整节点故障或生产级 HA 验收。</dd><dt>结果记录</dt><dd><code>{{evidence.job_id}}</code></dd></dl><p>整套对照回答“总体有没有获益”；组件消融用于解释原因。两类实验各有用途，不能互相替代，也不预设所有指标都会改善。</p></div></details>
      <footer class="fusion-footer"><span>ScalaFusion · ScalaAFA / CaaS-LSM / dPP / SPDK</span><span>显示实际已测结果 · 支持原始证据导出</span></footer>
    </template>
  </PageLayout>
</template>
