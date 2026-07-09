package recommendations

import (
	"mal/internal/database/db"
	"sort"
	"sync"
)

type candidateStore struct {
	watchlistAnimeIDs map[int]struct{}
	byID              map[int]rankedCandidate
	mu                sync.Mutex
}

func newCandidateStore(watchlist []db.GetUserWatchListRow) *candidateStore {
	watched := make(map[int]struct{}, len(watchlist))
	for _, entry := range watchlist {
		if entry.AnimeID <= 0 {
			continue
		}
		watched[int(entry.AnimeID)] = struct{}{}
	}

	return &candidateStore{
		watchlistAnimeIDs: watched,
		byID:              map[int]rankedCandidate{},
	}
}

func (s *candidateStore) upsert(candidate rankedCandidate) {
	if candidate.id <= 0 {
		return
	}
	if _, exists := s.watchlistAnimeIDs[candidate.id]; exists {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	current, ok := s.byID[candidate.id]
	if !ok {
		s.byID[candidate.id] = candidate
		return
	}

	current.collaborativeScore += candidate.collaborativeScore
	current.profileSearchScore += candidate.profileSearchScore
	if candidate.hasAnime {
		current.anime = candidate.anime
		current.hasAnime = true
	}
	s.byID[candidate.id] = current
}

func (s *candidateStore) ranked() []rankedCandidate {
	ranked := make([]rankedCandidate, 0, len(s.byID))
	for _, item := range s.byID {
		ranked = append(ranked, item)
	}

	sort.Slice(ranked, func(i, j int) bool {
		left := rankedCandidateRetrievalScore(ranked[i].collaborativeScore, ranked[i].profileSearchScore)
		right := rankedCandidateRetrievalScore(ranked[j].collaborativeScore, ranked[j].profileSearchScore)
		if left == right {
			return ranked[i].id < ranked[j].id
		}
		return left > right
	})

	return ranked
}
