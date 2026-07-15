package anime

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"mal/integrations/anilist"
	"mal/internal/domain"
	"slices"
	"strings"
)

const animeIdentityAdvisoryLock = int64(0x4d414c4944454e54)

type mappingIdentity struct {
	AniListID int
	MALID     int
}

type mappingGroup struct {
	MediaType string
	TMDBID    int64
}

type animeMapping struct {
	AniListID int
	MALID     int
	Group     mappingGroup
	Season    int
	Canonical bool

	LogicalSeason  int
	MediaOffset    int
	DisplayOffset  int
	EpisodeCount   int
	AvailableCount int
	EpisodeMin     int
	EpisodeMax     int
	Kind           string
	SeasonLabel    string
}

type mappingResolver interface {
	Resolve(context.Context, []mappingIdentity) (map[mappingIdentity]animeMapping, map[mappingGroup]animeMapping, error)
}

type inferredMappingSaver interface {
	SaveInferred(context.Context, []inferredAnimeMapping) error
}

type inferredAnimeMapping struct {
	animeMapping
	RelationType     string
	RelatedAniListID int
}

type animeBatchHydrator interface {
	GetAnimeBatchByMALID(context.Context, []int) ([]anilist.Anime, error)
}

type MappingStore struct {
	db *sql.DB
}

func NewMappingStore(db *sql.DB) *MappingStore {
	return &MappingStore{db: db}
}

func (s *MappingStore) Resolve(ctx context.Context, identities []mappingIdentity) (map[mappingIdentity]animeMapping, map[mappingGroup]animeMapping, error) {
	if err := s.rememberIdentities(ctx, identities); err != nil {
		return nil, nil, err
	}
	mappings, err := s.findMappings(ctx, identities)
	if err != nil {
		return nil, nil, err
	}
	groups := make([]mappingGroup, 0, len(mappings))
	seen := make(map[mappingGroup]struct{}, len(mappings))
	for _, mapping := range mappings {
		if _, ok := seen[mapping.Group]; ok {
			continue
		}
		seen[mapping.Group] = struct{}{}
		groups = append(groups, mapping.Group)
	}
	canonical, err := s.findCanonicalMappings(ctx, groups)
	if err != nil {
		return nil, nil, err
	}

	byAniList := make(map[int]animeMapping, len(mappings))
	byMAL := make(map[int]animeMapping, len(mappings))
	for _, mapping := range mappings {
		byAniList[mapping.AniListID] = mapping
		if mapping.MALID > 0 {
			byMAL[mapping.MALID] = mapping
		}
	}
	byIdentity := mappingsForIdentities(identities, byAniList, byMAL)
	return byIdentity, canonical, nil
}

func mappingsForIdentities(identities []mappingIdentity, byAniList map[int]animeMapping, byMAL map[int]animeMapping) map[mappingIdentity]animeMapping {
	resolved := make(map[mappingIdentity]animeMapping, len(identities))
	for _, identity := range identities {
		mapping, ok := byAniList[identity.AniListID]
		if !ok {
			mapping, ok = byMAL[identity.MALID]
		}
		if ok {
			resolved[identity] = completeMappingIdentity(mapping, identity)
		}
	}
	return resolved
}

func completeMappingIdentity(mapping animeMapping, identity mappingIdentity) animeMapping {
	if mapping.AniListID <= 0 {
		mapping.AniListID = identity.AniListID
	}
	if mapping.MALID <= 0 {
		mapping.MALID = identity.MALID
	}
	return mapping
}

func (s *MappingStore) rememberIdentities(ctx context.Context, identities []mappingIdentity) error {
	if s == nil || s.db == nil {
		return nil
	}
	seen := make(map[mappingIdentity]struct{}, len(identities))
	for _, identity := range identities {
		if identity.AniListID <= 0 || identity.MALID <= 0 {
			continue
		}
		if _, ok := seen[identity]; ok {
			continue
		}
		seen[identity] = struct{}{}
		if err := s.rememberIdentity(ctx, identity); err != nil {
			return fmt.Errorf("remember anime identity anilist=%d mal=%d: %w", identity.AniListID, identity.MALID, err)
		}
	}
	return nil
}

