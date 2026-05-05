---
name: MAL
description: Personal anime streaming & watchlist service
colors:
  background: "#080808"
  background-sidebar: "#0f0f0f"
  background-header: "#141414"
  background-surface: "#202020"
  background-button: "#1a1a1a"
  background-button-hover: "#252525"
  foreground-muted: "#6a6b70"
  foreground: "#f8f9fa"
  accent: "#9f7aea"
  danger: "#dc2626"
typography:
  body:
    fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  default: "6px"
spacing:
  sm: "0.25rem"
  md: "0.5rem"
  lg: "1rem"
  xl: "1.5rem"
  2xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#080808"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.background-button}"
    textColor: "{colors.foreground}"
    padding: "8px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.background-button-hover}"
---

# Design System: MAL

## 1. Overview

**Creative North Star: "The Personal Theater"**

A dark, intimate interface for watching anime. Built for long viewing sessions in low-light environments—think late-night streaming on a personal server. The aesthetic rejects the loud, gamified look of mainstream anime trackers. No flashy animations, no glassmorphism, no gradient text. Just content and controls.

**Key Characteristics:**
- Dark by default; light mode exists but is secondary
- Minimal chrome; the anime artwork carries the visual weight
- Purple accent used sparingly (<10% of any screen)
- No rounded corners; sharp edges throughout
- System fonts (DM Sans) for reliability across devices

## 2. Colors

The palette is intentionally restrained. Dark surfaces dominate to reduce eye strain during long sessions.

### Primary
- **Accent Purple** (`#9f7aea`): Navigation highlights, active states, primary actions. Used on active sidebar items, hover states on important buttons, current episode indicators.

### Neutral
- **Background** (`#080808`): Main page background. Deep black with a hint of warmth.
- **Background Sidebar** (`#0f0f0f`): Slightly elevated surface for navigation panel.
- **Background Header** (`#141414`): Sticky header surface, slightly brighter than page.
- **Background Surface** (`#202020`): Cards, dropdowns, search inputs.
- **Background Button** (`#1a1a1a`): Default button state, form fields.
- **Background Button Hover** (`#252525`): Button hover state.
- **Foreground Muted** (`#6a6b70`): Secondary text, icons, placeholders.
- **Foreground** (`#f8f9fa`): Primary text, headings.

### Named Rules
**The One Accent Rule.** Purple appears on ≤10% of any given screen. Its rarity is the point. Navigation highlights use a subtle left border; primary buttons use the accent background.

## 3. Typography

**Body Font:** DM Sans (with Segoe UI, system-ui fallbacks)

**Character:** Clean, legible, unremarkable. The typeface should be invisible—content first.

### Hierarchy
- **Title** (`600`, `20px`): Page headings.
- **Body** (`400`, `14px`): Standard text, descriptions.
- **Label** (`500`, `14px`, `0.025em`): Navigation items, buttons, form labels.
- **Small** (`400`, `12px`): Metadata, episode numbers, timestamps.

### Named Rules
**The Weight Contrast Rule.** Headings use `font-semibold` (600), body uses `font-normal` (400). Avoid flat weight hierarchies.

## 4. Elevation

**Flat by default.** No shadows at rest. Depth is conveyed through tonal layering—different background colors rather than shadow layers.

- **Hover state:** Background shifts from `#1a1a1a` to `#252525`.
- **Active states:** Subtle accent tint (`bg-accent/20`) or accent left border.
- **No shadows.** The interface is intentionally flat.

### Shadow Vocabulary
None used. If shadows are needed for overlays (modals, dropdowns), use `box-shadow: 0 8px 24px rgba(0,0,0,0.4)`.

## 5. Components

### Buttons
- **Shape:** No rounded corners (sharp edges).
- **Primary:** Purple background (`bg-accent`), dark text. Used for the most important action on each screen.
- **Secondary:** Dark background (`bg-white/5`), light text. Used for prev/next episode, filters.
- **Hover:** Background shifts lighter (`bg-white/10`). Transition duration 200ms.

### Cards / Anime Grid
- **Corner Style:** No radius. Square corners.
- **Background:** None at rest. Dark image placeholder (`bg-white/5`) behind anime poster.
- **Hover:** Overlay appears (`bg-black/80`) revealing title, synopsis, and watchlist button.
- **Internal Padding:** 12px (main content), 8px (card hover overlay).

### Navigation (Sidebar)
- **Style:** Fixed width (256px), collapsible to icons only.
- **Default:** Text in `foreground-muted` (`#6a6b70`), no background.
- **Hover:** `bg-white/5`.
- **Active:** Left accent border (`w-0.5 bg-accent`), accent text color. Subtle glow (`shadow-[0_0_8px_rgba(159,122,234,0.6)]`).

### Dropdowns
- **Background:** `#1a1a1a` with shadow.
- **No radius.** Sharp corners.
- **Items:** 12px vertical padding, hover `bg-white/10`.

### Input Fields
- **Style:** `bg-white/5`, `border-transparent`, 8px vertical padding.
- **Focus:** Border shifts to accent color (`focus:border-accent`).

### Toast Notifications
- **Style:** Monochromatic, no color coding by type.
- **Background:** `bg-white/10` with `border-white/20`.
- **No rounded corners.**

## 6. Do's and Don'ts

### Do:
- **Do** use accent purple for primary actions and active states only.
- **Do** keep interfaces dark by default—lighter backgrounds are for special emphasis only.
- **Do** use weight contrast (semibold headings, normal body) for hierarchy.
- **Do** reveal detail on hover (anime cards, navigation).
- **Do** include back buttons on detail pages.

### Don't:
- **Don't** use rounded corners anywhere.
- **Don't** use color to differentiate toast types—all toasts look the same.
- **Don't** use gradient text.
- **Don't** use glassmorphism (blur backgrounds, transparency effects).
- **Don't** use hero metric layouts (big number + small label).
- **Don't** use identical card grids with no visual variation.
- **Don't** use modals as a first thought—inline and progressive disclosure preferred.
- **Don't** use side-stripe borders (colored left/right borders on cards).
- **Don't** use the green accent—violet is the one and only accent.