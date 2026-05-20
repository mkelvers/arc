package server

import (
	"log"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		c.Next()

		route := c.FullPath()
		if route == "" {
			route = path
		}

		log.Printf(
			"http_request method=%s route=%s path=%s query=%s status=%d duration_ms=%.2f bytes=%d client_ip=%s errors=%s",
			c.Request.Method,
			strconv.Quote(route),
			strconv.Quote(path),
			strconv.Quote(query),
			c.Writer.Status(),
			float64(time.Since(start).Microseconds())/1000,
			c.Writer.Size(),
			strconv.Quote(c.ClientIP()),
			strconv.Quote(c.Errors.ByType(gin.ErrorTypePrivate).String()),
		)
	}
}
