import { useMediaQuery } from '@vueuse/core'

export function useMotionPreferences() {
  return { reduceMotion: useMediaQuery('(prefers-reduced-motion: reduce)') }
}
