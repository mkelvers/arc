import app from './app';
import { apiIdleTimeoutSeconds } from './server-policy';

Bun.serve({
    port: process.env.PORT,
    idleTimeout: apiIdleTimeoutSeconds,
    fetch: app.fetch,
});
