# CineBook — Cobalt Editorial Design System

Design conventions for the ticket-booking frontend (`fe/`). The current visual direction is **CineBook Cobalt Editorial**: cinematic editorial discovery for customers and a precise operations workspace for admins. It combines the image-led hierarchy of Standard Hotels and M+ with the data clarity of Elastic, Highlight and Hex.

## Source of truth

Keep `fe/src/index.css`, `fe/src/App.css`, theme files and Stitch references aligned with these tokens. The design supports `system`, `light` and `dark` preferences. Store only the preference; resolve the active theme at runtime.

## Stack

- React 19 + Vite + TypeScript + plain CSS. No Tailwind or UI library.
- Components live in `fe/src/components/`, pages in `fe/src/pages/`, theme runtime in `fe/src/theme/`.
- Use Space Grotesk for display and Inter for body, data and controls.
- All product UI copy is Vietnamese. Brand names, TMDB and email placeholders may remain as-is.
- Preserve loading, empty, error, hover, focus, disabled and pending states.
- Preserve booking, seat, payment, route and API behavior while changing presentation.

## Theme runtime

- Preference key: `ticket_booking_theme`.
- Values: `system`, `light`, `dark`.
- Apply the resolved value as `data-theme="light"` or `data-theme="dark"` on `<html>`.
- Use a synchronous pre-paint bootstrap in `fe/index.html` to avoid a theme flash.
- Follow `prefers-color-scheme` while preference is `system`.
- Listen for system changes and cross-tab storage changes.
- Update `color-scheme` and the browser `theme-color` meta tag.
- Theme controls appear in the customer header/mobile navigation, admin sidebar/mobile header and admin login. Admin uses a direct Sáng/Tối toggle button; customer controls retain the `system` option.
- Theme controls must be keyboard accessible and clearly expose the active choice.

## Semantic color tokens

The palette uses electric cobalt as the shared brand accent. Light mode is a cool paper workspace; dark mode is a deep blue-black cinema surface. Do not swap colors mechanically: preserve semantic roles and contrast.

| Token | Light | Dark | Usage |
|---|---|---|---|
| `canvas` | `#f6f8fb` | `#08101f` | page background |
| `canvas-raised` | `#edf2f7` | `#0b1728` | hero backing and navigation |
| `surface-1` | `#ffffff` | `#0e1b2d` | cards and panels |
| `surface-2` | `#eef3f8` | `#14243a` | inputs, rows and controls |
| `surface-3` | `#e4ebf3` | `#1c304b` | hover, selected and elevated controls |
| `text-primary` | `#0e1b35` | `#f7faff` | headings and important content |
| `text-body` | `#24344d` | `#e5edf7` | body and table content |
| `text-secondary` | `#42526a` | `#c7d1de` | metadata and labels |
| `text-muted` | `#64748b` | `#8e9bad` | captions and inactive content |
| `border` | `#d3dce8` | `#2a3d57` | structural hairlines |
| `border-strong` | `#9eadc0` | `#526882` | focused and emphasized borders |
| `brand` | `#0b64dd` | `#3b82f6` | primary action, links and selection |
| `brand-deep` | `#094dab` | `#2563c7` | pressed and deep brand state |
| `brand-hover` | `#0755bd` | `#60a5fa` | hover state |
| `brand-soft` | `#e5f0ff` | `#102e5e` | selected backgrounds and subtle labels |
| `focus-ring` | `rgba(11,100,221,.22)` | `rgba(96,165,250,.28)` | keyboard focus |
| `overlay` | `rgba(14,27,53,.52)` | `rgba(0,0,0,.72)` | modal and drawer scrim |
| `success-bg` | `#e6f6ed` | `#123a2a` | success surface |
| `success-text` | `#166534` | `#b8f0ce` | success content |
| `warning-bg` | `#fff4d6` | `#493514` | pending and warning surface |
| `warning-text` | `#92400e` | `#f8d48a` | pending and warning content |
| `danger-bg` | `#fde9e7` | `#491c24` | destructive and error surface |
| `danger-text` | `#b42318` | `#ffc4c0` | destructive and error content |
| `information-bg` | `#e7f1ff` | `#102e5e` | information surface |
| `information-text` | `#0755bd` | `#a8caff` | information content |
| `qr-paper` | `#ffffff` | `#ffffff` | QR background, invariant |
| `qr-ink` | `#101820` | `#101820` | QR foreground, invariant |
| `image-scrim` | `rgba(8,16,31,.18)` | `rgba(0,0,0,.56)` | poster/backdrop overlays |

Green, amber, red and informational blue are semantic only. Cobalt is the only brand accent. Avoid neon status colors, arbitrary gradients and blurred glow halos.

