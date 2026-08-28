<script lang="ts">
    import { goto } from '$app/navigation';
    import { navigating } from '$app/state';
    import {
        BookmarkSimpleIcon,
        CaretDownIcon,
        GearIcon,
        MagnifyingGlassIcon,
        ListIcon,
        SignOutIcon,
        UserCircleIcon,
    } from 'phosphor-svelte';
    import { authClient } from '$lib/auth-client';
    import { locale } from '$lib/locale.svelte';
    import { m } from '$lib/paraglide/messages.js';
    import Logo from '$lib/components/ui/Logo.svelte';
    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import AccountAvatar from './_components/AccountAvatar.svelte';
    import NavigationSkeleton from './_components/NavigationSkeleton.svelte';
    import type { LayoutProps } from './$types';

    let { data, children }: LayoutProps = $props();
    async function signOut() {
        await authClient.signOut({
            fetchOptions: {
                onSuccess: () => goto('/login'),
            },
        });
    }

    function localized(message: () => string) {
        if (!locale.current) {
            return '';
        }
        return message();
    }
</script>

<svelte:head>
    <link rel="canonical" href={data.canonical} />
</svelte:head>

<header class="fixed inset-x-0 top-0 z-50 h-14 bg-header/95 backdrop-blur">
    <nav class="flex h-full items-center justify-between pl-3 md:pl-6" aria-label={localized(m.nav_primary)}>
        {#if navigating.to}
            <div
                class="flex h-full w-full animate-pulse items-center justify-between pr-3 motion-reduce:animate-none md:pr-5"
                aria-hidden="true"
            >
                <div class="flex items-center gap-3">
                    <div class="size-8 bg-white/8 sm:w-24"></div>
                    <div class="hidden h-4 w-14 bg-white/8 sm:block"></div>
                    <div class="hidden h-4 w-20 bg-white/8 sm:block"></div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="size-7 bg-white/8"></div>
                    <div class="size-7 bg-white/8"></div>
                    <div class="size-8 rounded-full bg-white/8"></div>
                </div>
            </div>
        {:else}
            <div class="flex h-full items-center gap-2 max-sm:pl-12">
                <a
                    href="/"
                    class="inline-flex h-12 items-center justify-center text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label={localized(m.nav_home)}
                    title={localized(m.nav_home)}
                >
                    <Logo alt="Arc" />
                </a>

                <a
                    href="/shows/new"
                    class="hidden h-full items-center justify-center px-4 text-sm font-medium text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:inline-flex"
                >
                    {localized(m.nav_new)}
                </a>

                <a
                    href="/shows/popular"
                    class="hidden h-full items-center justify-center px-4 text-sm font-medium text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:inline-flex"
                >
                    {localized(m.nav_popular)}
                </a>
            </div>

            <div class="hidden h-full items-center sm:flex">
                <a
                    href="/search"
                    class="inline-flex h-full w-11 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-14"
                    aria-label={localized(m.nav_search)}
                    title={localized(m.nav_search)}
                >
                    <MagnifyingGlassIcon size={24} weight="regular" aria-hidden="true" />
                </a>

                <a
                    href="/watchlist"
                    class="inline-flex h-full w-11 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-14"
                    aria-label={localized(m.nav_watchlist)}
                    title={localized(m.nav_watchlist)}
                >
                    <BookmarkSimpleIcon size={24} weight="regular" aria-hidden="true" />
                </a>

                {#if data.account}
                    <Dropdown
                        id="account-menu"
                        ariaLabel={localized(m.nav_account_menu)}
                        modal
                        menuClass="w-[min(21rem,calc(100vw-1rem))]"
                        triggerClass="flex h-14 cursor-pointer items-center gap-1 px-1.5 text-muted transition-colors hover:bg-header-hover hover:text-foreground data-[state=open]:bg-header-hover data-[state=open]:text-foreground focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent sm:gap-2 sm:px-3"
                    >
                        {#snippet trigger()}
                            <AccountAvatar
                                username={data.account.username}
                                image={data.account.image}
                                class="size-8 text-sm ring-1 ring-white/20"
                            />
                            <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
                        {/snippet}

                        {#snippet content()}
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
                                <span>{localized(m.nav_settings)}</span>
                            </a>

                            <a
                                href="/watchlist"
                                class="flex min-h-12 w-full items-center gap-3 px-5 text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus-visible:bg-panel-hover focus-visible:text-foreground focus-visible:outline-none"
                            >
                                <BookmarkSimpleIcon size={21} aria-hidden="true" />
                                <span>{localized(m.nav_watchlist)}</span>
                            </a>

                            <button
                                type="button"
                                class="flex min-h-14 w-full items-center gap-3 px-5 text-left text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus-visible:bg-panel-hover focus-visible:text-foreground focus-visible:outline-none"
                                onclick={signOut}
                            >
                                <SignOutIcon size={21} aria-hidden="true" />
                                <span>{localized(m.nav_logout)}</span>
                            </button>
                        {/snippet}
                    </Dropdown>
                {:else}
                    <a
                        href="/login"
                        class="inline-flex h-full w-11 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-14"
                        aria-label={localized(m.nav_login)}
                        title={localized(m.nav_login)}
                    >
                        <UserCircleIcon size={30} weight="fill" aria-hidden="true" />
                    </a>
                {/if}
            </div>

            <div
                class="pointer-events-none absolute inset-x-0 top-0 flex h-14 items-center justify-between sm:hidden"
            >
                <Dropdown
                    id="mobile-navigation"
                    ariaLabel={localized(m.nav_open_navigation)}
                    menuAlign="start"
                    menuClass="!fixed !top-14 !right-auto !bottom-0 !left-0 z-50 w-64 pointer-events-auto"
                    modal
                    triggerClass="pointer-events-auto grid h-14 w-14 place-items-center text-muted transition-colors hover:bg-header-hover hover:text-foreground data-[state=open]:bg-header-hover data-[state=open]:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    {#snippet trigger()}
                        <ListIcon size={24} aria-hidden="true" />
                    {/snippet}

                    {#snippet content()}
                        <a
                            href="/shows/new"
                            class="block px-5 py-3 text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                        >
                            {localized(m.nav_new)}
                        </a>
                        <a
                            href="/shows/popular"
                            class="block px-5 py-3 text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                        >
                            {localized(m.nav_popular)}
                        </a>
                        <a
                            href="/search"
                            class="block px-5 py-3 text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                        >
                            {localized(m.nav_search)}
                        </a>
                        <a
                            href="/watchlist"
                            class="block px-5 py-3 text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                        >
                            {localized(m.nav_watchlist)}
                        </a>
                        {#if data.account}
                            <a
                                href="/settings"
                                class="block px-5 py-3 text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            >
                                {localized(m.nav_settings)}
                            </a>
                            <button
                                type="button"
                                class="block w-full px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                onclick={signOut}
                            >
                                {localized(m.nav_logout)}
                            </button>
                        {:else}
                            <a
                                href="/login"
                                class="block px-5 py-3 text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            >
                                {localized(m.nav_login)}
                            </a>
                        {/if}
                    {/snippet}
                </Dropdown>

                <div class="pointer-events-auto ml-auto flex h-full items-center bg-header/95">
                    <a
                        href="/search"
                        class="grid h-14 w-12 place-items-center text-muted hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        aria-label={localized(m.nav_search)}
                    >
                        <MagnifyingGlassIcon size={24} aria-hidden="true" />
                    </a>
                    <a
                        href="/watchlist"
                        class="grid h-14 w-12 place-items-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        aria-label={localized(m.nav_watchlist)}
                    >
                        <BookmarkSimpleIcon size={24} aria-hidden="true" />
                    </a>
                    {#if data.account}
                        <a
                            href="/settings"
                            class="grid h-14 w-12 place-items-center hover:bg-header-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-label={localized(m.nav_settings)}
                        >
                            <AccountAvatar
                                username={data.account.username}
                                image={data.account.image}
                                class="size-8 text-sm ring-1 ring-white/20"
                            />
                        </a>
                    {:else}
                        <a
                            href="/login"
                            class="grid h-14 w-12 place-items-center text-muted hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-label={localized(m.nav_login)}
                        >
                            <UserCircleIcon size={30} weight="fill" aria-hidden="true" />
                        </a>
                    {/if}
                </div>
            </div>
        {/if}
    </nav>
</header>

<div id="main-content" class="pt-14" tabindex="-1">
    {#if navigating.to}
        <NavigationSkeleton />
    {:else}
        {@render children()}
    {/if}
</div>
