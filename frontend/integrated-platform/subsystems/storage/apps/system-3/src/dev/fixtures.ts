// Synthetic UI test data, never experiment results. Loaded only in Vite DEV with ?demo=1.
import type { Sample } from '../types/bench'
export const demoSamples: Sample[] = ['write', 'randread'].flatMap((rw, config) =>
  (['scalaafa', 'mdraid', 'raid5f'] as const).map((engine, i): Sample => ({
    engine, engine_name: ['ScalaAFA','mdraid','RAID5F'][i], rw: rw as Sample['rw'], bs: '256k', qd: config ? 8 : 32, rt: 5,
    iops: [16000,9000,12000][i] + config * 2000, bw_mib: [4000,2250,3000][i] + config * 500,
    lat_us: [125,220,180][i], lat_min: [10,20,15][i], lat_max: [2000,4000,3000][i], lat_stdev: [22,55,35][i],
    slat: {}, clat: {}, pct: {'1.0': 20+i*8,'50.0': 100+i*30,'95.0': 240+i*100,'99.0': 500+i*100,'99.9': 1200+i*300,'99.99': 1800+i*400},
    lat_dist: {'50usec': 15,'100usec': 20,'250usec': 60,'1msec': 5}, cpu: {usr: 4+i*2, sys: 10+i*2, idle: 86-i*4},
    io_depths: config ? {'1': 1,'8': 99} : {'1': 1,'32': 99}, bw_stat: {stdev: 12+i*5}, iops_stat: {stdev: 200+i*150}, ts: 0,
    series: [0,1,2,3,4].map(t => ({t:t+1, iops: 15000-i*2000+t*250, bw_mib: (15000-i*2000+t*250)/4})),
  })))
