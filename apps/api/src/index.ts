import app from './app';
import { trustedProxyIpHeader } from './config';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    throw new TypeError('PORT must be a valid TCP port');
}

Bun.serve({
    port,
    fetch(request, server) {
        const headers = new Headers(request.headers);
        const forwarded = trustedProxyIpHeader
            ? request.headers.get(trustedProxyIpHeader)?.split(',', 1)[0]?.trim()
            : null;
        const clientIp = forwarded || server.requestIP(request)?.address;
        if (clientIp) headers.set('x-arc-client-ip', clientIp);
        else headers.delete('x-arc-client-ip');
        return app.fetch(new Request(request, { headers }));
    },
});
console.log(`Arc API listening on port ${port}`);
