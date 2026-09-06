<script lang="ts">
    import { goto } from '$app/navigation';

    import { authClient } from '$lib/auth-client';
    import AuthInput from '../_components/AuthInput.svelte';
    import StatusBanner from '$lib/components/StatusBanner.svelte';
    import Button from '$lib/components/ui/button/button.svelte';
    import { m } from '$lib/i18n.svelte';
    import type { PageProps } from './$types';

    let { form }: PageProps = $props();

    let username = $state('');
    let password = $state('');
    let message = $state('');
    let pending = $state(false);

    async function login(event: SubmitEvent) {
        event.preventDefault();
        if (pending || !(event.currentTarget as HTMLFormElement).reportValidity()) {
            return;
        }

        pending = true;
        message = '';

        try {
            const result = await authClient.signIn.username({
                username: username.trim(),
                password,
            });
            if (!result.error) {
                await goto('/', {
                    invalidateAll: true,
                });
                return;
            }
            message = result.error.status === 429 ? m.auth_too_many_attempts() : m.auth_invalid_credentials();
        } catch {
            message = m.auth_login_failed();
        } finally {
            if (message) {
                password = '';
            }
            pending = false;
        }
    }
</script>

<svelte:head>
    <title>Arc — {m.nav_login()}</title>
    <meta name="description" content={m.auth_login_description()} />
    <meta name="robots" content="noindex" />
</svelte:head>

<StatusBanner message={message || form?.error || ''} tone="error" ondismiss={() => (message = '')} />

<form class="w-full max-w-104" method="POST" action="?/default" aria-busy={pending} onsubmit={login}>
    <h1 class="text-center text-3xl font-normal">{m.auth_login_title()}</h1>

    <div class="mt-16 space-y-6">
        <AuthInput
            name="username"
            label={m.auth_username()}
            autocomplete="username"
            autocapitalize="none"
            spellcheck={false}
            constraints={{
                required: true,
                minlength: 3,
                maxlength: 30,
                pattern: '[A-Za-z0-9_]+',
            }}
            bind:value={username}
        />
        <AuthInput
            name="password"
            label={m.auth_password()}
            type="password"
            autocomplete="current-password"
            constraints={{
                required: true,
                maxlength: 128,
            }}
            bind:value={password}
        />
    </div>

    <Button
        class="mt-10 w-full text-xs font-bold uppercase active:scale-[0.97]"
        size="lg"
        type="submit"
        disabled={pending}
    >
        {pending ? m.auth_logging_in() : m.auth_login()}
    </Button>

    <p class="mt-6 text-center text-sm text-muted">
        {m.auth_have_invitation()}
        <a class="text-foreground underline" href="/register">{m.auth_register()}</a>
    </p>
</form>
