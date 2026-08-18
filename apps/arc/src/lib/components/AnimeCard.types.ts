import type { AnimeCard } from '$lib/types';

export type AnimeCardItem = AnimeCard & {
    backdrop?: string | null;
};

export interface AnimeCardProps {
    anime: AnimeCardItem;
    compact?: boolean;
    current?: boolean;
    onselect?: () => void;
}
