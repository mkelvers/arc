<script lang="ts">
    import { Turnstile } from 'svelte-turnstile';

    let { data, form } = $props();
</script>

<svelte:head>
    <meta name="robots" content="noindex" />
    <link rel="preconnect" href="https://challenges.cloudflare.com" />
</svelte:head>

<form class="w-full max-w-104" method="POST">
    <h1 class="text-center text-3xl font-normal">Please prove you’re human</h1>
    <p class="mt-4 text-center text-sm text-muted">Complete the check to continue to Arc.</p>
    {#if form?.message}
        <p class="mt-6 text-center text-sm text-status-error" role="alert">{form.message}</p>
    {/if}

    <input type="hidden" name="returnTo" value={data.returnTo} />
    <div class="mt-12">
        <Turnstile siteKey="0x4AAAAAAEKbxDJG1VlC9MEq" action="turnstile-spin-v2" size="flexible" />
    </div>

    <button
        class="mt-10 min-h-11 w-full rounded-full border border-accent bg-accent px-4 text-xs font-bold text-on-accent transition-colors hover:brightness-110"
        type="submit"
    >
        CONTINUE
    </button>
</form>
