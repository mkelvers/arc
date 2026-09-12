<script lang="ts">
    import { goto } from '$app/navigation';
    import { navigating } from '$app/state';
    import {
        BookmarkSimpleIcon,
        BellIcon,
        CaretDownIcon,
        GearIcon,
        MagnifyingGlassIcon,
        ListIcon,
        SignOutIcon,
        UserCircleIcon,
    } from 'phosphor-svelte';
    import { authClient } from '$lib/auth-client';
    import { m } from '$lib/i18n.svelte';
    import Logo from '$lib/components/ui/Logo.svelte';
    import Button from '$lib/components/ui/button/button.svelte';
    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import { cn } from '$lib/utils';
    import AccountAvatar from './_components/AccountAvatar.svelte';
    import PageLoading from '$lib/components/ui/PageLoading.svelte';
    import type { LayoutProps } from './$types';

    let { data, children }: LayoutProps = $props();

    async function signOut() {
        await authClient.signOut({
            fetchOptions: {
                onSuccess: () => goto('/login'),
            },
        });
    }
</script>

<svelte:head>
    <link rel="canonical" href={data.canonical} />
    <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<header class="fixed inset-x-0 top-0 z-50 h-14 bg-header backdrop-blur">
    <nav class="flex h-full items-center justify-between pl-3 md:pl-6" aria-label={m.nav_primary()}>
        <div class="flex h-full items-center max-sm:pl-12">
            <div class="flex h-full items-center gap-2">
                <a
                    href="/"
                    class="inline-flex h-12 items-center justify-center text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label={m.nav_home()}
                    title={m.nav_home()}
                >
                    <Logo alt="Arc" class="transition-colors hover:text-white" />
                </a>

                <a
                    href="/shows/new"
                    class="hidden h-full items-center justify-center px-4 text-sm font-medium text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:inline-flex"
                >
                    {m.nav_new()}
                </a>
            </div>

            <a
                href="/shows/popular"
                class="hidden h-full items-center justify-center px-4 text-sm font-medium text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:inline-flex"
            >
                {m.nav_popular()}
            </a>

            <a
                href="/simulcast"
                class="hidden h-full items-center justify-center px-4 text-sm font-medium text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:inline-flex"
            >
                {m.nav_simulcast()}
            </a>

            <div class="h-full">
                <Dropdown id="categories-menu" modal>
                    {#snippet trigger(triggerProps)}
                        <Button
                            {...triggerProps}
                            variant="unstyled"
                            aria-label="Categories"
                            aria-haspopup="dialog"
                            class="appearance-none p-0 hidden h-full items-center gap-2 px-4 text-sm font-medium text-muted transition-colors hover:bg-header-hover hover:text-foreground data-[state=open]:bg-header-hover data-[state=open]:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:inline-flex"
                        >
                            <span>Categories</span>
                            <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
                        </Button>
                    {/snippet}
                    {#snippet content(menuProps)}
                        <div
                            {...menuProps}
                            role="dialog"
                            aria-label="Categories"
                            class="absolute top-full left-0 z-50 w-[min(52rem,calc(100vw-2rem))] bg-header-hover shadow-2xl"
                        >
                            <div class="grid grid-cols-[minmax(12rem,1fr)_minmax(0,2fr)]">
                                <div>
                                    <a
                                        href="/shows/new"
                                        class="block px-5 py-3 text-sm text-muted hover:bg-panel hover:text-foreground focus:bg-panel focus:text-foreground focus:outline-none"
                                    >
                                        {m.nav_new()}
                                    </a>
                                    <a
                                        href="/shows/popular"
                                        class="block px-5 py-3 text-sm text-muted hover:bg-panel hover:text-foreground focus:bg-panel focus:text-foreground focus:outline-none"
                                    >
                                        {m.nav_popular()}
                                    </a>
                                    <a
                                        href="/simulcast"
                                        class="block px-5 py-3 text-sm text-muted hover:bg-panel hover:text-foreground focus:bg-panel focus:text-foreground focus:outline-none"
                                    >
                                        {m.nav_simulcast()}
                                    </a>
                                    <a
                                        href="/release-calendar"
                                        class="block px-5 py-3 text-sm text-muted hover:bg-panel hover:text-foreground focus:bg-panel focus:text-foreground focus:outline-none"
                                    >
                                        {m.nav_release_calendar()}
                                    </a>
                                </div>
                                <div class="min-w-0 border-l border-border py-5">
                                    <p class="mb-3 px-5 text-xs font-bold tracking-wide text-muted uppercase">
                                        Genres
                                    </p>
                                    <div class="grid grid-cols-3">
                                        {#each data.genres as genre}
                                            <a
                                                href={`/category/${genre.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`}
                                                class="flex min-h-11 items-center px-5 text-sm text-muted transition-colors hover:bg-panel hover:text-foreground focus:bg-panel focus:text-foreground focus:outline-none"
                                            >
                                                {genre}
                                            </a>
                                        {/each}
                                    </div>
                                </div>
                            </div>
                        </div>
                    {/snippet}
                </Dropdown>
            </div>
        </div>

        <div class="hidden h-full items-center sm:flex">
            <a
                href="/search"
                class="inline-flex h-full w-11 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-14"
                aria-label={m.nav_search()}
                title={m.nav_search()}
            >
                <MagnifyingGlassIcon size={24} weight="regular" aria-hidden="true" />
            </a>

            <a
                href="/watchlist"
                class="inline-flex h-full w-11 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-14"
                aria-label={m.nav_watchlist()}
                title={m.nav_watchlist()}
            >
                <BookmarkSimpleIcon size={24} weight="regular" aria-hidden="true" />
            </a>

            {#if data.account}
                <Dropdown id="account-menu" modal>
                    {#snippet trigger(triggerProps)}
                        <Button
                            {...triggerProps}
                            variant="unstyled"
                            aria-label={m.nav_account_menu()}
                            aria-haspopup="dialog"
                            class="appearance-none p-0 relative flex h-14 cursor-pointer items-center gap-1 px-1.5 text-muted transition-colors hover:bg-header-hover hover:text-foreground data-[state=open]:bg-header-hover data-[state=open]:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:gap-2 sm:px-3"
                        >
                            <AccountAvatar
                                username={data.account.username}
                                image={data.account.image}
                                hasUnreadNotifications={data.account.unreadNotifications > 0}
                                class="size-8 text-sm ring-1 ring-white/20"
                            />
                            <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
                        </Button>
                    {/snippet}

                    {#snippet content(menuProps)}
                        <div
                            {...menuProps}
                            role="dialog"
                            aria-label={m.nav_account_menu()}
                            class="absolute top-full right-0 z-50 w-[min(21rem,calc(100vw-1rem))] bg-panel"
                        >
                            <div class="bg-panel-strong">
                                <div class="flex min-h-20 items-center gap-3 px-5 py-3">
                                    <AccountAvatar
                                        username={data.account.username}
                                        image={data.account.image}
                                        class="size-11 text-lg"
                                    />
                                    <span class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                                        {data.account.name}
                                    </span>
                                </div>
                            </div>

                            <a
                                href="/settings"
                                class="flex min-h-12 w-full items-center gap-3 px-5 text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus-visible:bg-panel-hover focus-visible:text-foreground focus-visible:outline-none"
                            >
                                <GearIcon size={21} aria-hidden="true" />
                                <span>{m.nav_settings()}</span>
                            </a>

                            <a
                                href="/watchlist"
                                class="flex min-h-12 w-full items-center gap-3 px-5 text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus-visible:bg-panel-hover focus-visible:text-foreground focus-visible:outline-none"
                            >
                                <BookmarkSimpleIcon size={21} aria-hidden="true" />
                                <span>{m.nav_watchlist()}</span>
                            </a>

                            <a
                                href="/notifications"
                                class={cn(
                                    'flex min-h-12 w-full items-center gap-3 px-5 text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus-visible:bg-panel-hover focus-visible:text-foreground focus-visible:outline-none',
                                    data.account.unreadNotifications > 0 &&
                                        "after:ml-auto after:size-2 after:shrink-0 after:rounded-full after:bg-status-error after:content-['']"
                                )}
                            >
                                <BellIcon size={21} aria-hidden="true" />
                                <span>Notifications</span>
                            </a>

                            <Button
                                variant="unstyled"
                                type="button"
                                class="flex min-h-14 w-full items-center justify-start gap-3 px-5 text-left text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus-visible:bg-panel-hover focus-visible:text-foreground focus-visible:outline-none"
                                onclick={signOut}
                            >
                                <SignOutIcon size={21} aria-hidden="true" />
                                <span>{m.nav_logout()}</span>
                            </Button>
                        </div>
                    {/snippet}
                </Dropdown>
            {:else}
                <a
                    href="/login"
                    class="inline-flex h-full w-11 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-14"
                    aria-label={m.nav_login()}
                    title={m.nav_login()}
                >
                    <UserCircleIcon size={30} weight="fill" aria-hidden="true" />
                </a>
            {/if}
        </div>

        <div class="pointer-events-none absolute inset-x-0 top-0 flex h-14 items-center justify-between sm:hidden">
            <Dropdown id="mobile-navigation" closeOnSelection={false} modal>
                {#snippet trigger(triggerProps)}
                    <Button
                        {...triggerProps}
                        variant="unstyled"
                        aria-label={m.nav_open_navigation()}
                        aria-haspopup="dialog"
                        class="appearance-none p-0 pointer-events-auto grid h-14 w-14 place-items-center text-muted transition-colors hover:bg-header-hover hover:text-foreground data-[state=open]:bg-header-hover data-[state=open]:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        <ListIcon size={24} aria-hidden="true" />
                    </Button>
                {/snippet}

                {#snippet content(menuProps)}
                    <div
                        {...menuProps}
                        role="dialog"
                        class="fixed top-14 right-0 bottom-0 left-0 z-50 h-[calc(100dvh-3.5rem)] w-screen pointer-events-auto overflow-y-auto overscroll-contain bg-header-hover"
                    >
                        <nav class="bg-header-hover px-0" aria-label={m.nav_primary()} data-dropdown-close>
                            <a
                                href="/shows/new"
                                class="block px-5 py-3 text-base text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            >
                                {m.nav_new()}
                            </a>
                            <a
                                href="/shows/popular"
                                class="block px-5 py-3 text-base text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            >
                                {m.nav_popular()}
                            </a>
                            <a
                                href="/simulcast"
                                class="block px-5 py-3 text-base text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            >
                                {m.nav_simulcast()}
                            </a>
                            <a
                                href="/release-calendar"
                                class="block px-5 py-3 text-base text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            >
                                {m.nav_release_calendar()}
                            </a>
                        </nav>

                        <details class="group bg-header-hover">
                            <summary
                                class="flex min-h-12 w-full cursor-pointer list-none items-center justify-between px-5 text-left text-base text-muted transition-colors hover:bg-panel-hover focus:bg-panel-hover focus:text-foreground focus:outline-none [&::-webkit-details-marker]:hidden"
                            >
                                <span>Categories</span>
                                <CaretDownIcon
                                    size={18}
                                    weight="bold"
                                    class="transition-transform group-open:rotate-180"
                                    aria-hidden="true"
                                />
                            </summary>
                            <nav
                                id="mobile-navigation-categories"
                                class="bg-panel-strong px-3 py-2"
                                aria-label="Categories"
                                data-dropdown-close
                            >
                                {#each data.genres as genre}
                                    <a
                                        href={`/category/${genre.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`}
                                        class="block px-5 py-2.5 text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    >
                                        {genre}
                                    </a>
                                {/each}
                            </nav>
                        </details>

                        {#if data.account}
                            <Button
                                variant="unstyled"
                                type="button"
                                class="block w-full border-t border-border/60 bg-header-hover px-5 py-3 text-left text-base text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                data-dropdown-close
                                onclick={signOut}
                            >
                                {m.nav_logout()}
                            </Button>
                        {:else}
                            <a
                                href="/login"
                                class="block bg-header-hover px-5 py-3 text-base text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                data-dropdown-close
                            >
                                {m.nav_login()}
                            </a>
                        {/if}
                    </div>
                {/snippet}
            </Dropdown>

            <div class="pointer-events-auto ml-auto flex h-full items-center bg-header">
                <a
                    href="/search"
                    class="grid h-14 w-12 place-items-center text-muted hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label={m.nav_search()}
                >
                    <MagnifyingGlassIcon size={24} aria-hidden="true" />
                </a>
                <a
                    href="/watchlist"
                    class="grid h-14 w-12 place-items-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label={m.nav_watchlist()}
                >
                    <BookmarkSimpleIcon size={24} aria-hidden="true" />
                </a>
                {#if data.account}
                    <a
                        href="/settings"
                        class="grid h-14 w-12 place-items-center hover:bg-header-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        aria-label={m.nav_settings()}
                    >
                        <AccountAvatar
                            username={data.account.username}
                            image={data.account.image}
                            hasUnreadNotifications={data.account.unreadNotifications > 0}
                            class="size-8 text-sm ring-1 ring-white/20"
                        />
                    </a>
                {:else}
                    <a
                        href="/login"
                        class="grid h-14 w-12 place-items-center text-muted hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        aria-label={m.nav_login()}
                    >
                        <UserCircleIcon size={30} weight="fill" aria-hidden="true" />
                    </a>
                {/if}
            </div>
        </div>
    </nav>
</header>

<div id="main-content" class="pt-14" tabindex="-1">
    {#if navigating.to}
        <PageLoading label={m.navigation_loading()} />
    {:else}
        {@render children()}
    {/if}
</div>
