export const browseSorts = [
  { label: 'Popularity', value: 'popularity' },
  { label: 'Score', value: 'score' },
] as const;

export const browsePageSize = 42;

type BrowseSort = (typeof browseSorts)[number]['value'];
type BrowseOrder = 'asc' | 'desc';
const defaultBrowseSort: BrowseSort = 'popularity';
const defaultBrowseOrder: BrowseOrder = 'desc';

export interface BrowseTaxonomy {
  genres: string[];
  tags: string[];
  formats: string[];
  statuses: string[];
  sources: string[];
  seasons: string[];
  years: number[];
  countries: string[];
}

export interface BrowseFilters {
  query: string;
  safe: boolean;
  genre: string | null;
  tag: string | null;
  status: string | null;
  format: string | null;
  source: string | null;
  season: string | null;
  year: number | null;
  country: string | null;
  audio: 'dub' | null;
  sort: BrowseSort;
  order: BrowseOrder;
}

export function parseBrowseFilters(searchParams: URLSearchParams) {
  const query = searchParams.get('q')?.trim() ?? '';
  const safeValue = searchParams.get('sfw');
  const safe = safeValue === null || safeValue === '1' ? true : safeValue === '0' ? false : null;
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
  const source = metadataValue('source');
  const season = metadataValue('season');
  const country = metadataValue('country');
  const yearValue = searchParams.get('year');
  const year =
    yearValue === null
      ? null
      : /^\d{4}$/.test(yearValue) && Number(yearValue) >= 1900
        ? Number(yearValue)
        : undefined;
  const audioValue = searchParams.get('audio');
  const audio = audioValue === null ? null : audioValue === 'dub' ? audioValue : undefined;
  const sortValue = searchParams.get('sort');
  const sort =
    sortValue === null
      ? defaultBrowseSort
      : (browseSorts.find(({ value }) => value === sortValue)?.value ?? null);
  const orderValue = searchParams.get('order');
  const order =
    orderValue === null
      ? defaultBrowseOrder
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
    source === undefined ||
    season === undefined ||
    year === undefined ||
    country === undefined ||
    audio === undefined ||
    (country !== null && !/^[A-Z]{2}$/.test(country)) ||
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
    source,
    season,
    year,
    country,
    audio,
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
  if (filters.source) {
    searchParams.set('source', filters.source);
  }
  if (filters.season) {
    searchParams.set('season', filters.season);
  }
  if (filters.year) {
    searchParams.set('year', String(filters.year));
  }
  if (filters.country) {
    searchParams.set('country', filters.country);
  }
  if (filters.audio) {
    searchParams.set('audio', filters.audio);
  }
  if (filters.sort !== defaultBrowseSort) {
    searchParams.set('sort', filters.sort);
  }
  if (filters.order !== defaultBrowseOrder) {
    searchParams.set('order', filters.order);
  }

  return searchParams;
}

export function browseEnumLabel(value: string) {
  return value
    .split('_')
    .map((part) => `${part[0]?.toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

export function browseFormatLabel(value: string) {
  return value
    .split('_')
    .map((part) => (part.length <= 3 ? part.toUpperCase() : browseEnumLabel(part)))
    .join(' ');
}
