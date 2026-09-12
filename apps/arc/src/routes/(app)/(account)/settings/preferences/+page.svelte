<script lang="ts">
    import { CaretDownIcon } from 'phosphor-svelte';

    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import Button from '$lib/components/ui/button/button.svelte';
    import { changeLocale, locale, type AppLocale } from '$lib/locale.svelte';
    import { m } from '$lib/i18n.svelte';

    const languages = [
        { locale: 'en', label: 'English (US)' },
        { locale: 'da', label: 'Dansk' },
        { locale: 'de', label: 'Deutsch' },
        { locale: 'es', label: 'Español' },
        { locale: 'ja', label: '日本語' },
    ] as const satisfies ReadonlyArray<{ locale: AppLocale; label: string }>;
</script>

<svelte:head>
    <title>Arc — {m.settings_preferences()}</title>
    <meta name="description" content={m.settings_preferences_synopsis()} />
</svelte:head>

<div class="space-y-10">
    <section aria-labelledby="language-title">
        <div>
            <h2 id="language-title" class="text-lg font-medium">{m.settings_language()}</h2>
            <p class="mt-1 text-sm leading-relaxed text-muted">{m.settings_language_synopsis()}</p>
        </div>

        <Dropdown id="settings-language">
            {#snippet trigger(triggerProps)}
                <Button
                    {...triggerProps}
                    variant="unstyled"
                    aria-label={m.settings_language()}
                    class="appearance-none p-0 mt-6 inline-flex min-h-11 w-full max-w-64 cursor-pointer items-center justify-between border-0 border-b border-border-strong bg-transparent px-0 text-base font-semibold text-white transition-colors hover:border-input-accent hover:text-input-accent focus-visible:border-input-accent focus-visible:text-input-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent data-[state=open]:border-input-accent data-[state=open]:text-input-accent"
                >
                    <span>
                        {languages.find((language) => language.locale === locale.current)?.label ??
                            languages[0].label}
                    </span>
                    <CaretDownIcon size={16} aria-hidden="true"></CaretDownIcon>
                </Button>
            {/snippet}
            {#snippet content(menuProps)}
                <div {...menuProps} role="menu" class="absolute top-full left-0 z-50 mt-2 w-48 bg-panel">
                    {#each languages as language}
                        <Button
                            variant="unstyled"
                            type="button"
                            role="menuitem"
                            aria-pressed={locale.current === language.locale}
                            onclick={() => changeLocale(language.locale)}
                            class="block w-full px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                        >
                            {language.label}
                        </Button>
                    {/each}
                </div>
            {/snippet}
        </Dropdown>
    </section>
</div>
