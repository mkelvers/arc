# Core migration status

This is the working inventory for the replacement of `@arc/backend`.

| Area | Status | Current direction |
| --- | --- | --- |
| API contracts | Removed | Keep contracts in core only when they represent an owned boundary. |
| Catalog shaping primitives | Partly migrated | Keep moving catalog behavior into direct core modules. |
| Catalog application and persistence | In progress | Core must own refresh writes, taxonomy reads, and catalog query composition. |
| AniList lifecycle | Not complete | Reimplement the client, snapshot, and refresh fundamentals in core. |
| Episode metadata/synchronization | Partly migrated | Separate catalog metadata from playback/provider inventory. |
| TMDB metadata | Not complete | Reimplement the required enrichment and mapping behavior in core. |
| Player/audio/search/season provisional modules | Deferred | Remove unclear modules now; reintroduce intentionally when a real owner is needed. |
| Shared | Narrowed | Retain only GraphQL and database infrastructure for now. |
| Backend | Temporary and intentionally incomplete | Delete each replaced implementation; do not maintain it as a working package. |

Catalog is not done until the AniList lifecycle, refresh/application orchestration, episode synchronization, TMDB metadata, and their route/scheduler consumers have moved to core and the corresponding backend files are gone.
