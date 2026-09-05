import tailwindCanonicalClasses from 'eslint-plugin-tailwind-canonical-classes';
import typescriptParser from '@typescript-eslint/parser';
import svelteParser from 'svelte-eslint-parser';

type SvelteNode = {
    type?: string;
    range: readonly [number, number];
};

type SvelteBlockNode = SvelteNode & {
    children?: readonly SvelteNode[];
};

const svelteBlockContentNewlineRule = {
    meta: {
        type: 'layout',
        docs: {
            description: 'Require Svelte block contents to start and end on their own lines.',
        },
        schema: [],
        messages: {
            opening: 'Put Svelte block contents on a new line after the opening block tag.',
            closing: 'Put the Svelte block closing tag on a new line.',
        },
    },
    create(context: {
        sourceCode: { text: string; getLocFromIndex(index: number): { line: number } };
        report(descriptor: { node: SvelteNode; messageId: 'opening' | 'closing' }): void;
    }) {
        function checkBlock(node: SvelteBlockNode) {
            const children = (node.children ?? []).filter(
                (child) =>
                    context.sourceCode.text.slice(child.range[0], child.range[1]).trim() !== ''
            );
            const firstChild = children[0];
            const lastChild = children.at(-1);
            if (firstChild === undefined || lastChild === undefined) {
                return;
            }

            if (node.type === 'SvelteElseBlock' && firstChild.type === 'SvelteIfBlock') {
                return;
            }

            const line = (index: number) => context.sourceCode.getLocFromIndex(index).line;
            if (line(node.range[0]) === line(firstChild.range[0])) {
                context.report({ node: firstChild, messageId: 'opening' });
            }
            if (line(lastChild.range[1]) === line(node.range[1])) {
                context.report({ node: lastChild, messageId: 'closing' });
            }
        }

        return {
            SvelteIfBlock: checkBlock,
            SvelteEachBlock: checkBlock,
            SvelteKeyBlock: checkBlock,
            SvelteAwaitPendingBlock: checkBlock,
            SvelteAwaitThenBlock: checkBlock,
            SvelteAwaitCatchBlock: checkBlock,
            SvelteElseBlock: checkBlock,
            SvelteSnippetBlock: checkBlock,
        };
    },
};

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
            local: {
                rules: {
                    'svelte-block-content-newline': svelteBlockContentNewlineRule,
                },
            },
            'tailwind-canonical-classes': tailwindCanonicalClasses,
        },
        rules: {
            'local/svelte-block-content-newline': 'error',
            'tailwind-canonical-classes/tailwind-canonical-classes': [
                'error',
                {
                    cssPath: './apps/arc/src/routes/layout.css',
                },
            ],
        },
    },
];
