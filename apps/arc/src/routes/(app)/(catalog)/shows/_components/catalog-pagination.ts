import { browseSearchParams, type BrowseFilters } from '@arc/core/browser';
import { AnimeCardPageSchema, type AnimeCard as AnimeCardModel } from '@arc/core/browser';

export type PaginationStrategy = 'eager' | 'gated';
type CatalogKind = 'new' | 'popular';
type AnimeCardPage = ReturnType<typeof AnimeCardPageSchema.parse>;

interface FetchCatalogPageOptions {
    kind: CatalogKind;
    filters: BrowseFilters;
    page: number;
    signal: AbortSignal;
    retryOnce?: boolean;
}

export async function fetchCatalogPage({
    kind,
    filters,
    page,
    signal,
    retryOnce = true,
}: FetchCatalogPageOptions): Promise<AnimeCardPage> {
    const query = browseSearchParams(filters);
    query.set('page', String(page));

    for (let attempt = 0; attempt < (retryOnce ? 2 : 1); attempt += 1) {
        try {
            const response = await fetch(`/v1/${kind}?${query}`, {
                headers: {
                    Accept: 'application/json',
                },
                signal,
            });
            if (!response.ok) {
                throw new Error(`${kind} page request returned ${response.status}`);
            }

            const result = AnimeCardPageSchema.safeParse(await response.json());
            if (!result.success || result.data.page !== page) {
                throw new TypeError(`${kind} page request returned an invalid response`);
            }

            return result.data;
        } catch (cause) {
            if (
                signal.aborted ||
                (cause instanceof DOMException && cause.name === 'AbortError') ||
                !retryOnce ||
                attempt === 1
            ) {
                throw cause;
            }
        }
    }

    throw new Error(`${kind} page request failed`);
}

export function appendCatalogPage(
    currentAnime: AnimeCardModel[],
    requestedPage: number,
    page: AnimeCardPage
) {
    if (page.page !== requestedPage) {
        throw new TypeError('Catalog page response does not match the requested page');
    }

    const existing = new Set(currentAnime.map(({ id }) => id));
    return {
        anime: [...currentAnime, ...page.anime.filter(({ id }) => !existing.has(id))],
        nextPage: page.hasNextPage ? requestedPage + 1 : null,
    };
}

export function createPaginationGate(strategy: PaginationStrategy) {
    let armed = true;
    let requestInFlight = false;

    return {
        observe(isIntersecting: boolean) {
            if (!isIntersecting) {
                armed = true;
                return false;
            }
            if (requestInFlight || (strategy === 'gated' && !armed)) {
                return false;
            }

            armed = false;
            requestInFlight = true;
            return true;
        },
        complete() {
            requestInFlight = false;
        },
        reset() {
            armed = true;
            requestInFlight = false;
        },
    };
}
