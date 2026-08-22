function required(name: string) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new TypeError(`${name} is required`);
    }
    return value;
}

export const apiOrigin = required('BETTER_AUTH_URL');
export const authSecret = required('BETTER_AUTH_SECRET');
export const webOrigin = required('ARC_WEB_ORIGIN');
export const cookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim() || null;
export const trustedProxyIpHeader =
    process.env.TRUSTED_PROXY_IP_HEADER?.trim().toLowerCase() || null;
