import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const stateCookie = 'arc_myanimelist_oauth_state';
const verifierCookie = 'arc_myanimelist_oauth_verifier';

export const GET: RequestHandler = ({ cookies, url, locals }) => {
  if (!locals.user) {
    redirect(303, '/login');
  }

  if (!env.MYANIMELIST_CLIENT_ID || !env.MYANIMELIST_REDIRECT_URI) {
    redirect(303, '/settings/accounts?myanimelist=error');
  }

  const state = crypto.randomUUID();
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const cookieOptions = {
    httpOnly: true,
    maxAge: 600,
    path: '/settings/accounts',
    sameSite: 'lax' as const,
    secure: url.protocol === 'https:',
  };

  cookies.set(stateCookie, state, cookieOptions);
  cookies.set(verifierCookie, verifier, cookieOptions);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.MYANIMELIST_CLIENT_ID,
    state,
    redirect_uri: env.MYANIMELIST_REDIRECT_URI,
    code_challenge: verifier,
    code_challenge_method: 'plain',
  });

  redirect(302, `https://myanimelist.net/v1/oauth2/authorize?${params}`);
};
