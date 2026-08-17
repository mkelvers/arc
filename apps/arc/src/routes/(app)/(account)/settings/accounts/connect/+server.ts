import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ cookies, url, locals }) => {
    if (!locals.user) {
        redirect(303, '/login');
    }

    if (!env.ANILIST_CLIENT_ID || !env.ANILIST_REDIRECT_URI) {
        redirect(303, '/settings/accounts?anilist=error');
    }

    const state = crypto.randomUUID();
    cookies.set('arc_anilist_oauth_state', state, {
        httpOnly: true,
        maxAge: 600,
        path: '/settings/accounts',
        sameSite: 'lax',
        secure: url.protocol === 'https:',
    });

    const params = new URLSearchParams({
        client_id: env.ANILIST_CLIENT_ID,
        redirect_uri: env.ANILIST_REDIRECT_URI,
        response_type: 'code',
        state,
    });

    redirect(302, `https://anilist.co/api/v2/oauth/authorize?${params}`);
};
