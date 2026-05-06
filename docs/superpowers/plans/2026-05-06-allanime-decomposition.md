# AllAnime Client Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the monolithic `api/playback/allanime_client.go` into focused, maintainable units.

**Architecture:** 
1. Move uTLS networking logic to `pkg/net/utls`.
2. Move crypto and key discovery to `api/playback/allanime_crypto.go`.
3. Move data extraction and stream detection to `api/playback/allanime_extractor.go`.
4. Keep core API and GraphQL logic in `api/playback/allanime_client.go`.

**Tech Stack:** Go (uTLS, SHA256, AES-CTR)

---

### Task 1: Move uTLS RoundTripper to pkg/net/utls

**Files:**
- Create: `pkg/net/utls/utls.go`
- Modify: `api/playback/allanime_client.go`

- [ ] **Step 1: Create pkg/net/utls/utls.go**

```go
package utls

import (
	"bufio"
	"context"
	"net"
	"net/http"
	"time"

	utls "github.com/refraction-networking/utls"
	"golang.org/x/net/http2"
)

type UtlsRoundTripper struct{}

func (rt *UtlsRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	port := req.URL.Port()
	if port == "" {
		if req.URL.Scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}

	addr := net.JoinHostPort(req.URL.Hostname(), port)
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return nil, err
	}

	config := &utls.Config{ServerName: req.URL.Hostname()}
	uConn := utls.UClient(conn, config, utls.HelloFirefox_Auto)

	if err := uConn.Handshake(); err != nil {
		return nil, err
	}

	var httpRT http.RoundTripper
	switch uConn.ConnectionState().NegotiatedProtocol {
	case http2.NextProtoTLS:
		t2 := &http2.Transport{
			DialTLSContext: func(ctx context.Context, network, addr string, cfg *utls.Config) (net.Conn, error) {
				return uConn, nil
			},
		}
		httpRT = t2
	default:
		t1 := &http.Transport{
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				return uConn, nil
			},
		}
		httpRT = t1
	}

	return httpRT.RoundTrip(req)
}
```

- [ ] **Step 2: Update allanime_client.go to use the new package**

Remove `utlsRoundTripper` from `api/playback/allanime_client.go` and update `newAllAnimeClient` to use `&utls.UtlsRoundTripper{}`.

- [ ] **Step 3: Verify build and commit**

Run: `go build ./api/playback/...`
Expected: PASS

```bash
git add pkg/net/utls/utls.go api/playback/allanime_client.go
git commit -m "refactor: move utls roundtripper to pkg/net/utls"
```

### Task 2: Extract Crypto and Key Discovery

**Files:**
- Create: `api/playback/allanime_crypto.go`
- Modify: `api/playback/allanime_client.go`

- [ ] **Step 1: Move crypto logic to allanime_crypto.go**

Extract constants (`allAnimeAESKey`, `aniCliRawSourceURL`, etc.) and functions (`decryptTobeparsed`, `tryDecryptCTR`, `getAESKey`, `fetchKeyFromForks`, `extractKey`, `getTestPayload`, `validateKeys`, `getAllKeys`) to `api/playback/allanime_crypto.go`.

- [ ] **Step 2: Update allanime_client.go**

Remove the extracted code from `api/playback/allanime_client.go`.

- [ ] **Step 3: Verify build and commit**

Run: `go build ./api/playback/...`
Expected: PASS

```bash
git add api/playback/allanime_crypto.go api/playback/allanime_client.go
git commit -m "refactor: extract allanime crypto and key discovery"
```

### Task 3: Extract Data Extraction and Stream Detection

**Files:**
- Create: `api/playback/allanime_extractor.go`
- Modify: `api/playback/allanime_client.go`

- [ ] **Step 1: Move extraction logic to allanime_extractor.go**

Extract functions (`extractSourceURLsFromData`, `buildStreamSource`, `sourceReference` struct, `buildSourceReferences`, `extractEpisodeData`, `decodeSourceURL`, `detectStreamType`, `detectEmbedType`, `getMapKeys`) to `api/playback/allanime_extractor.go`.

- [ ] **Step 2: Update allanime_client.go**

Remove the extracted code from `api/playback/allanime_client.go`. Ensure `allAnimeClient` methods still call these (now package-level) functions.

- [ ] **Step 3: Verify build and commit**

Run: `go build ./api/playback/...`
Expected: PASS

```bash
git add api/playback/allanime_extractor.go api/playback/allanime_client.go
git commit -m "refactor: extract allanime data extraction logic"
```

### Task 4: Final Cleanup and Verification

**Files:**
- Modify: `api/playback/allanime_client.go`

- [ ] **Step 1: Final review of allanime_client.go**

Ensure only `allAnimeClient` struct, `newAllAnimeClient`, `graphqlRequest`, `graphqlRequestWithHash`, `Search`, `GetEpisodes`, `GetAvailableEpisodes`, and `GetEpisodeMetadata` remain.

- [ ] **Step 2: Run all tests**

Run: `go test -v ./api/playback/...`
Expected: PASS

- [ ] **Step 3: Commit final cleanup**

```bash
git add api/playback/allanime_client.go
git commit -m "refactor: final cleanup of allanime_client.go"
```
