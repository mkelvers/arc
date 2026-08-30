import { z } from 'zod';

export const AccountRegistrationSchema = z.object({
    email: z.email().max(254),
    username: z
        .string()
        .trim()
        .min(3, 'Use at least 3 characters.')
        .max(30, 'Use no more than 30 characters.')
        .regex(/^[A-Za-z0-9_]+$/, 'Use only letters, numbers, and underscores.'),
    password: z.string().min(12, 'Use at least 12 characters.').max(128),
    invitationCode: z.string().trim().min(1).max(256),
});
