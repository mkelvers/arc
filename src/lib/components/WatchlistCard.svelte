<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { XIcon } from 'phosphor-svelte';

  import { watchlist } from '$lib/watchlist.svelte';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    anime: {
      id: number;
      href: string;
      image: string;
      title: string;
      caption: string;
    };
  }

  let { anime }: Props = $props();
  let pending = $state(false);
  let failed = $state(false);

  async function remove() {
    if (pending) {
      return;
    }

    pending = true;
    failed = false;
    try {
      await watchlist.remove(anime.id);
      await invalidateAll();
    } catch {
      failed = true;
    } finally {
      pending = false;
    }
  }
</script>

<article class="group relative min-w-0">
  <a
    href={anime.href}
    class="block focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-accent"
    aria-label={`View ${anime.title}`}
  >
    <div class="aspect-2/3 overflow-hidden bg-surface">
      <img
        src={anime.image}
        alt=""
        class="size-full object-cover transition-opacity duration-150 group-hover:opacity-85 group-focus-within:opacity-85"
        loading="lazy"
      />
    </div>
    <h2 class="mt-3 line-clamp-2 text-sm leading-snug font-semibold">
      {anime.title}
    </h2>
    {#if anime.caption}
      <p class="mt-1.5 text-sm text-muted">{anime.caption}</p>
    {/if}
  </a>

  <div
    class="absolute top-2 right-2 z-10 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
  >
    <Tooltip text={failed ? 'Try again' : 'Remove'}>
      <button
        type="button"
        class="grid size-8 place-items-center text-white/75 drop-shadow-sm transition-colors hover:text-status-error focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50"
        aria-label={`Remove ${anime.title} from watchlist`}
        disabled={pending}
        onclick={remove}
      >
        <XIcon size="1rem" weight="bold" aria-hidden="true" />
      </button>
    </Tooltip>
  </div>
</article>
