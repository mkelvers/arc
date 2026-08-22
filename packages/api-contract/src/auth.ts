import { z } from 'zod';

export const ApiErrorCodeSchema = z.enum([
    'AUTHENTICATION_REQUIRED',
    'INTERNAL_ERROR',
    'INVALID_REQUEST',
    'INVITATION_COMPLETION_FAILED',
    'INVITATION_INVALID',
    'NOT_FOUND',
    'ORIGIN_FORBIDDEN',
    'REGISTRATION_FAILED',
    'USERNAME_TAKEN',
    'WATCHLIST_LOAD_FAILED',
    'WATCHLIST_REMOVE_FAILED',
    'WATCHLIST_UPDATE_FAILED',
]);

export const ApiErrorSchema = z.object({
    error: z.object({
        code: ApiErrorCodeSchema,
        message: z.string(),
    }),
});

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const SessionResponseSchema = z
    .object({
        session: z.object({
            id: z.string(),
            expiresAt: z.coerce.date(),
        }),
        user: z.object({
            id: z.string(),
            name: z.string(),
            username: z.string(),
        }),
    })
    .nullable();

export type SessionResponse = z.infer<typeof SessionResponseSchema>;
