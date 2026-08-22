import { writeFile } from 'node:fs/promises';

import app from './app';

const response = await app.request('/openapi.json');
if (!response.ok) {
    throw new Error(`OpenAPI generation failed with ${response.status}`);
}
const document: unknown = await response.json();
await writeFile(
    new URL('../openapi.json', import.meta.url),
    `${JSON.stringify(document, null, 4)}\n`
);
