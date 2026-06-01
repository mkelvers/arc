package netutil

import "net/http"

func SetBrowserHTMLHeaders(request *http.Request, referer string) {
	request.Header.Set("User-Agent", Chrome135)
	request.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
	request.Header.Set("Accept-Language", "en-US,en;q=0.9")
	request.Header.Set("Referer", referer)
	request.Header.Set("Cache-Control", "no-cache")
}
