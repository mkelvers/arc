<script lang="ts">
    import { onMount } from 'svelte';
    import { CaretDownIcon } from 'phosphor-svelte';

    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import * as preferences from '$lib/player/preferences';
    import type { AudioMode } from '@arc/shared/audio';
    import { changeLocale, locale, type AppLocale } from '$lib/locale.svelte';
    import { m } from '$lib/i18n.svelte';

    const languages = [
        { locale: 'en', label: 'English (US)' },
        { locale: 'da', label: 'Dansk' },
        { locale: 'de', label: 'Deutsch' },
        { locale: 'es', label: 'Español' },
        { locale: 'ja', label: '日本語' },
    ] as const satisfies ReadonlyArray<{ locale: AppLocale; label: string }>;

    const audioOptions = ['auto', 'sub', 'dub'] as const;
    const qualityOptions = ['best', '1080p', '720p', '480p'] as const;

    let autoplay = $state(true);
    let audioMode = $state<(typeof audioOptions)[number]>('auto');
    let quality = $state<(typeof qualityOptions)[number]>('best');
    let subtitlesEnabled = $state(false);

    onMount(() => {
        const saved = preferences.load({}, []);
        autoplay = saved.autoplay ?? autoplay;
        if (saved.preferredMode === 'sub' || saved.preferredMode === 'dub') {
            audioMode = saved.preferredMode;
        }
        quality =
            saved.quality === null
                ? quality
                : qualityOptions.includes(saved.quality as (typeof qualityOptions)[number])
                  ? (saved.quality as (typeof qualityOptions)[number])
                  : quality;
        subtitlesEnabled = saved.subtitleEnabled ?? subtitlesEnabled;
    });

    function setAutoplay(value: boolean) {
        autoplay = value;
        preferences.save('autoplay', value);
    }

    function setAudioMode(value: (typeof audioOptions)[number]) {
        audioMode = value;
        preferences.save('audio-mode', value);
    }

    function setQuality(value: (typeof qualityOptions)[number]) {
        quality = value;
        preferences.save('quality', value);
    }

    function setSubtitlesEnabled(value: boolean) {
        subtitlesEnabled = value;
        preferences.save('subtitles', value);
        if (value) {
            preferences.save('subtitle-mode', 'translated');
        }
    }

    function audioLabel(value: (typeof audioOptions)[number]) {
        return value === 'auto'
            ? m.player_auto()
            : value === 'sub'
              ? m.watchlist_subtitled()
              : m.watchlist_dubbed();
    }
</script>

<svelte:head>
    <title>Arc — {m.settings_language()}</title>
    <meta name="description" content={m.settings_language_synopsis()} />
</svelte:head>

