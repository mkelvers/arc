import { createCatalogApplication } from '@arc/core/server';
import { createCatalogSource } from '@arc/backend/internal/anime/catalog-source';

export const catalogApplication = createCatalogApplication(createCatalogSource());
