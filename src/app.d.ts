import type { auth } from '$lib/server/auth';

type AuthSession = typeof auth.$Infer.Session;

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      session?: AuthSession['session'];
      user?: AuthSession['user'];
    }
    interface PageData {
      pageTitle?: string;
    }
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