## Typography

- Display family: `Space Grotesk, Inter, ui-sans-serif, system-ui, sans-serif`.
- UI/body family: `Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`.
- Customer hero: `clamp(3rem, 7vw, 6.5rem)`, line-height `.92`, weight `600–700`, tracking `-.055em`.
- Customer section title: `clamp(2rem, 4vw, 4rem)`, line-height `1`, tracking `-.045em`.
- Admin page title: `clamp(2rem, 3vw, 2.75rem)`, line-height `1`, tracking `-.045em`.
- Body: `14–16px`, line-height `1.45–1.6`.
- Table and metadata: `12–14px`; numbers use tabular figures.
- Eyebrow: `11–12px`, weight `700`, tracking `.16em`, cobalt or semantic tone.
- Do not use gradient text, decorative webfonts or all-caps paragraphs.

## Spacing, grid and shape

- Base spacing: `4, 8, 12, 16, 24, 32, 48, 64, 96px`.
- Customer max width: `1440px`; desktop outer gutter `32px`; mobile outer gutter `16px`.
- Admin content max width: `1440px`; sidebar remains stable on desktop.
- Desktop grid: 12 columns with 24px gutters.
- Mobile grid: 4 columns with 16px gutters.
- Technical tags: `4px` radius.
- Seats and compact controls: `8px` radius.
- Inputs, buttons and rows: `8–10px` radius.
- Cards and panels: `12–16px` radius.
- Dialogs: `16px` radius. Never exceed `24px`.
- Customer imagery may be edge-to-edge; admin surfaces remain structured and opaque.

## Layout direction

### Customer

- Use image-led editorial composition inspired by Standard Hotels and M+.
- Hero content may overlap or sit beside a large poster/backdrop, but copy must remain readable in both themes.
- Catalogue pages use clear index/filter hierarchy, not a generic SaaS bento dashboard.
- Movie detail prioritizes artwork, title, metadata, showtimes and the booking CTA.
- Booking and checkout emphasize a clear step hierarchy, persistent summary and visible time/payment state.
- Mobile uses restrained bottom navigation and vertically ordered actions.

### Admin

- Use Elastic and Highlight for grid, search and filter clarity; use Hex only for restrained metric composition.
- Sidebar navigation is stable on desktop; mobile uses a restrained drawer.
- Tables remain intentionally horizontally scrollable when data density requires it.
- Dashboard metrics, filters and recent activity use clear surface levels and aligned columns.
- Forms and dialogs are dense, technical and easy to scan; avoid decorative dashboard noise.

## Components and interaction

- Primary buttons use solid cobalt or a very restrained cobalt-to-deep-cobalt gradient only when needed for emphasis; no luminous outer glow.
- Secondary buttons use `surface-2` with `border`; hover raises the border to `brand`.
- Focus uses a visible `focus-ring` on every keyboard-interactive surface.
- Hover lifts stay at or below `3px`; transitions use `transform`, `opacity`, `background` and `border-color` over `.18–.24s`.
- Pressed buttons use `translateY(1px)`.
- Disabled controls use `opacity: .48` and `cursor: not-allowed`.
- Dialogs use a shared portal primitive with focus trap, Escape, scroll lock and focus restoration.
- Theme switching is immediate but restrained; do not animate every color property.
- Seats, statuses and payment states must communicate through label/icon/shape as well as color.
- QR paper/ink and print output remain high contrast in both themes.

## Required states

Every route and interactive surface must design and preserve:

- initial loading
- empty results
- API error with Vietnamese retry action
- mutation pending
- success feedback where useful
- hover and focus
- disabled and destructive states
- long Vietnamese copy and narrow viewport behavior

## Anti-patterns

- No glassmorphism, frosted translucent cards or oversized glow halos.
- No Tailwind or second UI library.
- No arbitrary per-component accent colors.
- No radius above 24px.
- No invented illustration when a poster, backdrop or existing media placeholder works.
- No visual-only controls that do not preserve existing behavior.
- No changes to API contracts, route paths, seat rules, booking timers or payment polling as part of the redesign.

## Verification workflow

1. Study Inspo references before substantial visual changes.
2. Create or update matching Stitch references before implementing each screen family.
3. Verify `system`, `light` and `dark` preference behavior, including reload and OS changes.
4. Test at `320`, `390`, `720`, `721`, `1024`, `1280` and `1440px`.
5. Verify loading, empty, error, hover, focus, disabled, booking and payment states in a real browser.
6. Run `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, `npm run test:fe`, `npm run test:e2e`, `npm run test:integration`, `npm run api:check` and `git diff --check`.
