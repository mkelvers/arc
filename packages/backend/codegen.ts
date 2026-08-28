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
        'src/anime/allanime/generated/': {
            schema: 'src/graphql/operations/allanime/schema.graphql',
            documents: 'src/graphql/operations/allanime/operations/*.graphql',
            preset: 'client',
            config: {
                documentMode: 'string',
                enumsAsTypes: true,
                skipTypename: true,
                useTypeImports: true,
                scalars: {
                    DateTime: {
                        input: 'string',
                        output: 'string',
                    },
                    FlexibleInt: {
                        input: 'number | string',
                        output: 'number | string',
                    },
                    Object: {
                        input: 'unknown',
                        output: 'unknown',
                    },
                },
            },
        },
    },
} satisfies CodegenConfig;
