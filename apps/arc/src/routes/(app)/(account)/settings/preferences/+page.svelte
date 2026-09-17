<script lang="ts">
    import { CaretDownIcon } from 'phosphor-svelte';

    import Dropdown from '$lib/components/ui/dropdown/Dropdown.svelte';
    import Button from '$lib/components/ui/button/Button.svelte';
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

        <div class="settings-language-control">
            <Dropdown id="settings-language" alignment="left" className="w-48 *:p-0">
                {#snippet trigger()}
                    <span>
                        {languages.find((language) => language.locale === locale.current)?.label ??
                            languages[0].label}
                    </span>
                    <CaretDownIcon size={16} aria-hidden="true" />
                {/snippet}
                {#snippet children()}
                    <div role="menu">
                        {#each languages as language}
                            <Button
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
        </div>
    </section>
</div>