<div class="space-y-10">
    <section aria-labelledby="language-title">
        <div>
            <h2 id="language-title" class="text-lg font-medium">{m.settings_language()}</h2>
            <p class="mt-1 text-sm leading-relaxed text-muted">{m.settings_language_synopsis()}</p>
        </div>

        <Dropdown
            id="settings-language"
            ariaLabel={m.settings_language()}
            menuAlign="start"
            triggerClass="mt-6 inline-flex min-h-10 w-56 max-w-full cursor-pointer items-center justify-between border border-border-strong bg-transparent px-4 text-sm text-muted transition-colors hover:border-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-[state=open]:border-accent data-[state=open]:text-foreground"
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
                        {language.label}
                    </button>
                {/each}
            {/snippet}
        </Dropdown>
    </section>

    <section aria-labelledby="playback-defaults-title" class="pt-2">
        <div>
            <h2 id="playback-defaults-title" class="text-lg font-medium">
                {m.settings_playback_defaults()}
            </h2>
            <p class="mt-1 text-sm leading-relaxed text-muted">
                {m.settings_playback_defaults_synopsis()}
            </p>
        </div>

        <div class="mt-6 space-y-6">
            <button
                type="button"
                aria-pressed={autoplay}
                class="flex w-full items-center justify-between gap-6 text-left"
                onclick={() => setAutoplay(!autoplay)}
            >
                <span>
                    <span class="block text-sm">{m.settings_autoplay_next()}</span>
                    <span class="mt-1 block text-xs leading-relaxed text-muted">
                        {m.settings_autoplay_next_synopsis()}
                    </span>
                </span>
                <span
                    class="relative h-3.5 w-7 shrink-0 rounded-full border {autoplay
                        ? 'border-input-accent bg-input-accent/20'
                        : 'border-border-strong bg-transparent'}"
                >
                    <span
                        class="absolute top-0.5 left-0.5 size-2 rounded-full {autoplay
                            ? 'translate-x-4 bg-input-accent'
                            : 'bg-muted'} transition-[transform,background-color]"
                    ></span>
                </span>
            </button>

            <div class="text-sm">
                <span class="text-xs text-muted">{m.settings_preferred_audio()}</span>
                <Dropdown
                    id="preferred-audio"
                    menuAlign="start"
                    triggerClass="mt-2 inline-flex min-h-10 w-56 max-w-full cursor-pointer items-center justify-between border border-border-strong bg-transparent px-4 text-sm text-muted transition-colors hover:border-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-[state=open]:border-accent data-[state=open]:text-foreground"
                >
                    {#snippet trigger()}<span>{audioLabel(audioMode)}</span>
                        <CaretDownIcon size={16} aria-hidden="true" />{/snippet}
                    {#snippet content()}
                        {#each audioOptions as option}
                            <button
                                type="button"
                                class="block w-full px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                class:text-white={audioMode === option}
                                onclick={() => setAudioMode(option)}
                            >
                                {audioLabel(option)}
                            </button>
                        {/each}
                    {/snippet}
                </Dropdown>
            </div>

            <div class="text-sm">
                <span class="text-xs text-muted">{m.settings_default_quality()}</span>
                <Dropdown
                    id="default-quality"
                    menuAlign="start"
                    triggerClass="mt-2 inline-flex min-h-10 w-56 max-w-full cursor-pointer items-center justify-between border border-border-strong bg-transparent px-4 text-sm text-muted transition-colors hover:border-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-[state=open]:border-accent data-[state=open]:text-foreground"
                >
                    {#snippet trigger()}<span>{quality === 'best' ? m.player_auto() : quality}</span>
                        <CaretDownIcon size={16} aria-hidden="true" />{/snippet}
                    {#snippet content()}
                        {#each qualityOptions as option}
                            <button
                                type="button"
                                class="block w-full px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                class:text-white={quality === option}
                                onclick={() => setQuality(option)}
                            >
                                {option === 'best' ? m.player_auto() : option}
                            </button>
                        {/each}
                    {/snippet}
                </Dropdown>
            </div>
        </div>
    </section>

    <section aria-labelledby="subtitle-defaults-title" class="pt-2">
        <div>
            <h2 id="subtitle-defaults-title" class="text-lg font-medium">
                {m.settings_subtitle_defaults()}
            </h2>
            <p class="mt-1 text-sm leading-relaxed text-muted">
                {m.settings_subtitle_defaults_synopsis()}
            </p>
        </div>

        <div class="mt-6 space-y-6">
            <button
                type="button"
                aria-pressed={subtitlesEnabled}
                class="flex w-full items-center justify-between gap-6 text-left"
                onclick={() => setSubtitlesEnabled(!subtitlesEnabled)}
            >
                <span>
                    <span class="block text-sm">{m.settings_subtitles_enabled()}</span>
                    <span class="mt-1 block text-xs leading-relaxed text-muted">
                        {m.settings_subtitles_enabled_synopsis()}
                    </span>
                </span>
                <span
                    class="relative h-3.5 w-7 shrink-0 rounded-full border {subtitlesEnabled
                        ? 'border-input-accent bg-input-accent/20'
                        : 'border-border-strong bg-transparent'}"
                >
                    <span
                        class="absolute top-0.5 left-0.5 size-2 rounded-full {subtitlesEnabled
                            ? 'translate-x-4 bg-input-accent'
                            : 'bg-muted'} transition-[transform,background-color]"
                    ></span>
                </span>
            </button>
        </div>
    </section>
</div>
