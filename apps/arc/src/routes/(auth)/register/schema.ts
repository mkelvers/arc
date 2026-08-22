import { z } from 'zod';

import { AccountRegistrationSchema } from '@arc/api-contract/account';

export const registerSchema = AccountRegistrationSchema.extend({
    confirmPassword: z.string(),
}).refine(({ password, confirmPassword }) => password === confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
});
