package graphql

import (
	"io"
	"log"
)

func Close(closer io.Closer, message string) {
	if err := closer.Close(); err != nil {
		log.Printf("%s: %v", message, err)
	}
}

func Log(message string, err error) {
	if err != nil {
		log.Printf("%s: %v", message, err)
	}
}
