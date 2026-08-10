<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { CaretRightIcon, ChecksIcon, TrashIcon } from 'phosphor-svelte';
  import { onMount } from 'svelte';

  import emptyArtwork from '$lib/assets/notifications-empty.png';
  import Modal from '$lib/components/Modal.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  let clearDialogOpen = $state(false);
  let clearForm = $state<HTMLFormElement>();

  onMount(() => void invalidateAll());

  function clearNotifications() {
    clearDialogOpen = false;
    clearForm?.requestSubmit();
  }
</script>

<main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground">
  <div class="mx-auto w-full max-w-256 px-5 py-9 sm:px-10 sm:py-11 lg:py-14">
    <h1 class="text-center text-2xl font-semibold">Notification Center</h1>
    <div class="mt-5 flex justify-end gap-2 border-b border-border pb-3">
      <form method="POST" action="?/readAll" use:enhance>
        <button
          type="submit"
          class="inline-flex min-h-10 items-center gap-2 px-3 text-xs font-bold text-muted transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ChecksIcon size="1rem" weight="bold" aria-hidden="true" />
          Read all
        </button>
      </form>
      <form bind:this={clearForm} method="POST" action="?/clearAll" use:enhance>
        <button
          type="button"
          class="inline-flex min-h-10 items-center gap-2 px-3 text-xs font-bold text-muted transition-colors hover:bg-surface hover:text-status-error focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onclick={() => (clearDialogOpen = true)}
        >
          <TrashIcon size="1rem" weight="bold" aria-hidden="true" />
          Clear all
        </button>
      </form>
    </div>

    <Modal
      id="clear-notifications"
      bind:open={clearDialogOpen}
      title="Clear notifications?"
      description="This will permanently remove all notifications from your Notification Center."
      confirmLabel="Clear all"
      danger
      onconfirm={clearNotifications}
    />

    {#if data.notifications.length}
      <section class="mt-8 sm:mt-10" aria-label="Notifications">
        <div class="grid gap-3">
          {#each data.notifications as item (item.id)}
            <article
              class="group grid grid-cols-1 overflow-hidden transition-colors hover:bg-surface focus-within:bg-surface sm:grid-cols-[clamp(12rem,30vw,20rem)_minmax(0,1fr)]"
            >
              {#if item.image}
                <img
                  src={item.image}
                  alt={item.title}
                  class="aspect-video h-auto w-full object-cover sm:aspect-auto sm:h-full sm:min-h-52"
                  loading="lazy"
                />
              {/if}
              <div
                class="flex min-w-0 flex-1 flex-col justify-start px-5 pt-6 pb-5 sm:px-7 sm:pt-8"
              >
                <h2 class="text-base font-semibold sm:text-lg">{item.title}</h2>
                {#if item.eventDate}
                  <p class="mt-1 text-xs text-subtle">{item.eventDate}</p>
                {/if}
                <p class="mt-2 line-clamp-2 text-sm leading-6 text-muted">{item.body}</p>
                <a
                  href={item.href}
                  class="mt-4 inline-flex w-fit items-center gap-1 text-xs font-bold text-muted uppercase transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {item.actionLabel}
                  <CaretRightIcon size="1rem" weight="bold" aria-hidden="true" />
                </a>
              </div>
            </article>
          {/each}
        </div>
      </section>
    {:else}
      <section
        class="mx-auto mt-12 grid min-h-120 max-w-240 place-items-center border border-dashed border-border px-6 py-12 text-center sm:mt-14"
        aria-labelledby="empty-notifications-title"
      >
        <div class="flex max-w-md flex-col items-center">
          <img src={emptyArtwork} alt="" width="1536" height="1024" class="h-auto w-64 sm:w-72" />
          <h2 id="empty-notifications-title" class="mt-1 text-lg font-semibold">
            You’re all caught up.
          </h2>
          <p class="mt-2 text-sm leading-6 text-muted">
            New episodes, dubs, and seasons for your anime will show up here.
          </p>
          <a
            href="/watchlist"
            class="mt-6 inline-flex min-h-11 items-center bg-accent px-5 text-xs font-bold text-on-accent uppercase transition-opacity hover:opacity-85 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Go to Watchlist
          </a>
        </div>
      </section>
    {/if}
  </div>
</main>
