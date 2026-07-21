import { Effect } from 'effect';

import { AnimeDocument } from '$lib/graphql/anilist/generated/graphql';
import { graphql, GraphQLRequestError } from '$lib/server/graphql';

const endpoint = 'https://graphql.anilist.co';

export function getAnime(id: number) {
    return graphql(endpoint, AnimeDocument, { id }).pipe(
        Effect.flatMap(({ Media }) =>
            Media
                ? Effect.succeed(Media)
                : Effect.fail(
                      new GraphQLRequestError({
                          message: 'AniList returned no anime',
                      }),
                  ),
        ),
    );
}
