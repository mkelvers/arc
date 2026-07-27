import { error, type RequestHandler } from '@sveltejs/kit';

const allowedHosts = [
    'tools.fast4speed.rsvp',
    'repackager.wixmp.com',
    'video.wixstatic.com',
    'mp4upload.com',
    'sharepoint.com',
];
const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';

function source(value: string | null) {
    if (!value) {
        error(400, 'Missing stream URL');
    }

    let target: URL;
    try {
        target = new URL(value);
    } catch {
        error(400, 'Invalid stream URL');
    }

    if (
        target.protocol !== 'https:' ||
        !allowedHosts.some(
            (host) => target.hostname === host || target.hostname.endsWith(`.${host}`),
        )
    ) {
        error(403, 'Unsupported stream host');
    }

    return target;
}

export const GET: RequestHandler = async ({ request, url, fetch }) => {
    const target = source(url.searchParams.get('url'));
    const range = request.headers.get('range');
    const response = await fetch(target, {
        headers: {
            Referer: target.hostname.endsWith('.mp4upload.com')
                ? 'https://www.mp4upload.com'
                : 'https://youtu-chan.com',
            'User-Agent': userAgent,
            ...(range ? { Range: range } : {}),
        },
    });

    if (!response.ok && response.status !== 206) {
        error(response.status, 'Episode stream failed');
    }

    const headers = new Headers();
    for (const name of [
        'accept-ranges',
        'cache-control',
        'content-length',
        'content-range',
        'etag',
        'last-modified',
    ]) {
        const value = response.headers.get(name);
        if (value) {
            headers.set(name, value);
        }
    }
    const contentType = response.headers.get('content-type');
    headers.set(
        'content-type',
        !contentType || contentType === 'application/octet-stream'
            ? 'video/mp4'
            : contentType,
    );

    return new Response(response.body, {
        status: response.status,
        headers,
    });
};
