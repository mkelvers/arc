import { m as generatedMessages } from '$lib/paraglide/messages.js';
import { locale } from '$lib/locale.svelte';

export const m = new Proxy(generatedMessages, {
    get(target, property) {
        const message = target[property as keyof typeof target];

        return (...args: never[]) => {
            void locale.current;
            return message.bind(undefined, ...args)();
        };
    },
});
