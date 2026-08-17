<script lang="ts">
    import { goto } from '$app/navigation';
    import { Turnstile } from 'svelte-turnstile';

    import { authClient } from '$lib/auth-client';
    import AuthInput from '$lib/components/AuthInput.svelte';
    import StatusBanner from '$lib/components/StatusBanner.svelte';

    let username = $state('');
    let password = $state('');
    let token = $state('');
    let message = $state('');
    let pending = $state(false);
    let reset = $state<() => void>();

    async function login(event: SubmitEvent) {
        event.preventDefault();
        if (pending || !token || !(event.currentTarget as HTMLFormElement).reportValidity()) {
            return;
        }

        pending = true;
        message = '';

        try {
            const result = await authClient.signIn.username({
                username: username.trim(),
                password,
                fetchOptions: { headers: { 'x-captcha-response': token } },
            });
            if (!result.error) {
                await goto('/', { invalidateAll: true });
                return;
            }
            message =
                result.error.status === 429
                    ? 'Too many attempts. Try again shortly.'
                    : 'Username or password is incorrect.';
        } catch {
            message = 'Unable to log in. Try again.';
        } finally {
            if (message) {
                password = '';
                token = '';
                reset?.();
            }
            pending = false;
        }
    }
</script>

<svelte:head>
    <meta name="robots" content="noindex" />
    <link rel="preconnect" href="https://challenges.cloudflare.com" />
</svelte:head>

<StatusBanner message={message} tone="error" ondismiss={() => (message = '')} />

<form class="w-full max-w-104" onsubmit={login}>
    <h1 class="text-center text-3xl font-normal">Log In</h1>

    <div class="mt-16 space-y-6">
        <AuthInput
            name="username"
            label="Username"
            autocomplete="username"
            autocapitalize="none"
            spellcheck={false}
            constraints={{ required: true, minlength: 3, maxlength: 30, pattern: '[A-Za-z0-9_]+' }}
            bind:value={username}
        />
        <AuthInput
            name="password"
            label="Password"
            type="password"
            autocomplete="current-password"
            constraints={{ required: true, maxlength: 128 }}
            bind:value={password}
        />
    </div>

    <div class="mt-10">
        <p class="mb-4 text-center text-sm text-muted">Please prove that you’re human.</p>
        <Turnstile
            siteKey="0x4AAAAAAEKbxDJG1VlC9MEq"
            action="turnstile-spin-v2"
            size="flexible"
            responseField={false}
            bind:reset={reset}
            on:callback={(event) => (token = event.detail.token)}
            on:expired={() => (token = '')}
            on:error={() => (token = '')}
        />
    </div>

    <button
        class="mt-10 min-h-11 w-full rounded-full border border-accent bg-accent px-4 text-xs font-bold text-on-accent transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        type="submit"
        disabled={pending || !token}
    >
        {pending ? 'LOGGING IN…' : 'LOG IN'}
    </button>

    <p class="mt-6 text-center text-sm text-muted">
        Have an invitation? <a class="text-foreground underline" href="/register">Register</a>
    </p>
</form>
