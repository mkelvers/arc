import { describe, expect, test } from 'bun:test';

import { encryptedSources } from './allanime';

const crypto = {
    buildId: 'build-test',
    epoch: 1,
    key: Buffer.alloc(32),
    refreshAt: Number.POSITIVE_INFINITY,
};
const sourcePayload = {
    data: {
        episode: {
            sourceUrls: [{ sourceName: 'default', sourceUrl: 'https://media.example/video.m3u8' }],
        },
    },
};

describe('AllAnime episode source requests', () => {
    test('tries the expanded persisted hash after the old query is rejected', async () => {
        const requests: Request[] = [];
        const fetcher = async (input: URL | RequestInfo, init?: RequestInit) => {
            requests.push(new Request(input, init));
            return requests.length === 1
                ? Response.json({
                      errors: [
                          {
                              message:
                                  'Cannot set properties of undefined (setting countryOfOrigin)',
                          },
                      ],
                  })
                : Response.json(sourcePayload);
        };

        await expect(encryptedSources('show-1', '2', 'sub', crypto, fetcher)).resolves.toEqual([
            { name: 'default', url: 'https://media.example/video.m3u8' },
        ]);

        expect(new URL(requests[0].url).searchParams.get('extensions')).toContain(
            'b0a4efecd8df8fce709468d54aaa716b712c93b5b7e351888ddc242898abc38e'
        );
        expect(new URL(requests[1].url).searchParams.get('extensions')).toContain(
            '04bd3a7b24fc732c07c2e3bd92126bcdd901293c9dfbe678352dca0f4877d697'
        );
    });

    test('posts the expanded query when both persisted requests fail', async () => {
        const requests: Request[] = [];
        const fetcher = async (input: URL | RequestInfo, init?: RequestInit) => {
            requests.push(new Request(input, init));
            return requests.length < 3
                ? Response.json({ errors: [{ message: 'Context creation failed' }] })
                : Response.json(sourcePayload);
        };

        await expect(encryptedSources('show-1', '2', 'sub', crypto, fetcher)).resolves.toHaveLength(
            1
        );

        expect(requests[2].method).toBe('POST');
        const body = (await requests[2].json()) as {
            query: string;
            extensions: { persistedQuery: { sha256Hash: string }; aaReq: string };
        };
        expect(body.query).toContain('lastEpisodeInfo');
        expect(body.query).toContain('pageStatus');
        expect(body.extensions.persistedQuery.sha256Hash).toBe(
            '04bd3a7b24fc732c07c2e3bd92126bcdd901293c9dfbe678352dca0f4877d697'
        );
        expect(body.extensions.aaReq).toBeString();
    });
});
