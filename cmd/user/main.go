// Package main provides local user administration commands.
package main

import (
	"bufio"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"mal/integrations/anilist"
	"mal/internal"
	"mal/internal/config"
	"mal/internal/database"
	"mal/internal/database/db"
	"mal/internal/observability"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/term"
)

func main() {
	if err := godotenv.Load(); err != nil {
		observability.Warn("env_file_load_failed", "user", "", nil, err)
	}

	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 1 && args[0] == "run-fixes" {
		return runFixes()
	}

	if len(args) != 1 && len(args) != 2 {
		return errors.New("usage: create-user <username> [password]")
	}

	username := strings.TrimSpace(args[0])
	password := ""
	if len(args) == 2 {
		password = args[1]
	}
	if username == "" {
		return errors.New("username must not be empty")
	}

	sqlDB, err := openDatabase()
	if err != nil {
		return err
	}
	defer sqlDB.Close()

	if err := database.RunPostgresMigrations(sqlDB); err != nil {
		return fmt.Errorf("prepare database: %w", err)
	}

	return createOrUpdateUser(sqlDB, username, password)
}

func runFixes() error {
	sqlDB, err := openDatabase()
	if err != nil {
		return err
	}
	defer sqlDB.Close()

	client := anilist.NewClient("")
	if err := database.RunPostgresMigrationsAndFixes(sqlDB, internal.DataFixDependencies(client)); err != nil {
		return fmt.Errorf("run migrations and fixes: %w", err)
	}
	fmt.Println("Database migrations and fixes complete")
	return nil
}

func openDatabase() (*sql.DB, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, fmt.Errorf("load config: %w", err)
	}

	if cfg.DatabaseURL == "" {
		return nil, errors.New("DATABASE_URL must be configured")
	}
	sqlDB, err := db.OpenPostgres(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("open PostgreSQL database: %w", err)
	}
	return sqlDB, nil
}

func createOrUpdateUser(sqlDB *sql.DB, username, password string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var userID string
	err := sqlDB.QueryRowContext(ctx, `SELECT id FROM user WHERE username = ? LIMIT 1`, username).Scan(&userID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("check user: %w", err)
	}
	userExists := err == nil

	if !userExists {
		return createUser(ctx, sqlDB, username, password)
	}

	update, err := confirmPasswordUpdate(username)
	if err != nil {
		return err
	}
	if !update {
		fmt.Println("No changes made")
		return nil
	}

	return updateUserPassword(ctx, sqlDB, userID, username, password)
}

func createUser(ctx context.Context, sqlDB *sql.DB, username, password string) error {
	password, err := resolvePassword(password)
	if err != nil {
		return err
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	_, err = sqlDB.ExecContext(
		ctx,
		`INSERT INTO user (id, username, password_hash, avatar_url) VALUES (?, ?, ?, ?)`,
		uuid.NewString(), username, string(passwordHash), internal.DefaultAvatarURL(username),
	)
	if err != nil {
		return fmt.Errorf("create user: %w", err)
	}
	fmt.Printf("Created user %q\n", username)
	return nil
}

func updateUserPassword(ctx context.Context, sqlDB *sql.DB, userID, username, password string) error {
	password, err := resolvePassword(password)
	if err != nil {
		return err
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	if _, err := sqlDB.ExecContext(ctx, `UPDATE user SET password_hash = ? WHERE id = ?`, string(passwordHash), userID); err != nil {
		return fmt.Errorf("update password: %w", err)
	}

	fmt.Printf("Updated password for user %q\n", username)
	return nil
}

func resolvePassword(password string) (string, error) {
	if password != "" {
		return password, nil
	}

	fmt.Print("Password: ")
	passwordBytes, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		return "", fmt.Errorf("read password: %w", err)
	}
	if len(passwordBytes) == 0 {
		return "", errors.New("password must not be empty")
	}
	return string(passwordBytes), nil
}

func confirmPasswordUpdate(username string) (bool, error) {
	fmt.Printf("User %q already exists. Change password? [Y/n] ", username)
	answer, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return false, fmt.Errorf("read confirmation: %w", err)
	}

	switch strings.ToLower(strings.TrimSpace(answer)) {
	case "", "y", "yes":
		return true, nil
	case "n", "no":
		return false, nil
	default:
		return false, errors.New("invalid response; enter y or n")
	}
}