func (s *MappingStore) rememberIdentity(ctx context.Context, identity mappingIdentity) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin identity transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(?)`, animeIdentityAdvisoryLock); err != nil {
		return fmt.Errorf("lock identity registry: %w", err)
	}

	links := []externalAnimeID{
		{Provider: "anilist", ExternalID: fmt.Sprintf("%d", identity.AniListID)},
		{Provider: "mal", ExternalID: fmt.Sprintf("%d", identity.MALID)},
	}
	identityIDs, err := existingAnimeIdentityIDs(ctx, tx, links)
	if err != nil {
		return err
	}

	identityID, err := resolveAnimeIdentityID(ctx, tx, identityIDs)
	if err != nil {
		return err
	}

	if err := saveExternalAnimeIDs(ctx, tx, identityID, links); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit anime identity: %w", err)
	}
	return nil
}

func resolveAnimeIdentityID(ctx context.Context, tx *sql.Tx, identityIDs []int64) (int64, error) {
	if len(identityIDs) == 0 {
		var identityID int64
		if err := tx.QueryRowContext(ctx, `INSERT INTO anime_identity DEFAULT VALUES RETURNING id`).Scan(&identityID); err != nil {
			return 0, fmt.Errorf("create anime identity: %w", err)
		}
		return identityID, nil
	}
	identityID := identityIDs[0]
	if err := mergeAnimeIdentities(ctx, tx, identityID, identityIDs[1:]); err != nil {
		return 0, err
	}
	return identityID, nil
}

func saveExternalAnimeIDs(ctx context.Context, tx *sql.Tx, identityID int64, links []externalAnimeID) error {
	for _, link := range links {
		if _, err := tx.ExecContext(ctx, `INSERT INTO anime_external_id (anime_identity_id, provider, external_id)
			VALUES (?, ?, ?)
			ON CONFLICT (provider, external_id) DO NOTHING`, identityID, link.Provider, link.ExternalID); err != nil {
			return fmt.Errorf("save %s anime identity: %w", link.Provider, err)
		}
	}
	return nil
}

type externalAnimeID struct {
	Provider   string
	ExternalID string
}

func existingAnimeIdentityIDs(ctx context.Context, tx *sql.Tx, links []externalAnimeID) ([]int64, error) {
	ids := make([]int64, 0, len(links))
	seen := make(map[int64]struct{}, len(links))
	for _, link := range links {
		var id int64
		err := tx.QueryRowContext(ctx, `SELECT anime_identity_id FROM anime_external_id
			WHERE provider = ? AND external_id = ? FOR UPDATE`, link.Provider, link.ExternalID).Scan(&id)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("find %s anime identity: %w", link.Provider, err)
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	slices.Sort(ids)
	return ids, nil
}

func mergeAnimeIdentities(ctx context.Context, tx *sql.Tx, targetID int64, duplicateIDs []int64) error {
	for _, duplicateID := range duplicateIDs {
		conflict, err := identityMergeConflict(ctx, tx, targetID, duplicateID)
		if err != nil {
			return err
		}
		if conflict {
			return fmt.Errorf("refusing to merge conflicting anime identities %d and %d", targetID, duplicateID)
		}
		if _, err := tx.ExecContext(ctx, `UPDATE anime_external_id SET anime_identity_id = ? WHERE anime_identity_id = ?`, targetID, duplicateID); err != nil {
			return fmt.Errorf("merge anime identity %d into %d: %w", duplicateID, targetID, err)
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM anime_identity WHERE id = ?`, duplicateID); err != nil {
			return fmt.Errorf("delete merged anime identity %d: %w", duplicateID, err)
		}
	}
	return nil
}

func identityMergeConflict(ctx context.Context, tx *sql.Tx, leftID int64, rightID int64) (bool, error) {
	rows, err := tx.QueryContext(ctx, `SELECT provider, external_id FROM anime_external_id
		WHERE anime_identity_id IN (?, ?) ORDER BY provider, external_id`, leftID, rightID)
	if err != nil {
		return false, fmt.Errorf("query identity merge candidates: %w", err)
	}
	defer rows.Close()
	providers := map[string]string{}
	for rows.Next() {
		var provider, externalID string
		if err := rows.Scan(&provider, &externalID); err != nil {
			return false, fmt.Errorf("scan identity merge candidate: %w", err)
		}
		if existing, ok := providers[provider]; ok && existing != externalID {
			return true, nil
		}
		providers[provider] = externalID
	}
	if err := rows.Err(); err != nil {
		return false, fmt.Errorf("iterate identity merge candidates: %w", err)
	}
	return false, nil
}

