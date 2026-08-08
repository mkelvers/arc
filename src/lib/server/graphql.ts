import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
import { z } from 'zod';

interface Document<TResult, TVariables> extends DocumentTypeDecoration<TResult, TVariables> {
  toString(): string;
}

interface GraphQLOptions {
  headers?: Record<string, string>;
  retries?: number;
  timeoutMs?: number;
}

const payloadSchema = z.object({
  data: z.unknown().optional(),
  errors: z
    .array(
      z.object({
        message: z.string(),
        status: z.number().optional(),
      })
    )
    .optional(),
});

export class GraphQLRequestError extends Error {
  readonly status?: number;

  constructor({
    message,
    cause,
    status,
  }: {
    readonly message: string;
    readonly cause?: unknown;
    readonly status?: number;
  }) {
    super(message, { cause });
    this.name = 'GraphQLRequestError';
    this.status = status;
  }
}

export async function graphql<TResult, TVariables>(
  endpoint: string,
  document: Document<TResult, TVariables>,
  variables: TVariables,
  options: GraphQLOptions = {}
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      let response: Response;
      let responseText: string;

      try {
        response = await fetch(endpoint, {
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
          signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
        });
        responseText = await response.text();
      } catch (cause) {
        throw new GraphQLRequestError({
          message: 'The GraphQL endpoint could not be reached',
          cause,
        });
      }

      let body: unknown = null;
      if (responseText) {
        try {
          body = JSON.parse(responseText) as unknown;
        } catch {
          // The validation below reports non-JSON responses with HTTP context.
        }
      }

      const result = payloadSchema.safeParse(body);
      if (!result.success) {
        if (!response.ok) {
          const preview = responseText.replace(/\s+/g, ' ').trim().slice(0, 300);
          throw new GraphQLRequestError({
            message: preview
              ? `The GraphQL endpoint returned ${response.status}: ${preview}`
              : `The GraphQL endpoint returned ${response.status}`,
            status: response.status,
            cause: result.error,
          });
        }

        throw new GraphQLRequestError({
          message: 'The GraphQL endpoint returned an invalid response',
          cause: result.error,
        });
      }

      const graphQLError = result.data.errors?.[0];
      if (graphQLError) {
        throw new GraphQLRequestError({
          message: graphQLError.message,
          status: graphQLError.status ?? (!response.ok ? response.status : undefined),
        });
      }

      if (!response.ok) {
        throw new GraphQLRequestError({
          message: `The GraphQL endpoint returned ${response.status}`,
          status: response.status,
        });
      }

      if (result.data.data == null) {
        throw new GraphQLRequestError({
          message: 'The GraphQL endpoint returned no data',
        });
      }

      return result.data.data as TResult;
    } catch (cause) {
      const retryable =
        cause instanceof GraphQLRequestError &&
        (cause.status == null || cause.status === 429 || cause.status >= 500);
      if (!retryable || attempt >= (options.retries ?? 0)) {
        throw cause;
      }

      await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
    }
  }
}
