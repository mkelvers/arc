# Scheduler-driven anime persistence

- Status: stages 1–5 implemented; contract deployment pending production verification
- Date: 2026-08-24
- Issue: [#18](https://github.com/mkelvers/arc/issues/18)

## Decision

Arc will replace disposable AniList response caches with permanent, validated anime release records. Pages will read those records without waiting for AniList. AniList is contacted when Arc first encounters an unknown release and in small, deliberate scheduler updates for releases AniList currently identifies as airing.

A durable PostgreSQL scheduler will own episode discovery for every currently airing anime, independent of watchlist or Continue Watching activity. It asks playback providers whether an exact due episode is available, persists confirmed inventory, and notifies open pages through a database revision change.

The scheduler is the normal owner of airing updates. Page reads do not contact AniList or playback providers for an airing release. A finished release whose historical inventory was never migrated performs one deduplicated provider discovery, then reads its persisted inventory thereafter.

## Scope

This project covers:

- permanent AniList release metadata;
- migration of release-oriented consumers away from `anime_details_cache` and `anime_card_cache`;
- hourly global discovery of AniList releases with `RELEASING` status;
- durable scheduling, leases, retries, and recovery for airing episodes;
- provider-confirmed episode writes; and
- automatic episode-list updates on an already-open anime page.

It does not cover:

- proactive tracking of every announced future `NOT_YET_RELEASED` anime;
- replacement of TMDB, artwork, home, browse, or simulcast caches;
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

Permanent release metadata and provider-confirmed episode inventory are separate owned records. The rollout therefore also repairs finished releases whose metadata was backfilled while their historical episode rows were absent or incomplete. The scheduler idempotently seeds durable `episode_backfill` maintenance tasks from PostgreSQL and drains them with its normal bounded concurrency, leases, retries, and failure visibility. Seeding performs no external request. For ordinary releases with a known AniList episode total, the discovery remains retryable until the persisted provider inventory reaches that total; `TV_SHORT` segment totals are deliberately excluded from this comparison.

If one of those finished pages is opened before its task runs, the page performs the same provider discovery synchronously. Concurrent requests for that AniList ID share the operation. Success persists the inventory and completes any pending task, preventing a later duplicate provider request; failure leaves durable retry work and preserves the existing retryable page error. AniList is read only when the permanent release record itself is missing.

## Global airing coverage

Once per hour, the scheduler pages through AniList's complete `RELEASING` anime set. For each release it records exact targets for both the latest already-aired episode and the next scheduled episode when AniList provides those schedule entries. This catches a missed episode even when AniList has already advanced `nextAiringEpisode`. Schedules longer than 50 episodes fetch the page containing the latest aired episode so long-running releases are not truncated.

An airing release with no permanent record is placed in the durable first-contact queue. The normal five-minute worker drains that queue with bounded concurrency instead of fetching every newly discovered title at once. A stored schedule that disappeared from the global `RELEASING` result is also queued for a full status refresh so finished or cancelled releases stop producing new targets.

Watchlist and Continue Watching remain ordinary product features, but they no longer control scheduler eligibility and their mutations do not write scheduler dirty work. Existing interest tables are retained only as rollout-compatible schema until a later contract deployment; the scheduler does not read them. Between hourly reconciliations, a five-minute tick does not repeat global AniList discovery. It performs an idempotent local PostgreSQL check for unseeded historical inventory, then drains durable first-contact, maintenance, and actually due episode work.

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

For an exact airing target, checks occur 30 minutes before airing, at airing time, then at +5, +15, +30 minutes, +1, +3, +6, +12, and +24 hours, followed by one check per 24 hours. Automatic retries stop 14 days after the scheduled airing time and leave an observable, repairable failed target.

Provider inventory is playback truth. The scheduler confirms success only when a provider returns the exact target episode as usable inventory. A timeout, rate limit, provider error, or inventory that still lacks the target is not success.

Arc checks for the exact target immediately after provider inventory returns. It does not call AnimeFillerList or TMDB for a target that the provider has not released. If the exact episode is already present in Arc's provider-confirmed inventory when reconciliation runs, Arc records the target as confirmed without another provider request. The global snapshot already supplies the next target, so reconciliation does not queue a redundant per-release AniList request.

If the target is still unavailable at midnight, Arc keeps trying with decreasing frequency for several days. The work remains durable across restarts and deployments. Retry limits should end in an observable failed state that can be repaired; they must not silently mark the episode as released.

### Confirmation transaction

When the provider confirms the target episode, Arc performs one database transaction that:

1. upserts the provider episode inventory and available metadata;
2. uses the durable target's AniList airing day for the confirmed episode's displayed release date, rather than a later TMDB broadcast date;
3. advances the stored inventory revision;
4. marks that target confirmed so it cannot be processed again; and
5. clears its retry and lease state.

Arc then makes one small AniList request to learn the next airing episode/time and current status. If another episode is scheduled, Arc creates the next durable target. If the release is finished, the scheduler creates no new target. Reaching the expected episode count alone is not enough to invent a finished status when AniList is unavailable; Arc retries that status check separately.

## Open-page updates

An open releasing-anime page checks Arc's database-backed page revision endpoint once per minute while visible. The revision covers both provider inventory and the stored AniList schedule, so a confirmed or repaired episode and the following airing time can each invalidate stale page data even when the next scheduled episode is days away. The revision check is a PostgreSQL read; it never calls AniList or a playback provider, and unchanged revisions do not reload page data.

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
3. Add global airing discovery and exact latest-aired/next-episode target reconciliation independent of user activity.
4. Add the durable PostgreSQL scheduler, leases, retry policy, reconciliation, and health evidence.
5. Connect confirmed episode writes to the existing revision-based frontend refresh.
6. Verify the complete airing lifecycle in production, then use a separate contract deployment to drop the obsolete release-cache tables. This stage has not occurred.

Stages 1–5 are implemented by this project. Each stage preserves usable stored data and remains rollback-safe. The legacy release-cache tables are deliberately retained; this implementation does not claim that the production lifecycle has been verified.

## Acceptance criteria

- A known anime page can render its stored AniList metadata with zero AniList requests.
- An unknown AniList ID causes one deduplicated first-contact fetch and becomes a permanent record.
- Finished releases remain readable indefinitely and receive no routine automatic metadata refresh.
- A finished release with missing or incomplete historical episode inventory receives one deduplicated provider discovery, persists the result, and leaves durable retry work on failure.
- Scheduler seeding of historical inventory performs no AniList or provider request and cannot enqueue duplicate work.
- Manual repair can update a finished release when necessary.
- Every anime AniList currently identifies as `RELEASING` is discovered independently of user activity.
- An exact latest-aired target repairs missed inventory even after AniList advances the next-airing pointer.
- Five-minute ticks do not repeat global discovery or call a provider for future targets.
- Due work survives restarts and cannot be processed concurrently by multiple workers.
- Missing episodes continue retrying beyond their airing day with bounded backoff.
- Only provider-confirmed episodes are written as available.
- A confirmed episode never displays a release date later than its durable AniList airing target.
- Confirmation advances the inventory revision once and closes the completed target.
- Arc uses a small AniList update after confirmation to obtain the next airing time or finished status.
- An already-open anime page displays the confirmed episode without a browser refresh and without triggering provider or AniList work.
- AniList, provider, and scheduler failures never delete or hide usable stored data.

## Consequences

This design makes Arc less dependent on AniList availability and removes upstream work from ordinary page loads. It also gives airing updates a durable, observable owner.

The cost is additional scheduler infrastructure, permanent database growth, an hourly paginated AniList discovery query, retry and lease policy, and an explicit migration away from cache-shaped storage. Stored finished metadata may remain incorrect until manually repaired, which is an intentional tradeoff for stability and low request volume.
