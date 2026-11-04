/** @type {import('tailwindcss').Config} */
export default {
  prefix: 'sd-',
  important: '.sd-root',
  content: ['./index.html', './src/**/*.{vue,ts}'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      fontFamily: { sans: ['var(--sd-font-body)'], mono: ['var(--sd-font-mono)'] },
      colors: {
        background: 'var(--sd-background)', foreground: 'var(--sd-foreground)',
        panel: 'var(--sd-panel)', muted: 'var(--sd-muted)', secondary: 'var(--sd-secondary)',
        primary: 'var(--sd-primary)', success: 'var(--sd-success)', warning: 'var(--sd-warning)',
        danger: 'var(--sd-danger)', info: 'var(--sd-info)', cpu: 'var(--sd-cpu)', memory: 'var(--sd-memory)',
      },
      borderRadius: { panel: 'var(--sd-radius)', inner: 'var(--sd-radius-inner)', button: 'var(--sd-radius-button)' },
    },
  },
  plugins: [],
}
