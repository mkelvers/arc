import { describe, expect, test } from 'bun:test';

import { registerSchema } from './schema';

const registration = {
    username: 'arc_user',
    password: 'correct horse battery staple',
    confirmPassword: 'correct horse battery staple',
    invitationCode: 'invite',
};

describe('registration', () => {
    test('accepts complete account details', () => {
        expect(registerSchema.safeParse(registration).success).toBe(true);
    });

    test('rejects invalid usernames and mismatched passwords', () => {
        expect(registerSchema.safeParse({ ...registration, username: 'not valid' }).success).toBe(
            false
        );
        expect(
            registerSchema.safeParse({
                ...registration,
                confirmPassword: 'different',
            }).success
        ).toBe(false);
    });
});
