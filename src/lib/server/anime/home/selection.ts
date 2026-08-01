export const homeHeroSize = 6;

export function utcWeekStart(now = new Date()) {
    const start = new Date(now);
    const daysSinceMonday = (start.getUTCDay() + 6) % 7;

    start.setUTCDate(start.getUTCDate() - daysSinceMonday);
    start.setUTCHours(0, 0, 0, 0);

    return start.toISOString().slice(0, 10);
}

export async function selectHomeHero<T>(
    ids: number[],
    load: (id: number) => Promise<T | null>,
) {
    const selected: T[] = [];

    for (let offset = 0; offset < ids.length; offset += homeHeroSize) {
        const candidates = await Promise.all(
            ids.slice(offset, offset + homeHeroSize).map(load),
        );

        for (const candidate of candidates) {
            if (candidate !== null) {
                selected.push(candidate);
            }
            if (selected.length === homeHeroSize) {
                return selected;
            }
        }
    }

    return selected;
}
