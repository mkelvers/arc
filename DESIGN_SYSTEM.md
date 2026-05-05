# MAL Design System

## Overview

This design system is for the MAL anime streaming service. It provides reusable components, design tokens, and patterns for building consistent UI.

## Design Tokens

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--color-background` | `#080808` | Main page background |
| `--color-background-sidebar` | `#0f0f0f` | Sidebar background |
| `--color-background-header` | `#141414` | Sticky header |
| `--color-background-surface` | `#202020` | Cards, dropdowns |
| `--color-background-button` | `#1a1a1a` | Button default state |
| `--color-background-button-hover` | `#252525` | Button hover state |
| `--color-foreground-muted` | `#6a6b70` | Secondary text, icons |
| `--color-foreground` | `#f8f9fa` | Primary text |
| `--color-accent` | `#9f7aea` | Primary accent (violet) |
| `--color-danger` | `#dc2626` | Error states, delete actions |

### Typography

| Role | Font | Size | Weight |
|------|------|------|--------|
| Title | DM Sans | 20px | 600 |
| Body | DM Sans | 14px | 400 |
| Label | DM Sans | 14px | 500 |
| Small | DM Sans | 12px | 400 |

### Spacing

| Token | Value |
|-------|-------|
| `--space-1` | 0.25rem |
| `--space-2` | 0.5rem |
| `--space-3` | 0.75rem |
| `--space-4` | 1rem |
| `--space-5` | 1.25rem |
| `--space-6` | 1.5rem |
| `--space-8` | 2rem |

## Components

### 1. Anime Card (`anime_card.gohtml`)

A poster card with hover reveal.

**Usage:**
```gohtml
{{template "anime_card" dict "Anime" . "WithActions" true "IsWatchlist" false}}
```

**Props:**
- `Anime` - Anime data object
- `WithActions` - Show hover overlay with actions (bool)
- `IsWatchlist` - Show in-watchlist state (bool)
- `Compact` - Hide metadata below (bool)
- `HideTitle` - Hide title below image (bool)
- `HasTopBadge` - Adjust overlay padding for badge (bool)

**States:**
- Default: Image with subtle dark placeholder
- Hover: Black overlay (80%) reveals title, synopsis, watchlist button

### 2. Navigation (`navigation.gohtml`)

Sidebar navigation with active indicator.

**Usage:**
```gohtml
{{template "navigation" dict "CurrentPath" .CurrentPath}}
```

**Props:**
- `CurrentPath` - Current page path for active state

**Items:**
- Home (`/`)
- Browse (`/browse`)
- Discover (`/discover`)
- Watchlist (`/watchlist`)

**States:**
- Default: Muted gray text
- Hover: `bg-white/5`
- Active: Accent text + left border (`w-0.5 bg-accent`) + subtle glow

### 3. Dropdown (`dropdown.gohtml`)

Custom dropdown using `<ui-dropdown>` web component.

**Usage:**
```gohtml
<ui-dropdown class="relative block" data-align="left" data-width="w-48">
  <div data-trigger>
    <button>Trigger</button>
  </div>
  <div data-content class="hidden absolute ...">
    <button>Option 1</button>
    <button>Option 2</button>
  </div>
</ui-dropdown>
```

**Attributes:**
- `data-align` - `left` or `right` alignment
- `data-width` - Width (Tailwind class)

**Styling:**
- Background: `#1a1a1a`
- No border radius
- Items: 10px vertical padding, hover `bg-white/10`

### 4. Filter Bar (`filter_bar.gohtml`)

Search and filter controls for browse page.

**Usage:**
```gohtml
{{template "filter_bar" .}}
```

**Controls:**
- Search input (text)
- Genre dropdown (multi-select)
- Status dropdown (airing, complete, upcoming)
- Type dropdown (tv, movie, ova, special, ona)
- Sort dropdown + order toggle

### 5. Header (`header.gohtml`)

Sticky header with logo, search, and user menu.

**Usage:**
```gohtml
{{template "header" .}}
```

**Sections:**
- Left: Mobile menu toggle, sidebar toggle, logo
- Center: Search input (desktop only)
- Right: User avatar dropdown

### 6. Watchlist Actions (`watchlist_actions.gohtml`)

Watchlist toggle button.

**Usage:**
```gohtml
{{template "watchlist_actions" dict "MalID" 123 "IsWatchlist" true}}
```

**Props:**
- `MalID` - Anime MAL ID
- `IsWatchlist` - Current state

**States:**
- Not in watchlist: Outline icon, accent on hover
- In watchlist: Filled icon (`fill: currentColor`)

### 7. Video Player (`video_player.gohtml`)

Video player container for episodes.

**Usage:**
```gohtml
{{template "video_player" dict "WatchData" .WatchData "TotalEpisodes" .Anime.Episodes}}
```

**Props:**
- `WatchData` - Video source data
- `TotalEpisodes` - Total episode count

### 8. Continue Watching (`continue_watching.gohtml`)

Horizontal row for continue watching section.

**Usage:**
```gohtml
{{template "continue_watching" .ContinueWatching}}
```

**Props:**
- Array of anime with watch progress

## Patterns

### Button Variants

**Primary:**
```html
<button class="bg-accent text-black px-4 py-2">Action</button>
```

**Secondary:**
```html
<button class="bg-white/5 text-neutral-300 px-4 py-2 hover:bg-white/10">Action</button>
```

**Danger:**
```html
<button class="bg-red-500/10 text-red-400 px-4 py-2 hover:bg-red-500/20">Delete</button>
```

### Empty State

```html
<div class="flex flex-col items-center justify-center gap-4 py-24">
  <svg class="h-16 w-16 opacity-30">...</svg>
  <p class="text-neutral-300 font-medium">Title</p>
  <p class="text-neutral-500 text-sm">Description</p>
  <div class="flex gap-3 mt-2">
    <a class="bg-accent/20 text-accent px-5 py-2.5">Action</a>
    <a class="bg-white/10 text-neutral-200 px-5 py-2.5">Secondary</a>
  </div>
</div>
```

### Card Grid

```html
<div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
  <!-- Cards -->
</div>
```

### Episode List Item

```html
<a class="flex items-center gap-3 px-3 py-2 hover:bg-white/5 border-l-2 {{if .Filler}}border-l-yellow-500{{end}} {{if .Recap}}border-l-blue-500{{end}} {{if $isCurrent}}bg-accent/20{{end}}">
  <span class="w-10 shrink-0 text-xs font-medium text-neutral-500">EP{{.MalID}}</span>
  <span class="truncate text-sm text-neutral-300">{{.Title}}</span>
</a>
```

## Migration Guide

### Adding a New Component

1. Create template in `templates/components/`
2. Document props and usage in this file
3. Add to component index above

### Updating Existing Components

1. Make changes in `templates/components/`
2. Update this documentation
3. Test across all usage sites

### Design Token Changes

1. Update in `static/style.css`
2. Update YAML frontmatter in `DESIGN.md`
3. Update this token reference