import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
    schema: 'https://graphql.anilist.co',
    documents: 'src/lib/graphql/**/*.graphql',
    generates: {
        'src/lib/graphql/anilist/generated/': {
            preset: 'client',
            config: {
                documentMode: 'string',
                enumsAsTypes: true,
                skipTypename: true,
                useTypeImports: true,
            },
        },
    },
};

export default config;
