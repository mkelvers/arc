<script lang="ts">
    import { CaretDownIcon, CheckIcon, GlobeIcon } from 'phosphor-svelte';
    import { m } from '$lib/paraglide/messages.js';
    import { changeLocale, locale } from '$lib/locale.svelte';
    import Dropdown from './ui/Dropdown.svelte';
    import Logo from './ui/Logo.svelte';

    const languages = [
        { locale: 'en', label: 'English (US)' },
        { locale: 'da', label: 'Dansk' },
        { locale: 'de', label: 'Deutsch' },
        { locale: 'es', label: 'Español' },
        { locale: 'ja', label: '日本語' },
    ] as const;

    function localized(message: () => string) {
        if (!locale.current) {
            return '';
        }
        return message();
    }
</script>

<footer class="relative z-1000 text-muted">
    <div class="footer-legal px-5 py-10 sm:px-8 lg:px-12">
        <div class="relative flex flex-col items-center gap-6 sm:min-h-10 sm:justify-center">
            <a
                href="/"
                class="inline-flex items-center text-foreground transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:absolute sm:left-0"
                aria-label={localized(m.footer_home)}
            >
                <Logo alt="Arc" class="h-9 text-accent" />
            </a>
            <div class="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-base text-subtle">
                <a href="/terms" class="transition-colors hover:text-foreground">{localized(m.footer_terms)}</a>
                <a href="/privacy" class="transition-colors hover:text-foreground">
                    {localized(m.footer_privacy)}
                </a>
                <a href="/cookies" class="transition-colors hover:text-foreground">
                    {localized(m.footer_cookies)}
                </a>
            </div>
            <div
                class="flex flex-wrap items-center justify-center gap-2 sm:absolute sm:right-0 sm:top-1/2 sm:-translate-y-1/2"
            >
                <Dropdown
                    id="footer-language"
                    ariaLabel={localized(m.footer_choose_language)}
                    menuAlign="end"
                    menuClass="bottom-full top-auto z-[10000] mb-2 w-44 border border-white/15 shadow-2xl"
                    triggerClass="group inline-flex min-h-10 cursor-pointer items-center gap-2 border-2 border-white/55 px-3 text-xs font-semibold text-muted transition-colors hover:border-white hover:bg-white/10 hover:text-foreground peer-checked:border-white peer-checked:bg-white/10 peer-checked:text-foreground focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
                >
                    {#snippet trigger()}
                        <GlobeIcon size={16} aria-hidden="true" />
                        <span>
                            {languages.find((language) => language.locale === locale.current)?.label ??
                                localized(m.language_en)}
                        </span>
                        <CaretDownIcon
                            size={13}
                            class="ml-1 transition-transform group-peer-checked:rotate-180"
                            aria-hidden="true"
                        />
                    {/snippet}
                    {#snippet content()}
                        {#each languages as language}
                            <button
                                type="button"
                                aria-pressed={locale.current === language.locale}
                                onclick={() => changeLocale(language.locale)}
                                class="block w-full px-4 py-3 text-left text-sm text-foreground hover:bg-panel-hover focus:bg-panel-hover focus:outline-none"
                            >
                                {#if locale.current === language.locale}<CheckIcon
                                        size={16}
                                        class="mr-2 inline"
                                        aria-hidden="true"
                                    />{/if}
                                {language.label}
                            </button>
                        {/each}
                    {/snippet}
                </Dropdown>
            </div>
        </div>
    </div>
</footer>
