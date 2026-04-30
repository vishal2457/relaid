package config

import (
	"fmt"
	"log"
	"os"
	"os/exec"
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
		ServerAddr:              DefaultServerAddr,
		Runtime:                 getEnv("APP_RUNTIME", "desktop"),
		OpencodeBin:             resolveExecutable("OPENCODE_BIN", "opencode", defaultOpenCodeBinPaths()),
		OpencodeCwd:             getWorkingDir(),
		OpencodeBaseURL:         getEnv("OPENCODE_BASE_URL", ""),
		OpencodeDBPath:          getEnv("OPENCODE_DB_PATH", defaultOpenCodeDBPath()),
		OpencodeMaxPromptLength: getIntEnv("OPENCODE_MAX_PROMPT_LENGTH", 8000),
		CodexBin:                resolveExecutable("CODEX_BIN", "codex", defaultCodexBinPaths()),
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

func resolveExecutable(envKey, fallback string, candidates []string) string {
	if value, ok := os.LookupEnv(envKey); ok && value != "" {
		return value
	}

	if path, err := exec.LookPath(fallback); err == nil {
		return path
	}

	for _, candidate := range candidates {
		if isExecutable(candidate) {
			return candidate
		}
	}

	return fallback
}

func isExecutable(path string) bool {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	return info.Mode().Perm()&0111 != 0
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

func defaultOpenCodeBinPaths() []string {
	homeDir, err := os.UserHomeDir()
	paths := []string{
		"/opt/homebrew/bin/opencode",
		"/usr/local/bin/opencode",
	}
	if err == nil && homeDir != "" {
		paths = append([]string{
			filepath.Join(homeDir, ".opencode", "bin", "opencode"),
			filepath.Join(homeDir, ".local", "bin", "opencode"),
		}, paths...)
	}
	return paths
}

func defaultCodexBinPaths() []string {
	homeDir, err := os.UserHomeDir()
	paths := []string{
		"/opt/homebrew/bin/codex",
		"/usr/local/bin/codex",
	}
	if err == nil && homeDir != "" {
		paths = append([]string{
			filepath.Join(homeDir, ".codex", "bin", "codex"),
			filepath.Join(homeDir, ".local", "bin", "codex"),
		}, paths...)
	}
	return paths
}
