# Research Platform design system

Vue 3 adaptation of `snowapi-design-system/SKILL.md`, with its Rainflow console skin.

- `styles/tokens.css` and `presets.css` derive from the teammate's supplied reference files. Tailwind directives are translated into native CSS; business styles consume semantic variables.
- Vue primitives preserve `data-slot`, `data-variant`, `data-size`, CVA and `cn()` contracts. Native semantic controls retain keyboard behavior. No React runtime or Base UI React dependency is introduced.
- Rainflow defaults: monochrome, borderless layered surfaces, sans font, compact scale, medium radius, centered content. Rainflow intentionally fixes panel/control radii over the generic radius axis, following the supplied skin.
- Theme storage only records light/dark appearance. Reduced motion disables CSS animation and ECharts animation; theme changes retain chart interaction state.
- Charts resolve the same CSS palette into Canvas-compatible RGBA values and change presentation only. Original numeric values, APIs, route query parameters and experiment gates stay in the application.
- Public Sans is bundled locally under the SIL Open Font License, including its license and source hashes in `styles/fonts/`. The console uses the sans axis; serif fallback stacks remain available in the tokens.

Import `@research-platform/design-system/styles` once, call `initializeTheme()`, and use `AppShell`, `PageLayout`, `UiButton`, `UiCard`, `UiBadge` and `DataTable` from this package.
