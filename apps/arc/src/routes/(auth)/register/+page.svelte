<script lang="ts">
    import { untrack } from 'svelte';
    import { superForm } from 'sveltekit-superforms';

    import AuthInput from '../_components/AuthInput.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    const { form, errors, constraints, enhance, submitting, message } = superForm(untrack(() => data.form));
</script>

<svelte:head>
    <title>Arc — Create account</title>
    <meta name="description" content="Create an Arc account to watch anime and build your watchlist." />
    <meta name="robots" content="noindex" />
</svelte:head>

<form class="w-full max-w-104" method="POST" use:enhance>
    <h1 class="text-center text-3xl font-normal">Register</h1>

    {#if $message}
        <p class="mt-6 text-center text-sm text-status-error" role="alert">{$message}</p>
    {/if}

    <div class="mt-12 space-y-6">
        <AuthInput
            name="username"
            label="Username"
            autocomplete="username"
            autocapitalize="none"
            spellcheck={false}
            constraints={$constraints.username}
            error={$errors.username?.[0]}
            bind:value={$form.username}
        />
        <AuthInput
            name="password"
            label="Password"
            type="password"
            autocomplete="new-password"
            constraints={$constraints.password}
            error={$errors.password?.[0]}
            bind:value={$form.password}
        />
        <AuthInput
            name="confirmPassword"
            label="Confirm Password"
            type="password"
            autocomplete="new-password"
            constraints={$constraints.confirmPassword}
            error={$errors.confirmPassword?.[0]}
            bind:value={$form.confirmPassword}
        />
        <AuthInput
            name="invitationCode"
            label="Invitation Code"
            autocomplete="off"
            autocapitalize="none"
            spellcheck={false}
            constraints={$constraints.invitationCode}
            error={$errors.invitationCode?.[0]}
            bind:value={$form.invitationCode}
        />
    </div>

    <button
        class="mt-10 min-h-11 w-full rounded-full border border-accent bg-accent px-4 text-xs font-bold text-on-accent transition-colors hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
        type="submit"
        disabled={$submitting}
    >
        {$submitting ? 'CREATING ACCOUNT…' : 'CREATE ACCOUNT'}
    </button>

    <p class="mt-6 text-center text-sm text-muted">
        Already have an account? <a class="text-foreground underline" href="/login">Log in</a>
    </p>
</form>
