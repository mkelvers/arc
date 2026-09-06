import { env } from '$env/dynamic/private';
import type { Cookies, RequestEvent } from '@sveltejs/kit';

type CookieOptions = Parameters<Cookies['set']>[2];

export async function forwardAuthForm(
    fetch: RequestEvent['fetch'],
    cookies: Cookies,
    request: Request,
    clientAddress: string,
    path: string,
    body: Record<string, string>
) {
    const response = await fetch(`${env.API_ORIGIN!}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Cookie: request.headers.get('cookie') ?? '',
            Authorization: request.headers.get('authorization') ?? '',
            'X-Forwarded-For': clientAddress,
            Origin: request.headers.get('origin') ?? env.BETTER_AUTH_URL!,
        },
        body: JSON.stringify(body),
    });

    for (const header of response.headers.getSetCookie()) {
        const [pair, ...attributes] = header.split(';').map((part) => part.trim());
        const separator = pair.indexOf('=');
        if (separator <= 0) {
            continue;
        }

        const name = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        const options: CookieOptions = {
            httpOnly: false,
            path: '/',
            secure: false,
            sameSite: 'lax',
        };

        for (const attribute of attributes) {
            const [key, rawValue] = attribute.split('=', 2);
            switch (key.toLowerCase()) {
                case 'httponly':
                    options.httpOnly = true;
                    break;
                case 'secure':
                    options.secure = true;
                    break;
                case 'path':
                    options.path = rawValue ?? '/';
                    break;
                case 'samesite':
                    options.sameSite =
                        rawValue?.toLowerCase() === 'strict'
                            ? 'strict'
                            : rawValue?.toLowerCase() === 'none'
                              ? 'none'
                              : 'lax';
                    break;
                case 'max-age':
                    if (rawValue) {
                        options.maxAge = Number(rawValue);
                    }
                    break;
                case 'expires':
                    if (rawValue) {
                        options.expires = new Date(rawValue);
                    }
                    break;
            }
        }

        cookies.set(name, value, options);
    }

    return response;
}

export async function responseError(response: Response, fallback: string) {
    try {
        const body = (await response.json()) as { error?: { message?: string } };
        return body.error?.message ?? fallback;
    } catch {
        return fallback;
    }
}
