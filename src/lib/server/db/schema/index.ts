import {
    integer,
    pgEnum,
    pgTable,
    primaryKey,
    timestamp,
    unique,
} from 'drizzle-orm/pg-core';

export const externalProvider = pgEnum('external_provider', [
    'anilist',
    'tmdb',
]);

export const externalMediaType = pgEnum('external_media_type', [
    'anime',
    'movie',
    'tv',
]);

export const anime = pgTable('anime', {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

export const animeExternalId = pgTable(
    'anime_external_id',
    {
        id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
        provider: externalProvider('provider').notNull(),
        mediaType: externalMediaType('media_type').notNull(),
        externalId: integer('external_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        unique('anime_external_id_identity').on(
            table.provider,
            table.mediaType,
            table.externalId,
        ),
    ],
);

export const animeExternalIdLink = pgTable(
    'anime_external_id_link',
    {
        animeId: integer('anime_id')
            .notNull()
            .references(() => anime.id, { onDelete: 'cascade' }),
        externalIdId: integer('external_id_id')
            .notNull()
            .references(() => animeExternalId.id, { onDelete: 'cascade' }),
    },
    (table) => [
        primaryKey({ columns: [table.animeId, table.externalIdId] }),
    ],
);

export type Anime = typeof anime.$inferSelect;
export type AnimeExternalId = typeof animeExternalId.$inferSelect;
