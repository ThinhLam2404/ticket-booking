# CineBook — Design System

Design conventions for the ticket-booking frontend (`fe/`). The visual source of
truth is the **CineNoir Violet** design created in the Stitch project
"CineBook Cinema Ticket Booking": a dramatic cinema-night interface with deep
obsidian surfaces and electric violet actions.

## Source of truth

Tokens below mirror the Stitch design system. Keep `fe/src/index.css` and
`fe/src/App.css` aligned with these values whenever the UI changes.

## Stack

- React 19 + Vite + TypeScript, plain CSS — no Tailwind or UI library.
- Components in `fe/src/components/`, pages in `fe/src/pages/`.
- Nearly all styling lives in `fe/src/App.css` and `fe/src/index.css`.
- All UI copy is Vietnamese. Brand names and email placeholders may remain as-is.
- Verify the layout at desktop and at widths of 720px or less.

## Color tokens

| Token | Value | Usage |
|---|---|---|
| `background` | `#141312` | page canvas and base background |
| `background-deep` | `#0f0e0d` | hero backing, footer, compact header |
| `surface-low` | `#1d1b1a` | cards and low-level containers |
| `surface` | `#211f1e` | inputs, booking controls, standard panels |
| `surface-high` | `#2b2a28` | elevated controls, hover surfaces, chips |
| `surface-highest` | `#363433` | strongest neutral elevation |
| `border` | `#504537` | structural hairlines and card borders |
| `border-strong` | `#9c8f7e` | muted outline and focus-adjacent structure |
| `accent` | `#7c3aed` | primary action, selected state, focus border |
| `accent-deep` | `#6d28d9` | gradient CTA end and deep violet emphasis |
| `accent-hover` | `#8b5cf6` | hover state for primary controls |
| `accent-soft` | `#c084fc` | active links, labels, highlights |
| `accent-pale` | `#d2bbff` | light violet metadata and supporting accents |
| `text-primary` | `#ffffff` | highest-priority text and CTA text |
| `text-body` | `#e6e1df` | headings and primary body content |
| `text-secondary` | `#d4c4b2` | metadata, labels, secondary content |
| `text-muted` | `#9c8f7e` | inactive navigation, captions, outlines |
| `success` | background `#1f533d`, text `#baf1d0` | confirmed and available states |
| `warning` | background `#62259b`, text `#d1a1ff` | held or pending states |
| `danger` | background `#93000a`, text `#ffdad6` | destructive, sold, and error states |

Violet is the only brand accent. Green, warning violet, and red are reserved
for semantic status communication. Do not introduce unrelated accent colors.

## Typography

- Use one typeface: `Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`.
- Do not import a second webfont.
- Display and headings use weights `700`–`800` with tight negative tracking.
- `h1`: `clamp(2.5rem, 6vw, 5rem)`, line-height `.94`, letter-spacing `-.07em`.
- `.page-title`: `clamp(2rem, 4vw, 3.1rem)`, letter-spacing `-.05em`.
- `.eyebrow`: `.72rem`, weight `800`, letter-spacing `.2em`, `accent-soft` color.
- Showtime and price values should use tabular figures where possible.

## Spacing and radius

- Radii: 4px technical tags, 8px seats, 10px controls, 12px inputs, 16px
  cards, 20px modals, 24px feature widgets. Never exceed 28px.
- Main content: `width: min(1180px, 90vw)`, centered, padding `42px 0 80px`.
- Desktop grid: max width 1280px, 12 columns, 24px gutters, 32px margins.
- Mobile grid: 4 columns, 16px gutters, 16px margins.
- Card gaps: 14px–18px. Compact row gaps: 10px–12px.
- Buttons and inputs use `12px 14px` through `17px` padding.

## Layout primitives

- `.topbar`: sticky 72px navigation with `#0f0e0d`/`#141312`, a bottom
  hairline, and a restrained dark shadow when compact.
- Smart header states: full navigation at the top, a 56px compact header when
  scrolling upward, and translated out of view when scrolling downward.
- `.hero-panel`: dark cinematic gradient, 28px radius, `#504537` border, and
  deep structural shadow. Violet art uses a rotated organic shape with a hard
  offset shadow.
- `.movie-card`, `.record`, and `.ticket`: opaque tiered surfaces, 1px border,
  16px radius, and a violet border on hover.
- Primary buttons use `linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)`,
  white text, and a directional violet shadow.
- Secondary buttons use `#2b2a28` with `#504537` border and `#e6e1df` text.
- Status badges are compact pills with semantic muted backgrounds and matching
  light text.

## Interaction rules

- Focus borders, active links, selected seats, and primary actions use violet.
- Primary hover uses `#8b5cf6`; secondary hover raises the border to `#7c3aed`.
- Motion is restrained: `transform`, `opacity`, and `border-color` transitions;
  hover lifts stay at or below 3px.
- Disabled controls use `opacity: .45` and `cursor: not-allowed`.
- Active press uses `translateY(1px)`.
- Movie poster hover may reveal a dark overlay and violet play action; never use
  a bouncing, looping, or spring animation.
- Every interactive surface needs loading, empty, error, and hover states.

## UI copy language

Use concise Vietnamese copy and the existing vocabulary from
`fe/src/utils/format`: `Đang tải…`, `Thử lại`, `Quay lại`, `Vé của tôi`, and
`Đăng xuất`. Do not add placeholder, demo, or unexplained English copy.

## Anti-patterns

- Do not replace the CineNoir Violet palette with amber, blue, or unrelated
  accent colors.
- Do not use glassmorphism, translucent frosted cards, or oversized glow halos.
- Do not add a second typeface or radius above 28px.
- Do not use neon semantic status colors or gradient text.
- Do not invent illustrations; use existing poster or gradient placeholders.
- Do not use default Tailwind gray tokens or generic AI dashboard styling.

## Workflow for design tasks

1. Inspect current CSS and components before editing.
2. Use the Stitch CineNoir Violet tokens and existing `App.css` primitives.
3. Preserve loading, empty, error, hover, focus, and disabled states.
4. Run `npm run dev:fe` and verify desktop plus a viewport of 720px or less in
   a real browser before calling the work done.
5. Compare implementation hierarchy, spacing, and colors against the Stitch
   screens before iterating.
