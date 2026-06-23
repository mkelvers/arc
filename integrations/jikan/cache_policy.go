package jikan

import "time"

// Cache TTLs used by the Jikan client for endpoint responses.
const shortCacheTTL = time.Hour     // 1 hour - for frequently changing data
const longCacheTTL = time.Hour * 24 // 24 hours - for stable data like genres
const producerCacheTTL = time.Hour * 24 * 30
