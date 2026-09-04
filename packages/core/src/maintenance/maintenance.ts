import { randomUUID } from 'node:crypto';

import { and, asc, desc, eq, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { db } from '@arc/shared/db';
import { animeEpisodeTarget, maintenanceTask, schedulerHeartbeat } from '@arc/shared/db/schema';
import {
    refreshAnimeRelease,
    refreshAnimeSchedule,
    storedAnimeRelease,
} from '../catalog/anilist-release';
import {
    discoverEpisodeInventory,
    episodeInventoryBackfillKey,
    EpisodeInventoryUnresolvedError,
} from '../catalog/episode-sync';
import { AniKotoRequestError, AniKotoNoMatchError } from '../providers/anikoto';
import { episodeMetadataRevision } from '../catalog/episode-policy';
import { rediscoverMapping, setMetadataMappingOverride } from './mappings';
import { MaintenanceRequestSchema, type MaintenanceRequest } from '../contracts/maintenance';
import { reconcileAllAiringReleases } from './reconciliation';
import { maintenancePriority } from './maintenance-policy';

function dedupeKey(request: MaintenanceRequest) {
    if (request.kind === 'release_refresh') {
        return `release:${request.mode}:${request.anilistId}`;
    }
    if (request.kind === 'mapping_rediscover') {
        return `mapping:rediscover:${request.mappingKind}:${request.anilistId}:${request.provider ?? '*'}`;
    }
    if (request.kind === 'mapping_override') {
        return `mapping:override:${request.override.kind}:${request.anilistId}:${request.override.provider}`;
    }
    if (request.kind === 'target_reactivate') {
        return `target:${request.anilistId}:${request.targetEpisode}`;
    }
    if (request.kind === 'episode_backfill') {
        return episodeInventoryBackfillKey(request.anilistId);
    }
    return 'airing:full-reconciliation';
}

export async function enqueueMaintenance(request: MaintenanceRequest) {
    const key = dedupeKey(request);
    const [task] = await db
        .insert(maintenanceTask)
        .values({
            kind: request.kind,
            dedupeKey: key,
            payload: request,
            priority: maintenancePriority(request),
        })
        .onConflictDoUpdate({
            target: maintenanceTask.dedupeKey,
            setWhere: ne(maintenanceTask.state, 'running'),
            set: {
                payload: request,
                priority: maintenancePriority(request),
                state: 'pending',
                attempts: 0,
                nextAttemptAt: new Date(),
                leaseOwner: null,
                leaseUntil: null,
                lastError: null,
                result: null,
                completedAt: null,
                updatedAt: new Date(),
            },
        })
        .returning({ id: maintenanceTask.id });

    if (task) {
        return task.id;
    }

    const [running] = await db
        .select({ id: maintenanceTask.id })
        .from(maintenanceTask)
        .where(and(eq(maintenanceTask.dedupeKey, key), eq(maintenanceTask.state, 'running')))
        .limit(1);
    if (!running) {
        throw new Error('The maintenance task could not be persisted');
    }

    return running.id;
}

export async function getMaintenanceTask(id: string) {
    return db
        .select({
            id: maintenanceTask.id,
            kind: maintenanceTask.kind,
            state: maintenanceTask.state,
            attempts: maintenanceTask.attempts,
            nextAttemptAt: maintenanceTask.nextAttemptAt,
            lastError: maintenanceTask.lastError,
            result: maintenanceTask.result,
            createdAt: maintenanceTask.createdAt,
            updatedAt: maintenanceTask.updatedAt,
            completedAt: maintenanceTask.completedAt,
        })
        .from(maintenanceTask)
        .where(eq(maintenanceTask.id, id))
        .limit(1)
        .then((rows) => rows[0] ?? null);
}

async function executeMaintenance(request: MaintenanceRequest) {
    if (request.kind === 'release_refresh') {
        const release =
            request.mode === 'schedule'
                ? await refreshAnimeSchedule(request.anilistId)
                : await refreshAnimeRelease(request.anilistId, { force: true });
        return { anilistId: release.id, status: release.status };
    }
    if (request.kind === 'target_reactivate') {
        const [target] = await db
            .update(animeEpisodeTarget)
            .set({
                state: 'pending',
                nextAttemptAt: new Date(),
                leaseOwner: null,
                leaseUntil: null,
                lastError: null,
                retiredAt: null,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(animeEpisodeTarget.anilistId, request.anilistId),
                    eq(animeEpisodeTarget.targetEpisode, request.targetEpisode),
                    or(
                        eq(animeEpisodeTarget.state, 'failed'),
                        eq(animeEpisodeTarget.state, 'retired')
                    )
                )
            )
            .returning({ anilistId: animeEpisodeTarget.anilistId });
        if (!target) {
            const [active] = await db
                .select({ state: animeEpisodeTarget.state })
                .from(animeEpisodeTarget)
                .where(
                    and(
                        eq(animeEpisodeTarget.anilistId, request.anilistId),
                        eq(animeEpisodeTarget.targetEpisode, request.targetEpisode)
                    )
                )
                .limit(1);
            if (active?.state === 'pending') {
                return { reactivated: false, alreadyActive: true };
            }
            throw new Error('The requested failed or retired episode target does not exist');
        }
        return { reactivated: true };
    }
    if (request.kind === 'episode_backfill') {
        const release =
            (await storedAnimeRelease(request.anilistId)) ??
            (await refreshAnimeRelease(request.anilistId));
        const episodes = await discoverEpisodeInventory(release);
        return { anilistId: request.anilistId, episodes: episodes.length };
    }
    if (request.kind === 'airing_reconcile' || request.kind === 'interest_reconcile') {
        const { snapshot: _, ...result } = await reconcileAllAiringReleases();
        await db
            .update(schedulerHeartbeat)
            .set({ lastFullReconciliationAt: new Date() })
            .where(eq(schedulerHeartbeat.name, 'anime-scheduler'));
        return result;
    }
    if (request.kind === 'mapping_rediscover') {
        return rediscoverMapping(request.anilistId);
    }
    if (request.kind === 'mapping_override') {
        return setMetadataMappingOverride(
            request.anilistId,
            Number(request.override.externalId),
            request.override.mediaType
        );
    }
}

function maintenanceRetryDelay(attempts: number) {
    return Math.min(24 * 60 * 60 * 1_000, 60_000 * 2 ** Math.min(attempts, 10));
}

async function finishMaintenanceTask(
    candidate: { id: string; payload: unknown },
    claimed: { attempts: number },
    leaseOwner: string,
    options: { leaseDurationMs: number; leaseRenewalMs: number }
) {
    const parsed = MaintenanceRequestSchema.safeParse(candidate.payload);
    const timer = setInterval(() => {
        void db
            .update(maintenanceTask)
            .set({
                leaseUntil: new Date(Date.now() + options.leaseDurationMs),
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(maintenanceTask.id, candidate.id),
                    eq(maintenanceTask.state, 'running'),
                    eq(maintenanceTask.leaseOwner, leaseOwner)
                )
            )
            .catch(() => {});
    }, options.leaseRenewalMs);
    try {
        if (!parsed.success) {
            throw new Error('Stored maintenance task payload is invalid', {
                cause: parsed.error,
            });
        }
        const result = await executeMaintenance(parsed.data);
        await db
            .update(maintenanceTask)
            .set({
                state: 'completed',
                result,
                completedAt: new Date(),
                leaseOwner: null,
                leaseUntil: null,
                lastError: null,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(maintenanceTask.id, candidate.id),
                    eq(maintenanceTask.leaseOwner, leaseOwner)
                )
            );
        return 'completed' as const;
    } catch (cause) {
        if (cause instanceof AniKotoRequestError && cause.localCooldown) {
            const retryAt = new Date(Date.now() + (cause.retryAfterMs ?? 30_000));
            await db
                .update(maintenanceTask)
                .set({
                    state: 'pending',
                    nextAttemptAt: retryAt,
                    leaseOwner: null,
                    leaseUntil: null,
                    lastError: null,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(maintenanceTask.id, candidate.id),
                        eq(maintenanceTask.leaseOwner, leaseOwner)
                    )
                );
            return 'retried' as const;
        }

        if (
            cause instanceof AniKotoNoMatchError ||
            cause instanceof EpisodeInventoryUnresolvedError
        ) {
            const retryAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
            await db
                .update(maintenanceTask)
                .set({
                    state: 'failed',
                    attempts: 12,
                    nextAttemptAt: retryAt,
                    leaseOwner: null,
                    leaseUntil: null,
                    lastError: cause.message,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(maintenanceTask.id, candidate.id),
                        eq(maintenanceTask.leaseOwner, leaseOwner)
                    )
                );
            return 'failed' as const;
        }

        const attempts = claimed.attempts + 1;
        const failed = attempts >= 12;
        const providerRetryAfterMs =
            cause instanceof AniKotoRequestError ? (cause.retryAfterMs ?? 0) : 0;
        const retryAt = new Date(
            Date.now() + Math.max(maintenanceRetryDelay(attempts), providerRetryAfterMs)
        );
        await db
            .update(maintenanceTask)
            .set({
                state: failed ? 'failed' : 'pending',
                attempts,
                nextAttemptAt: retryAt,
                leaseOwner: null,
                leaseUntil: null,
                lastError: cause instanceof Error ? cause.message : 'Maintenance task failed',
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(maintenanceTask.id, candidate.id),
                    eq(maintenanceTask.leaseOwner, leaseOwner)
                )
            );
        return failed ? ('failed' as const) : ('retried' as const);
    } finally {
        clearInterval(timer);
    }
}

async function seedEpisodeInventoryBackfills() {
    await db.execute(sql`
        insert into maintenance_task (kind, dedupe_key, payload, priority)
        select
            'episode_backfill',
            'episode:backfill:' || release.anilist_id,
            jsonb_build_object('kind', 'episode_backfill', 'anilistId', release.anilist_id),
            0
        from anime_release release
        where release.data is not null
          and release.status in ('RELEASING', 'FINISHED')
          and (
              (
                  release.status = 'FINISHED'
                  and release.episode_count > 0
                  and (
                      (
                          release.format = 'TV_SHORT'
                          and not exists (
                              select 1
                              from anime_episode episode
                              where episode.anilist_id = release.anilist_id
                          )
                      )
                      or (
                          release.format is distinct from 'TV_SHORT'
                          and (
                              select count(*)
                              from anime_episode episode
                              where episode.anilist_id = release.anilist_id
                          ) < release.episode_count
                      )
                  )
              )
              or (
                  release.status = 'RELEASING'
                  and release.next_airing_episode > 0
                  and (
                      select count(distinct episode.number)
                      from anime_episode episode
                      where episode.anilist_id = release.anilist_id
                        and episode.number > 0
                        and episode.number <= greatest(
                            0,
                            release.next_airing_episode - case
                                when release.next_airing_at is null
                                    or release.next_airing_at <= now()
                                    then 0
                                else 1
                            end
                        )
                  ) < greatest(
                      0,
                      release.next_airing_episode - case
                          when release.next_airing_at is null
                              or release.next_airing_at <= now()
                              then 0
                          else 1
                      end
                  )
              )
              or not exists (
                  select 1
                  from anime_external_id anilist
                  inner join anime_external_id_link anilist_link
                      on anilist_link.external_id_id = anilist.id
                  inner join anime_external_id_link tmdb_link
                      on tmdb_link.anime_id = anilist_link.anime_id
                     and tmdb_link.external_id_id <> anilist.id
                  inner join anime_external_id tmdb
                      on tmdb.id = tmdb_link.external_id_id
                     and tmdb.provider = 'tmdb'
                  where anilist.provider = 'anilist'
                    and anilist.media_type = 'anime'
                    and anilist.external_id = release.anilist_id
                    and (
                        (release.format = 'MOVIE' and tmdb.media_type <> 'movie')
                        or (release.format <> 'MOVIE' and tmdb.media_type = 'movie')
                    )
              )
              or exists (
                  select 1
                  from anime_episode_sync sync
                  where sync.anilist_id = release.anilist_id
                    and sync.metadata_revision is distinct from ${episodeMetadataRevision}
              )
              or exists (
                  select 1
                  from anime_episode_sync sync
                  where sync.anilist_id = release.anilist_id
                    and sync.metadata_external_id_id is distinct from (
                        select tmdb_link.external_id_id
                        from anime_external_id anilist
                        inner join anime_external_id_link anilist_link
                            on anilist_link.external_id_id = anilist.id
                        inner join anime_external_id_link tmdb_link
                            on tmdb_link.anime_id = anilist_link.anime_id
                           and tmdb_link.external_id_id <> anilist.id
                        inner join anime_external_id tmdb
                            on tmdb.id = tmdb_link.external_id_id
                           and tmdb.provider = 'tmdb'
                        where anilist.provider = 'anilist'
                          and anilist.media_type = 'anime'
                          and anilist.external_id = release.anilist_id
                        limit 1
                    )
              )
              or exists (
                  select 1
                  from anime_provider_mapping provider_mapping
                  where provider_mapping.anilist_id = release.anilist_id
                    and provider_mapping.provider = 'anikoto'
                    and provider_mapping.inventory_status = 'unresolved'
                    and (
                        provider_mapping.next_retry_at is null
                        or provider_mapping.next_retry_at <= now()
                    )
              )
              or exists (
                  select 1
                  from anime_episode episode
                  where episode.anilist_id = release.anilist_id
                    and (
                        episode.metadata_title is null
                        or btrim(episode.metadata_title) = ''
                        or episode.overview is null
                        or btrim(episode.overview) = ''
                        or episode.image_url is null
                        or btrim(episode.image_url) = ''
                    )
              )
          )
        on conflict (dedupe_key) do update
        set state = 'pending',
            attempts = 0,
            next_attempt_at = now(),
            lease_owner = null,
            lease_until = null,
            last_error = null,
            result = null,
            completed_at = null,
            updated_at = now()
        where maintenance_task.state in ('completed', 'failed')
          and (
              maintenance_task.updated_at < now() - interval '7 days'
              or (
                  maintenance_task.state = 'completed'
                  and maintenance_task.updated_at < now() - interval '5 minutes'
                  and exists (
                      select 1
                      from anime_episode_sync sync
                      where sync.anilist_id = (excluded.payload ->> 'anilistId')::integer
                        and sync.metadata_revision is distinct from ${episodeMetadataRevision}
                        and sync.next_refresh_at is not null
                        and sync.next_refresh_at <= now()
                  )
              )
          )
    `);
}

export async function drainMaintenanceTasks(
    runId: string,
    options: { limit: number; leaseDurationMs: number; leaseRenewalMs: number }
) {
    await seedEpisodeInventoryBackfills();
    const now = new Date();
    const claimedCandidates = await db.transaction(async (tx) => {
        const candidates = await tx
            .select({ id: maintenanceTask.id, payload: maintenanceTask.payload })
            .from(maintenanceTask)
            .where(
                and(
                    or(eq(maintenanceTask.state, 'pending'), eq(maintenanceTask.state, 'running')),
                    lte(maintenanceTask.nextAttemptAt, now),
                    or(isNull(maintenanceTask.leaseUntil), lte(maintenanceTask.leaseUntil, now))
                )
            )
            .orderBy(
                desc(maintenanceTask.priority),
                asc(maintenanceTask.nextAttemptAt),
                asc(maintenanceTask.updatedAt)
            )
            .limit(options.limit)
            .for('update', { skipLocked: true });

        return Promise.all(
            candidates.map(async (candidate) => {
                const leaseOwner = `${runId}:maintenance:${randomUUID()}`;
                const [claimed] = await tx
                    .update(maintenanceTask)
                    .set({
                        state: 'running',
                        leaseOwner,
                        leaseUntil: new Date(Date.now() + options.leaseDurationMs),
                        updatedAt: new Date(),
                    })
                    .where(eq(maintenanceTask.id, candidate.id))
                    .returning({ attempts: maintenanceTask.attempts });
                if (!claimed) {
                    throw new Error('The maintenance task lease could not be persisted');
                }
                return { candidate, claimed, leaseOwner };
            })
        );
    });

    const totals = { claimed: claimedCandidates.length, completed: 0, retried: 0, failed: 0 };
    const executions = claimedCandidates.map(({ candidate, claimed, leaseOwner }) =>
        finishMaintenanceTask(candidate, claimed, leaseOwner, {
            leaseDurationMs: options.leaseDurationMs,
            leaseRenewalMs: options.leaseRenewalMs,
        })
    );

    const results = await Promise.all(executions);
    results.forEach((result) => {
        totals[result] += 1;
    });

    return totals;
}
