import {
    createCipheriv,
    createDecipheriv,
    createHash,
    createHmac,
} from 'node:crypto';

import { getClientData } from './bootstrap';
import {
    contentLane,
    endpoint,
    origin,
    record,
    userAgent,
} from './client';
import type { StreamCrypto } from './types';

const epochLength = 259_200_000;
const graceLength = 86_400_000;

let cache: StreamCrypto | null = null;

export async function getCrypto(refresh = false) {
    if (!refresh && cache && Date.now() < cache.refreshAt) {
        return cache;
    }

    const client = await getClientData();
    let bootstrap = client.bootstrap;

    if (!bootstrap) {
        const now = Date.now();
        const epoch = Math.floor(now / epochLength);
        const epochs =
            now - epoch * epochLength < graceLength
                ? [epoch - 1, epoch]
                : [epoch];
        const secret = createHmac('sha256', client.mask)
            .update(`aa-boot:${client.buildId}`)
            .digest();
        let status = 0;

        for (const candidate of epochs) {
            const token = createHmac('sha256', secret)
                .update(
                    `${client.buildId}:mkissa:mkissa.to:${candidate}:${contentLane}`,
                )
                .digest('hex');
            const response = await fetch(
                new URL(
                    `/client-crypto/v1/bootstrap?buildId=${encodeURIComponent(client.buildId)}&k=${contentLane}`,
                    endpoint,
                ),
                {
                    headers: {
                        Origin: origin,
                        Referer: `${origin}/`,
                        'User-Agent': userAgent,
                        'x-aa-boot': token,
                        'x-build-id': client.buildId,
                    },
                    signal: AbortSignal.timeout(10_000),
                },
            );
            status = response.status;

            if (!response.ok) {
                continue;
            }

            bootstrap = record(await response.json());
            if (bootstrap) {
                break;
            }
        }

        if (!bootstrap) {
            throw new Error(`AllAnime bootstrap failed (${status})`);
        }
    }

    const epoch = Number(bootstrap.epoch);
    const part = Buffer.from(String(bootstrap.partB ?? ''), 'base64');

    if (
        !Number.isSafeInteger(epoch) ||
        part.length !== 32 ||
        (bootstrap.k && bootstrap.k !== contentLane)
    ) {
        throw new Error('AllAnime bootstrap data was invalid');
    }

    const key = Buffer.alloc(32);
    for (let index = 0; index < key.length; index++) {
        key[index] = part[index] ^ client.mask[index];
    }

    cache = {
        buildId: client.buildId,
        epoch,
        key,
        refreshAt: Math.min(
            Date.now() + 300_000,
            Number(bootstrap.switchAt) || Number.POSITIVE_INFINITY,
        ),
    };

    return cache;
}

export function lease(crypto: StreamCrypto, queryHash: string) {
    const timestamp = Math.floor(Date.now() / 300_000) * 300_000;
    const iv = createHash('sha256')
        .update(
            `${crypto.epoch}:${crypto.buildId}:${queryHash}:${timestamp}:${contentLane}`,
        )
        .digest()
        .subarray(0, 12);
    const payload = JSON.stringify({
        v: 1,
        ts: timestamp,
        epoch: crypto.epoch,
        buildId: crypto.buildId,
        qh: queryHash,
        k: contentLane,
    });
    const cipher = createCipheriv('aes-256-gcm', crypto.key, iv);
    const encrypted = Buffer.concat([
        cipher.update(payload, 'utf8'),
        cipher.final(),
    ]);

    return Buffer.concat([
        Buffer.from([1]),
        iv,
        encrypted,
        cipher.getAuthTag(),
    ]).toString('base64');
}

export function decrypt(value: string, key: Buffer) {
    const encrypted = Buffer.from(value, 'base64');

    if (encrypted.length < 30 || encrypted[0] !== 1) {
        throw new Error('AllAnime returned an invalid encrypted payload');
    }

    const iv = encrypted.subarray(1, 13);
    const tag = encrypted.subarray(-16);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    return JSON.parse(
        Buffer.concat([
            decipher.update(encrypted.subarray(13, -16)),
            decipher.final(),
        ]).toString('utf8'),
    ) as unknown;
}
