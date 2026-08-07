import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
import { Data, Effect, Schema } from 'effect';

interface Document<TResult, TVariables> extends DocumentTypeDecoration<TResult, TVariables> {
  toString(): string;
}

interface GraphQLOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

const Payload = Schema.Struct({
  data: Schema.optional(Schema.Unknown),
  errors: Schema.optional(
    Schema.Array(
      Schema.Struct({
        message: Schema.String,
        status: Schema.optional(Schema.Number),
      })
    )
  ),
});

type Payload = typeof Payload.Type;

export class GraphQLRequestError extends Data.TaggedError('GraphQLRequestError')<{
  readonly message: string;
  readonly cause?: unknown;
  readonly status?: number;
}> {}

function parseJson(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function bodyPreview(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, 300);
}

export function graphql<TResult, TVariables>(
  endpoint: string,
  document: Document<TResult, TVariables>,
  variables: TVariables,
  options: GraphQLOptions = {}
) {
  return Effect.tryPromise({
    try: async (signal) => {
      const requestSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(options.timeoutMs ?? 8_000),
      ]);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',

          // Since this is server-side code, identify the application.
          'User-Agent': 'Arc/0.1',

          ...options.headers,
        },
        body: JSON.stringify({
          query: document.toString(),
          variables,
        }),
        signal: requestSignal,
      });

      // Read text first because a Cloudflare/WAF response may be HTML
      // rather than JSON.
      const responseText = await response.text();

      return {
        response,
        responseText,
        body: parseJson(responseText),
      };
    },
    catch: (cause) =>
      new GraphQLRequestError({
        message: 'The GraphQL endpoint could not be reached',
        cause,
      }),
  }).pipe(
    Effect.flatMap(({ response, responseText, body }) =>
      Schema.decodeUnknown(Payload)(body).pipe(
        Effect.map((payload) => ({
          response,
          responseText,
          payload,
        })),
        Effect.catchAll((cause) => {
          if (!response.ok) {
            const preview = bodyPreview(responseText);

            return Effect.fail(
              new GraphQLRequestError({
                message: preview
                  ? `The GraphQL endpoint returned ${response.status}: ${preview}`
                  : `The GraphQL endpoint returned ${response.status}`,
                status: response.status,
                cause,
              })
            );
          }

          return Effect.fail(
            new GraphQLRequestError({
              message: 'The GraphQL endpoint returned an invalid response',
              cause,
            })
          );
        })
      )
    ),

    Effect.flatMap(({ response, payload }) => {
      const graphQLError = payload.errors?.[0];

      // Check the GraphQL payload before throwing a generic HTTP error.
      if (graphQLError) {
        return Effect.fail(
          new GraphQLRequestError({
            message: graphQLError.message,
            status: graphQLError.status ?? (!response.ok ? response.status : undefined),
          })
        );
      }

      if (!response.ok) {
        return Effect.fail(
          new GraphQLRequestError({
            message: `The GraphQL endpoint returned ${response.status}`,
            status: response.status,
          })
        );
      }

      if (payload.data == null) {
        return Effect.fail(
          new GraphQLRequestError({
            message: 'The GraphQL endpoint returned no data',
          })
        );
      }

      return Effect.succeed(payload.data as TResult);
    })
  );
}
