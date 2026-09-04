# Slice 5: provider and playback foundations

## Objective

Move the required provider inventory, stream resolution, and playback foundations out of backend only when they have a clear owner. Do not keep the provisional core player/audio modules merely because they exist today.

## Behavior to understand

Inspect the Anikoto adapter, provider matching, stream routes, skip-time behavior, and existing app playback consumers. Identify the minimum provider contract needed for usable playback and keep provider inventory as playback truth.

## Core design

- Put provider protocol translation behind an explicit core provider boundary when it is genuinely shared by current consumers.
- Keep stream host allowlists, referers, redirects, playlist rewriting, and response limits at the server/protocol boundary.
- Reintroduce player or audio models only when a real consumer and owner exist.
- Do not create a generic provider abstraction for one adapter.

## Consumers

Migrate `apps/api/src/routes/playback.ts`, `apps/api/src/stream.ts`, and the relevant frontend boundary only after the core provider operation is tested.

## Remove after migration

Delete replaced backend provider and playback modules. Delete the current provisional `packages/core/src/player/`, `audio.ts`, and any other unowned playback residue if they are not required by the new boundary.

## Focused checks

- Provider inventory and matching tests.
- Stream route tests for authorization and protocol constraints.
- Real provider resolution check where credentials and service availability permit.
- Browser playback check only after the API boundary is complete.

## Exit criteria

Playback has a clear owner, provider truth is preserved, server protocol rules remain enforced, and provisional modules are either deleted or justified by a current consumer.
