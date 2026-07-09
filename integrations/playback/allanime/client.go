package allanime

import (
	"context"
	"fmt"
	"io"
	"mal/internal/domain"
	errlog "mal/pkg"
	netutil "mal/pkg/net"
	"net/http"
	"time"

	genqlient "github.com/Khan/genqlient/graphql"
)

const (
	allAnimeBaseURL  = "https://api.allanime.day"
	allAnimeSiteURL  = "https://allanime.day"
	allAnimeReferer  = "https://youtu-chan.com"
	allAnimeOrigin   = "https://youtu-chan.com"
	defaultUserAgent = netutil.Firefox121
)

type AllAnimeProvider struct {
	httpClient *http.Client
	utlsClient *http.Client
	extractor  *providerExtractor
	baseURL    string
}

func NewAllAnimeProvider() *AllAnimeProvider {
	return &AllAnimeProvider{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		utlsClient: &http.Client{
			Transport: &netutil.UtlsRoundTripper{},
			Timeout:   30 * time.Second,
		},
		extractor: newProviderExtractor(),
		baseURL:   allAnimeBaseURL,
	}
}

func (c *AllAnimeProvider) Name() string {
	return "AllAnime"
}

func (c *AllAnimeProvider) apiBaseURL() string {
	if c.baseURL != "" {
		return c.baseURL
	}
	return allAnimeBaseURL
}

func (c *AllAnimeProvider) GetStreams(ctx context.Context, animeID int, titleCandidates []string, episode string, mode string) (*domain.StreamResult, error) {
	showID, err := c.strictShowID(ctx, animeID, titleCandidates, mode)
	if err != nil {
		return nil, fmt.Errorf("allanime: show not found for malID %d", animeID)
	}

	sources, err := c.GetEpisodeSources(ctx, showID, episode, mode)
	if err != nil || len(sources) == 0 {
		return nil, fmt.Errorf("allanime: no sources for show %s", showID)
	}

	primary := sources[0]

	result := &domain.StreamResult{
		URL:     primary.URL,
		Referer: primary.Referer,
		Type:    primary.Type,
	}

	for _, sub := range primary.Subtitles {
		result.Subtitles = append(result.Subtitles, domain.Subtitle{
			Label: sub.Lang,
			URL:   sub.URL,
		})
	}

	return result, nil
}

func (c *AllAnimeProvider) graphqlClient() genqlient.Client {
	return genqlient.NewClient(c.apiBaseURL()+"/api", allAnimeGraphQLDoer{client: c.httpClient})
}

type allAnimeGraphQLDoer struct {
	client *http.Client
}

func (d allAnimeGraphQLDoer) Do(req *http.Request) (*http.Response, error) {
	req.Header.Set("Referer", allAnimeReferer)
	req.Header.Set("User-Agent", defaultUserAgent)

	client := d.client
	if client == nil {
		client = http.DefaultClient
	}
	return client.Do(req)
}

func executeAndReadResponse(client *http.Client, req *http.Request, executeErrPrefix string, readErrPrefix string) (int, []byte, error) {
	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("%s: %w", executeErrPrefix, err)
	}
	defer func() {
		errlog.Log("failed to close allanime response body", resp.Body.Close())
	}()

	body, err := io.ReadAll(io.LimitReader(resp.Body, netutil.MiB2))
	if err != nil {
		return 0, nil, fmt.Errorf("%s: %w", readErrPrefix, err)
	}

	return resp.StatusCode, body, nil
}
