package useragent

// Keep these centralized so we don't end up with many drifting UA strings.

// Firefox121 mimics a modern Firefox desktop UA (used for some upstreams that
// gate responses based on UA).
const Firefox121 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0"

// Chrome135 mimics a modern Chrome desktop UA.
const Chrome135 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"

// Generic is a minimal UA string.
const Generic = "Mozilla/5.0"
