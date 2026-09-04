import * as cheerio from 'cheerio';

import type { FranchiseOrder } from '../../types';
import { positiveInteger } from '../../user/utils';

export interface ChiakiEntry {
    malId: number;
    typeId: string;
    title: string;
    alternativeTitle: string;
    image: string;
    secondary: boolean;
}

function imageFromStyle(style: string | undefined) {
    const path = style?.match(/url\((['"]?)(.*?)\1\)/i)?.[2]?.trim();
    return path ? new URL(path, 'https://chiaki.site').href : '';
}

export function parseOrder(html: string) {
    const $ = cheerio.load(html);
    const types = $('#wo_type_filter label')
        .map((_, label) => {
            const input = $(label).find("input[type='checkbox']").first();
            const id = input.attr('value')?.trim();
            const text = $(label).text().replace(/\s+/g, ' ').trim();

            return id && text ? { id, label: text } : null;
        })
        .get()
        .filter((type): type is FranchiseOrder['types'][number] => Boolean(type));
    const entries = $('#wo_list tr[data-id]')
        .map((_, row) => {
            const element = $(row);
            const entry: ChiakiEntry = {
                malId: positiveInteger(element.attr('data-id')) ?? 0,
                typeId: element.attr('data-type')?.trim() ?? '',
                title: element.find('.wo_title').first().text().trim(),
                alternativeTitle: element.find('.uk-text-small').first().text().trim(),
                image: imageFromStyle(element.find('.wo_avatar_big').first().attr('style')),
                secondary: element.hasClass('wo_row_secondary'),
            };

            return entry.malId && entry.typeId && entry.title && entry.image ? entry : null;
        })
        .get()
        .filter((entry): entry is ChiakiEntry => Boolean(entry));

    if (!types.length || !entries.length) {
        throw new Error('Chiaki watch-order markup was not found');
    }

    return { types, entries };
}

export async function fetchOrder(malId: number) {
    const response = await fetch(`https://chiaki.site/?/tools/watch_order/id/${malId}`, {
        headers: {
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
            Referer: 'https://chiaki.site/',
            'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
        throw new Error(`Chiaki returned ${response.status}`);
    }

    const html = await response.text();
    if (html.length > 2 * 1024 * 1024) {
        throw new Error('Chiaki response was unexpectedly large');
    }

    return parseOrder(html);
}
