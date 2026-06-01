// Package jikan provides a client for the Jikan v4 API.
package jikan

import "time"

const shortCacheTTL = time.Hour     // 1 hour - for frequently changing data
const longCacheTTL = time.Hour * 24 // 24 hours - for stable data like genres
const producerCacheTTL = time.Hour * 24 * 30
