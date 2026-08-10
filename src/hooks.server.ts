import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';

import { auth } from '$lib/server/auth';
import { startAwarenessLoop } from '$lib/server/anime/awareness';
import { clearance, verifyClearance } from '$lib/server/clearance';

startAwarenessLoop();

const security: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  if (event.url.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return response;
};

const route: Handle = async ({ event, resolve }) => {
  const routeId = event.route.id;
  const authApi = event.url.pathname.startsWith('/api/auth');

  event.locals.session = null;
  event.locals.user = null;

  if (event.cookies.get('arc_user')) event.cookies.delete('arc_user', { path: '/' });
  if (event.url.pathname.startsWith('/api/internal/') || routeId === '/(auth)/verify') {
    return resolve(event);
  }
  if (!routeId && !authApi) return resolve(event);

  if (
    !(await verifyClearance(
      event.cookies.get(clearance.cookie),
      env.TURNSTILE_CLEARANCE_SECRET ?? ''
    ))
  ) {
    event.cookies.delete(clearance.cookie, { path: '/' });
    if (authApi || routeId?.startsWith('/api/')) {
      return new Response('Human verification required', {
        status: 403,
        headers: { 'cache-control': 'no-store' },
      });
    }
    redirect(
      303,
      `/verify?returnTo=${encodeURIComponent(`${event.url.pathname}${event.url.search}`)}`
    );
  }

  if (authApi) return svelteKitHandler({ event, resolve, auth, building });

  const result = await auth.api.getSession({ headers: event.request.headers });
  event.locals.session = result?.session ?? null;
  event.locals.user = result?.user ?? null;

  if (routeId?.startsWith('/api/')) {
    return result
      ? resolve(event)
      : new Response('Unauthorized', {
          status: 401,
          headers: { 'cache-control': 'no-store' },
        });
  }
  if (routeId?.startsWith('/(auth)/')) {
    if (result) redirect(303, '/');
    return resolve(event);
  }
  if (routeId !== '/(app)' && routeId !== '/(app)/anime/[id]' && !result) {
    redirect(303, '/login');
  }
  return svelteKitHandler({ event, resolve, auth, building });
};

export const handle = sequence(security, route);
