<script lang="ts">
    import { goto } from '$app/navigation';

    import { ApiErrorSchema } from '@arc/api-contract/auth';
    import AuthInput from '../_components/AuthInput.svelte';

    let email = $state('');
    let username = $state('');
    let password = $state('');
    let confirmPassword = $state('');
    let invitationCode = $state('');
    let message = $state('');
    let pending = $state(false);

    async function register(event: SubmitEvent) {
        event.preventDefault();
        if (pending || !(event.currentTarget as HTMLFormElement).reportValidity()) {
            return;
        }

        message = '';
        if (password !== confirmPassword) {
            message = 'Passwords do not match.';
            return;
        }

        pending = true;
        try {
            const response = await fetch('/v1/accounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, username, password, invitationCode }),
            });
            if (!response.ok) {
                message = ApiErrorSchema.parse(await response.json()).error.message;
                return;
            }

            await goto('/', { invalidateAll: true });
        } catch {
            message = 'We could not create your account. Please try again.';
        } finally {
            pending = false;
        }
    }
</script>

<svelte:head>
    <title>Arc — Create account</title>
    <meta name="description" content="Create an Arc account to watch anime and build your watchlist." />
    <meta name="robots" content="noindex" />
</svelte:head>

<form class="w-full max-w-104" onsubmit={register}>
    <h1 class="text-center text-3xl font-normal">Register</h1>

    {#if message}
        <p class="mt-6 text-center text-sm text-status-error" role="alert">{message}</p>
    {/if}

    <div class="mt-12 space-y-6">
        <AuthInput
            name="email"
            label="Email"
            type="email"
            autocomplete="email"
            autocapitalize="none"
            spellcheck={false}
            constraints={{ required: true, maxlength: 254 }}
            bind:value={email}
        />
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
            autocomplete="new-password"
            constraints={{ required: true, minlength: 12, maxlength: 128 }}
            bind:value={password}
        />
        <AuthInput
            name="confirmPassword"
            label="Confirm Password"
            type="password"
            autocomplete="new-password"
            constraints={{ required: true, maxlength: 128 }}
            bind:value={confirmPassword}
        />
        <AuthInput
            name="invitationCode"
            label="Invitation Code"
            autocomplete="off"
            autocapitalize="none"
            spellcheck={false}
            constraints={{ required: true, maxlength: 256 }}
            bind:value={invitationCode}
        />
    </div>

    <button
        class="mt-10 min-h-11 w-full border border-accent bg-accent px-4 text-xs font-bold text-on-accent uppercase transition-[filter,transform] duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97] disabled:cursor-wait disabled:opacity-60"
        type="submit"
        disabled={pending}
    >
        {pending ? 'CREATING ACCOUNT…' : 'CREATE ACCOUNT'}
    </button>

    <p class="mt-6 text-center text-sm text-muted">
        Already have an account? <a class="text-foreground underline" href="/login">Log in</a>
    </p>
</form>
