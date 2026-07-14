package internal

import (
	"log/slog"
	"os"
	"sync"

	"mal/internal/server"
)

var configureLoggerOnce sync.Once

func ConfigureLogger() {
	configureLoggerOnce.Do(func() {
		slog.SetDefault(slog.New(server.NewLogHandler(os.Stderr)))
	})
}
