---
name: design
description: Use when building, changing, polishing, or reviewing UI in this repo (fe/src, components, pages, App.css, index.css) — landing pages, dashboards, ticket/booking screens, modals, screenshot-to-UI, or any visual/web design task. Enforces the CineBook Cobalt Editorial brand (one electric cobalt accent, Space Grotesk + Inter, token-consistent plain CSS) and rejects generic "AI slop".
---

# CineBook design skill

You turn UI work into output that matches CineBook's brand. Taste comes from
the design context, not the model — so always work from the sources below and
commit to a direction before building. Never fall back to a generic look.

## Non-negotiable rules (from DESIGN.md)

- Read `DESIGN.md` and skim `fe/src/App.css` + `fe/src/index.css` before any
  design edit. Cite the token names you reuse.
- **One accent** (electric cobalt), **Space Grotesk + Inter**, **≤24px radius**,
  restrained motion (0.2s ease, ≤3px lift). Use solid cobalt or a restrained cobalt-to-deep-cobalt treatment only for primary actions; no gradient text or glassmorphism.
- All UI copy **Vietnamese** — reuse the existing vocabulary in
  `fe/src/utils/format` (`errorMessage`, `statusLabel`). No placeholder copy.
- Prefer reusing existing `App.css` classes over writing new CSS. Add rules
  only when a primitive is genuinely missing, token-consistent.
- Every interactive surface needs loading / empty / error / hover states.

## Workflow

1. **Clarify the reference** — ask only what you need. If the user gave
   reference images, list them with `@` and use them. Collect multiple states
   (desktop + mobile, hover, empty, loading) — never design from one hero shot.
2. **Commit to a direction** — before editing, state: which tokens, which
   existing primitives, which layout, how it behaves at ≤720px. Match spacing
   and hierarchy, don't just "make it nice".
3. **Build** — reuse primitives, edit CSS tokens/custom properties
   conservatively, keep the change small and focused.
4. **Verify in a real browser** — start `npm run dev:fe` (root: `npm run
   dev:fe`), then use the Playwright MCP `browser_navigate` /
   `browser_screenshot` tools at desktop and ≤720px viewport. Was the layout
   correct at both? Did states render? Resize and re-screenshot.
5. **Iterate against the reference** — compare your implementation to the
   reference images, not just "does it build". Fix mismatches, revert bad
   iterations.

## When reviewing existing UI

Judge against the design system, not personal taste: token drift, radius
overruns, second typefaces, gradient/glass overuse, English strings, missing
states, broken layout under 720px. Report findings as a short list, file:line
for each.

## Model note

This project brings its own provider key (BYOK). Quality is determined by the
design context you enforce here, regardless of which model runs — apply the
rules every time.