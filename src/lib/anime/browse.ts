export const browseSorts = [
    { label: 'Popularity', value: 'popularity' },
    { label: 'Score', value: 'score' },
] as const;

export const browsePageSize = 42;

type OptionValue<Options extends readonly { value: string }[]> =
    Options[number]['value'];

export type BrowseSort = OptionValue<typeof browseSorts>;
export type BrowseOrder = 'asc' | 'desc';

export interface BrowseTaxonomy {
    genres: string[];
    tags: string[];
    formats: string[];
    statuses: string[];
}

export interface BrowseFilters {
    query: string;
    safe: boolean;
    genre: string | null;
    tag: string | null;
    status: string | null;
    format: string | null;
    sort: BrowseSort;
    order: BrowseOrder;
}

export const defaultBrowseFilters: BrowseFilters = {
    query: '',
    safe: true,
    genre: null,
    tag: null,
    status: null,
    format: null,
    sort: 'popularity',
    order: 'desc',
};

function optionValue<const Options extends readonly { value: string }[]>(
    options: Options,
    value: string | null,
    fallback: OptionValue<Options>,
) {
    if (value === null) {
        return fallback;
    }

    return options.some((option) => option.value === value)
        ? (value as OptionValue<Options>)
        : null;
}

export function parseBrowseFilters(searchParams: URLSearchParams) {
    const query = searchParams.get('q')?.trim() ?? '';
    const safeValue = searchParams.get('sfw');
    const safe =
        safeValue === null || safeValue === '1'
            ? true
            : safeValue === '0'
              ? false
              : null;
    const metadataValue = (name: string) => {
        const value = searchParams.get(name);
        if (value === null) {
            return null;
        }

        const trimmed = value.trim();
        return trimmed && trimmed.length <= 64 ? trimmed : undefined;
    };
    const genre = metadataValue('genre');
    const tag = metadataValue('tag');
    const status = metadataValue('status');
    const format = metadataValue('format');
    const sort = optionValue(
        browseSorts,
        searchParams.get('sort'),
        defaultBrowseFilters.sort,
    );
    const orderValue = searchParams.get('order');
    const order =
        orderValue === null
            ? defaultBrowseFilters.order
            : orderValue === 'asc' || orderValue === 'desc'
              ? orderValue
              : null;

    if (
        query.length > 200 ||
        safe === null ||
        genre === undefined ||
        tag === undefined ||
        status === undefined ||
        format === undefined ||
        sort === null ||
        order === null ||
        (genre !== null && tag !== null)
    ) {
        return null;
    }

    return {
        query,
        safe,
        genre,
        tag,
        status,
        format,
        sort,
        order,
    } satisfies BrowseFilters;
}

export function browseSearchParams(filters: BrowseFilters) {
    const searchParams = new URLSearchParams();

    if (filters.query) {
        searchParams.set('q', filters.query);
    }
    if (!filters.safe) {
        searchParams.set('sfw', '0');
    }
    if (filters.genre) {
        searchParams.set('genre', filters.genre);
    }
    if (filters.tag) {
        searchParams.set('tag', filters.tag);
    }
    if (filters.status) {
        searchParams.set('status', filters.status);
    }
    if (filters.format) {
        searchParams.set('format', filters.format);
    }
    if (filters.sort !== defaultBrowseFilters.sort) {
        searchParams.set('sort', filters.sort);
    }
    if (filters.order !== defaultBrowseFilters.order) {
        searchParams.set('order', filters.order);
    }

    return searchParams;
}

export function browseHref(filters: BrowseFilters) {
    const search = browseSearchParams(filters).toString();
    return search ? `/browse?${search}` : '/browse';
}

export function browseEnumLabel(value: string) {
    return value
        .split('_')
        .map(
            (part) =>
                `${part[0]?.toUpperCase()}${part.slice(1).toLowerCase()}`,
        )
        .join(' ');
}

export function browseFormatLabel(value: string) {
    return value
        .split('_')
        .map((part) =>
            part.length <= 3 ? part.toUpperCase() : browseEnumLabel(part),
        )
        .join(' ');
}
