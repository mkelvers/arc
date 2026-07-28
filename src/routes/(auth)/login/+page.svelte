<script lang="ts">
	import { goto } from '$app/navigation';

	import { authClient } from '$lib/auth-client';
	import StatusBanner from '$lib/components/StatusBanner.svelte';

	let username = $state('');
	let password = $state('');
	let message = $state('');
	let pending = $state(false);
	let showPassword = $state(false);
	let usernameTouched = $state(false);
	let passwordTouched = $state(false);

	const usernamePattern = /^[A-Za-z0-9_]+$/;
	const normalizedUsername = $derived(username.trim());
	const usernameValid = $derived(
		normalizedUsername.length >= 3 &&
			normalizedUsername.length <= 30 &&
			usernamePattern.test(normalizedUsername)
	);
	const passwordValid = $derived(password.length > 0 && password.length <= 128);
	const formValid = $derived(usernameValid && passwordValid);
	const canSubmit = $derived(formValid && !pending);
	const usernameInvalid = $derived(usernameTouched && !usernameValid);
	const passwordInvalid = $derived(passwordTouched && !passwordValid);

	function clearPassword() {
		password = '';
		passwordTouched = false;
		showPassword = false;
	}

	async function login(event: SubmitEvent) {
		event.preventDefault();
		usernameTouched = true;
		passwordTouched = true;

		if (pending || !formValid) return;

		pending = true;
		message = '';

		try {
			const result = await authClient.signIn.username({
				username: normalizedUsername,
				password
			});

			if (result.error) {
				clearPassword();
				message =
					result.error.status === 429
						? 'Too many attempts. Try again shortly.'
						: 'Username or password is incorrect.';
				return;
			}

			await goto('/', { invalidateAll: true });
		} catch {
			clearPassword();
			message = 'Unable to log in. Try again.';
		} finally {
			pending = false;
		}
	}
</script>

<svelte:head>
	<title>Login — Arc</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<StatusBanner message={message} tone="error" ondismiss={() => (message = '')} />

<form class="w-full max-w-[26rem]" onsubmit={login} novalidate>
	<h1 class="text-center text-3xl font-normal">Login</h1>

	<div class="mt-16 space-y-6">
		<div>
			<div
				class={`relative h-13 border-b transition-colors focus-within:border-accent ${
					username.length > 0 || usernameInvalid
						? 'border-accent'
						: 'border-border-strong'
				}`}
			>
				<input
					id="username"
					class="peer h-full w-full bg-transparent pt-8 text-base outline-none placeholder:text-transparent"
					name="username"
					type="text"
					placeholder=" "
					autocomplete="username"
					autocapitalize="none"
					spellcheck={false}
					minlength="3"
					maxlength="30"
					pattern="[A-Za-z0-9_]+"
					bind:value={username}
					oninput={() => (usernameTouched = true)}
					onblur={() => (usernameTouched = true)}
					aria-describedby="username-requirements"
					aria-invalid={usernameInvalid}
					required
				/>
				<label
					for="username"
					class={`pointer-events-none absolute top-1 left-0 text-xs transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-focus:top-1 peer-focus:text-xs peer-focus:text-accent ${
						username.length > 0 || usernameInvalid
							? 'text-accent'
							: 'text-foreground'
					}`}
				>
					Username
				</label>
			</div>
			<p id="username-requirements" class="sr-only">
				Use 3 to 30 letters, numbers, or underscores.
			</p>
		</div>

		<div>
			<div
				class={`relative h-13 border-b transition-colors focus-within:border-accent ${
					password.length > 0 || passwordInvalid
						? 'border-accent'
						: 'border-border-strong'
				}`}
			>
				<input
					id="password"
					class="peer h-full w-full bg-transparent pt-8 pr-14 text-base outline-none placeholder:text-transparent"
					name="password"
					type={showPassword ? 'text' : 'password'}
					placeholder=" "
					autocomplete="current-password"
					maxlength="128"
					bind:value={password}
					oninput={() => (passwordTouched = true)}
					onblur={() => (passwordTouched = true)}
					aria-describedby="password-requirements"
					aria-invalid={passwordInvalid}
					required
				/>
				<label
					for="password"
					class={`pointer-events-none absolute top-1 left-0 text-xs transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-focus:top-1 peer-focus:text-xs peer-focus:text-accent ${
						password.length > 0 || passwordInvalid
							? 'text-accent'
							: 'text-foreground'
					}`}
				>
					Password
				</label>
				{#if password}
					<button
						class="absolute inset-y-0 right-0 min-w-12 pt-8 text-xs font-semibold text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
						type="button"
						aria-label={showPassword ? 'Hide password' : 'Show password'}
						aria-pressed={showPassword}
						onclick={() => (showPassword = !showPassword)}
					>
						{showPassword ? 'HIDE' : 'SHOW'}
					</button>
				{/if}
			</div>
			<p id="password-requirements" class="sr-only">Enter your account password.</p>
		</div>
	</div>

	<button
		class={`mt-16 min-h-11 w-full rounded-full border px-4 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
			formValid
				? 'border-accent bg-accent text-on-accent hover:brightness-110 disabled:cursor-wait disabled:opacity-60'
				: 'cursor-not-allowed border-border-strong text-subtle'
		}`}
		type="submit"
		disabled={!canSubmit}
	>
		{pending ? 'LOGGING IN…' : 'LOGIN'}
	</button>
</form>
