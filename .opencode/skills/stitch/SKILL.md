---
name: stitch
description: Use when designing, generating, editing, or reviewing UI screens with Google Stitch (stitch.withgoogle.com). Drives the Stitch MCP tools against the CineBook brand: upload DESIGN.md, create/apply the CineBook design system, generate desktop + mobile screens, export HTML and screenshots, then hand the design to implementation in fe/. Also use when the user mentions Stitch, generates screens/variants, or asks to "thiết kế giao diện bằng Stitch".
---

# Stitch design workflow (CineBook)

Turn Google Stitch into the brand-aware screen generator for this repo. Stitch
produces HTML/CSS screens from prompts; taste still comes from the design
context you feed it — same principle as the `design` skill, enforced before
generation.

## Non-negotiable rules (from DESIGN.md)

- Before any generation, read `DESIGN.md` and keep the CineBook tokens intact:
  one accent `#7c3aed`, obsidian bg `#141312`, one typeface (Inter), radius ≤
  28px, restrained motion. Use the Stitch CTA gradient only for primary
  actions; no gradient text or glassmorphism.
- All UI copy in screens is **Vietnamese** (brand + placeholders may stay as-is).
- Generate at least **desktop and mobile** — never a single hero shot.
- Cinestar is the structural reference only: quick-booking steps
  (Rạp → Phim → Ngày → Suất chiếu), hero film, "Phim đang chiếu" grid. Do not
  copy Cinestar branding or images into committed assets.

## Workflow

1. **Ensure a CineBook project + design system exist in Stitch.**
   - `list_projects` → find/create "CineBook Cinema Ticket Booking".
   - If no design system is bound to the project, `upload_design_md` with
     `DESIGN.md` (base64 of the file), then
     `create_design_system_from_design_md` on the resulting screen instance,
     then `apply_design_system` to the target screen.
   - `get_project` and `list_assets` to read the designSystem id; pass it to
     every `generate_screen_from_text` call (`designSystem` param).
2. **Prompt with concrete constraints** — reference the CineBook tokens, the
   section order, and the interaction states. Two-three sentences minimum;
   vague prompts produce generic output. Example:
> "Trang chủ đặt vé phim CineBook, nền obsidian #141312, accent violet
    > #7c3aed với CTA gradient #6d28d9, font Inter. Header ẩn khi cuộn xuống,
    > thu gọn khi cuộn lên.
   > Hero phim + form Đặt vé nhanh (Rạp, Phim, Ngày, Suất) + lưới Phim đang
   > chiếu."
3. **Generate desktop first, mobile second** (`deviceType: DESKTOP|MOBILE`).
4. **Inspect the result** — `get_screen` / `list_screens`, export HTML and
   screenshot, compare against the design intent (token drift, missing states,
   broken mobile layout). Iterate with `edit_screens` or a new `generate`.
5. **Hand off to implementation** — download exported HTML/assets into
   `fe/` (or keep the screenshots in `designs/` as references) and follow the
   `design` skill + DESIGN.md when porting the screen into `App.css`.

## Notes

- Design work then implementation: get the screen right in Stitch FIRST, then
  port. Do not port half-finished screens.
- The Stitch MCP is `stitch`; refer to it by name when prompting.
- Keys/credentials live in `.stitch-key` (gitignored) — never print or commit
  the key.