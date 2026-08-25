import { record, type JsonValue } from '#utils';
import { z } from 'zod';
import { origin, userAgent } from './client';

interface ClientData {
    bootstrap: Record<string, JsonValue> | null;
    buildId: string;
    mask: Buffer;
    bootPrefix?: string;
    join?: string;
    parts?: Array<'buildId' | 'group' | 'host' | 'epoch' | 'lane'>;
    omitEmptyLane?: boolean;
}

interface StringResolver {
    argument: number;
    offset: number;
}

const fragmentSchema = z.object({
    buildId: z.string().min(1),
    maskParts: z.array(z.string()).length(4),
    params: z.object({
        saltMul: z.number().finite(),
        saltAdd: z.number().finite(),
        fragMul: z.number().finite(),
        fragAdd: z.number().finite(),
        join: z.string(),
        bootPrefix: z.string(),
        parts: z.array(z.enum(['buildId', 'group', 'host', 'epoch', 'lane'])).min(1),
        omitEmptyLane: z.boolean().optional(),
    }),
});

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

function callArguments(first: string, second: string | undefined): number[] {
    return [first, second].filter((value): value is string => value !== undefined).map(Number);
}

function decodeMaskParts(source: string, values: string[], wrappers: Map<string, StringResolver>) {
    const valueAt = (resolver: StringResolver, args: number[]) => {
        const argument = args[resolver.argument];
        return argument === undefined ? undefined : values[argument - resolver.offset];
    };

    return [...source.matchAll(/\w+\(-?\d+(?:,-?\d+)?\)\+\w+\(-?\d+(?:,-?\d+)?\)/g)].flatMap(
        ([expression]) => {
            const calls = [...expression.matchAll(/(\w+)\((-?\d+)(?:,(-?\d+))?\)/g)];
            if (calls.length !== 2) {
                return [];
            }

            const part = calls
                .map((call) => {
                    const resolver = wrappers.get(call[1]);
                    return resolver
                        ? valueAt(resolver, callArguments(call[2], call[3]))
                        : undefined;
                })
                .join('');

            return part ? [Buffer.from(part, 'base64')] : [];
        }
    );
}

function splitTopLevel(value: string, delimiter: ',' | '+') {
    const parts: string[] = [];
    let start = 0;
    let depth = 0;
    let quote: string | null = null;
    let escaped = false;

    for (let index = 0; index < value.length; index++) {
        const character = value[index];
        if (quote) {
            if (escaped) {
                escaped = false;
            } else if (character === '\\') {
                escaped = true;
            } else if (character === quote) {
                quote = null;
            }
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
        } else if (character === '(' || character === '[' || character === '{') {
            depth++;
        } else if (character === ')' || character === ']' || character === '}') {
            depth--;
        } else if (character === delimiter && depth === 0) {
            parts.push(value.slice(start, index).trim());
            start = index + 1;
        }
    }
    parts.push(value.slice(start).trim());
    return parts;
}

