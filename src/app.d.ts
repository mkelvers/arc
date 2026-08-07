import type { auth } from '$lib/server/auth';

type AuthSession = typeof auth.$Infer.Session;

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      session: AuthSession['session'] | null;
      user: AuthSession['user'] | null;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
