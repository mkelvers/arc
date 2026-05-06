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
	if len(os.Args) != 3 {
		log.Fatalf("Usage: go run cmd/user/main.go <username> <password>")
	}

	username := os.Args[1]
	password := os.Args[2]

	dbConn, err := db.Open(db.GetDBFile())
	if err != nil {
		log.Fatalf("failed to open db: %v", err)
	}
	defer dbConn.Close()

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
	_, err = dbConn.Exec("INSERT INTO user (id, username, password_hash) VALUES (?, ?, ?)", id, username, string(hash))
	if err != nil {
		log.Fatalf("failed to create user: %v", err)
	}

	fmt.Printf("User '%s' was created successfully!\n", username)
}
