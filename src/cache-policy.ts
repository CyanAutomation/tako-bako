/** How long a generated puzzle remains fresh in browser and edge caches. */
export const CACHE_FRESH_LIFETIME_SECONDS = 5 * 60;

/** How long an edge cache may serve a stale puzzle while refreshing it. */
export const CACHE_STALE_WHILE_REVALIDATE_LIFETIME_SECONDS = 60 * 60;
