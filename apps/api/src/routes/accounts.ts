import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { isAPIError } from 'better-auth/api';

import {
    AccountRegistrationResponseSchema,
    AccountRegistrationSchema,
} from '@arc/api-contract/account';
import { ApiErrorSchema } from '@arc/api-contract/auth';
import {
    InvalidInvitationError,
    InvitationCompletionError,
    registerInvitedAccount,
} from '@arc/backend';
import { auth } from '../auth';
import { errorBody } from '../http';

const route = createRoute({
    method: 'post',
    path: '/accounts',
    request: {
        body: { content: { 'application/json': { schema: AccountRegistrationSchema } } },
    },
    responses: {
        201: {
            description: 'Account created',
            content: { 'application/json': { schema: AccountRegistrationResponseSchema } },
        },
        400: {
            description: 'Invalid registration',
            content: { 'application/json': { schema: ApiErrorSchema } },
        },
        409: {
            description: 'Username already exists',
            content: { 'application/json': { schema: ApiErrorSchema } },
        },
        500: {
            description: 'Registration failed',
            content: { 'application/json': { schema: ApiErrorSchema } },
        },
    },
});

export const accountRoutes = new OpenAPIHono({
    defaultHook: (result, context) =>
        result.success
            ? undefined
            : context.json(errorBody('INVALID_REQUEST', 'Request data is invalid'), 400),
}).openapi(route, async (context) => {
    const input = context.req.valid('json');
    let sessionCookies: string[] = [];

    try {
        const account = await registerInvitedAccount(
            input.invitationCode,
            async (reservationId) => {
                const headers = new Headers(context.req.raw.headers);
                headers.set('x-arc-invitation-reservation', reservationId);
                const created = await auth.api.signUpEmail({
                    headers,
                    returnHeaders: true,
                    body: {
                        name: input.username,
                        email: `${input.username.toLowerCase()}@arc.local`,
                        password: input.password,
                        username: input.username,
                        displayUsername: input.username,
                    },
                });
                sessionCookies = created.headers.getSetCookie();
                return {
                    id: created.response.user.id,
                    name: created.response.user.name,
                    username: input.username,
                };
            }
        );
        for (const cookie of sessionCookies) {
            context.header('set-cookie', cookie, { append: true });
        }
        const body = AccountRegistrationResponseSchema.parse({ user: account });
        return context.json(body, 201);
    } catch (cause) {
        if (cause instanceof InvalidInvitationError) {
            return context.json(
                errorBody('INVITATION_INVALID', 'That invitation is invalid or already used.'),
                400
            );
        }
        if (
            isAPIError(cause) &&
            (cause.body?.code === 'USERNAME_IS_ALREADY_TAKEN' ||
                cause.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL')
        ) {
            return context.json(
                errorBody('USERNAME_TAKEN', 'That username is already in use.'),
                409
            );
        }
        console.error('Account registration failed', cause);
        const completionFailed = cause instanceof InvitationCompletionError;
        return context.json(
            errorBody(
                completionFailed ? 'INVITATION_COMPLETION_FAILED' : 'REGISTRATION_FAILED',
                completionFailed
                    ? 'We could not finish setting up your invitation.'
                    : 'We could not create your account.'
            ),
            500
        );
    }
});
