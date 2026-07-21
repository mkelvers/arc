import {
    boolean,
    doublePrecision,
    integer,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    unique,
    varchar,
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

export const artworkType = pgEnum('artwork_type', ['backdrop', 'logo']);

export const anime = pgTable('anime', {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    logoSize: integer('logo_size').notNull().default(100),
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

export const animeArtwork = pgTable(
    'anime_artwork',
    {
        externalIdId: integer('external_id_id')
            .notNull()
            .references(() => animeExternalId.id, { onDelete: 'cascade' }),
        type: artworkType('type').notNull(),
        filePath: text('file_path').notNull(),
        aspectRatio: doublePrecision('aspect_ratio').notNull(),
        height: integer('height').notNull(),
        language: varchar('language', { length: 16 }),
        voteAverage: doublePrecision('vote_average').notNull(),
        width: integer('width').notNull(),
    },
    (table) => [
        primaryKey({
            columns: [table.externalIdId, table.type, table.filePath],
        }),
    ],
);

export const animeArtworkCache = pgTable('anime_artwork_cache', {
    externalIdId: integer('external_id_id')
        .primaryKey()
        .references(() => animeExternalId.id, { onDelete: 'cascade' }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
});

export const animeArtworkPreference = pgTable('anime_artwork_preference', {
    externalIdId: integer('external_id_id')
        .primaryKey()
        .references(() => animeExternalId.id, { onDelete: 'cascade' }),
    backdropFilePath: text('backdrop_file_path'),
    logoFilePath: text('logo_file_path'),
    logoHidden: boolean('logo_hidden').notNull().default(false),
    logoSize: integer('logo_size').notNull().default(100),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

export type Anime = typeof anime.$inferSelect;
export type AnimeExternalId = typeof animeExternalId.$inferSelect;
export type AnimeArtwork = typeof animeArtwork.$inferSelect;
