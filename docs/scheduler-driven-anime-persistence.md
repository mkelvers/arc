# Scheduler-driven anime persistence

- Status: stages 1–5 implemented; contract deployment pending production verification
- Date: 2026-08-24
- Issue: [#18](https://github.com/mkelvers/arc/issues/18)

## Decision

Arc will replace disposable AniList response caches with permanent, validated anime release records. Pages will read those records without waiting for AniList. AniList is contacted when Arc first encounters an unknown release and in small, deliberate updates while an interested release is upcoming or airing.

A durable PostgreSQL scheduler will own episode discovery for airing anime. It will track releases that are relevant through a user's watchlist or Continue Watching history, ask playback providers whether the target episode is available, persist confirmed episodes, and notify open pages through a database revision change.

The scheduler is the normal owner of airing updates. Page reads do not need to contact AniList or playback providers to make the episode appear.

## Scope

This project covers:

- permanent AniList release metadata;
- migration of release-oriented consumers away from `anime_details_cache` and `anime_card_cache`;
- watchlist and Continue Watching interest discovery;
- durable scheduling, leases, retries, and recovery for airing episodes;
- provider-confirmed episode writes; and
- automatic episode-list updates on an already-open anime page.

It does not cover:

- notifications or a separate notification-interest source;
- replacement of TMDB, artwork, home, browse, or simulcast caches;
- proactive tracking of every airing anime Arc knows about; or
- optimistic display of an episode before a playback provider confirms it.

`anilist_query_cache` remains the owner for the explicitly excluded query workloads: home, browse, simulcast, taxonomy/query data, franchise queries, and other out-of-scope query caching. “Remove the AniList cache dependency” in this project means removing the migrated release consumers' dependency on the two redundant release-cache tables; it does not mean deleting every cache associated with AniList.

## Permanent records, not expiring cache entries

Arc currently stores much of the complete AniList release shape in tables named `*_cache`. Those rows cannot be deleted before their useful data has another owner. In particular, `anime_details_cache` currently contains substantially more release information than the base `anime` table.

The migration must therefore use an expand-backfill-switch-contract rollout:

1. Add a permanent release record for the validated AniList fields Arc uses.
2. Backfill it from valid stored details, cards, and catalog rows.
3. Change page, watchlist, search, and scheduler consumers to read the permanent record.
4. Keep malformed external JSON fail-closed, but never reject a usable record merely because it is old.
5. Stop release-oriented consumers from reading the redundant release caches, but retain the tables until the production lifecycle has been verified and a later contract deployment is approved.

The exact database name is an implementation decision, but it must describe owned release data rather than disposable cache data. Source timestamps and schema revisions remain useful for auditing and repair; they do not make a record ineligible for display.

### First contact

When Arc encounters an AniList release ID with no permanent record, it makes a deduplicated, rate-limited AniList request and stores the validated result. This is the unavoidable first-contact request. Concurrent requests for the same ID must share one operation.

Once stored, all page reads use PostgreSQL. Finished releases do not receive routine metadata refreshes. A manual repair operation remains available for corrections or a bad mapping.

Upcoming and airing releases remain mutable. Arc uses a small AniList request when it needs the next airing time or current release status; it does not repeatedly download the same release metadata during ordinary page loads.

## Scheduler interest

The scheduler derives interest from only two product features:

- a user's watchlist; and
- a user's Continue Watching history.

There is no separate notification-interest list in this design.

Interest in one release expands to currently upcoming or airing releases in the same main-story continuity chain. Arc should reuse the existing primary-franchise selection rule based on AniList/MAL `PREQUEL` and `SEQUEL` relationships. This includes a main-story movie connected through that chain. It excludes recap movies, summaries, spin-offs, side stories, alternatives, and unrelated specials.

The scheduler tracks a release only while at least one user has qualifying interest in that continuity chain. Watchlist and playback-progress mutations should update interest promptly, and a periodic reconciliation should repair missed or interrupted mutations. When no qualifying interest remains, pending work for that release is retired. If interest returns later, scheduling resumes from the persisted release and episode state.

Qualifying watchlist states are `watching`, `plan_to_watch`, and `completed` (plus any future paused state); `dropped` is excluded. Continue Watching qualifies only while its playback-progress row is not dismissed. The dirty marker is committed in the same PostgreSQL transaction as each watchlist or playback mutation. The five-minute worker consumes dirty work, while a full reconciliation runs at least hourly as a repair path.

## Durable episode scheduling

Scheduling state belongs in PostgreSQL so process restarts cannot lose it. A scheduled target needs enough state to explain and recover its lifecycle, including:

- AniList release ID and target episode number;
- expected episode count when known;
- next airing time;
- first scheduled time and next attempt time;
- attempt and failure counts plus the last error;
- lease owner and lease expiry;
- whether the target is pending, confirmed, or retired; and
- the stored episode inventory revision.

Only one worker may hold a target lease at a time. Expired leases must be recoverable, and active work renews its lease. Each invocation claims no more than 25 targets, runs at concurrency 3, and stops claiming after four minutes. The initial lease is ten minutes and renews every three minutes. These operational values are validated server-side configuration; the release semantics remain code policy. Provider and AniList requests remain globally rate-limited and deduplicated.

### Release window and retries

For an interested airing release, checks occur 30 minutes before airing, at airing time, then at +5, +15, +30 minutes, +1, +3, +6, +12, and +24 hours, followed by one check per 24 hours. Automatic retries stop 14 days after the scheduled airing time and leave an observable, repairable failed target.

Provider inventory is playback truth. The scheduler confirms success only when a provider returns the exact target episode as usable inventory. A timeout, rate limit, provider error, or inventory that still lacks the target is not success.

If the target is still unavailable at midnight, Arc keeps trying with decreasing frequency for several days. The work remains durable across restarts and deployments. Retry limits should end in an observable failed state that can be repaired; they must not silently mark the episode as released.

### Confirmation transaction

When the provider confirms the target episode, Arc performs one database transaction that:

1. upserts the provider episode inventory and available metadata;
2. advances the stored inventory revision;
3. marks that target confirmed so it cannot be processed again; and
4. clears its retry and lease state.

Arc then makes one small AniList request to learn the next airing episode/time and current status. If another episode is scheduled, Arc creates the next durable target. If the release is finished, the scheduler retires it. Reaching the expected episode count alone is not enough to invent a finished status when AniList is unavailable; Arc should retry that status check separately.

## Open-page updates

An open anime page checks Arc's database-backed episode revision endpoint. When the revision changes, the frontend invalidates and reloads only the episode data. It does not call AniList or a playback provider.

This is confirmed reactive UI, not optimistic UI: the new episode appears automatically after the scheduler verifies and stores it, never before provider confirmation. Arc already has the revision endpoint and visible-page polling behavior; the scheduler supplies the durable producer currently missing from that flow.

## Host scheduler deployment

The production scheduler is a dedicated `apps/scheduler` Bun artifact. A persistent Linux host owns the OS crontab entry; the Arc API remains in Docker and does not install, remove, supervise, or own the host job.

```text
Persistent Linux host
├── OS crontab
│   └── Arc scheduler every 5 minutes
└── Docker
    └── Arc API
```

On the host, place scheduler-only configuration in `apps/scheduler/.env`, then run:

```sh
bun run scheduler:install
bun run scheduler:remove
```

Installation builds the production worker, loads and validates the `.env` resolved relative to the scheduler package/compiled artifact (never the cron process working directory), verifies PostgreSQL connectivity, and idempotently registers absolute `dist/worker.js` with title `arc-anime-scheduler` and schedule `*/5 * * * *`. No secrets are written into the crontab. Removal uses the stable title and is idempotent.

## Operator maintenance

Server-only routes under `/v1/internal/maintenance` require the server-side `ARC_MAINTENANCE_TOKEN`. Valid release refresh, mapping rediscovery, explicit mapping override, failed-target reactivation, and forced reconciliation requests persist a durable task and return `202 Accepted`; the scheduler claims the task with the same renewable lease and retry model.

Playback and TMDB overrides use a closed request union, validate the selected identity, retain bounded evidence and the previous mapping, and record maintenance-token provenance without storing the token. A valid operator override outranks automatic discovery until an operator replaces or clears it.

The protected health route returns `503` when no invocation has succeeded within 15 minutes, a later failure has not been followed by success, full reconciliation is older than two hours, or scheduler state cannot be read from PostgreSQL. Individual failed targets remain observable but do not make the whole scheduler unhealthy.

## Failure behavior

- AniList outage on first contact: the unknown release remains pending and retries later; Arc does not fabricate metadata.
- AniList outage after an episode is confirmed: keep the confirmed episode and retry discovery of the next airing time separately.
- Provider outage or publication delay: preserve stored episodes and retry the target later.
- Scheduler outage: existing data remains usable; expired leases and due targets resume when the scheduler recovers.
- Malformed stored external data: fail closed and repair it; age alone is never corruption.
- Manual repair: an operator can refresh a frozen finished release, repair a mapping, or reactivate failed work without deleting otherwise usable data.

## Rollout stages

1. Introduce and backfill permanent AniList release records without removing current reads.
2. Switch watchlist and dynamic anime-page reads to the permanent records and verify first-contact behavior.
3. Add interest derivation for watchlist and Continue Watching, including main-story sequel and connected-movie expansion.
4. Add the durable PostgreSQL scheduler, leases, retry policy, reconciliation, and health evidence.
5. Connect confirmed episode writes to the existing revision-based frontend refresh.
6. Verify the complete airing lifecycle in production, then use a separate contract deployment to drop the obsolete release-cache tables. This stage has not occurred.

Stages 1–5 are implemented by this project. Each stage preserves usable stored data and remains rollback-safe. The legacy release-cache tables are deliberately retained; this implementation does not claim that the production lifecycle has been verified.

## Acceptance criteria

- A known anime page can render its stored AniList metadata with zero AniList requests.
- An unknown AniList ID causes one deduplicated first-contact fetch and becomes a permanent record.
- Finished releases remain readable indefinitely and receive no routine automatic metadata refresh.
- Manual repair can update a finished release when necessary.
- Watchlist and Continue Watching are the only direct interest sources.
- Interest in an earlier season tracks an upcoming or airing main-story sequel, including a connected continuation movie, while excluding recap and side-story branches.
- A release with no remaining qualifying user interest is retired from active scheduling.
- Due work survives restarts and cannot be processed concurrently by multiple workers.
- Missing episodes continue retrying beyond their airing day with bounded backoff.
- Only provider-confirmed episodes are written as available.
- Confirmation advances the inventory revision once and closes the completed target.
- Arc uses a small AniList update after confirmation to obtain the next airing time or finished status.
- An already-open anime page displays the confirmed episode without a browser refresh and without triggering provider or AniList work.
- AniList, provider, and scheduler failures never delete or hide usable stored data.

## Consequences

This design makes Arc less dependent on AniList availability and removes upstream work from ordinary page loads. It also gives airing updates a durable, observable owner.

The cost is additional scheduler infrastructure, permanent database growth, franchise-interest reconciliation, retry and lease policy, and an explicit migration away from cache-shaped storage. Stored finished metadata may remain incorrect until manually repaired, which is an intentional tradeoff for stability and low request volume.
