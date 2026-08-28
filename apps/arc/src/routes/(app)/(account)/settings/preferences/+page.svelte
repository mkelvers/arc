<script lang="ts">
    import { CaretDownIcon, CheckIcon, GlobeIcon } from 'phosphor-svelte';

    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import { changeLocale, locale, type AppLocale } from '$lib/locale.svelte';
    import { m } from '$lib/paraglide/messages.js';

    const languages = [
        { locale: 'en', label: 'English (US)' },
        { locale: 'da', label: 'Dansk' },
        { locale: 'de', label: 'Deutsch' },
        { locale: 'es', label: 'Español' },
        { locale: 'ja', label: '日本語' },
    ] as const satisfies ReadonlyArray<{ locale: AppLocale; label: string }>;
</script>

<svelte:head>
    <title>Arc — {m.settings_language()}</title>
    <meta name="description" content={m.settings_language_synopsis()} />
</svelte:head>

<section aria-labelledby="language-title">
    <div class="flex items-start gap-3">
        <GlobeIcon class="mt-0.5 shrink-0 text-muted" size={22} aria-hidden="true" />
        <div>
            <h2 id="language-title" class="text-lg font-medium">{m.settings_language()}</h2>
            <p class="mt-1 text-sm leading-relaxed text-muted">{m.settings_language_synopsis()}</p>
        </div>
    </div>

    <Dropdown
        id="settings-language"
        ariaLabel={m.settings_language()}
        menuAlign="start"
        triggerClass="mt-6 flex min-h-11 w-full items-center justify-between border-b border-border-strong bg-panel px-1 text-sm text-foreground transition-colors hover:text-input-accent focus-visible:text-input-accent sm:max-w-sm"
    >
        {#snippet trigger()}
            <span>
                {languages.find((language) => language.locale === locale.current)?.label ?? languages[0].label}
            </span>
            <CaretDownIcon size={16} aria-hidden="true" />
        {/snippet}
        {#snippet content()}
            {#each languages as language}
                <button
                    type="button"
                    aria-pressed={locale.current === language.locale}
                    onclick={() => changeLocale(language.locale)}
                    class="block w-full px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                >
                    {#if locale.current === language.locale}
                        <CheckIcon size={16} class="mr-2 inline" aria-hidden="true" />
                    {/if}
                    {language.label}
                </button>
            {/each}
        {/snippet}
    </Dropdown>
</section>
