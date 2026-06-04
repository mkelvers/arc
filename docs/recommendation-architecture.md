# Recommendation Architecture

This document defines the long-term shape of the `For You` discovery system.
The goal is to keep the current implementation simple enough to operate inside
the existing Go application while preserving a clean path toward a larger
recommender system.

## Current Serving Model

The current `For You` implementation is a bounded hybrid ranker:

- builds weighted seeds from user watch history
- uses Jikan recommendation edges as collaborative candidates
- excludes anime already present in the watchlist
- boosts candidates that match user taste signals
- reranks the final list to reduce genre pileups

The online request path stays intentionally small:

1. load recent watchlist state
2. derive strong seeds
3. fetch bounded candidate set
4. score candidates
5. rerank for diversity
6. return top results

## Target System Shape

The future recommender should keep four stable layers:

1. event collection
2. feature aggregation
3. candidate generation
4. ranking and reranking

That separation matters more than the specific model used at each stage.

## Event Collection

Recommendations should eventually be driven by behavior events, not only by
watchlist state.

Important events:

- `impression`
- `click`
- `add_to_watchlist`
- `start_watch`
- `progress_update`
- `complete`
- `drop`
- `hide_recommendation`
- `search`

Event capture should preserve:

- `user_id`
- `anime_id`
- `event_type`
- `occurred_at`
- `source`
- contextual metadata as JSON

## Feature Aggregation

Online requests should not recompute the full user profile from raw events.
Instead, background jobs should maintain aggregated feature snapshots.

Useful profile features:

- genre affinity
- theme affinity
- studio affinity
- demographic affinity
- completion rate by genre
- abandonment rate by genre
- preference for airing vs finished anime
- preference for recent vs older anime
- short-term interest profile
- long-term stable taste profile

These features should eventually live in a durable profile snapshot table so
the serving path remains cheap.

## Candidate Generation

Candidate generation should be modular. Each source should produce:

- `anime_id`
- `source`
- `source_score`
- explanation metadata

Primary candidate sources:

- item-item recommendation edges
- related anime and sequel chains
- content-similar anime from genres, themes, studios, and demographics
- trending titles inside the user taste envelope
- seasonal titles aligned with recent behavior
- editorial or promoted rails when needed

Candidate generation should stay bounded. Ranking the full catalog online is
not a viable long-term approach.

## Ranking

The current ranker is heuristic by design. That is the correct starting point.

Near-term ranking inputs:

- collaborative recommendation weight
- watch history status weight
- recency decay
- progress-based engagement
- genre overlap
- theme overlap
- studio overlap
- demographic overlap
- airing or freshness alignment
- popularity moderation

The ranking API should remain stable even if the scoring model changes later.
That allows a future move to gradient-boosted trees or other learned rankers
without rewriting candidate generation or serving.

## Reranking

The final serving stage should apply product constraints that raw ranking will
not handle well on its own:

- genre diversity
- franchise caps
- duplicate suppression
- hide or negative-feedback suppression
- maturity filtering
- freshness and exploration budget

This is intentionally a separate concern from relevance scoring.

## Data Tables

The first recommendation-specific schema additions should support:

- append-only event capture
- recommendation impression tracking
- cached user profile snapshots

These tables are created in migration `024_add_recommendation_foundation.sql`.

## Roadmap

### V1

- bounded hybrid ranker in request path
- uses watchlist history and Jikan metadata
- no offline jobs required

### V2

- capture user recommendation and watch behavior events
- persist user profile snapshots
- precompute candidate caches
- add explicit feedback controls such as hide or not interested

### V3

- split retrieval from ranking
- precompute similarity graphs and user candidate pools
- run offline evaluation on impressions, clicks, starts, and completes
- introduce learned ranking only when enough behavior data exists

## Operational Rules

- keep request-time fanout bounded
- keep scoring explainable
- log recommendation impressions before introducing heavier models
- prefer replaceable modules over one large recommendation function
- treat data collection as the foundation for later ML, not an optional extra
