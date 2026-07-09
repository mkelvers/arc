package anime

import (
	"errors"
	"fmt"
	"mal/internal/server"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type reviewsQuery struct {
	animeID int
	page    int
}

type reviewBodyQuery struct {
	animeID    int
	reviewID   int
	sourcePage int
	expanded   bool
}

func parseReviewsQuery(c *gin.Context) (reviewsQuery, error) {
	rawID := c.Param("id")
	id, err := strconv.Atoi(rawID)
	if err != nil {
		return reviewsQuery{}, fmt.Errorf("invalid anime id %q: %w", rawID, err)
	}
	if id <= 0 {
		return reviewsQuery{}, fmt.Errorf("invalid anime id %d", id)
	}

	rawPage := c.DefaultQuery("page", "1")
	page, err := strconv.Atoi(rawPage)
	if err != nil {
		return reviewsQuery{}, fmt.Errorf("invalid page %q: %w", rawPage, err)
	}
	if page < 1 {
		page = 1
	}

	return reviewsQuery{animeID: id, page: page}, nil
}

func parseReviewBodyQuery(c *gin.Context) (reviewBodyQuery, error) {
	rawAnimeID := c.Param("id")
	animeID, err := strconv.Atoi(rawAnimeID)
	if err != nil {
		return reviewBodyQuery{}, fmt.Errorf("invalid anime id %q: %w", rawAnimeID, err)
	}
	if animeID <= 0 {
		return reviewBodyQuery{}, fmt.Errorf("invalid anime id %d", animeID)
	}

	rawReviewID := c.Param("reviewID")
	reviewID, err := strconv.Atoi(rawReviewID)
	if err != nil {
		return reviewBodyQuery{}, fmt.Errorf("invalid review id %q: %w", rawReviewID, err)
	}
	if reviewID <= 0 {
		return reviewBodyQuery{}, fmt.Errorf("invalid review id %d", reviewID)
	}

	rawSourcePage := c.Query("source_page")
	sourcePage, err := strconv.Atoi(rawSourcePage)
	if err != nil {
		return reviewBodyQuery{}, fmt.Errorf("invalid source page %q: %w", rawSourcePage, err)
	}
	if sourcePage < 1 {
		return reviewBodyQuery{}, fmt.Errorf("invalid source page %d", sourcePage)
	}

	view := c.DefaultQuery("view", "full")
	switch view {
	case "full":
		return reviewBodyQuery{animeID: animeID, reviewID: reviewID, sourcePage: sourcePage, expanded: true}, nil
	case "preview":
		return reviewBodyQuery{animeID: animeID, reviewID: reviewID, sourcePage: sourcePage, expanded: false}, nil
	default:
		return reviewBodyQuery{}, fmt.Errorf("invalid review body view %q", view)
	}
}

func (h *AnimeHandler) HandleAnimeReviews(c *gin.Context) {
	query, err := parseReviewsQuery(c)
	if err != nil {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, err.Error())
		return
	}

	reviews, hasNextPage, err := h.svc.GetReviews(c.Request.Context(), query.animeID, query.page)
	if err != nil {
		server.RespondError(
			c,
			http.StatusInternalServerError,
			"anime_reviews_fetch_failed",
			"anime",
			"failed to load reviews",
			map[string]any{"anime_id": query.animeID, "page": query.page},
			err,
		)
		return
	}

	user := server.CurrentUser(c)

	if c.GetHeader("HX-Request") == "true" && query.page > 1 {
		c.HTML(http.StatusOK, "reviews.gohtml", gin.H{
			"_fragment":   "review_cards",
			"Reviews":     reviews,
			"NextPage":    query.page + 1,
			"HasNextPage": hasNextPage,
			"AnimeID":     query.animeID,
		})
		return
	}

	c.HTML(http.StatusOK, "reviews.gohtml", gin.H{
		"CurrentPath": fmt.Sprintf("/anime/%d/reviews", query.animeID),
		"Reviews":     reviews,
		"NextPage":    query.page + 1,
		"HasNextPage": hasNextPage,
		"AnimeID":     query.animeID,
		"User":        user,
	})
}

func (h *AnimeHandler) HandleAnimeReviewBody(c *gin.Context) {
	query, err := parseReviewBodyQuery(c)
	if err != nil {
		server.RespondHTMLOrJSONError(c, http.StatusBadRequest, err.Error())
		return
	}

	review, err := h.svc.GetReview(c.Request.Context(), query.animeID, query.sourcePage, query.reviewID)
	if err != nil {
		if errors.Is(err, errReviewNotFound) {
			server.RespondHTMLOrJSONError(c, http.StatusNotFound, "review not found")
			return
		}
		server.RespondError(
			c,
			http.StatusInternalServerError,
			"anime_review_fetch_failed",
			"anime",
			"failed to load review",
			map[string]any{"anime_id": query.animeID, "review_id": query.reviewID, "source_page": query.sourcePage},
			err,
		)
		return
	}

	c.HTML(http.StatusOK, "reviews.gohtml", gin.H{
		"_fragment": "review_body",
		"AnimeID":   query.animeID,
		"Review":    review,
		"Expanded":  query.expanded,
	})
}
