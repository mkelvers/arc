package metadata

import (
	"hash/fnv"
	"strings"
	"sync"
)

var genreRegistry = struct {
	sync.RWMutex
	byID   map[int]string
	byName map[string]int
}{
	byID:   make(map[int]string),
	byName: make(map[string]int),
}

// AniList exposes genres as names, so give them stable local filter IDs.
func GenreID(name string) int {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0
	}
	normalized := strings.ToLower(name)

	genreRegistry.RLock()
	id, ok := genreRegistry.byName[normalized]
	genreRegistry.RUnlock()
	if ok {
		return id
	}

	hash := fnv.New32a()
	_, _ = hash.Write([]byte(normalized))
	id = int(hash.Sum32() & 0x7fffffff)
	if id == 0 {
		id = 1
	}

	genreRegistry.Lock()
	defer genreRegistry.Unlock()
	if existing, ok := genreRegistry.byName[normalized]; ok {
		return existing
	}
	for {
		if existing, ok := genreRegistry.byID[id]; !ok {
			genreRegistry.byID[id] = name
			genreRegistry.byName[normalized] = id
			return id
		} else if strings.EqualFold(existing, name) {
			genreRegistry.byName[normalized] = id
			return id
		}
		id++
		if id <= 0 {
			id = 1
		}
	}
}

func GenreName(id int) (string, bool) {
	genreRegistry.RLock()
	defer genreRegistry.RUnlock()
	name, ok := genreRegistry.byID[id]
	return name, ok
}
