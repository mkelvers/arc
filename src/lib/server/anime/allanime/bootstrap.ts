import { origin, record, userAgent } from './client';

interface ClientData {
    bootstrap: Record<string, unknown> | null;
    buildId: string;
    mask: Buffer;
}

function calculate(expression: string) {
    const tokens = expression.match(/\d+|[-+*/]/g) ?? [];
    if (tokens.join('') !== expression.replaceAll(' ', '')) {
        return NaN;
    }

    let position = 0;
    const factor = (): number => {
        const operator = tokens[position];
        if (operator === '+' || operator === '-') {
            position++;
            const value = factor();
            return operator === '-' ? -value : value;
        }

        const value = Number(tokens[position++]);
        return Number.isFinite(value) ? value : NaN;
    };
    const term = () => {
        let value = factor();

        while (tokens[position] === '*' || tokens[position] === '/') {
            const operator = tokens[position++];
            const right = factor();
            value = operator === '*' ? value * right : value / right;
        }

        return value;
    };
    let value = term();

    while (tokens[position] === '+' || tokens[position] === '-') {
        const operator = tokens[position++];
        const right = term();
        value = operator === '+' ? value + right : value - right;
    }

    return position === tokens.length ? value : NaN;
}

function decodeChunk(chunk: string) {
    const legacy = chunk.match(
        /\?["']([0-9a-f]{64})["']:["']["'],\w+=[^;]{0,100}\?["']([A-Za-z0-9._-]+)["']:["']["']/,
    );
    if (legacy) {
        return {
            mask: Buffer.from(legacy[1], 'hex'),
            buildId: legacy[2],
        };
    }

    if (
        !chunk.includes('/client-crypto/v1/bootstrap?buildId=') ||
        !chunk.includes('aa-boo') ||
        !chunk.includes('partB')
    ) {
        return null;
    }

    // AllAnime ships these values through a rotated string table. Resolve
    // only the small arithmetic/string subset the client itself uses.
    const table = [
        ...chunk.matchAll(
            /function (\w+)\(\)\{const \w+=\[(.*?)\];return \1=function/g,
        ),
    ].find(
        (match) =>
            match[2].includes('"aa-boo"') &&
            match[2].includes('"web_cr"'),
    );
    const base = table
        ? chunk.match(
              new RegExp(
                  `function (\\w+)\\((\\w+),\\w+\\)\\{return \\2=\\2-\\(([-+*/\\d ]+)\\),${table[1]}\\(\\)\\[\\2\\]\\}`,
              ),
          )
        : null;

    if (!table || !base) {
        return null;
    }

    const baseOffset = calculate(base[3]);
    if (!Number.isSafeInteger(baseOffset)) {
        return null;
    }

    const wrappers = new Map<string, { argument: number; offset: number }>();
    const pattern = new RegExp(
        `function (\\w+)\\((\\w+),(\\w+)\\)\\{return ${base[1]}\\((\\2|\\3)-\\s*([-+*/\\d ]+)\\)\\}`,
        'g',
    );

    for (const wrapper of chunk.matchAll(pattern)) {
        const offset = calculate(wrapper[5]);
        if (!Number.isSafeInteger(offset)) {
            continue;
        }

        wrappers.set(wrapper[1], {
            argument: wrapper[4] === wrapper[2] ? 0 : 1,
            offset: baseOffset + offset,
        });
    }

    const client = chunk.match(
        /const \w+=(\w+)\((\d+)\)\+\1\((\d+)\)!=="string"\?"([A-Za-z0-9._-]+)":"",\w+=\[([^\]]+)\]/,
    );
    const buildResolver = client ? wrappers.get(client[1]) : null;

    if (!client || !buildResolver) {
        return null;
    }

    const strings = [
        ...table[2].matchAll(/"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g),
    ].map((match) => (match[1] ?? match[2]).replace(/\\(["'\\])/g, '$1'));
    const valueAt = (
        values: string[],
        resolver: { argument: number; offset: number },
        args: number[],
    ) => values[args[resolver.argument] - resolver.offset];
    let values: string[] | null = null;

    for (let rotation = 0; rotation < strings.length; rotation++) {
        const rotated = [
            ...strings.slice(rotation),
            ...strings.slice(0, rotation),
        ];

        if (
            valueAt(rotated, buildResolver, [Number(client[2])]) +
                valueAt(rotated, buildResolver, [Number(client[3])]) ===
            'undefined'
        ) {
            values = rotated;
            break;
        }
    }

    if (!values) {
        return null;
    }

    const parts = [
        ...client[5].matchAll(
            /\w+\(\d+(?:,\d+)?\)\+\w+\(\d+(?:,\d+)?\)/g,
        ),
    ].flatMap(([expression]) => {
        const calls = [
            ...expression.matchAll(/(\w+)\((\d+)(?:,(\d+))?\)/g),
        ];
        if (calls.length !== 2) {
            return [];
        }

        const part = calls
            .map((call) => {
                const resolver = wrappers.get(call[1]);
                const args = call
                    .slice(2)
                    .filter((value): value is string => Boolean(value))
                    .map(Number);

                return resolver ? valueAt(values!, resolver, args) : '';
            })
            .join('');

        return part ? [Buffer.from(part, 'base64')] : [];
    });

    if (parts.length !== 4 || parts.some((part) => part.length !== 8)) {
        return null;
    }

    const buildId = client[4];
    const seed = Buffer.alloc(32);

    for (let index = 0; index < seed.length; index++) {
        seed[index] =
            buildId.charCodeAt(index % buildId.length) ^
            ((index * 17 + 31) & 0xff);
    }

    const mask = Buffer.alloc(32);
    parts.forEach((part, group) => {
        for (let index = 0; index < part.length; index++) {
            const offset = group * part.length + index;
            mask[offset] =
                part[index] ^
                seed[offset] ^
                ((group * 41 + index * 7) & 0xff);
        }
    });

    return { buildId, mask };
}

export async function getClientData(): Promise<ClientData> {
    const pageResponse = await fetch(origin, {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(10_000),
    });
    if (!pageResponse.ok) {
        throw new Error(
            `AllAnime bootstrap failed (${pageResponse.status})`,
        );
    }

    const page = await pageResponse.text();
    const rawBootstrap = page.match(/window\.__aaCrypto=(\{[^;]+\})/)?.[1];
    const appUrl = page.match(
        /https:\/\/[^"' ]+\/immutable\/entry\/app\.[^"' ]+\.js/,
    )?.[0];

    if (!appUrl) {
        throw new Error('AllAnime app manifest was not found');
    }

    const appResponse = await fetch(appUrl, {
        signal: AbortSignal.timeout(10_000),
    });
    if (!appResponse.ok) {
        throw new Error(
            `AllAnime app manifest failed (${appResponse.status})`,
        );
    }

    const app = await appResponse.text();
    const chunks = [
        ...new Set(
            [...app.matchAll(/["'](\.\.\/chunks\/[^"']+\.js)["']/g)].map(
                (match) => new URL(match[1], appUrl).toString(),
            ),
        ),
    ];

    for (const url of chunks) {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
            continue;
        }

        const decoded = decodeChunk(await response.text());
        if (!decoded) {
            continue;
        }

        return {
            ...decoded,
            bootstrap: rawBootstrap
                ? record(JSON.parse(rawBootstrap))
                : null,
        };
    }

    throw new Error('AllAnime client encryption data was not found');
}
