package anilist

import (
	"bytes"
	"context"
	"fmt"
	stdhtml "html"
	"strconv"
	"strings"

	"mal/integrations/metadata"

	"golang.org/x/net/html"
)

type LegacyProvider struct {
	client *CachedClient
}

func NewLegacyProvider(client *CachedClient) *LegacyProvider {
	return &LegacyProvider{client: client}
}

func (p *LegacyProvider) GetAnimeByID(ctx context.Context, id int) (metadata.Anime, error) {
	anime, err := p.client.GetAnimeByMALID(ctx, id)
	if err != nil {
		return metadata.Anime{}, err
	}
	return ToMetadataAnime(anime), nil
}

func (p *LegacyProvider) SearchAdvanced(ctx context.Context, opts metadata.SearchOptions) (metadata.SearchResult, error) {
	if strings.TrimSpace(opts.Query) == "" {
		return metadata.SearchResult{}, nil
	}
	result, err := p.client.Search(ctx, opts.Query, opts.Page, opts.Limit)
	if err != nil {
		return metadata.SearchResult{}, err
	}
	out := make([]metadata.Anime, 0, len(result.Items))
	for _, item := range result.Items {
		out = append(out, ToMetadataAnime(Anime{ID: item.ID, MALID: item.MALID, Title: item.Title, Format: item.Format, SeasonYear: item.StartYear, CoverImage: item.CoverImage}))
	}
	return metadata.SearchResult{Animes: out, HasNextPage: result.HasNextPage}, nil
}

func (p *LegacyProvider) GetAnimeRecommendations(ctx context.Context, id int) ([]metadata.RecommendationEntry, error) {
	items, err := p.client.GetRecommendations(ctx, id)
	if err != nil {
		return nil, err
	}
	out := make([]metadata.RecommendationEntry, 0, len(items))
	for _, item := range items {
		var mapped metadata.RecommendationEntry
		mapped.Entry.MalID = item.Anime.MALID
		mapped.Entry.Title = firstNonEmpty(item.Anime.Title.English, item.Anime.Title.Romaji)
		mapped.Entry.Synopsis = plainText(item.Anime.Description)
		mapped.Entry.Images.Webp.LargeImageURL = item.Anime.CoverImage
		mapped.Votes = item.Votes
		out = append(out, mapped)
	}
	return out, nil
}

func ToMetadataAnime(anime Anime) metadata.Anime {
	result := metadata.Anime{
		MalID:          anime.MALID,
		Title:          firstNonEmpty(anime.Title.UserPreferred, anime.Title.Romaji, anime.Title.Native),
		TitleEnglish:   anime.Title.English,
		TitleJapanese:  anime.Title.Native,
		TitleSynonyms:  append([]string(nil), anime.Synonyms...),
		Synopsis:       plainText(anime.Description),
		Status:         statusLabel(anime.Status),
		Airing:         anime.NextAiring != nil || strings.EqualFold(anime.Status, "RELEASING"),
		Episodes:       anime.Episodes,
		Score:          float64(anime.AverageScore) / 10,
		MeanScore:      float64(anime.MeanScore) / 10,
		Season:         strings.ToLower(anime.Season),
		Year:           anime.SeasonYear,
		Type:           anime.Format,
		Source:         sourceLabel(anime.Source),
		Popularity:     anime.Popularity,
		Favorites:      anime.Favourites,
		Members:        anime.Popularity,
		ScoredBy:       anime.ScoreCount,
		Rank:           anime.Rank,
		RankLabel:      anime.RankLabel,
		Duration:       durationLabel(anime.DurationMinutes),
		BannerImageURL: anime.BannerImage,
	}
	result.Images.Webp.LargeImageURL = anime.CoverImage
	result.Images.Jpg.LargeImageURL = anime.CoverImage
	result.Aired.From = animeDate(anime.StartDate)
	result.Aired.To = animeDate(anime.EndDate)
	for _, genre := range anime.Genres {
		result.Genres = append(result.Genres, metadata.NamedEntity{MalID: metadata.GenreID(genre), Name: genre})
	}
	for _, studio := range anime.Studios {
		result.Studios = append(result.Studios, metadata.NamedEntity{MalID: studio.ID, Name: studio.Name})
	}
	for _, producer := range anime.Producers {
		result.Producers = append(result.Producers, metadata.NamedEntity{Name: producer.Name})
	}
	for _, tag := range topTags(anime.Tags, 5) {
		result.Tags = append(result.Tags, metadata.NamedEntity{MalID: tag.ID, Name: tag.Name})
	}
	return result
}

func plainText(value string) string {
	tokenizer := html.NewTokenizer(bytes.NewBufferString(value))
	var out strings.Builder
	for {
		switch tokenizer.Next() {
		case html.ErrorToken:
			return cleanDescription(out.String())
		case html.TextToken:
			out.WriteString(stdhtml.UnescapeString(string(tokenizer.Text())))
		case html.StartTagToken, html.SelfClosingTagToken:
			tag, _ := tokenizer.TagName()
			if string(tag) == "br" {
				out.WriteByte('\n')
			}
		}
	}
}

func cleanDescription(value string) string {
	value = strings.ReplaceAll(value, "\r\n", "\n")
	lines := strings.Split(value, "\n")
	cleaned := make([]string, 0, len(lines))
	for _, line := range lines {
		if line = strings.TrimSpace(line); line != "" {
			cleaned = append(cleaned, line)
		}
	}
	return strings.Join(cleaned, "\n")
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func statusLabel(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "RELEASING":
		return "Currently Airing"
	case "NOT_YET_RELEASED":
		return "Not yet aired"
	case "FINISHED":
		return "Finished Airing"
	case "CANCELLED":
		return "Cancelled"
	default:
		return value
	}
}

func durationLabel(minutes int) string {
	if minutes <= 0 {
		return ""
	}
	return strconv.Itoa(minutes) + " min per ep"
}

func sourceLabel(value string) string {
	value = strings.ReplaceAll(strings.ToLower(strings.TrimSpace(value)), "_", " ")
	if value == "" {
		return ""
	}
	return strings.ToUpper(value[:1]) + value[1:]
}

func animeDate(date Date) string {
	if date.Year <= 0 {
		return ""
	}
	month := date.Month
	day := date.Day
	if month <= 0 {
		month = 1
	}
	if day <= 0 {
		day = 1
	}
	return fmt.Sprintf("%04d-%02d-%02dT00:00:00Z", date.Year, month, day)
}
