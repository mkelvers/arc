// Package netutil provides HTTP networking utilities including rate limiting and proxy support.
package netutil

// Common size limits used when reading upstream responses.

const (
	Bytes512       = 512
	KiB512   int64 = 512 << 10
	MiB2     int64 = 2 << 20
)
