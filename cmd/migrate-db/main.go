// Command migrate-db copies the local SQLite application database into
// PostgreSQL. Provider caches are intentionally not copied.
package main

import (
	"context"
	"fmt"
	"mal/internal/config"
	"mal/internal/database"
	"mal/internal/database/db"
	"os"

	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		fmt.Fprintf(os.Stderr, "warning: load .env: %v\n", err)
	}
	cfg, err := config.Load()
	if err != nil {
		fatal(err)
	}
	if cfg.DatabaseURL == "" {
		fatal(fmt.Errorf("DATABASE_URL must be configured"))
	}

	source, err := db.Open(cfg.DatabaseFile)
	if err != nil {
		fatal(fmt.Errorf("open SQLite source: %w", err))
	}
	defer source.Close()
	target, err := db.OpenPostgres(cfg.DatabaseURL)
	if err != nil {
		fatal(fmt.Errorf("open PostgreSQL target: %w", err))
	}
	defer target.Close()

	if err := database.RunPostgresMigrations(target); err != nil {
		fatal(err)
	}
	if err := database.ImportSQLiteData(context.Background(), source, target); err != nil {
		fatal(err)
	}
	fmt.Println("PostgreSQL schema ready and application data imported")
}

func fatal(err error) {
	fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
	os.Exit(1)
}
