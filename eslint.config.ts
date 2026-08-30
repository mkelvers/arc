import tailwindCanonicalClasses from 'eslint-plugin-tailwind-canonical-classes';
import typescriptParser from '@typescript-eslint/parser';
import svelteParser from 'svelte-eslint-parser';

export default [
    {
        files: ['apps/arc/**/*.svelte'],
        languageOptions: {
            parser: svelteParser,
            parserOptions: {
                parser: typescriptParser,
            },
        },
        plugins: {
            'tailwind-canonical-classes': tailwindCanonicalClasses,
        },
        rules: {
            'tailwind-canonical-classes/tailwind-canonical-classes': [
                'error',
                {
                    cssPath: './apps/arc/src/routes/layout.css',
                },
            ],
        },
    },
];
