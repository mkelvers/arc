<script lang="ts">
  interface Props {
    id?: string;
    open?: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    danger?: boolean;
    onconfirm: () => void;
  }

  let {
    id = 'modal',
    open = $bindable(false),
    title,
    description,
    confirmLabel,
    danger = false,
    onconfirm,
  }: Props = $props();
  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  function close() {
    open = false;
  }

  function confirm() {
    open = false;
    onconfirm();
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby={`${id}-title`}
  aria-describedby={`${id}-description`}
  class="m-auto w-[calc(100%-2rem)] max-w-md bg-panel p-0 text-foreground backdrop:bg-black/75"
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
  <div class="p-6 sm:p-7">
    <h2 id={`${id}-title`} class="text-lg font-semibold">{title}</h2>
    <p id={`${id}-description`} class="mt-2 text-sm leading-6 text-muted">{description}</p>

    <div class="mt-7 flex justify-end gap-3">
      <button
        type="button"
        class="min-h-11 px-4 text-sm font-medium text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus-visible:outline-1 focus-visible:outline-foreground"
        onclick={close}
      >
        Cancel
      </button>
      <button
        type="button"
        class:bg-status-error={danger}
        class:text-on-status={danger}
        class:bg-accent={!danger}
        class:text-on-accent={!danger}
        class="min-h-11 px-5 text-sm font-bold transition-opacity hover:opacity-85 focus-visible:outline-1 focus-visible:outline-offset-2"
        onclick={confirm}
      >
        {confirmLabel}
      </button>
    </div>
  </div>
</dialog>
