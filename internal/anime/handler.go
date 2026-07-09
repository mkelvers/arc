package anime

import (
	"context"
	"mal/internal/domain"

	"github.com/gin-gonic/gin"
)

type AnimeHandler struct {
	svc          Service
	watchlistSvc domain.WatchlistService
	episodeSvc   domain.EpisodeService
	discoverySvc *SeasonDiscoveryService
}

type Service interface {
	domain.AnimeCatalogService
	domain.RecommendationInvalidator
	domain.AnimeSearchService
	domain.AnimeDetailsService
	WarmDetailSections(id int)
}

func NewAnimeHandler(svc Service, watchlistSvc domain.WatchlistService, episodeSvc domain.EpisodeService, discoverySvc *SeasonDiscoveryService) *AnimeHandler {
	return &AnimeHandler{
		svc:          svc,
		watchlistSvc: watchlistSvc,
		episodeSvc:   episodeSvc,
		discoverySvc: discoverySvc,
	}
}

func (h *AnimeHandler) watchlistMapForAnimes(ctx context.Context, userID string, animes []domain.Anime) map[int64]bool {
	animeIDs := make([]int64, 0, len(animes))
	for _, anime := range animes {
		if anime.MalID > 0 {
			animeIDs = append(animeIDs, int64(anime.MalID))
		}
	}
	return h.watchlistMapForIDs(ctx, userID, animeIDs)
}

func (h *AnimeHandler) watchlistMapForIDs(ctx context.Context, userID string, animeIDs []int64) map[int64]bool {
	if userID == "" || len(animeIDs) == 0 {
		return map[int64]bool{}
	}

	watchlistMap, err := h.watchlistSvc.GetWatchlistMap(ctx, userID, animeIDs)
	if err != nil {
		return map[int64]bool{}
	}
	return watchlistMap
}

func (h *AnimeHandler) Register(r *gin.Engine) {
	r.GET("/", h.HandleCatalog)
	r.GET("/api/catalog/airing", h.HandleCatalogAiring)
	r.GET("/api/catalog/popular", h.HandleCatalogPopular)
	r.GET("/api/catalog/continue", h.HandleCatalogContinue)
	r.GET("/api/catalog/top-pick", h.HandleCatalogTopPickForYou)
	r.GET("/search", h.HandleSearch)
	r.GET("/top-picks", h.HandleTopPicks)
	r.GET("/browse", h.HandleBrowse)
	r.GET("/simulcast", h.HandleSimulcast)
	r.GET("/api/simulcast", h.HandleSimulcastContent)
	r.GET("/anime/:id", h.HandleAnimeDetails)
	r.GET("/anime/:id/reviews", h.HandleAnimeReviews)
	r.GET("/anime/:id/reviews/:reviewID/body", h.HandleAnimeReviewBody)
	r.GET("/api/watch-order", h.HandleHTMLWatchOrder)
	r.GET("/api/search-quick", h.HandleQuickSearch)
	r.GET("/api/search", h.HandleSearchAPI)
	r.GET("/api/jikan/random/anime", h.HandleRandomAnime)
	r.GET("/api/jikan/producers", h.HandleProducers)
}
