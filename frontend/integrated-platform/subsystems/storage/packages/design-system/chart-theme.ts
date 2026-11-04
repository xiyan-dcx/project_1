import { isDark, reducedMotion } from './theme'
// Canvas receives RGB-compatible values derived from the same CSS tokens.
export function chartPalette(){
  const names=['--foreground','--muted-foreground','--rainflow-surface-inset','--rainflow-divider','--chart-1','--chart-2','--chart-3','--chart-4','--chart-5']
  const values=names.map(name=>{
    const probe=document.createElement('span');probe.style.color=`var(${name})`;probe.style.display='none';document.body.appendChild(probe)
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1
    const ctx=canvas.getContext('2d',{willReadFrequently:true})!
    ctx.fillStyle=getComputedStyle(probe).color;ctx.fillRect(0,0,1,1);const rgba=ctx.getImageData(0,0,1,1).data;probe.remove()
    return `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3]/255})`
  })
  return {ink:values[0],muted:values[1],surface:values[2],divider:values[3],series:values.slice(4),dark:isDark.value,motion:!reducedMotion.value}
}
export function themedChart(input:Record<string,any>){
  const theme=chartPalette()
  function walk(value:any,key=''):any{
    if(Array.isArray(value))return value.map(item=>walk(item,key))
    if(value===null||typeof value!=='object')return value
    const out:Record<string,any>={}
    for(const [k,v] of Object.entries(value)){
      if(k==='color')out[k]=key.includes('splitLine')||key.includes('axisLine')?theme.divider:key.includes('areaStyle')?theme.surface:theme.muted
      else if(k==='backgroundColor')out[k]=theme.surface
      else if(k==='borderColor')out[k]=theme.divider
      else if(k==='fontFamily')out[k]=getComputedStyle(document.body).fontFamily
      else out[k]=walk(v,key+'.'+k)
    }
    return out
  }
  const result=walk(input)
  result.color=theme.series;result.animation=theme.motion;result.animationDuration=180;result.animationDurationUpdate=180
  result.textStyle={...result.textStyle,color:theme.muted,fontFamily:getComputedStyle(document.body).fontFamily}
  const series=Array.isArray(result.series)?result.series:result.series?[result.series]:[]
  series.forEach((s:any,index:number)=>{
    const shade=theme.series[index%theme.series.length]
    s.itemStyle={...s.itemStyle,color:shade,borderWidth:0};s.lineStyle={...s.lineStyle,color:shade,type:index%2?'solid':'dashed',width:2}
    if(s.type==='bar'||s.type==='pie'||s.type==='radar'){
      s.data=s.data?.map((v:any,i:number)=>typeof v==='object'&&v!==null?{...v,itemStyle:{...v.itemStyle,color:series.length===1?theme.series[i%theme.series.length]:shade,borderWidth:0},lineStyle:{...v.lineStyle,color:theme.series[i%theme.series.length],type:i%2?'solid':'dashed'}}:v)
    }
  })
  result.series=series
  return result
}
