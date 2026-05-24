// Package main runs the MAL web server.
package main

import (
	"mal/internal/app"

	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	application := app.NewApp()
	application.Run()
}
