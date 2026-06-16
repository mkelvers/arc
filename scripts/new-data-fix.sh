#!/usr/bin/env bash
set -euo pipefail

to_slug() {
    local raw="$1"
    echo "$raw" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/_/g' | sed -E 's/^_+|_+$//g'
}

format_yyyymmdd() {
    date '+%Y%m%d'
}

main() {
    local raw_name="${1:-}"
    local slug
    slug=$(to_slug "$raw_name")

    if [[ -z "$slug" ]]; then
        echo "usage: $0 <name>" >&2
        exit 1
    fi

    local id
    id="$(format_yyyymmdd)_${slug}"
    local dir
    dir="$(pwd)/internal/database/fixes"
    local file_path
    file_path="${dir}/${id}.go"

    mkdir -p "$dir"

    if [[ -f "$file_path" ]]; then
        echo "data fix already exists: ${file_path}" >&2
        exit 1
    fi

    cat > "$file_path" <<EOF
package fixes

import (
	"context"
	"database/sql"
	"fmt"
)

func init() {
	Register(Fix{
		ID: "${id}",
		Apply: func(ctx context.Context, sqlDB *sql.DB) error {
			// TODO: implement fix
			// _, err := sqlDB.ExecContext(ctx, \`UPDATE ...\`)
			// if err != nil { return fmt.Errorf("...: %w", err) }
			return fmt.Errorf("unimplemented data fix: ${id}")
		},
	})
}
EOF

    echo "$file_path"
}

main "$@"