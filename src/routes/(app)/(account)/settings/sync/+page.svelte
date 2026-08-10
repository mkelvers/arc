<script lang="ts">
  let { data, form } = $props();
</script>

<div class="flex items-start justify-between gap-6">
  <div>
    <h2 class="text-sm font-medium text-foreground">Automatic Sync</h2>
    <p class="mt-1 max-w-md text-sm leading-relaxed text-muted">
      Automatically keep Arc and AniList up to date.
    </p>
  </div>

  <form method="POST" action="?/update" class="mt-6 shrink-0">
    <input type="hidden" name="setting" value="automaticSync" />
    <input type="hidden" name="enabled" value={String(!data.settings.automaticSync)} />
    <span class="relative flex size-4 items-center justify-center">
      <input
        type="checkbox"
        class="peer absolute inset-0 z-10 cursor-pointer opacity-0"
        checked={data.settings.automaticSync}
        aria-label="Enable automatic sync"
        onchange={(event) => event.currentTarget.form?.requestSubmit()}
      />
      <span
        class="flex size-4 items-center justify-center border border-border-strong bg-transparent text-player-accent transition-colors peer-hover:border-player-accent peer-checked:border-player-accent peer-focus-visible:ring-2 peer-focus-visible:ring-player-accent peer-checked:[&>svg]:opacity-100"
        aria-hidden="true"
      >
        <svg viewBox="0 0 12 12" class="size-2.5 opacity-0 transition-opacity" fill="none">
          <path d="m2 6 2.5 2.5L10 3" stroke="currentColor" stroke-width="1.5" />
        </svg>
      </span>
    </span>
  </form>
</div>

<section class="mt-10" aria-labelledby="what-to-sync">
  <h2 id="what-to-sync" class="text-sm font-medium text-foreground">What to Sync</h2>

  <div class="mt-5 space-y-4">
    <div class="flex items-center justify-between gap-6 text-sm leading-relaxed text-muted">
      <span>Episode Progress</span>
      <form method="POST" action="?/update">
        <input type="hidden" name="setting" value="episodeProgress" />
        <input type="hidden" name="enabled" value={String(!data.settings.episodeProgress)} />
        <span class="relative flex size-4 items-center justify-center">
          <input
            type="checkbox"
            class="peer absolute inset-0 z-10 cursor-pointer opacity-0"
            checked={data.settings.episodeProgress}
            aria-label="Sync episode progress"
            onchange={(event) => event.currentTarget.form?.requestSubmit()}
          />
          <span
            class="flex size-4 items-center justify-center border border-border-strong bg-transparent text-player-accent transition-colors peer-hover:border-player-accent peer-checked:border-player-accent peer-focus-visible:ring-2 peer-focus-visible:ring-player-accent peer-checked:[&>svg]:opacity-100"
            aria-hidden="true"
          >
            <svg viewBox="0 0 12 12" class="size-2.5 opacity-0 transition-opacity" fill="none">
              <path d="m2 6 2.5 2.5L10 3" stroke="currentColor" stroke-width="1.5" />
            </svg>
          </span>
        </span>
      </form>
    </div>

    <div class="flex items-center justify-between gap-6 text-sm leading-relaxed text-muted">
      <span>Watching Status</span>
      <form method="POST" action="?/update">
        <input type="hidden" name="setting" value="watchingStatus" />
        <input type="hidden" name="enabled" value={String(!data.settings.watchingStatus)} />
        <span class="relative flex size-4 items-center justify-center">
          <input
            type="checkbox"
            class="peer absolute inset-0 z-10 cursor-pointer opacity-0"
            checked={data.settings.watchingStatus}
            aria-label="Sync watching status"
            onchange={(event) => event.currentTarget.form?.requestSubmit()}
          />
          <span
            class="flex size-4 items-center justify-center border border-border-strong bg-transparent text-player-accent transition-colors peer-hover:border-player-accent peer-checked:border-player-accent peer-focus-visible:ring-2 peer-focus-visible:ring-player-accent peer-checked:[&>svg]:opacity-100"
            aria-hidden="true"
          >
            <svg viewBox="0 0 12 12" class="size-2.5 opacity-0 transition-opacity" fill="none">
              <path d="m2 6 2.5 2.5L10 3" stroke="currentColor" stroke-width="1.5" />
            </svg>
          </span>
        </span>
      </form>
    </div>

    <div class="mt-8 flex items-center justify-between gap-6 text-sm leading-relaxed text-muted">
      <span>Import AniList Changes</span>
      <form method="POST" action="?/update">
        <input type="hidden" name="setting" value="importAnilistChanges" />
        <input type="hidden" name="enabled" value={String(!data.settings.importAnilistChanges)} />
        <span class="relative flex size-4 items-center justify-center">
          <input
            type="checkbox"
            class="peer absolute inset-0 z-10 cursor-pointer opacity-0"
            checked={data.settings.importAnilistChanges}
            aria-label="Import AniList changes"
            onchange={(event) => event.currentTarget.form?.requestSubmit()}
          />
          <span
            class="flex size-4 items-center justify-center border border-border-strong bg-transparent text-player-accent transition-colors peer-hover:border-player-accent peer-checked:border-player-accent peer-focus-visible:ring-2 peer-focus-visible:ring-player-accent peer-checked:[&>svg]:opacity-100"
            aria-hidden="true"
          >
            <svg viewBox="0 0 12 12" class="size-2.5 opacity-0 transition-opacity" fill="none">
              <path d="m2 6 2.5 2.5L10 3" stroke="currentColor" stroke-width="1.5" />
            </svg>
          </span>
        </span>
      </form>
    </div>
  </div>

  <div class="mt-10">
    <p class="text-sm leading-relaxed text-muted">
      Last Synced: {data.settings.lastSyncedAt
        ? data.settings.lastSyncedAt.toLocaleString()
        : 'Never'}
    </p>
    <form method="POST" action="?/sync">
      <button
        type="submit"
        disabled={!data.anilistConnected ||
          !data.settings.importAnilistChanges ||
          !data.settings.watchingStatus}
        class="mt-4 inline-flex min-h-10 items-center justify-center bg-accent px-6 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
        >Sync Now</button
      >
    </form>
    {#if form?.message}
      <p class="mt-3 text-sm text-status-error">{form.message}</p>
    {/if}
  </div>
</section>
