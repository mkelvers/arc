import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
import { Data, Effect, Schema } from 'effect';

interface Document<TResult, TVariables>
    extends DocumentTypeDecoration<TResult, TVariables> {
    toString(): string;
}

interface GraphQLOptions {
    headers?: Record<string, string>;
}

const Payload = Schema.Struct({
    data: Schema.optional(Schema.Unknown),
    errors: Schema.optional(
        Schema.Array(
            Schema.Struct({
                message: Schema.String,
            }),
        ),
    ),
});

export class GraphQLRequestError extends Data.TaggedError(
    'GraphQLRequestError',
)<{
    readonly message: string;
    readonly cause?: unknown;
}> {}

export function graphql<TResult, TVariables>(
    endpoint: string,
    document: Document<TResult, TVariables>,
    variables: TVariables,
    options: GraphQLOptions = {},
) {
    return Effect.tryPromise({
        try: async (signal) => {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    Accept: 'application/graphql-response+json, application/json',
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
                body: JSON.stringify({
                    query: document.toString(),
                    variables,
                }),
                signal,
            });

            return {
                response,
                body: (await response.json()) as unknown,
            };
        },
        catch: (cause) =>
            new GraphQLRequestError({
                message: 'The GraphQL endpoint could not be reached',
                cause,
            }),
    }).pipe(
        Effect.flatMap(({ response, body }) => {
            if (!response.ok) {
                return Effect.fail(
                    new GraphQLRequestError({
                        message: `The GraphQL endpoint returned ${response.status}`,
                    }),
                );
            }

            return Schema.decodeUnknown(Payload)(body).pipe(
                Effect.mapError(
                    (cause) =>
                        new GraphQLRequestError({
                            message: 'The GraphQL endpoint returned an invalid response',
                            cause,
                        }),
                ),
            );
        }),
        Effect.flatMap((payload) => {
            const message = payload.errors?.[0]?.message;

            if (message) {
                return Effect.fail(new GraphQLRequestError({ message }));
            }

            if (payload.data == null) {
                return Effect.fail(
                    new GraphQLRequestError({
                        message: 'The GraphQL endpoint returned no data',
                    }),
                );
            }

            return Effect.succeed(payload.data as TResult);
        }),
    );
}
