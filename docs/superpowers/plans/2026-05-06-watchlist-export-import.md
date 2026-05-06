# Watchlist CSV Export and Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSV export and import functionality to the anime watchlist to allow users to backup and restore their lists.

**Architecture:** Client-side CSV generation for export using JavaScript Blobs. Server-side CSV parsing for import using a new API endpoint and Go's `encoding/csv` package.

**Tech Stack:** Go (Backend), HTML/JavaScript (Frontend), Tailwind CSS (Styling).

---

### Task 1: Add Import Logic to Watchlist Service

**Files:**
- Modify: `api/watchlist/service.go`

- [ ] **Step 1: Add ImportWatchlist method**
Add a method to handle CSV parsing and entry upsertion.

```go
func (s *Service) ImportWatchlist(ctx context.Context, userID string, r io.Reader) error {
	reader := csv.NewReader(r)
	// Read header
	if _, err := reader.Read(); err != nil {
		return fmt.Errorf("failed to read csv header: %w", err)
	}

	records, err := reader.ReadAll()
	if err != nil {
		return fmt.Errorf("failed to read csv records: %w", err)
	}

	for i, record := range records {
		if len(record) < 4 {
			continue // Skip malformed rows
		}

		animeID, err := strconv.ParseInt(record[0], 10, 64)
		if err != nil {
			return fmt.Errorf("row %d: invalid anime id: %w", i+1, err)
		}

		status := record[1]
		if _, ok := validStatuses[status]; !ok {
			status = "plan_to_watch"
		}

		currentEpisode, _ := strconv.ParseInt(record[2], 10, 64)
		currentTimeSeconds, _ := strconv.ParseFloat(record[3], 64)

		if err := s.ensureAnimeExists(ctx, animeID); err != nil {
			return fmt.Errorf("row %d: failed to ensure anime: %w", i+1, err)
		}

		_, err = s.db.UpsertWatchListEntry(ctx, db.UpsertWatchListEntryParams{
			ID:                 uuid.New().String(),
			UserID:             userID,
			AnimeID:            animeID,
			Status:             status,
			CurrentEpisode:     sql.NullInt64{Int64: currentEpisode, Valid: currentEpisode > 0},
			CurrentTimeSeconds: currentTimeSeconds,
		})
		if err != nil {
			return fmt.Errorf("row %d: failed to upsert entry: %w", i+1, err)
		}
	}

	return nil
}
```

- [ ] **Step 2: Commit**

```bash
git add api/watchlist/service.go
git commit -m "feat: add ImportWatchlist to service"
```

### Task 2: Create Import API Endpoint

**Files:**
- Modify: `api/watchlist/handler.go`
- Modify: `internal/server/routes.go`

- [ ] **Step 1: Add HandleImportWatchlist to Handler**

```go
func (h *Handler) HandleImportWatchlist(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	user := middleware.GetUser(r.Context())
	if user == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "failed to get file from request", http.StatusBadRequest)
		return
	}
	defer file.Close()

	if err := h.service.ImportWatchlist(r.Context(), user.ID, file); err != nil {
		log.Printf("import failed: %v", err)
		http.Error(w, "import failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("HX-Redirect", "/watchlist")
	w.WriteHeader(http.StatusOK)
}
```

- [ ] **Step 2: Register route in internal/server/routes.go**

```go
// Find existing watchlist routes and add:
mux.HandleFunc("/api/watchlist/import", watchlistHandler.HandleImportWatchlist)
```

- [ ] **Step 3: Commit**

```bash
git add api/watchlist/handler.go internal/server/routes.go
git commit -m "feat: add watchlist import api endpoint"
```

### Task 3: Update Frontend Templates with Export/Import UI

**Files:**
- Modify: `templates/watchlist.gohtml`
- Modify: `templates/watchlist_partial.gohtml`

- [ ] **Step 1: Add buttons and JS logic to templates**
Add the UI components and scripts for CSV generation and file upload.

```html
<!-- Buttons placement (in the header section) -->
<div class="flex items-center gap-2">
    <div class="flex bg-white/5 p-1 rounded-md border border-white/10">
        <button type="button" class="px-3 py-1 text-xs hover:bg-white/10 transition-colors flex items-center gap-2 text-neutral-400 hover:text-white" onclick="exportWatchlistCSV()">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
        </button>
        <div class="w-px h-4 bg-white/10 self-center"></div>
        <button type="button" class="px-3 py-1 text-xs hover:bg-white/10 transition-colors flex items-center gap-2 text-neutral-400 hover:text-white" onclick="document.getElementById('import-input').click()">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Import
        </button>
        <input type="file" id="import-input" class="hidden" accept=".csv" onchange="importWatchlistCSV(this)">
    </div>
</div>

<!-- JS Logic -->
<script>
function exportWatchlistCSV() {
    const entries = {{json .AllEntries}};
    if (!entries || entries.length === 0) {
        alert('Watchlist is empty');
        return;
    }

    let csv = 'anime_id,status,current_episode,current_time_seconds\n';
    entries.forEach(e => {
        csv += `${e.AnimeID},${e.Status},${e.CurrentEpisode.Int64},${e.CurrentTimeSeconds}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'watchlist.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

async function importWatchlistCSV(input) {
    if (!input.files || input.files.length === 0) return;
    
    const formData = new FormData();
    formData.append('file', input.files[0]);

    try {
        const resp = await fetch('/api/watchlist/import', {
            method: 'POST',
            body: formData,
            headers: {
                'HX-Request': 'true'
            }
        });

        if (resp.ok) {
            const redirect = resp.headers.get('HX-Redirect');
            if (redirect) window.location.href = redirect;
            else window.location.reload();
        } else {
            const text = await resp.text();
            alert('Import failed: ' + text);
        }
    } catch (err) {
        alert('Import error: ' + err);
    }
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add templates/watchlist.gohtml templates/watchlist_partial.gohtml
git commit -m "feat: add export/import buttons and logic to watchlist UI"
```
