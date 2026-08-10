<div class="flex items-start justify-between gap-6">
  <div>
    <h2 class="text-sm font-medium text-foreground">Automatic Sync</h2>
    <p class="mt-1 max-w-md text-sm leading-relaxed text-muted">
      Automatically keep Arc and AniList up to date.
    </p>
  </div>

  <label class="mt-6 shrink-0 cursor-pointer">
    <span class="sr-only">Enable automatic sync</span>
    <input type="checkbox" class="peer sr-only" />
    <span
      class="flex size-4 items-center justify-center border border-border-strong bg-transparent text-player-accent transition-colors hover:border-player-accent peer-checked:border-player-accent peer-focus-visible:ring-2 peer-focus-visible:ring-player-accent peer-checked:[&>svg]:opacity-100"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 12 12"
        class="size-2.5 opacity-0 transition-opacity"
        fill="none"
        aria-hidden="true"
      >
        <path d="m2 6 2.5 2.5L10 3" stroke="currentColor" stroke-width="1.5" />
      </svg>
    </span>
  </label>
</div>

<section class="mt-10" aria-labelledby="what-to-sync">
  <h2 id="what-to-sync" class="text-sm font-medium text-foreground">What to Sync</h2>

  <div class="mt-5 space-y-4">
    <label class="flex items-center justify-between gap-6 text-sm leading-relaxed text-muted">
      <span>Episode Progress</span>
      <span class="relative flex size-4 shrink-0 items-center justify-center">
        <input type="checkbox" class="peer sr-only" aria-label="Sync episode progress" />
        <span
          class="flex size-4 items-center justify-center border border-border-strong bg-transparent text-player-accent transition-colors hover:border-player-accent peer-checked:border-player-accent peer-focus-visible:ring-2 peer-focus-visible:ring-player-accent peer-checked:[&>svg]:opacity-100"
          aria-hidden="true"
        >
          <svg viewBox="0 0 12 12" class="size-2.5 opacity-0 transition-opacity" fill="none">
            <path d="m2 6 2.5 2.5L10 3" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </span>
      </span>
    </label>

    <label class="flex items-center justify-between gap-6 text-sm leading-relaxed text-muted">
      <span>Watching Status</span>
      <span class="relative flex size-4 shrink-0 items-center justify-center">
        <input type="checkbox" class="peer sr-only" aria-label="Sync watching status" />
        <span
          class="flex size-4 items-center justify-center border border-border-strong bg-transparent text-player-accent transition-colors hover:border-player-accent peer-checked:border-player-accent peer-focus-visible:ring-2 peer-focus-visible:ring-player-accent peer-checked:[&>svg]:opacity-100"
          aria-hidden="true"
        >
          <svg viewBox="0 0 12 12" class="size-2.5 opacity-0 transition-opacity" fill="none">
            <path d="m2 6 2.5 2.5L10 3" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </span>
      </span>
    </label>
  </div>
</section>