func (s *MappingStore) SaveInferred(ctx context.Context, mappings []inferredAnimeMapping) error {
	if len(mappings) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin inferred anime mapping save: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	for _, mapping := range mappings {
		_, err := tx.ExecContext(ctx, `INSERT INTO anime_inferred_mapping
			(anilist_id, mal_id, tmdb_media_type, tmdb_id, tmdb_season, relation_type, related_anilist_id, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT (anilist_id) DO UPDATE SET mal_id = excluded.mal_id,
			tmdb_media_type = excluded.tmdb_media_type, tmdb_id = excluded.tmdb_id,
			tmdb_season = excluded.tmdb_season, relation_type = excluded.relation_type,
			related_anilist_id = excluded.related_anilist_id, updated_at = excluded.updated_at`,
			mapping.AniListID, nullablePositiveInt(mapping.MALID), mapping.Group.MediaType,
			mapping.Group.TMDBID, mapping.Season, mapping.RelationType, mapping.RelatedAniListID)
		if err != nil {
			return fmt.Errorf("save inferred anime mapping %d: %w", mapping.AniListID, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit inferred anime mappings: %w", err)
	}
	return nil
}

func nullablePositiveInt(value int) any {
	if value <= 0 {
		return nil
	}
	return value
}

func (s *MappingStore) findMappings(ctx context.Context, identities []mappingIdentity) ([]animeMapping, error) {
	anilistIDs := make([]any, 0, len(identities))
	malIDs := make([]any, 0, len(identities))
	for _, identity := range identities {
		if identity.AniListID > 0 {
			anilistIDs = append(anilistIDs, identity.AniListID)
		}
		if identity.MALID > 0 {
			malIDs = append(malIDs, identity.MALID)
		}
	}
	if len(anilistIDs) == 0 && len(malIDs) == 0 {
		return nil, nil
	}

	clauses := make([]string, 0, 2)
	args := make([]any, 0, len(anilistIDs)+len(malIDs))
	if len(anilistIDs) > 0 {
		clauses = append(clauses, "anilist_id IN ("+questionMarks(len(anilistIDs))+")")
		args = append(args, anilistIDs...)
	}
	if len(malIDs) > 0 {
		clauses = append(clauses, "mal_id IN ("+questionMarks(len(malIDs))+")")
		args = append(args, malIDs...)
	}
	query := `SELECT anilist_id, mal_id, tmdb_media_type, tmdb_id, tmdb_season, canonical
		FROM anime_effective_mapping WHERE ` + strings.Join(clauses, " OR ")
	return scanMappings(ctx, s.db, query, args...)
}

func (s *MappingStore) findCanonicalMappings(ctx context.Context, groups []mappingGroup) (map[mappingGroup]animeMapping, error) {
	canonical := make(map[mappingGroup]animeMapping, len(groups))
	if len(groups) == 0 {
		return canonical, nil
	}
	clauses := make([]string, 0, len(groups))
	args := make([]any, 0, len(groups)*2)
	for _, group := range groups {
		clauses = append(clauses, "(tmdb_media_type = ? AND tmdb_id = ?)")
		args = append(args, group.MediaType, group.TMDBID)
	}
	query := `SELECT anilist_id, mal_id, tmdb_media_type, tmdb_id, tmdb_season, canonical
		FROM anime_effective_mapping WHERE ` + strings.Join(clauses, " OR ")
	mappings, err := scanMappings(ctx, s.db, query, args...)
	if err != nil {
		return nil, err
	}
	for _, candidate := range mappings {
		current, ok := canonical[candidate.Group]
		if !ok || betterCanonical(candidate, current) {
			canonical[candidate.Group] = candidate
		}
	}
	return canonical, nil
}

func (s *MappingStore) GroupMappings(ctx context.Context, group mappingGroup) ([]animeMapping, error) {
	if group.MediaType == "" || group.TMDBID <= 0 {
		return nil, nil
	}
	query := `SELECT anilist_id, mal_id, tmdb_media_type, tmdb_id, tmdb_season, canonical
		FROM anime_effective_mapping WHERE tmdb_media_type = ? AND tmdb_id = ?
		ORDER BY tmdb_season, anilist_id, mal_id`
	return scanMappings(ctx, s.db, query, group.MediaType, group.TMDBID)
}

type mappingQueryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

func scanMappings(ctx context.Context, db mappingQueryer, query string, args ...any) ([]animeMapping, error) {
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query anime mappings: %w", err)
	}
	defer rows.Close()
	var mappings []animeMapping
	for rows.Next() {
		var mapping animeMapping
		var malID sql.NullInt64
		if err := rows.Scan(&mapping.AniListID, &malID, &mapping.Group.MediaType, &mapping.Group.TMDBID, &mapping.Season, &mapping.Canonical); err != nil {
			return nil, fmt.Errorf("scan anime mapping: %w", err)
		}
		if malID.Valid {
			mapping.MALID = int(malID.Int64)
		}
		mappings = append(mappings, mapping)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate anime mappings: %w", err)
	}
	return mappings, nil
}

func betterCanonical(candidate, current animeMapping) bool {
	if candidate.Canonical != current.Canonical {
		return candidate.Canonical
	}
	if (candidate.MALID > 0) != (current.MALID > 0) {
		return candidate.MALID > 0
	}
	candidateRank, currentRank := canonicalSeasonRank(candidate), canonicalSeasonRank(current)
	if candidateRank != currentRank {
		return candidateRank < currentRank
	}
	return candidate.AniListID < current.AniListID
}

func canonicalSeasonRank(mapping animeMapping) int {
	if mapping.Group.MediaType == "movie" {
		return 0
	}
	switch {
	case mapping.Season == 1:
		return 0
	case mapping.Season > 1:
		return 100 + mapping.Season
	case mapping.Season == 0:
		return 1000
	default:
		return 2000
	}
}

func questionMarks(count int) string {
	return strings.TrimSuffix(strings.Repeat("?,", count), ",")
}

type CardGrouper struct {
	mappings mappingResolver
	metadata animeBatchHydrator
}

type groupedCard struct {
	anime     domain.Anime
	mapping   animeMapping
	canonical animeMapping
}

func NewCardGrouper(mappings *MappingStore, metadata *anilist.CachedClient) *CardGrouper {
	return &CardGrouper{mappings: mappings, metadata: metadata}
}

func (g *CardGrouper) Group(ctx context.Context, animes []domain.Anime) ([]domain.Anime, error) {
	if len(animes) < 1 || g == nil || g.mappings == nil {
		return append([]domain.Anime(nil), animes...), nil
	}
	identities, cardIdentities := mappingIdentitiesForCards(animes)
	resolved, canonical, err := g.mappings.Resolve(ctx, identities)
	if err != nil {
		return nil, err
	}
	inferred := applyRelationFallbacks(animes, cardIdentities, resolved)
	applyInferredCanonicals(inferred, canonical)
	if saver, ok := g.mappings.(inferredMappingSaver); ok && len(inferred) > 0 {
		if err := saver.SaveInferred(ctx, inferred); err != nil {
			slog.WarnContext(ctx, "inferred_anime_mapping_save_failed", "component", "anime", "error", err)
		}
	}
	cards := collectGroupedCards(animes, cardIdentities, resolved, canonical)
	hydrated := g.hydrateCanonicalCards(ctx, cards)
	return renderGroupedCards(cards, hydrated), nil
}

func mappingIdentitiesForCards(animes []domain.Anime) ([]mappingIdentity, []mappingIdentity) {
	all := make([]mappingIdentity, 0, len(animes)*2)
	cards := make([]mappingIdentity, len(animes))
	for i, anime := range animes {
		identity := mappingIdentity{AniListID: anime.AniListID, MALID: anime.MalID}
		cards[i] = identity
		all = append(all, identity)
		for _, relation := range anime.ProviderRelations {
			all = append(all, mappingIdentity{AniListID: relation.AniListID, MALID: relation.MALID})
		}
	}
	return all, cards
}

func applyRelationFallbacks(animes []domain.Anime, identities []mappingIdentity, resolved map[mappingIdentity]animeMapping) []inferredAnimeMapping {
	inferred := make([]inferredAnimeMapping, 0)
	for i, anime := range animes {
		if _, mapped := resolved[identities[i]]; mapped {
			continue
		}
		if mapping, ok := inferMappingFromRelations(anime, resolved); ok {
			resolved[identities[i]] = mapping.animeMapping
			inferred = append(inferred, mapping)
		}
	}
	return inferred
}

func applyInferredCanonicals(inferred []inferredAnimeMapping, canonical map[mappingGroup]animeMapping) {
	for _, candidate := range inferred {
		current, ok := canonical[candidate.Group]
		if !ok || betterCanonical(candidate.animeMapping, current) {
			canonical[candidate.Group] = candidate.animeMapping
		}
	}
}

func inferMappingFromRelations(anime domain.Anime, resolved map[mappingIdentity]animeMapping) (inferredAnimeMapping, bool) {
	for _, relation := range anime.ProviderRelations {
		if !allowedGroupingRelation(anime.Type, relation) {
			continue
		}
		related, ok := resolved[mappingIdentity{AniListID: relation.AniListID, MALID: relation.MALID}]
		if !ok || related.Group.MediaType != "tv" {
			continue
		}
		season := inferredSeason(relation.Type, related.Season)
		return inferredAnimeMapping{
			animeMapping: animeMapping{AniListID: anime.AniListID, MALID: anime.MalID, Group: related.Group, Season: season},
			RelationType: relation.Type, RelatedAniListID: relation.AniListID,
		}, true
	}
	return inferredAnimeMapping{}, false
}

func inferredSeason(relationType string, relatedSeason int) int {
	switch {
	case strings.EqualFold(relationType, "PREQUEL") && relatedSeason > 0:
		return relatedSeason + 1
	case strings.EqualFold(relationType, "SEQUEL") && relatedSeason > 1:
		return relatedSeason - 1
	case strings.EqualFold(relationType, "SEQUEL"):
		return 1
	default:
		return 0
	}
}

func allowedGroupingRelation(format string, relation domain.AnimeProviderRelation) bool {
	if strings.EqualFold(format, "TV") {
		isSeasonLink := strings.EqualFold(relation.Type, "PREQUEL") || strings.EqualFold(relation.Type, "SEQUEL")
		return isSeasonLink && strings.EqualFold(relation.Format, "TV")
	}
	isSpecial := strings.EqualFold(format, "ONA") || strings.EqualFold(format, "OVA") || strings.EqualFold(format, "SPECIAL")
	return isSpecial && strings.EqualFold(relation.Type, "PARENT") && strings.EqualFold(relation.Format, "TV")
}

func collectGroupedCards(animes []domain.Anime, identities []mappingIdentity, resolved map[mappingIdentity]animeMapping, canonical map[mappingGroup]animeMapping) []groupedCard {
	cards := make([]groupedCard, 0, len(animes))
	groupIndexes := make(map[mappingGroup]int, len(animes))
	for i, anime := range animes {
		mapping, ok := resolved[identities[i]]
		if !ok {
			cards = append(cards, groupedCard{anime: anime})
			continue
		}
		if index, duplicate := groupIndexes[mapping.Group]; duplicate {
			if canonicalMapping := canonical[mapping.Group]; sameMapping(mapping, canonicalMapping) {
				cards[index].anime = anime
				cards[index].mapping = mapping
			}
			continue
		}
		groupIndexes[mapping.Group] = len(cards)
		cards = append(cards, groupedCard{anime: anime, mapping: mapping, canonical: canonical[mapping.Group]})
	}
	return cards
}

func (g *CardGrouper) hydrateCanonicalCards(ctx context.Context, cards []groupedCard) map[int]domain.Anime {
	missingMALIDs := make([]int, 0, len(cards))
	for _, card := range cards {
		if needsCanonicalHydration(card) {
			missingMALIDs = append(missingMALIDs, card.canonical.MALID)
		}
	}
	hydrated := make(map[int]domain.Anime, len(missingMALIDs))
	if len(missingMALIDs) == 0 || g.metadata == nil {
		return hydrated
	}
	items, err := g.metadata.GetAnimeBatchByMALID(ctx, missingMALIDs)
	if err != nil {
		slog.WarnContext(ctx, "canonical_anime_card_hydration_failed", "component", "anime", "error", err)
		return hydrated
	}
	for _, item := range items {
		hydrated[item.MALID] = anilist.ToMetadataAnime(item)
	}
	return hydrated
}

func needsCanonicalHydration(card groupedCard) bool {
	if card.canonical.MALID <= 0 {
		return false
	}
	return card.anime.AniListID != card.canonical.AniListID || card.anime.MalID != card.canonical.MALID
}

func renderGroupedCards(cards []groupedCard, hydrated map[int]domain.Anime) []domain.Anime {
	out := make([]domain.Anime, 0, len(cards))
	for _, card := range cards {
		anime := card.anime
		if replacement, ok := hydrated[card.canonical.MALID]; ok {
			replacement.RecommendationRationale = slices.Clone(anime.RecommendationRationale)
			anime = replacement
		}
		out = append(out, anime)
	}
	return out
}

func sameMapping(left, right animeMapping) bool {
	return left.AniListID > 0 && left.AniListID == right.AniListID
}

func groupCardsOrOriginal(ctx context.Context, grouper *CardGrouper, animes []domain.Anime) []domain.Anime {
	grouped, err := grouper.Group(ctx, animes)
	if err != nil {
		slog.WarnContext(ctx, "anime_card_grouping_failed", "component", "anime", "error", err)
		return append([]domain.Anime(nil), animes...)
	}
	return grouped
}
