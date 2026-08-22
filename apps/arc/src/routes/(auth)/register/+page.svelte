<script lang="ts">
    import { goto } from '$app/navigation';
    import { env } from '$env/dynamic/public';

    import { AccountRegistrationResponseSchema } from '@arc/api-contract/account';
    import { ApiErrorSchema } from '@arc/api-contract/auth';
    import AuthInput from '../_components/AuthInput.svelte';
    import { registerSchema } from './schema';

    let username = $state('');
    let password = $state('');
    let confirmPassword = $state('');
    let invitationCode = $state('');
    let errors = $state<Record<string, string>>({});
    let message = $state('');
    let pending = $state(false);

    async function register(event: SubmitEvent) {
        event.preventDefault();
        if (pending || !(event.currentTarget as HTMLFormElement).reportValidity()) {
            return;
        }

        errors = {};
        message = '';
        const input = registerSchema.safeParse({
            username,
            password,
            confirmPassword,
            invitationCode,
        });
        if (!input.success) {
            errors = Object.fromEntries(
                Object.entries(input.error.flatten().fieldErrors).flatMap(([field, values]) =>
                    values?.[0] ? [[field, values[0]]] : []
                )
            );
            return;
        }
        if (!env.PUBLIC_API_ORIGIN) {
            message = 'Account registration is unavailable.';
            return;
        }

        pending = true;
        try {
            const response = await fetch(`${env.PUBLIC_API_ORIGIN}/v1/accounts`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: input.data.username,
                    password: input.data.password,
                    invitationCode: input.data.invitationCode,
                }),
            });
            const body: unknown = await response.json();
            if (!response.ok) {
                const failure = ApiErrorSchema.safeParse(body);
                if (failure.success && failure.data.error.code === 'INVITATION_INVALID') {
                    errors = { invitationCode: failure.data.error.message };
                } else if (failure.success && failure.data.error.code === 'USERNAME_TAKEN') {
                    errors = { username: failure.data.error.message };
                } else {
                    message = failure.success ? failure.data.error.message : 'We could not create your account.';
                }
                return;
            }
            AccountRegistrationResponseSchema.parse(body);
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
            name="username"
            label="Username"
            autocomplete="username"
            autocapitalize="none"
            spellcheck={false}
            constraints={{ required: true, minlength: 3, maxlength: 30, pattern: '[A-Za-z0-9_]+' }}
            error={errors.username}
            bind:value={username}
        />
        <AuthInput
            name="password"
            label="Password"
            type="password"
            autocomplete="new-password"
            constraints={{ required: true, minlength: 12, maxlength: 128 }}
            error={errors.password}
            bind:value={password}
        />
        <AuthInput
            name="confirmPassword"
            label="Confirm Password"
            type="password"
            autocomplete="new-password"
            constraints={{ required: true, maxlength: 128 }}
            error={errors.confirmPassword}
            bind:value={confirmPassword}
        />
        <AuthInput
            name="invitationCode"
            label="Invitation Code"
            autocomplete="off"
            autocapitalize="none"
            spellcheck={false}
            constraints={{ required: true, maxlength: 256 }}
            error={errors.invitationCode}
            bind:value={invitationCode}
        />
    </div>

    <button
        class="mt-10 min-h-11 w-full rounded-full border border-accent bg-accent px-4 text-xs font-bold text-on-accent transition-colors hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
        type="submit"
        disabled={pending}
    >
        {pending ? 'CREATING ACCOUNT…' : 'CREATE ACCOUNT'}
    </button>

    <p class="mt-6 text-center text-sm text-muted">
        Already have an account? <a class="text-foreground underline" href="/login">Log in</a>
    </p>
</form>
