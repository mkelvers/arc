import { writeFile } from 'node:fs/promises';

process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@localhost/openapi';
process.env.BETTER_AUTH_SECRET ??= 'openapi-generation-only-secret-at-least-32-characters';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3001';
process.env.ARC_WEB_ORIGIN ??= 'http://localhost:5173';

const { default: app } = await import('./app');

const response = await app.request('/openapi.json');
if (!response.ok) {
    throw new Error(`OpenAPI generation failed with ${response.status}`);
}
const document: unknown = await response.json();
await writeFile(
    new URL('../openapi.json', import.meta.url),
    `${JSON.stringify(document, null, 4)}\n`
);
