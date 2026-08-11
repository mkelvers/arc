import { z } from 'zod';

export const accountSchema = z.object({
    accountName: z
        .string()
        .trim()
        .min(1, 'Enter an account name.')
        .max(30, 'Use 30 characters or fewer.'),
});
