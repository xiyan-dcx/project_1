import { clsx, type ClassValue } from 'clsx'

// Native CSS variants need no Tailwind conflict resolution.
export function cn(...inputs: ClassValue[]) { return clsx(inputs) }
