export const clearance = { cookie: 'arc_human', maxAge: 60 * 60 * 24 * 7 } as const;

export async function createClearance(secret: string, now = Date.now()) {
    const expiry = String(Math.floor(now / 1000) + clearance.maxAge);
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(expiry));
    return `${expiry}.${Buffer.from(mac).toString('base64url')}`;
}

export async function verifyClearance(value: string | undefined, secret: string, now = Date.now()) {
    if (!value || !secret) return false;

    const [expiry, mac, extra] = value.split('.');
    const expires = Number(expiry);
    const nowSec = Math.floor(now / 1000);
    if (
        extra !== undefined ||
        !expiry ||
        !mac ||
        !Number.isSafeInteger(expires) ||
        expires <= nowSec ||
        expires > nowSec + clearance.maxAge
    ) {
        return false;
    }

    try {
        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );
        return crypto.subtle.verify(
            'HMAC',
            key,
            Buffer.from(mac, 'base64url'),
            new TextEncoder().encode(expiry)
        );
    } catch {
        return false;
    }
}
