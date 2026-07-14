package anilist

import (
	"bytes"
	"context"
	"fmt"
	stdhtml "html"
	"strconv"
	"strings"

	"mal/internal/domain"

	"golang.org/x/net/html"
)

type LegacyProvider struct {
	client *CachedClient
}

func NewLegacyProvider(client *CachedClient) *LegacyProvider {
	return &LegacyProvider{client: client}
}

func (p *LegacyProvider) GetAnimeByID(ctx context.Context, id int) (domain.Anime, error) {
	anime, err := p.client.GetAnimeByMALID(ctx, id)
	if err != nil {
		return domain.Anime{}, err
	}
	return ToMetadataAnime(anime), nil
}

func (p *LegacyProvider) SearchAdvanced(ctx context.Context, opts domain.SearchOptions) (domain.SearchResult, error) {
	result, err := p.client.SearchAdvanced(ctx, opts)
	if err != nil {
		return domain.SearchResult{}, err
	}
	out := make([]domain.Anime, 0, len(result.Items))
	for _, item := range result.Items {
		anime := ToMetadataAnime(Anime{
			ID:          item.ID,
			MALID:       item.MALID,
			Title:       item.Title,
			Description: item.Description,
			Format:      item.Format,
			SeasonYear:  item.StartYear,
			CoverImage:  item.CoverImage,
		})
		out = append(out, anime)
	}
	return domain.SearchResult{Animes: out, HasNextPage: result.HasNextPage}, nil
}

func (p *LegacyProvider) GetAnimeRecommendations(ctx context.Context, id int) ([]domain.RecommendationEntry, error) {
	items, err := p.client.GetRecommendations(ctx, id)
	if err != nil {
		return nil, err
	}
	out := make([]domain.RecommendationEntry, 0, len(items))
	for _, item := range items {
		var mapped domain.RecommendationEntry
		mapped.Entry.MalID = item.Anime.MALID
		mapped.Entry.Title = firstNonEmpty(item.Anime.Title.English, item.Anime.Title.Romaji)
		mapped.Entry.Synopsis = plainText(item.Anime.Description)
		mapped.Entry.Images.Webp.LargeImageURL = item.Anime.CoverImage
		mapped.Votes = item.Votes
		out = append(out, mapped)
	}
	return out, nil
}

func ToMetadataAnime(anime Anime) domain.Anime {
	result := domain.Anime{
		AniListID:      anime.ID,
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
		result.Genres = append(result.Genres, domain.NamedEntity{MalID: domain.GenreID(genre), Name: genre})
	}
	for _, studio := range anime.Studios {
		result.Studios = append(result.Studios, domain.NamedEntity{MalID: studio.ID, Name: studio.Name})
	}
	for _, producer := range anime.Producers {
		result.Producers = append(result.Producers, domain.NamedEntity{Name: producer.Name})
	}
	for _, tag := range topTags(anime.Tags, 5) {
		result.Tags = append(result.Tags, domain.NamedEntity{MalID: tag.ID, Name: tag.Name})
	}
	for _, relation := range anime.Relations {
		result.ProviderRelations = append(result.ProviderRelations, domain.AnimeProviderRelation{
			Type: relation.Type, Format: relation.Anime.Format,
			AniListID: relation.Anime.ID, MALID: relation.Anime.MALID,
		})
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
