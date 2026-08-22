import app from './app';

Bun.serve({
    port: process.env.PORT,
    fetch: app.fetch,
});
