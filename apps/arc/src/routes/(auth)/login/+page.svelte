<script lang="ts">
    import { goto } from '$app/navigation';

    import { authClient } from '$lib/auth-client';
    import AuthInput from '../_components/AuthInput.svelte';
    import StatusBanner from '../_components/StatusBanner.svelte';

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
            message =
                result.error.status === 429
                    ? 'Too many attempts. Try again shortly.'
                    : 'Username or password is incorrect.';
        } catch {
            message = 'Unable to log in. Try again.';
        } finally {
            if (message) {
                password = '';
            }
            pending = false;
        }
    }
</script>

<svelte:head>
    <title>Arc — Log in</title>
    <meta name="description" content="Log in to continue watching anime on Arc." />
    <meta name="robots" content="noindex" />
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
            label="Password"
            type="password"
            autocomplete="current-password"
            constraints={{ required: true, maxlength: 128 }}
            bind:value={password}
        />
    </div>

    <button
        class="mt-10 min-h-11 w-full rounded-full border border-accent bg-accent px-4 text-xs font-bold text-on-accent transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        type="submit"
        disabled={pending}
    >
        {pending ? 'LOGGING IN…' : 'LOG IN'}
    </button>

    <p class="mt-6 text-center text-sm text-muted">
        Have an invitation? <a class="text-foreground underline" href="/register">Register</a>
    </p>
</form>
