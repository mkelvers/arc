import 'dotenv/config';

import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => {
    const kitOptions: Parameters<typeof sveltekit>[0] = {
        compilerOptions: {
            // Arc components use runes; dependencies keep their declared mode until Svelte 6.
            runes: ({ filename }) =>
                filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
        },
        adapter: adapter(),
        alias: {
            '@arc/app/*': 'src/*',
        },
    };

    if (command === 'build') {
        kitOptions.csp = {
            mode: 'auto',
            directives: {
                'default-src': ['self'],
                'script-src': [
                    'self',
                    'sha256-uP++nI0YQearma9Hc2G0q99ClgaYxxtiO48R2lvXePk=',
                    'sha256-DV44IKgITwDAfvthDHThPRsyNopVAzUXfpIRO1uDQDI=',
                ],
                'script-src-attr': [
                    'unsafe-hashes',
                    'sha256-7dQwUgLau1NFCCGjfn9FsYptB6ZtWxJin6VohGIu20I=',
                ],
                'style-src': ['self', 'unsafe-inline'],
                'img-src': ['self', 'data:', 'https:'],
                'font-src': ['self'],
                'connect-src': [
                    'self',
                    'https://*.tiktokcdn.com',
                    'https://p16-ad-sg.ibyteimg.com',
                    'https://p19-ad-sg.ibyteimg.com',
                ],
                'worker-src': ['self', 'blob:'],
                'media-src': ['self', 'blob:'],
                'object-src': ['none'],
                'base-uri': ['self'],
                'form-action': ['self'],
                'frame-ancestors': ['none'],
            },
        };
    }

    return {
        plugins: [tailwindcss(), sveltekit(kitOptions)],
        server: {
            proxy: {
                '^/(api/auth|v1)': {
                    target: process.env.API_ORIGIN!,
                },
            },
        },
    };
});
