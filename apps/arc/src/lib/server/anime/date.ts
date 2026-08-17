export function animeDate(
    value:
        | {
              year?: number | null;
              month?: number | null;
              day?: number | null;
          }
        | null
        | undefined
) {
    const { year, month, day } = value ?? {};

    return year && month && day
        ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        : null;
}

export function dateTimestamp(value: string | null | undefined) {
    if (!value) {
        return null;
    }

    const timestamp = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(timestamp) ? timestamp : null;
}
