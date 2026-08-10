import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';

import { auth } from '$lib/server/auth';
import { clearance, verifyClearance } from '$lib/server/clearance';

const security: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  const headers = new Headers(response.headers);

  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  if (event.url.protocol === 'https:') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};

const route: Handle = async ({ event, resolve }) => {
  const id = event.route.id;
  const path = event.url.pathname;
  const isAuth = path.startsWith('/api/auth');
  const isApi = id?.startsWith('/api/') === true;

  if (event.cookies.get('arc_user')) {
    event.cookies.delete('arc_user', { path: '/' });
  }

  if (path.startsWith('/api/internal/') || id === '/(auth)/verify') {
    return resolve(event);
  }

  if (!id && !isAuth) {
    return resolve(event);
  }

  if (
    !(await verifyClearance(
      event.cookies.get(clearance.cookie),
      env.TURNSTILE_CLEARANCE_SECRET ?? ''
    ))
  ) {
    event.cookies.delete(clearance.cookie, { path: '/' });

    if (isAuth || isApi) {
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

  if (isAuth) {
    return svelteKitHandler({ event, resolve, auth, building });
  }

  const result = await auth.api.getSession({ headers: event.request.headers });
  event.locals.session = result?.session;
  event.locals.user = result?.user;

  if (isApi) {
    if (!result) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'cache-control': 'no-store' },
      });
    }

    return resolve(event);
  }

  if (id?.startsWith('/(auth)/')) {
    if (result) {
      redirect(303, '/');
    }

    return resolve(event);
  }

  if (id !== '/(app)' && id !== '/(app)/anime/[id]' && !result) {
    redirect(303, '/login');
  }

  return svelteKitHandler({ event, resolve, auth, building });
};

export const handle = sequence(security, route);
