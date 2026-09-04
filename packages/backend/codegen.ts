import type { CodegenConfig } from '@graphql-codegen/cli';

export default {
    generates: {
        '../shared/src/graphql/generated/': {
            schema: 'https://graphql.anilist.co',
            documents: '../shared/src/graphql/operations/anilist/*.graphql',
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
