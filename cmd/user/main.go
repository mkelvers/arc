// Package main provides small CLI utilities for local admin tasks.
package main

import (
	"bufio"
	"database/sql"
	"fmt"
	"os"
	"strings"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"mal/internal/config"
	"mal/internal/database"
	"mal/internal/db"
	"mal/internal/observability"
	"mal/internal/users"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		observability.Error("cli_config_load_failed", "cmd/user", "", nil, err)
		os.Exit(1)
	}

	dbConn, err := db.Open(cfg.DatabaseFile)
	if err != nil {
		observability.Error("cli_db_open_failed", "cmd/user", "", map[string]any{"db_file": cfg.DatabaseFile}, err)
		os.Exit(1)
	}
	defer func() { _ = dbConn.Close() }()

	if len(os.Args) == 2 {
		switch os.Args[1] {
		case "update-avatar":
			updateAvatars(dbConn)
			return
		case "run-fixes":
			runFixes(dbConn)
			return
		}
	}

	if len(os.Args) != 3 {
		observability.Warn("cli_usage", "cmd/user", "invalid arguments", map[string]any{"argc": len(os.Args)}, nil)
		_, _ = fmt.Fprintln(os.Stderr, "Usage: go run cmd/user/main.go <username> <password>\n       go run cmd/user/main.go update-avatar\n       go run cmd/user/main.go run-fixes")
		os.Exit(2)
	}

	username := os.Args[1]
	password := os.Args[2]

	var existingID string
	err = dbConn.QueryRow("SELECT id FROM user WHERE username = ?", username).Scan(&existingID)
	if err != nil && err != sql.ErrNoRows {
		observability.Error("cli_user_lookup_failed", "cmd/user", "", map[string]any{"username": username}, err)
		os.Exit(1)
	}

	if err == nil {
		fmt.Printf("User '%s' already exists. Do you want to overwrite their password? [y/N]: ", username)
		reader := bufio.NewReader(os.Stdin)
		response, _ := reader.ReadString('\n')
		response = strings.TrimSpace(strings.ToLower(response))

		if response != "y" && response != "yes" {
			fmt.Println("Operation cancelled.")
			return
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
		if err != nil {
			observability.Error("cli_password_hash_failed", "cmd/user", "", nil, err)
			os.Exit(1)
		}

		_, err = dbConn.Exec("UPDATE user SET password_hash = ? WHERE id = ?", string(hash), existingID)
		if err != nil {
			observability.Error("cli_user_password_update_failed", "cmd/user", "", map[string]any{"username": username}, err)
			os.Exit(1)
		}

		fmt.Printf("Password for '%s' updated successfully!\n", username)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		observability.Error("cli_password_hash_failed", "cmd/user", "", nil, err)
		os.Exit(1)
	}

	id := uuid.New().String()
	avatarURL := users.DefaultAvatarURL(username)
	_, err = dbConn.Exec("INSERT INTO user (id, username, password_hash, avatar_url) VALUES (?, ?, ?, ?)", id, username, string(hash), avatarURL)
	if err != nil {
		observability.Error("cli_user_create_failed", "cmd/user", "", map[string]any{"username": username}, err)
		os.Exit(1)
	}

	fmt.Printf("User '%s' was created successfully!\n", username)
}

func updateAvatars(dbConn *sql.DB) {
	rows, err := dbConn.Query("SELECT id, username FROM user")
	if err != nil {
		observability.Error("cli_users_list_failed", "cmd/user", "", nil, err)
		os.Exit(1)
	}
	defer func() { _ = rows.Close() }()

	count := 0
	for rows.Next() {
		var id, username string
		if err := rows.Scan(&id, &username); err != nil {
			observability.Error("cli_user_scan_failed", "cmd/user", "", nil, err)
			os.Exit(1)
		}

		avatarURL := users.DefaultAvatarURL(username)
		_, err := dbConn.Exec("UPDATE user SET avatar_url = ? WHERE id = ?", avatarURL, id)
		if err != nil {
			observability.Error("cli_user_avatar_update_failed", "cmd/user", "", map[string]any{"username": username}, err)
			os.Exit(1)
		}
		count++
	}

	if err := rows.Err(); err != nil {
		observability.Error("cli_users_iter_failed", "cmd/user", "", nil, err)
		os.Exit(1)
	}

	fmt.Printf("Updated avatars for %d user(s)\n", count)
}

func runFixes(dbConn *sql.DB) {
	if err := database.RunMigrationsAndFixes(dbConn); err != nil {
		observability.Error("cli_run_migrations_and_fixes_failed", "cmd/user", "", nil, err)
		os.Exit(1)
	}

	rows, err := dbConn.Query("SELECT id, applied_at FROM data_fixes ORDER BY id ASC")
	if err != nil {
		observability.Error("cli_data_fixes_list_failed", "cmd/user", "", nil, err)
		os.Exit(1)
	}
	defer func() { _ = rows.Close() }()

	count := 0
	for rows.Next() {
		var id string
		var appliedAt string
		if err := rows.Scan(&id, &appliedAt); err != nil {
			observability.Error("cli_data_fix_scan_failed", "cmd/user", "", nil, err)
			os.Exit(1)
		}
		fmt.Printf("%s applied_at=%s\n", id, appliedAt)
		count++
	}
	if err := rows.Err(); err != nil {
		observability.Error("cli_data_fixes_iter_failed", "cmd/user", "", nil, err)
		os.Exit(1)
	}

	fmt.Printf("Applied fixes: %d\n", count)
}
