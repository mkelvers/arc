import type { CodegenConfig } from '@graphql-codegen/cli';

export default {
    generates: {
        '../shared/src/anilist/generated/': {
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
