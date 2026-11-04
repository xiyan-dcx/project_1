import { clsx, type ClassValue } from 'clsx'
import { cva } from 'class-variance-authority'
export const cn = (...values: ClassValue[]) => clsx(values)
export const buttonVariants = cva('ui-button', {
  variants: {
    variant: { default: 'ui-button-primary', secondary: 'ui-button-secondary', outline: 'ui-button-secondary', ghost: 'ui-button-ghost', destructive: 'ui-button-destructive' },
    size: { xs: 'ui-button-xs', sm: 'ui-button-sm', default: 'ui-button-default', lg: 'ui-button-lg', icon: 'ui-button-icon' },
  },
  defaultVariants: { variant: 'secondary', size: 'default' },
})
