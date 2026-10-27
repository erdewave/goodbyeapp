# Project rules

- Write a maximum of 300 lines of code.
- UI: always use beUI components (https://beui.dev, source: github.com/starc007/ui-components). Before building any UI element, search beUI (MCP server `beui` in `.mcp.json`, or https://beui.dev/llms.txt) and install it with `npx shadcn@latest add @beui/<slug>`. Write custom UI only when beUI has no fitting component. Installed files land in `ui/components/motion/` and `ui/lib/`; import via `@/`.
- Never use a hover zoom/scale animation on buttons or other controls (no `whileHover` scale, no `hover:scale-*`). Hover may only change color/background. When installing beUI components, strip any hover scale they ship with.
- Never add focus styling (no focus/focus-visible/focus-within rings, outlines or color changes). `ui/index.css` resets outlines globally; strip focus classes from installed beUI components. Focus management code (moving focus, focus traps) is fine.
