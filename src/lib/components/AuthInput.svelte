<script lang="ts">
    import type { InputConstraint } from 'sveltekit-superforms';
    import type { HTMLInputAttributes } from 'svelte/elements';

    let {
        name,
        label,
        type = 'text',
        autocomplete,
        value = $bindable(''),
        constraints = {},
        error,
        autocapitalize,
        spellcheck,
    }: {
        name: string;
        label: string;
        type?: 'text' | 'password';
        autocomplete: HTMLInputAttributes['autocomplete'];
        value?: string;
        constraints?: InputConstraint;
        error?: string;
        autocapitalize?: HTMLInputAttributes['autocapitalize'];
        spellcheck?: boolean;
    } = $props();

    let visible = $state(false);
</script>

<div>
    <div
        class="relative h-13 border-b border-border-strong transition-colors focus-within:border-accent"
    >
        <input
            id={name}
            class="peer h-full w-full bg-transparent pt-8 pr-14 text-base outline-none placeholder:text-transparent"
            name={name}
            type={type === 'password' && visible ? 'text' : type}
            placeholder=" "
            autocomplete={autocomplete}
            autocapitalize={autocapitalize}
            spellcheck={spellcheck}
            {...constraints}
            bind:value={value}
            aria-describedby={error ? `${name}-error` : undefined}
            aria-invalid={Boolean(error)}
        />
        <label
            for={name}
            class="pointer-events-none absolute top-1 left-0 text-xs transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-focus:top-1 peer-focus:text-xs peer-focus:text-accent"
        >
            {label}
        </label>
        {#if type === 'password' && value}
            <button
                class="absolute inset-y-0 right-0 min-w-12 pt-8 text-xs font-semibold text-muted uppercase transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                type="button"
                aria-label={visible ? 'Hide password' : 'Show password'}
                aria-pressed={visible}
                onclick={() => (visible = !visible)}
            >
                {visible ? 'Hide' : 'Show'}
            </button>
        {/if}
    </div>
    {#if error}
        <p id={`${name}-error`} class="mt-2 text-sm text-status-error">{error}</p>
    {/if}
</div>
