<script lang="ts">
    import { goto } from '$app/navigation';

    import { ApiErrorSchema } from '@arc/api-contract/auth';
    import AuthInput from '../_components/AuthInput.svelte';
    import { m } from '$lib/i18n.svelte';
    import { Button } from '$lib/components/ui/button';

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
            message = m.auth_passwords_mismatch();
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
            message = m.auth_create_failed();
        } finally {
            pending = false;
        }
    }
</script>

<svelte:head>
    <title>Arc — {m.auth_register_title()}</title>
    <meta name="description" content={m.auth_create_failed()} />
    <meta name="robots" content="noindex" />
</svelte:head>

<form class="w-full max-w-104" onsubmit={register}>
    <h1 class="text-center text-3xl font-normal">{m.auth_register_title()}</h1>

    {#if message}
        <p class="mt-6 text-center text-sm text-status-error" role="alert">{message}</p>
    {/if}

    <div class="mt-12 space-y-6">
        <AuthInput
            name="email"
            label={m.auth_email()}
            type="email"
            autocomplete="email"
            autocapitalize="none"
            spellcheck={false}
            constraints={{
                required: true,
                maxlength: 254,
            }}
            bind:value={email}
        />
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
            autocomplete="new-password"
            constraints={{
                required: true,
                minlength: 12,
                maxlength: 128,
            }}
            bind:value={password}
        />
        <AuthInput
            name="confirmPassword"
            label={m.auth_confirm_password()}
            type="password"
            autocomplete="new-password"
            constraints={{
                required: true,
                maxlength: 128,
            }}
            bind:value={confirmPassword}
        />
        <AuthInput
            name="invitationCode"
            label={m.auth_invitation_code()}
            autocomplete="off"
            autocapitalize="none"
            spellcheck={false}
            constraints={{
                required: true,
                maxlength: 256,
            }}
            bind:value={invitationCode}
        />
    </div>

    <Button
        class="mt-10 w-full text-xs font-bold uppercase active:scale-[0.97]"
        size="lg"
        type="submit"
        disabled={pending}
    >
        {pending ? m.auth_creating_account() : m.auth_create_account()}
    </Button>

    <p class="mt-6 text-center text-sm text-muted">
        {m.auth_already_account()}
        <a class="text-foreground underline" href="/login">{m.nav_login()}</a>
    </p>
</form>
