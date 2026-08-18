import type { CodegenConfig } from '@graphql-codegen/cli';

export default {
    generates: {
        'src/lib/graphql/anilist/generated/': {
            schema: 'https://graphql.anilist.co',
            documents: 'src/lib/graphql/anilist/*.graphql',
            preset: 'client',
            config: {
                documentMode: 'string',
                enumsAsTypes: true,
                skipTypename: true,
                useTypeImports: true,
            },
        },
        'src/lib/graphql/allanime/generated/': {
            schema: 'src/lib/graphql/allanime/schema.graphql',
            documents: 'src/lib/graphql/allanime/operations/*.graphql',
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
