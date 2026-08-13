<script lang="ts">
    import { page } from '$app/state';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
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
            Arc publishes your library activity to AniList so AniList can notify you about new episodes and related
            releases. AniList never changes your Arc library.
        </p>

        {#if data.anilistConnected}
            <form method="POST" action="?/disconnect">
                <button
                    type="submit"
                    class="mt-5 inline-flex min-h-10 items-center justify-center border border-accent px-7 text-sm font-bold text-accent transition-colors hover:bg-accent hover:text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                    Disconnect
                </button>
            </form>
        {:else}
            <a
                href="/settings/accounts/connect"
                class="mt-5 inline-flex min-h-10 items-center justify-center bg-accent px-7 text-sm font-bold text-on-accent transition-colors hover:bg-accent/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
                Connect
            </a>
        {/if}

        {#if page.url.searchParams.get('anilist') === 'error'}
            <p class="mt-3 text-sm text-status-error">AniList could not be connected. Please try again.</p>
        {/if}
    </div>
</div>
