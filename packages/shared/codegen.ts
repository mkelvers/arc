import type { CodegenConfig } from '@graphql-codegen/cli';

export default {
    generates: {
        'src/graphql/generated/': {
            schema: 'https://graphql.anilist.co',
            documents: 'src/graphql/operations/anilist/*.graphql',
            preset: 'client',
            config: {
                documentMode: 'string',
                enumsAsTypes: true,
                skipTypename: true,
                useTypeImports: true,
            },
        },
    },
} satisfies CodegenConfig;
