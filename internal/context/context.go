package context

// UserKey is the context key for storing the authenticated user.
// It is unexported to prevent collisions.
type key int

const (
	UserKey key = iota
)
