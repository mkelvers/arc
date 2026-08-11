<script lang="ts">
    import StatusBanner from '$lib/components/StatusBanner.svelte';

    let { data, form } = $props();
    let loadedName = $state('');
    let accountName = $state('');
    let dismissedForm = $state<unknown>();

    const dirty = $derived(accountName.trim() !== data.account.name);
    const statusMessage = $derived(
        form && form !== dismissedForm
            ? form.success
                ? 'Profile has been updated.'
                : (form.message ?? '')
            : ''
    );

    $effect(() => {
        if (loadedName !== data.account.name) {
            loadedName = data.account.name;
            accountName = data.account.name;
        }
    });
</script>

<main class="min-h-[calc(100vh-3.5rem)] px-4 py-10 md:py-16">
    <section class="mx-auto w-full max-w-lg">
        <h1 class="mb-7 text-center text-2xl font-bold tracking-tight">Manage Account</h1>

        <form method="POST" action="?/update">
            <div class="overflow-hidden bg-surface">
                <div class="relative aspect-3/1 overflow-hidden bg-panel-strong">
                    <img src={data.account.artSource} alt="" class="size-full object-cover" />
                </div>

                <div class="relative px-7 pt-16 pb-8">
                    <div
                        class="absolute -top-12 left-1/2 size-24 -translate-x-1/2 overflow-hidden rounded-full bg-panel shadow-xl ring-4 ring-surface"
                    >
                        <img src={data.account.artSource} alt="" class="size-full object-cover" />
                    </div>

                    <label class="block text-xs font-semibold text-muted" for="account-name">
                        Account Name
                    </label>
                    <input
                        id="account-name"
                        name="accountName"
                        maxlength="30"
                        required
                        bind:value={accountName}
                        class="mt-2 w-full border-0 border-b border-border-strong bg-transparent px-0 pb-2 text-lg text-foreground outline-none transition-colors focus:border-accent"
                    />
                    <p class="mt-2 text-xs leading-relaxed text-subtle">
                        This is how your account is shown across Arc. You can change it at any time.
                    </p>
                </div>
            </div>

            <div class="mt-5 flex justify-center gap-3">
                <button
                    type="submit"
                    disabled={!dirty}
                    class="min-h-10 border px-8 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:border-border-strong disabled:text-subtle"
                    class:border-accent={dirty}
                    class:bg-accent={dirty}
                    class:text-on-accent={dirty}>Save</button
                >
                <a
                    href="/"
                    class="inline-flex min-h-10 items-center border border-accent/70 px-8 text-sm font-bold text-accent transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >Cancel</a
                >
            </div>
        </form>
    </section>
</main>

<StatusBanner
    message={statusMessage}
    tone={form?.success ? 'success' : 'error'}
    ondismiss={() => (dismissedForm = form)}
/>
