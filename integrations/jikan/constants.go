package jikan

import "time"

const shortCacheTTL = time.Hour     // 1 hour - for frequently changing data
const longCacheTTL = time.Hour * 24 // 24 hours - for stable data like genres
