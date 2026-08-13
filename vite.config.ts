import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
    plugins: [
        tailwindcss(),
        sveltekit({
            compilerOptions: {
                // Arc components use runes; dependencies keep their declared mode until Svelte 6.
                runes: ({ filename }) =>
                    filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
            },

            adapter: adapter(),
            csp: {
                mode: 'auto',
                directives: {
                    'default-src': ['self'],
                    'script-src': [
                        'self',
                        'https://challenges.cloudflare.com',
                        'sha256-uP++nI0YQearma9Hc2G0q99ClgaYxxtiO48R2lvXePk=',
                        'sha256-DV44IKgITwDAfvthDHThPRsyNopVAzUXfpIRO1uDQDI=',
                        ...(command === 'serve' ? ['unsafe-eval' as const] : []),
                    ],
                    'script-src-attr': [
                        'unsafe-hashes',
                        'sha256-7dQwUgLau1NFCCGjfn9FsYptB6ZtWxJin6VohGIu20I=',
                    ],
                    ...(command === 'serve'
                        ? {
                              'script-src-elem': [
                                  'self',
                                  'https://challenges.cloudflare.com',
                                  'unsafe-inline',
                              ],
                          }
                        : {}),
                    'style-src': ['self', 'unsafe-inline'],
                    'img-src': ['self', 'data:', 'https:'],
                    'font-src': ['self'],
                    'connect-src': [
                        'self',
                        'https://*.tiktokcdn.com',
                        'https://p16-ad-sg.ibyteimg.com',
                        'https://p19-ad-sg.ibyteimg.com',
                        ...(command === 'serve' ? ['ws:' as const] : []),
                    ],
                    'worker-src': ['self', 'blob:'],
                    'media-src': ['self', 'blob:'],
                    'object-src': ['none'],
                    'base-uri': ['self'],
                    'form-action': ['self'],
                    'frame-ancestors': ['none'],
                    'frame-src': ['https://challenges.cloudflare.com'],
                },
            },
        }),
    ],
}));
