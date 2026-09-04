import { createCatalogApplication } from '@arc/core';
import { createCatalogSource } from '@arc/backend/internal/anime/catalog-source';

export const catalogApplication = createCatalogApplication(createCatalogSource());
