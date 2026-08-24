import type { AnimeCard } from '@arc/shared/types';

const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;

export function watchlistCardFreshForMs(card: Pick<AnimeCard, 'format' | 'status'>) {
    if (!card.format || !card.status) {
        return DAY;
    }

    switch (card.status) {
        case 'RELEASING':
            return 6 * HOUR;
        case 'HIATUS':
            return 7 * DAY;
        case 'FINISHED':
        case 'CANCELLED':
            return 90 * DAY;
        default:
            return DAY;
    }
}
