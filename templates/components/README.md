# Components

Reusable Go template components.

## Available Templates

| Component         | File                       | Purpose                       |
| ----------------- | -------------------------- | ----------------------------- |
| Anime Card        | `anime_card.gohtml`        | Poster card with hover reveal |
| Continue Watching | `continue_watching.gohtml` | Continue watching row         |
| Filter Bar        | `filter_bar.gohtml`        | Search + filters for browse   |
| Navigation        | `navigation.gohtml`        | Sidebar navigation            |
| Video Player      | `video_player.gohtml`      | Episode video container       |
| Watchlist Actions | `watchlist_actions.gohtml` | Add/remove watchlist button   |
| Watch Order       | `watch_order.gohtml`       | Watch order queue             |

## Usage

Components are rendered with `{{template "name" .}}`. Props follow a keyword convention:

```gohtml
{{template "anime_card" dict "Anime" .Data "WithActions" true}}
{{template "navigation" dict "CurrentPath" .CurrentPath}}
```

## Props Convention

Components receive a `dict` with named keys — no positional arguments, no implicit state.

```
dict "Key" .Value "Key2" .Value2
```

## Adding a component

1. Create `<name>.gohtml` in this directory.
2. Register it in `template_fs.go` if not already picked up by the embed glob.
3. Wire it into the page template.
