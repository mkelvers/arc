# Spec: Watchlist CSV Export and Import

## Overview
Add functionality to export the user's watchlist to a CSV file and import it back. This allows for easy backup, external editing, and migration of watchlist data.

## Requirements
- **Export**: Generate a CSV file containing `anime_id`, `status`, `current_episode`, and `current_time_seconds`.
- **Import**: Upload a CSV file to update or add watchlist entries.
- **Data Integrity**: 
    - Do not export `created_at` or `updated_at`.
    - On import, overwrite existing entries with the same `anime_id`.
    - Ensure anime exists in the local database before adding to watchlist (fetch from Jikan if necessary).
- **UI**: Add Export and Import buttons to the watchlist page header.

## Architecture

### Frontend
- **Template**: Update `templates/watchlist.gohtml` (and partial) to include Export/Import buttons.
- **Export Implementation**:
    - Use JavaScript to iterate over the `AllEntries` data passed to the template.
    - Create a CSV string.
    - Trigger a browser download using a `Blob` and a temporary link element.
- **Import Implementation**:
    - Use a hidden `<input type="file" accept=".csv">`.
    - When a file is selected, use `FormData` to upload it to the server via `fetch`.
    - Show a simple alert or refresh the page on success.

### Backend
- **Endpoint**: `POST /api/watchlist/import`
- **Service**: Add `ImportWatchlist(ctx, userID, reader)` to `api/watchlist/service.go`.
- **Logic**:
    - Parse CSV using `encoding/csv`.
    - For each record:
        - Validate data types.
        - Call `ensureAnimeExists` (existing service method).
        - Use `UpsertWatchListEntry` to save/update.
    - Process the entire file in a transaction if possible, or gracefully skip malformed rows.

## Data Format (CSV)
Headers: `anime_id,status,current_episode,current_time_seconds`
Example:
```csv
123,watching,5,450.5
456,completed,12,0
```

## Success Criteria
1. Clicking "Export" downloads a valid CSV file.
2. Modifying the CSV and clicking "Import" correctly updates the watchlist in the UI and database.
3. New anime added via CSV are correctly fetched from Jikan and added to the database.
