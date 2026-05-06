# Design Spec: AllAnime Client Decomposition

Decompose the monolithic `api/playback/allanime_client.go` into focused, maintainable units to improve readability, testability, and separation of concerns.

## 1. File Structure & Responsibilities

The current 1200-line file will be split into the following components:

### `pkg/net/utls/utls.go` (New)
- **Responsibility:** Generic uTLS and HTTP2 networking utilities.
- **Contents:** `utlsRoundTripper` struct and its `RoundTrip` implementation.
- **Benefit:** Decouples complex networking logic from domain-specific client code.

### `api/playback/allanime_crypto.go` (New)
- **Responsibility:** AES decryption and dynamic key discovery.
- **Contents:** `decryptTobeparsed`, `getAESKey`, `fetchKeyFromForks`, and supporting validation/decryption logic.
- **Benefit:** Isolates the "hacky" key-scraping and crypto logic from the clean API client.

### `api/playback/allanime_extractor.go` (New)
- **Responsibility:** Parsing raw data and detecting media types.
- **Contents:** `extractSourceURLsFromData`, `decodeSourceURL`, `detectStreamType`, `detectEmbedType`, and source-building helpers.
- **Benefit:** Clean separation of data transformation logic.

### `api/playback/allanime_client.go` (Modified)
- **Responsibility:** Main service interface and GraphQL communication.
- **Contents:** `Search`, `GetEpisodes`, `GetEpisodeSources`, and `graphqlRequest`.
- **Benefit:** The file becomes a thin wrapper around the API protocol.

## 2. Interface Stability
- The existing `allAnimeClient` struct and its public methods (`Search`, `GetEpisodes`, etc.) will maintain their signatures. 
- Internal helper functions will be moved to the new files but remain within the `playback` package (except for the generic networking utility).

## 3. Verification Plan

### Automated Checks
- `go test ./api/playback/...`: Ensure all existing tests pass after the split.
- `go build ./...`: Verify no compilation errors due to visibility or package changes.
- Add new unit tests in `api/playback/allanime_crypto_test.go` for the moved decryption logic.

### Manual Checks
- Verify that anime playback and searching still function correctly in the application.
