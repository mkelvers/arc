import { z } from 'zod';

export const AccountRegistrationSchema = z.object({
    username: z
        .string()
        .trim()
        .min(3, 'Use at least 3 characters.')
        .max(30, 'Use no more than 30 characters.')
        .regex(/^[A-Za-z0-9_]+$/, 'Use only letters, numbers, and underscores.'),
    password: z.string().min(12, 'Use at least 12 characters.').max(128),
    invitationCode: z.string().trim().min(1).max(256),
});

export const AccountRegistrationResponseSchema = z.object({
    user: z.object({
        id: z.uuid(),
        name: z.string(),
        username: z.string(),
    }),
});

export type AccountRegistration = z.infer<typeof AccountRegistrationSchema>;
