<script lang="ts">
  import { page } from '$app/state';

  let { data } = $props();
</script>

<div class="flex flex-col gap-6 sm:flex-row sm:items-start">
  <img
    src="https://anilist.co/img/icons/icon.svg"
    alt="AniList"
    class="size-16 shrink-0 rounded-full"
    loading="lazy"
  />

  <div class="min-w-0 flex-1 text-left">
    <h2 class="text-lg font-medium">AniList</h2>
    <p class="mt-1 max-w-md text-sm leading-relaxed text-muted">
      Connect your AniList account and manage syncing in Sync Settings.
    </p>

    {#if data.anilistConnected}
      <form method="POST" action="?/disconnect">
        <button
          type="submit"
          class="mt-5 inline-flex min-h-10 items-center justify-center border border-accent px-7 text-sm font-bold text-accent transition-colors hover:bg-accent hover:text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >DISCONNECT</button
        >
      </form>
    {:else}
      <a
        href="/settings/accounts/connect"
        class="mt-5 inline-flex min-h-10 items-center justify-center bg-accent px-7 text-sm font-bold text-on-accent transition-colors hover:bg-accent/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >CONNECT</a
      >
    {/if}

    {#if page.url.searchParams.get('anilist') === 'error'}
      <p class="mt-3 text-sm text-status-error">
        AniList could not be connected. Please try again.
      </p>
    {/if}
  </div>
</div>

<div class="mt-10 flex flex-col gap-6 border-t border-border pt-8 sm:flex-row sm:items-start">
  <div class="flex size-16 shrink-0 items-center justify-center rounded-full bg-[#2e51a2]">
    <span class="text-2xl font-black tracking-[-0.15em] text-white" aria-hidden="true">MAL</span>
  </div>

  <div class="min-w-0 flex-1 text-left">
    <h2 class="text-lg font-medium">MyAnimeList</h2>
    <p class="mt-1 max-w-md text-sm leading-relaxed text-muted">
      Connect your MyAnimeList account and manage syncing in Sync Settings.
    </p>

    {#if data.myanimelistConnected}
      <form method="POST" action="?/disconnectMyAnimeList">
        <button
          type="submit"
          class="mt-5 inline-flex min-h-10 items-center justify-center border border-accent px-7 text-sm font-bold text-accent transition-colors hover:bg-accent hover:text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >DISCONNECT</button
        >
      </form>
    {:else}
      <a
        href="/settings/accounts/myanimelist/connect"
        class="mt-5 inline-flex min-h-10 items-center justify-center bg-accent px-7 text-sm font-bold text-on-accent transition-colors hover:bg-accent/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >CONNECT</a
      >
    {/if}

    {#if page.url.searchParams.get('myanimelist') === 'error'}
      <p class="mt-3 text-sm text-status-error">
        MyAnimeList could not be connected. Please try again.
      </p>
    {/if}
  </div>
</div>
