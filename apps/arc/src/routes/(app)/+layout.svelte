<script lang="ts">
    import { goto } from '$app/navigation';
    import {
        BookmarkSimpleIcon,
        CaretDownIcon,
        MagnifyingGlassIcon,
        SignOutIcon,
        UserCircleIcon,
    } from 'phosphor-svelte';
    import { authClient } from '$lib/auth-client';
    import Logo from '$lib/components/ui/Logo.svelte';
    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import AccountAvatar from './_components/AccountAvatar.svelte';
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

<header class="fixed inset-x-0 top-0 z-50 h-14 bg-header/95 backdrop-blur">
    <nav class="flex h-full items-center justify-between pl-3 md:pl-6" aria-label="Primary navigation">
        <div class="flex h-full items-center gap-2">
            <a
                href="/"
                class="inline-flex h-12 items-center justify-center text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muted"
                aria-label="Home"
                title="Home"
            >
                <Logo alt="Arc" />
            </a>

            <a
                href="/browse"
                class="inline-flex h-full items-center justify-center px-4 text-sm font-medium text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muted"
            >
                Browse
            </a>

            <a
                href="/simulcast"
                class="inline-flex h-full items-center justify-center px-4 text-sm font-medium text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muted"
            >
                Simulcast
            </a>
        </div>

        <div class="flex h-full items-center">
            <a
                href="/search"
                class="inline-flex h-full w-14 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muted"
                aria-label="Search"
                title="Search"
            >
                <MagnifyingGlassIcon size={24} weight="regular" aria-hidden="true" />
            </a>

            <a
                href="/watchlist"
                class="inline-flex h-full w-14 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muted"
                aria-label="Watchlist"
                title="Watchlist"
            >
                <BookmarkSimpleIcon size={24} weight="regular" aria-hidden="true" />
            </a>

            {#if data.account}
                <Dropdown
                    id="account-menu"
                    ariaLabel="Account menu"
                    modal
                    menuClass="w-[min(21rem,calc(100vw-1rem))]"
                    triggerClass="flex h-14 cursor-pointer items-center gap-2 px-3 text-muted transition-colors hover:bg-header-hover hover:text-foreground peer-checked:bg-header-hover peer-checked:text-foreground focus-within:ring-1 focus-within:ring-muted"
                >
                    {#snippet trigger()}
                        <AccountAvatar
                            username={data.account.username}
                            class="size-8 text-sm ring-1 ring-white/20"
                        />
                        <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
                    {/snippet}

                    {#snippet content()}
                        <div class="bg-panel-strong">
                            <div class="flex min-h-20 items-center gap-3 px-5 py-3">
                                <AccountAvatar username={data.account.username} class="size-11 text-lg" />
                                <span class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                                    {data.account.name}
                                </span>
                            </div>
                        </div>

                        <a
                            href="/watchlist"
                            class="flex min-h-12 w-full items-center gap-3 px-5 text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus-visible:bg-panel-hover focus-visible:text-foreground focus-visible:outline-none"
                        >
                            <BookmarkSimpleIcon size={21} aria-hidden="true" />
                            <span>Watchlist</span>
                        </a>

                        <button
                            type="button"
                            class="flex min-h-14 w-full items-center gap-3 px-5 text-left text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus-visible:bg-panel-hover focus-visible:text-foreground focus-visible:outline-none"
                            onclick={signOut}
                        >
                            <SignOutIcon size={21} aria-hidden="true" />
                            <span>Log out</span>
                        </button>
                    {/snippet}
                </Dropdown>
            {:else}
                <a
                    href="/login"
                    class="inline-flex h-full w-14 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muted"
                    aria-label="Log in"
                    title="Log in"
                >
                    <UserCircleIcon size={30} weight="fill" aria-hidden="true" />
                </a>
            {/if}
        </div>
    </nav>
</header>

<div class="pt-14">
    {@render children()}
</div>
