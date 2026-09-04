import type { AnimeCard } from '@arc/core/client';

export type AnimeCardItem = AnimeCard & {
    backdrop?: string | null;
};

export interface AnimeCardProps {
    anime: AnimeCardItem;
    meta?: string;
    compact?: boolean;
    current?: boolean;
    onselect?: () => void;
    reserveTitleSpace?: boolean;
    truncateTitle?: boolean;
}
