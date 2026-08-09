<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { UploadSimpleIcon, WarningIcon, XIcon } from 'phosphor-svelte';

  import DataSpinner from '$lib/components/DataSpinner.svelte';
  import Tooltip from '$lib/components/Tooltip.svelte';

  type Tone = 'error' | 'success';

  let {
    onresult,
  }: {
    onresult: (message: string, tone: Tone) => void;
  } = $props();

  let dialog = $state<HTMLDialogElement>();
  let fileInput = $state<HTMLInputElement>();
  let selectedFile = $state<File>();
  let mode = $state<'merge' | 'replace'>('merge');
  let pending = $state(false);
  let errorMessage = $state('');

  function resultMessage(data: unknown, fallback: string) {
    return typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof data.message === 'string'
      ? data.message
      : fallback;
  }

  function reset() {
    selectedFile = undefined;
    mode = 'merge';
    errorMessage = '';
    if (fileInput) {
      fileInput.value = '';
    }
  }

  function close() {
    if (pending) {
      return;
    }

    dialog?.close();
    reset();
  }

  function fileSelected(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    selectedFile = input.files?.[0];
    errorMessage = '';
    if (selectedFile) {
      dialog?.showModal();
    }
  }

  const submit: SubmitFunction = () => {
    pending = true;
    errorMessage = '';

    return async ({ result, update }) => {
      pending = false;

      if (result.type === 'success') {
        const message = resultMessage(result.data, 'Your watchlist was imported.');
        dialog?.close();
        reset();
        onresult(message, 'success');
        await update();
        return;
      }

      if (result.type === 'failure') {
        errorMessage = resultMessage(
          result.data,
          'Nothing was changed. The watchlist import failed.'
        );
        onresult(errorMessage, 'error');
        return;
      }

      await update({ reset: false });
    };
  };
</script>

<Tooltip text="Import watchlist">
  <label
    class="grid size-10 cursor-pointer place-items-center text-muted transition-colors hover:bg-surface hover:text-foreground focus-within:outline-1 focus-within:outline-offset-1 focus-within:outline-accent"
  >
    <input
      bind:this={fileInput}
      class="sr-only"
      form="watchlist-import-form"
      name="watchlist"
      type="file"
      accept=".json,application/json"
      aria-label="Import watchlist"
      onchange={fileSelected}
    />
    <UploadSimpleIcon size="1.2rem" weight="regular" aria-hidden="true" />
  </label>
</Tooltip>

<dialog
  bind:this={dialog}
  aria-labelledby="watchlist-import-title"
  aria-describedby="watchlist-import-description"
  class="m-auto w-[calc(100%-2rem)] max-w-lg bg-panel p-0 text-foreground backdrop:bg-black/75"
  onclick={(event) => {
    if (event.target === dialog) {
      close();
    }
  }}
  oncancel={(event) => {
    event.preventDefault();
    close();
  }}
>
  <form
    id="watchlist-import-form"
    method="POST"
    action="?/import"
    enctype="multipart/form-data"
    use:enhance={submit}
    class="p-6 sm:p-7"
  >
    <input type="hidden" name="mode" value={mode} />

    <div class="flex items-start gap-4">
      <WarningIcon
        class="mt-0.5 shrink-0 text-accent"
        size="1.75rem"
        weight="fill"
        aria-hidden="true"
      />
      <div class="min-w-0 flex-1">
        <h2 id="watchlist-import-title" class="text-lg font-semibold">Import watchlist</h2>
        <p id="watchlist-import-description" class="mt-2 text-sm leading-6 text-muted">
          Import compatible AniList or MyAnimeList identities from
          <strong class="font-semibold text-foreground">{selectedFile?.name}</strong>.
        </p>
      </div>
      <button
        type="button"
        class="-mt-2 -mr-2 grid size-10 shrink-0 place-items-center text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus-visible:outline-1 focus-visible:outline-foreground"
        aria-label="Close import"
        onclick={close}
        disabled={pending}
      >
        <XIcon size="1.25rem" weight="bold" aria-hidden="true" />
      </button>
    </div>

    <fieldset class="mt-6 grid gap-2">
      <legend class="sr-only">Import behavior</legend>
      <label
        class="flex cursor-pointer items-start gap-3 border border-border p-4 transition-colors hover:border-muted"
      >
        <input class="mt-0.5 accent-accent" type="radio" bind:group={mode} value="merge" />
        <span>
          <strong class="block text-sm font-semibold">Add and update</strong>
          <span class="mt-1 block text-xs leading-5 text-muted">
            Add imported anime and update matching statuses. Keep Arc-only anime.
          </span>
        </span>
      </label>
      <label
        class="flex cursor-pointer items-start gap-3 border border-border p-4 transition-colors hover:border-muted"
      >
        <input class="mt-0.5 accent-accent" type="radio" bind:group={mode} value="replace" />
        <span>
          <strong class="block text-sm font-semibold">Replace everything</strong>
          <span class="mt-1 block text-xs leading-5 text-muted">
            Remove the current watchlist first. This cannot be undone.
          </span>
        </span>
      </label>
    </fieldset>

    {#if errorMessage}
      <p class="mt-5 text-sm font-medium text-status-error" role="alert">{errorMessage}</p>
    {/if}

    <div class="mt-7 flex justify-end gap-3">
      <button
        type="button"
        class="min-h-11 px-4 text-sm font-medium text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus-visible:outline-1 focus-visible:outline-foreground"
        onclick={close}
        disabled={pending}
      >
        Cancel
      </button>
      <button
        type="submit"
        class:bg-status-error={mode === 'replace'}
        class:bg-accent={mode === 'merge'}
        class:text-on-status={mode === 'replace'}
        class:text-on-accent={mode === 'merge'}
        class="min-h-11 min-w-32 px-5 text-sm font-bold transition-opacity hover:opacity-85 focus-visible:outline-1 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
        disabled={pending || !selectedFile}
      >
        {#if pending}
          <DataSpinner label="Importing…" />
        {:else if mode === 'replace'}
          Replace watchlist
        {:else}
          Import watchlist
        {/if}
      </button>
    </div>
  </form>
</dialog>
