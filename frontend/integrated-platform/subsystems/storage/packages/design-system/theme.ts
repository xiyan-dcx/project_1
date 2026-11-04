import { ref } from 'vue'
export const isDark=ref(false)
export const themeRevision=ref(0)
export const reducedMotion=ref(false)
let initialized=false
export function initializeTheme(){
  if(initialized)return
  initialized=true
  try{isDark.value=localStorage.getItem('snowapi-portal-theme')==='dark'}catch{/* Storage can be disabled. */}
  Object.assign(document.body.dataset,{snowapiConsole:'true',themePreset:'default',themeFont:'sans',themeRadius:'md',themeScale:'sm',themeContentLayout:'centered'})
  const media=window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion.value=media.matches
  media.addEventListener('change',event=>{reducedMotion.value=event.matches;themeRevision.value++})
  applyTheme()
}
function applyTheme(){document.documentElement.classList.toggle('dark',isDark.value);document.documentElement.style.colorScheme=isDark.value?'dark':'light';themeRevision.value++}
export function toggleTheme(){isDark.value=!isDark.value;applyTheme();try{localStorage.setItem('snowapi-portal-theme',isDark.value?'dark':'light')}catch{/* Keep in-memory selection. */}}

window.addEventListener('portal-theme-change', ((event: CustomEvent<boolean>) => { isDark.value = event.detail; themeRevision.value++ }) as EventListener)

