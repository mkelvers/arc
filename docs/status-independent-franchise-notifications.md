# Status-independent franchise notifications

## Goal

Notify users about future sequel seasons and playable episodes without requiring the latest season to be added to their watchlist or changing their AniList status.

## Existing foundations

Arc already has:

- A durable maintenance scheduler.
- Watchlist and playback-based interest collection.
- AniList airing-schedule queries.
- Database-backed episode refresh jobs.
- Provider availability verification.
- Retry, leasing, and health-check behavior.

## Plan

1. Treat every watchlist entry and non-dismissed playback entry as a franchise root, regardless of status.
2. Traverse AniList `SEQUEL` relationships recursively and cache the results.
3. Persist which users are interested in each descendant release.
4. Feed those descendant IDs into the existing airing scanner.
5. After an episode airs, use the existing provider refresh queue to confirm it is actually playable.
6. Store a deduplicated notification only after that confirmation.
7. Merge these Arc-owned notifications into the inbox.

Recent page visits must not create permanent franchise subscriptions. Only watchlist entries and genuine playback history establish durable interest.

## Result

- Any prequel in any watchlist state covers future sequel seasons.
- The sequel is not added to the watchlist and does not alter it.
- AniList statuses are not manipulated.
- Arc distinguishes an episode airing from an episode being available to watch.
- Scheduled reconciliation catches events missed during downtime.

## Source boundary

Notifications would no longer come purely from AniList's notification query. AniList owns franchise identity and airing schedules; Arc's playback providers confirm actual availability.
