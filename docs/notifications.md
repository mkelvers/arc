# Notifications follow-up

Notifications are intentionally outside the watchlist implementation. This note records the product boundary for a later task.

## User interest

A user is interested in an anime when it is present in either their watchlist or Continue Watching history. Removing a watchlist entry must not remove interest while playback history still exists.

## Candidate events

- A new provider episode becomes available.
- An existing episode gains dubbed audio.
- A new related season or release becomes available.

Provider episode inventory and audio availability are playback truth. AniList and TMDB may enrich release identity and presentation, but must not independently create playback-availability notifications.

## Persistence boundary

A future user-owned `notification` table should retain:

- the user ID;
- a typed event kind;
- the AniList release ID and, when applicable, provider episode ID;
- a stable deduplication key;
- the observed source facts used to create the notification;
- creation and read timestamps.

Generation should happen when a scheduled provider refresh observes a durable state transition, not while a page is rendering. The write must be idempotent so repeated refreshes cannot notify the same user twice for the same event.
