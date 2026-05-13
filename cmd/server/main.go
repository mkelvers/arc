package main

import (
	"log"
	"mal/internal/app"

	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	application := app.NewApp()
	application.Run()
}
