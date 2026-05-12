package main

import (
	"bufio"
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"mal/internal/db"
)

func main() {
	dbConn, err := db.Open(db.GetDBFile())
	if err != nil {
		log.Fatalf("failed to open db: %v", err)
	}
	defer func() { _ = dbConn.Close() }()

	if len(os.Args) == 2 && os.Args[1] == "update-avatar" {
		updateAvatars(dbConn)
		return
	}

	if len(os.Args) != 3 {
		log.Fatalf("Usage: go run cmd/user/main.go <username> <password>\n       go run cmd/user/main.go update-avatar")
	}

	username := os.Args[1]
	password := os.Args[2]

	var existingID string
	err = dbConn.QueryRow("SELECT id FROM user WHERE username = ?", username).Scan(&existingID)
	if err != nil && err != sql.ErrNoRows {
		log.Fatalf("database error: %v", err)
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
			log.Fatalf("failed to hash password: %v", err)
		}

		_, err = dbConn.Exec("UPDATE user SET password_hash = ? WHERE id = ?", string(hash), existingID)
		if err != nil {
			log.Fatalf("failed to update user: %v", err)
		}

		fmt.Printf("Password for '%s' updated successfully!\n", username)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		log.Fatalf("failed to hash password: %v", err)
	}

	id := uuid.New().String()
	avatarURL := fmt.Sprintf("https://api.dicebear.com/9.x/dylan/svg?seed=%s", username)
	_, err = dbConn.Exec("INSERT INTO user (id, username, password_hash, avatar_url) VALUES (?, ?, ?, ?)", id, username, string(hash), avatarURL)
	if err != nil {
		log.Fatalf("failed to create user: %v", err)
	}

	fmt.Printf("User '%s' was created successfully!\n", username)
}

func updateAvatars(dbConn *sql.DB) {
	rows, err := dbConn.Query("SELECT id, username FROM user")
	if err != nil {
		log.Fatalf("failed to fetch users: %v", err)
	}
	defer func() { _ = rows.Close() }()

	count := 0
	for rows.Next() {
		var id, username string
		if err := rows.Scan(&id, &username); err != nil {
			log.Fatalf("failed to scan user: %v", err)
		}

		avatarURL := fmt.Sprintf("https://api.dicebear.com/9.x/dylan/svg?seed=%s", username)
		_, err := dbConn.Exec("UPDATE user SET avatar_url = ? WHERE id = ?", avatarURL, id)
		if err != nil {
			log.Fatalf("failed to update avatar for %s: %v", username, err)
		}
		count++
	}

	if err := rows.Err(); err != nil {
		log.Fatalf("iteration error: %v", err)
	}

	fmt.Printf("Updated avatars for %d user(s)\n", count)
}
