import type { SessionResponse } from '@arc/api-contract/auth';

type AuthSession = NonNullable<SessionResponse>;

declare global {
    namespace App {
        interface Locals {
            session?: AuthSession['session'];
            user?: AuthSession['user'];
        }
    }
}

export {};
