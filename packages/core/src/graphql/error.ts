export class GraphQLRequestError extends Error {
    readonly status?: number;
    readonly retryAfterMs?: number;

    constructor({
        message,
        cause,
        status,
        retryAfterMs,
    }: {
        readonly message: string;
        readonly cause?: unknown;
        readonly status?: number;
        readonly retryAfterMs?: number;
    }) {
        super(message, { cause });
        this.name = 'GraphQLRequestError';
        this.status = status;
        this.retryAfterMs = retryAfterMs;
    }
}

export function isGraphQLTransientError(cause: unknown) {
    return (
        cause instanceof GraphQLRequestError &&
        (cause.status === undefined || cause.status === 429 || cause.status >= 500)
    );
}
