package codex

import (
	"os"
	"strings"
	"testing"
)

func TestEnvWithExecutableDirPrependsBinaryDir(t *testing.T) {
	t.Setenv("PATH", "/usr/bin:/bin")

	env := envWithExecutableDir("/tmp/node/bin/codex")
	path := envValue(env, "PATH")
	if !strings.HasPrefix(path, "/tmp/node/bin"+string(os.PathListSeparator)) {
		t.Fatalf("expected binary directory to be prepended to PATH, got %q", path)
	}
}

func TestEnvWithExecutableDirLeavesRelativeCommandUnchanged(t *testing.T) {
	if env := envWithExecutableDir("codex"); env != nil {
		t.Fatalf("expected nil env for relative command, got %v", env)
	}
}

func envValue(env []string, key string) string {
	prefix := key + "="
	for _, item := range env {
		if strings.HasPrefix(item, prefix) {
			return strings.TrimPrefix(item, prefix)
		}
	}
	return ""
}
