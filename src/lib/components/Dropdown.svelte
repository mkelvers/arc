<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  type Item = {
    label: string;
    href: string;
    current?: boolean;
  };

  interface Props {
    id: string;
    trigger: Snippet;
    items?: Item[];
    content?: Snippet;
    ariaLabel?: string;
    menuAlign?: 'start' | 'end';
    menuClass?: string;
    modal?: boolean;
    openOnHover?: boolean;
    triggerClass?: string;
  }

  let {
    id,
    trigger,
    items = [],
    content,
    ariaLabel = 'More options',
    menuAlign = 'end',
    menuClass = 'w-48',
    modal = false,
    openOnHover = false,
    triggerClass = 'block min-h-11 cursor-pointer px-3 transition-colors hover:bg-panel peer-checked:bg-panel',
  }: Props = $props();
  let open = $state(false);
  let root = $state<HTMLDivElement>();
  let menu = $state<HTMLDivElement>();

  function closeOnSelection(event: MouseEvent) {
    if (event.target instanceof Element && event.target.closest('a, button')) {
      open = false;
    }
  }

  $effect(() => {
    if (!open || !menu) {
      return;
    }

    requestAnimationFrame(() => {
      menu
        ?.querySelector<HTMLElement>('[aria-current="page"]')
        ?.scrollIntoView({ block: 'nearest' });
    });
  });

  $effect(() => {
    if (!open || !modal) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        open = false;
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  });

  $effect(() => {
    const element = root;
    if (!element) {
      return;
    }

    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !element.contains(event.target)) {
        open = false;
      }
    };
    document.addEventListener('pointerdown', close);

    return () => document.removeEventListener('pointerdown', close);
  });
</script>

<div
  bind:this={root}
  class="dropdown relative"
  role="group"
  onmouseenter={() => {
    if (openOnHover) {
      open = true;
    }
  }}
  onmouseleave={() => {
    if (openOnHover) {
      open = false;
    }
  }}
>
  <input id={id} type="checkbox" aria-label={ariaLabel} class="peer sr-only" bind:checked={open} />
  <label for={id} data-testid="dropdown-trigger" class={triggerClass}>
    {@render trigger()}
  </label>

  {#if open && modal}
    <button
      type="button"
      class="fixed inset-x-0 top-14 bottom-0 z-40 cursor-default bg-black/65 backdrop-blur-[2px]"
      aria-label="Close menu"
      onclick={() => (open = false)}
    ></button>
  {/if}

  <div
    bind:this={menu}
    class={cn(
      'absolute top-full z-50 hidden peer-checked:block',
      menuAlign === 'start' ? 'left-0' : 'right-0',
      menuClass
    )}
  >
    <div
      role={content ? 'group' : 'menu'}
      aria-label={content ? ariaLabel : undefined}
      class="bg-panel"
      onclick={closeOnSelection}
    >
      {#if content}
        {@render content()}
      {:else}
        {#each items as item}
          <a
            role="menuitem"
            href={item.href}
            aria-current={item.current ? 'page' : undefined}
            class:text-accent={item.current}
            class:text-muted={!item.current}
            class="block whitespace-nowrap px-5 py-3 text-sm leading-tight font-normal hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
          >
            {item.label}
          </a>
        {/each}
      {/if}
    </div>
  </div>
</div>
