const seasonOrder = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const;

export type AnimeSeason = (typeof seasonOrder)[number];

export interface AnimeSeasonSelection {
    season: AnimeSeason;
    year: number;
}

export type AnimeSeasonStartYears = Partial<Record<AnimeSeason, number>>;

export function parseAnimeSeason(value: string | null | undefined) {
    const season = value?.trim().toUpperCase();

    return seasonOrder.find((candidate) => candidate === season);
}

export function currentAnimeSeason(now = new Date()): AnimeSeasonSelection {
    return {
        season: seasonOrder[Math.floor(now.getUTCMonth() / 3)],
        year: now.getUTCFullYear(),
    };
}

export function compareAnimeSeasons(left: AnimeSeasonSelection, right: AnimeSeasonSelection) {
    return (
        left.year - right.year ||
        seasonOrder.indexOf(left.season) - seasonOrder.indexOf(right.season)
    );
}

export function availableAnimeSeasons(starts: AnimeSeasonStartYears, latest: AnimeSeasonSelection) {
    const firstYear = Math.min(
        ...seasonOrder.flatMap((season) => {
            const year = starts[season];
            return year && year > 0 ? [year] : [];
        })
    );
    if (!Number.isSafeInteger(firstYear)) {
        return [];
    }

    const options: AnimeSeasonSelection[] = [];
    for (let year = firstYear; year <= latest.year; year++) {
        for (const season of seasonOrder) {
            const firstSeasonYear = starts[season];
            const option = { season, year };
            if (
                firstSeasonYear &&
                year >= firstSeasonYear &&
                compareAnimeSeasons(option, latest) <= 0
            ) {
                options.push(option);
            }
        }
    }

    return options;
}
