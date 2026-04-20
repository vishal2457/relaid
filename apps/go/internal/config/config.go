package config

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
)

const DefaultServerAddr = "127.0.0.1:8080"

type Config struct {
	ServerAddr              string
	Runtime                 string
	OpencodeBin             string
	OpencodeCwd             string
	OpencodeBaseURL         string
	OpencodeDBPath          string
	OpencodeMaxPromptLength int
	CodexBin                string
	CodexCwd                string
	DBPath                  string
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
		OpencodeDBPath:          getEnv("OPENCODE_DB_PATH", defaultOpenCodeDBPath()),
		OpencodeMaxPromptLength: getIntEnv("OPENCODE_MAX_PROMPT_LENGTH", 8000),
		CodexBin:                getEnv("CODEX_BIN", "codex"),
		CodexCwd:                getWorkingDir(),
		DBPath:                  getEnv("RELAID_DB_PATH", defaultDBPath()),
	}

	if value := os.Getenv("OPENCODE_CWD"); value != "" {
		cfg.OpencodeCwd = value
	}

	if value := os.Getenv("CODEX_CWD"); value != "" {
		cfg.CodexCwd = value
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

func defaultDBPath() string {
	configDir, err := os.UserConfigDir()
	if err != nil || configDir == "" {
		return filepath.Join(".", "relaid.db")
	}
	return filepath.Join(configDir, "relaid", "relaid.db")
}

func defaultOpenCodeDBPath() string {
	homeDir, err := os.UserHomeDir()
	if err != nil || homeDir == "" {
		return filepath.Join(".", "opencode.db")
	}
	return filepath.Join(homeDir, ".local", "share", "opencode", "opencode.db")
}
