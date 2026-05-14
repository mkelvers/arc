# Components Index

## Available Templates

| Component         | File                       | Purpose                                      |
| ----------------- | -------------------------- | -------------------------------------------- |
| Anime Card        | `anime_card.gohtml`        | Poster card with hover reveal                |
| Continue Watching | `continue_watching.gohtml` | Continue watching row                        |
| Dropdown          | `dropdown.gohtml`          | Dropdown wrapper (also uses `<ui-dropdown>`) |
| Filter Bar        | `filter_bar.gohtml`        | Search + filters for browse                  |
| Header            | `header.gohtml`            | Sticky header with nav                       |
| Navigation        | `navigation.gohtml`        | Sidebar navigation                           |
| Video Player      | `video_player.gohtml`      | Episode video container                      |
| Watchlist Actions | `watchlist_actions.gohtml` | Add/remove watchlist button                  |
| Watch Order       | `watch_order.gohtml`       | Watch order queue                            |

## Usage

All components are exposed as Go templates. Import by name:

```gohtml
{{template "anime_card" dict "Anime" .Data "WithActions" true}}
{{template "navigation" dict "CurrentPath" .CurrentPath}}
{{/* header removed */}}
```

## Props Convention

Components accept a `dict` with named keys:

- `dict "Key" .Value "Key2" .Value2`

This keeps prop names explicit and self-documenting.
