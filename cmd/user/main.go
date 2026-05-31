// Package main provides small CLI utilities for local admin tasks.
package main

import (
	"bufio"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"mal/internal"
	"mal/internal/config"
	"mal/internal/database"
	"mal/internal/db"
	"mal/internal/observability"
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

	os.Exit(run(dbConn, os.Args))
}

func run(dbConn *sql.DB, args []string) int {
	cmd, err := parseArgs(args)
	if err != nil {
		observability.Warn("cli_usage", "cmd/user", "invalid arguments", map[string]any{"argc": len(args)}, err)
		_, _ = fmt.Fprintln(os.Stderr, usage())
		return 2
	}

	switch cmd.kind {
	case commandUpdateAvatar:
		updateAvatars(dbConn)
		return 0
	case commandRunFixes:
		runFixes(dbConn)
		return 0
	case commandCreateOrUpdateUser:
		if err := createOrUpdateUser(dbConn, cmd.username, cmd.password); err != nil {
			return 1
		}
		return 0
	default:
		observability.Error("cli_command_unreachable", "cmd/user", "", map[string]any{"kind": cmd.kind}, errors.New("unhandled command"))
		return 1
	}
}

type commandKind string

const (
	commandUpdateAvatar       commandKind = "update-avatar"
	commandRunFixes           commandKind = "run-fixes"
	commandCreateOrUpdateUser commandKind = "create-or-update-user"
)

type command struct {
	kind     commandKind
	username string
	password string
}

func parseArgs(args []string) (command, error) {
	if len(args) == 2 {
		switch args[1] {
		case string(commandUpdateAvatar):
			return command{kind: commandUpdateAvatar}, nil
		case string(commandRunFixes):
			return command{kind: commandRunFixes}, nil
		}
	}

	if len(args) == 3 {
		return command{
			kind:     commandCreateOrUpdateUser,
			username: args[1],
			password: args[2],
		}, nil
	}

	return command{}, errors.New("invalid arguments")
}

func usage() string {
	return "Usage: go run cmd/user/main.go <username> <password>\n       go run cmd/user/main.go update-avatar\n       go run cmd/user/main.go run-fixes"
}

func createOrUpdateUser(dbConn *sql.DB, username string, password string) error {
	existingID, err := lookupUserID(dbConn, username)
	if err != nil {
		observability.Error("cli_user_lookup_failed", "cmd/user", "", map[string]any{"username": username}, err)
		return err
	}

	if existingID != "" {
		if !promptConfirmOverwrite(username) {
			fmt.Println("Operation cancelled.")
			return nil
		}
		if err := updateUserPassword(dbConn, existingID, username, password); err != nil {
			return err
		}
		fmt.Printf("Password for '%s' updated successfully!\n", username)
		return nil
	}

	if err := createUser(dbConn, username, password); err != nil {
		return err
	}
	fmt.Printf("User '%s' was created successfully!\n", username)
	return nil
}

func lookupUserID(dbConn *sql.DB, username string) (string, error) {
	var id string
	err := dbConn.QueryRow("SELECT id FROM user WHERE username = ?", username).Scan(&id)
	if err == nil {
		return id, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return "", err
}

func promptConfirmOverwrite(username string) bool {
	fmt.Printf("User '%s' already exists. Do you want to overwrite their password? [y/N]: ", username)
	reader := bufio.NewReader(os.Stdin)
	response, _ := reader.ReadString('\n')
	response = strings.TrimSpace(strings.ToLower(response))
	return response == "y" || response == "yes"
}

func updateUserPassword(dbConn *sql.DB, userID string, username string, password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		observability.Error("cli_password_hash_failed", "cmd/user", "", nil, err)
		return err
	}

	_, err = dbConn.Exec("UPDATE user SET password_hash = ? WHERE id = ?", string(hash), userID)
	if err != nil {
		observability.Error("cli_user_password_update_failed", "cmd/user", "", map[string]any{"username": username}, err)
		return err
	}
	return nil
}

func createUser(dbConn *sql.DB, username string, password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		observability.Error("cli_password_hash_failed", "cmd/user", "", nil, err)
		return err
	}

	id := uuid.New().String()
	avatarURL := internal.DefaultAvatarURL(username)
	_, err = dbConn.Exec(
		"INSERT INTO user (id, username, password_hash, avatar_url) VALUES (?, ?, ?, ?)",
		id,
		username,
		string(hash),
		avatarURL,
	)
	if err != nil {
		observability.Error("cli_user_create_failed", "cmd/user", "", map[string]any{"username": username}, err)
		return err
	}
	return nil
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

		avatarURL := internal.DefaultAvatarURL(username)
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