function stringLiteral(value: string) {
    if (value.startsWith('"')) {
        const parsed = z.string().safeParse(JSON.parse(value));
        return parsed.success ? parsed.data : null;
    }
    if (!value.startsWith("'") || !value.endsWith("'")) {
        return null;
    }
    return value.slice(1, -1).replace(/\\(["'\\])/g, '$1');
}

function resolverMap(chunk: string, table: string) {
    const resolvers = new Map<string, StringResolver>();
    const direct = new RegExp(
        `function\\s+(\\w+)\\((\\w+)(?:,(\\w+))?\\)\\{return\\s+${table}\\(\\)\\[(\\w+)\\]\\}`,
        'g'
    );
    for (const match of chunk.matchAll(direct)) {
        const argument = match[4] === match[2] ? 0 : match[4] === match[3] ? 1 : -1;
        if (argument >= 0) {
            resolvers.set(match[1], { argument, offset: 0 });
        }
    }

    const base = new RegExp(
        `function\\s+(\\w+)\\((\\w+)(?:,(\\w+))?\\)\\{return\\s+(\\w+)=\\4-\\(?([-+*/\\d ]+)\\)?,${table}\\(\\)\\[\\4\\]\\}`,
        'g'
    );
    for (const match of chunk.matchAll(base)) {
        const argument = match[4] === match[2] ? 0 : match[4] === match[3] ? 1 : -1;
        const offset = calculate(match[5]);
        if (argument >= 0 && Number.isSafeInteger(offset)) {
            resolvers.set(match[1], { argument, offset });
        }
    }

    for (let pass = 0; pass < 4; pass++) {
        let changed = false;
        const wrapper =
            /function\s+(\w+)\((\w+)(?:,(\w+))?\)\{return\s+(\w+)\((\w+)-\s*([-+*/\d ]+)\)\}/g;
        for (const match of chunk.matchAll(wrapper)) {
            const parent = resolvers.get(match[4]);
            if (!parent || resolvers.has(match[1])) {
                continue;
            }
            const argument = match[5] === match[2] ? 0 : match[5] === match[3] ? 1 : -1;
            const offset = calculate(match[6]);
            if (argument >= 0 && Number.isSafeInteger(offset)) {
                resolvers.set(match[1], { argument, offset: parent.offset + offset });
                changed = true;
            }
        }
        if (!changed) {
            break;
        }
    }
    return resolvers;
}

function resolveString(
    expression: string,
    values: string[],
    resolvers: Map<string, StringResolver>
) {
    let result = '';
    for (const part of splitTopLevel(expression, '+')) {
        const literal = stringLiteral(part);
        if (literal !== null) {
            result += literal;
            continue;
        }
        const call = /^(\w+)\((-?\d+)(?:,(-?\d+))?\)$/.exec(part);
        const resolver = call ? resolvers.get(call[1]) : null;
        if (!call || !resolver) {
            return null;
        }
        const args = callArguments(call[2], call[3]);
        const argument = args[resolver.argument];
        const value = argument === undefined ? undefined : values[argument - resolver.offset];
        if (value === undefined) {
            return null;
        }
        result += value;
    }
    return result;
}

function objectProperties(expression: string) {
    const properties = new Map<string, string>();
    if (!expression.startsWith('{') || !expression.endsWith('}')) {
        return properties;
    }
    for (const entry of splitTopLevel(expression.slice(1, -1), ',')) {
        const colon = entry.indexOf(':');
        if (colon > 0) {
            properties.set(entry.slice(0, colon).trim(), entry.slice(colon + 1).trim());
        }
    }
    return properties;
}

function resolveStringArray(
    expression: string,
    values: string[],
    resolvers: Map<string, StringResolver>
) {
    if (!expression.startsWith('[') || !expression.endsWith(']')) {
        return null;
    }
    const resolved = splitTopLevel(expression.slice(1, -1), ',').map((part) =>
        resolveString(part, values, resolvers)
    );
    return resolved.every((value): value is string => value !== null) ? resolved : null;
}

function decodeFragmentCryptoChunk(chunk: string) {
    const configAt = chunk.search(/\b(?:saltMul|fragMul)\s*:/);
    const declarationAt = configAt === -1 ? -1 : chunk.lastIndexOf('const ', configAt);
    const layout =
        declarationAt === -1
            ? null
            : /const\s+([A-Za-z_$][\w$]*)\s*=\s*(.+?),\s*[A-Za-z_$][\w$]*\s*=\s*Number\([^;]+?\),\s*[A-Za-z_$][\w$]*\s*=\s*Number\([^;]+?\),\s*([A-Za-z_$][\w$]*)\s*=\s*(\[[^\]]+\]),\s*([A-Za-z_$][\w$]*)\s*=\s*(\{[^{}]+\})\s*;\s*function\s+[A-Za-z_$][\w$]*\s*\(/.exec(
                  chunk.slice(declarationAt)
              );
    if (!layout) return null;

    const [, , buildExpr, , partsExpr, , configExpr] = layout;
    const config = objectProperties(configExpr);
    const tables = chunk.matchAll(
        /function\s+(\w+)\(\)\{const\s+\w+=\[(.*?)\];return\s+\1=function/gs
    );
    let parsed: z.infer<typeof fragmentSchema> | null = null;
    for (const table of tables) {
        const strings = [...table[2].matchAll(/"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g)].flatMap(
            (match) => {
                const value = stringLiteral(match[0]);
                return value === null ? [] : [value];
            }
        );
        const resolvers = resolverMap(chunk, table[1]);
        for (let rotation = 0; rotation < strings.length; rotation++) {
            const values = [...strings.slice(rotation), ...strings.slice(0, rotation)];
            const buildId = resolveString(buildExpr, values, resolvers);
            const maskParts = resolveStringArray(partsExpr, values, resolvers);
            const bootPrefixExpression = config.get('bootPrefix');
            const joinExpression = config.get('join');
            const partsExpression = config.get('parts');
            const bootPrefix = bootPrefixExpression
                ? resolveString(bootPrefixExpression, values, resolvers)
                : null;
            const join = joinExpression ? resolveString(joinExpression, values, resolvers) : null;
            const parts = partsExpression
                ? resolveStringArray(partsExpression, values, resolvers)
                : null;
            const omitEmptyLane = config.get('omitEmptyLane');
            const candidate = fragmentSchema.safeParse({
                buildId,
                maskParts,
                params: {
                    saltMul: calculate(config.get('saltMul') ?? ''),
                    saltAdd: calculate(config.get('saltAdd') ?? ''),
                    fragMul: calculate(config.get('fragMul') ?? ''),
                    fragAdd: calculate(config.get('fragAdd') ?? ''),
                    bootPrefix,
                    join,
                    parts,
                    omitEmptyLane:
                        omitEmptyLane === 'true' || omitEmptyLane === '!0'
                            ? true
                            : omitEmptyLane === 'false' || omitEmptyLane === '!1'
                              ? false
                              : undefined,
                },
            });
            if (
                candidate.success &&
                candidate.data.maskParts.every((part) => Buffer.from(part, 'base64').length === 8)
            ) {
                parsed = candidate.data;
                break;
            }
        }
        if (parsed) {
            break;
        }
    }
    if (!parsed) return null;

    const { buildId, maskParts, params } = parsed;
    const salt = Buffer.alloc(32);
    for (let index = 0; index < salt.length; index++) {
        salt[index] =
            (buildId.charCodeAt(index % buildId.length) || 0) ^
            ((index * params.saltMul + params.saltAdd) & 0xff);
    }
    const mask = Buffer.alloc(32);
    for (let group = 0; group < 4; group++) {
        const part = Buffer.from(maskParts[group], 'base64');
        if (part.length !== 8) return null;
        for (let index = 0; index < 8; index++) {
            mask[group * 8 + index] =
                part[index] ^
                salt[group * 8 + index] ^
                ((group * params.fragMul + index * params.fragAdd) & 0xff);
        }
    }
    return {
        buildId,
        mask,
        bootPrefix: params.bootPrefix,
        join: params.join,
        parts: params.parts,
        omitEmptyLane: params.omitEmptyLane ?? false,
    };
}

export function decodeChunk(chunk: string): Omit<ClientData, 'bootstrap'> | null {
    const fragments = decodeFragmentCryptoChunk(chunk);
    if (fragments) return fragments;

    const legacy = chunk.match(
        /\?["']([0-9a-f]{64})["']:["']["'],\w+=[^;]{0,100}\?["']([A-Za-z0-9._-]+)["']:["']["']/
    );
    if (legacy) {
        return {
            mask: Buffer.from(legacy[1], 'hex'),
            buildId: legacy[2],
        };
    }

    if (!chunk.includes('/client-crypto/v1/bootstrap?buildId=') || !chunk.includes('partB')) {
        return null;
    }

    // AllAnime ships these values through a rotated string table. Resolve
    // only the small arithmetic/string subset the client itself uses.
    const table = [
        ...chunk.matchAll(/function (\w+)\(\)\{const \w+=\[(.*?)\];return \1=function/g),
    ].find((match) => match[2].includes('"aa-boo"') && match[2].includes('"web_cr"'));
    const base = table
        ? chunk.match(
              new RegExp(
                  `function (\\w+)\\((\\w+),\\w+\\)\\{return \\2=\\2-\\(?([-+*/\\d ]+)\\)?,${table[1]}\\(\\)\\[\\2\\]\\}`
              )
          )
        : null;

    if (!table || !base) {
        return null;
    }

    const baseOffset = calculate(base[3]);
    if (!Number.isSafeInteger(baseOffset)) {
        return null;
    }

    const wrappers = new Map<string, StringResolver>();
    const pattern = new RegExp(
        `function (\\w+)\\((\\w+),(\\w+)\\)\\{return ${base[1]}\\((\\2|\\3)-\\s*([-+*/\\d ]+)\\)\\}`,
        'g'
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

    const strings = [...table[2].matchAll(/"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g)].map(
        (match) => (match[1] ?? match[2]).replace(/\\(["'\\])/g, '$1')
    );
    const valueAt = (values: string[], resolver: StringResolver, args: number[]) => {
        const argument = args[resolver.argument];
        return argument === undefined ? undefined : values[argument - resolver.offset];
    };
    const clientPattern =
        /const \w+=(\w+)\((-?\d+)(?:,(-?\d+))?\)\+\1\((-?\d+)(?:,(-?\d+))?\)!==["']string["']\?["']([A-Za-z0-9._-]+)["']:["']["']/g;

    for (const client of chunk.matchAll(clientPattern)) {
        const buildResolver = wrappers.get(client[1]);
        if (!buildResolver) {
            continue;
        }

        const firstArgs = callArguments(client[2], client[3]);
        const secondArgs = callArguments(client[4], client[5]);
        let values: string[] | null = null;

        for (let rotation = 0; rotation < strings.length; rotation++) {
            const rotated = [...strings.slice(rotation), ...strings.slice(0, rotation)];

            if (
                `${valueAt(rotated, buildResolver, firstArgs) ?? ''}${valueAt(rotated, buildResolver, secondArgs) ?? ''}` ===
                'undefined'
            ) {
                values = rotated;
                break;
            }
        }

        if (!values) {
            continue;
        }

        const nearby = chunk.slice(
            (client.index ?? 0) + client[0].length,
            (client.index ?? 0) + client[0].length + 4_000
        );
        const arrays = nearby.matchAll(/(?:(?:const|let|var) )?\w+=\[([^\]]+)\]/g);

        for (const array of arrays) {
            const parts = decodeMaskParts(array[1], values, wrappers);
            if (parts.length !== 4 || parts.some((part) => part.length !== 8)) {
                continue;
            }

            const buildId = client[6];
            const seed = Buffer.alloc(32);

            for (let index = 0; index < seed.length; index++) {
                seed[index] =
                    buildId.charCodeAt(index % buildId.length) ^ ((index * 17 + 31) & 0xff);
            }

            const mask = Buffer.alloc(32);
            parts.forEach((part, group) => {
                for (let index = 0; index < part.length; index++) {
                    const offset = group * part.length + index;
                    mask[offset] = part[index] ^ seed[offset] ^ ((group * 41 + index * 7) & 0xff);
                }
            });

            return { buildId, mask };
        }
    }

    return null;
}

export async function getClientData(): Promise<ClientData> {
    const pageResponse = await fetch(origin, {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(10_000),
    });
    if (!pageResponse.ok) {
        throw new Error(`AllAnime bootstrap failed (${pageResponse.status})`);
    }

    const page = await pageResponse.text();
    const rawBootstrap = page.match(/window\.__aaCrypto=(\{[^;]+\})/)?.[1];
    const appUrl = page.match(/https:\/\/[^"' ]+\/immutable\/entry\/app\.[^"' ]+\.js/)?.[0];

    if (!appUrl) {
        throw new Error('AllAnime app manifest was not found');
    }

    const appResponse = await fetch(appUrl, {
        signal: AbortSignal.timeout(10_000),
    });
    if (!appResponse.ok) {
        throw new Error(`AllAnime app manifest failed (${appResponse.status})`);
    }

    const app = await appResponse.text();
    const chunks = [
        ...new Set(
            [...app.matchAll(/["'](\.\.\/chunks\/[^"']+\.js)["']/g)].map((match) =>
                new URL(match[1], appUrl).toString()
            )
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
            bootstrap: rawBootstrap ? record(JSON.parse(rawBootstrap)) : null,
        };
    }

    throw new Error('AllAnime client encryption data was not found');
}
