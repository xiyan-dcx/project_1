// Ordinary transitions match CSS --sd-duration-*; flight replay has its own pace.
export const MOTION = {
  fast: 0.18,
  normal: 0.24,
  slow: 0.32,
  flight: 1.8,
  ease: [0.33, 1, 0.68, 1] as [number, number, number, number],
}
