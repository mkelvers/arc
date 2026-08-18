import type { auth } from '$lib/server/auth';

type AuthSession = typeof auth.$Infer.Session;

declare global {
    namespace App {
        interface Locals {
            session?: AuthSession['session'];
            user?: AuthSession['user'];
        }
    }
}

export {};
