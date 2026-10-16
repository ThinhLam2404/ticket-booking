# CineBook — Cinematic Minimal Design System

Design conventions for the ticket-booking frontend (`fe/`). The current visual direction is **CineBook Cinematic Minimal**: image-led movie discovery for customers and a precise operations workspace for admins. It takes composition cues from the MUBI and Criterion references in Inspo, then applies a restrained Cinema Copper action accent and the data clarity of Elastic, Highlight and Hex. The design is intentionally simple: posters and backdrops create emotion, while copper marks actions and selection.

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

The palette uses a restrained Cinema Copper on dark cinema surfaces and a Bordeaux Berry accent on light surfaces. Light mode is a cool paper workspace; dark mode is a deep blue-black cinema surface. Do not swap colors mechanically: preserve semantic roles and contrast. The warm/berry brand accents are reserved for actions and selection; green, amber, red and informational blue remain semantic only.

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
| `brand` | `#7b304b` | `#b86f4c` | primary action, links and selection |
| `brand-deep` | `#60233a` | `#934b2b` | pressed and deep brand state |
| `brand-hover` | `#8f3e5d` | `#c78462` | hover state |
| `brand-soft` | `#f5e8ee` | `#102e5e` | selected backgrounds and subtle labels |
| `on-accent` | `#ffffff` | `#ffffff` | text and icons on brand surfaces |
| `focus-ring` | `rgba(123,48,75,.24)` | `rgba(199,132,98,.3)` | keyboard focus |
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

Green, amber, red and informational blue are semantic only. Cinema Copper is the only brand accent. Avoid neon status colors, arbitrary gradients and blurred glow halos.

## Typography

- Display family: `Space Grotesk, Inter, ui-sans-serif, system-ui, sans-serif`.
- UI/body family: `Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`.
- Customer hero: `clamp(3rem, 7vw, 6.5rem)`, line-height `.92`, weight `600–700`, tracking `-.055em`.
- Customer section title: `clamp(2rem, 4vw, 4rem)`, line-height `1`, tracking `-.045em`.
- Admin page title: `clamp(2rem, 3vw, 2.75rem)`, line-height `1`, tracking `-.045em`.
- Body: `14–16px`, line-height `1.45–1.6`.
- Table and metadata: `12–14px`; numbers use tabular figures.
- Eyebrow: `11–12px`, weight `700`, tracking `.16em`, Cinema Copper or semantic tone.
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

- Use **Cinematic Minimal** composition: a poster/backdrop should establish mood, but the first viewport must also expose the film title, metadata and a clear booking action.
- Use MUBI as the primary reference for movie detail: image-led hierarchy, restrained typography and showtimes close to the film context. Use Criterion as a secondary reference for a single focused home hero, not for full-screen streaming chrome.
- The home page order is: compact header, featured film, quick booking, catalogue tabs, then supporting content. Do not let a decorative hero push the booking controls too far below the fold.
- Catalogue pages use clear index/filter hierarchy, not a generic SaaS bento dashboard. Poster cards keep actions and availability legible at a glance.
- Movie detail prioritizes artwork, title, metadata, showtimes and the booking CTA. Trailer is secondary and disabled clearly when unavailable.
- Booking and checkout emphasize a clear step hierarchy, persistent summary and visible time/payment state. Keep the seat map or payment state as the visual focus of its step.
- Mobile uses restrained bottom navigation and vertically ordered actions. Use two poster columns when the viewport supports it; use one column for dense operational content.

### Admin

- Use Elastic as the primary reference for grid, search, filter and data clarity; use Highlight and Hex only for restrained metric composition.
- Sidebar navigation is stable on desktop; mobile uses a restrained drawer with the same information architecture.
- Tables remain intentionally horizontally scrollable when data density requires it; never hide critical columns to force a card layout.
- Dashboard metrics, filters and recent activity use clear surface levels, aligned columns and concise labels. Status colors communicate operational meaning only.
- Forms and dialogs are dense, technical and easy to scan; avoid decorative dashboard noise and oversized gradients.

### Reference study

- Inspo references: MUBI (`mubi-com--en-ar-films-rec`), Criterion (`criterion-com`) and Elastic (`elastic-co--cloud`).
- MUBI reference: [desktop](https://0nme3pk5am3urwa9.public.blob.vercel-storage.com/captures/mubi-com--en-ar-films-rec/hero.1440.webp) · [mobile](https://0nme3pk5am3urwa9.public.blob.vercel-storage.com/captures/mubi-com--en-ar-films-rec/mobile.384.webp).
- Criterion reference: [desktop](https://0nme3pk5am3urwa9.public.blob.vercel-storage.com/captures/criterion-com/hero.1440.webp) · [mobile](https://0nme3pk5am3urwa9.public.blob.vercel-storage.com/captures/criterion-com/mobile.384.webp).
- Elastic reference: [full capture](https://0nme3pk5am3urwa9.public.blob.vercel-storage.com/captures/elastic-co--cloud/full.1440.webp).
- These are composition references only. CineBook keeps its own Vietnamese copy, Cinema Copper accent, Space Grotesk + Inter typography, accessibility rules and product behavior.

## Components and interaction

- Primary buttons use solid Cinema Copper or a very restrained copper-to-deep-copper treatment only when needed for emphasis; no luminous outer glow.
- Secondary buttons use `surface-2` with `border`; hover raises the border to `brand`.
- Focus uses a visible `focus-ring` on every keyboard-interactive surface.
- Every accent-filled interactive surface uses `on-accent` for text/icons in default, hover, focus and selected states. This includes primary actions, movie-card purchase links, active filters/dates, chosen seats, payment logos and auth marks.
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

## Stitch synchronization

- Canonical Stitch project: `projects/17571770747423594898` (`CineBook Cinematic Minimal`).
- Canonical design system: `assets/16221615337981433871` (`CineBook Cinematic Minimal`, Space Grotesk + Inter, Cinema Copper `#b86f4c`).
- Reference screens generated with that system:
  - Desktop home: `projects/17571770747423594898/screens/1d57fea6404e4eb19e73753e8a37e4ab`.
  - Mobile home: `projects/17571770747423594898/screens/83109faeb52c4c88bd2d3a7bb78a0d4b`.
- The previous Stitch project `projects/5412677534890310186` was deleted so stale Cobalt, Amber and Violet screens are no longer canonical.

## Verification workflow

1. Study Inspo references before substantial visual changes.
2. Create or update matching Stitch references before implementing each screen family.
3. Verify `system`, `light` and `dark` preference behavior, including reload and OS changes.
4. Test at `320`, `390`, `720`, `721`, `1024`, `1280` and `1440px`.
5. Verify loading, empty, error, hover, focus, disabled, booking and payment states in a real browser.
6. Run `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, `npm run test:fe`, `npm run test:e2e`, `npm run test:integration`, `npm run api:check` and `git diff --check`.
