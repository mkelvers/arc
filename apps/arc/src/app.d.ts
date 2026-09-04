import type { SessionResponse } from '@arc/core/client';

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
