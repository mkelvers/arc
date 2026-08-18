import { z } from 'zod';

export const registerSchema = z
    .object({
        username: z
            .string()
            .trim()
            .min(3, 'Use at least 3 characters.')
            .max(30, 'Use no more than 30 characters.')
            .regex(/^[A-Za-z0-9_]+$/, 'Use only letters, numbers, and underscores.'),
        password: z.string().min(12, 'Use at least 12 characters.').max(128),
        confirmPassword: z.string(),
        invitationCode: z.string().trim().min(1, 'Enter an invitation code.').max(256),
    })
    .refine(({ password, confirmPassword }) => password === confirmPassword, {
        message: 'Passwords do not match.',
        path: ['confirmPassword'],
    });
