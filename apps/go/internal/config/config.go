package config

import (
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
)

const DefaultServerAddr = "127.0.0.1:8080"

type Config struct {
	ServerAddr              string
	Runtime                 string
	OpencodeBin             string
	OpencodeCwd             string
	OpencodeBaseURL         string
	OpencodeMaxPromptLength int
	MissingConfig           []string
}

func Load() Config {
	if err := godotenv.Load(); err != nil {
		log.Printf("config: unable to load .env: %v", err)
	}

	cfg := Config{
		ServerAddr:              getEnv("SERVER_ADDR", DefaultServerAddr),
		Runtime:                 getEnv("APP_RUNTIME", "desktop"),
		OpencodeBin:             getEnv("OPENCODE_BIN", "opencode"),
		OpencodeCwd:             getWorkingDir(),
		OpencodeBaseURL:         getEnv("OPENCODE_BASE_URL", ""),
		OpencodeMaxPromptLength: getIntEnv("OPENCODE_MAX_PROMPT_LENGTH", 8000),
	}

	if value := os.Getenv("OPENCODE_CWD"); value != "" {
		cfg.OpencodeCwd = value
	}

	for _, key := range []string{"GOOSE_DBSTRING", "JWT_SECRET"} {
		if os.Getenv(key) == "" {
			cfg.MissingConfig = append(cfg.MissingConfig, key)
		}
	}

	return cfg
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok && value != "" {
		return value
	}
	return fallback
}

func getWorkingDir() string {
	dir, err := os.Getwd()
	if err != nil {
		return "."
	}
	return dir
}

func getIntEnv(key string, fallback int) int {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	var value int
	if _, err := fmt.Sscanf(raw, "%d", &value); err != nil || value <= 0 {
		return fallback
	}
	return value
}
