import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
    plugins: [
        tailwindcss(),
        sveltekit({
            compilerOptions: {
                // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
                runes: ({ filename }) =>
                    filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
            },

            // adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
            // If your environment is not supported, or you settled on a specific environment, switch out the adapter.
            // See https://svelte.dev/docs/kit/adapters for more information about adapters.
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
                        ...(mode === 'development' ? (['unsafe-eval'] as const) : []),
                    ],
                    ...(mode === 'development'
                        ? {
                              'script-src-elem': [
                                  'self',
                                  'https://challenges.cloudflare.com',
                                  'unsafe-inline',
                              ] as const,
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
                        ...(mode === 'development' ? (['ws:'] as const) : []),
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
