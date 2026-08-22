import { isAPIError } from 'better-auth/api';
import { Hono } from 'hono';

import { AccountRegistrationSchema } from '@arc/api-contract/account';
import {
    InvalidInvitationError,
    InvitationCompletionError,
    registerInvitedAccount,
} from '@arc/backend';
import { auth } from '../auth';
import { validate } from '../http';

export const accounts = new Hono().post(
    '/',
    validate('json', AccountRegistrationSchema),
    async (context) => {
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
                            email: input.email,
                            password: input.password,
                            username: input.username,
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
            return context.json({ user: account }, 201);
        } catch (cause) {
            if (cause instanceof InvalidInvitationError) {
                return context.json(
                    {
                        error: {
                            code: 'INVITATION_INVALID',
                            message: 'That invitation is invalid or already used.',
                        },
                    },
                    400
                );
            }
            if (isAPIError(cause) && cause.body?.code === 'USERNAME_IS_ALREADY_TAKEN') {
                return context.json(
                    {
                        error: {
                            code: 'USERNAME_TAKEN',
                            message: 'That username is already in use.',
                        },
                    },
                    409
                );
            }
            if (isAPIError(cause) && cause.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
                return context.json(
                    {
                        error: {
                            code: 'EMAIL_TAKEN',
                            message: 'That email is already in use.',
                        },
                    },
                    409
                );
            }

            console.error('Account registration failed', cause);
            const completionFailed = cause instanceof InvitationCompletionError;
            return context.json(
                {
                    error: {
                        code: completionFailed
                            ? 'INVITATION_COMPLETION_FAILED'
                            : 'REGISTRATION_FAILED',
                        message: completionFailed
                            ? 'We could not finish setting up your invitation.'
                            : 'We could not create your account.',
                    },
                },
                500
            );
        }
    }
);
