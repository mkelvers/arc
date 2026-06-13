package anime

import (
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

func parseReviewsQuery(c *gin.Context) (reviewsQuery, error) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		return reviewsQuery{}, fmt.Errorf("invalid anime id")
	}

	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil {
		return reviewsQuery{}, fmt.Errorf("invalid page")
	}
	if page < 1 {
		page = 1
	}

	return reviewsQuery{animeID: id, page: page}, nil
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
